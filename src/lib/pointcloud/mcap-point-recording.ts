// ─── mcap-point-recording ────────────────────────────────────────────────────
// MCAP is the indexed robotics container; LivePointFrame is our payload. This
// adapter deliberately keeps them separate so the renderer is identical for a
// local recording and a future gateway stream.

import type { IWritable, McapIndexedReader as McapIndexedReaderType } from '@mcap/core'
import type { DynamicPointFrame, SourceFrame } from './pc-types'
import {
  LivePointFrameFlags, createLivePointFrameSlot, decodeLivePointFrameInto,
  encodeLivePointFrameInto, encodedLivePointFrameByteLength, inspectLivePointFrameHeader,
} from './live-point-frame'

export const IFCVIEWER_MCAP_PROFILE = 'ifcviewer.pointcloud.v1'
export const IFCVIEWER_MCAP_TOPIC = '/ifcviewer/points'
export const IFCVIEWER_MCAP_MESSAGE_ENCODING = 'ifcviewer.point-frame.v1'
export const IFCVIEWER_MCAP_SCHEMA_NAME = 'ifcviewer.LivePointFrame'

const SCHEMA_DESCRIPTION = JSON.stringify({
  title: IFCVIEWER_MCAP_SCHEMA_NAME,
  version: 1,
  mediaType: 'application/x-ifcviewer-point-frame',
  byteOrder: 'little-endian',
  documentation: 'docs/REALTIME_LIDAR_VIDEO.md#binary-frame-contract',
})

export type McapPointRecordingErrorCode =
  | 'not-indexed-mcap'
  | 'no-point-channel'
  | 'empty-point-channel'
  | 'invalid-point-packet'
  | 'non-monotonic-sequence'
  | 'point-budget-exceeded'

export class McapPointRecordingError extends Error {
  constructor(readonly code: McapPointRecordingErrorCode, message: string) {
    super(message)
    this.name = 'McapPointRecordingError'
  }
}

export interface McapPointRecordingInfo {
  topic: string
  messageCount: number
  durationMs: number
  maxPointCount: number
  sourceFrame: SourceFrame
  attributes: {
    color: boolean
    intensity: boolean
    classification: boolean
    confidence: boolean
  }
}

export interface McapPointPacket {
  packet: Uint8Array
  positionMs: number
  sequence: number
}

/**
 * An indexed, bounded-memory recording. McapIndexedReader retains indexes, not
 * all message payloads; packets are yielded one at a time from their chunks.
 */
export class McapPointRecording {
  private constructor(
    private readonly reader: McapIndexedReaderType,
    private readonly channelId: number,
    private readonly firstLogTime: bigint,
    readonly info: McapPointRecordingInfo,
  ) {}

  static async open(blob: Blob, maxPoints = 2_000_000): Promise<McapPointRecording> {
    const [{ BlobReadable }, { McapIndexedReader }] = await Promise.all([
      import('@mcap/browser'),
      import('@mcap/core'),
    ])
    const readable = new BlobReadable(blob)
    let reader: McapIndexedReaderType
    try {
      reader = await McapIndexedReader.Initialize({ readable, messageIndexCacheSizeBytes: 0 })
    } catch (error) {
      throw new McapPointRecordingError('not-indexed-mcap', error instanceof Error ? error.message : String(error))
    }

    // Load the official WASM handlers only when the file actually needs one;
    // our uncompressed exhibition fixture does not pay that bundle/runtime cost.
    if (reader.chunkIndexes.some((chunk) => chunk.compression !== '')) {
      const { loadDecompressHandlers } = await import('@mcap/support')
      reader = await McapIndexedReader.Initialize({
        readable,
        decompressHandlers: await loadDecompressHandlers(),
        messageIndexCacheSizeBytes: 0,
      })
    }

    const channel = [...reader.channelsById.values()].find((candidate) =>
      candidate.messageEncoding === IFCVIEWER_MCAP_MESSAGE_ENCODING)
    if (!channel) {
      throw new McapPointRecordingError(
        'no-point-channel',
        `No channel uses ${IFCVIEWER_MCAP_MESSAGE_ENCODING}`,
      )
    }

    let messageCount = 0
    let maxPointCount = 0
    let firstLogTime = 0n
    let lastLogTime = 0n
    let lastSequence = -1
    let attributeFlags = 0
    let firstPacket: Uint8Array | null = null
    for await (const message of reader.readMessages({ topics: [channel.topic], validateCrcs: true })) {
      if (message.channelId !== channel.id) continue
      const header = inspectLivePointFrameHeader(message.data)
      if (!header) {
        throw new McapPointRecordingError('invalid-point-packet', `Frame ${message.sequence} has an invalid binary header`)
      }
      if (header.pointCount > maxPoints) {
        throw new McapPointRecordingError(
          'point-budget-exceeded',
          `Frame ${header.sequence} has ${header.pointCount} points; budget is ${maxPoints}`,
        )
      }
      if (header.sequence <= lastSequence) {
        throw new McapPointRecordingError(
          'non-monotonic-sequence',
          `Frame sequence ${header.sequence} follows ${lastSequence}`,
        )
      }
      if (messageCount === 0) {
        firstLogTime = message.logTime
        firstPacket = message.data.slice()
      }
      lastLogTime = message.logTime
      lastSequence = header.sequence
      maxPointCount = Math.max(maxPointCount, header.pointCount)
      attributeFlags |= header.flags
      messageCount++
    }
    if (messageCount === 0 || !firstPacket) {
      throw new McapPointRecordingError('empty-point-channel', 'The point channel contains no frames')
    }

    const firstSlot = createLivePointFrameSlot(maxPointCount)
    const decoded = decodeLivePointFrameInto(firstPacket, firstSlot)
    if (!decoded.ok) {
      throw new McapPointRecordingError('invalid-point-packet', `First frame failed validation: ${decoded.code}`)
    }
    const bounds = decoded.frame.bounds ?? {
      min: {
        x: decoded.frame.origin.x - decoded.frame.radius,
        y: decoded.frame.origin.y - decoded.frame.radius,
        z: decoded.frame.origin.z - decoded.frame.radius,
      },
      max: {
        x: decoded.frame.origin.x + decoded.frame.radius,
        y: decoded.frame.origin.y + decoded.frame.radius,
        z: decoded.frame.origin.z + decoded.frame.radius,
      },
    }
    return new McapPointRecording(reader, channel.id, firstLogTime, {
      topic: channel.topic,
      messageCount,
      durationMs: Number(lastLogTime - firstLogTime) / 1_000_000,
      maxPointCount,
      sourceFrame: {
        unitScale: 1,
        unitSource: 'assumed',
        epsgCode: null,
        upAxis: 'y',
        upAxisSource: 'assumed',
        min: { ...bounds.min },
        max: { ...bounds.max },
        origin: { ...decoded.frame.origin },
      },
      attributes: {
        color: Boolean(attributeFlags & LivePointFrameFlags.Color),
        intensity: Boolean(attributeFlags & LivePointFrameFlags.Intensity),
        classification: Boolean(attributeFlags & LivePointFrameFlags.Classification),
        confidence: Boolean(attributeFlags & LivePointFrameFlags.Confidence),
      },
    })
  }

