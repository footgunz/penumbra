# CLAUDE.md — Penumbra Project Context for Claude Code

This file provides persistent project context. Read this before making any changes.

**GitHub:** https://github.com/footgunz/penumbra
**Go module:** `github.com/footgunz/penumbra`

---

## What This Project Is

Penumbra — a bridge between Ableton Live and DMX lighting hardware. An M4L device streams Live session state to a Go server, which handles diff computation, universe partitioning, and E1.31 multicast dispatch to WLED/ESP32 devices. A Vite/React PWA (optionally wrapped in a thin Electron shell) provides monitoring and control.

---

## Architecture

```
Ableton Live + M4L Device
        │
        │  UDP unicast (MessagePack) — full state every tick
        ▼
    Go Server  ──────────────────────── PWA / UI
        │        WebSocket + HTTP        (Vite/React)
        │
        │  E1.31 multicast per universe
        ▼
  WLED ESP32 (universe N)
```

**M4L is a dumb state emitter.** It sends full state every tick with no diff logic, no keyframes, no universe awareness. All intelligence lives in the Go server.

> For a human-readable architecture overview, see [docs/architecture.md](docs/architecture.md).

---

## Deployment Modes

The Go server is a single statically-linked binary. No Node/npm runtime required in production.

| Mode | Description |
|------|-------------|
| **Local (default)** | Electron spawns Go binary as child process, UI loads `localhost:3000` |
| **Remote** | Electron points UI at remote server URL, skips spawning |
| **Headless** | Go binary runs standalone on Linux/Pi, UI accessed via browser |

In all modes the UI is identical — Vite/React PWA connecting to Go via WebSocket. The Go binary serves the PWA as embedded static files.

---

## Development Topology

The stack is intentionally split so that **Live is never required on a dev machine**. The fake emitter replaces M4L entirely for server, UI, and hardware development.

| Component | Dev machine | Performance machine |
|-----------|-------------|---------------------|
| Go server | ✓ | optional |
| Vite UI / Electron | ✓ | optional |
| Fake emitter | ✓ | — |
| WLED hardware | ✓ (optional) | ✓ |
| Ableton Live + M4L | — | ✓ |

**The fake emitter** (`tools/fake-emitter/`) is a first-class development tool, not a workaround. It sends identical UDP MessagePack packets to the Go server at 40ms intervals. The server cannot distinguish it from M4L. This means the entire stack — including real E1.31 output to WLED hardware — is fully exercisable without a Live license.

Current fake emitter modes:
- **Static** — fixed parameter values, tests server/UI plumbing
- **Animated** — sweeps values over time, tests E1.31 output on hardware
- **Scripted** — replays state from a JSON file (future)

**M4L development** (performance machine only, via SSH):
- Edit `device/scripts/src/` locally
- Push to git, pull on performance machine
- `autowatch = 1` reloads the device in Live automatically
- Or: mount `device/scripts/src/` via SSHFS for instant reload without git round-trip

The only thing requiring the performance machine is verifying LOM subscriptions and split-tick behavior in a real Live session. This is a small, stable surface area.

---

## Protocol

See [docs/protocol.md](docs/protocol.md) for full spec. Key points:

**M4L → Server (UDP, port 7000)**
- Full state every tick (~40ms), MessagePack
- Human-readable parameter names, normalised float values 0.0–1.0
- No diff logic, no seq numbers — server handles all of that
- Session change detected by `session_id` change, no handshake needed

**Server → WLED (E1.31 multicast, port 5568)**
- Go server owns universe partitioning, E1.31 packet construction, multicast dispatch
- Per-universe sequence numbers tracked in server
- Universe → IP mapping in `server/config.json`

**Server ↔ UI (WebSocket, port 3000)**
- WebSocket message types (server → UI): `session`, `state`, `diff`, `status`
- WebSocket message types (UI → server): `hotkey`, `blackout`, `reset`
- Config updates via REST: `POST /api/config` — JSON body, updates `server/config.json`
- Emergency blackout via REST: `POST /api/blackout`, `POST /api/reset`
- Dedicated mobile e-stop page: `GET /estop` — standalone HTML, no React dependency
- Go serves PWA static bundle on same port via embedded `embed.FS`

**Config update pattern**
- `POST /api/config` with JSON body — updates universe and parameter mapping, persists to `server/config.json`
- The `SetConfigMessage` type in protocol-types is defined but not currently handled over WebSocket

**Hotkey pattern**
- Electron global shortcuts → IPC → renderer synthetic event
- Browser: standard `keydown` → same handler
- Server also accepts `hotkey` over WebSocket for future integrations

