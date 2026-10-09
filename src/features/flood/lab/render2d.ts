// ─── 2-D preview renderer (lab only) ──────────────────────────────────────────
// Draws a display frame top-down on a canvas: hillshaded bed, obstacles, and
// water coloured by depth (transparent below the visibility threshold). The
// viewer's 3-D water layer replaces this in phase 2; this is how phase 1 shows
// the solver at work without touching the viewer.

import type { FloodGrid } from '../core/grid'
import { fromHalf } from '../core/half'

const RAMP: Array<[number, [number, number, number]]> = [
  [0.05, [158, 207, 250]],
  [0.15, [96, 165, 236]],
  [0.3, [52, 120, 214]],
  [0.6, [30, 80, 180]],
  [1.2, [18, 48, 130]],
  [2.5, [10, 26, 80]],
]

export function depthColor(h: number): [number, number, number] {
  if (h <= RAMP[0][0]) return RAMP[0][1]
  for (let k = 1; k < RAMP.length; k++) {
    if (h <= RAMP[k][0]) {
      const [h0, c0] = RAMP[k - 1]
      const [h1, c1] = RAMP[k]
      const t = (h - h0) / (h1 - h0)
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]
    }
  }
  return RAMP[RAMP.length - 1][1]
}

/** Half-float → float lookup for all 65 536 codes (decoding a frame is then a table read). */
const HALF = (() => {
  const t = new Float32Array(65536)
  for (let k = 0; k < 65536; k++) t[k] = fromHalf(k)
  return t
})()

export class Preview2D {
  private readonly ctx: CanvasRenderingContext2D
  private readonly base: Uint8ClampedArray
  private readonly img: ImageData

  constructor(private readonly canvas: HTMLCanvasElement, private readonly grid: FloodGrid) {
    const { nx, ny, dx, z, blocked } = grid
    canvas.width = nx
    canvas.height = ny
    this.ctx = canvas.getContext('2d')!
    this.img = this.ctx.createImageData(nx, ny)
    this.base = new Uint8ClampedArray(nx * ny * 4)
    // Hillshade (sun from the north-west) over a pale ground.
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        const p = ((ny - 1 - j) * nx + i) * 4
        if (blocked[c]) {
          this.base.set([58, 60, 68, 255], p)
          continue
        }
        const zl = z[j * nx + Math.max(0, i - 1)]
        const zr = z[j * nx + Math.min(nx - 1, i + 1)]
        const zb = z[Math.max(0, j - 1) * nx + i]
        const zt = z[Math.min(ny - 1, j + 1) * nx + i]
        const gx = (zr - zl) / (2 * dx)
        const gy = (zt - zb) / (2 * dx)
        const shade = Math.max(0, Math.min(1, 0.72 + 6 * (-gx * 0.7 + gy * 0.7)))
        const v = 150 + 70 * shade
        this.base.set([v, v * 0.98, v * 0.92, 255], p)
      }
    }
  }

  /** mode 'now' paints h, 'max' paints hMax. */
  draw(frame: Uint16Array, mode: 'now' | 'max' = 'now', threshold = 0.05): void {
    const { nx, ny } = this.grid
    const px = this.img.data
    px.set(this.base)
    const ch = mode === 'now' ? 0 : 3
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        const h = HALF[frame[c * 4 + ch]]
        if (!(h > threshold)) continue
        const p = ((ny - 1 - j) * nx + i) * 4
        const [r, g, b] = depthColor(h)
        const a = Math.min(0.92, 0.55 + h)
        px[p] = px[p] * (1 - a) + r * a
        px[p + 1] = px[p + 1] * (1 - a) + g * a
        px[p + 2] = px[p + 2] * (1 - a) + b * a
      }
    }
    this.ctx.putImageData(this.img, 0, 0)
  }
}
