// ─── geo-math ─────────────────────────────────────────────────────────────────
// Pure projection / rotation math for GIS map mode. NO three.js imports — every
// function here is unit-testable in plain node/jsdom.
//
// Conventions (normative — docs/GIS_MAP_INTEGRATION_PLAN.md §4):
//   • Scene frame: Y-up metres. After the basemap group transform, EAST = +X and
//     NORTH = −Z (before any yaw).
//   • Planar tile space (3d-tiles-renderer GeneratedSurfacePlugin, center:true,
//     EPSG:3857): X = east, Y = north, plane normal +Z. The whole mercator world
//     spans exactly 1 unit in X and Y, centred at (0,0):
//       nx = λrad / 2π        ∈ [−0.5, 0.5]
//       ny = ln(tan(π/4+φ/2)) / 2π
//   • 1 scene unit = 1 TRUE metre at the anchor latitude. The basemap group is
//     scaled by WEB_MERCATOR_WORLD_M × cos(φ₀) — we scale the MAP, never the model.

export const WGS84_RADIUS = 6378137
export const WEB_MERCATOR_WORLD_M = 2 * Math.PI * WGS84_RADIUS // 40 075 016.6855785 m
export const MERCATOR_MAX_LAT = 85.0511287798066

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

// ── Basic projections ──────────────────────────────────────────────────────────

export interface LatLon {
  /** degrees */
  lat: number
  /** degrees */
  lon: number
}

/** WGS84 degrees → spherical Web Mercator metres (EPSG:3857). */
export function latLonToMercator(lat: number, lon: number): { mx: number; my: number } {
  const phi = clampLat(lat) * DEG
  return {
    mx: WGS84_RADIUS * lon * DEG,
    my: WGS84_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  }
}

/** Spherical Web Mercator metres → WGS84 degrees. */
export function mercatorToLatLon(mx: number, my: number): LatLon {
  return {
    lon: (mx / WGS84_RADIUS) * RAD,
    lat: (2 * Math.atan(Math.exp(my / WGS84_RADIUS)) - Math.PI / 2) * RAD,
  }
}

/**
 * WGS84 degrees → centred normalized planar coords used by the tile engine
 * (GeneratedSurfacePlugin planar world with center:true). World spans 1×1.
 */
export function latLonToNormalized(lat: number, lon: number): { nx: number; ny: number } {
  const { mx, my } = latLonToMercator(lat, lon)
  return { nx: mx / WEB_MERCATOR_WORLD_M, ny: my / WEB_MERCATOR_WORLD_M }
}

/** Inverse of latLonToNormalized. */
export function normalizedToLatLon(nx: number, ny: number): LatLon {
  return mercatorToLatLon(nx * WEB_MERCATOR_WORLD_M, ny * WEB_MERCATOR_WORLD_M)
}

/** Metres per pixel of a 256-px web-mercator tile at the given latitude/zoom. */
export function groundResolution(lat: number, zoom: number): number {
  return (Math.cos(clampLat(lat) * DEG) * WEB_MERCATOR_WORLD_M) / (256 * Math.pow(2, zoom))
}

/**
 * True ground metres → normalized planar units, at the anchor latitude.
 *
 * THE DIRECTION OF THE COSINE IS THE WHOLE POINT, and it is easy to get
 * backwards. Mercator inflates distance by 1/cos(lat), so a ground metre is
 * `1/cos` mercator metres, which is `1/(cos · WORLD_M)` normalized. `geoRoot`
 * then scales by `WORLD_M · cos` (see composeGeoRootTransform) and the metre
 * comes back out a metre.
 *
 * Flip it and everything still renders — just at cos²(lat) of its real size,
 * which is right at the equator, 43% at Paris and invisible in Tromsø. Nothing
 * throws, no test on a single module notices, and the only symptom is that the
 * cars look like toys. That is exactly why this lives here and not as a private
 * copy in each module that needs it.
 */
export function metresToNormalized(lat: number): number {
  return 1 / (WEB_MERCATOR_WORLD_M * cosLatScale(lat))
}

/** Mercator-to-true-metre compensation factor at the anchor latitude. */
export function cosLatScale(lat: number): number {
  return Math.cos(clampLat(lat) * DEG)
}

export function clampLat(lat: number): number {
  return Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat))
}

// ── Slippy tiles ───────────────────────────────────────────────────────────────

/** WGS84 → slippy tile indices at zoom z (XYZ scheme: y grows southward). */
export function latLonToTile(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z)
  const phi = clampLat(lat) * DEG
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n)
  return {
    x: Math.min(n - 1, Math.max(0, x)),
    y: Math.min(n - 1, Math.max(0, y)),
  }
}

