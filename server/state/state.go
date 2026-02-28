package state

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/footgunz/penumbra/udp"
)

// Diff represents changed parameters in a single tick, or a session announcement.
type Diff struct {
	// msgType controls which JSON envelope ToMessage() produces:
	// "session" → SessionMessage, "state" → StateMessage, "diff" → DiffMessage
	msgType   string
	SessionID string
	Ts        int64
	Changes   map[string]float64
}

// ToMessage serialises Diff to a WebSocket-ready JSON message.
func (d Diff) ToMessage() []byte {
	switch d.msgType {
	case "session":
		msg := struct {
			Type      string `json:"type"`
			SessionID string `json:"session_id"`
			Ts        int64  `json:"ts"`
		}{"session", d.SessionID, d.Ts}
		data, _ := json.Marshal(msg)
		return data
	case "state":
		msg := struct {
			Type      string             `json:"type"`
			SessionID string             `json:"session_id"`
			Ts        int64              `json:"ts"`
			State     map[string]float64 `json:"state"`
		}{"state", d.SessionID, d.Ts, d.Changes}
		data, _ := json.Marshal(msg)
		return data
	default: // "diff"
		msg := struct {
			Type    string             `json:"type"`
			Ts      int64              `json:"ts"`
			Changes map[string]float64 `json:"changes"`
		}{"diff", d.Ts, d.Changes}
		data, _ := json.Marshal(msg)
		return data
	}
}

// Mirror maintains the current state and detects diffs between ticks.
type Mirror struct {
	mu        sync.RWMutex
	sessionID string
	state     map[string]float64
	onDiff    func(Diff)
	lastSeen  time.Time
}

// NewMirror returns a Mirror that calls onDiff whenever parameters change.
func NewMirror(onDiff func(Diff)) *Mirror {
	return &Mirror{
		state:  make(map[string]float64),
		onDiff: onDiff,
	}
}

// Update applies a packet to the mirror. Returns true if any parameters changed.
// On session change, broadcasts a session message then a full state diff.
func (m *Mirror) Update(pkt udp.StatePacket) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if pkt.SessionID != m.sessionID {
		m.sessionID = pkt.SessionID
		m.state = make(map[string]float64)
		m.onDiff(Diff{msgType: "session", SessionID: pkt.SessionID, Ts: pkt.Ts})
	}

	changes := make(map[string]float64)
	for k, v := range pkt.State {
		if cur, ok := m.state[k]; !ok || cur != v {
			changes[k] = v
		}
	}
	// Detect parameters that disappeared (set to 0)
	for k := range m.state {
		if _, ok := pkt.State[k]; !ok {
			changes[k] = 0
		}
	}

	m.lastSeen = time.Now()

	if len(changes) == 0 {
		return false
	}

	for k, v := range changes {
		m.state[k] = v
	}
	m.onDiff(Diff{msgType: "diff", Ts: pkt.Ts, Changes: changes})
	return true
}

// Snapshot returns the current session ID, full state copy, and last-seen time.
// Used by the WebSocket hub to send a state snapshot to newly connected clients.
func (m *Mirror) Snapshot() (sessionID string, state map[string]float64, lastSeen time.Time) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	snap := make(map[string]float64, len(m.state))
	for k, v := range m.state {
		snap[k] = v
	}
	return m.sessionID, snap, m.lastSeen
}
