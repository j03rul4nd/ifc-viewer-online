// ─── scene-anchor ─────────────────────────────────────────────────────────────
// ONE place on Earth pinned to ONE point of the scene, for every data layer.
//
// Until now the only thing that could say "this scene is at 41.38 N, 2.18 E"
// was an IFC. A scan dropped on its own fell to "placed by hand" even when the
// file declared EPSG:25831 down to the millimetre, and there was nothing for a
// second scan — or a GeoJSON route, a WFS layer — to line up against.
//
// A SceneAnchor is that missing reference, independent of where it came from:
//
//   • from an IFC placement — the model's bbox centre is the anchored point
//     (the same one map mode lands its lat/lon on, geo-system.applyPlacement);
//   • from the FIRST georeferenced layer when no IFC is georeferenced — a LAS
//     with a CRS pins its own bbox centre to the scene origin;
//   • by hand — the user types a coordinate.
//
// Everything after that projects INTO the anchor: lon/lat/elevation → scene.
// The same rules pc-align obeys hold here: the anchor never moves once layers
// depend on it, and a vertical guess is labelled as one (`elevationM === null`
// means "heights are relative, not absolute").
//
// Scene convention (repo-wide, geo-math header): x = east-ish, y = up,
// z = −north-ish, with the plan rotated by `rotationDeg` exactly as the map's
// GeoPlacement rotation is.
//
// Pure module: proj4 (through crs.ts) and plain math only — no three.js.

import { resolveCrs, gridToWgs84, normalizeEpsgCode, type CrsDef } from './crs'
import { WGS84_RADIUS } from './geo-math'
import type { GeoPlacement } from './geo-types'

const DEG = Math.PI / 180

export type SceneAnchorSource = 'ifc' | 'pointcloud' | 'vector' | 'manual'

export interface SceneAnchor {
  /** WGS84 latitude of the anchored point, degrees. */
  lat: number
  /** WGS84 longitude, degrees. */
  lon: number
  /**
   * Absolute elevation (metres, in the source's vertical datum) that sits at
   * `scene.y`. Null when nothing stated one — layers then keep their own
   * relative heights and say so.
   */
  elevationM: number | null
  /** Scene point the lat/lon/elevation is pinned to. */
  scene: { x: number; y: number; z: number }
  /** Plan rotation of the scene against true north, degrees (GeoPlacement semantics). */
  rotationDeg: number
  /**
   * The projected grid the anchor was read from, when there was one. Layers in
   * the SAME grid use plain grid deltas — exact, no WGS84 round trip.
   */
  grid: { code: string; e: number; n: number } | null
  source: SceneAnchorSource
  /** Human label: file name, layer name. Shown in the UI as "anchored by …". */
  label: string
}

export interface ScenePoint { x: number; y: number; z: number }

// ── Builders ───────────────────────────────────────────────────────────────────

/**
 * Anchor from the map/IFC placement. `anchorScene` is the model bbox centre
 * (x, z) and `groundY` the scene height the placement's elevation refers to —
 * the same two numbers geo-system.applyPlacement uses, so a layer projected
 * through this anchor lands on the basemap.
 */
export function anchorFromPlacement(
  p: GeoPlacement,
  anchorScene: { x: number; z: number },
  groundY: number,
  label: string,
  elevationM: number | null = null,
): SceneAnchor {
  return {
    lat: p.lat, lon: p.lon,
    elevationM,
    // heightOffsetM raises the MODEL above the map, so the map's ground sits
    // that much below the model floor.
    scene: { x: anchorScene.x, y: groundY - p.heightOffsetM, z: anchorScene.z },
    rotationDeg: p.rotationDeg,
    grid: null,
    source: p.source === 'ifc' ? 'ifc' : 'manual',
    label,
  }
}

/** The minimal slice of a point cloud SourceFrame this module needs. */
export interface GridFrameLike {
  epsgCode: string | null
  unitScale: number
  min: { x: number; y: number; z: number }
  origin: { x: number; y: number; z: number }
}

/**
 * Anchor from a georeferenced point cloud: its bbox centre goes to the scene
 * origin, its FLOOR to y = 0 — so the basemap (which anchors its ground at
 * y = 0 when no model is loaded) sits under the scan rather than through it.
 *
 * The scene is laid out TRUE-north (rotationDeg 0): the map needs no rotation,
 * and the scan itself is turned by its grid convergence instead. Returns null
 * when the cloud has no CRS this build can resolve.
 */
export function anchorFromGridFrame(frame: GridFrameLike, label: string): SceneAnchor | null {
  const code = normalizeEpsgCode(frame.epsgCode)
  if (!code) return null
  const crs = resolveCrs(code)
  if (!crs.ok) return null
  const u = frame.unitScale
  const e = frame.origin.x * u
  const n = frame.origin.y * u
  const ll = gridToWgs84(crs.value, e, n)
  if (!ll.ok) return null
  return {
    lat: ll.value.lat, lon: ll.value.lon,
    elevationM: frame.min.z * u,
    scene: { x: 0, y: 0, z: 0 },
    rotationDeg: 0,
    grid: { code, e, n },
    source: 'pointcloud',
    label,
  }
}