**Emergency blackout**
- Atomic bool on the Hub — `Blackout()` / `Reset()` are fully non-blocking (atomic swap, side effects in goroutine)
- When active: incoming state is received but not processed (no diff, no E1.31, no WS state/diff relay)
- Emitter connection tracking and session ID continue updating during blackout
- Blackout scene dispatched once to E1.31 on activation (configurable in `config.json`)
- Status messages continue flowing (with `"blackout": true`) so UIs can show the banner
- Trigger sources: WebSocket `blackout`/`reset`, `POST /api/blackout`/`reset`, TUI `!`/`esc`, `/estop` page

---

## Repo Structure

```
.
├── device/                    # M4L patch, unpacked from .amxd
│   ├── Penumbra.maxpat        # Minimal Max patch — wiring and UI only
│   ├── scripts/
│   │   ├── src/
│   │   │   ├── main.ts        # Max entry point — LOM subscriptions, udpsend
│   │   │   └── lib/
│   │   │       ├── emitter.ts # State serialization, session ID, tick loop
│   │   │       └── *.test.ts
│   │   ├── dist/              # Compiled output — gitignored, loaded by Max
│   │   ├── build.mjs
│   │   ├── tsconfig.json
│   │   └── package.json
│
├── server/                    # Go server — single deployable binary
│   ├── main.go
│   ├── udp/
│   │   └── receiver.go        # Receive + decode emitter state packets
│   ├── state/
│   │   └── state.go           # State mirror, diff detection
│   ├── e131/
│   │   └── e131.go            # Packet construction, multicast dispatch
│   ├── ws/
│   │   └── hub.go             # WebSocket hub, broadcast to UI clients
│   ├── api/
│   │   └── routes.go          # HTTP routes, serve embedded UI, config/blackout/reset endpoints, /estop page
│   ├── config/
│   │   └── config.go          # Universe registry, parameter map, persistence
│   ├── tui/
│   │   └── tui.go             # Optional terminal UI dashboard (Bubbletea)
│   ├── ui/
│   │   ├── fs.go              # embed.FS exposed as package ui — imported by api/
│   │   └── dist/              # Vite build output — gitignored, embedded at compile time
│   ├── config.json            # Universe + parameter mapping (committed)
│   ├── embed.go               # embed.FS declaration (main package, unused by api)
│   ├── go.mod
│   └── go.sum
│
├── ui/                        # Vite/React PWA
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx           # React root mount
│   │   ├── ws/                # WebSocket client, message handling
│   │   ├── hotkeys/           # Hotkey system — agnostic to source
│   │   ├── components/
│   │   └── types/             # TypeScript types matching Go wire format
│   ├── public/
│   │   └── manifest.json      # PWA manifest
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── electron/                  # Thin native shell — optional
│   ├── src/
│   │   └── main.ts            # Window, global shortcuts, tray, spawn server
│   ├── tsconfig.json
│   └── package.json
│
├── packages/
│   └── protocol-types/        # Shared TS types (UI + Electron only)
│       ├── index.ts           # WebSocket message types
│       ├── tsconfig.json
│       └── package.json
│
├── tools/
│   └── fake-emitter/          # Replaces M4L for dev — no Live license needed
│       ├── main.go            # Static + animated modes
│       ├── go.mod
│       ├── scenes/            # JSON scene files for scripted mode (future)
│       │   └── example.json
│       └── README.md
│
├── scripts/
│   ├── pack.sh
│   └── unpack.sh
│
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
│
├── .gitignore
├── .npmrc                     # approve-builds=false; esbuild allowed via package.json
├── package.json               # Root — pnpm workspaces (TS packages only)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── Taskfile.yml
├── docs/
│   ├── architecture.md
│   ├── protocol.md
│   ├── config.md
│   ├── deployment.md
│   ├── development.md
│   └── m4l-device.md
├── CLAUDE.md
└── README.md
```

---

## Go Server Conventions

Single binary, statically linked. No external runtime dependencies.

Configuration via env vars: `UDP_PORT=7000`, `WS_PORT=3000`

Universe and parameter mapping loaded from `server/config.json` at startup. Updated via `POST /api/config` and written back to disk. This file is committed to the repo as the default configuration.

The UI bundle (`server/ui/dist/`) is embedded at compile time. `server/ui/fs.go` declares `package ui` with an `embed.FS` that the `api` package imports directly. `server/embed.go` also embeds it into the main package (unused by api; harmless). The Go server serves the UI at `/` and WebSocket at `/ws`.

For headless deployment: `Dockerfile` and `systemd` unit in `server/deploy/`.

Cross-compile for Pi:
```bash
GOOS=linux GOARCH=arm64 go build -o penumbra-server ./...
```

Go module path: `github.com/footgunz/penumbra`
Fake emitter module: `github.com/footgunz/penumbra/tools/fake-emitter`

### Go package responsibilities

