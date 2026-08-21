import { describe, expect, it } from 'vitest'
import type { DynamicPointFrame } from './pc-types'
import { SimulatedLiveTransport } from './simulated-live-transport'

function frame(sequence: number): DynamicPointFrame {
  return {
    sequence,
    timestampMs: sequence * 80,
    count: 1,
    origin: { x: 0, y: 0, z: 0 },
    radius: 1,
    positions: new Float32Array([sequence, 0, 0]),
    colors: new Uint8Array([1, 2, 3]),
    intensity: new Uint8Array([4]),
    classification: new Uint8Array([5]),
    confidence: null,
  }
}

describe('SimulatedLiveTransport', () => {
  it('exercises loss, checksum validation, reorder and reconnect deterministically', () => {
    const transport = new SimulatedLiveTransport(1)
    transport.setMode('unstable')
    const displayed: number[] = []
    for (let sequence = 1; sequence <= 120; sequence++) {
      transport.transmit(frame(sequence), (decoded) => displayed.push(decoded.sequence))
    }
    const stats = transport.snapshot()
    expect(displayed.length).toBeGreaterThan(70)
    expect(stats.linkDropped).toBeGreaterThan(0)
    expect(stats.reconnects).toBe(1)
    expect(stats.buffer.reordered).toBeGreaterThan(0)
    expect(stats.buffer.invalid).toBeGreaterThan(0)
    expect(displayed.every((value, index) => index === 0 || value > displayed[index - 1])).toBe(true)
  })
})
