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

// ─── LOM read ────────────────────────────────────────────────────────────────

function readLOM(): void {
  try {
    var api = new LiveAPI(null, 'live_set')
    var trackCount = api.getcount('tracks')
    for (var i = 0; i < trackCount; i++) {
      api.goto('live_set tracks ' + i)
      var trackName = api.get('name')[0] as string
      var safeName = trackName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()

      // Read volume from mixer_device
      var mixerPath = 'live_set tracks ' + i + ' mixer_device'
      var mixer = new LiveAPI(null, mixerPath)
      var vol = mixer.get('volume')[0] as number
      emitter.setParam(safeName + '_volume', vol)

      // Read send levels
      var sendCount = mixer.getcount('sends')
      for (var s = 0; s < sendCount; s++) {
        var sendPath = mixerPath + ' sends ' + s
        var send = new LiveAPI(null, sendPath)
        var sendVal = send.get('value')[0] as number
        emitter.setParam(safeName + '_send_' + s, sendVal)
      }
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
