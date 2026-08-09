// ─── pc-reader ────────────────────────────────────────────────────────────────
// The contract every point cloud reader implements, plus the byte-slicing
// helpers they share. Pure — no three.js, no DOM beyond Blob/File.
//
// Design note: readers push into a consumer rather than returning arrays. A
// 20-million-point file must never exist as an array of objects, and the
// chunker needs to see points as they arrive so the first ones can reach the
// GPU while the rest are still being decoded.

import type { PointCloudFormat, PointAttributesPresent, SourceFrame } from './pc-types'

/**
 * Receives every decoded point. All channels are pre-normalized to 0-255 so the
 * chunker can write straight into Uint8Arrays; positions stay in SOURCE units
 * as float64 until the chunker subtracts the chunk origin.
 */
export interface PointConsumer {
  push(
    x: number, y: number, z: number,
    r: number, g: number, b: number,
    intensity: number,
    classification: number,
    confidence: number,
  ): void
}

export interface ReaderHeader {
  frame: SourceFrame
  attributes: PointAttributesPresent
  /** Points the header claims, or null when the format cannot say. */
  declaredCount: number | null
  /**
   * True when `frame.min`/`frame.max` were sampled rather than read from a
   * header. The exact box is measured during read() and reported at the end.
   */
  boundsEstimated: boolean
}

export interface ReadOptions {
  maxPoints: number
  /** 0-1. Called every few slices, never per point. */
  onProgress(fraction: number): void
  /** Polled between slices — lets the worker abort a superseded parse. */
  shouldStop(): boolean
}

export interface PointReader {
  readonly format: PointCloudFormat
  /** Parse the header (and sample the file when the format has no bbox). */
  open(): Promise<ReaderHeader>
  /** Stream every point into `consumer`. Returns how many were pushed. */
  read(consumer: PointConsumer, opts: ReadOptions): Promise<number>
}

// ── Byte helpers ───────────────────────────────────────────────────────────────

/** Read [start, end) of a Blob as an ArrayBuffer. Clamped to the blob size. */
export async function readSlice(blob: Blob, start: number, end: number): Promise<ArrayBuffer> {
  const from = Math.max(0, Math.min(start, blob.size))
  const to   = Math.max(from, Math.min(end, blob.size))
  if (to === from) return new ArrayBuffer(0)
  return blob.slice(from, to).arrayBuffer()
}

/** Fixed-length ASCII field, NUL-trimmed. */
export function asciiAt(view: DataView, offset: number, length: number): string {
  let s = ''
  for (let i = 0; i < length; i++) {
    const c = view.getUint8(offset + i)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s.trim()
}

/** How much of a large file to sample from each end when estimating bounds. */
export const SAMPLE_BYTES = 6 * 1024 * 1024

/** Slice size for the streaming pass. Big enough to amortise, small enough to yield. */
export const STREAM_SLICE_BYTES = 8 * 1024 * 1024

// ── Shared math ────────────────────────────────────────────────────────────────

/** Growable float64 bbox accumulator. */
export class Bounds {
  minX = Infinity; minY = Infinity; minZ = Infinity
  maxX = -Infinity; maxY = -Infinity; maxZ = -Infinity

  add(x: number, y: number, z: number): void {
    if (x < this.minX) this.minX = x
    if (y < this.minY) this.minY = y
    if (z < this.minZ) this.minZ = z
    if (x > this.maxX) this.maxX = x
    if (y > this.maxY) this.maxY = y
    if (z > this.maxZ) this.maxZ = z
  }

  get isEmpty(): boolean { return !Number.isFinite(this.minX) }

  /** Falls back to a unit box around the origin when nothing was added. */
  toFrame(base: Omit<SourceFrame, 'min' | 'max' | 'origin'>): SourceFrame {
    if (this.isEmpty) {
      return { ...base, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, origin: { x: 0, y: 0, z: 0 } }
    }
    return {
      ...base,
      min: { x: this.minX, y: this.minY, z: this.minZ },
      max: { x: this.maxX, y: this.maxY, z: this.maxZ },
      origin: {
        x: (this.minX + this.maxX) / 2,
        y: (this.minY + this.maxY) / 2,
        z: (this.minZ + this.maxZ) / 2,
      },
    }
  }
}

/**
 * Scale factor that maps a channel's observed maximum onto 0-255.
 *
 * Why this exists: LAS stores intensity and RGB as uint16, but a large share of
 * real files write 8-bit values into those fields. Blindly doing `>> 8` turns
 * every such file black. Sampling the actual maximum and scaling from it is the
 * only way to be right for both conventions.
 */
export function byteScaleFor(observedMax: number): number {
  if (!Number.isFinite(observedMax) || observedMax <= 0) return 0
  // Already byte-ranged — pass through rather than stretching a dim file to white.
  if (observedMax <= 255) return 1
  return 255 / observedMax
}