  async *packets(startPositionMs = 0, signal?: AbortSignal): AsyncGenerator<McapPointPacket> {
    const safeStartMs = Math.min(this.info.durationMs, Math.max(0, startPositionMs))
    const startTime = this.firstLogTime + BigInt(Math.round(safeStartMs * 1_000_000))
    for await (const message of this.reader.readMessages({
      topics: [this.info.topic], startTime, validateCrcs: true,
    })) {
      if (signal?.aborted) return
      if (message.channelId !== this.channelId) continue
      const header = inspectLivePointFrameHeader(message.data)
      if (!header) continue // Preflight was strict; protects against a mutated Blob implementation.
      yield {
        packet: message.data,
        positionMs: Number(message.logTime - this.firstLogTime) / 1_000_000,
        sequence: header.sequence,
      }
    }
  }
}

class BlobPartsWriter implements IWritable {
  private readonly parts: Uint8Array[] = []
  private length = 0

  async write(buffer: Uint8Array): Promise<void> {
    this.parts.push(buffer.slice())
    this.length += buffer.byteLength
  }

  position(): bigint {
    return BigInt(this.length)
  }

  toBlob(): Blob {
    return new Blob(this.parts, { type: 'application/octet-stream' })
  }
}

/** Build a finite, indexed MCAP example for download or round-trip tests. */
export async function createMcapPointRecordingBlob(
  frames: Iterable<DynamicPointFrame>,
  options: { topic?: string; library?: string } = {},
): Promise<Blob> {
  const { McapWriter } = await import('@mcap/core')
  const output = new BlobPartsWriter()
  const writer = new McapWriter({ writable: output, chunkSize: 512 * 1024 })
  await writer.start({ profile: IFCVIEWER_MCAP_PROFILE, library: options.library ?? 'IFC Viewer Online' })
  const schemaId = await writer.registerSchema({
    name: IFCVIEWER_MCAP_SCHEMA_NAME,
    encoding: 'ifcviewer-binary-schema-v1',
    data: new TextEncoder().encode(SCHEMA_DESCRIPTION),
  })
  const channelId = await writer.registerChannel({
    schemaId,
    topic: options.topic ?? IFCVIEWER_MCAP_TOPIC,
    messageEncoding: IFCVIEWER_MCAP_MESSAGE_ENCODING,
    metadata: new Map([
      ['payload', IFCVIEWER_MCAP_SCHEMA_NAME],
      ['coordinate_frame', 'local-y-up-metres'],
    ]),
  })

  let previousSequence = -1
  let previousTimestamp = -Infinity
  for (const frame of frames) {
    if (frame.sequence <= previousSequence || frame.timestampMs < previousTimestamp) {
      throw new RangeError('MCAP point frames must have increasing sequence and non-decreasing time')
    }
    const packet = new Uint8Array(encodedLivePointFrameByteLength(frame.count))
    encodeLivePointFrameInto(frame, packet)
    const logTime = BigInt(Math.max(0, Math.round(frame.timestampMs * 1_000_000)))
    await writer.addMessage({
      channelId,
      sequence: frame.sequence,
      logTime,
      publishTime: logTime,
      data: packet,
    })
    previousSequence = frame.sequence
    previousTimestamp = frame.timestampMs
  }
  await writer.end()
  return output.toBlob()
}
