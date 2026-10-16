// ─── water-exposure ───────────────────────────────────────────────────────────
// What the water next to a model is LIKE, for whoever builds there.
//
// A pier in a river, a jetty on a lake, a quay on the open ocean and a beach
// club on the Mediterranean are four different design problems. A river runs
// one way at a speed set by its slope and rises in a flood carrying debris; a
// lake barely moves; the ocean brings metres of tide and the currents that
// tide drives; a Mediterranean beach has almost no tide but storm waves and
// rip currents. Salt water corrodes what fresh water does not. This module
// names the water body nearest the model, classifies it, and gives the
// TYPICAL figures of that class — current, tide, waves, salinity — with the
// design issues that follow. River speed is estimated from the slope of the
// ground along the course (Manning), everything else from the kind of water
// and the coast it belongs to (coastal.ts). Typical values, never a survey.
//
// Pure: the ground is a callback.

import type { LatLonPoint, OsmFeature } from './osm-features'
import { coastProfileAt, type CoastKind } from '../../features/flood/core/coastal'

export type WaterClass = 'river' | 'stream' | 'canal' | 'lake' | 'pond' | 'lagoon' | 'estuary' | 'sea' | 'ocean' | 'beach'
export type Salinity = 'fresh' | 'brackish' | 'salt'
export type DesignIssue =
  | 'scour' | 'debris' | 'flood-rise' | 'ice' | 'corrosion' | 'tidal-range'
  | 'storm-waves' | 'rip-current' | 'tidal-current' | 'still-water' | 'longshore-drift'

export interface WaterExposure {
  cls: WaterClass
  name?: string
  /** Metres from the model's anchor to the water's edge (0 = over it). */
  distanceM: number
  coast?: CoastKind
  salinity: Salinity
  /** Typical and severe surface current, m/s. */
  currentMS: { typical: number; severe: number }
  /** Direction the current runs, degrees from north (rivers only). */
  flowBearingDeg?: number
  /** Ground slope along the river, m/m, when it was measured. */
  slope?: number
  /** Spring tide range, metres. */
  tideRangeM: number
  /** Storm significant wave height, metres. */
  waveHsM: number
  issues: DesignIssue[]
}

const NEAR_M = 600

interface Candidate { f: OsmFeature; d: number }

function metres(a: LatLonPoint, b: LatLonPoint): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  return Math.hypot((b.lat - a.lat) * 111_132, (b.lon - a.lon) * 111_320 * k)
}

function inRing(p: LatLonPoint, ring: ReadonlyArray<LatLonPoint>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.lat > p.lat) !== (b.lat > p.lat)
      && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside
  }
  return inside
}

/** Distance from p to a ring's edge in metres; 0 inside. */
function distanceToRing(p: LatLonPoint, ring: ReadonlyArray<LatLonPoint>): number {
  if (inRing(p, ring)) return 0
  const kx = 111_320 * Math.cos(p.lat * Math.PI / 180), ky = 111_132
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j].lon - p.lon) * kx, ay = (ring[j].lat - p.lat) * ky
    const bx = (ring[i].lon - p.lon) * kx, by = (ring[i].lat - p.lat) * ky
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

/** Approximate area of a ring, m². */
function areaM2(ring: ReadonlyArray<LatLonPoint>): number {
  const kx = 111_320 * Math.cos(ring[0].lat * Math.PI / 180), ky = 111_132
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j].lon * kx) * (ring[i].lat * ky) - (ring[i].lon * kx) * (ring[j].lat * ky)
  }
  return Math.abs(a / 2)
}

function major(f: OsmFeature): boolean {
  if (f.isSea || (f.waterCourse && f.waterCourse.widthM >= 15)) return true
  if (f.style.waterRegime === 'flowing' && !f.waterCourse) return true
  return areaM2(f.ring!) >= 20_000
}

/** The water class of a feature, before the coast is known. */
function classOf(f: OsmFeature): WaterClass {
  if (f.isSea) return 'sea'
  if (f.waterCourse) {
    const w = f.waterCourse.widthM
    return w >= 15 ? 'river' : w >= 8 ? 'canal' : 'stream'
  }
  if (f.style.waterRegime === 'tidal') return 'lagoon'
  if (f.style.waterRegime === 'flowing') return 'river'
  return f.style.waterKind === 'pond' ? 'pond' : 'lake'
}

