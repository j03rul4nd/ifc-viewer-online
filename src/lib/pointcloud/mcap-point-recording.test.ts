import { describe, expect, it } from 'vitest'
import type { DynamicPointFrame } from './pc-types'
import { BoundedLiveFrameBuffer } from './live-frame-buffer'
import {
  McapPointRecording, McapPointRecordingError, createMcapPointRecordingBlob,
} from './mcap-point-recording'

function frame(sequence: number, timestampMs: number, count = 2): DynamicPointFrame {
  return {
    sequence,
    timestampMs,
    count,
    origin: { x: 0, y: 0, z: 0 },
    radius: 4,
    bounds: { min: { x: -4, y: -2, z: -3 }, max: { x: 4, y: 5, z: 3 } },
    positions: new Float32Array(Array.from({ length: count * 3 }, (_, index) => sequence + index)),
    colors: new Uint8Array(count * 3).fill(120),
    intensity: new Uint8Array(count).fill(80),
    classification: new Uint8Array(count).fill(6),
    confidence: null,
  }
}

describe('MCAP point recording adapter', () => {
  it('writes an indexed example and reads packets incrementally through the bounded ring', async () => {
    const blob = await createMcapPointRecordingBlob([
      frame(1, 0, 1), frame(2, 500, 2), frame(3, 1000, 3),
    ])
    const recording = await McapPointRecording.open(blob, 10)
    expect(recording.info).toMatchObject({ messageCount: 3, durationMs: 1000, maxPointCount: 3 })
    expect(recording.info.attributes).toEqual({
      color: true, intensity: true, classification: true, confidence: false,
    })

    const ring = new BoundedLiveFrameBuffer(3, recording.info.maxPointCount)
    const displayed: number[] = []
    for await (const { packet } of recording.packets()) {
      ring.push(packet)
      ring.consumeLatest((decoded) => displayed.push(decoded.sequence))
    }
    expect(displayed).toEqual([1, 2, 3])
    expect(ring.snapshot()).toMatchObject({ invalid: 0, displayed: 3, maxDepth: 1 })
  })

  it('supports indexed seek without retaining all frame payloads', async () => {
    const blob = await createMcapPointRecordingBlob([
      frame(1, 0), frame(2, 500), frame(3, 1000),
    ])
    const recording = await McapPointRecording.open(blob)
    const sequences: number[] = []
    for await (const item of recording.packets(500)) sequences.push(item.sequence)
    expect(sequences).toEqual([2, 3])
  })

  it('rejects a file without the application point-frame channel', async () => {
    await expect(McapPointRecording.open(new Blob([new Uint8Array([1, 2, 3])]))).rejects.toBeInstanceOf(
      McapPointRecordingError,
    )
  })
})
