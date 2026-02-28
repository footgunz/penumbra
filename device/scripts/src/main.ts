// main.ts — Max entry point for M4L UDP state emitter.
//
// Constraints:
//   - No async/await, no optional chaining (?.), no nullish coalescing (??)
//   - Max globals (Task, LiveAPI, outlet, post) accessed directly — they are
//     provided by the Max runtime and are NOT imported.
//   - All library code lives in lib/ and receives Max globals via injection.
//
// Architecture: two Tasks at 40ms interval, offset by 20ms (split-tick pattern).
//   lomTask  → reads Live Object Model on even ticks
//   emitTask → serialises and sends via UDP on odd ticks
//
// outlet 0 receives byte-array UDP payload, wired to [udpsend] in device.maxpat.

// Max globals — declared to satisfy TypeScript; provided by the Max runtime.
declare var Task: new (fn: () => void) => {
  interval: number
  delay: number
  start(): void
}
declare var LiveAPI: new (callback: ((args: string[]) => void) | null, path: string) => {
  path: string
  id: string
  get(prop: string): unknown[]
  getcount(prop: string): number
  goto(path: string): void
}
declare function outlet(n: number, ...args: unknown[]): void
declare function post(...args: unknown[]): void

import { createEmitter } from './lib/emitter'

// Wired to [udpsend] in device.maxpat, pre-configured with target host:port
function udpSend(bytes: number[]): void {
  outlet(0, bytes)
}

var emitter = createEmitter(udpSend)

// ─── Track-change observer ────────────────────────────────────────────────────
// Resets the session ID whenever tracks are added or deleted so the server
// knows to discard accumulated state from the previous session layout.

var liveSet = new LiveAPI(function(args) {
  if (args[0] === 'tracks') {
    emitter.resetSession()
    post('Penumbra: track change detected — session reset\n')
  }
}, 'live_set')

// ─── LOM read ────────────────────────────────────────────────────────────────
//
// mixer_device.volume, .panning, and .sends[n] are DeviceParameter child
// objects. Calling get('volume') on the mixer returns the parameter's id, not
// its value. Navigate to the DeviceParameter path and read 'value', 'min',
// 'max' separately, then normalise to 0.0–1.0.

function normParam(paramPath: string): number {
  var p = new LiveAPI(null, paramPath)
  var val = p.get('value')[0] as number
  var min = p.get('min')[0] as number
  var max = p.get('max')[0] as number
  if (max <= min) { return 0 }
  var n = (val - min) / (max - min)
  if (n < 0) { return 0 }
  if (n > 1) { return 1 }
  return n
}

function readTrackParams(trackPath: string, namePrefix: string): void {
  var track = new LiveAPI(null, trackPath)
  var rawName = track.get('name')[0] as string
  var safeName = namePrefix + rawName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
  var mixerPath = trackPath + ' mixer_device'
  var mixer = new LiveAPI(null, mixerPath)

  emitter.setParam(safeName + '_volume', normParam(mixerPath + ' volume'))
  emitter.setParam(safeName + '_pan',    normParam(mixerPath + ' panning'))

  var sendCount = mixer.getcount('sends')
  for (var s = 0; s < sendCount; s++) {
    emitter.setParam(safeName + '_send_' + s, normParam(mixerPath + ' sends ' + s))
  }
}

function readLOM(): void {
  try {
    var root = new LiveAPI(null, 'live_set')

    var trackCount = root.getcount('tracks')
    for (var i = 0; i < trackCount; i++) {
      readTrackParams('live_set tracks ' + i, '')
    }

    var returnCount = root.getcount('return_tracks')
    for (var r = 0; r < returnCount; r++) {
      readTrackParams('live_set return_tracks ' + r, 'return_')
    }
  } catch (e) {
    post('M4L LOM read error:', e, '\n')
  }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

var lomTask = new Task(readLOM)
lomTask.interval = 40

var emitTask = new Task(function() {
  emitter.emit()
})
emitTask.interval = 40
emitTask.delay = 20

lomTask.start()
emitTask.start()

post('Penumbra M4L emitter started\n')
