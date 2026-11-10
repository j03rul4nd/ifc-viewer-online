// ─── terrain-detail ───────────────────────────────────────────────────────────
// Which pieces of map to repaint, sharper, on the relief around what the camera
// is looking at. Pure: no three.js, no DOM — the maths is tested on its own.
//
// ── Why the relief looked pixelated (measured 2026-11, Plaça de Catalunya) ────
//
// The flat basemap is a quadtree: it asks for finer tiles as the camera comes
// closer, so a texel stays 1–2 device pixels wide at any distance. The relief
// is ONE texture painted once: 3 072 px over the 3×3 patch, 0.9 m per texel.
// Device pixels covered by one texel, camera pitched 45°, 567 px tall canvas:
//
//   800 m  0.55     400 m  1.1     200 m  2.2
//   100 m  4.4       50 m  8.8      25 m  17.6
//
// So the relief is sharp from further than ~360 m and a blur inside that —
// which is where anyone looking at a building stands.
//
// A bigger texture does not fix it: one level sharper (6 144 px) is 200 MB on
// the GPU and still 4 px per texel at 50 m.
//
// ── The fix: a few nested squares that follow the view ───────────────────────
//
// Around the point being looked at, a small stack of squares is repainted from
// the SAME vector tiles the map already downloaded (data stops at z14, so there
// is nothing more to fetch): every square has the same pixel count, and each
// one covers twice the side of the one inside it, at half the sharpness. The
// innermost matches the screen — one texel per device pixel where the camera
// looks — and further out, where the ground is further away, a coarser square
// is exactly as sharp as it needs to be. Beyond the outermost the single big
// texture carries on, which from that distance is already fine.
//
// Squares snap to a grid a quarter of their side, so a small camera move
// repaints nothing; a square is addressed by (zoom, grid cell) and is the same
// square whoever asks for it.

/** The basemap's style tile is 512 px: zoom z has 512·2^z texels across the world. */
const STYLE_TILE_PX = 512
/** OpenMapTiles data stops here; deeper squares repaint this level's geometry. */
export const DETAIL_DATA_MAX_Z = 14
/** Sharpest square: ~2.8 cm per texel in Barcelona. The data is no finer. */
export const DETAIL_MAX_ZOOM = 21
/** A square moves in steps of this fraction of its side. */
const SNAP_FRACTION = 4
/**
 * How far past "one texel per pixel" the innermost square may be. 0.3 of a
 * zoom level = a texel of at most 1.23 device px where the camera looks.
 */
const ZOOM_SLACK = 0.3

/** Normalized mercator units (world = 1) per texel at a style zoom. */
export function detailTexelN(z: number): number {
  return 1 / (STYLE_TILE_PX * 2 ** z)
}

export interface DetailLevel {
  /** Style zoom the square is painted at (also its sharpness). */
  z: number
  /** Centre, centred-normalized mercator (x east, y north). */
  cx: number
  cy: number
  /** Half of its side, same units. */
  half: number
  /** Whether street names are painted into it (innermost square only). */
  labels: boolean
  /** Identity: same zoom, same cell, same labels = same pixels. */
  key: string
}

export interface DetailPlanInput {
  /** Ground point the view is centred on, centred-normalized mercator. */
  focus: { nx: number; ny: number }
  /** Normalized units one DEVICE pixel covers at the focus. */
  texelN: number
  /** The relief patch, same units. */
  patch: { minNx: number; maxNx: number; minNy: number; maxNy: number }
  /** Normalized units per texel of the patch's own big texture. */
  baseTexelN: number
  /** Pixels per side of every square. */
  size: number
  /** Most squares alive at once. */
  maxLevels: number
}

/**
 * The squares wanted for a view, sharpest first. Empty when the big texture is
 * already as sharp as the screen, or the view is centred off the relief.
 */