- **udp/** — decode incoming MessagePack, validate session_id, emit state events
- **state/** — maintain state mirror, compute diffs, detect session changes
- **e131/** — build E1.31 packets, manage per-universe sequence numbers, send multicast
- **ws/** — WebSocket hub, broadcast messages to connected UI clients, blackout state machine
- **api/** — HTTP router, serve embedded UI, config/blackout/reset endpoints, `/estop` page
- **config/** — load/save config.json, universe registry, parameter map, emitter timeouts, blackout scene
- **tui/** — optional terminal UI dashboard (Bubbletea), parameter/universe views, blackout banner

---

## M4L Device Conventions

M4L is intentionally simple. Its only job is to read Live Object Model state and emit it.

- `.amxd` not committed — CI build artifact, published to GitHub Releases on tag
- `device/scripts/dist/` gitignored — never commit compiled output
- `Penumbra.maxpat` stays minimal — wiring and UI only

### Architecture

`main.ts` only:
- Sets `autowatch`, `inlets`, `outlets`
- Subscribes to Live Object Model events
- Calls `udpsend` with serialized state
- Delegates to `lib/emitter.ts`

`lib/emitter.ts`:
- Maintains current parameter state map
- Generates `session_id` (UUID v4 via Math.random — no crypto in Max SpiderMonkey); regenerated on track add/delete
- Serializes to MessagePack via `@msgpack/msgpack` (bundled by esbuild) on each tick
- No diff logic, no universe awareness, no E1.31

### Build

```bash
pnpm --filter device-scripts build   # single build
pnpm --filter device-scripts watch   # rebuild on save → Max reloads via autowatch
```

Do not use ES2017+ syntax in any M4L source file (`async/await`, `?.`, `??`, etc.).

`build.mjs` uses `platform: 'neutral'` and must include `mainFields: ['module', 'main']` so that npm packages with non-exports `package.json` fields (like `@msgpack/msgpack`) resolve correctly. Do not remove this.

---

## UI Conventions

Vite/React PWA. Runs identically in browser, as installed PWA, and inside Electron.

- `src/ws/` — WebSocket client, reconnects automatically, dispatches typed messages
- `src/hotkeys/` — hotkey handler registry, accepts events from keyboard, Electron IPC, or WebSocket. **Renderer never checks `window.electron` to decide behavior** — hotkey events are normalized before reaching handlers.
- `src/types/` — TypeScript types matching Go WebSocket wire format. Source of truth is Go structs; keep these in sync manually or via codegen.

PWA manifest and service worker in `public/`. The service worker caches the app shell for offline use.

In dev mode, Vite runs on port 5173 and proxies `/ws` to Go on port 3000:

```ts
// vite.config.ts
server: {
  proxy: {
    '/ws': { target: 'ws://localhost:3000', ws: true }
  }
}
```

---

## Electron Conventions

Thin shell only. Electron adds exactly three things the browser cannot do:

1. **Global hotkeys** — `globalShortcut.register(...)` fires even when window is not focused
2. **System tray** — menu bar presence, show/hide window
3. **Server lifecycle** — optionally spawns Go binary as child process in local mode

Everything else — data, state, UI — flows through WebSocket to Go, identical to the browser.

`electron/main.ts` structure:
- Create `BrowserWindow`, load `http://localhost:3000` (prod) or `http://localhost:5173` (dev)
- Register global shortcuts, forward to renderer via `ipcRenderer.send('hotkey', key)`
- Optionally spawn Go binary based on config
- Set up tray icon

The renderer handles `ipcRenderer` hotkey events identically to keyboard events — same handler, no Electron-specific code paths.

Electron is packaged separately from the Go binary. The packaged Electron app bundles the Go binary for local mode.

---

## Shared Packages (TypeScript only)

`packages/protocol-types` — WebSocket message types shared between `ui/` and `electron/`. Go structs are the authoritative definition; these types must be kept in sync.

The `packages/e131` and `packages/state` TypeScript packages have been removed — that logic now lives in Go.

---

## Monorepo Tooling

**Package manager:** pnpm workspaces for TypeScript packages (`device/scripts`, `ui`, `electron`, `packages/*`)

**Go:** standard `go` toolchain, managed separately from pnpm.

**Task runner:** [Task](https://taskfile.dev) — required. Install via `brew install go-task`. Replaces Make. All dev, build, test, and release operations go through `Taskfile.yml`.

```bash
task install          # install all deps (pnpm + go mod tidy)
task build            # build all components in parallel
task watch            # watch all components in parallel
task test             # run all tests
task lint             # lint all components
task typecheck        # tsc --noEmit all TS
task ci               # full local CI suite (lint + typecheck + test + build)

task fake             # run fake emitter (animated, localhost)
task fake MODE=static # fixed values
task fake TARGET=192.168.1.50:7000  # remote server

task server:dev       # run Go server with live reload (requires air)
task watch:ui         # run Vite dev server

task pack             # build + pack .amxd
task release:build    # cross-compile Go for all platforms
```

Run `task` with no arguments to list all available tasks with descriptions.
---

## CI / CD

**Every push:** lint → typecheck → TS test → Go vet → Go test → build all

**Tag push `v*`:**
- All CI steps
- Pack `device/scripts/dist/` → `Penumbra.amxd`
- Cross-compile Go for mac/linux/arm64
- Build Electron app (bundles Go binary for local mode)
- Publish to GitHub Releases: `.amxd`, Go binaries, Electron app

---

## Versioning

Git tags version the entire system. All components versioned together. Do not tag unless CI is green.

---

## Key Design Decisions

- **M4L as dumb emitter** — no diff logic, no universe awareness, dramatically simpler Max JS
- **Go server owns all intelligence** — diff, E1.31, universe partitioning, session management
- **Go single binary** — statically linked, no runtime, trivial Pi deployment
- **Go embeds UI bundle** — one process serves everything, no separate file server
- **PWA baseline** — full UI in any browser, installable, no Electron required
- **Thin Electron shell** — adds only global hotkeys, tray, and optional server spawn
- **Hotkey system source-agnostic** — same handler for keyboard, Electron IPC, WebSocket
- **Full state every tick** — simple to reason about, LAN bandwidth is not a constraint
- **E1.31 multicast standard addresses** — no universe→IP mapping needed in M4L
- **Per-universe E1.31 seq in Go** — correct per spec, isolated from monitoring concerns
- **Atomic blackout flag** — non-blocking `Blackout()`/`Reset()` safe to call from any goroutine (HTTP handler, WS readPump, TUI event loop). Side effects (E1.31 dispatch, logging, status broadcast) run in a goroutine so callers never block.

### Split-tick LOM read vs emit

The M4L emitter deliberately splits LOM reads and UDP emission across alternating ticks at 20ms intervals, producing one complete LOM read + one UDP emit per 40ms cycle. DMX output lags the LOM by one tick (20ms maximum).

**Why:**

Max's single-threaded JS scheduler gives each `Task` invocation a fixed time budget. If LOM traversal and MessagePack serialization both happen in the same tick, they compete for that budget and risk pushing subsequent ticks late — destabilizing the 40ms cadence. Separating them means each tick does exactly one thing, runs faster, and the scheduler stays predictable.

It also means the two operations are independently measurable. If timing issues arise it is immediately clear whether the cost is in LOM traversal or serialization.

**The tradeoff:**

DMX output lags Live state by at most one tick — 20ms. For lighting this is imperceptible; human perception of lighting changes is in the 100ms range. This is an acceptable and deliberate tradeoff for scheduler stability.

**Implementation:**

```ts
// Two tasks, same 40ms interval, offset by one tick
const lomTask = new Task(() => { localState = readLOM() })
const emitTask = new Task(() => { send(msgpack(localState)) })
lomTask.interval = 40
emitTask.interval = 40
emitTask.delay = 20  // starts one tick behind lomTask
```

Do not merge these into a single task. The split is intentional.

---

## Known Constraints and Gotchas

- **Max JS runtime is ES6 SpiderMonkey** — no async/await, `?.`, `??`. esbuild target ES6. Test bundled output early.
- **Max `Task` jitter** — tick timing is approximate. Acceptable for lighting.
- **Multicast network support** — managed switch recommended. Some consumer APs block multicast. WLED unicast is a fallback.
- **E1.31 port 5568 is fixed** — not configurable.
- **Go embeds UI at compile time** — rebuild Go binary after UI changes for production. Dev mode uses Vite proxy.
- **Go structs are authoritative for wire format** — `ui/src/types/` must be kept in sync manually. Consider codegen if drift becomes a problem.
- **Electron bundles Go binary** — Electron release build must target the correct Go binary for the platform.

---

## What To Avoid

- Do not add diff logic or universe awareness to M4L — server owns that
- Do not merge LOM read and UDP emit into the same tick — the split is intentional for scheduler stability
- Do not commit `device/scripts/dist/` or any `.amxd`
- Do not use ES2017+ syntax in M4L source
- Do not put Max globals in `lib/` — inject them
- Do not check `window.electron` in the renderer — hotkey events must be normalized
- Do not import Electron APIs in `ui/` — only in `electron/`
- Do not add Node/npm dependencies to `server/` — it is pure Go
- Do not hardcode universe→IP mappings — use `server/config.json`
- Do not add reliability mechanisms to UDP layers
- Do not run `pnpm install` in a subdirectory — always from root
- Do not use npm or yarn — use pnpm
- Do not add tasks to CI that call `task` — CI uses native commands directly to avoid Task as a CI dependency for TS packages
