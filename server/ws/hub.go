package ws

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/footgunz/penumbra/config"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Hub maintains connected WebSocket clients and broadcasts messages.
type Hub struct {
	mu         sync.Mutex
	clients    map[*client]struct{}
	broadcast  chan []byte
	register   chan *client
	unregister chan *client

	cfg *config.Config

	// Internal state mirror — kept in sync by parsing broadcast messages.
	// Allows sending a full state snapshot to newly connected clients.
	stateMu        sync.Mutex
	sessionID      string
	lastState      map[string]float64
	lastTs         int64
	universeOnline map[int]bool

	// Rate-limiter for status broadcasts
	lastStatus time.Time
	lastSeen   time.Time

	// Blackout: atomic flag. When set, state/diff messages are still processed
	// internally but not relayed to WS clients. Status messages always flow.
	blackout   atomic.Bool
	onBlackout func() // one-shot callback for E1.31 blackout scene dispatch
}

type client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

// NewHub creates an idle Hub. Call Run() in a goroutine to activate it.
func NewHub(cfg *config.Config) *Hub {
	return &Hub{
		clients:        make(map[*client]struct{}),
		broadcast:      make(chan []byte, 256),
		register:       make(chan *client),
		unregister:     make(chan *client),
		cfg:            cfg,
		lastState:      make(map[string]float64),
		universeOnline: make(map[int]bool),
	}
}

// Run processes register/unregister/broadcast events. Blocks forever.
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = struct{}{}
			h.mu.Unlock()
			h.sendSnapshot(c)

		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.applyToInternalState(msg)
			if h.blackout.Load() {
				continue
			}
			h.mu.Lock()
			var dead []*client
			for c := range h.clients {
				select {
				case c.send <- msg:
				default:
					dead = append(dead, c)
				}
			}
			for _, c := range dead {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()
		}
	}
}

// Broadcast sends msg to all connected clients and updates internal state.
func (h *Hub) Broadcast(msg []byte) {
	h.broadcast <- msg
}

// MaybebroadcastStatus sends a status message to all clients, rate-limited to ~100ms.
func (h *Hub) MaybebroadcastStatus(sessionID string) {
	h.stateMu.Lock()
	if time.Since(h.lastStatus) < 100*time.Millisecond {
		h.stateMu.Unlock()
		return
	}
	h.lastStatus = time.Now()
	h.lastSeen = time.Now()
	h.stateMu.Unlock()

	msg := h.buildStatusMessage()

	h.mu.Lock()
	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
		}
	}
	h.mu.Unlock()
}

// BroadcastStatus sends a status message to all connected clients immediately,
// without rate limiting. Use after intentional config changes.
func (h *Hub) BroadcastStatus() {
	msg := h.buildStatusMessage()
	h.mu.Lock()
	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
		}
	}
	h.mu.Unlock()
}

// SetUniverseOnline updates the online state for a universe and broadcasts
// a fresh status message to all connected clients.
func (h *Hub) SetUniverseOnline(id int, online bool) {
	h.stateMu.Lock()
	h.universeOnline[id] = online
	h.stateMu.Unlock()
	h.BroadcastStatus()
}

// EmitterState computes the tri-state connection status from lastSeen and config timeouts.
func (h *Hub) EmitterState() config.EmitterState {
	h.stateMu.Lock()
	lastSeen := h.lastSeen
	h.stateMu.Unlock()
	return emitterState(lastSeen, h.cfg)
}

func emitterState(lastSeen time.Time, cfg *config.Config) config.EmitterState {
	if lastSeen.IsZero() {
		return config.EmitterDisconnected
	}
	elapsed := time.Since(lastSeen)
	if elapsed >= time.Duration(cfg.Emitter.DisconnectTimeoutSec)*time.Second {
		return config.EmitterDisconnected
	}
	if elapsed >= time.Duration(cfg.Emitter.IdleTimeoutSec)*time.Second {
		return config.EmitterIdle
	}
	return config.EmitterConnected
}

// SetOnBlackout registers a function called once when blackout is activated
// (e.g. to dispatch the blackout scene to E1.31).
func (h *Hub) SetOnBlackout(fn func()) {
	h.onBlackout = fn
}

// Blackout enters blackout mode. State/diff messages stop flowing to WS
// clients. Status broadcasts continue so UIs can show the blackout banner.
// The atomic swap is immediate; side effects (E1.31 dispatch, log, status
// broadcast) run in a goroutine so callers never block.
func (h *Hub) Blackout() {
	if h.blackout.CompareAndSwap(false, true) {
		go func() {
			if h.onBlackout != nil {
				h.onBlackout()
			}
			log.Printf("BLACKOUT activated")
			h.BroadcastStatus()
		}()
	}
}

// Reset exits blackout mode and resumes normal message relay.
// Same non-blocking pattern as Blackout.
func (h *Hub) Reset() {
	if h.blackout.CompareAndSwap(true, false) {
		go func() {
			log.Printf("BLACKOUT reset — resuming normal operation")
			h.BroadcastStatus()
		}()
	}
}

// IsBlackout returns true if the server is in blackout mode.
func (h *Hub) IsBlackout() bool {
	return h.blackout.Load()
}

