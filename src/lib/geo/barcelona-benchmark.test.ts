// ─── Barcelona reality benchmark ──────────────────────────────────────────────
// The Port Vell benchmark's sibling, for the city fabric rather than the
// waterfront. Three real captures (see the `_source` of each fixture):
//
//   • EIXAMPLE — Consell de Cent × Enric Granados: Cerdà perimeter blocks,
//     CartoBCN plot footprints running to the middle of the block, courtyards
//     mapped as inner rings, 122 signal nodes on one-way streets.
//   • CIUTADELLA — the park: surveyed benches, lanterns, drinking fountains,
//     railings, walls and hedges.
//   • TRINITAT — the Nus de la Trinitat: flyovers stacked on layers 1 to 3.
//
// Every number pinned here was MEASURED on these files, and each block of
// assertions names the defect it guards. A number moving is a change in what
// Barcelona looks like; an invariant failing is a regression.

import { describe, it, expect } from 'vitest'
import eixampleJson from './__fixtures__/barcelona-eixample.json'
import ciutadellaJson from './__fixtures__/barcelona-ciutadella.json'
import trinitatJson from './__fixtures__/barcelona-trinitat.json'
import { parseOsmFeatures, type OsmFeature, type LatLonPoint } from './osm-features'
import { barcelonaFabric } from './barcelona-fabric'
import { planFurniture, planSignals } from './street-furniture'
import { solveSceneVertical, buildWaterMask } from './osm-scene'
import { findLevelCrossings, sampleProfile, type VerticalWay } from './vertical-network'
import { CROSSING_CLEARANCE_M } from './vertical'
import { metresToNormalized } from './geo-math'

interface Fixture { _box: { lat: number; lon: number }; _bbox: { south: number; west: number; north: number; east: number } }

function load(json: unknown) {
  const fx = json as Fixture
  const features = parseOsmFeatures(json, { bbox: fx._bbox })
  const { lat, lon } = fx._box
  const kLon = 111_320 * Math.cos((lat * Math.PI) / 180)
  const toLocal = (p: LatLonPoint) => ({ x: (p.lon - lon) * kLon, y: (p.lat - lat) * 111_320 })
  return { features, lat, lon, toLocal }
}

/** Inside any vehicular carriageway's width. */
function onCarriageway(features: ReadonlyArray<OsmFeature>, toLocal: (p: LatLonPoint) => { x: number; y: number }) {
  const segs = features
    .filter((f) => f.kind === 'road' && f.widthM !== undefined && f.style.roadClass === 'vehicular'
      && !f.style.crossing && f.vertical?.structure !== 'tunnel' && f.vertical?.structure !== 'bridge')
    .flatMap((f) => f.ring!.slice(1).map((b, i) => ({ a: toLocal(f.ring![i]), b: toLocal(b), half: f.widthM! / 2 })))
  return (p: { x: number; y: number }): boolean => segs.some(({ a, b, half }) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < half - 0.05
  })
}

describe('Barcelona benchmark · the Eixample block', () => {
  const E = load(eixampleJson)
  const buildings = E.features.filter((f) => f.kind === 'building').map((f) => ({ ...f, ring: f.ring! }))
  const fabric = barcelonaFabric(buildings, E.features, E.lat)

  it('keeps the courtyards the survey mapped as inner rings', () => {
    // 71 building relations carry an inner ring in the full 800 m box; these
    // are the ones in this crop. Before, every one was drawn filled.
    expect(E.features.filter((f) => f.kind === 'building' && f.holes?.length).length).toBe(9)
  })

  it('recognises the perimeter blocks and hollows out their interiors', () => {
    const interior = fabric.filter((b) => b.interior)
    // Measured: 134 deep plots split front/back across 14 recognised blocks.
    expect(interior.length).toBe(133)
    // The back of a plot is a ground floor, never the 20 m the prior guessed.
    for (const b of interior) expect(b.height.heightM).toBeLessThanOrEqual(4.5 + 1e-9)
    // And the fronts keep a whole Eixample street height.
    const fronts = fabric.filter((b) => !b.interior && b.height.basis === 'guess' && !b.isBuildingPart)
    const tall = fronts.filter((b) => b.height.heightM >= 19)
    expect(tall.length / fronts.length).toBeGreaterThan(0.8)
  })

  it('never stands a signal mast or a bench on the carriageway', () => {
    const inside = onCarriageway(E.features, E.toLocal)
    const masts = planSignals(E.features, E.toLocal)
    expect(masts.length).toBe(199)
    expect(masts.filter((m) => inside(m.at))).toEqual([])
    const benches = planFurniture(E.features, E.toLocal).filter((p) => p.slot === 'bench')
    expect(benches.filter((b) => inside(b.at))).toEqual([])
  })

  it('turns every vehicle mast on a one-way street to face the oncoming traffic', () => {
    const byId = new Map(E.features.map((f) => [f.id, f]))
    const masts = planSignals(E.features, E.toLocal).filter((m) => m.kind === 'vehicle')
    let checked = 0
    for (const m of masts) {
      const node = byId.get(m.at.seed.replace(/(-?1)L?$/, ''))
      if (!node?.point) continue
      // The one-way carriageway the node sits on, and its direction there.
      const way = E.features.find((f) => f.kind === 'road' && f.style.oneway && !f.style.onewayReverse
        && f.ring?.some((p) => p.lat === node.point!.lat && p.lon === node.point!.lon))
      if (!way || node.style.signalDirection) continue
      const i = way.ring!.findIndex((p) => p.lat === node.point!.lat && p.lon === node.point!.lon)
      const a = E.toLocal(way.ring![Math.max(0, i - 1)]), b = E.toLocal(way.ring![Math.min(way.ring!.length - 1, i + 1)])
      const travel = { x: b.x - a.x, y: b.y - a.y }
      const facing = { x: Math.cos(m.at.yaw), y: Math.sin(m.at.yaw) }
      expect(travel.x * facing.x + travel.y * facing.y).toBeLessThan(0)
      checked++
    }
    expect(checked).toBeGreaterThan(10)
  })
})