/** The bearing of a course near `p`, degrees from north, in flow direction. */
function bearingNear(line: ReadonlyArray<LatLonPoint>, p: LatLonPoint): { deg: number; i: number } {
  let bi = 1, bd = Infinity
  for (let i = 1; i < line.length; i++) {
    const m = { lat: (line[i - 1].lat + line[i].lat) / 2, lon: (line[i - 1].lon + line[i].lon) / 2 }
    const d = metres(m, p)
    if (d < bd) { bd = d; bi = i }
  }
  const a = line[bi - 1], b = line[bi]
  const k = Math.cos(a.lat * Math.PI / 180)
  const deg = (Math.atan2((b.lon - a.lon) * k, b.lat - a.lat) * 180 / Math.PI + 360) % 360
  return { deg, i: bi }
}

/**
 * Slope along a course around vertex i: ground at points ~150 m up and down
 * the course, over the distance between them. The DEM over water is noisy, so
 * a slope below 1e-4 is taken as 1e-4 (a lowland river) and above 5 % as 5 %.
 */
function slopeAlong(line: ReadonlyArray<LatLonPoint>, i: number, groundM: (p: LatLonPoint) => number | null): number | null {
  const walk = (from: number, step: number): { p: LatLonPoint; d: number } => {
    let d = 0, k = from
    while (d < 150 && k + step >= 0 && k + step < line.length) { d += metres(line[k], line[k + step]); k += step }
    return { p: line[k], d }
  }
  const up = walk(i - 1, -1), down = walk(i, 1)
  const za = groundM(up.p), zb = groundM(down.p)
  const run = up.d + down.d + metres(line[i - 1], line[i])
  if (za === null || zb === null || run < 30) return null
  return Math.max(1e-4, Math.min(0.05, (za - zb) / run))
}

export const SEA_CURRENT: Record<CoastKind, { typical: number; severe: number }> = {
  mediterranean: { typical: 0.1, severe: 0.6 },
  adriatic: { typical: 0.15, severe: 0.6 },
  atlantic: { typical: 0.3, severe: 1.2 },
  macrotidal: { typical: 1.0, severe: 3.0 },
  'north-sea': { typical: 0.5, severe: 1.5 },
  baltic: { typical: 0.1, severe: 0.4 },
  'black-sea': { typical: 0.1, severe: 0.5 },
  'estuary-east-asia': { typical: 0.8, severe: 2.0 },
  ocean: { typical: 0.3, severe: 1.2 },
}
const DEPTH: Record<'river' | 'stream' | 'canal', number> = { river: 2.5, stream: 0.6, canal: 1.5 }

/**
 * The water nearest the model and what it is like. Null when there is none
 * within NEAR_M of the anchor.
 */
