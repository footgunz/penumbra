# Fixture Library — M4L Channel Strip (PoC) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current LOM mixer scrape in the M4L device with a per-fixture channel strip model — a fixed pool of 16 dial slots, preset-driven active/label configuration, emitting `{fixture_name}_{Label}` keys for active channels only.

**Architecture:** The M4L device is rewritten as a channel strip instrument: dial values arrive via Max inlets (direct connections from `live.dial` objects), a preset selector configures which channels are active and what their labels are, and the emitter builds the state map from active channels only. The server and `config.json` are structurally unchanged — the existing `parameters` map handles the new key names identically to the old ones. The fake emitter is updated to emit fixture-style labels so the full stack can be tested without Live.

**Tech Stack:** TypeScript (ES6, Max SpiderMonkey constraints), `@msgpack/msgpack`, Go, Jest (via device-scripts test suite), `pnpm --filter device-scripts test`

---

## Context you need to read first

- `device/scripts/src/lib/emitter.ts` — current emitter (`setParam`, `resetSession`, `emit`)
- `device/scripts/src/lib/emitter.test.ts` — existing tests (will be replaced)
- `device/scripts/src/main.ts` — current LOM traversal (will be replaced)
- `tools/fake-emitter/main.go` — `defaultParameters` slice at top (update naming)
- `server/config.json` — `parameters` map (update key names to match new convention)
- `docs/plans/2026-03-02-fixture-library-design.md` — full design rationale

## Critical constraints (Max JS runtime)

- **No ES2017+ syntax** — no `async/await`, no `?.`, no `??`. Use `var` everywhere in `main.ts`. `const`/`let` are fine in `lib/` files (esbuild lowers them).
- **No dynamic Max object creation** — only static `live.dial` objects, wired at patch design time.
- **Max globals** — `Task`, `LiveAPI`, `outlet`, `post`, `inlet`, `inlets`, `outlets` are provided by the Max runtime at load time. Declare them with `declare var` / `declare function` in TypeScript — never import them. They are never available in tests.
- **`lib/` must not use Max globals** — all runtime objects pass through function parameters (injection pattern). This keeps `lib/` unit-testable in Node.
- Build: `pnpm --filter device-scripts build` — must produce no errors.
- Test: `pnpm --filter device-scripts test` — runs Jest in Node (not Max).

---

### Task 1: Rewrite `lib/emitter.ts` — channel strip API (TDD)

**Files:**
- Modify: `device/scripts/src/lib/emitter.ts`
- Modify: `device/scripts/src/lib/emitter.test.ts`

The existing `setParam(name, value)` API is replaced by a channel-based API. The emitter owns a named channel array; `emit()` builds the state map from active channels only, keyed as `{fixtureName}_{label}`.

**Step 1: Write the failing tests**

Replace `device/scripts/src/lib/emitter.test.ts` entirely:

