# Development Guide

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Go | 1.25+ | https://go.dev/dl |
| Node | 20+ | Use `nvm use` (`.nvmrc` provided) |
| pnpm | 10+ | `npm install -g pnpm` |
| Task | latest | https://taskfile.dev |

Node 20 is a hard requirement — Tailwind v4's native Rust engine
(`@tailwindcss/oxide`) will not install on older versions. Run `nvm use` after
cloning to automatically select the correct version.

---

## Setup

```bash
git clone https://github.com/footgunz/penumbra
cd penumbra
nvm use          # select Node 20
task install     # pnpm install + go mod tidy
```

---

## Running the stack

Open three terminals:

```bash
# Terminal 1 — Go server with live reload (requires air: go install github.com/air-verse/air@latest)
task server:dev

# Terminal 2 — Vite dev server (proxies /ws to Go on port 3000)
task watch:ui

# Terminal 3 — Fake emitter (replaces M4L)
task fake
```

Open `http://localhost:5173` to see the UI.

> **No Live license?** The fake emitter sends identical packets to the server.
> The server cannot distinguish it from a real M4L device. The full stack —
> including E1.31 output to real WLED hardware — works without Ableton.

---

## Fake emitter

The fake emitter (`tools/fake-emitter/`) replaces the M4L device for
development. See [tools/fake-emitter/README.md](../tools/fake-emitter/README.md)
for full usage.

```bash
task fake                              # animated mode, localhost
task fake MODE=static                  # fixed mid-values
task fake TARGET=192.168.1.50:7000     # remote server
```

---

## Task reference

```bash
task install          # install all deps (pnpm + go mod tidy)
task build            # build all components
task watch            # watch all components in parallel
task test             # run all tests
task lint             # lint all components
task typecheck        # tsc --noEmit all TS
task ci               # full local CI (lint + typecheck + test + build)

task server:dev       # run Go server with live reload
task watch:ui         # run Vite dev server
task watch:device     # rebuild M4L scripts on save

task fake             # run fake emitter (animated, localhost)
task pack             # build + pack .amxd device file
task release:build    # cross-compile Go for all platforms
```

Run `task` with no arguments to list all tasks with descriptions.

---

## Dev topology

The stack is intentionally split so that Ableton Live is never required on a
dev machine.

| Component | Dev machine | Performance machine |
|-----------|-------------|---------------------|
| Go server | ✓ | optional |
| Vite UI / Electron | ✓ | optional |
| Fake emitter | ✓ | — |
| WLED hardware | ✓ (optional) | ✓ |
| Ableton Live + M4L | — | ✓ |

The only thing requiring a Live installation is verifying LOM subscriptions
and split-tick behavior in a real session. Everything else is exercisable
locally.

---

## M4L development

M4L source lives in `device/scripts/src/`. The compiled output is gitignored.

For changes that need to run in Live:

```bash
# Option A: Build + push to git, pull on performance machine
task build:device
git push

# Option B: Mount via SSHFS for instant reload without git round-trip
sshfs user@devmachine:/path/to/penumbra/device/scripts/src/ /local/mount/
```

`autowatch = 1` is set in the Max patch — Max reloads the script automatically
when `dist/main.js` changes.

See [m4l-device.md](m4l-device.md) for M4L internals.

---

## Running tests

```bash
task test             # all tests (TS + Go)

# TS only:
pnpm test

# Go only (from server/):
go test ./...
```

---

## CI

Every push runs: lint → typecheck → TS tests → Go vet → Go test → build all.

To run the full suite locally before pushing:

```bash
task ci
```
