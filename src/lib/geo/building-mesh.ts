// ─── building-mesh ────────────────────────────────────────────────────────────
// Extrudes OSM footprints into ONE merged mesh in the normalized planar frame
// (the same frame as the basemap tiles and the terrain patch, so it inherits
// placement, yaw and scale from geoRoot for free).
//
// Why one merged geometry rather than a mesh per building: a town centre is
// easily 2000 footprints, and 2000 draw calls costs more than the whole IFC
// model. Merging makes buildings a single draw call, and since they are pure
// context — never selectable, never measured — nothing is lost by giving up
// per-building objects.
//
// Bases are FLAT per building, sampled at the footprint centroid, plus a skirt
// pushed below ground. Following the terrain per-vertex would shear each
// building into a parallelogram on a slope; a flat base with a hidden skirt is
// what reads as correct, and is what every city renderer does.

import * as THREE from 'three'
import { latLonToNormalized, WEB_MERCATOR_WORLD_M, cosLatScale } from './geo-math'
import { facadeColor, storeyBanding, storeysFor } from './feature-variation'
import { createGroundFrame } from './ground-frame'
import type { BuildingHeight } from './buildings'
import type { FeatureStyle } from './osm-features'

/**
 * What this module needs from a building. Structural rather than tied to one
 * parser, so both the plain footprint list and the richer OSM feature stream
 * can be extruded by the same code.
 */
export interface BuildingLike {
  /** Stable id — seeds the deterministic facade variation. */
  id?: string
  ring: ReadonlyArray<{ lat: number; lon: number }>
  height: BuildingHeight
  /** Roof shape and tagged colours; absent means a plain flat grey block. */
  style?: FeatureStyle
}

/** Parapet upstand on a flat roof, metres. */
const PARAPET_M = 0.9

/** How far the base is pushed below the sampled ground, metres. */
const SKIRT_M = 6

export interface BuildingMeshResult {
  geometry: THREE.BufferGeometry
  /** Buildings actually included (some rings fail triangulation). */
  count: number
  /** How many of those had an estimated rather than surveyed height. */
  estimatedCount: number
  /**
   * Which slice of the merged buffer each building owns, in vertex indices and
   * in build order. The whole neighbourhood is ONE geometry for the sake of
   * draw calls, which costs the ability to tell what was clicked — this hands
   * that back: a hit vertex index maps to the building it belongs to.
   */
  ranges: BuildingRange[]
}

export interface BuildingRange {
  id: string
  /** First vertex index (inclusive). */
  start: number
  /** Last vertex index (exclusive). */
  end: number
}

/**
 * How much of a facade to model.
 *
 * 'simple'   — one quad per wall with a top-to-bottom gradient. Cheapest, and
 *              the right answer when the surroundings are just context.
 * 'detailed' — storey-by-storey bands (glazing vs spandrel), a darker ground
 *              floor and a parapet lip. Reads as a street of buildings rather
 *              than a block of extrusions, at roughly 6x the triangles — still
 *              one merged geometry and one draw call.
 */
export type BuildingDetail = 'simple' | 'detailed' | 'showcase'

export interface BuildingMeshOptions {
  /** Anchor latitude — sets the metres→normalized scale for the whole patch. */
  anchorLat: number
  /** Facade modelling level. Defaults to 'simple'. */
  detail?: BuildingDetail
  /**
   * True when a lit material will shade the result. Directional shading is then
   * left OUT of the vertex colours — baking it in as well would light every
   * facade twice, from two different suns.
   */
  lit?: boolean
  /**
   * Ground height in METRES at a normalized position, or null for a flat map.
   * Supplied by the terrain patch when 3D terrain is on.
   */
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  /**
   * Elevation the map plane represents, metres. Building bases are expressed
   * relative to it, exactly like terrain vertices, so everything shares a datum.
   */
  anchorElevationM?: number
  /** Vertical exaggeration the terrain is displaying — see ground-frame. */
  exaggeration?: number
}

/**
 * Build the merged geometry. Returns null when nothing survived — callers
 * should treat that as "no buildings here", not an error.
 */
