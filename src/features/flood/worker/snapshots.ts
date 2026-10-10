// ─── snapshots ────────────────────────────────────────────────────────────────
// The run, kept so the timeline can go anywhere in it without solving again.
//
// Every snapshot is a display frame — per cell (h, u, v, running max of h) as
// half floats — deflated (fflate, level 1: dry cells, most of a city, are long
// runs of zeros and cost next to nothing). Taken at exact instants of the
// solver's millisecond clock, every `interval` simulated seconds. If the store
// grows past its budget, every other snapshot is dropped and the interval
// doubles: a long event keeps its whole span at a coarser step rather than
// losing its end.
//
// A frame at any time t is interpolated linearly between the two snapshots
// around it (the running maximum takes the larger of the earlier snapshot's
// and the interpolated depth). Pure; used inside the worker.

import { deflateSync, inflateSync } from 'fflate'
import { fromHalf, toHalf } from '../core/half'

const HALF = (() => {
  const t = new Float32Array(65536)
  for (let k = 0; k < 65536; k++) t[k] = fromHalf(k)
  return t
})()

interface Snapshot { t: number; bytes: Uint8Array }

export interface CellSeries {
  t: Float32Array
  h: Float32Array
  speed: Float32Array
}

export class SnapshotStore {
  private snaps: Snapshot[] = []
  private cache = new Map<number, Uint16Array>()
  private total = 0
  interval: number

  constructor(
    private readonly cells: number,
    interval: number,
    private readonly budgetBytes = 256 * 1024 * 1024,
  ) {
    this.interval = interval
  }

  get count(): number { return this.snaps.length }
  get bytes(): number { return this.total }
  get lastT(): number { return this.snaps.length ? this.snaps[this.snaps.length - 1].t : -Infinity }
  times(): number[] { return this.snaps.map((s) => s.t) }

  /** Stores a frame taken at time t (s). Frames must arrive in time order. */
  add(t: number, frame: Uint16Array): void {
    if (frame.length !== this.cells * 4) throw new Error('snapshot: frame size mismatch')
    if (this.snaps.length && t <= this.lastT) return
    const bytes = deflateSync(new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength), { level: 1 })
    this.snaps.push({ t, bytes })
    this.total += bytes.byteLength
    while (this.total > this.budgetBytes && this.snaps.length > 3) this.decimate()
  }

  private decimate(): void {
    const keep: Snapshot[] = []
    this.snaps.forEach((s, k) => {
      if (k % 2 === 0 || k === this.snaps.length - 1) keep.push(s)
      else this.total -= s.bytes.byteLength
    })
    this.snaps = keep
    this.cache.clear()
    this.interval *= 2
  }

  private frame(k: number): Uint16Array {
    const hit = this.cache.get(k)
    if (hit) return hit
    const raw = inflateSync(this.snaps[k].bytes)
    const f = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
    if (this.cache.size >= 4) this.cache.delete(this.cache.keys().next().value as number)
    this.cache.set(k, f)
    return f
  }

  /** Index of the last snapshot at or before t (−1 when t precedes them all). */
  private before(t: number): number {
    let lo = 0
    let hi = this.snaps.length - 1
    if (hi < 0 || t < this.snaps[0].t) return -1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.snaps[mid].t <= t) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  /** The frame at time t, interpolated; null before the first snapshot. */
  frameAt(t: number): Uint16Array | null {
    const a = this.before(t)
    if (a < 0) return null
    const fa = this.frame(a)
    const b = Math.min(a + 1, this.snaps.length - 1)
    const ta = this.snaps[a].t
    const tb = this.snaps[b].t
    const w = b === a || tb <= ta ? 0 : Math.min(1, Math.max(0, (t - ta) / (tb - ta)))
    if (w < 1e-3) return fa.slice()
    const fb = this.frame(b)
    if (w > 1 - 1e-3) return fb.slice()
    const out = new Uint16Array(fa.length)
    for (let c = 0; c < this.cells; c++) {
      const o = c * 4
      const h = HALF[fa[o]] * (1 - w) + HALF[fb[o]] * w
      out[o] = toHalf(h)
      out[o + 1] = toHalf(HALF[fa[o + 1]] * (1 - w) + HALF[fb[o + 1]] * w)
      out[o + 2] = toHalf(HALF[fa[o + 2]] * (1 - w) + HALF[fb[o + 2]] * w)
      out[o + 3] = toHalf(Math.max(HALF[fa[o + 3]], h))
    }
    return out
  }

  /** Depth and speed of one cell at every snapshot. */
  cellSeries(cell: number): CellSeries {
    const n = this.snaps.length
    const out: CellSeries = { t: new Float32Array(n), h: new Float32Array(n), speed: new Float32Array(n) }
    for (let k = 0; k < n; k++) {
      // Inflating every snapshot is the cost of a probe click (~ms each); the
      // cache is left alone so scrubbing keeps its neighbours.
      const raw = inflateSync(this.snaps[k].bytes)
      const f = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
      out.t[k] = this.snaps[k].t
      out.h[k] = HALF[f[cell * 4]]
      out.speed[k] = Math.hypot(HALF[f[cell * 4 + 1]], HALF[f[cell * 4 + 2]])
    }
    return out
  }

  clear(): void {
    this.snaps = []
    this.cache.clear()
    this.total = 0
  }
}

/** Snapshot interval for an event: ~200 snapshots, between 10 s and 10 min, on a 10 s step. */
export function snapshotInterval(endS: number): number {
  return Math.min(600, Math.max(10, Math.round(endS / 200 / 10) * 10))
}
