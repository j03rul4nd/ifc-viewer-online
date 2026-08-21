// ─── live-frame-buffer ───────────────────────────────────────────────────────
// Three reusable decode slots are enough to absorb a little jitter/reordering.
// When rendering falls behind, the newest valid frame wins: latency stays low
// and memory never grows with session duration.

import type { DynamicPointFrame } from './pc-types'
import {
  createLivePointFrameSlot, decodeLivePointFrameInto,
  type LivePointFrameErrorCode, type LivePointFrameSlot,
} from './live-point-frame'

export interface LiveFrameBufferStats {
  capacity: number
  depth: number
  maxDepth: number
  received: number
  accepted: number
  displayed: number
  reordered: number
  invalid: number
  lateDropped: number
  overflowDropped: number
  superseded: number
  lastSequence: number
  lastError: LivePointFrameErrorCode | null
}

interface BufferedSlot {
  slot: LivePointFrameSlot
  pending: boolean
}

export class BoundedLiveFrameBuffer {
  private readonly slots: BufferedSlot[]
  private received = 0
  private accepted = 0
  private displayed = 0
  private reordered = 0
  private invalid = 0
  private lateDropped = 0
  private overflowDropped = 0
  private superseded = 0
  private maxDepth = 0
  private highestSeen = 0
  private lastSequence = 0
  private lastError: LivePointFrameErrorCode | null = null

  constructor(slotCapacity: number, frameCapacity: number) {
    const safeSlots = Math.min(3, Math.max(2, Math.floor(slotCapacity)))
    this.slots = Array.from({ length: safeSlots }, () => ({
      slot: createLivePointFrameSlot(frameCapacity),
      pending: false,
    }))
  }

  push(packet: Uint8Array): boolean {
    this.received++
    let target = this.slots.find((entry) => !entry.pending)
    if (!target) {
      target = this.slots.reduce((oldest, entry) =>
        entry.slot.frame.sequence < oldest.slot.frame.sequence ? entry : oldest)
      target.pending = false
      this.overflowDropped++
    }

    const decoded = decodeLivePointFrameInto(packet, target.slot)
    if (!decoded.ok) {
      this.invalid++
      this.lastError = decoded.code
      return false
    }
    const sequence = decoded.frame.sequence
    if (sequence <= this.lastSequence || this.slots.some((entry) =>
      entry !== target && entry.pending && entry.slot.frame.sequence === sequence)) {
      this.lateDropped++
      return false
    }
    if (sequence < this.highestSeen) this.reordered++
    this.highestSeen = Math.max(this.highestSeen, sequence)
    target.pending = true
    this.accepted++
    this.maxDepth = Math.max(this.maxDepth, this.depth())
    return true
  }

  /** Consume synchronously; all older pending frames are discarded afterwards. */
  consumeLatest(consumer: (frame: DynamicPointFrame) => void): boolean {
    const pending = this.slots.filter((entry) => entry.pending)
    if (pending.length === 0) return false
    const latest = pending.reduce((newest, entry) =>
      entry.slot.frame.sequence > newest.slot.frame.sequence ? entry : newest)
    this.superseded += pending.length - 1
    this.lastSequence = latest.slot.frame.sequence
    this.displayed++
    consumer(latest.slot.frame)
    for (const entry of pending) entry.pending = false
    return true
  }

  clear(): void {
    for (const entry of this.slots) entry.pending = false
  }

  snapshot(): LiveFrameBufferStats {
    return {
      capacity: this.slots.length,
      depth: this.depth(),
      maxDepth: this.maxDepth,
      received: this.received,
      accepted: this.accepted,
      displayed: this.displayed,
      reordered: this.reordered,
      invalid: this.invalid,
      lateDropped: this.lateDropped,
      overflowDropped: this.overflowDropped,
      superseded: this.superseded,
      lastSequence: this.lastSequence,
      lastError: this.lastError,
    }
  }

  private depth(): number {
    return this.slots.reduce((count, entry) => count + Number(entry.pending), 0)
  }
}