export function buildBuildingsGeometry(
  footprints: ReadonlyArray<BuildingLike>,
  opts: BuildingMeshOptions,
): BuildingMeshResult | null {
  const metresToNormalized = 1 / (WEB_MERCATOR_WORLD_M * cosLatScale(opts.anchorLat))
  const frame = createGroundFrame({
    anchorLat: opts.anchorLat,
    anchorElevationM: opts.anchorElevationM,
    sampleGroundM: opts.sampleGroundM,
    exaggeration: opts.exaggeration,
  })
  // 'showcase' is 'detailed' plus authored props; the facades are the same.
  const detailed = opts.detail === 'detailed' || opts.detail === 'showcase'
  const lit = opts.lit === true

  const positions: number[] = []
  const ranges: BuildingRange[] = []
  const normals: number[] = []
  // Vertex colours carry a subtle height gradient, so a block of flat-topped
  // extrusions still reads as three-dimensional under an unlit material.
  const colors: number[] = []

  let count = 0
  let estimatedCount = 0

  for (const b of footprints) {
    // Project the ring into the normalized frame once.
    const ring2d: THREE.Vector2[] = b.ring.map((p) => {
      const { nx, ny } = latLonToNormalized(p.lat, p.lon)
      return new THREE.Vector2(nx, ny)
    })
    if (ring2d.length < 3) continue

    // ShapeUtils triangulates counter-clockwise contours; an OSM ring can be
    // either winding, and the wrong one yields zero triangles (a silent hole).
    if (THREE.ShapeUtils.isClockWise(ring2d)) ring2d.reverse()

    // Triangulate in METRES, not normalized units. A 20 m wall is ~3e-8 in
    // normalized space, which is close enough to earcut's degeneracy epsilon
    // that most footprints collapse to zero triangles — measured: only ~11 %
    // of a real city block survived before this. The triangulation is
    // topological, so the indices it returns apply unchanged to the normalized
    // ring; only the numbers fed to the solver need to be well-scaled.
    const metricRing = ring2d.map((p) =>
      new THREE.Vector2(p.x / metresToNormalized, p.y / metresToNormalized),
    )

    let faces: number[][]
    try {
      faces = THREE.ShapeUtils.triangulateShape(metricRing, [])
    } catch {
      continue // self-intersecting footprint — skip it, never fail the batch
    }
    if (faces.length === 0) continue

    const rangeStart = positions.length / 3

    // Ground under the WHOLE FOOTPRINT, not just under the centroid.
    //
    // A building is a rigid box: it has one base elevation, and the question is
    // which one. The centroid was the wrong answer on any slope — half the
    // footprint ends up below the ground it was measured at, so the downhill
    // corner floats and the uphill corner is buried, and a 6 m skirt only hides
    // it while the fall across the plan stays under 6 m.
    //
    // The right answer is the LOWEST ground the footprint covers: that is where
    // the building meets the ground on its downhill side, which is the edge the
    // eye checks. The uphill side is then correctly cut into the slope, and the
    // skirt is sized from the actual fall so it always reaches the hillside.
    const centroid = ringCentroid(ring2d)
    const { minM, maxM } = frame.groundRangeM(ring2d)
    const groundM = minM
    const skirtM = SKIRT_M + Math.max(0, maxM - minM)
    const baseM = groundM + b.height.minHeightM
    const topM = groundM + b.height.heightM

    // Heights stay TRUE metres while the ground follows the exaggerated relief:
    // a 20 m building is 20 m tall whatever the terrain slider says.
    const groundZ = frame.zAtElevationM(groundM)
    const baseZ = groundZ + (b.height.minHeightM - skirtM) * metresToNormalized
    const topZ = groundZ + b.height.heightM * metresToNormalized

    // ── Roof ───────────────────────────────────────────────────────────────────
    // A shaped roof eats into the tagged total height rather than adding to it:
    // `height` in OSM is to the ridge, so raising walls to it and then stacking
    // a roof on top would make every gabled building too tall.
    const roofShape = b.style?.roofShape ?? 'flat'
    const roofM = roofShape === 'flat' ? 0 : Math.min(b.style?.roofHeightM ?? 0, (topM - baseM) * 0.5)
    const eaveZ = topZ - roofM * metresToNormalized
    // A tagged colour always wins. Without one, pick a deterministic muted
    // facade tone: a block of identical grey extrusions is the clearest tell
    // that a scene was generated, and real streets are not one colour.
    const seed = b.id ?? `${b.ring[0].lat.toFixed(6)},${b.ring[0].lon.toFixed(6)}`
    const roofTint = b.style?.roofColor ? hexToRgb(b.style.roofColor) : null
    const wallTint = b.style?.wallColor ? hexToRgb(b.style.wallColor) : facadeColor(seed)
    // Lit: the shader does the light, so these are albedo only.
    const roofBase = lit ? 0.88 : roofShade(b.height.heightM)

    if (roofShape === 'flat' || roofM <= 0) {
      // The roof surface sits BELOW the top of the wall in detailed mode, so
      // the wall continues past it as a parapet. A flat roof flush with its
      // walls is the "sheared box" look — every real flat roof has an upstand,
      // and that one edge is what gives a skyline its bite.
      const parapet = detailed
        ? Math.min(PARAPET_M, (topM - baseM) * 0.08) * metresToNormalized
        : 0
      const capZ = topZ - parapet
      for (const [a, bIdx, c] of faces) {
        pushTriangle(
          positions, normals, colors,
          ring2d[a], ring2d[bIdx], ring2d[c],
          capZ, capZ, capZ,
          0, 0, 1,
          // Roof deck reads darker than the parapet coping that surrounds it.
          tinted(roofBase * (detailed ? 0.9 : 1), roofTint),
        )
      }
    } else if (roofShape === 'pyramidal') {
      // Fan every edge up to the centroid — works for any convex-ish outline.
      const apex = new THREE.Vector2(centroid.x, centroid.y)
      for (let i = 0; i < ring2d.length; i++) {
        const p0 = ring2d[i]
        const p1 = ring2d[(i + 1) % ring2d.length]
        pushTriangle(
          positions, normals, colors, p0, p1, apex, eaveZ, eaveZ, topZ,
          0, 0, 1, tinted(roofBase * 0.94, roofTint),
        )
      }
    } else {
      // Gabled: a ridge along the footprint's LONG axis. Running it along the
      // short axis is the classic giveaway of a fake roof — real ridges follow
      // the building, so the axis is measured rather than assumed.
      const axis = longestAxis(ring2d)
      const half = ring2d.map((p) => signedOffset(p, centroid, axis))
      for (let i = 0; i < ring2d.length; i++) {
        const j = (i + 1) % ring2d.length
        const p0 = ring2d[i]
        const p1 = ring2d[j]
        // Ridge points are each eave point projected onto the ridge line.
        const r0 = projectToAxis(p0, centroid, axis)
        const r1 = projectToAxis(p1, centroid, axis)
        const shade = roofBase * (half[i] + half[j] > 0 ? 1.0 : 0.86)
        pushTriangle(positions, normals, colors, p0, p1, r1, eaveZ, eaveZ, topZ, 0, 0, 1, tinted(shade, roofTint))
        pushTriangle(positions, normals, colors, p0, r1, r0, eaveZ, topZ, topZ, 0, 0, 1, tinted(shade, roofTint))
      }
    }

    // ── Walls ──────────────────────────────────────────────────────────────────
    for (let i = 0; i < ring2d.length; i++) {
      const p0 = ring2d[i]
      const p1 = ring2d[(i + 1) % ring2d.length]
      const ex = p1.x - p0.x
      const ey = p1.y - p0.y
      const len = Math.hypot(ex, ey)
      if (len === 0) continue
      // Outward normal of a CCW ring is the edge rotated -90°.
      const nx = ey / len
      const ny = -ex / len

      // Storey banding gives the eye a sense of scale: a flat wall of one
      // colour reads as a solid block at any distance, while faint floor lines
      // say "eight storeys" rather than "one tall thing".
      const storeys = storeysFor(topM - roofM - baseM)
      const face = lit ? 1 : wallShade(nx, ny)
      const shadeTop = face * storeyBanding(1, storeys)
      // Contact shading at grade survives lighting: it is ambient occlusion,
      // not sun, and it is what stops a building from floating.
      const shadeBottom = face * (lit ? 0.86 : 0.72) * storeyBanding(0, storeys)

      // Walls rise to the EAVES, not the ridge — the roof covers the rest.
      const wallTopZ = eaveZ

      if (detailed) {
        pushDetailedWall(
          positions, normals, colors, p0, p1, nx, ny,
          baseZ, wallTopZ, storeys, face, wallTint,
        )
        continue
      }
      pushTriangle(positions, normals, colors, p0, p1, p1, baseZ, baseZ, wallTopZ, nx, ny, 0,
        tintedTriple([shadeBottom, shadeBottom, shadeTop], wallTint))
      pushTriangle(positions, normals, colors, p0, p1, p0, baseZ, wallTopZ, wallTopZ, nx, ny, 0,
        tintedTriple([shadeBottom, shadeTop, shadeTop], wallTint))
    }

    if (b.id) ranges.push({ id: b.id, start: rangeStart, end: positions.length / 3 })
    count++
    if (b.height.estimated) estimatedCount++
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()

  return { geometry, count, estimatedCount, ranges }
}

/** Area-weighted centroid of a simple polygon (falls back to the mean). */
function ringCentroid(ring: ReadonlyArray<THREE.Vector2>): { x: number; y: number } {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const cross = a.x * b.y - b.x * a.y
    area += cross
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  if (Math.abs(area) < 1e-18) {
    // Degenerate (collinear) ring — the mean is the only sane answer.
    const mean = ring.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
    return { x: mean.x / ring.length, y: mean.y / ring.length }
  }
  return { x: cx / (3 * area), y: cy / (3 * area) }
}

/**
 * Fixed directional shading for walls, matching the terrain's default
 * north-west light so buildings and ground agree about where the sun is.
 */
function wallShade(nx: number, ny: number): number {
  const lx = -0.707
  const ly = 0.707
  const ndotl = Math.max(0, nx * lx + ny * ly)
  return 0.42 + 0.48 * ndotl
}

/** Taller buildings get a slightly lighter roof — cheap depth cue from above. */
function roofShade(heightM: number): number {
  return 0.62 + 0.22 * Math.min(1, heightM / 60)
}

/** '#rrggbb' → linear-ish 0-1 triple, or null when unparseable. */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * Combine a shade with an optional tagged colour. Without a colour the shade
 * IS the greyscale value; with one it modulates the colour, so a tagged
 * terracotta roof still shows relief instead of turning into a flat sticker.
 */
function tinted(shade: number, rgb: [number, number, number] | null): ShadedVertices {
  const c: [number, number, number] = rgb
    ? [clamp1(rgb[0] * shade), clamp1(rgb[1] * shade), clamp1(rgb[2] * shade)]
    : [clamp1(shade), clamp1(shade), clamp1(shade)]
  return [c, c, c]
}

/**
 * Colour channels are 0–1. Shades above 1 are deliberate (a lit spandrel is
 * brighter than the base tone), so the clamp lives here rather than forcing
 * every caller to stay under one — a tagged near-white wall must not wrap.
 */
function clamp1(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function tintedTriple(
  shades: [number, number, number], rgb: [number, number, number] | null,
): ShadedVertices {
  return shades.map((s) => (
    rgb
      ? [clamp1(rgb[0] * s), clamp1(rgb[1] * s), clamp1(rgb[2] * s)]
      : [clamp1(s), clamp1(s), clamp1(s)]
  ) as [number, number, number]) as ShadedVertices
}

/** Per-vertex RGB for a triangle, when the three corners differ in colour. */
type ShadedVertices = [
  [number, number, number], [number, number, number], [number, number, number],
]

/**
 * Fraction of a storey taken by the glazing band. The rest is spandrel — the
 * solid strip between one floor's windows and the next.
 */
const WINDOW_BAND = 0.58

/** Storeys modelled band-by-band before it stops being worth the triangles. */
const MAX_BANDED_STOREYS = 30

/** Height of the parapet lip on a flat roof, as a share of one storey. */
const PARAPET_SHARE = 0.22

/**
 * A facade modelled storey by storey.
 *
 * The bands are pure vertex colour on flat quads — no textures, no extra
 * attributes, and it merges into the same single geometry as everything else.
 * That is the whole trick: what makes a building read as a building at this
 * scale is the horizontal rhythm of floors and a darker ground floor, not
 * geometric window reveals nobody can resolve from across a street.
 */
function pushDetailedWall(
  positions: number[], normals: number[], colors: number[],
  p0: THREE.Vector2, p1: THREE.Vector2,
  nx: number, ny: number,
  baseZ: number, topZ: number,
  storeys: number,
  faceShade: number,
  tint: [number, number, number] | null,
): void {
  const bands = Math.max(1, Math.min(MAX_BANDED_STOREYS, storeys))
  const span = topZ - baseZ
  if (span <= 0) return

  // The skirt below ground is not a storey — band only what is above grade.
  const storeyH = span / bands

  const quad = (z0: number, z1: number, shade: number): void => {
    pushTriangle(positions, normals, colors, p0, p1, p1, z0, z0, z1, nx, ny, 0,
      tintedTriple([shade, shade, shade], tint))
    pushTriangle(positions, normals, colors, p0, p1, p0, z0, z1, z1, nx, ny, 0,
      tintedTriple([shade, shade, shade], tint))
  }

  for (let i = 0; i < bands; i++) {
    const z0 = baseZ + i * storeyH
    const z1 = z0 + storeyH
    const glassTop = z0 + storeyH * WINDOW_BAND

    // Ground floor: taller glazing and a darker frame — shopfronts and lobbies
    // are what make a street read as inhabited rather than as a wall.
    //
    // The gap between the two bands is what carries at distance. Too narrow and
    // the floors dissolve into a flat wall a hundred metres out; the values
    // below keep the rhythm legible from across a block while staying inside
    // the muted range that keeps context behind the model.
    const ground = i === 0
    const glazing = faceShade * (ground ? 0.30 : 0.44)
    const spandrel = faceShade * (ground ? 0.98 : 1.16)

    quad(z0, glassTop, glazing)
    quad(glassTop, z1, spandrel)
  }
}

/** Unit vector along the footprint's longest extent — the natural ridge line. */
function longestAxis(ring: ReadonlyArray<THREE.Vector2>): { x: number; y: number } {
  let best = { x: 1, y: 0 }
  let bestLen = -1
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const dx = ring[j].x - ring[i].x
      const dy = ring[j].y - ring[i].y
      const len = dx * dx + dy * dy
      if (len > bestLen) { bestLen = len; best = { x: dx, y: dy } }
    }
  }
  const n = Math.hypot(best.x, best.y)
  return n === 0 ? { x: 1, y: 0 } : { x: best.x / n, y: best.y / n }
}

