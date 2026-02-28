# device/scripts

TypeScript source for the M4L UDP state emitter. Compiled to a single ES6
IIFE by esbuild and loaded by `Penumbra.maxpat` via Max's `[js]` object.

---

## What it does

Every 40ms the emitter reads mixer state from the Live Object Model and sends
it to the Penumbra server as a MessagePack-encoded UDP datagram. The server
handles diff detection, E1.31 output, and WebSocket fanout to the UI.

**Parameters emitted per track** (named after the track, lowercased and
non-alphanumeric chars replaced with `_`):

| Parameter | Range | Notes |
|-----------|-------|-------|
| `<track>_volume` | 0.0–1.0 | Normalised from DeviceParameter min/max |
| `<track>_pan` | 0.0–1.0 | 0.5 = centre, 0.0 = full left, 1.0 = full right |
| `<track>_send_0` | 0.0–1.0 | Per return track; index matches Live's return track order |

Values are normalised to 0.0–1.0 using the DeviceParameter's own `min`/`max`,
so the output is independent of Live's internal scale.

Return track levels (`return_<name>_volume` etc.) are not emitted by default
but the code includes a commented stub in `readLOM()` if you need them.

---

## Architecture

Two `Task` objects run at 40ms, offset by 20ms (split-tick pattern):

```
tick 0ms   lomTask  → readLOM() — traverse tracks, setParam()
tick 20ms  emitTask → emitter.emit() — serialise + send UDP
tick 40ms  lomTask  → readLOM()
tick 60ms  emitTask → emitter.emit()
…
```

The 20ms split keeps each tick's work small so Max's scheduler stays stable.
DMX lags Live state by at most one tick (20ms) — imperceptible for lighting.

A `LiveAPI` observer on `live_set` detects track additions/deletions and calls
`emitter.resetSession()`, which regenerates the session ID so the server
discards stale state from the previous track layout.

---

## Configuration

The server target (host and port) is set in `Penumbra.maxpat`:

1. Open the patch in Live's M4L editor
2. Double-click the **host** message box → type the server IP → press Enter
3. Double-click the **port** message box → type the port (default `7000`) → press Enter
4. Click either message box to apply and reconnect

The values are saved with the Live set.

---

## Build

From the repo root:

```bash
pnpm --filter device-scripts build   # one-shot build
pnpm --filter device-scripts watch   # rebuild on save (Max reloads via autowatch)
```

Or via Task:

```bash
task build:device
task watch:device
```

Output: `device/scripts/dist/main.js`

---

## Constraints

The compiled output runs inside Max's `[js]` object (SpiderMonkey ES6):

- No `async`/`await`
- No optional chaining (`?.`)
- No nullish coalescing (`??`)
- No ES modules — esbuild bundles everything into one IIFE
- Max globals (`Task`, `LiveAPI`, `outlet`, `post`) are injected by the
  runtime; do not import or mock them

Keep all Max global access in `main.ts`. Library code in `lib/` receives
Max APIs via dependency injection so it can be unit-tested without a Max
runtime.
