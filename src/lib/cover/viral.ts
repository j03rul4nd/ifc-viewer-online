// ─── Viral looks: image maths ──────────────────────────────────────────────────
// The pixel work behind the four formats architecture feeds reward in 2026,
// each built from the real model rather than faked by an image prompt:
//   - nocturne: the scene at dusk plus a mask of the IFC's own glazing, glowing
//     warm with bloom — the blue-hour "hero shot" every project now asks for;
//   - miniature: tilt-shift blur and a saturated, toy-like grade;
//   - collage: the building cut out on transparency, flattened into a few
//     tones (the post-digital collage of Dogma / OFFICE KGDVS);
//   - anatomy: where each exploded storey actually lands in the frame, so its
//     label can point at it.
// Pure functions over RGBA buffers, so every one is testable without a canvas.

import type { Rgba } from './filters'

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '')
  const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6)
  const n = Number.parseInt(f, 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0]
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Tight box around every pixel with alpha > `threshold`, or null if empty. */
export function alphaBounds(img: Rgba, threshold = 8): { x0: number; y0: number; x1: number; y1: number } | null {
  const { width: w, height: h, data: d } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

/** Separable box blur of one channel, in place. Three passes ≈ a gaussian. */
export function blurChannel(ch: Float32Array, w: number, h: number, radius: number, passes = 3): Float32Array {
  const r = Math.max(0, Math.round(radius))
  if (r === 0) return ch
  const tmp = new Float32Array(ch.length)
  for (let p = 0; p < passes; p++) {
    // Horizontal: running sum per row.
    for (let y = 0; y < h; y++) {
      const row = y * w
      let acc = 0
      for (let x = -r; x <= r; x++) acc += ch[row + Math.min(w - 1, Math.max(0, x))]
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / (2 * r + 1)
        acc += ch[row + Math.min(w - 1, x + r + 1)] - ch[row + Math.max(0, x - r)]
      }
    }
    // Vertical.
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
      for (let y = 0; y < h; y++) {
        ch[y * w + x] = acc / (2 * r + 1)
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
      }
    }
  }
  return ch
}

export interface NightOptions {
  /** Warm light in the windows. */
  glow: string
  /** Per-channel multiplier that takes the daylight frame to night. */
  grade: [number, number, number]
  /** Bloom radius as a fraction of the frame's width. */
  bloom: number
  /** 0–1: how strongly the bloom spills. */
  spill: number
}

export const NIGHT_DEFAULTS: NightOptions = { glow: '#FFC46E', grade: [0.42, 0.48, 0.72], bloom: 0.012, spill: 0.9 }

/**
 * Night from two frames of the same camera: `base` (the scene under a dusk
 * light) and `mask` (glazing white, everything else black). The base is graded
 * to night, the windows are lit, and their light blooms outwards. In place on
 * `base`; returns it.
 */
export function composeNight(base: Rgba, mask: Rgba, opts: NightOptions = NIGHT_DEFAULTS): Rgba {
  const { width: w, height: h } = base
  const n = w * h
  const lit = new Float32Array(n)
  const md = mask.data
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    // Mask luminance, hard-kneed so a lit window is fully on and shading noise is off.
    const l = (0.2126 * md[i] + 0.7152 * md[i + 1] + 0.0722 * md[i + 2]) / 255
    lit[p] = l < 0.18 ? 0 : Math.min(1, (l - 0.18) / 0.4)
  }
  const bloom = blurChannel(Float32Array.from(lit), w, h, Math.max(1, opts.bloom * w))
  const [gr, gg, gb] = hex(opts.glow)
  const bd = base.data
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const k = lit[p]
    const s = Math.min(1, bloom[p] * 1.6) * opts.spill
    for (let c = 0; c < 3; c++) {
      const night = bd[i + c] * opts.grade[c]
      const glow = c === 0 ? gr : c === 1 ? gg : gb
      // Window: replace with the warm light (brighter at its core); bloom: screen it on.
      const window = night + (glow * (0.85 + 0.15 * k) - night) * k
      bd[i + c] = clamp255(255 - (255 - window) * (1 - (glow / 255) * s * 0.75))
    }
  }
  return base
}

export interface TiltShiftOptions {
  /** Centre of the sharp band, 0 (top) – 1 (bottom). */
  center: number
  /** Half-height of the sharp band, as a fraction of the frame. */
  band: number
  /** Blur at the edges, as a fraction of the frame's width. */
  blur: number
  /** Saturation multiplier (toy look). */
  saturation: number
}

