# Penumbra

> The edge where sound becomes light.

Penumbra bridges Ableton Live and DMX lighting hardware. An M4L device streams your session state in real time to a Go server, which drives WLED/ESP32 fixtures over E1.31 multicast. A PWA gives you monitoring and control from any device on the network — browser, phone, or native app.

---

## How it works

```
Ableton Live + M4L
       │
       │  UDP · MessagePack · 40ms
       ▼
   Penumbra Server  ◄────────────────  Browser / PWA / Electron
   (Go · single binary)                WebSocket
       │
       │  E1.31 multicast
       ▼
  WLED · ESP32 · DMX
```

The M4L device is a dumb emitter — it reads your session parameters and broadcasts full state every tick. The server handles everything else: diff detection, universe partitioning, E1.31 packet construction, and WebSocket fanout to the UI.

---

## Features

- **Live session → DMX** — map any Live parameter to any DMX channel
- **E1.31 multicast** — native WLED protocol, no intermediate DMX interface needed
- **Single Go binary** — runs on Mac, Linux, or a Raspberry Pi with no runtime dependencies
- **PWA UI** — monitor and configure from any browser on the network
- **Electron shell** — optional native app with global hotkeys that fire even when unfocused
- **Fake emitter** — develop and test the full stack without a Live license

---

## Requirements

| Component | Requirement |
|-----------|-------------|
| M4L device | Ableton Live 11+ with Max for Live |
| Server | macOS, Linux, or Raspberry Pi (arm64) |
| UI | Any modern browser |
| Hardware | WLED-flashed ESP32, reachable by multicast |
| Dev tooling | Go 1.22+, Node 20+, pnpm 9+, [Task](https://taskfile.dev) |

---

## Getting started

```bash
# Clone and install
git clone https://github.com/yourname/penumbra
cd penumbra
task install

# Start the server (with live reload)
task server:dev

# Start the UI dev server (proxies /ws to Go)
task watch:ui

# No Live license? Run the fake emitter instead of M4L
task fake
```

Open `http://localhost:5173` to see the UI.

---

## M4L device

The `.amxd` device is available on the [Releases](../../releases) page. Drop it into an Ableton Live set, configure the server IP if running remotely, and it will start streaming immediately.

For M4L development, see [device/scripts/README.md](device/scripts/README.md).

---

## Configuration

Universe and parameter mappings live in `server/config.json` and are editable via the UI:

```json
{
  "universes": {
    "1": { "ip": "192.168.1.101", "label": "stage left" }
  },
  "parameters": {
    "track1_dimmer": { "universe": 1, "channel": 1 },
    "track1_red":    { "universe": 1, "channel": 2 }
  }
}
```

Parameter names match the names you give your Live tracks and devices. The server resolves them dynamically — no recompilation needed when your session changes.

---

## Deployment

**Local** — Electron spawns the server automatically. Download from Releases.

**Headless (Pi)** — copy the binary, start it with systemd:

```bash
scp penumbra-server-linux-arm64 pi@yourpi:~/penumbra-server
# systemd unit in server/deploy/penumbra.service
```

The server embeds the UI — point a browser at `http://yourpi:3000`.

---

## Development

```bash
task build          # build everything
task test           # run all tests
task ci             # full local CI (lint + typecheck + test + build)
task fake           # fake emitter, animated mode
task fake MODE=static TARGET=192.168.1.50:7000
```

See `CLAUDE.md` for full architecture documentation and `PROTOCOL.md` for the wire format.

---

## Stack

- **M4L device** — TypeScript → ES6, compiled with esbuild
- **Server** — Go, single binary, embeds the UI bundle
- **UI** — Vite + React, PWA, WebSocket
- **Electron** — thin native shell, global hotkeys only
- **Hardware** — WLED on ESP32, E1.31 / sACN

---

## License

MIT
