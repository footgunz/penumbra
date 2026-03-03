# Protocol Specification

## Overview

Three communication layers:

```
M4L → server:7000           UDP unicast (MessagePack) — full state every tick
server → 239.255.0.N:5568   UDP multicast (E1.31)    — DMX output per universe
server ↔ UI                 WebSocket (JSON)          — monitoring / config
```

M4L is a dumb state emitter. All diff computation, keyframe scheduling, universe partitioning, and E1.31 dispatch are owned by the Go server.

---

## 1. M4L → Server — Full State Emission

### Transport

- **Protocol:** UDP unicast to server IP, port 7000 (default)
- **Serialization:** MessagePack
- **Cadence:** Every tick (configurable, default 40ms / 25Hz)
- **Content:** Full state every packet — no diffs, no keyframes, no seq numbers

M4L emits the complete parameter state on every tick. The server is responsible for detecting changes, computing diffs, and scheduling E1.31 output. M4L does not need to know about universes, channels, or WLED devices.

### Packet format

Single packet type — no `type` field needed:

```json
{
  "session_id": "uuid",
  "ts": 1709123456789,
  "state": {
    "track1_dimmer": 0.85,
    "track1_red": 0.5,
    "track2_dimmer": 0.0
  }
}
```

State keys are human-readable parameter names. Values are normalised floats 0.0–1.0.

### Session lifecycle

```
M4L starts
  → emits state every tick with new session_id

M4L restarts or track added/deleted
  → new session_id on next packet
  → server detects change, resets state mirror, re-derives universe map

M4L stops
  → server detects timeout (no packet for >500ms), marks M4L disconnected
```

No explicit connect/disconnect handshake. Session change is detected from session_id on incoming packets.

---

## 2. Server → WLED — E1.31 (sACN)

### Transport

- **Protocol:** UDP multicast, port 5568 (fixed by E1.31 spec)
- **Multicast address:** `239.255.{universe >> 8}.{universe & 0xff}`
  - Universe 1 → `239.255.0.1`, Universe 2 → `239.255.0.2`, etc.
- **Refresh rate:** Driven by incoming M4L state — server emits E1.31 per universe on each tick
- **Sequence number:** 1 byte per universe, increments 0–255 then wraps, tracked independently per universe in the server

### Universe → channel mapping

Defined in `server/config.json`, editable via UI. Maps parameter names to universe and DMX channel:

```json
{
  "universes": {
    "1": { "ip": "192.168.1.101", "label": "stage left" },
    "2": { "ip": "192.168.1.102", "label": "stage right" }
  },
  "parameters": {
    "track1_dimmer": { "universe": 1, "channel": 1 },
    "track1_red":    { "universe": 1, "channel": 2 },
    "track1_green":  { "universe": 1, "channel": 3 },
    "track2_dimmer": { "universe": 2, "channel": 1 }
  }
}
```

On each incoming M4L state packet, the server:
1. Looks up each parameter's universe and channel
2. Scales normalised value (0.0–1.0) to DMX (0–255)
3. Builds a 512-byte slot array per universe
4. Emits E1.31 packet to `239.255.0.N:5568` for each universe

### Network requirements

Multicast requires network support. A managed switch is recommended for live performance. Some consumer routers/APs block multicast between WiFi clients. WLED supports unicast E1.31 as a fallback — configurable per device in WLED settings.

---

## 3. Server ↔ UI — WebSocket

The Go server exposes a WebSocket on `WS_PORT` (default 3000) and serves the Vite/React PWA as embedded static files on the same port.

### Server → UI messages

All messages are JSON.

#### `session` — New session detected

```json
{
  "type": "session",
  "session_id": "uuid",
  "ts": 1709123456789
}
```

#### `state` — Full state snapshot

Sent on new UI connection and periodically (~1s) as a sync.

```json
{
  "type": "state",
  "session_id": "uuid",
  "ts": 1709123456789,
  "state": { "track1_dimmer": 0.85, "track1_red": 0.5 }
}
```

#### `diff` — Changed parameters since last emission

Sent on each tick where state changed.

```json
{
  "type": "diff",
  "ts": 1709123457039,
  "changes": { "track1_red": 0.65 }
}
```

#### `status` — Connection and universe health

```json
{
  "type": "status",
  "m4l_connected": true,
  "m4l_last_seen": 1709123457039,
  "universes": {
    "1": { "label": "stage left", "ip": "192.168.1.101", "active": true },
    "2": { "label": "stage right", "ip": "192.168.1.102", "active": true }
  }
}
```

### UI → Server messages

#### `set_config` — Update universe/parameter mapping

```json
{
  "type": "set_config",
  "universes": {
    "1": { "ip": "192.168.1.101", "label": "stage left" }
  },
  "parameters": {
    "track1_dimmer": { "universe": 1, "channel": 1 }
  }
}
```

#### `hotkey` — Forwarded from Electron global shortcut

```json
{
  "type": "hotkey",
  "key": "scene-1"
}
```

---

## 4. PWA / Electron — Hotkey Pattern

Global hotkeys registered in Electron fire `ipcMain` events, which are forwarded to the renderer via `ipcRenderer`, which emits the same synthetic events as keyboard shortcuts in the browser. The renderer is agnostic — it handles `hotkey` events regardless of source.

In the browser (non-Electron), standard `keydown` listeners fire the same handler. The server also accepts `hotkey` messages over WebSocket so future integrations (hardware controllers, OSC) can trigger the same actions.
