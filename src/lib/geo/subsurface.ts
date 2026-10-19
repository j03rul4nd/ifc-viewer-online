// ─── Subsurface view ──────────────────────────────────────────────────────────
// How a model that lives BELOW the ground — a road in a tunnel, a cut-and-cover
// station, a metro platform 20 m down — is made visible in map mode.
//
// The model is placed at its true depth (ground-frame, never snapped to the
// DEM), and that is correct: a tunnel IS under the hill. What was missing is a
// way to look at it. The terrain is opaque, front-face only and depth-writing,
// and the camera stops at 88° — so a buried model was simply invisible.
//
// Three modes, one per question a user asks of an underground asset:
//   surface — the normal map. The ground hides what is under it.
//   xray    — every map surface turns translucent and stops writing depth: the
//             tunnel reads THROUGH the hill, along its whole length.
//   cut     — a pit is cut out of the map over the model's footprint, with
//             earth-coloured walls: the site-model view of a station box.
// Off the surface the camera may orbit under the ground plane and look up.
//
// Pure: plans, planes and wall geometry. geo-system owns the scene wiring.

import * as THREE from 'three'

export const SUBSURFACE_MODES = ['surface', 'xray', 'cut'] as const
export type SubsurfaceMode = (typeof SUBSURFACE_MODES)[number]

export function isSubsurfaceMode(v: unknown): v is SubsurfaceMode {
  return typeof v === 'string' && (SUBSURFACE_MODES as readonly string[]).includes(v)
}

/** The surface camera limit: just above the horizon, never under the map. */
export const SURFACE_MAX_POLAR_RAD = (88 * Math.PI) / 180
/** Below ground the camera may go round underneath and look up at the model. */
export const SUBSURFACE_MAX_POLAR_RAD = Math.PI - 0.02

export function maxPolarFor(mode: SubsurfaceMode): number {
  return mode === 'surface' ? SURFACE_MAX_POLAR_RAD : SUBSURFACE_MAX_POLAR_RAD
}

/** Opacity a map surface keeps in x-ray: enough to stay legible as context. */
export const XRAY_OPACITY = 0.28

export interface BoundsLike {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

/** Plan rectangle in WORLD x/z (the viewer is Y-up). */
export interface PlanRect { minX: number; maxX: number; minZ: number; maxZ: number }

export interface BurialAssessment {
  /** Share of the model's height that is under the ground, averaged over its plan (0–1). */
  buriedFraction: number
  /** Mean ground height minus the model's underside, metres (≥ 0). */
  depthM: number
  /** Worth offering the subsurface view for. */
  buried: boolean
}

/** At least this share under the ground before the view is offered. */
const BURIED_THRESHOLD = 0.4

/**
 * How much of the model is under the ground.
 *
 * Sampled on a 3×3 grid over its plan, because a tunnel under a hillside has
 * the ground at very different heights over its two ends, and one sample at
 * the centre would call a half-buried portal either way. Null when the map
 * has no ground to compare against.
 */
export function assessBurial(
  b: BoundsLike,
  groundAt: (x: number, z: number) => number | null,
): BurialAssessment | null {
  const h = Math.max(b.size.y, 1e-3)
  const bottom = b.center.y - b.size.y / 2
  let fraction = 0
  let ground = 0
  let n = 0
  for (const fx of [-0.4, 0, 0.4]) {
    for (const fz of [-0.4, 0, 0.4]) {
      const g = groundAt(b.center.x + fx * b.size.x, b.center.z + fz * b.size.z)
      if (g === null || !Number.isFinite(g)) continue
      fraction += Math.min(1, Math.max(0, (g - bottom) / h))
      ground += g
      n++
    }
  }
  if (n === 0) return null
  const buriedFraction = fraction / n
  return {
    buriedFraction,
    depthM: Math.max(0, ground / n - bottom),
    buried: buriedFraction >= BURIED_THRESHOLD,
  }
}

/**
 * The plan rectangle of the cut: the model's outline (or its bounds) plus a
 * margin, so the pit wall stands clear of the outer wall instead of grazing it.
 */
export function cutRect(
  b: BoundsLike,
  footprints?: Array<Array<{ x: number; z: number }>> | null,
): PlanRect {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const ring of footprints ?? []) {
    for (const p of ring) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
  }
  if (!Number.isFinite(minX)) {
    minX = b.center.x - b.size.x / 2; maxX = b.center.x + b.size.x / 2
    minZ = b.center.z - b.size.z / 2; maxZ = b.center.z + b.size.z / 2
  }
  const margin = Math.max(4, 0.06 * Math.hypot(maxX - minX, maxZ - minZ))
  return { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin }
}

