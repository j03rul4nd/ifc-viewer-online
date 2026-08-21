// ─── context-suppression ──────────────────────────────────────────────────────
// Which OSM context to STOP drawing because the IFC model is already there.
//
// The map layers and the model are two descriptions of the same piece of ground,
// produced by different people for different reasons. Where they overlap, one of
// them is redundant and the other is authoritative — and it is always the model:
// the user brought it, it is surveyed, and it is the subject. OSM is context.
//
// What the overlap looks like when nothing resolves it: the mapped building the
// IFC replaces stands inside it, poking out through the facades; street trees
// grow up through the slabs; and a modelled bridge deck sits a metre from the
// OSM ribbon of the same bridge, so the pair reads as a doubled, slightly wrong
// piece of infrastructure.
//
// WHAT IS SUPPRESSED DEPENDS ON WHAT THE MODEL IS, and that is the whole design.
// A building replaces the building on its plot and the trees standing in it —
// but NOT the street outside, which it does not describe. A modelled bridge
// replaces the mapped bridge and the carriageway it carries, because those are
// the same structure. Getting this backwards deletes a city block to place a
// bus shelter, so the policy is explicit per facility type rather than inferred
// from size.
//
// PURE: polygons and features in, a predicate out. No scene, no THREE materials.

import * as THREE from 'three'
import type { FeatureKind, OsmFeature, LatLonPoint } from './osm-features'

/**
 * What the model IS, which decides what it is entitled to replace.
 *
 * Mirrors the IFC4x3 facility entities plus the IFC2x3/IFC4 default. `unknown`
 * behaves as `building`, because that is what the overwhelming majority of
 * files are and it is the conservative answer: it suppresses only what stands
 * inside the model's own plan.
 */
export type FacilityKind = 'building' | 'bridge' | 'road' | 'railway' | 'tunnel' | 'unknown'

/** A model's plan outline in the normalized planar frame, as a closed polygon. */
export interface ModelFootprint {
  /** Convex or simple polygon, at least 3 points. */
  polygon: THREE.Vector2[]
  kind: FacilityKind
  /**
   * How far beyond the outline the suppression reaches, in normalized units.
   * A mapped building rarely coincides with the surveyed one to the metre, so
   * a small skirt is what stops a sliver of OSM wall surviving along an edge.
   */
  marginN: number
}

/**
 * Per-kind policy: what a facility of this type replaces.
 *
 * `false` is the default for everything not listed. Adding a layer here is a
 * decision that the model genuinely describes that thing.
 */
export type SuppressionPolicy = Partial<Record<FeatureKind, boolean>>

/**
 * The defaults, per facility type.
 *
 * A BUILDING takes the mapped building on its plot, and the point furniture
 * standing in its plan — trees and signals inside a building are always wrong.
 * It does NOT take roads, rail or ground cover: a tower does not describe the
 * avenue it faces, and deleting the street because a model is near it is a far
 * worse artefact than a redundant polygon.
 *
 * A BRIDGE or a TUNNEL is different in kind: it IS the piece of transport
 * infrastructure OSM has also drawn, so it takes the mapped bridge and the
 * carriageway and track along it. Otherwise the modelled deck and the mapped
 * ribbon fight for the same few centimetres of z.
 *
 * A ROAD or RAILWAY model is the alignment itself, so it takes its own class of
 * way but leaves the buildings alone.
 */
export const DEFAULT_POLICY: Record<FacilityKind, SuppressionPolicy> = {
  building: { building: true, tree: true, signal: true },
  bridge:   { bridge: true, road: true, rail: true, tree: true, signal: true },
  tunnel:   { bridge: true, road: true, rail: true },
  road:     { road: true, bridge: true, tree: true, signal: true },
  railway:  { rail: true, bridge: true, tree: true, signal: true },
  unknown:  { building: true, tree: true, signal: true },
}

/** Default skirt beyond the model outline, metres. */
export const DEFAULT_MARGIN_M = 2

/**
 * Share of a way's or ring's vertices that must fall inside the footprint for
 * the whole feature to go.
 *
 * Not "any vertex": a street that merely clips the corner of a plot would
 * vanish for its whole length, which is the failure mode that makes people turn
 * a feature like this off. Not "every vertex" either — OSM outlines and
 * surveyed ones never agree exactly. A clear majority means "this feature is
 * describing the same object the model describes".
 */
const COVERAGE_FRACTION = 0.6

/**
 * IFC spatial classes that say what a file is a model OF.
 *
 * IFC4x3 is what made this answerable: before it, infrastructure was modelled
 * as an IfcBuilding or an IfcBuildingElementProxy and there was nothing in the
 * file to read. Anything not listed stays `unknown` rather than being guessed —
 * `IfcFacility` on its own means "some facility", which is not enough to start
 * deleting streets over, and reading intent out of a NAME ("Tunnel North") is
 * exactly the kind of guess that surprises people.
 */
const FACILITY_BY_CLASS: Record<string, FacilityKind> = {
  IFCBUILDING: 'building',
  IFCBRIDGE: 'bridge',
  IFCBRIDGEPART: 'bridge',
  IFCROAD: 'road',
  IFCROADPART: 'road',
  IFCRAILWAY: 'railway',
  IFCRAILWAYPART: 'railway',
  // Not in IFC4x3 — reserved for 4.4. Listed so a file that already uses it
  // works the day it arrives, rather than silently falling back to `building`
  // and deleting the city over a tunnel.
  IFCTUNNEL: 'tunnel',
  IFCTUNNELPART: 'tunnel',
}