export const TILT_DEFAULTS: TiltShiftOptions = { center: 0.55, band: 0.12, blur: 0.012, saturation: 1.45 }

/** Miniature: a sharp horizontal band, blur growing above and below, punchier colour. */
export function tiltShift(img: Rgba, opts: TiltShiftOptions = TILT_DEFAULTS): Rgba {
  const { width: w, height: h, data: d } = img
  const n = w * h
  const r = Math.max(1, opts.blur * w)
  const chans = [0, 1, 2].map((c) => {
    const ch = new Float32Array(n)
    for (let p = 0; p < n; p++) ch[p] = d[p * 4 + c]
    return blurChannel(ch, w, h, r)
  })
  for (let y = 0; y < h; y++) {
    const dist = Math.abs(y / h - opts.center)
    const t = Math.min(1, Math.max(0, (dist - opts.band) / (opts.band * 1.6)))
    const wgt = t * t * (3 - 2 * t)
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const i = p * 4
      const rgb = [0, 1, 2].map((c) => d[i + c] + (chans[c][p] - d[i + c]) * wgt)
      const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
      for (let c = 0; c < 3; c++) {
        // Saturation around luma, then a gentle S-curve for the plastic-model sheen.
        const sat = l + (rgb[c] - l) * opts.saturation
        const v = sat / 255
        d[i + c] = clamp255(255 * (v * v * (3 - 2 * v) * 0.35 + v * 0.65))
      }
    }
  }
  return img
}

/**
 * Flatten a cut-out into a few tones (dark → light), keeping its alpha — the
 * flat, printed planes of a post-digital collage. Tones are spread over the
 * cut-out's OWN luminance range, so the result is the same whatever light the
 * frame was captured under (a dusk capture came out nearly black otherwise).
 */
export function posterize(img: Rgba, tones: readonly string[]): Rgba {
  const rgb = tones.map(hex)
  const k = rgb.length
  if (k === 0) return img
  const d = img.data
  let lo = 255, hi = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    if (l < lo) lo = l
    if (l > hi) hi = l
  }
  const span = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] - lo) / span
    const t = rgb[Math.min(k - 1, Math.floor(l * k))]
    d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]
    // Hard edge: collage cut-outs have no feather.
    d[i + 3] = d[i + 3] > 96 ? 255 : 0
  }
  return img
}

/** Normalised anchor for an exploded layer's label: the right edge of its box, mid-height. */
export function layerAnchor(img: Rgba): { x: number; y: number } | null {
  const b = alphaBounds(img)
  if (!b) return null
  return { x: b.x1 / img.width, y: (b.y0 + b.y1) / 2 / img.height }
}

/**
 * How many steps a form-evolution strip gets for a building of `storeys`
 * levels: enough to read as a process, few enough to read at a glance.
 */
export function evolutionSteps(storeys: number): number {
  if (storeys <= 1) return 0
  return Math.min(4, storeys)
}

/**
 * Which panes are lit at night: a real tower at blue hour is never lit wall to
 * wall. Deterministic per element id (same model, same night, every export):
 * about a quarter off, a quarter dimmed, the rest on.
 */
export function windowLighting(ids: readonly number[], seed = 1): { off: number[]; dim: number[] } {
  const off: number[] = []
  const dim: number[] = []
  for (const id of ids) {
    let x = (id * 2654435761 + seed * 40503) >>> 0
    x = (x ^ (x >>> 15)) * 2246822519 >>> 0
    x = (x ^ (x >>> 13)) >>> 0
    const r = (x % 1000) / 1000
    if (r < 0.26) off.push(id)
    else if (r < 0.5) dim.push(id)
  }
  return { off, dim }
}

/** Union of boxes, padded by `pad` of its larger side and clamped to w × h. */
export function paddedUnion(
  boxes: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }>, w: number, h: number, pad: number,
): { x: number; y: number; w: number; h: number } | null {
  if (!boxes.length) return null
  const x0 = Math.min(...boxes.map((b) => b.x0))
  const y0 = Math.min(...boxes.map((b) => b.y0))
  const x1 = Math.max(...boxes.map((b) => b.x1))
  const y1 = Math.max(...boxes.map((b) => b.y1))
  const p = Math.round(Math.max(x1 - x0, y1 - y0) * pad)
  const x = Math.max(0, x0 - p)
  const y = Math.max(0, y0 - p)
  return { x, y, w: Math.min(w, x1 + p + 1) - x, h: Math.min(h, y1 + p + 1) - y }
}
