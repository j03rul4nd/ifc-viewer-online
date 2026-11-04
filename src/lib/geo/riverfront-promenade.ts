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