/**
 * WGS84 → FRACTIONAL slippy tile coordinates at zoom z (no flooring).
 * Integer part = tile index; fractional part = position inside the tile.
 * Used for sub-pixel (bilinear) DEM sampling.
 */
export function latLonToTileFloat(lat: number, lon: number, z: number): { fx: number; fy: number } {
  const n = Math.pow(2, z)
  const phi = clampLat(lat) * DEG
  return {
    fx: ((lon + 180) / 360) * n,
    fy: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n,
  }
}

/**
 * WGS84 → tile indices + pixel position inside that tile (for DEM sampling).
 * Pixel origin is the tile's top-left (north-west) corner, matching PNG rows.
 */
export function latLonToTilePixel(
  lat: number, lon: number, z: number, tileDimension = 256,
): { x: number; y: number; px: number; py: number } {
  const n = Math.pow(2, z)
  const phi = clampLat(lat) * DEG
  const fx = ((lon + 180) / 360) * n
  const fy = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n
  const x = Math.min(n - 1, Math.max(0, Math.floor(fx)))
  const y = Math.min(n - 1, Math.max(0, Math.floor(fy)))
  return {
    x, y,
    px: Math.min(tileDimension - 1, Math.max(0, Math.floor((fx - x) * tileDimension))),
    py: Math.min(tileDimension - 1, Math.max(0, Math.floor((fy - y) * tileDimension))),
  }
}

// ── IFC angle helpers ──────────────────────────────────────────────────────────

/**
 * IfcCompoundPlaneAngleMeasure → decimal degrees.
 * Components are [degrees, minutes, seconds, (optional) millionths-of-second].
 * Per the IFC spec all components carry the sign of the first non-zero one —
 * but real files are sloppy, so the sign is taken from the first non-zero
 * component and applied to the absolute values of the rest.
 * Returns null for empty/invalid input.
 */
export function compoundAngleToDegrees(components: ReadonlyArray<number> | null | undefined): number | null {
  if (!components || components.length === 0) return null
  const vals = components.slice(0, 4)
  if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null
  const firstNonZero = vals.find((v) => v !== 0)
  const sign = firstNonZero !== undefined && firstNonZero < 0 ? -1 : 1
  const [d = 0, m = 0, s = 0, u = 0] = vals.map(Math.abs)
  return sign * (d + m / 60 + s / 3600 + u / 3.6e9)
}

/**
 * Decimal degrees → IfcCompoundPlaneAngleMeasure `[deg, min, sec, millionths]`.
 * The inverse of `compoundAngleToDegrees`, needed to write georeferencing back
 * into an IFC (`IfcSite.RefLatitude` / `RefLongitude`).
 *
 * Two spec details that are easy to get wrong:
 *  • Per IFC, EVERY non-zero component carries the sign — not just the first.
 *    A southern latitude is `[-41, -22, -46, ...]`, and a file that signs only
 *    the degrees is a file other tools may misread.
 *  • The four components must recompose to the input. Rounding each one
 *    independently lets error accumulate, so seconds are derived from the
 *    remainder and the millionths absorb what is left; a carry (60.0000 s after
 *    rounding) is propagated rather than written out as an invalid 60.
 *
 * Always returns all four components: the 4th is optional in the schema but
 * writing it costs nothing and preserves ~0.3 mm of precision.
 */
export function degreesToCompoundAngle(degrees: number): [number, number, number, number] | null {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return null
  const sign = degrees < 0 ? -1 : 1
  const abs = Math.abs(degrees)

  let d = Math.floor(abs)
  let remainingMin = (abs - d) * 60
  let m = Math.floor(remainingMin)
  let remainingSec = (remainingMin - m) * 60
  let s = Math.floor(remainingSec)
  let u = Math.round((remainingSec - s) * 1e6)

  // Carry propagation — rounding the millionths can spill into seconds.
  if (u >= 1e6) { u -= 1e6; s += 1 }
  if (s >= 60)  { s -= 60;  m += 1 }
  if (m >= 60)  { m -= 60;  d += 1 }

  return [sign * d, sign * m, sign * s, sign * u]
}

/**
 * Rotation from IfcMapConversion XAxisAbscissa/XAxisOrdinate (radians, CCW
 * from grid east). Normalizes non-unit vectors. Returns null for a zero vector.
 */
export function rotationFromXAxis(abscissa: number, ordinate: number): number | null {
  if (!Number.isFinite(abscissa) || !Number.isFinite(ordinate)) return null
  if (abscissa === 0 && ordinate === 0) return null
  return Math.atan2(ordinate, abscissa)
}

