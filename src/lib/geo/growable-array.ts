// ─── growable-array ───────────────────────────────────────────────────────────
// A typed-array vertex sink that grows by doubling.
//
// THE COST IT REMOVES, MEASURED. The layer builders pushed every coordinate
// into a plain `number[]` and handed it to `Float32BufferAttribute`, which
// copies it into a Float32Array. On the Glòries capture the road layer is 1.38
// million vertices: profiled, the garbage collector took 843 ms and the final
// copy 648 ms of a 1.4 s build — the geometry maths itself was a fraction of
// it. A plain array of doubles that keeps growing is eight bytes a number plus
// the churn of every reallocation, and all of it lands on the main thread in
// one frame.
//
// Positions still need double precision while they are built: they are
// absolute normalized coordinates (~0.5) that are REBASED on the layer origin
// before they are cast to float32, which is the only thing that keeps a
// centimetre railing a centimetre wide (see buildLinearLayer). So the sink is
// Float64 for positions and Float32 for everything else, and either way one
// exact-size copy is made at the end.
//
// It satisfies `NumberSink` exactly as a `number[]` does, so helpers that only
// ever `push` and read `length` take either without knowing which.

import type { Steps } from './steps'

/** What a vertex writer needs: append, and count. A `number[]` is one. */
export interface NumberSink {
  readonly length: number
  push(...values: number[]): number
}

export class GrowableArray implements NumberSink {
  private buf: Float64Array | Float32Array
  private n = 0

  constructor(private readonly precision: 'f64' | 'f32' = 'f32', initial = 8192) {
    this.buf = precision === 'f64' ? new Float64Array(initial) : new Float32Array(initial)
  }

  get length(): number { return this.n }

  private grow(need: number): void {
    let cap = this.buf.length
    while (cap < need) cap *= 2
    const next = this.precision === 'f64' ? new Float64Array(cap) : new Float32Array(cap)
    next.set(this.buf.subarray(0, this.n))
    this.buf = next
  }

  // Fixed optional parameters rather than a rest parameter: a rest array is an
  // allocation per call, and this is called millions of times per build.
  push(a: number, b?: number, c?: number, d?: number, e?: number, f?: number,
    g?: number, h?: number, i?: number, j?: number, k?: number, l?: number): number {
    const count = l !== undefined ? 12 : k !== undefined ? 11 : j !== undefined ? 10
      : i !== undefined ? 9 : h !== undefined ? 8 : g !== undefined ? 7 : f !== undefined ? 6
        : e !== undefined ? 5 : d !== undefined ? 4 : c !== undefined ? 3 : b !== undefined ? 2 : 1
    if (this.n + count > this.buf.length) this.grow(this.n + count)
    const buf = this.buf
    let n = this.n
    buf[n++] = a
    if (count > 1) buf[n++] = b!
    if (count > 2) buf[n++] = c!
    if (count > 3) buf[n++] = d!
    if (count > 4) buf[n++] = e!
    if (count > 5) buf[n++] = f!
    if (count > 6) buf[n++] = g!
    if (count > 7) buf[n++] = h!
    if (count > 8) buf[n++] = i!
    if (count > 9) buf[n++] = j!
    if (count > 10) buf[n++] = k!
    if (count > 11) buf[n++] = l!
    this.n = n
    return n
  }

  get(index: number): number { return this.buf[index] }
  set(index: number, value: number): void { this.buf[index] = value }

  /** Subtract an origin from every `stride`-th pair — the pre-cast rebase. */
  rebase(ox: number, oy: number, stride = 3): void {
    const buf = this.buf
    for (let i = 0; i + 1 < this.n; i += stride) { buf[i] -= ox; buf[i + 1] -= oy }
  }

  /** `rebase`, `chunk` pairs per step (see `steps`). The result is the same. */
  *rebaseSteps(ox: number, oy: number, stride = 3, chunk = 1 << 16): Steps<void> {
    const buf = this.buf
    for (let start = 0; start + 1 < this.n; start += stride * chunk) {
      yield
      const end = Math.min(this.n, start + stride * chunk)
      for (let i = start; i < end && i + 1 < this.n; i += stride) { buf[i] -= ox; buf[i + 1] -= oy }
    }
  }

  /** An exact-size Float32Array copy, ready for a BufferAttribute. */
  toFloat32(): Float32Array {
    const out = new Float32Array(this.n)
    out.set(this.buf.subarray(0, this.n))
    return out
  }

  /**
   * `toFloat32` a chunk per step, for a builder that pauses (see `steps`).
   * A road layer is millions of numbers, and the cast is not a memcpy — every
   * element is rounded — so in one piece it is a long task of its own.
   */
  *toFloat32Steps(chunk = 1 << 18): Steps<Float32Array> {
    const out = new Float32Array(this.n)
    for (let at = 0; at < this.n; at += chunk) {
      yield
      out.set(this.buf.subarray(at, Math.min(this.n, at + chunk)), at)
    }
    return out
  }
}

/** Float32 data for an attribute from either kind of sink. */
export function float32Of(sink: NumberSink): Float32Array {
  return sink instanceof GrowableArray ? sink.toFloat32() : new Float32Array(sink as number[])
}
