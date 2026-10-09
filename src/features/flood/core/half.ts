// ─── IEEE 754 half floats ─────────────────────────────────────────────────────
// Display frames travel worker → main thread → GPU texture as half floats: a
// 500×500 frame of (h, u, v, hMax) is 2 MB instead of 4, and THREE uploads a
// Uint16Array straight into an RGBA16F texture. Round-to-nearest-even, with
// overflow to ±Infinity and subnormals kept (depths of a tenth of a millimetre
// stay distinguishable from zero).

const f32 = new Float32Array(1)
const u32 = new Uint32Array(f32.buffer)

export function toHalf(v: number): number {
  f32[0] = v
  const x = u32[0]
  const sign = (x >>> 16) & 0x8000
  const exp = (x >>> 23) & 0xff
  let mant = x & 0x7fffff
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0) // Inf / NaN
  let e = exp - 127 + 15
  if (e >= 0x1f) return sign | 0x7c00 // overflow → Inf
  if (e <= 0) {
    if (e < -10) return sign // underflow → ±0
    mant |= 0x800000
    const shift = 14 - e
    const half = mant >>> shift
    const rem = mant & ((1 << shift) - 1)
    const mid = 1 << (shift - 1)
    return sign | (rem > mid || (rem === mid && (half & 1)) ? half + 1 : half)
  }
  const half = sign | (e << 10) | (mant >>> 13)
  const rem = mant & 0x1fff
  // Round to nearest even; a carry out of the mantissa bumps the exponent, as it should.
  return rem > 0x1000 || (rem === 0x1000 && (half & 1)) ? half + 1 : half
}

export function fromHalf(h: number): number {
  const sign = h & 0x8000 ? -1 : 1
  const exp = (h >>> 10) & 0x1f
  const mant = h & 0x3ff
  if (exp === 0) return sign * mant * 2 ** -24
  if (exp === 0x1f) return mant ? NaN : sign * Infinity
  return sign * (1 + mant / 1024) * 2 ** (exp - 15)
}

/** Packs four cell-centred fields into the RGBA half layout of a display frame. */
export function packDisplay(h: ArrayLike<number>, u: ArrayLike<number>, v: ArrayLike<number>, hMax: ArrayLike<number>, out?: Uint16Array): Uint16Array {
  const n = h.length
  const o = out && out.length === n * 4 ? out : new Uint16Array(n * 4)
  for (let c = 0; c < n; c++) {
    o[c * 4] = toHalf(h[c])
    o[c * 4 + 1] = toHalf(u[c])
    o[c * 4 + 2] = toHalf(v[c])
    o[c * 4 + 3] = toHalf(hMax[c])
  }
  return o
}