/**
 * World-space clipping planes that REMOVE everything inside the rectangle when
 * used with `clipIntersection = true` — the same outward-normal recipe as the
 * basemap hole under the terrain patch. Three.js clips where the signed
 * distance is negative; inside the rect it is negative to all four planes, and
 * clipIntersection only clips what every plane agrees on.
 */
export function cutPlanes(r: PlanRect): THREE.Plane[] {
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -r.maxX),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), r.minX),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -r.maxZ),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), r.minZ),
  ]
}

/** Metres per earth band on the pit wall — a depth scale you can read at a glance. */
export const STRATUM_M = 3

/** Earth colours of the pit, alternating per stratum, darkening with depth. */
const EARTH_A = new THREE.Color(0x8f7354)
const EARTH_B = new THREE.Color(0x785e45)
const PIT_FLOOR = new THREE.Color(0x4a3a2b)

function stratumColor(bandIndex: number, depthBelowTopM: number): THREE.Color {
  const c = (bandIndex & 1 ? EARTH_B : EARTH_A).clone()
  return c.multiplyScalar(Math.max(0.5, 1 - depthBelowTopM * 0.012))
}

/**
 * The pit: four walls from the ground line down to `floorY`, and a floor.
 *
 * Each edge follows the ground: on a slope the top of the wall is the hillside,
 * not a horizontal line floating over it or sunk into it. Sampled every ~2 m,
 * capped so a 2 km tunnel does not emit thousands of quads.
 *
 * The walls are banded in {@link STRATUM_M} m strata measured from the floor,
 * as GEOMETRY with vertex colours — "five bands down" is 15 m wherever the
 * site is. A repeating texture was tried first and sampled black past its
 * first repeat on the WebGPU renderer; colours draw the same on both.
 *
 * The floor faces UP and is single-sided: from above it closes the pit (the
 * hole showed the empty background), from below it is culled, so orbiting
 * under the ground still sees the model.
 */
