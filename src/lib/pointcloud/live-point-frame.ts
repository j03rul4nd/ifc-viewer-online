// ─── live-point-frame ────────────────────────────────────────────────────────
// Small, application-owned wire contract for one temporal point-cloud frame.
// It is intentionally independent of WebSocket/WebTransport/MCAP: those are
// containers and transports, while this module is the validated payload shared
// by all of them.

import type { DynamicPointFrame } from './pc-types'

export const LIVE_POINT_FRAME_MAGIC = 0x46505649 // "IVPF" in little endian
export const LIVE_POINT_FRAME_VERSION = 1
export const LIVE_POINT_FRAME_HEADER_BYTES = 96
export const LIVE_POINT_FRAME_STRIDE = 18

export const enum LivePointFrameFlags {
  Color = 1 << 0,
  Intensity = 1 << 1,
  Classification = 1 << 2,
  Confidence = 1 << 3,
  Bounds = 1 << 4,
}

const KNOWN_FLAGS = LivePointFrameFlags.Color
  | LivePointFrameFlags.Intensity
  | LivePointFrameFlags.Classification
  | LivePointFrameFlags.Confidence
  | LivePointFrameFlags.Bounds

export type LivePointFrameErrorCode =
  | 'packet-too-small'
  | 'bad-magic'
  | 'unsupported-version'
  | 'bad-layout'
  | 'too-many-points'
  | 'length-mismatch'
  | 'checksum-mismatch'
  | 'invalid-metadata'
  | 'invalid-position'

export interface LivePointFrameSlot {
  readonly capacity: number
  readonly frame: DynamicPointFrame
  readonly positionStorage: Float32Array
  readonly colorStorage: Uint8Array
  readonly intensityStorage: Uint8Array
  readonly classificationStorage: Uint8Array
  readonly confidenceStorage: Uint8Array
}

export type DecodeLivePointFrameResult =
  | { ok: true; frame: DynamicPointFrame }
  | { ok: false; code: LivePointFrameErrorCode }