```typescript
import { decode } from '@msgpack/msgpack'
import { createEmitter } from './emitter'

function decodePacket(bytes: number[]): { session_id: string; ts: number; state: Record<string, number> } {
  return decode(new Uint8Array(bytes)) as any
}

describe('createEmitter — channel strip', () => {
  it('emits a non-empty byte array on emit()', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))
    e.emit()
    expect(sent).toHaveLength(1)
    expect(sent[0].length).toBeGreaterThan(0)
  })

  it('active channels appear in emitted state with fixture prefix', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))

    e.setFixtureName('stage_left')
    e.setChannels([
      { label: 'Dimmer', active: true },
      { label: 'Red',    active: true },
      { label: 'Blue',   active: false },
    ])
    e.setChannelValue(0, 0.75)
    e.setChannelValue(1, 1.0)
    e.setChannelValue(2, 0.5)  // inactive — must not appear
    e.emit()

    const pkt = decodePacket(sent[0])
    expect(pkt.state['stage_left_Dimmer']).toBeCloseTo(0.75)
    expect(pkt.state['stage_left_Red']).toBeCloseTo(1.0)
    expect(pkt.state['stage_left_Blue']).toBeUndefined()
  })

  it('inactive channels are excluded from emitted state', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))

    e.setFixtureName('fixture')
    e.setChannels([{ label: 'Pan', active: false }])
    e.setChannelValue(0, 0.9)
    e.emit()

    const pkt = decodePacket(sent[0])
    expect(Object.keys(pkt.state)).toHaveLength(0)
  })

  it('setChannelValue out of range is a no-op', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))

    e.setFixtureName('f')
    e.setChannels([{ label: 'Dimmer', active: true }])
    e.setChannelValue(99, 0.5)  // out of range — no crash, no effect
    e.emit()

    const pkt = decodePacket(sent[0])
    expect(pkt.state['f_Dimmer']).toBeCloseTo(0)
  })

  it('setChannels preserves existing values by index', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))

    e.setFixtureName('f')
    e.setChannels([{ label: 'Red', active: true }])
    e.setChannelValue(0, 0.6)

    // Apply new preset — index 0 still present, value preserved
    e.setChannels([{ label: 'Dimmer', active: true }])
    e.emit()

    const pkt = decodePacket(sent[0])
    expect(pkt.state['f_Dimmer']).toBeCloseTo(0.6)
  })

  it('resetSession clears channels and changes session id', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))

    e.setFixtureName('f')
    e.setChannels([{ label: 'Red', active: true }])
    e.setChannelValue(0, 0.9)
    e.emit()

    e.resetSession()
    e.emit()

    expect(sent).toHaveLength(2)
    const pkt1 = decodePacket(sent[0])
    const pkt2 = decodePacket(sent[1])
    expect(pkt1.session_id).not.toBe(pkt2.session_id)
    expect(Object.keys(pkt2.state)).toHaveLength(0)
  })

  it('emitted bytes are all valid uint8 values', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))
    e.emit()
    expect(sent[0].every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true)
  })
})
```

**Step 2: Run the tests to verify they fail**

```bash
pnpm --filter device-scripts test
```

Expected: multiple FAIL — `setFixtureName is not a function`, `setChannels is not a function`, `setChannelValue is not a function`.

**Step 3: Rewrite `device/scripts/src/lib/emitter.ts`**

```typescript
// lib/emitter.ts — channel strip state serialiser for M4L UDP emission.
//
// Constraints:
//   - No async/await, no optional chaining (?.), no nullish coalescing (??)
//   - No direct Max globals — all Max runtime objects are injected as parameters
//   - Must compile to ES6 IIFE via esbuild (bundled; msgpack is bundled in)

import { encode } from '@msgpack/msgpack'

type SendFn = (bytes: number[]) => void

interface Channel {
  label: string
  active: boolean
  value: number
}

interface State {
  session_id: string
  fixtureName: string
  channels: Channel[]
}

function generateSessionId(): string {
  // UUID v4 via Math.random — no crypto in Max's SpiderMonkey
  let s = ''
  for (let i = 0; i < 32; i++) {
    const r = Math.floor(Math.random() * 16)
    if (i === 8 || i === 12 || i === 16 || i === 20) s += '-'
    if (i === 12) {
      s += '4'
    } else if (i === 16) {
      s += (r & 0x3 | 0x8).toString(16)
    } else {
      s += r.toString(16)
    }
  }
  return s
}

export function createEmitter(send: SendFn) {
  const state: State = {
    session_id: generateSessionId(),
    fixtureName: 'fixture',
    channels: [],
  }

  return {
    // Set the fixture name prefix (derived from the Live track name).
    setFixtureName: function(name: string): void {
      state.fixtureName = name
    },

    // Replace the channel configuration. Active/label per slot.
    // Existing values are preserved by index so a preset change doesn't reset dials to 0.
    setChannels: function(channels: Array<{ label: string; active: boolean }>): void {
      const prev = state.channels
      state.channels = channels.map(function(ch, i) {
        const prevValue = (i < prev.length) ? prev[i].value : 0
        return { label: ch.label, active: ch.active, value: prevValue }
      })
    },

    // Update the value for one channel slot (0-indexed). Out-of-range is a no-op.
    setChannelValue: function(index: number, value: number): void {
      if (index >= 0 && index < state.channels.length) {
        state.channels[index].value = value
      }
    },

    // Reset session ID and clear channels (call when track layout changes).
    resetSession: function(): void {
      state.session_id = generateSessionId()
      state.channels = []
    },

    // Emit current state — only active channels, keyed as {fixtureName}_{label}.
    emit: function(): void {
      const params: Record<string, number> = {}
      for (let i = 0; i < state.channels.length; i++) {
        const ch = state.channels[i]
        if (ch.active) {
          params[state.fixtureName + '_' + ch.label] = ch.value
        }
      }
      const pkt = {
        session_id: state.session_id,
        ts: Date.now(),
        state: params,
      }
      const encoded = encode(pkt)
      const bytes: number[] = []
      for (let i = 0; i < encoded.length; i++) {
        bytes[i] = encoded[i]
      }
      send(bytes)
    },
  }
}
```

