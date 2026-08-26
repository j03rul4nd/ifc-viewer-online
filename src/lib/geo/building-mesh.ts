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
import {
  facadeColor, storeyBanding, storeysFor, buildingRegion, roofColorFor,
  defaultRoofShape, defaultRoofFraction, type FacadeContext,
} from './feature-variation'
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

/**
 * How much the surroundings are allowed to compete with the model.
 *
 * Orthogonal to BuildingDetail: 'neutral' is a treatment, not a level, so a
 * showcase view can still have a quiet street behind the subject.
 */
export type ContextTone = 'natural' | 'neutral'

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
  /**
   * Anchor longitude. With the latitude it is the whole of what the palette
   * needs to know about where it is — a block in Kyoto is not painted like a
   * block in Rotterdam, and until this arrived it was.
   */
  anchorLon?: number
  /**
   * 'neutral' draws the surroundings as near-monochrome masses: same skyline,
   * same footprints, none of the colour. For a view whose subject is the IFC
   * model and whose context is only there to give it scale.
   *
   * Deliberately ORTHOGONAL to `detail` rather than a fourth level of it. "How
   * much of this is modelled" and "how much is it allowed to compete with the
   * model" are two independent questions, and folding them into one control
   * would mean giving up storey-banded facades to get a quiet street.
   */
  contextTone?: ContextTone
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
  // One answer for the whole patch: every building in a 1.4 km box is in the
  // same place, and asking per building would be the same lookup 2500 times.
  const region = opts.anchorLon === undefined
    ? 'generic'
    : buildingRegion(opts.anchorLat, opts.anchorLon)
  const contextTone = opts.contextTone ?? 'natural'
  const neutral = contextTone === 'neutral'
  /** Facade contrast, 0-1. Discreet context keeps the mass and drops the detail. */
  const contrast = neutral ? 0.25 : 1

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

    // ── Monuments whose form the outline cannot carry ─────────────────────────
    if (b.style?.monument === 'arch') {
      const arcTint = b.style.wallColor && !neutral
        ? hexToRgb(b.style.wallColor)
        : facadeColor(b.id ?? `${b.ring[0].lat},${b.ring[0].lon}`, {
          use: b.style.use, region, tone: contextTone,
        })
      pushArch(
        positions, normals, colors, ring2d, metresToNormalized,
        groundZ, b.height.heightM, lit, arcTint,
      )
      if (b.id) ranges.push({ id: b.id, start: rangeStart, end: positions.length / 3 })
      count++
      if (b.height.estimated) estimatedCount++
      continue
    }

    // ── Roof ───────────────────────────────────────────────────────────────────
    // A shaped roof eats into the tagged total height rather than adding to it:
    // `height` in OSM is to the ridge, so raising walls to it and then stacking
    // a roof on top would make every gabled building too tall.
    // What the building IS decides its roof when nobody tagged one — which is
    // almost always. A tagged `roof:shape` is the mapper's own answer and still
    // wins outright; `roofTagged` is what lets the two be told apart.
    const facade: FacadeContext = { use: b.style?.use, region, tone: contextTone }
    // Only a building nobody has said anything about gets a shape invented for
    // it. An explicit `roof:shape` says so through `roofTagged`; a caller that
    // simply hands us a pitched shape has plainly stated one too, and honouring
    // that keeps the structural BuildingLike contract meaning what it reads as.
    const stated = b.style?.roofTagged === true || (b.style?.roofShape ?? 'flat') !== 'flat'
    const roofShape = stated ? (b.style?.roofShape ?? 'flat') : defaultRoofShape(facade)
    const wallSpanM = Math.max(0, topM - baseM)
    const roofWantedM = stated
      ? (b.style?.roofHeightM ?? 0)
      : wallSpanM * defaultRoofFraction(facade)
    const roofM = roofShape === 'flat' ? 0 : Math.min(roofWantedM, wallSpanM * 0.5)
    const eaveZ = topZ - roofM * metresToNormalized
    // A tagged colour always wins. Without one, pick a deterministic muted
    // facade tone: a block of identical grey extrusions is the clearest tell
    // that a scene was generated, and real streets are not one colour.
    const seed = b.id ?? `${b.ring[0].lat.toFixed(6)},${b.ring[0].lon.toFixed(6)}`
    // Tagged colours win over anything inferred, in both directions.
    const roofTint = b.style?.roofColor ? hexToRgb(b.style.roofColor) : roofColorFor(facade)
    const wallTint = b.style?.wallColor && !neutral
      ? hexToRgb(b.style.wallColor)
      : facadeColor(seed, facade)
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
      const shadeTop = face * storeyBanding(1, storeys, 0.06 * contrast)
      // Contact shading at grade survives lighting: it is ambient occlusion,
      // not sun, and it is what stops a building from floating.
      const shadeBottom = face * (lit ? 0.86 : 0.72) * storeyBanding(0, storeys, 0.06 * contrast)

      // Walls rise to the EAVES, not the ridge — the roof covers the rest.
      const wallTopZ = eaveZ

      if (detailed) {
        pushDetailedWall(
          positions, normals, colors, p0, p1, nx, ny,
          baseZ, wallTopZ, storeys, face, wallTint, contrast,
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

/**
 * Area-weighted centroid of a simple polygon (falls back to the mean).
 *
 * SHIFTED TO A LOCAL ORIGIN FIRST, and that is not a micro-optimisation — it is
 * the whole reason this function returns a usable answer. Rings arrive in the
 * NORMALIZED frame, where a 5 m building is ~1.5e-7 across sitting at an
 * absolute coordinate around 0.38. The shoelace terms are then differences of
 * numbers that agree to thirteen significant digits: `a.x * b.y - b.x * a.y`
 * keeps only the last two or three bits of signal, and dividing two such sums
 * by each other throws the result anywhere. Measured on a 4.65 m shrine in
 * Kyoto, the absolute-coordinate centroid came out 1151 m from the building.
 *
 * That was invisible for a long time because only an INFERRED pitched roof
 * consults it — the pyramidal apex and the gabled ridge are placed relative to
 * this point, so they shot off across the map as kilometre-long shards, while
 * every flat-roofed block (i.e. almost all of a European city) was unaffected.
 * It took a site where `building=shrine` infers a pyramidal roof to show it.
 *
 * Same class of bug as the triangulation above, and the same fix: do the
 * arithmetic where the numbers have room, then put the answer back.
 */
function ringCentroid(ring: ReadonlyArray<THREE.Vector2>): { x: number; y: number } {
  const ox = ring[0].x
  const oy = ring[0].y
  let area = 0
  let cx = 0
  let cy = 0
  let scale = 0
  for (let i = 0; i < ring.length; i++) {
    const ax = ring[i].x - ox
    const ay = ring[i].y - oy
    const j = (i + 1) % ring.length
    const bx = ring[j].x - ox
    const by = ring[j].y - oy
    const cross = ax * by - bx * ay
    area += cross
    cx += (ax + bx) * cross
    cy += (ay + by) * cross
    const r = Math.max(Math.abs(ax), Math.abs(ay))
    if (r > scale) scale = r
  }
  // The degeneracy test has to be RELATIVE to the ring's own size: a fixed
  // epsilon is meaningless against areas that are ~1e-14 in this frame for a
  // perfectly healthy building, and would send every one of them to the mean.
  if (Math.abs(area) < scale * scale * 1e-9) {
    // Degenerate (collinear) ring — the mean is the only sane answer.
    let mx = 0
    let my = 0
    for (const p of ring) { mx += p.x - ox; my += p.y - oy }
    return { x: ox + mx / ring.length, y: oy + my / ring.length }
  }
  return { x: ox + cx / (3 * area), y: oy + cy / (3 * area) }
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
  /** 1 = full glazing rhythm, 0 = a plain wall. Discreet context runs low. */
  contrast = 1,
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
    // Blended towards a flat wall rather than switched off, so the discreet
    // treatment keeps a hint of the rhythm instead of becoming a slab.
    const mix = (v: number): number => 1 + (v - 1) * contrast
    const glazing = faceShade * mix(ground ? 0.30 : 0.44)
    const spandrel = faceShade * mix(ground ? 0.98 : 1.16)

    quad(z0, glassTop, glazing)
    quad(glassTop, z1, spandrel)
  }
}

// ── Arch ──────────────────────────────────────────────────────────────────────

/** Half-width of the opening, as a share of the monument's own half-width. */
const ARCH_OPENING_HALF = 0.34

/** Height of the springing line — where the curve starts — as a share of total. */
const ARCH_SPRING_FRACTION = 0.42

/** Segments in the semicircular soffit. Twelve reads as a curve at any distance. */
const ARCH_SEGMENTS = 12

/**
 * The smallest rectangle that contains the footprint, and its axes.
 *
 * The minimum-area rectangle has a side collinear with an edge of the convex
 * hull, so trying every edge direction of the ring finds it — the ring's edges
 * are a superset of the hull's, and the extra directions can only lose. O(n²)
 * once, for the handful of features that are monuments.
 *
 * Needed because a traced monument is not axis-aligned and not a rectangle: the
 * Arc de Triomf is 38 vertices on Barcelona's diagonal grid, and both "the
 * longest edge" and "the longest diagonal" point somewhere between its two
 * axes. Getting this wrong turns the arch 20° and puts its opening through a
 * corner.
 */
export function orientedFootprint(ring: ReadonlyArray<THREE.Vector2>): {
  centre: THREE.Vector2
  /** Unit vector along the long side. */
  u: THREE.Vector2
  /** Unit vector across it. */
  v: THREE.Vector2
  halfU: number
  halfV: number
} {
  const fallback = {
    centre: new THREE.Vector2(), u: new THREE.Vector2(1, 0), v: new THREE.Vector2(0, 1),
    halfU: 0, halfV: 0,
  }
  if (ring.length < 3) return fallback

  const ox = ring[0].x
  const oy = ring[0].y
  let best: { area: number; ux: number; uy: number; lo: [number, number]; hi: [number, number] } | null = null

  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length
    const ex = ring[j].x - ring[i].x
    const ey = ring[j].y - ring[i].y
    const len = Math.hypot(ex, ey)
    if (len === 0) continue
    const ux = ex / len
    const uy = ey / len
    let minA = Infinity; let maxA = -Infinity
    let minB = Infinity; let maxB = -Infinity
    for (const p of ring) {
      const px = p.x - ox
      const py = p.y - oy
      const a = px * ux + py * uy
      const bb = -px * uy + py * ux
      if (a < minA) minA = a
      if (a > maxA) maxA = a
      if (bb < minB) minB = bb
      if (bb > maxB) maxB = bb
    }
    const area = (maxA - minA) * (maxB - minB)
    if (!best || area < best.area) {
      best = { area, ux, uy, lo: [minA, minB], hi: [maxA, maxB] }
    }
  }
  if (!best) return fallback

  const midA = (best.lo[0] + best.hi[0]) / 2
  const midB = (best.lo[1] + best.hi[1]) / 2
  const centre = new THREE.Vector2(
    ox + midA * best.ux - midB * best.uy,
    oy + midA * best.uy + midB * best.ux,
  )
  let u = new THREE.Vector2(best.ux, best.uy)
  let v = new THREE.Vector2(-best.uy, best.ux)
  let halfU = (best.hi[0] - best.lo[0]) / 2
  let halfV = (best.hi[1] - best.lo[1]) / 2
  // `u` is the LONG side by contract — a caller reasoning about "along the
  // facade" and "through the opening" needs that fixed, not left to which edge
  // the ring happened to start on.
  if (halfV > halfU) {
    const swapAxis = u; u = v; v = new THREE.Vector2(-swapAxis.x, -swapAxis.y)
    const swapHalf = halfU; halfU = halfV; halfV = swapHalf
  }
  return { centre, u, v, halfU, halfV }
}