export interface LivePointFrameHeader {
  sequence: number
  timestampMs: number
  pointCount: number
  flags: number
  byteLength: number
}

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < CRC_TABLE.length; n++) {
  let value = n
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
  }
  CRC_TABLE[n] = value >>> 0
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xFFFFFFFF
  for (let i = start; i < end; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function isFiniteVec3(value: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
}

function presentFlags(frame: DynamicPointFrame): number {
  let flags = LivePointFrameFlags.Bounds
  if (frame.colors) flags |= LivePointFrameFlags.Color
  if (frame.intensity) flags |= LivePointFrameFlags.Intensity
  if (frame.classification) flags |= LivePointFrameFlags.Classification
  if (frame.confidence) flags |= LivePointFrameFlags.Confidence
  return flags
}

export function encodedLivePointFrameByteLength(pointCount: number): number {
  return LIVE_POINT_FRAME_HEADER_BYTES + Math.max(0, Math.floor(pointCount)) * LIVE_POINT_FRAME_STRIDE
}

/** Allocate one reusable decode slot. A three-slot ring is the normal owner. */
export function createLivePointFrameSlot(capacity: number): LivePointFrameSlot {
  const safeCapacity = Math.max(1, Math.floor(capacity))
  const positionStorage = new Float32Array(safeCapacity * 3)
  const colorStorage = new Uint8Array(safeCapacity * 3)
  const intensityStorage = new Uint8Array(safeCapacity)
  const classificationStorage = new Uint8Array(safeCapacity)
  const confidenceStorage = new Uint8Array(safeCapacity)
  return {
    capacity: safeCapacity,
    positionStorage,
    colorStorage,
    intensityStorage,
    classificationStorage,
    confidenceStorage,
    frame: {
      sequence: 0,
      timestampMs: 0,
      count: 0,
      origin: { x: 0, y: 0, z: 0 },
      radius: 0,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
      positions: positionStorage,
      colors: colorStorage,
      intensity: intensityStorage,
      classification: classificationStorage,
      confidence: confidenceStorage,
    },
  }
}

/**
 * Encode into caller-owned storage so a replay/live source does not allocate a
 * frame-sized ArrayBuffer on every render tick. Returns the active byte length.
 */
export function encodeLivePointFrameInto(frame: DynamicPointFrame, target: Uint8Array): number {
  const count = Math.max(0, Math.floor(frame.count))
  const byteLength = encodedLivePointFrameByteLength(count)
  if (target.byteLength < byteLength) throw new RangeError('live point frame target is too small')
  if (frame.positions.length < count * 3) throw new RangeError('live point frame positions are truncated')
  if (frame.colors && frame.colors.length < count * 3) throw new RangeError('live point frame colours are truncated')
  if (frame.intensity && frame.intensity.length < count) throw new RangeError('live point frame intensity is truncated')
  if (frame.classification && frame.classification.length < count) throw new RangeError('live point frame classification is truncated')
  if (frame.confidence && frame.confidence.length < count) throw new RangeError('live point frame confidence is truncated')

  const view = new DataView(target.buffer, target.byteOffset, byteLength)
  const flags = presentFlags(frame)
  const bounds = frame.bounds ?? {
    min: { x: frame.origin.x - frame.radius, y: frame.origin.y - frame.radius, z: frame.origin.z - frame.radius },
    max: { x: frame.origin.x + frame.radius, y: frame.origin.y + frame.radius, z: frame.origin.z + frame.radius },
  }

  view.setUint32(0, LIVE_POINT_FRAME_MAGIC, true)
  view.setUint16(4, LIVE_POINT_FRAME_VERSION, true)
  view.setUint16(6, LIVE_POINT_FRAME_HEADER_BYTES, true)
  view.setUint32(8, flags, true)
  view.setUint32(12, frame.sequence >>> 0, true)
  view.setBigUint64(16, BigInt(Math.max(0, Math.round(frame.timestampMs * 1_000_000))), true)
  view.setUint32(24, count, true)
  view.setUint16(28, LIVE_POINT_FRAME_STRIDE, true)
  view.setUint16(30, 0, true)
  view.setFloat64(32, frame.origin.x, true)
  view.setFloat64(40, frame.origin.y, true)
  view.setFloat64(48, frame.origin.z, true)
  view.setFloat32(56, frame.radius, true)
  view.setFloat32(60, bounds.min.x, true)
  view.setFloat32(64, bounds.min.y, true)
  view.setFloat32(68, bounds.min.z, true)
  view.setFloat32(72, bounds.max.x, true)
  view.setFloat32(76, bounds.max.y, true)
  view.setFloat32(80, bounds.max.z, true)
  view.setUint32(84, count * LIVE_POINT_FRAME_STRIDE, true)
  view.setUint32(88, 0, true)
  view.setUint32(92, 0, true)

  let offset = LIVE_POINT_FRAME_HEADER_BYTES
  for (let point = 0; point < count; point++) {
    const xyz = point * 3
    view.setFloat32(offset, frame.positions[xyz], true)
    view.setFloat32(offset + 4, frame.positions[xyz + 1], true)
    view.setFloat32(offset + 8, frame.positions[xyz + 2], true)
    target[offset + 12] = frame.colors?.[xyz] ?? 255
    target[offset + 13] = frame.colors?.[xyz + 1] ?? 255
    target[offset + 14] = frame.colors?.[xyz + 2] ?? 255
    target[offset + 15] = frame.intensity?.[point] ?? 0
    target[offset + 16] = frame.classification?.[point] ?? 0
    target[offset + 17] = frame.confidence?.[point] ?? 255
    offset += LIVE_POINT_FRAME_STRIDE
  }
  view.setUint32(88, crc32(target, LIVE_POINT_FRAME_HEADER_BYTES, byteLength), true)
  return byteLength
}

/** Validate just the fixed header; useful for an indexed MCAP preflight pass. */
export function inspectLivePointFrameHeader(packet: Uint8Array): LivePointFrameHeader | null {
  if (packet.byteLength < LIVE_POINT_FRAME_HEADER_BYTES) return null
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength)
  if (view.getUint32(0, true) !== LIVE_POINT_FRAME_MAGIC) return null
  if (view.getUint16(4, true) !== LIVE_POINT_FRAME_VERSION) return null
  if (view.getUint16(6, true) !== LIVE_POINT_FRAME_HEADER_BYTES) return null
  if (view.getUint16(28, true) !== LIVE_POINT_FRAME_STRIDE) return null
  const pointCount = view.getUint32(24, true)
  const byteLength = encodedLivePointFrameByteLength(pointCount)
  if (view.getUint32(84, true) !== pointCount * LIVE_POINT_FRAME_STRIDE) return null
  if (packet.byteLength !== byteLength) return null
  return {
    sequence: view.getUint32(12, true),
    timestampMs: Number(view.getBigUint64(16, true)) / 1_000_000,
    pointCount,
    flags: view.getUint32(8, true),
    byteLength,
  }
}