/** Which side of the ridge a point falls on (sign only). */
function signedOffset(
  p: THREE.Vector2, centre: { x: number; y: number }, axis: { x: number; y: number },
): number {
  return (p.x - centre.x) * -axis.y + (p.y - centre.y) * axis.x
}

/** Foot of the perpendicular from p onto the ridge line through `centre`. */
function projectToAxis(
  p: THREE.Vector2, centre: { x: number; y: number }, axis: { x: number; y: number },
): THREE.Vector2 {
  const t = (p.x - centre.x) * axis.x + (p.y - centre.y) * axis.y
  return new THREE.Vector2(centre.x + axis.x * t, centre.y + axis.y * t)
}

function pushTriangle(
  positions: number[], normals: number[], colors: number[],
  a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2,
  az: number, bz: number, cz: number,
  nx: number, ny: number, nz: number,
  /**
   * Either ONE uniform grey, or an explicit RGB per vertex. A bare triple of
   * numbers is deliberately NOT accepted: it is indistinguishable from three
   * per-vertex greys, and that ambiguity silently painted tinted faces in
   * greyscale (caught by the roof-colour test).
   */
  shade: number | ShadedVertices,
): void {
  positions.push(a.x, a.y, az, b.x, b.y, bz, c.x, c.y, cz)
  normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
  if (typeof shade === 'number') {
    for (let i = 0; i < 3; i++) colors.push(shade, shade, shade)
    return
  }
  for (const v of shade) colors.push(v[0], v[1], v[2])
}
