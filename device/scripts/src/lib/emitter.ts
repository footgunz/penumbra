// lib/emitter.ts — state serialiser for M4L UDP emission.
//
// Constraints:
//   - No async/await, no optional chaining (?.), no nullish coalescing (??)
//   - No direct Max globals — all Max runtime objects are injected as parameters
//   - Must compile to ES6 IIFE via esbuild (bundled; msgpack is bundled in)
//
// The emitter runs inside Max's `js` object. UDP is sent via outlet(0, byteArray)
// where byteArray is a plain JS array of integers. The Max patch connects that outlet
// to a [udpsend] object configured with the target host:port.

import { encode } from '@msgpack/msgpack'

// Injected by main.ts — never imported from Max here
type SendFn = (bytes: number[]) => void

interface State {
  session_id: string
  params: Record<string, number>
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
    params: {},
  }

  return {
    setParam: function(name: string, value: number): void {
      state.params[name] = value
    },

    resetSession: function(): void {
      state.session_id = generateSessionId()
      state.params = {}
    },

    emit: function(): void {
      const pkt = {
        session_id: state.session_id,
        ts: Date.now(),
        state: state.params,
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
