# Architecture

Penumbra bridges Ableton Live and DMX lighting hardware. An M4L device streams
Live session state to a Go server, which handles diff computation, universe
partitioning, and E1.31 multicast dispatch to WLED/ESP32 devices. A Vite/React
PWA provides monitoring and control from any device on the network.

---

## System overview

```
Ableton Live + M4L Device
        │
        │  UDP unicast (MessagePack) — full state every tick (~40ms)
        ▼
    Penumbra Server  ──────────────────────────────  Browser / PWA / Electron
    (Go · single binary)       WebSocket + HTTP       (Vite/React)
        │
        │  E1.31 multicast per universe
        ▼
  WLED · ESP32 · DMX
```

**M4L is a dumb state emitter.** It reads Live parameters and broadcasts full
state every tick with no diff logic, no keyframes, no universe awareness. All
intelligence lives in the Go server.

---

## Components

### M4L device (`device/`)

A Max for Live device that runs inside Ableton Live. Its only job is to read
the Live Object Model and emit state:

- Reads mixer parameters (volume, pan, sends) from every track via `LiveAPI`
- Serializes state to MessagePack and sends it via UDP to the Go server
- Regenerates `session_id` when tracks are added or deleted, signaling the
  server to reset its state mirror
- Uses a **split-tick** pattern: LOM reads and UDP emission happen on alternating
  20ms ticks within a 40ms cycle. This keeps Max's scheduler stable by ensuring
  each tick does exactly one thing.

The M4L device knows nothing about DMX, E1.31, universes, or WLED.

### Go server (`server/`)

Single statically-linked binary. Owns all intelligence:

| Package | Responsibility |
|---------|---------------|
| `udp/` | Receive and decode MessagePack state packets from M4L |
| `state/` | Maintain state mirror, compute diffs, detect session changes |
| `e131/` | Build E1.31 packets, manage per-universe sequence numbers, send multicast |
| `ws/` | WebSocket hub, broadcast messages to connected UI clients |
| `api/` | HTTP router, serve embedded UI bundle, handle `POST /api/config` |
| `config/` | Load/save `config.json`, universe registry, parameter map |

The server also embeds the compiled Vite/React bundle and serves it at `/`.

### UI (`ui/`)

Vite/React PWA. Runs identically in a browser, as an installed PWA, or inside
Electron. Connects to the Go server via WebSocket for live state updates.
Config changes are sent via `POST /api/config`.

### Electron (`electron/`)

Thin native shell that adds three things the browser cannot provide:

1. **Global hotkeys** — fire even when the window is not focused
2. **System tray** — menu bar presence, show/hide
3. **Server lifecycle** — optionally spawns the Go binary as a child process

Everything else — data, state, UI rendering — flows through the same WebSocket
as the browser. The renderer has no Electron-specific code paths.

### Fake emitter (`tools/fake-emitter/`)

A Go tool that replaces M4L for development. It sends identical UDP MessagePack
packets to the server at 40ms intervals. The server cannot distinguish it from
a real M4L device. See [development.md](development.md) for usage.

---

## Data flow

```
Live session change
  → lomTask reads LOM (tick 0ms)
  → emitTask serializes + sends UDP (tick +20ms)
  → server receives packet
  → state mirror updated, diff computed
  → E1.31 packets sent to WLED devices (per universe)
  → WebSocket diff broadcast to UI clients
  → UI updates display
```

---

## Deployment modes

| Mode | Description |
|------|-------------|
| **Local** | Electron spawns Go binary as child process; UI at `localhost:3000` |
| **Remote** | Electron points at a remote server URL; skips spawning |
| **Headless** | Go binary runs standalone on Linux/Pi; UI accessed via browser |

In all modes the UI is identical — a Vite/React PWA connecting to Go via
WebSocket. The Go binary serves the PWA as embedded static files.

---

## Key design decisions

**M4L as dumb emitter** — No diff logic or universe awareness in M4L. This
keeps the Max JS surface small, testable, and free of DMX concepts.

**Go server owns all intelligence** — Diff detection, E1.31, universe
partitioning, and session management are all in Go where they can be tested
and reasoned about independently.

**Single binary, no runtime** — The Go binary embeds the UI bundle at compile
time. Deployment is copying one file. No Node, no npm, no web server.

**Full state every tick** — Simple to reason about. LAN bandwidth is not a
constraint for this use case.

**Split-tick LOM reads** — LOM traversal and MessagePack serialization happen
on alternating ticks to keep Max's scheduler predictable. See
[m4l-device.md](m4l-device.md) for details.

**Hotkey system source-agnostic** — The same handler fires whether the hotkey
came from a keyboard, an Electron global shortcut, or a WebSocket message.
The renderer never checks `window.electron`.

---

## Further reading

- [protocol.md](protocol.md) — wire format for all three communication layers
- [config.md](config.md) — `config.json` schema reference
- [development.md](development.md) — how to run the full stack locally
- [m4l-device.md](m4l-device.md) — M4L device internals and build
- [deployment.md](deployment.md) — headless and Electron deployment