export function buildPitWalls(
  r: PlanRect,
  floorY: number,
  groundAt: (x: number, z: number) => number | null,
  fallbackTopY: number,
): THREE.BufferGeometry {
  const corners: Array<[number, number]> = [
    [r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ],
  ]
  const positions: number[] = []
  const colors: number[] = []
  const push = (x: number, y: number, z: number, c: THREE.Color): void => {
    positions.push(x, y, z)
    colors.push(c.r, c.g, c.b)
  }
  for (let e = 0; e < 4; e++) {
    const [ax, az] = corners[e]
    const [bx, bz] = corners[(e + 1) % 4]
    const len = Math.hypot(bx - ax, bz - az)
    const segs = Math.min(96, Math.max(1, Math.round(len / 2)))
    const column = (t: number): { x: number; z: number; top: number } => {
      const x = ax + (bx - ax) * t
      const z = az + (bz - az) * t
      const g = groundAt(x, z)
      return { x, z, top: Math.max(g !== null && Number.isFinite(g) ? g : fallbackTopY, floorY) }
    }
    let p0 = column(0)
    for (let i = 1; i <= segs; i++) {
      const p1 = column(i / segs)
      const maxTop = Math.max(p0.top, p1.top)
      const bands = Math.min(64, Math.ceil((maxTop - floorY) / STRATUM_M))
      for (let b = 0; b < bands; b++) {
        const y0 = floorY + b * STRATUM_M
        const y1 = y0 + STRATUM_M
        const lo0 = Math.min(y0, p0.top), hi0 = Math.min(y1, p0.top)
        const lo1 = Math.min(y0, p1.top), hi1 = Math.min(y1, p1.top)
        if (hi0 - lo0 <= 1e-4 && hi1 - lo1 <= 1e-4) continue
        const c = stratumColor(b, maxTop - y1)
        push(p0.x, hi0, p0.z, c); push(p0.x, lo0, p0.z, c); push(p1.x, hi1, p1.z, c)
        push(p0.x, lo0, p0.z, c); push(p1.x, lo1, p1.z, c); push(p1.x, hi1, p1.z, c)
      }
      p0 = p1
    }
  }
  // Floor, wound counter-clockwise seen from above (+y normal).
  const f = (x: number, z: number): void => push(x, floorY, z, PIT_FLOOR)
  f(r.minX, r.minZ); f(r.minX, r.maxZ); f(r.maxX, r.maxZ)
  f(r.minX, r.minZ); f(r.maxX, r.maxZ); f(r.maxX, r.minZ)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  // Walls draw from both sides, the floor only from above: two groups.
  const floorStart = positions.length / 3 - 6
  geo.addGroup(0, floorStart, 0)
  geo.addGroup(floorStart, 6, 1)
  return geo
}

/**
 * The pit's materials: [walls, floor]. Unlit on purpose — a lit wall facing
 * away from the sun came out black, and a pit is read by its depth, not its
 * shading.
 */
export function pitMaterial(): THREE.MeshBasicMaterial[] {
  const walls = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
  const floor = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide })
  return [walls, floor]
}

/**
 * Saved state of a material the subsurface view changed, to put it back.
 *
 * Only what the mode itself changed is restored. Something else may move the
 * rest in the meantime — the basemap's hole under the terrain is replaced when
 * the relief is toggled — and putting back a stale copy of that would cut the
 * flat map under a patch that no longer exists.
 */
export interface MaterialState {
  mode: SubsurfaceMode
  transparent: boolean
  opacity: number
  depthWrite: boolean
  clippingPlanes: THREE.Plane[] | null
  clipIntersection: boolean
}

export function saveMaterial(m: THREE.Material, mode: SubsurfaceMode): MaterialState {
  return {
    mode,
    transparent: m.transparent,
    opacity: m.opacity,
    depthWrite: m.depthWrite,
    clippingPlanes: m.clippingPlanes,
    clipIntersection: m.clipIntersection,
  }
}

export function restoreMaterial(m: THREE.Material, s: MaterialState): void {
  if (s.mode === 'xray') {
    m.transparent = s.transparent
    m.opacity = s.opacity
    m.depthWrite = s.depthWrite
  } else if (s.mode === 'cut') {
    m.clippingPlanes = s.clippingPlanes
    m.clipIntersection = s.clipIntersection
  }
  m.needsUpdate = true
}

/**
 * Put one material into the mode. Returns false when it was left alone.
 *
 * A material that already clips (the flat basemap under the terrain patch has
 * its own hole) is left out of the cut: clipping planes on one material can
 * only express ONE intersection, and replacing the basemap's would put flat
 * tiles back under the relief. Where it matters it is already under the
 * terrain, and the terrain is cut.
 */
export function applyMode(m: THREE.Material, mode: SubsurfaceMode, planes: THREE.Plane[] | null): boolean {
  if (mode === 'xray') {
    m.transparent = true
    m.opacity = m.opacity * XRAY_OPACITY
    m.depthWrite = false
    m.needsUpdate = true
    return true
  }
  if (mode === 'cut' && planes) {
    if (m.clippingPlanes && m.clippingPlanes.length > 0) return false
    m.clippingPlanes = planes
    m.clipIntersection = true
    m.needsUpdate = true
    return true
  }
  return false
}