export function planDetailLevels(i: DetailPlanInput): DetailLevel[] {
  const { focus, patch } = i
  if (!(i.texelN > 0) || !(i.baseTexelN > 0) || i.maxLevels < 1) return []
  if (focus.nx < patch.minNx || focus.nx > patch.maxNx || focus.ny < patch.minNy || focus.ny > patch.maxNy) return []

  const zWanted = Math.log2(1 / (STYLE_TILE_PX * i.texelN))
  const zBase = Math.log2(1 / (STYLE_TILE_PX * i.baseTexelN))
  // Only squares strictly sharper than what is already there.
  const zMin = Math.floor(zBase + 1e-6) + 1
  const z0 = Math.min(DETAIL_MAX_ZOOM, Math.ceil(zWanted - ZOOM_SLACK))
  const out: DetailLevel[] = []
  for (let z = z0; z >= zMin && out.length < i.maxLevels; z--) {
    const half = (i.size * detailTexelN(z)) / 2
    const step = (half * 2) / SNAP_FRACTION
    const ix = Math.round(focus.nx / step)
    const iy = Math.round(focus.ny / step)
    const labels = z === z0
    out.push({ z, cx: ix * step, cy: iy * step, half, labels, key: `${z}/${ix}/${iy}${labels ? '/n' : ''}` })
  }
  return out
}

export interface DetailFrame {
  /** Content (vector) tile address. */
  z: number; x: number; y: number
  /** Where it lands on the square's canvas, px (may reach far outside it). */
  left: number; top: number; right: number; bottom: number
}

/**
 * The vector tiles a square is painted from, and where each lands on its
 * canvas. Same integer rounding as the basemap's own frames, so two tiles
 * share their boundary pixel exactly.
 */
export function detailFrames(level: Pick<DetailLevel, 'cx' | 'cy' | 'half'>, size: number): DetailFrame[] {
  const n = 2 ** DETAIL_DATA_MAX_Z
  const rx0 = level.cx - level.half, rx1 = level.cx + level.half
  const ry0 = level.cy - level.half, ry1 = level.cy + level.half
  const clamp = (v: number): number => Math.min(n - 1, Math.max(0, v))
  const eps = 1e-12
  const tx0 = clamp(Math.floor((rx0 + 0.5) * n)), tx1 = clamp(Math.ceil((rx1 + 0.5) * n - eps) - 1)
  // Slippy y grows south; normalized y grows north.
  const ty0 = clamp(Math.floor((0.5 - ry1) * n)), ty1 = clamp(Math.ceil((0.5 - ry0) * n - eps) - 1)
  const out: DetailFrame[] = []
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const bx0 = tx / n - 0.5, bx1 = (tx + 1) / n - 0.5
      const byN = 0.5 - ty / n, byS = 0.5 - (ty + 1) / n
      out.push({
        z: DETAIL_DATA_MAX_Z, x: tx, y: ty,
        left: Math.round((size * (bx0 - rx0)) / (rx1 - rx0)),
        right: Math.round((size * (bx1 - rx0)) / (rx1 - rx0)),
        top: Math.round((size * (ry1 - byN)) / (ry1 - ry0)),
        bottom: Math.round((size * (ry1 - byS)) / (ry1 - ry0)),
      })
    }
  }
  return out
}

/**
 * A square in the patch's own texture coordinates (u east, v north, 0…1):
 * centre and the factor that takes a uv offset from it to −1…1 across the
 * square. What the relief's shader needs, and nothing else.
 */
export function detailRectUv(
  level: Pick<DetailLevel, 'cx' | 'cy' | 'half'>,
  patch: { minNx: number; maxNx: number; minNy: number; maxNy: number },
): { u: number; v: number; scale: number } {
  const w = patch.maxNx - patch.minNx
  return {
    u: (level.cx - patch.minNx) / w,
    v: (level.cy - patch.minNy) / (patch.maxNy - patch.minNy),
    scale: w / level.half,
  }
}

/** Squares per device class: side in pixels and how many. */
export function detailBudget(constrained: boolean): { size: number; maxLevels: number } {
  // 3 × 2048² with mipmaps ≈ 67 MB on the GPU; 2 × 1024² ≈ 11 MB on a phone.
  return constrained ? { size: 1024, maxLevels: 2 } : { size: 2048, maxLevels: 3 }
}
