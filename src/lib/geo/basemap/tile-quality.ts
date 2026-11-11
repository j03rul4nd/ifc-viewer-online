// ─── tile-quality ─────────────────────────────────────────────────────────────
// The numbers that decide how sharp the basemap is, kept pure so they can be
// tested and reasoned about away from the tile engine.
//
// ── Why the basemap looked pixelated (measured 2026-10) ──────────────────────
//
// 3d-tiles-renderer picks a tile level by screen-space error: a tile is good
// enough while ONE of its texels covers at most `errorTarget` pixels of the
// resolution it was given. Three things stacked up against us:
//
//   1. errorTarget was 6. A texel was allowed to cover up to 6 pixels, so a
//      256 px OSM tile could be stretched over ~1500 px before its children
//      were asked for. A full-HD view was painted by two to four tiles.
//   2. The resolution came from `setResolutionFromRenderer`, which reads
//      `renderer.getSize()` — CSS pixels. On a DPR 2 screen every texel was
//      then magnified twice more than the LOD maths believed: up to 12
//      device pixels per texel.
//   3. The resolution was set once, when map mode turned on. Opening a side
//      panel, resizing the window or dragging to another monitor never
//      reached the tile engine, so LOD kept planning for a canvas that no
//      longer existed.
//
// The fix is not a filter: it is feeding the engine device pixels, tracking
// them every frame, and asking for a texel of 1–2 device pixels (the band
// (t/2, t] a REPLACE quadtree always oscillates in).
//
// ── Why there is still a budget ──────────────────────────────────────────────
//
// Halving the error target roughly quadruples the visible tile count, and
// both the network (tile.openstreetmap.org has a usage policy) and texture
// memory pay for it. So the effective DPR is capped at 2 and the LOD
// resolution at a 4K pixel count: past that the eye cannot tell, the GPU can.

export type BasemapQuality = 'high' | 'balanced' | 'economy'
export type TileFormat = 'raster' | 'vector'

/** Above this the extra texels are invisible but the tile count is not. */
export const MAX_EFFECTIVE_DPR = 2
/** LOD is planned for at most a 4K frame's worth of pixels. */
export const MAX_LOD_PIXELS = 3840 * 2160

export interface LodResolution {
  /** Pixels the tile engine plans LOD for (device pixels, budget-capped). */
  width: number
  height: number
  /** Device pixels per CSS pixel actually used for LOD (≤ MAX_EFFECTIVE_DPR). */
  effectiveDpr: number
}

/**
 * The resolution to hand the tile engine for a canvas of `cssWidth × cssHeight`
 * on a screen with `dpr` device pixels per CSS pixel.
 */
export function lodResolution(cssWidth: number, cssHeight: number, dpr: number): LodResolution {
  const w = Math.max(1, cssWidth)
  const h = Math.max(1, cssHeight)
  let eff = Number.isFinite(dpr) && dpr > 0 ? Math.min(Math.max(dpr, 1), MAX_EFFECTIVE_DPR) : 1
  const pixels = w * h * eff * eff
  if (pixels > MAX_LOD_PIXELS) eff *= Math.sqrt(MAX_LOD_PIXELS / pixels)
  return { width: Math.round(w * eff), height: Math.round(h * eff), effectiveDpr: eff }
}

/**
 * Screen-space error target, in the device pixels `lodResolution` returns.
 * A texel is then displayed at (t/2, t] device pixels.
 *
 * Raster tiles are photographs of someone else's style: past ~1.5 device px
 * per texel their text visibly softens, so `high` is worth it there. Vector
 * tiles are painted by us at whatever level is asked for — their edges stay
 * hard at 2, so they never need the most expensive setting.
 */
export function errorTargetFor(quality: BasemapQuality, format: TileFormat): number {
  if (quality === 'economy') return 3.5
  if (quality === 'balanced' || format === 'vector') return 2
  return 1.5
}

/** One step down when the frame watch says the view is slow; null at the bottom. */
export function lowerQuality(q: BasemapQuality): BasemapQuality | null {
  return q === 'high' ? 'balanced' : q === 'balanced' ? 'economy' : null
}

/**
 * How many canvas pixels of a rasterised vector tile make one CSS pixel on
 * screen, on average. A texel shows at (t/2, t] device pixels — geometric mean
 * t/√2 — and a CSS pixel is `effectiveDpr` device pixels. Line widths and font
 * sizes are authored in CSS pixels and multiplied by this, so a 12 px label
 * reads as ~12 px whatever the screen.
 */
export function stylePixelScale(effectiveDpr: number, errorTarget: number): number {
  return (Math.max(1, effectiveDpr) * Math.SQRT2) / Math.max(0.5, errorTarget)
}

/** One step up; null at `ceiling`. */
export function raiseQuality(q: BasemapQuality, ceiling: BasemapQuality = 'balanced'): BasemapQuality | null {
  if (q === ceiling) return null
  if (q === 'economy') return 'balanced'
  return q === 'balanced' && ceiling === 'high' ? 'high' : null
}

export interface QualityGovernor {
  /** Feed one frame-watch verdict (≈ one a second). Returns the new level, or null. */
  step(current: BasemapQuality, verdict: { fps: number; slow: boolean }): BasemapQuality | null
  reset(): void
}

/**
 * Sharpness is lowered when the view is slow — and given BACK when it is fast
 * again.
 *
 * It used to be one-way (measured 2026-11): the frame watch reports "slow"
 * once a second for as long as it lasts, each report took one level off, and
 * nothing ever put it back but changing the map provider. Building the 3D
 * surroundings is a slow stretch on any machine, so two seconds into it the
 * map was at `economy` — a texel 2.2–3 device pixels wide at every distance —
 * and stayed there for the rest of the session.
 *
 * Coming back needs a clearly fast view (`fastFps`) for `fastWindows` reports
 * in a row. If the sharper level then turns out to be what made it slow, the
 * wait doubles each time, so a machine that cannot hold it settles at the
 * lower level instead of flickering between the two.
 */
export function createQualityGovernor(opts: { fastFps?: number; fastWindows?: number; maxWindows?: number } = {}): QualityGovernor {
  const fastFps = opts.fastFps ?? 40
  const base = opts.fastWindows ?? 3
  const max = opts.maxWindows ?? 60
  let need = base
  let fastRun = 0
  let raisedTo: BasemapQuality | null = null
  return {
    step(current, verdict) {
      if (verdict.slow) {
        fastRun = 0
        const lower = lowerQuality(current)
        // Dropping the level we had just raised to: it was too much.
        if (lower && raisedTo === current) need = Math.min(max, need * 2)
        raisedTo = null
        return lower
      }
      if (verdict.fps < fastFps) { fastRun = 0; return null }
      if (++fastRun < need) return null
      fastRun = 0
      const up = raiseQuality(current)
      if (up) raisedTo = up
      return up
    },
    reset() { need = base; fastRun = 0; raisedTo = null },
  }
}