describe('Barcelona benchmark · the park', () => {
  const C = load(ciutadellaJson)

  it('draws what the park survey holds', () => {
    const count = (k: OsmFeature['kind']) => C.features.filter((f) => f.kind === k).length
    expect(count('barrier')).toBe(91)    // railings, walls, hedges — none were requested before
    // Benches, lanterns, fountains, bins, bollards — and the park's statues,
    // busts, play equipment and pergolas (7 more in this crop).
    expect(count('furniture')).toBe(131)
    const art = C.features.filter((f) => ['artwork', 'playground', 'shelter'].includes(f.style.furniture ?? ''))
    expect(art.length).toBe(7)
  })

  it('stands park lanterns on the paths and street lamps at the kerb', () => {
    const plans = planFurniture(C.features, C.toLocal)
    const slot = (s: string) => plans.filter((p) => p.slot === s).length
    expect(slot('lamp-park')).toBe(27)
    expect(slot('lamp-street')).toBe(9)
    const inside = onCarriageway(C.features, C.toLocal)
    // Bollards excepted: standing IN the carriageway is what they are for.
    expect(plans.filter((p) => p.slot !== 'bollard' && inside(p.at))).toEqual([])
  })

  it('faces every bench toward the path it sits beside', () => {
    const paths = C.features.filter((f) => f.kind === 'road' && f.widthM !== undefined && f.style.roadClass === 'pedestrian')
      .flatMap((f) => f.ring!.slice(1).map((b, i) => ({ a: C.toLocal(f.ring![i]), b: C.toLocal(b) })))
    const nearest = (p: { x: number; y: number }) => {
      let best = { d: Infinity, x: 0, y: 0 }
      for (const { a, b } of paths) {
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
        const x = a.x + t * dx, y = a.y + t * dy, d = Math.hypot(p.x - x, p.y - y)
        if (d < best.d) best = { d, x, y }
      }
      return best
    }
    // A surveyed `direction` wins over any inference (two benches here carry
    // one), so only the inferred ones are held to the rule.
    const tagged = new Set(C.features.filter((f) => f.style.directionDeg !== undefined).map((f) => f.id))
    const benches = planFurniture(C.features, C.toLocal).filter((p) => p.slot === 'bench' && !tagged.has(p.at.seed))
    const beside = benches.filter((b) => nearest(b.at).d < 8)
    expect(beside.length).toBeGreaterThan(30)
    for (const b of beside) {
      const n = nearest(b.at)
      const to = { x: n.x - b.at.x, y: n.y - b.at.y }
      expect(to.x * Math.cos(b.at.yaw) + to.y * Math.sin(b.at.yaw)).toBeGreaterThan(0)
    }
  })
})

describe('Barcelona benchmark · the Nus de la Trinitat', () => {
  const T = load(trinitatJson)
  const opts = { anchorLat: T.lat, anchorLon: T.lon, quality: 'detailed' as const }
  const solved = solveSceneVertical(T.features, opts, buildWaterMask(T.features, { mToN: metresToNormalized(T.lat) }))

  it('clears every road a flyover crosses, wherever along the deck it crosses', () => {
    // Before the crossing floors: the Ronda de Dalt (layer 2) stood 2.7 m over
    // a slip road that was itself climbing, and short deck pieces sagged onto
    // the streets beside their junctions.
    const ways: VerticalWay[] = T.features
      .filter((f) => f.vertical && solved.has(f.id))
      .map((f) => ({ id: f.id, points: solved.get(f.id)!.points, functional: f.functional!, tags: f.vertical! }))
    const crossings = findLevelCrossings(ways, { mToN: metresToNormalized(T.lat) })
    const byId = new Map(ways.map((w) => [w.id, w]))
    let bridgesChecked = 0
    const short: string[] = []
    for (const c of crossings) {
      const over = solved.get(c.overId)!, under = solved.get(c.underId)!
      if (over.structure !== 'bridge' || under.structure === 'tunnel' || under.structure === 'trench') continue
      if (c.underFunctional === 'pedestrian') continue
      const s = over.stationM
      let i = 0
      while (i < s.length - 2 && s[i + 1] < c.stationM) i++
      const t = (c.stationM - s[i]) / Math.max(1e-9, s[i + 1] - s[i])
      const at = over.points[i].clone().lerp(over.points[i + 1], t)
      const top = over.elevationM[i] + (over.elevationM[i + 1] - over.elevationM[i]) * t
      const below = sampleProfile(under).sample(at.x, at.y)!.elevationM
      bridgesChecked++
      if (top - below < CROSSING_CLEARANCE_M[c.underFunctional] - 0.6) short.push(`${c.overId} over ${c.underId}: ${(top - below).toFixed(1)} m`)
      void byId
    }
    expect(bridgesChecked).toBeGreaterThan(5)
    expect(short).toEqual([])
  })
})