**Step 4: Run the tests to verify they pass**

```bash
pnpm --filter device-scripts test
```

Expected: all tests PASS, 0 failures.

**Step 5: Commit**

```bash
git add device/scripts/src/lib/emitter.ts device/scripts/src/lib/emitter.test.ts
git commit -m "feat(m4l): channel strip API — setFixtureName, setChannels, setChannelValue"
```

---

### Task 2: Rewrite `main.ts` — channel strip orchestrator

**Files:**
- Modify: `device/scripts/src/main.ts`

`main.ts` is not unit-tested (depends on Max globals). Verification is: `pnpm --filter device-scripts build` succeeds with no TypeScript errors.

The new `main.ts`:
- Defines `PRESETS` — 4 baked-in fixture configurations, each specifying active/label per channel slot (padded to 16 slots)
- Handles 17 inlets: inlet 0 = preset index (integer from `live.menu`), inlets 1–16 = dial values (float 0.0–1.0 from `live.dial`)
- `lomTask` reads the track name via LiveAPI and calls `setFixtureName` — much lighter than the old full-LOM traversal
- `emitTask` unchanged — calls `emitter.emit()`

**Step 1: Replace `device/scripts/src/main.ts`**

```typescript
// main.ts — M4L channel strip emitter.
//
// Architecture:
//   - 16 live.dial objects in the patch (always present, visibility managed by thispatcher)
//   - Inlet 0: preset index from live.menu (int)
//   - Inlets 1–16: dial values (float 0.0–1.0) for channel slots 1–16
//   - lomTask (40ms): reads track name → emitter.setFixtureName()
//   - emitTask (40ms, +20ms offset): calls emitter.emit()
//
// Split-tick pattern preserved: LOM read and emit run on separate 40ms tasks
// offset by 20ms so each tick does exactly one thing.
//
// Constraints: no async/await, no ?., no ??. Use var in all function bodies.

// ─── Max globals ─────────────────────────────────────────────────────────────

declare var Task: new (fn: () => void) => {
  interval: number
  delay: number
  start(): void
}
declare var LiveAPI: new (callback: ((args: string[]) => void) | null, path: string) => {
  get(prop: string): unknown[]
}
declare var inlets: number
declare var outlets: number
declare var inlet: number
declare function outlet(n: number, ...args: unknown[]): void
declare function post(...args: unknown[]): void

import { createEmitter } from './lib/emitter'

// ─── Presets ──────────────────────────────────────────────────────────────────
//
// Each preset defines which of the 16 channel slots are active and what label
// they carry. Slots beyond the preset's channel count are marked inactive.
// Labels are from the well-known set: Dimmer, Red, Green, Blue, White, Pan,
// Tilt, Strobe, Gobo, Zoom, Focus, Color, Speed, Mode.
//
// Adding a new fixture type = adding an entry here + a new release.

interface PresetChannel {
  label: string
  active: boolean
}

interface Preset {
  name: string
  channels: PresetChannel[]  // always 16 entries
}

function padChannels(active: Array<{ label: string }>): PresetChannel[] {
  var result: PresetChannel[] = []
  for (var i = 0; i < 16; i++) {
    if (i < active.length) {
      result.push({ label: active[i].label, active: true })
    } else {
      result.push({ label: 'ch' + (i + 1), active: false })
    }
  }
  return result
}

var PRESETS: Preset[] = [
  {
    name: 'Single Dimmer',
    channels: padChannels([
      { label: 'Dimmer' },
    ]),
  },
  {
    name: '4ch RGBW Par',
    channels: padChannels([
      { label: 'Red' },
      { label: 'Green' },
      { label: 'Blue' },
      { label: 'White' },
    ]),
  },
  {
    name: '6ch PAR',
    channels: padChannels([
      { label: 'Dimmer' },
      { label: 'Red' },
      { label: 'Green' },
      { label: 'Blue' },
      { label: 'Strobe' },
      { label: 'Mode' },
    ]),
  },
  {
    name: 'Moving Head Basic',
    channels: padChannels([
      { label: 'Pan' },
      { label: 'Tilt' },
      { label: 'Dimmer' },
      { label: 'Color' },
      { label: 'Gobo' },
      { label: 'Speed' },
    ]),
  },
]

// ─── Setup ───────────────────────────────────────────────────────────────────

inlets = 17   // 0 = preset selector, 1–16 = dial values
outlets = 1   // outlet 0 → [udpsend]

function udpSend(bytes: number[]): void {
  outlet(0, bytes)
}

var emitter = createEmitter(udpSend)

// Apply the first preset on load.
applyPreset(0)

// ─── Preset application ───────────────────────────────────────────────────────

function applyPreset(idx: number): void {
  if (idx < 0 || idx >= PRESETS.length) {
    post('Penumbra: preset index out of range:', idx, '\n')
    return
  }
  var preset = PRESETS[idx]
  emitter.setChannels(preset.channels)
  post('Penumbra: preset applied —', preset.name, '\n')

  // TODO (Max patch work): send thispatcher messages to show/hide live.dial objects.
  // Example for slot 0 (requires a named [send] in the patch wired to dial1's [hidden] inlet):
  //   messnamed('dial1_visibility', preset.channels[0].active ? 0 : 1)
  // All 16 dials remain visible in the PoC patch — this is deferred.
}

// ─── Inlet handlers ──────────────────────────────────────────────────────────
//
// inlet 0  — preset index from live.menu (integer, 0-indexed)
// inlets 1–16 — float values (0.0–1.0) from live.dial objects

function msg_int(v: number): void {
  if (inlet === 0) {
    applyPreset(v)
  } else {
    emitter.setChannelValue(inlet - 1, v / 127)  // MIDI range → 0.0–1.0
  }
}

function msg_float(v: number): void {
  if (inlet > 0) {
    emitter.setChannelValue(inlet - 1, v)  // live.dial already outputs 0.0–1.0
  }
}

// ─── Track-change observer ────────────────────────────────────────────────────
// Resets session ID when tracks are added or deleted.

var liveSet = new LiveAPI(function(args) {
  if (args[0] === 'tracks') {
    emitter.resetSession()
    post('Penumbra: track change — session reset\n')
  }
}, 'live_set')

// ─── LOM read (track name only) ──────────────────────────────────────────────
//
// Reads this device's parent track name and sets it as the fixture prefix.
// Called every lomTask tick (40ms) to pick up renames.
// Much lighter than the old full-LOM traversal — no mixer scraping.

function readTrackName(): void {
  try {
    var device = new LiveAPI(null, 'this_device')
    var canonicalParent = device.get('canonical_parent')
    // canonical_parent returns ['id', <id_number>] — navigate by id
    var parentId = canonicalParent[1] as string
    var track = new LiveAPI(null, 'id ' + parentId)
    var rawName = track.get('name')[0] as string
    var safeName = rawName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
    emitter.setFixtureName(safeName)
  } catch (e) {
    post('Penumbra: error reading track name:', e, '\n')
  }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────
// Split-tick: lomTask reads track name, emitTask sends UDP, offset by 20ms.

var lomTask = new Task(readTrackName)
lomTask.interval = 40

var emitTask = new Task(function() {
  emitter.emit()
})
emitTask.interval = 40
emitTask.delay = 20

lomTask.start()
emitTask.start()

post('Penumbra M4L channel strip emitter started\n')
```