// RunStatusTicker periodically broadcasts status so clients see emitter state
// transitions (connected → idle → disconnected) even when packets stop.
func (h *Hub) RunStatusTicker() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		h.BroadcastStatus()
	}
}

func (h *Hub) buildStatusMessage() []byte {
	h.stateMu.Lock()
	lastSeen := h.lastSeen
	universeOnline := make(map[int]bool, len(h.universeOnline))
	for k, v := range h.universeOnline {
		universeOnline[k] = v
	}
	lastState := make(map[string]float64, len(h.lastState))
	for k, v := range h.lastState {
		lastState[k] = v
	}
	h.stateMu.Unlock()

	stateStr := emitterState(lastSeen, h.cfg).String()
	var lastSeenMs int64
	if !lastSeen.IsZero() {
		lastSeenMs = lastSeen.UnixMilli()
	}

	type channelInfo struct {
		Channel int    `json:"channel"`
		Param   string `json:"param"`
		Value   int    `json:"value"` // DMX value 0–255
	}
	type universeStatus struct {
		Label    string        `json:"label"`
		DeviceIP string        `json:"device_ip"`
		Type     string        `json:"type"`
		Online   bool          `json:"online"`
		Channels []channelInfo `json:"channels"`
	}

	// Build per-universe channel lists from current parameter state.
	universeChannels := make(map[int][]channelInfo)
	for paramName, targets := range h.cfg.Parameters {
		value := lastState[paramName] // 0.0 if not yet received
		dmx := int(math.Round(math.Max(0, math.Min(1, value)) * 255))
		for _, t := range targets {
			universeChannels[t.Universe] = append(universeChannels[t.Universe], channelInfo{
				Channel: t.Channel,
				Param:   paramName,
				Value:   dmx,
			})
		}
	}
	for u := range universeChannels {
		sort.Slice(universeChannels[u], func(i, j int) bool {
			return universeChannels[u][i].Channel < universeChannels[u][j].Channel
		})
	}

	universes := make(map[int]universeStatus, len(h.cfg.Universes))
	for id, u := range h.cfg.Universes {
		channels := universeChannels[id]
		if channels == nil {
			channels = []channelInfo{}
		}
		universes[id] = universeStatus{
			Label:    u.Label,
			DeviceIP: u.DeviceIP,
			Type:     u.Type,
			Online:   universeOnline[id],
			Channels: channels,
		}
	}

	msg := struct {
		Type        string                `json:"type"`
		EmitterState    string                `json:"emitter_state"`
		EmitterLastSeen int64                 `json:"emitter_last_seen"`
		Blackout    bool                  `json:"blackout"`
		Universes   map[int]universeStatus `json:"universes"`
	}{
		Type:        "status",
		EmitterState:    stateStr,
		EmitterLastSeen: lastSeenMs,
		Blackout:    h.blackout.Load(),
		Universes:   universes,
	}
	data, _ := json.Marshal(msg)
	return data
}

// applyToInternalState parses a broadcast message and updates the hub's own state mirror.
func (h *Hub) applyToInternalState(msg []byte) {
	var envelope struct {
		Type      string             `json:"type"`
		SessionID string             `json:"session_id"`
		Ts        int64              `json:"ts"`
		State     map[string]float64 `json:"state"`
		Changes   map[string]float64 `json:"changes"`
	}
	if err := json.Unmarshal(msg, &envelope); err != nil {
		return
	}
	h.stateMu.Lock()
	defer h.stateMu.Unlock()
	switch envelope.Type {
	case "session":
		h.sessionID = envelope.SessionID
		h.lastState = make(map[string]float64)
		h.lastTs = envelope.Ts
	case "state":
		h.sessionID = envelope.SessionID
		h.lastState = envelope.State
		h.lastTs = envelope.Ts
	case "diff":
		h.lastTs = envelope.Ts
		for k, v := range envelope.Changes {
			h.lastState[k] = v
		}
	}
}

// sendSnapshot sends a full state snapshot to a single client.
func (h *Hub) sendSnapshot(c *client) {
	h.stateMu.Lock()
	sessionID := h.sessionID
	ts := h.lastTs
	snap := make(map[string]float64, len(h.lastState))
	for k, v := range h.lastState {
		snap[k] = v
	}
	h.stateMu.Unlock()

	msg := struct {
		Type      string             `json:"type"`
		SessionID string             `json:"session_id"`
		Ts        int64              `json:"ts"`
		State     map[string]float64 `json:"state"`
	}{"state", sessionID, ts, snap}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

// ServeWS upgrades an HTTP connection to WebSocket and registers the client.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws: upgrade: %v", err)
		return
	}
	c := &client{hub: h, conn: conn, send: make(chan []byte, 256)}
	h.register <- c
	go c.writePump()
	go c.readPump()
}

// readPump reads incoming messages and dispatches commands.
func (c *client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(65536)
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var envelope struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(data, &envelope) != nil {
			continue
		}
		switch envelope.Type {
		case "blackout":
			c.hub.Blackout()
		case "reset":
			c.hub.Reset()
		}
	}
}

// writePump flushes outgoing messages to the WebSocket connection.
func (c *client) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}