export function waterExposureAt(
  at: LatLonPoint,
  features: ReadonlyArray<OsmFeature>,
  groundM: (p: LatLonPoint) => number | null = () => null,
): WaterExposure | null {
  const waters: Candidate[] = []
  const sands: Candidate[] = []
  for (const f of features) {
    if (!f.ring || f.ring.length < 3) continue
    if (f.kind === 'water' && !f.waterJoin && f.style.waterKind !== 'fountain') {
      const d = distanceToRing(at, f.ring)
      if (d <= NEAR_M) waters.push({ f, d })
    } else if (f.kind === 'sand') {
      const d = distanceToRing(at, f.ring)
      if (d <= 150) sands.push({ f, d })
    }
  }
  if (waters.length === 0) return null
  // WHAT MATTERS, NOT WHAT IS CLOSEST. A park pond 200 m away is not the water
  // a riverside tower is exposed to; the Huangpu 300 m away is. Big water —
  // the sea, a river, a lake over a couple of hectares — is preferred within
  // a few hundred metres; the sea wins a tie with a harbour basin over it.
  const score = (c: Candidate): number => c.d - (major(c.f) ? 300 : 0) - (c.f.isSea ? 1 : 0)
  waters.sort((a, b) => score(a) - score(b))
  const { f, d } = waters[0]
  const coast = coastProfileAt(at.lat, at.lon)
  let cls = classOf(f)
  // A RIVERBANK POLYGON WITHOUT ITS TAGS. The vector-tile fallback gives a
  // river's area as plain water, which reads as a still lake; a mapped course
  // running through it says otherwise, and lends its direction.
  let course = f.waterCourse?.line
  if (!f.isSea && !f.waterCourse && f.style.waterRegime !== 'flowing') {
    const through = features.find((x) => x.waterCourse && x.waterCourse.widthM >= 8
      && crosses(x.waterCourse.line, f.ring!))
    if (through) { cls = through.waterCourse!.widthM >= 15 ? 'river' : 'canal'; course = through.waterCourse!.line }
  }
  const issues: DesignIssue[] = []

  // A river on a tidal coast that is wide (a tidal reach: the Huangpu, the
  // Thames in London) or reaches the sea within the box is an estuary: its
  // current reverses with the tide and its water turns brackish.
  const wide = !f.waterCourse || f.waterCourse.widthM >= 150
  if ((cls === 'river' || cls === 'canal') && coast.springRangeM >= 1.5 && (wide || features.some((x) => x.isSea))) cls = 'estuary'
  if (cls === 'sea') {
    // A beach is sand that touches the sea: any of its vertices within a few
    // tens of metres of a sea ring (a tile-clipped beach may start inland).
    const seas = waters.filter((w) => w.f.isSea)
    const touches = (ring: ReadonlyArray<LatLonPoint>) => ring.some((q, i) =>
      i % 3 === 0 && seas.some((w) => distanceToRing(q, w.f.ring!) < 60))
    const beach = sands.find((s) => touches(s.f.ring!))
    if (beach && beach.d < 150) cls = 'beach'
    else if (coast.kind === 'ocean' || coast.kind === 'atlantic' || coast.kind === 'macrotidal') cls = 'ocean'
  }

  let currentMS = { typical: 0.05, severe: 0.2 }
  let flowBearingDeg: number | undefined
  let slope: number | undefined
  let tideRangeM = 0
  let waveHsM = 0.3
  let salinity: Salinity = 'fresh'

  switch (cls) {
    case 'river': case 'stream': case 'canal': {
      if (course && course.length >= 2) {
        const b = bearingNear(course, at)
        flowBearingDeg = Math.round(b.deg)
        slope = slopeAlong(course, b.i, groundM) ?? undefined
      }
      const s = cls === 'canal' ? 1e-4 : slope ?? (cls === 'stream' ? 0.005 : 3e-4)
      // Manning, wide channel: v = R^(2/3) S^(1/2) / n, R ≈ depth.
      const n = cls === 'stream' ? 0.045 : 0.035
      const v = Math.pow(DEPTH[cls], 2 / 3) * Math.sqrt(s) / n
      currentMS = { typical: round(Math.min(v, 4)), severe: round(Math.min(v * 2.2, 6)) }
      waveHsM = cls === 'stream' ? 0 : 0.3
      issues.push('scour', 'flood-rise', 'debris')
      break
    }
    case 'estuary':
      currentMS = { typical: round(Math.max(0.6, SEA_CURRENT[coast.kind].typical)), severe: round(Math.max(1.5, SEA_CURRENT[coast.kind].severe)) }
      tideRangeM = coast.springRangeM
      waveHsM = 1
      salinity = 'brackish'
      issues.push('tidal-current', 'tidal-range', 'scour', 'flood-rise', 'corrosion')
      break
    case 'lake': case 'pond':
      currentMS = cls === 'pond' ? { typical: 0, severe: 0.05 } : { typical: 0.05, severe: 0.3 }
      waveHsM = cls === 'pond' ? 0 : 0.8
      issues.push('still-water')
      break
    case 'lagoon':
      currentMS = { typical: 0.2, severe: 0.8 }
      tideRangeM = coast.springRangeM
      salinity = 'brackish'
      issues.push('still-water', 'corrosion')
      break
    case 'sea': case 'ocean': case 'beach':
      currentMS = { ...SEA_CURRENT[coast.kind] }
      tideRangeM = coast.springRangeM
      waveHsM = coast.stormHsM
      salinity = coast.kind === 'baltic' ? 'brackish' : 'salt'
      issues.push('corrosion', 'storm-waves')
      if (tideRangeM >= 1.5) issues.push('tidal-range')
      if (currentMS.severe >= 1) issues.push('tidal-current')
      if (cls === 'beach') {
        // Rips run seaward at up to 2 m/s through a surf zone; the drift along
        // the beach moves the sand a structure stands on.
        currentMS = { typical: Math.max(currentMS.typical, 0.3), severe: Math.max(currentMS.severe, 2) }
        issues.push('rip-current', 'longshore-drift')
      }
      break
  }
  // Cold climates freeze fresh and brackish water in winter.
  if (Math.abs(at.lat) >= 50 && salinity !== 'salt') issues.push('ice')

  return {
    cls, name: f.name, distanceM: Math.round(d), coast: coast.kind, salinity,
    currentMS, flowBearingDeg, slope, tideRangeM, waveHsM, issues,
  }
}

/** True when a line passes through a ring: a straight reach can cross it with no vertex inside. */
function crosses(line: ReadonlyArray<LatLonPoint>, ring: ReadonlyArray<LatLonPoint>): boolean {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      if (inRing({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }, ring)) return true
    }
  }
  return false
}

function round(v: number): number { return Math.round(v * 100) / 100 }
