// ─── Cover Studio image filters ────────────────────────────────────────────────
// 2D post-processing applied to a captured shot after the 3D scene has been
// restyled (see looks.ts). The scene does the heavy lifting — clay materials,
// ghosted context, a highlighted category — and these turn the frame into a
// drawing, a duotone print or a grainy monochrome. Pure functions over RGBA
// buffers so every filter is testable without a canvas.

export type PostFilter = 'none' | 'levels' | 'lines' | 'blueprint' | 'mono' | 'duotone'

export interface Rgba { data: Uint8ClampedArray; width: number; height: number }

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const n = Number.parseInt(full, 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0]
}

/** Rec. 709 luma per pixel, 0–255. */
export function luminance(img: Rgba): Float32Array {
  const out = new Float32Array(img.width * img.height)
  const d = img.data
  for (let i = 0, p = 0; p < out.length; i += 4, p++) out[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  return out
}

/** Sobel gradient magnitude, normalised to 0–1 by the frame's own maximum. */
export function sobel(lum: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  let max = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const a = lum[i - w - 1], b = lum[i - w], c = lum[i - w + 1]
      const d = lum[i - 1], f = lum[i + 1]
      const g = lum[i + w - 1], hh = lum[i + w], k = lum[i + w + 1]
      const gx = c + 2 * f + k - a - 2 * d - g
      const gy = g + 2 * hh + k - a - 2 * b - c
      const m = Math.hypot(gx, gy)
      out[i] = m
      if (m > max) max = m
    }
  }
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max
  return out
}

/**
 * Luminance at the given percentiles (0–1). Viewer captures of a white model
 * come out mid-grey — scene lighting, not the material — so stretching the
 * frame's own range is what makes "white model" actually read as white.
 */
export function percentiles(lum: Float32Array, lo: number, hi: number): [number, number] {
  const hist = new Uint32Array(256)
  for (let i = 0; i < lum.length; i++) hist[Math.min(255, Math.max(0, Math.round(lum[i])))]++
  const find = (q: number) => {
    const target = q * lum.length
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v }
    return 255
  }
  const a = find(lo)
  const b = find(hi)
  return b - a < 8 ? [0, 255] : [a, b]
}

/** Deterministic grain so the preview and the export match pixel for pixel. */
function noise(i: number, seed: number): number {
  let x = (i * 374761393 + seed * 668265263) | 0
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295
}

export interface FilterOptions {
  /** Ink / dark colour (lines, duotone shadows). */
  ink: string
  /** Paper / light colour (lines background, duotone highlights). */
  paper: string
  /** 0–1: how much of the original shading survives under the lines. */
  tint?: number
  /** 0–1 film grain. */
  grain?: number
}

/** Apply a filter in place and return the same buffer. */
export function applyFilter(img: Rgba, filter: PostFilter, opts: FilterOptions): Rgba {
  if (filter === 'none') return img
  const { width: w, height: h, data: d } = img
  const lum = luminance(img)
  const ink = hexToRgb(opts.ink)
  const paper = hexToRgb(opts.paper)
  const grain = opts.grain ?? 0

  if (filter === 'levels') {
    // Gamma lift, per channel. Viewer captures of a white model come out
    // mid-grey (scene lighting, not the material). A black/white-point stretch
    // is wrong here: the backdrop is the brightest thing in frame and the model
    // is its darkest, so a stretch would sink the building to black. A gamma
    // curve lifts the mid-tones to white, keeps the shading that describes the
    // volume, and leaves an accent-coloured category in colour.
    const lut = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, 0.55)
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = lut[d[i + c]]
    return img
  }

  const [lo, hi] = percentiles(lum, 0.01, 0.995)
  const norm = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)))

  if (filter === 'lines' || filter === 'blueprint') {
    const edges = sobel(lum, w, h)
    const tint = opts.tint ?? (filter === 'lines' ? 0.18 : 0.08)
    for (let p = 0, i = 0; p < edges.length; p++, i += 4) {
      // Soft threshold: faint gradients vanish, real edges go full ink.
      const e = Math.min(1, Math.max(0, (edges[p] - 0.06) * 4))
      const shade = 1 - tint * (1 - lum[p] / 255)
      for (let c = 0; c < 3; c++) {
        const base = paper[c] * shade
        d[i + c] = base + (ink[c] - base) * e
      }
    }
    return img
  }

  if (filter === 'mono') {
    for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
      // S-curve for a printed, high-contrast black & white.
      const t = norm(lum[p])
      let v = t * t * (3 - 2 * t)
      if (grain) v += (noise(p, 7) - 0.5) * grain * 0.35
      const o = Math.max(0, Math.min(255, v * 255))
      d[i] = o; d[i + 1] = o; d[i + 2] = o
    }
    return img
  }

  // duotone
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    let t = norm(lum[p])
    if (grain) t = Math.max(0, Math.min(1, t + (noise(p, 11) - 0.5) * grain * 0.3))
    for (let c = 0; c < 3; c++) d[i + c] = ink[c] + (paper[c] - ink[c]) * t
  }
  return img
}
