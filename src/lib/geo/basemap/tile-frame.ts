// ─── tile-frame ───────────────────────────────────────────────────────────────
// Where an XYZ tile's data comes from and where it lands. Pure and DOM-free on
// purpose: the Leaflet minimap AND the terrain worker use it, and the worker
// must not import Leaflet (it touches `window` on load).

/** Data zoom of OpenMapTiles: deeper tiles are painted from their z14 ancestor. */
const DATA_MAX_Z = 14

/**
 * XYZ zoom → content tile and where it sits in the drawn tile, as a
 * fraction of the tile: at z ≤ 14 the tile itself (offset 0, scale 1); above,
 * its z14 ancestor, `k = 2^(z−14)` tiles wide, shifted so the right sub-square
 * lands in the canvas.
 */
export function contentFrameFor(z: number, x: number, y: number) {
  const cz = Math.min(z, DATA_MAX_Z)
  const k = 2 ** (z - cz)
  return { cz, cx: Math.floor(x / k), cy: Math.floor(y / k), k, ox: -(x % k), oy: -(y % k) }
}
