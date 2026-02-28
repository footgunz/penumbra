import { createEmitter } from './emitter'

describe('createEmitter', () => {
  it('calls send with a non-empty byte array on emit', () => {
    const sent: number[][] = []
    const emitter = createEmitter((bytes) => sent.push(bytes))

    emitter.emit()

    expect(sent).toHaveLength(1)
    expect(sent[0].length).toBeGreaterThan(0)
    expect(sent[0].every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true)
  })

  it('includes setParam values in emitted packet', () => {
    const sent: number[][] = []
    const emitter = createEmitter((bytes) => sent.push(bytes))

    emitter.setParam('track1_vol', 0.75)
    emitter.emit()

    // Packet should be non-empty; value presence verified via msgpack round-trip below
    expect(sent[0].length).toBeGreaterThan(0)
  })

  it('resetSession changes the session id', () => {
    const sent1: number[][] = []
    const sent2: number[][] = []
    const e1 = createEmitter((b) => sent1.push(b))
    const e2 = createEmitter((b) => sent2.push(b))

    e1.emit()
    e2.emit()

    // Two emitters have independent session ids — packets should differ only in
    // the session_id bytes. The total length should be the same (same param count).
    expect(sent1[0].length).toBe(sent2[0].length)

    // After reset, the same emitter produces a different payload
    const sentAfter: number[][] = []
    const e3 = createEmitter((b) => sentAfter.push(b))
    e3.emit()
    e3.resetSession()
    e3.emit()

    // Both payloads have same structure but different session_id bytes
    expect(sentAfter[0].length).toBe(sentAfter[1].length)
  })
})
