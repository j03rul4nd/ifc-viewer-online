// ─── riverfront promenade ─────────────────────────────────────────────────────
// The paved floor of a waterfront promenade, from the footways mapped on it.
//
// The Bund promenade is mapped the way OSM maps most waterfronts: dozens of
// parallel `highway=footway` lines and no area. Drawn as 2 m ribbons, the
// granite terrace along the Huangpu read as a few thin paths over the basemap.
// A footway at ground level beside a river, a canal or the sea is paved
// generously here instead, so neighbouring ones merge into the terrace they
// are drawn on. Waterfront promenades are often mapped as parks (the Bund's
// is), so a park is no reason to skip; an unpaved surface is.

import type { LatLonPoint, OsmFeature } from './osm-features'

/** How far from the water's edge a footway still belongs to the waterfront, metres. */
export const PROMENADE_REACH_M = 60
/** Width paved along each waterfront footway, metres. */
export const PROMENADE_WIDTH_M = 9
/** Granite: the pale, slightly warm grey of the Bund's floor. */
export const PROMENADE_TONE: [number, number, number] = [0.63, 0.61, 0.57]

const K_LAT = 111_320

const UNPAVED = new Set(['compacted', 'gravel', 'dirt', 'grass', 'ground', 'sand', 'fine_gravel', 'unpaved'])

function distanceToRingM(p: LatLonPoint, ring: ReadonlyArray<LatLonPoint>): number {
  const kLon = K_LAT * Math.cos((p.lat * Math.PI) / 180)
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j].lon - p.lon) * kLon, ay = (ring[j].lat - p.lat) * K_LAT
    const bx = (ring[i].lon - p.lon) * kLon, by = (ring[i].lat - p.lat) * K_LAT
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

function isOpenWater(f: OsmFeature): boolean {
  return f.kind === 'water' && !!f.ring && f.ring.length >= 3
    && (f.isSea === true || !!f.waterCourse || f.style.waterRegime === 'flowing')
}

/**
 * The footways that pave a waterfront: pedestrian, at ground level, near open
 * water and not tagged with an unpaved surface. `buffer` turns a centreline into a ring.
 */
export function riverfrontPromenades(
  features: ReadonlyArray<OsmFeature>,
  buffer: (pts: ReadonlyArray<LatLonPoint>, widthM: number) => LatLonPoint[] | null,
): OsmFeature[] {
  const water = features.filter(isOpenWater)
  if (water.length === 0) return []
  const out: OsmFeature[] = []
  for (const f of features) {
    if (f.kind !== 'road' || f.widthM === undefined || !f.ring || f.ring.length < 2) continue
    if (f.style.roadClass !== 'pedestrian' || f.style.crossing) continue
    if (f.vertical && f.vertical.structure !== 'ground') continue
    const mid = f.ring[Math.floor(f.ring.length / 2)]
    if (!water.some((w) => distanceToRingM(mid, w.ring!) <= PROMENADE_REACH_M)) continue
    if (f.style.surface && UNPAVED.has(f.style.surface)) continue
    const ring = buffer(f.ring, PROMENADE_WIDTH_M)
    if (!ring) continue
    out.push({
      id: `${f.id}-promenade`, kind: 'road', ring, height: f.height,
      style: { ...f.style, roadClass: 'pedestrian', surface: 'paving_stones', tone: PROMENADE_TONE, crossing: undefined },
    })
  }
  return out
}

/** A footway this close to the water runs along its edge, metres: it gets the railing and the lamps. */
export const EDGE_REACH_M = 15
/** Spacing of the lamps along a waterfront edge, metres. */
export const LAMP_SPACING_M = 25

/** The polyline moved sideways by `offsetM` metres (positive to the left of travel). */
function offsetLine(pts: ReadonlyArray<LatLonPoint>, offsetM: number): LatLonPoint[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const kLon = K_LAT * Math.cos((p.lat * Math.PI) / 180)
    const dx = (b.lon - a.lon) * kLon, dy = (b.lat - a.lat) * K_LAT
    const len = Math.hypot(dx, dy) || 1
    return { lat: p.lat + (dx / len) * offsetM / K_LAT, lon: p.lon - (dy / len) * offsetM / kLon }
  })
}

function pointsAlong(pts: ReadonlyArray<LatLonPoint>, stepM: number): LatLonPoint[] {
  const out: LatLonPoint[] = []
  let carry = stepM / 2
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const kLon = K_LAT * Math.cos((a.lat * Math.PI) / 180)
    const len = Math.hypot((b.lat - a.lat) * K_LAT, (b.lon - a.lon) * kLon)
    let t = carry
    while (t <= len && out.length < 200) {
      out.push({ lat: a.lat + ((b.lat - a.lat) * t) / len, lon: a.lon + ((b.lon - a.lon) * t) / len })
      t += stepM
    }
    carry = t - len
  }
  return out
}

/**
 * The river edge of a waterfront promenade: a railing along the water side of
 * every footway that runs on the edge, and lamps along it. The Bund maps its
 * flood wall and its trees, but not the balustrade or the lamps that line it,
 * and without them the terrace ends in nothing.
 */
export function waterfrontEdge(
  features: ReadonlyArray<OsmFeature>,
  styles: { railing: OsmFeature['style']; lamp: OsmFeature['style'] },
): OsmFeature[] {
  const water = features.filter(isOpenWater)
  if (water.length === 0) return []
  const near = (p: LatLonPoint) => Math.min(...water.map((w) => distanceToRingM(p, w.ring!)))
  const out: OsmFeature[] = []
  const flat = { heightM: 0, minHeightM: 0, estimated: true }
  for (const f of features) {
    if (!f.id.endsWith('-promenade')) continue
    const source = features.find((x) => x.id === f.id.slice(0, -'-promenade'.length))
    if (!source?.ring || source.ring.length < 2) continue
    const mid = source.ring[Math.floor(source.ring.length / 2)]
    if (near(mid) > EDGE_REACH_M) continue
    const left = offsetLine(source.ring, PROMENADE_WIDTH_M / 2)
    const right = offsetLine(source.ring, -PROMENADE_WIDTH_M / 2)
    const edge = near(left[Math.floor(left.length / 2)]) < near(right[Math.floor(right.length / 2)]) ? left : right
    out.push({ id: `${source.id}-railing`, kind: 'barrier', ring: edge, height: flat, style: styles.railing, widthM: 0.08 })
    pointsAlong(edge, LAMP_SPACING_M).forEach((point, k) => out.push({
      id: `${source.id}-lamp-${k}`, kind: 'furniture', point, height: flat, style: styles.lamp,
    }))
  }
  return out
}
