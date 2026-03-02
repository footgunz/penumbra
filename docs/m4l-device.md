# M4L Device

The Penumbra M4L device runs inside Ableton Live and streams session state to
the Go server. Its only job is to read Live parameters and emit them — all
DMX logic lives in the server.

The compiled `.amxd` is available on the
[Releases](https://github.com/footgunz/penumbra/releases) page. For
development, follow the build instructions below.

---

## What it emits

Every 40ms the emitter reads mixer state from the Live Object Model and sends
it to the Go server as a MessagePack-encoded UDP datagram.

**Parameters emitted per track** (named after the track, lowercased,
non-alphanumeric characters replaced with `_`):

| Parameter | Range | Notes |
|-----------|-------|-------|
| `<track>_volume` | 0.0–1.0 | Normalized from DeviceParameter min/max |
| `<track>_pan` | 0.0–1.0 | 0.5 = centre, 0.0 = full left, 1.0 = full right |
| `<track>_send_0` | 0.0–1.0 | Per return track; index matches Live's return track order |

Values are normalized to 0.0–1.0 using the DeviceParameter's own `min`/`max`,
independent of Live's internal scale.

Return track levels (`return_<name>_volume` etc.) are not emitted by default
but the code includes a commented stub in `readLOM()` if you need them.

---

## Split-tick architecture

Two `Task` objects run at 40ms, offset by 20ms:

```
tick   0ms  lomTask  → readLOM() — traverse tracks, update state map
tick  20ms  emitTask → emitter.emit() — serialize + send UDP
tick  40ms  lomTask  → readLOM()
tick  60ms  emitTask → emitter.emit()
…
```

**Why the split?** Max's single-threaded JS scheduler gives each `Task`
invocation a fixed time budget. LOM traversal and MessagePack serialization
together in one tick compete for that budget and risk pushing subsequent ticks
late, destabilizing the 40ms cadence. Separating them means each tick does
exactly one thing.

**The tradeoff:** DMX output lags Live state by at most 20ms — imperceptible
for lighting (human perception of lighting changes is ~100ms).

Do not merge these into a single task. The split is intentional.

A `LiveAPI` observer on `live_set` detects track additions/deletions and calls
`emitter.resetSession()`, regenerating the session ID so the server discards
stale state from the previous track layout.

---

## Build

From the repo root:

```bash
pnpm --filter device-scripts build   # one-shot build
pnpm --filter device-scripts watch   # rebuild on save (Max reloads via autowatch)
```

Via Task:

```bash
task build:device
task watch:device
```

Output: `device/scripts/dist/main.js`

---

## Configuring the server target

The server host and port are set in `Penumbra.maxpat`:

1. Open the patch in Live's M4L editor
2. Double-click the **host** message box → type the server IP → press Enter
3. Double-click the **port** message box → type the port (default `7000`) → press Enter
4. Click either message box to apply and reconnect

The values are saved with the Live set.

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

---

## Source layout

```
device/scripts/
  src/
    main.ts          # Max entry point — LOM subscriptions, udpsend
    lib/
      emitter.ts     # State map, session ID, tick loop, MessagePack emit
      *.test.ts      # Unit tests (no Max runtime required)
  dist/              # Compiled output — gitignored, loaded by Max
  build.mjs          # esbuild config
  package.json
  tsconfig.json
```
