import { describe, expect, it } from 'vitest'
import type { DynamicPointFrame } from './pc-types'
import {
  createLivePointFrameSlot, decodeLivePointFrameInto, encodeLivePointFrameInto,
  encodedLivePointFrameByteLength, inspectLivePointFrameHeader,
} from './live-point-frame'

function exampleFrame(sequence = 7): DynamicPointFrame {
  return {
    sequence,
    timestampMs: 1234.5,
    count: 2,
    origin: { x: 10, y: 20, z: 30 },
    radius: 5,
    bounds: { min: { x: -1, y: -2, z: -3 }, max: { x: 4, y: 5, z: 6 } },
    positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    colors: new Uint8Array([10, 20, 30, 40, 50, 60]),
    intensity: new Uint8Array([70, 80]),
    classification: new Uint8Array([2, 6]),
    confidence: null,
  }
}

describe('live point frame binary contract', () => {
  it('round-trips a frame into reusable decode storage', () => {
    const frame = exampleFrame()
    const packet = new Uint8Array(encodedLivePointFrameByteLength(frame.count))
    const length = encodeLivePointFrameInto(frame, packet)
    const header = inspectLivePointFrameHeader(packet)
    const decoded = decodeLivePointFrameInto(packet, createLivePointFrameSlot(2))

    expect(length).toBe(packet.byteLength)
    expect(header).toMatchObject({ sequence: 7, timestampMs: 1234.5, pointCount: 2 })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.frame.positions.slice(0, 6)).toEqual(frame.positions)
    expect(decoded.frame.colors?.slice(0, 6)).toEqual(frame.colors)
    expect(decoded.frame.intensity?.slice(0, 2)).toEqual(frame.intensity)
    expect(decoded.frame.classification?.slice(0, 2)).toEqual(frame.classification)
    expect(decoded.frame.confidence).toBeNull()
    expect(decoded.frame.bounds).toEqual(frame.bounds)
  })

  it('rejects corruption and capacity overruns before a frame is displayed', () => {
    const frame = exampleFrame()
    const packet = new Uint8Array(encodedLivePointFrameByteLength(frame.count))
    encodeLivePointFrameInto(frame, packet)
    packet[packet.length - 1] ^= 0x01
    expect(decodeLivePointFrameInto(packet, createLivePointFrameSlot(2))).toEqual({
      ok: false, code: 'checksum-mismatch',
    })

    encodeLivePointFrameInto(frame, packet)
    expect(decodeLivePointFrameInto(packet, createLivePointFrameSlot(1))).toEqual({
      ok: false, code: 'too-many-points',
    })
  })

  it('rejects non-finite positions even when the checksum is otherwise valid', () => {
    const frame = exampleFrame()
    frame.positions[0] = Number.NaN
    const packet = new Uint8Array(encodedLivePointFrameByteLength(frame.count))
    encodeLivePointFrameInto(frame, packet)
    expect(decodeLivePointFrameInto(packet, createLivePointFrameSlot(2))).toEqual({
      ok: false, code: 'invalid-position',
    })
  })
})