**Step 2: Build to verify no TypeScript errors**

```bash
pnpm --filter device-scripts build
```

Expected: exits 0, produces `device/scripts/dist/main.js` with no errors.

If TypeScript complains about `msg_int` or `msg_float` being declared but not called (they are called by Max's runtime, not by JS): that's fine — these are Max message handlers invoked externally. Ignore any "declared but never read" warnings for Max globals.

**Step 3: Confirm lib tests still pass**

```bash
pnpm --filter device-scripts test
```

Expected: all PASS (`main.ts` has no unit tests; only `lib/emitter.ts` is tested).

**Step 4: Commit**

```bash
git add device/scripts/src/main.ts
git commit -m "feat(m4l): rewrite main.ts as channel strip — presets, inlet handlers, track name from LOM"
```

---

### Task 3: Update fake emitter and config.json to fixture label naming

**Files:**
- Modify: `tools/fake-emitter/main.go` (lines 43–49)
- Modify: `server/config.json`

The fake emitter's `defaultParameters` and `config.json` must use the same label casing as the PRESETS in `main.ts`. This task updates both so running `task fake` shows the new parameter names in the server monitor.

**Step 1: Update `defaultParameters` in `tools/fake-emitter/main.go`**

Find the `defaultParameters` slice (around line 43) and replace it:

```go
// defaultParameters simulates two 6ch PAR fixtures.
// Names match the M4L channel strip output: {track_name}_{Label}
// Labels are Title Case to match the well-known preset label list.
var defaultParameters = []string{
	"track1_Dimmer", "track1_Red", "track1_Green", "track1_Blue", "track1_Strobe", "track1_Mode",
	"track2_Dimmer", "track2_Red", "track2_Green", "track2_Blue", "track2_Strobe", "track2_Mode",
}
```

**Step 2: Update `server/config.json`**

Replace the file contents with the new parameter names. Two fixtures, each a 6ch PAR on separate universes:

```json
{
  "universes": {
    "1": {
      "device_ip": "192.168.1.101",
      "label": "stage left"
    },
    "2": {
      "device_ip": "192.168.1.102",
      "label": "stage right"
    }
  },
  "parameters": {
    "track1_Dimmer": [{ "universe": 1, "channel": 1 }],
    "track1_Red":    [{ "universe": 1, "channel": 2 }],
    "track1_Green":  [{ "universe": 1, "channel": 3 }],
    "track1_Blue":   [{ "universe": 1, "channel": 4 }],
    "track1_Strobe": [{ "universe": 1, "channel": 5 }],
    "track1_Mode":   [{ "universe": 1, "channel": 6 }],
    "track2_Dimmer": [{ "universe": 2, "channel": 1 }],
    "track2_Red":    [{ "universe": 2, "channel": 2 }],
    "track2_Green":  [{ "universe": 2, "channel": 3 }],
    "track2_Blue":   [{ "universe": 2, "channel": 4 }],
    "track2_Strobe": [{ "universe": 2, "channel": 5 }],
    "track2_Mode":   [{ "universe": 2, "channel": 6 }]
  }
}
```

**Step 3: Build the fake emitter**

```bash
cd tools/fake-emitter && /usr/local/go/bin/go build . && cd ../..
```

Expected: exits 0, no errors.

**Step 4: Run Go vet on the server**

```bash
cd server && /usr/local/go/bin/go vet ./... && cd ..
```

Expected: no output (vet is silent on success).

**Step 5: Smoke test — verify the server sees the new names**

Terminal 1:
```bash
cd server && /usr/local/go/bin/go run .
```

Terminal 2:
```bash
cd tools/fake-emitter && /usr/local/go/bin/go run . --mode static
```

Open `http://localhost:3000` in a browser. The monitor should show parameters named `track1_Dimmer`, `track1_Red`, `track1_Green`, `track1_Blue`, `track1_Strobe`, `track1_Mode` (and track2). Verify DMX channel values are non-zero (static mode sends 0.5 → 128). Kill both processes with Ctrl+C.

**Step 6: Commit**

```bash
git add tools/fake-emitter/main.go server/config.json
git commit -m "feat: update fake emitter and config.json to fixture label naming convention"
```

---

## End state

After these three tasks, the PoC is complete:

- `lib/emitter.ts` exposes `setFixtureName`, `setChannels`, `setChannelValue`, `resetSession`, `emit` — fully tested
- `main.ts` has 4 baked-in presets, handles inlet messages from dials and a preset selector
- Fake emitter emits `track1_Dimmer`, `track1_Red`, etc. matching the M4L output convention
- `config.json` wires those parameters to real DMX channels in universes 1 and 2
- The full stack (fake emitter → server → E1.31) works end-to-end with the new naming

**Not in scope for this PoC (deferred):**
- Max patch changes: adding `live.dial` objects, `live.menu` for presets, `thispatcher` show/hide wiring — requires manual work in the Max editor
- Server-side fixture profiles or `FixtureInstance` struct — not needed; the existing `parameters` map handles label-named keys
- PWA fixture wizard / sequential auto-assign tooling
- Free-text label entry in M4L (presets-only for PoC)
- MIDI note → scene trigger (separate issue)
