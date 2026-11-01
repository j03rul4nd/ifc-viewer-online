// ─── Layer filters ────────────────────────────────────────────────────────────
// Non-destructive, unlike Procreate's: they live on the layer and can be changed
// or removed at any time. The GPU applies them live; filterPixels does the same
// for exports, where they are baked into the layer's pixels.

export interface LayerFilters {
  /** Degrees. */
  hue?: number
  /** 1 leaves it; 0 is grey. */
  saturation?: number
  /** 1 leaves it. */
  brightness?: number
  /** Soft edge, px. */
  soft?: number
  /** Paper-like breakup, 0..1. */
  grain?: number
  /** Halo around the line, px. */
  glow?: number
  /** Dark and light colour to remap the line to, like a gradient map. */
  duotone?: readonly [string, string]
}

export const FILTER_PRESETS: Record<string, LayerFilters> = {
  none: {},
  blueprint: { duotone: ['#0B3C8C', '#DCEBFF'], glow: 2 },
  wash: { soft: 3, saturation: 0.7, grain: 0.3 },
  chalk: { grain: 0.75, brightness: 1.1 },
  neon: { saturation: 1.6, brightness: 1.2, glow: 10 },
  faded: { saturation: 0.3, brightness: 1.15 },
}

const hex = (s: string): [number, number, number] => {
  const n = parseInt(s.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Hue rotation about the grey axis, the same matrix as the shader. */
function hueMatrix(deg: number): number[] {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180), k = (1 - c) / 3, q = Math.sqrt(1 / 3) * s
  return [c + k, k - q, k + q, k + q, c + k, k - q, k - q, k + q, c + k]
}

/** A fixed noise, so an export comes out the same every time. */
const noise = (x: number, y: number): number => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return v - Math.floor(v)
}

function boxBlur(src: Uint8ClampedArray | Uint8Array, w: number, h: number, r: number): Uint8ClampedArray {
  const radius = Math.max(1, Math.round(r))
  let from = Uint8ClampedArray.from(src)
  const to = new Uint8ClampedArray(src.length)
  const pass = (a: Uint8ClampedArray, b: Uint8ClampedArray, horizontal: boolean) => {
    const lines = horizontal ? h : w, len = horizontal ? w : h
    const at = (line: number, i: number) => (horizontal ? line * w + i : i * w + line) * 4
    for (let line = 0; line < lines; line++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0
        for (let i = -radius; i <= radius; i++) sum += a[at(line, Math.min(len - 1, Math.max(0, i))) + c]
        for (let i = 0; i < len; i++) {
          b[at(line, i) + c] = sum / (radius * 2 + 1)
          sum += a[at(line, Math.min(len - 1, i + radius + 1)) + c] - a[at(line, Math.max(0, i - radius)) + c]
        }
      }
    }
  }
  pass(from, to, true)
  from = Uint8ClampedArray.from(to)
  pass(from, to, false)
  return to
}

export const isNeutral = (f: LayerFilters | undefined): boolean =>
  !f || (!f.hue && (f.saturation ?? 1) === 1 && (f.brightness ?? 1) === 1 && !f.soft && !f.grain && !f.glow && !f.duotone)

/** The filters on straight-alpha RGBA, in place. `scale`: export px per screen px. */
export function filterPixels(data: Uint8ClampedArray, w: number, h: number, f: LayerFilters, scale = 1): void {
  const m = f.hue ? hueMatrix(f.hue) : null
  const sat = f.saturation ?? 1, bright = f.brightness ?? 1
  const duo = f.duotone ? [hex(f.duotone[0]), hex(f.duotone[1])] : null
  const original = f.glow ? Uint8ClampedArray.from(data) : null
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] === 0) continue
      let r = data[i], g = data[i + 1], b = data[i + 2]
      if (m) { const R = r, G = g, B = b; r = m[0] * R + m[1] * G + m[2] * B; g = m[3] * R + m[4] * G + m[5] * B; b = m[6] * R + m[7] * G + m[8] * B }
      const grey = 0.299 * r + 0.587 * g + 0.114 * b
      r = grey + (r - grey) * sat; g = grey + (g - grey) * sat; b = grey + (b - grey) * sat
      if (duo) { const t = grey / 255; r = duo[0][0] + (duo[1][0] - duo[0][0]) * t; g = duo[0][1] + (duo[1][1] - duo[0][1]) * t; b = duo[0][2] + (duo[1][2] - duo[0][2]) * t }
      data[i] = r * bright; data[i + 1] = g * bright; data[i + 2] = b * bright
      if (f.grain) data[i + 3] *= 1 - f.grain + f.grain * noise(Math.floor(x / (1.5 * scale)), Math.floor(y / (1.5 * scale)))
    }
  }
  if (f.soft) data.set(boxBlur(data, w, h, f.soft * scale))
  if (f.glow && original) {
    // The filtered line's colour, spread out, under the line itself.
    const halo = boxBlur(data, w, h, f.glow * scale)
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255, under = (halo[i + 3] / 255) * 0.9
      const out = a + under * (1 - a)
      if (out <= 0) continue
      for (let c = 0; c < 3; c++) data[i + c] = (data[i + c] * a + halo[i + c] * under * (1 - a)) / out
      data[i + 3] = out * 255
    }
  }
}

/** The colours a picture is mostly made of, for a palette from a reference. */
export function extractPalette(rgba: ArrayLike<number>, count = 5): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4)
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    b.n++; b.r += rgba[i]; b.g += rgba[i + 1]; b.b += rgba[i + 2]
    buckets.set(key, b)
  }
  const chosen: [number, number, number][] = []
  // By frequency, skipping what is too close to one already taken.
  for (const b of [...buckets.values()].sort((p, q) => q.n - p.n)) {
    const c: [number, number, number] = [b.r / b.n, b.g / b.n, b.b / b.n]
    if (chosen.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 48)) continue
    chosen.push(c)
    if (chosen.length === count) break
  }
  return chosen.map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`)
}

/** The axis plane most facing a view: what "auto" draws on. */
export function facingAxis(viewDir: readonly [number, number, number]): 'side' | 'ground' | 'front' {
  const [x, y, z] = viewDir.map(Math.abs)
  if (y >= x && y >= z) return 'ground'
  return x >= z ? 'side' : 'front'
}
