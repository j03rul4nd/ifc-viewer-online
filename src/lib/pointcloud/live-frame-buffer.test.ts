import { describe, expect, it } from 'vitest'
import type { DynamicPointFrame } from './pc-types'
import { BoundedLiveFrameBuffer } from './live-frame-buffer'
import { encodeLivePointFrameInto, encodedLivePointFrameByteLength } from './live-point-frame'

function packet(sequence: number): Uint8Array {
  const frame: DynamicPointFrame = {
    sequence,
    timestampMs: sequence * 100,
    count: 1,
    origin: { x: 0, y: 0, z: 0 },
    radius: 1,
    positions: new Float32Array([sequence, 0, 0]),
    colors: null,
    intensity: null,
    classification: null,
    confidence: null,
  }
  const bytes = new Uint8Array(encodedLivePointFrameByteLength(1))
  encodeLivePointFrameInto(frame, bytes)
  return bytes
}

describe('BoundedLiveFrameBuffer', () => {
  it('uses at most three slots and applies newest-frame-wins backpressure', () => {
    const ring = new BoundedLiveFrameBuffer(3, 1)
    ring.push(packet(1))
    ring.push(packet(2))
    ring.push(packet(3))
    ring.push(packet(4))
    let displayed = 0
    ring.consumeLatest((frame) => { displayed = frame.sequence })

    expect(displayed).toBe(4)
    expect(ring.snapshot()).toMatchObject({
      capacity: 3, maxDepth: 3, displayed: 1, overflowDropped: 1, superseded: 2,
    })
  })

  it('counts reordered and late packets without moving backwards', () => {
    const ring = new BoundedLiveFrameBuffer(3, 1)
    ring.push(packet(2))
    ring.push(packet(1))
    let displayed = 0
    ring.consumeLatest((frame) => { displayed = frame.sequence })
    expect(displayed).toBe(2)
    expect(ring.snapshot().reordered).toBe(1)
    expect(ring.push(packet(1))).toBe(false)
    expect(ring.snapshot().lateDropped).toBe(1)
  })

  it('contains malformed packets instead of throwing', () => {
    const ring = new BoundedLiveFrameBuffer(3, 1)
    expect(ring.push(new Uint8Array([1, 2, 3]))).toBe(false)
    expect(ring.snapshot()).toMatchObject({ invalid: 1, lastError: 'packet-too-small' })
  })
})
