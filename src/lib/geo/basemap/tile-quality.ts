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
