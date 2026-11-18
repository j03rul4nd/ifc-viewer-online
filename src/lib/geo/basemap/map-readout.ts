// ─── map-readout ──────────────────────────────────────────────────────────────
// Pure helpers behind the map status bar: the graphic scale and the cursor
// coordinate. Kept apart from React so the rounding rules are tested.

export interface ScaleBar {
  /** Bar length on screen, CSS px. */
  px: number
  /** What the bar measures, already rounded to a 1-2-5 step. */
  metres: number
  label: string
}

/**
 * A graphic scale for `metresPerPx` (true ground metres per CSS pixel at the
 * centre of the view): the longest 1-2-5 × 10ⁿ length that fits in `maxPx`.
 * Null when the ground is not under the centre (looking at the sky).
 *
 * In a perspective 3D view the scale is only true at the point it is measured
 * on — which is why it is measured at the centre and says "≈" in the UI.
 */
export function scaleBar(metresPerPx: number, maxPx = 110): ScaleBar | null {
  if (!Number.isFinite(metresPerPx) || metresPerPx <= 0) return null
  const maxM = metresPerPx * maxPx
  const pow = 10 ** Math.floor(Math.log10(maxM))
  const step = [5, 2, 1].map((k) => k * pow).find((m) => m <= maxM) ?? pow
  return { px: step / metresPerPx, metres: step, label: formatDistance(step) }
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${+(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km`
  if (m >= 1) return `${+m.toFixed(m >= 10 ? 0 : 1)} m`
  return `${Math.round(m * 100)} cm`
}

/**
 * Decimal degrees at a precision that matches what a pointer can mean: six
 * decimals ≈ 11 cm, below the size of one screen pixel at site scale. Order
 * is "lat, lon" — what Google Maps, QGIS's EPSG:4326 copy and a GPS read.
 */
export function formatLatLon(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`
}