/** Decode, validate and copy into fixed storage owned by the bounded ring. */
export function decodeLivePointFrameInto(
  packet: Uint8Array,
  slot: LivePointFrameSlot,
): DecodeLivePointFrameResult {
  if (packet.byteLength < LIVE_POINT_FRAME_HEADER_BYTES) return { ok: false, code: 'packet-too-small' }
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength)
  if (view.getUint32(0, true) !== LIVE_POINT_FRAME_MAGIC) return { ok: false, code: 'bad-magic' }
  if (view.getUint16(4, true) !== LIVE_POINT_FRAME_VERSION) return { ok: false, code: 'unsupported-version' }

  const headerBytes = view.getUint16(6, true)
  const stride = view.getUint16(28, true)
  const flags = view.getUint32(8, true)
  if (headerBytes !== LIVE_POINT_FRAME_HEADER_BYTES || stride !== LIVE_POINT_FRAME_STRIDE || (flags & ~KNOWN_FLAGS) !== 0) {
    return { ok: false, code: 'bad-layout' }
  }

  const count = view.getUint32(24, true)
  if (count > slot.capacity) return { ok: false, code: 'too-many-points' }
  const payloadBytes = view.getUint32(84, true)
  const expectedBytes = count * LIVE_POINT_FRAME_STRIDE
  if (payloadBytes !== expectedBytes || packet.byteLength !== headerBytes + payloadBytes) {
    return { ok: false, code: 'length-mismatch' }
  }
  if (view.getUint32(88, true) !== crc32(packet, headerBytes, packet.byteLength)) {
    return { ok: false, code: 'checksum-mismatch' }
  }

  const origin = {
    x: view.getFloat64(32, true), y: view.getFloat64(40, true), z: view.getFloat64(48, true),
  }
  const radius = view.getFloat32(56, true)
  const min = {
    x: view.getFloat32(60, true), y: view.getFloat32(64, true), z: view.getFloat32(68, true),
  }
  const max = {
    x: view.getFloat32(72, true), y: view.getFloat32(76, true), z: view.getFloat32(80, true),
  }
  const timestampMs = Number(view.getBigUint64(16, true)) / 1_000_000
  if (!isFiniteVec3(origin) || !Number.isFinite(radius) || radius < 0 || !isFiniteVec3(min)
    || !isFiniteVec3(max) || min.x > max.x || min.y > max.y || min.z > max.z
    || !Number.isFinite(timestampMs)) {
    return { ok: false, code: 'invalid-metadata' }
  }

  let offset = headerBytes
  for (let point = 0; point < count; point++) {
    const xyz = point * 3
    const x = view.getFloat32(offset, true)
    const y = view.getFloat32(offset + 4, true)
    const z = view.getFloat32(offset + 8, true)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return { ok: false, code: 'invalid-position' }
    }
    slot.positionStorage[xyz] = x
    slot.positionStorage[xyz + 1] = y
    slot.positionStorage[xyz + 2] = z
    slot.colorStorage[xyz] = packet[offset + 12]
    slot.colorStorage[xyz + 1] = packet[offset + 13]
    slot.colorStorage[xyz + 2] = packet[offset + 14]
    slot.intensityStorage[point] = packet[offset + 15]
    slot.classificationStorage[point] = packet[offset + 16]
    slot.confidenceStorage[point] = packet[offset + 17]
    offset += stride
  }

  const frame = slot.frame
  frame.sequence = view.getUint32(12, true)
  frame.timestampMs = timestampMs
  frame.count = count
  frame.origin.x = origin.x
  frame.origin.y = origin.y
  frame.origin.z = origin.z
  frame.radius = radius
  if (!frame.bounds) frame.bounds = { min, max }
  else {
    Object.assign(frame.bounds.min, min)
    Object.assign(frame.bounds.max, max)
  }
  frame.colors = flags & LivePointFrameFlags.Color ? slot.colorStorage : null
  frame.intensity = flags & LivePointFrameFlags.Intensity ? slot.intensityStorage : null
  frame.classification = flags & LivePointFrameFlags.Classification ? slot.classificationStorage : null
  frame.confidence = flags & LivePointFrameFlags.Confidence ? slot.confidenceStorage : null
  return { ok: true, frame }
}