/** The minimum a facility inference needs from a spatial tree node. */
export interface SpatialNodeLike {
  ifcClass: string
  children?: SpatialNodeLike[]
}

/**
 * What kind of facility a spatial tree describes.
 *
 * Depth-first, first match wins: the tree runs project → site → facility, so
 * the first facility class encountered is the one the file is about. A site
 * holding several buildings answers `building`, which is right — they are all
 * buildings.
 */
export function facilityKindFromTree(
  nodes: ReadonlyArray<SpatialNodeLike> | null | undefined,
): FacilityKind {
  if (!nodes) return 'unknown'
  for (const node of nodes) {
    const hit = FACILITY_BY_CLASS[(node.ifcClass ?? '').toUpperCase()]
    if (hit) return hit
    const nested = facilityKindFromTree(node.children)
    if (nested !== 'unknown') return nested
  }
  return 'unknown'
}

/** Point-in-polygon, ray casting. Boundary counts as inside often enough. */
export function pointInPolygon(p: { x: number; y: number }, poly: ReadonlyArray<THREE.Vector2>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** Grow a convex-ish polygon outward from its centroid by `margin`. */
export function expandPolygon(
  poly: ReadonlyArray<THREE.Vector2>, margin: number,
): THREE.Vector2[] {
  if (poly.length === 0 || margin === 0) return poly.map((p) => p.clone())
  const c = new THREE.Vector2()
  for (const p of poly) c.add(p)
  c.divideScalar(poly.length)
  return poly.map((p) => {
    const d = p.clone().sub(c)
    const len = d.length()
    // A vertex sitting exactly on the centroid cannot be pushed anywhere
    // meaningful; leaving it put is harmless in a polygon this small.
    return len > 0 ? p.clone().addScaledVector(d.divideScalar(len), margin) : p.clone()
  })
}

/**
 * Build the test used by every layer builder.
 *
 * Returns a predicate that answers "draw this?". With no footprints it is a
 * constant `true`, so the flat-map and no-model paths pay nothing.
 */
export function createSuppressor(
  footprints: ReadonlyArray<ModelFootprint>,
  project: (p: LatLonPoint) => { x: number; y: number },
  overrides?: SuppressionPolicy,
): (feature: OsmFeature) => boolean {
  const active = footprints.filter((f) => f.polygon.length >= 3)
  if (active.length === 0) return () => true

  // Pre-expand once, and pre-compute a bounding box per footprint: the vast
  // majority of features in a 1.4 km box are nowhere near the model, and a box
  // rejection is two comparisons against a full point-in-polygon walk.
  const prepared = active.map((f) => {
    const poly = expandPolygon(f.polygon, f.marginN)
    let minX = Infinity; let minY = Infinity
    let maxX = -Infinity; let maxY = -Infinity
    for (const p of poly) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return {
      poly, minX, minY, maxX, maxY,
      policy: { ...DEFAULT_POLICY[f.kind], ...overrides },
    }
  })

  return (feature: OsmFeature): boolean => {
    for (const f of prepared) {
      if (!f.policy[feature.kind]) continue

      if (feature.point) {
        const p = project(feature.point)
        if (p.x < f.minX || p.x > f.maxX || p.y < f.minY || p.y > f.maxY) continue
        if (pointInPolygon(p, f.poly)) return false
        continue
      }

      const ring = feature.ring
      if (!ring || ring.length === 0) continue
      let inside = 0
      let tested = 0
      for (const q of ring) {
        const p = project(q)
        tested++
        if (p.x < f.minX || p.x > f.maxX || p.y < f.minY || p.y > f.maxY) continue
        if (pointInPolygon(p, f.poly)) inside++
      }
      if (tested > 0 && inside / tested >= COVERAGE_FRACTION) return false
    }
    return true
  }
}

/**
 * The model's plan outline as a polygon in the normalized frame.
 *
 * Takes the four ground-plan corners of a world-space AABB and maps them
 * through the caller's world→normalized conversion. An AABB is a coarse stand-in
 * for a real footprint — a diagonal building gets a box larger than itself — so
 * this is deliberately the ONLY place that assumption lives: hand
 * `createSuppressor` a tighter polygon and everything downstream improves with
 * no other change.
 */
export function footprintFromBounds(
  bounds: { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } },
  toNormalized: (worldX: number, worldZ: number) => { x: number; y: number },
  kind: FacilityKind,
  marginN: number,
): ModelFootprint {
  const hx = Math.abs(bounds.size.x) / 2
  const hz = Math.abs(bounds.size.z) / 2
  const corners: Array<[number, number]> = [
    [bounds.center.x - hx, bounds.center.z - hz],
    [bounds.center.x + hx, bounds.center.z - hz],
    [bounds.center.x + hx, bounds.center.z + hz],
    [bounds.center.x - hx, bounds.center.z + hz],
  ]
  const polygon = corners.map(([wx, wz]) => {
    const n = toNormalized(wx, wz)
    return new THREE.Vector2(n.x, n.y)
  })
  // The mapping can flip winding; the point-in-polygon test does not care, but
  // expandPolygon's outward direction does, and it works from the centroid, so
  // winding is irrelevant here too. Left unnormalized on purpose.
  return { polygon, kind, marginN }
}