/**
 * TrueNorth direction ratios (x, y) of an IfcGeometricRepresentationContext →
 * plan rotation in radians. TrueNorth points from the project +Y axis toward
 * geographic north; γ = atan2(x, y) is the CW angle from project north to true
 * north (0 when TrueNorth = (0, 1)).
 */
export function rotationFromTrueNorth(x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (x === 0 && y === 0) return null
  return Math.atan2(x, y)
}

/** Normalize degrees into [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360
  return d < 0 ? d + 360 : d
}

/** Format a coordinate with a fixed '.' decimal separator (geodetic convention). */
export function formatCoord(value: number, digits = 5): string {
  return value.toFixed(digits)
}

// ── geoRoot transform composition (THE single placement code path) ────────────

export interface ComposeInput {
  placement: { lat: number; lon: number; rotationDeg: number; heightOffsetM: number }
  /** Scene-space plan position where the anchor must land (model bbox centre). */
  anchorScene: { x: number; z: number }
  /** Scene Y of the model's bbox bottom — the map plane sits here minus offset. */
  modelMinY: number
}

/**
 * Compose the basemap group TRS so that:
 *   • the geographic anchor (placement.lat/lon) lands exactly at
 *     (anchorScene.x, groundY, anchorScene.z) with groundY = modelMinY − heightOffsetM,
 *   • 1 scene unit = 1 true metre at the anchor latitude (cos φ₀ compensation),
 *   • the tile plane lies on the scene ground (tilt −π/2 about X), then yawed by
 *     +rotationDeg about scene +Y around the anchor point.
 *
 * Derivation: M = T(anchorWorld) · Ry(ψ) · S · Rx(−π/2) · T(−normAnchor) collapses
 * to a plain TRS because S is uniform:  position = anchorWorld − R·(S·normAnchor).
 * Rx(−π/2): (x,y,z)→(x,z,−y).  Ry(ψ): (x,y,z)→(x cosψ + z sinψ, y, −x sinψ + z cosψ).
 */
export function composeGeoRootTransform(input: ComposeInput): import('./geo-types').GeoRootTransform {
  const { placement, anchorScene, modelMinY } = input
  const scale = WEB_MERCATOR_WORLD_M * cosLatScale(placement.lat)
  const yawRad = placement.rotationDeg * DEG
  const groundY = modelMinY - placement.heightOffsetM

  const { nx, ny } = latLonToNormalized(placement.lat, placement.lon)
  // R·(S·normAnchor) with normAnchor = (nx, ny, 0):
  const ax = scale * nx
  const az = -scale * ny                        // after Rx(−π/2): (nx, 0, −ny)
  const cos = Math.cos(yawRad)
  const sin = Math.sin(yawRad)
  const rx = ax * cos + az * sin                // after Ry(ψ)
  const rz = -ax * sin + az * cos

  return {
    position: { x: anchorScene.x - rx, y: groundY, z: anchorScene.z - rz },
    yawRad,
    tiltRad: -Math.PI / 2,
    scale,
  }
}

/** Scene-space EAST direction of a yawed map (unit vector, y = 0). */
export function eastDirection(yawRad: number): { x: number; z: number } {
  return { x: Math.cos(yawRad), z: -Math.sin(yawRad) }
}

/** Scene-space NORTH direction of a yawed map (unit vector, y = 0). */
export function northDirection(yawRad: number): { x: number; z: number } {
  return { x: -Math.sin(yawRad), z: -Math.cos(yawRad) }
}

/**
 * Pan the placement by a scene-space ground drag (map-grab metaphor: the ground
 * follows the pointer, the model stays fixed → the model's geographic position
 * moves OPPOSITE to the drag).
 *
 * dxScene/dzScene are the pointer's ground-plane displacement in scene metres.
 */
export function panPlacement<P extends { lat: number; lon: number; rotationDeg: number }>(
  placement: P, dxScene: number, dzScene: number,
): P {
  const yaw = placement.rotationDeg * DEG
  const e = eastDirection(yaw)
  const n = northDirection(yaw)
  // Project the drag onto the map's east/north axes, then invert (map-grab).
  const dEast = -(dxScene * e.x + dzScene * e.z)
  const dNorth = -(dxScene * n.x + dzScene * n.z)

  const phi = clampLat(placement.lat) * DEG
  const dLat = (dNorth / WGS84_RADIUS) * RAD
  const dLon = (dEast / (WGS84_RADIUS * Math.cos(phi))) * RAD
  return {
    ...placement,
    lat: clampLat(placement.lat + dLat),
    lon: wrapLon(placement.lon + dLon),
  }
}

/** Wrap longitude into [−180, 180). */
export function wrapLon(lon: number): number {
  const l = ((lon + 180) % 360 + 360) % 360 - 180
  return l
}
