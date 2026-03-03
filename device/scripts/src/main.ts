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
declare var autowatch: number
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

autowatch = 1
inlets = 17   // 0 = preset selector, 1–16 = dial values
outlets = 1   // outlet 0 → [udpsend]

function udpSend(bytes: number[]): void {
  outlet(0, bytes)
}

var emitter = createEmitter(udpSend)

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
    // live.dial outputs floats on inlets 1-16; an int here is unexpected.
    post('Penumbra: unexpected int on dial inlet', inlet, '— ignoring\n')
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

// Apply initial preset after all setup is complete.
applyPreset(0)

post('Penumbra M4L channel strip emitter started\n')