/**
 * The GeoPlacement the map should use for an anchor that did NOT come from an
 * IFC — so opening the map after dropping only a scan shows the scan's street.
 */
export function anchorToPlacement(a: SceneAnchor): GeoPlacement {
  return {
    lat: a.lat, lon: a.lon,
    rotationDeg: a.rotationDeg,
    heightOffsetM: 0,
    source: 'manual',
    confidence: a.grid ? 'high' : 'approximate',
  }
}

// ── Projection ─────────────────────────────────────────────────────────────────

const WGS84_E2 = 0.00669437999014

/**
 * Local east/north offset in metres from (lat0, lon0) to (lat, lon), on the
 * ellipsoid's local radii. A sphere of equatorial radius (pc-align's enuOffset)
 * overstates north–south distances by ~0.25 % at mid latitudes — 2.5 m per
 * kilometre of route, which a GeoJSON corridor would show at once.
 */
export function enuFrom(lat0: number, lon0: number, lat: number, lon: number): { east: number; north: number } {
  const phi = lat0 * DEG
  const w = 1 - WGS84_E2 * Math.sin(phi) ** 2
  const nRadius = WGS84_RADIUS / Math.sqrt(w)
  const mRadius = (WGS84_RADIUS * (1 - WGS84_E2)) / (w * Math.sqrt(w))
  return {
    east: (lon - lon0) * DEG * nRadius * Math.cos(phi),
    north: (lat - lat0) * DEG * mRadius,
  }
}

/** True-north east/north offset → scene point, honouring the anchor rotation. */
function enuToScene(a: SceneAnchor, east: number, north: number, y: number): ScenePoint {
  const g = a.rotationDeg * DEG
  const cos = Math.cos(g), sin = Math.sin(g)
  // True-north frame → project plan: R(−γ), then project → scene (z = −north).
  const xP = east * cos + north * sin
  const yP = -east * sin + north * cos
  return { x: a.scene.x + xP, y, z: a.scene.z - yP }
}

/**
 * Scene height for an absolute elevation. With no anchor elevation the value
 * is taken as "metres above the anchor's ground" — the honest fallback for a
 * GeoJSON whose z means height above ground.
 */
export function sceneY(a: SceneAnchor, elevationM: number | null | undefined): number {
  const h = elevationM ?? null
  if (h === null || !Number.isFinite(h)) return a.scene.y
  return a.elevationM === null ? a.scene.y + h : a.scene.y + (h - a.elevationM)
}

/** WGS84 lon/lat (+ optional elevation) → scene. Tangent-plane: sub-cm within a few km. */
export function lonLatToScene(a: SceneAnchor, lon: number, lat: number, elevationM?: number | null): ScenePoint {
  const { east, north } = enuFrom(a.lat, a.lon, lat, lon)
  return enuToScene(a, east, north, sceneY(a, elevationM))
}

/**
 * Bearing of grid north against true north at (e, n), radians (east of north
 * positive). The meridian convergence a projected grid has away from its
 * central meridian — ~1° at the edge of a UTM zone, i.e. 17 m over a 1 km scan.
 */
export function gridConvergence(def: CrsDef, e: number, n: number): number {
  const step = 500
  const a = gridToWgs84(def, e, n)
  const b = gridToWgs84(def, e, n + step)
  if (!a.ok || !b.ok) return 0
  const d = enuFrom(a.value.lat, a.value.lon, b.value.lat, b.value.lon)
  if (d.east === 0 && d.north === 0) return 0
  return Math.atan2(d.east, d.north)
}

export interface GridPlacement {
  /** Scene point for the given grid coordinate. */
  origin: ScenePoint
  /** Yaw to apply to geometry laid out in grid axes (scene +Y, radians). */
  yawRad: number
  /** True when the grid is the anchor's own — plain deltas, no reprojection. */
  sameGrid: boolean
}

/**
 * Projected grid coordinate (metres) → scene, plus the yaw that turns the
 * grid's axes onto the scene's. Null when the CRS cannot be resolved.
 */
export function gridToScene(
  a: SceneAnchor, code: string, e: number, n: number, elevationM: number | null,
): GridPlacement | null {
  const norm = normalizeEpsgCode(code)
  if (!norm) return null
  const crs = resolveCrs(norm)
  if (!crs.ok) return null
  const y = sceneY(a, elevationM)

  if (a.grid && a.grid.code === norm) {
    // Same grid: the anchor's own convergence turns BOTH, so deltas are exact.
    const beta = gridConvergence(crs.value, a.grid.e, a.grid.n)
    const dE = e - a.grid.e, dN = n - a.grid.n
    const east = dE * Math.cos(beta) + dN * Math.sin(beta)
    const north = -dE * Math.sin(beta) + dN * Math.cos(beta)
    return { origin: enuToScene(a, east, north, y), yawRad: -(beta + a.rotationDeg * DEG), sameGrid: true }
  }

  const ll = gridToWgs84(crs.value, e, n)
  if (!ll.ok) return null
  const beta = gridConvergence(crs.value, e, n)
  return {
    origin: lonLatToScene(a, ll.value.lon, ll.value.lat, elevationM),
    yawRad: -(beta + a.rotationDeg * DEG),
    sameGrid: false,
  }
}
