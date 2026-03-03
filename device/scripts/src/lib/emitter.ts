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
