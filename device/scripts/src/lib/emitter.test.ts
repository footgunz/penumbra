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