/**
 * A triumphal arch: two piers, an attic, and a hole you can see the sky through.
 *
 * Built from the oriented box of the footprint rather than from the traced
 * outline. That loses the mouldings and the reliefs — at map scale nobody is
 * looking for those — and gains the one thing the outline cannot give at all,
 * which is the opening. A solid extrusion of the same footprint is a brick cube
 * 29 m tall, and on a site that has the Arc de Triomf in it, that cube is the
 * first thing anybody looks at.
 *
 * The passage runs through the SHORT axis, which is what an arch is: wide face
 * to the street it terminates, shallow depth front to back.
 */
function pushArch(
  positions: number[], normals: number[], colors: number[],
  ring: ReadonlyArray<THREE.Vector2>,
  metresToNormalized: number,
  groundZ: number,
  heightM: number,
  lit: boolean,
  tint: [number, number, number] | null,
): void {
  const box = orientedFootprint(ring)
  if (box.halfU <= 0 || box.halfV <= 0) return

  const topZ = groundZ + heightM * metresToNormalized
  const baseZ = groundZ - SKIRT_M * metresToNormalized
  const openHalf = box.halfU * ARCH_OPENING_HALF
  const springZ = groundZ + heightM * ARCH_SPRING_FRACTION * metresToNormalized
  // A semicircular head: the rise equals the half-span, which is what makes it
  // read as an arch rather than as a rounded-off rectangle.
  const crownZ = springZ + openHalf
  // A monument whose opening would break through its own attic is not an arch;
  // fall back on filling the whole block rather than producing a broken one.
  if (crownZ >= topZ) return

  /** Plan point at (along the facade, through the passage) in metres of the box. */
  const at = (a: number, t: number): THREE.Vector2 => new THREE.Vector2(
    box.centre.x + box.u.x * a + box.v.x * t,
    box.centre.y + box.u.y * a + box.v.y * t,
  )

  const shade = (k: number): ShadedVertices => {
    const s = lit ? k : k * 0.92
    return tinted(s, tint)
  }

  /** One flat quad, wound so its normal points the way it is given. */
  const quad = (
    p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2,
    z0: number, z1: number, z2: number, z3: number,
    nx: number, ny: number, nz: number, k: number,
  ): void => {
    pushTriangle(positions, normals, colors, p0, p1, p2, z0, z1, z2, nx, ny, nz, shade(k))
    pushTriangle(positions, normals, colors, p0, p2, p3, z0, z2, z3, nx, ny, nz, shade(k))
  }

  /** The four sides and the top of a block spanning `a0..a1` of the facade. */
  const block = (a0: number, a1: number, z0: number, z1: number): void => {
    const corners: Array<[number, number]> = [
      [a0, -box.halfV], [a1, -box.halfV], [a1, box.halfV], [a0, box.halfV],
    ]
    for (let i = 0; i < 4; i++) {
      const [ca, ct] = corners[i]
      const [na, nt] = corners[(i + 1) % 4]
      const p0 = at(ca, ct)
      const p1 = at(na, nt)
      const ex = p1.x - p0.x
      const ey = p1.y - p0.y
      const len = Math.hypot(ex, ey)
      if (len === 0) continue
      // Outward normal of this counter-clockwise loop.
      const nx = ey / len
      const ny = -ex / len
      quad(p0, p1, p1, p0, z0, z0, z1, z1, nx, ny, 0, wallShade(nx, ny))
    }
    const [c0, c1, c2, c3] = corners.map(([a, t]) => at(a, t))
    quad(c0, c1, c2, c3, z1, z1, z1, z1, 0, 0, 1, 0.95)
  }

  // Piers, carrying the spandrels up to the crown of the opening.
  block(-box.halfU, -openHalf, baseZ, crownZ)
  block(openHalf, box.halfU, baseZ, crownZ)
  // The attic above, spanning the whole width — this is the block the opening
  // is cut out from below.
  block(-box.halfU, box.halfU, crownZ, topZ)

  // The head of the opening: a soffit under the curve, and the spandrel wall
  // between that curve and the flat underside of the attic, on both faces.
  for (let i = 0; i < ARCH_SEGMENTS; i++) {
    const t0 = (i / ARCH_SEGMENTS) * Math.PI
    const t1 = ((i + 1) / ARCH_SEGMENTS) * Math.PI
    const a0 = -Math.cos(t0) * openHalf
    const a1 = -Math.cos(t1) * openHalf
    const z0 = springZ + Math.sin(t0) * openHalf
    const z1 = springZ + Math.sin(t1) * openHalf

    // Soffit: the curved underside, seen from inside the passage.
    quad(
      at(a0, -box.halfV), at(a1, -box.halfV), at(a1, box.halfV), at(a0, box.halfV),
      z0, z1, z1, z0, 0, 0, -1, 0.62,
    )
    // Spandrel on each face, filling up to the crown.
    for (const side of [-1, 1] as const) {
      const t = side * box.halfV
      const ex = box.v.x * side
      const ey = box.v.y * side
      quad(
        at(a0, t), at(a1, t), at(a1, t), at(a0, t),
        z0, z1, crownZ, crownZ,
        ex, ey, 0, wallShade(ex, ey),
      )
    }
  }

  // The reveals: the flat side walls of the passage below the springing.
  for (const side of [-1, 1] as const) {
    const a = side * openHalf
    const p0 = at(a, -box.halfV)
    const p1 = at(a, box.halfV)
    // Facing INTO the opening, which is back towards the centre.
    const nx = -box.u.x * side
    const ny = -box.u.y * side
    quad(p0, p1, p1, p0, baseZ, baseZ, springZ, springZ, nx, ny, 0, 0.7)
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
