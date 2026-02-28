package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

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

	// Internal state mirror — kept in sync by parsing broadcast messages.
	// Allows sending a full state snapshot to newly connected clients.
	stateMu   sync.Mutex
	sessionID string
	lastState map[string]float64
	lastTs    int64

	// Rate-limiter for status broadcasts
	lastStatus time.Time
	lastSeen   time.Time
}

type client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

// NewHub creates an idle Hub. Call Run() in a goroutine to activate it.
func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*client]struct{}),
		broadcast: make(chan []byte, 256),
		register:  make(chan *client),
		unregister: make(chan *client),
		lastState: make(map[string]float64),
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

// MaybebroadcastStatus sends a status message to all clients, rate-limited to ~1/sec.
func (h *Hub) MaybebroadcastStatus(sessionID string) {
	h.stateMu.Lock()
	if time.Since(h.lastStatus) < time.Second {
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

func (h *Hub) buildStatusMessage() []byte {
	h.stateMu.Lock()
	lastSeen := h.lastSeen
	h.stateMu.Unlock()

	connected := !lastSeen.IsZero() && time.Since(lastSeen) < 5*time.Second
	var lastSeenMs int64
	if !lastSeen.IsZero() {
		lastSeenMs = lastSeen.UnixMilli()
	}

	msg := struct {
		Type         string      `json:"type"`
		M4LConnected bool        `json:"m4l_connected"`
		M4LLastSeen  int64       `json:"m4l_last_seen"`
		Universes    interface{} `json:"universes"`
	}{
		Type:         "status",
		M4LConnected: connected,
		M4LLastSeen:  lastSeenMs,
		Universes:    map[string]interface{}{},
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

// readPump drains incoming messages (not currently acted on by the server).
func (c *client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(65536)
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
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
