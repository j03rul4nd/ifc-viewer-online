// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { planGrid } from './frame'
import { buildOsmSurface, osmBuildingsReached } from './osm-surface'
import type { OsmFeature } from '../../../lib/geo/osm-features'
import type { Hydrology } from '../../../lib/geo/osm-hydro'
import { extractHydrology, channelOf, waterBarrierOf } from '../../../lib/geo/osm-hydro'

// "lat/lon" here are plain metres: x = lon, z = −lat (north is −z, as in the scene).
const toScene = (lat: number, lon: number) => ({ x: lon, z: -lat })
const P = (lat: number, lon: number) => ({ lat, lon })
const plan = planGrid({ points: [{ x: 0, z: 0 }, { x: 100, z: -100 }], rotation: 0, marginM: 0, cellM: 2, maxCells: 1e6 })
const idx = (i: number, j: number) => j * plan.nx + i
const cellOf = (x: number, n: number) => ({ i: Math.floor(x / 2), j: Math.floor(n / 2) })
const height = { heightM: 10, minHeightM: 0, estimated: false }

function feature(f: Partial<OsmFeature> & Pick<OsmFeature, 'id' | 'kind'>): OsmFeature {
  return { height, style: {}, ...f } as OsmFeature
}

describe('the neighbourhood on the grid', () => {
  const features: OsmFeature[] = [
    // A street along n = 50, 8 m wide.
    feature({ id: 'r1', kind: 'road', ring: [P(50, 0), P(50, 100)], widthM: 8, vertical: { structure: 'ground', layer: 0, eleM: null, minHeightM: null, heightM: null, overWater: false } }),
    // A street on a bridge: not on this ground.
    feature({ id: 'r2', kind: 'road', ring: [P(20, 0), P(20, 100)], widthM: 8, vertical: { structure: 'bridge', layer: 1, eleM: null, minHeightM: null, heightM: null, overWater: false } as never }),
    // A park in the south-west.
    feature({ id: 'g1', kind: 'green', ring: [P(0, 0), P(0, 30), P(30, 30), P(30, 0), P(0, 0)], style: { cover: 'park' } as OsmFeature['style'] }),
    // Two buildings: one where the IFC model stands, one next door, and a canopy.
    feature({ id: 'b1', kind: 'building', ring: [P(70, 70), P(70, 90), P(90, 90), P(90, 70), P(70, 70)], name: 'The model' }),
    feature({ id: 'b2', kind: 'building', ring: [P(70, 10), P(70, 30), P(90, 30), P(90, 10), P(70, 10)], name: 'Neighbour', label: 'School' }),
    feature({ id: 'b3', kind: 'building', ring: [P(60, 40), P(60, 46), P(66, 46), P(66, 40), P(60, 40)], label: 'Canopy' }),
  ]
  const hydro: Hydrology = {
    channels: [
      { id: 'c1', cls: 'stream', line: [P(0, 60), P(100, 60)], widthM: 3, depthM: 0.6, culvert: false, historic: false },
      { id: 'c2', cls: 'river', line: [P(40, 0), P(40, 50)], widthM: 10, depthM: 2, culvert: false, historic: true, name: 'Riera Vella' },
    ],
    barriers: [{ id: 'w1', cls: 'wall', line: [P(10, 40), P(10, 90)], heightM: 1.5 }],
  }
  const modelPlans = [[{ x: 75, z: -75 }, { x: 85, z: -75 }, { x: 85, z: -85 }, { x: 75, z: -85 }]]
  const s = buildOsmSurface({ plan, features, hydro, toScene, modelPlans })

  it('seals and smooths the street, leaves a bridged one off the ground', () => {
    const { i, j } = cellOf(50, 50)
    expect(s.manning[idx(i, j)]).toBeCloseTo(0.016, 6)
    expect(s.infiltration[idx(i, j)]).toBe(0)
    const b = cellOf(50, 20)
    expect(Number.isNaN(s.manning[idx(b.i, b.j)])).toBe(true)
  })

  it('lets the park absorb and roughens it', () => {
    const { i, j } = cellOf(10, 10)
    expect(s.manning[idx(i, j)]).toBeCloseTo(0.035, 6)
    expect(s.infiltration[idx(i, j)]).toBe(1)
  })

  it('cuts the stream into the ground, and keeps the river that is gone as a mask only', () => {
    const st = cellOf(60, 30) // the stream runs north-south along x = 60
    expect(s.cut[idx(st.i, st.j)]).toBeCloseTo(0.6, 6)
    const old = cellOf(20, 40)
    expect(s.oldCourse[idx(old.i, old.j)]).toBe(1)
    expect(s.cut[idx(old.i, old.j)]).toBe(0)
    expect(s.oldCourseNames).toEqual(['Riera Vella'])
  })

  it('raises a continuous wall, one cell wide or more', () => {
    // The wall runs east-west along n = 10, from x = 40 to 90.
    for (let x = 40; x <= 90; x += 2) {
      const { i, j } = cellOf(x, 10)
      const hit = [-1, 0, 1].some((d) => s.raise[idx(i, j + d)] >= 1.5)
      expect(hit, `wall at x=${x}`).toBe(true)
    }
  })

  it("walls the neighbour, not the model's own footprint; a canopy is not a wall", () => {
    const nb = cellOf(20, 80)
    expect(s.blocked[idx(nb.i, nb.j)]).toBe(1)
    const own = cellOf(80, 80)
    expect(s.blocked[idx(own.i, own.j)]).toBe(0)
    const cn = cellOf(43, 63)
    expect(s.canopy[idx(cn.i, cn.j)]).toBe(1)
    expect(s.blocked[idx(cn.i, cn.j)]).toBe(0)
    expect(s.buildings.map((b) => b.id).sort()).toEqual(['b2', 'b3'])
  })

  it('names the neighbours the water reaches, deepest first', () => {
    const n = plan.nx * plan.ny
    const hMax = new Float32Array(n)
    const tWet = new Float32Array(n).fill(-1)
    // 40 cm along the neighbour's west wall.
    for (let nn = 70; nn <= 90; nn += 2) { const { i, j } = cellOf(8, nn); hMax[idx(i, j)] = 0.4; tWet[idx(i, j)] = 900 }
    const reached = osmBuildingsReached(s.buildings, { nx: plan.nx, ny: plan.ny, dx: plan.dx, blocked: s.blocked, buildingOf: s.buildingOf, hMax, tWet })
    expect(reached).toHaveLength(1)
    expect(reached[0]).toMatchObject({ id: 'b2', name: 'Neighbour', label: 'School', arrivalS: 900 })
    expect(reached[0].depth).toBeCloseTo(0.4, 5)
  })

  it('hands a pond only to the buildings that border it, not to one whose bounds merely span it', () => {
    const nx = 20, ny = 10
    const blocked = new Uint8Array(nx * ny)
    const buildingOf = new Int32Array(nx * ny).fill(-1)
    const own = (i: number, j: number, k: number) => { blocked[j * nx + i] = 1; buildingOf[j * nx + i] = k }
    // An L along the south and west edges; its bounds cover the whole west half.
    for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) own(i, j, 0)
    for (let i = 0; i < 2; i++) for (let j = 0; j < 10; j++) own(i, j, 0)
    // A block to the east.
    for (let i = 10; i < 13; i++) for (let j = 7; j < 10; j++) own(i, j, 1)
    const hMax = new Float32Array(nx * ny)
    const tWet = new Float32Array(nx * ny).fill(-1)
    hMax[8 * nx + 8] = 0.5 // 14 m from the L, 4 m from the block
    tWet[8 * nx + 8] = 600
    const bld = (id: string) => ({ id, ring: [], centre: { x: 0, z: 0 }, canopy: false })
    const reached = osmBuildingsReached([bld('L'), bld('block')], { nx, ny, dx: 2, blocked, buildingOf, hMax, tWet })
    expect(reached.map((r) => [r.id, r.depth, r.arrivalS])).toEqual([['block', 0.5, 600]])
  })
})

describe('culverts', () => {
  // Real coordinates this time: the rule is about metres along the pipe.
  const lat0 = 41.4, lon0 = 2.19
  const m = (n: number, e: number) => ({ lat: lat0 + n / 110_574, lon: lon0 + e / (111_320 * Math.cos(lat0 * Math.PI / 180)) })
  const toSceneM = (lat: number, lon: number) => ({
    x: (lon - lon0) * 111_320 * Math.cos(lat0 * Math.PI / 180),
    z: -(lat - lat0) * 110_574,
  })
  const plan2 = planGrid({ points: [{ x: 0, z: 0 }, { x: 200, z: -200 }], rotation: 0, marginM: 0, cellM: 2, maxCells: 1e6 })
  const at = (x: number, n: number) => Math.floor(n / 2) * plan2.nx + Math.floor(x / 2)

  it('cuts a stream under a road (a short crossing), keeps a long piped riera as a buried course', () => {
    const hydro: Hydrology = {
      channels: [
        { id: 'short', cls: 'stream', line: [m(50, 20), m(50, 45)], widthM: 3, depthM: 0.6, culvert: true, historic: false },
        { id: 'riera', cls: 'stream', line: [m(150, 10), m(150, 190)], widthM: 3, depthM: 0.6, culvert: true, historic: false, name: 'Rec Comtal' },
      ],
      barriers: [],
    }
    const s = buildOsmSurface({ plan: plan2, features: [], hydro, toScene: toSceneM })
    expect(s.cut[at(30, 50)]).toBeCloseTo(0.6, 5)
    expect(s.cut[at(100, 150)]).toBe(0)
    expect(s.oldCourse[at(100, 150)]).toBe(1)
    expect(s.oldCourseNames).toEqual(['Rec Comtal'])
    expect(s.counts).toMatchObject({ channels: 1, oldCourses: 1, culverts: 2 })
  })
})

describe('hydrology from Overpass', () => {
  it('reads live, culverted and vanished courses, and the barriers that hold water', () => {
    const geom = [{ lat: 41.4, lon: 2.19 }, { lat: 41.401, lon: 2.191 }]
    const json = {
      elements: [
        { type: 'way', id: 1, tags: { waterway: 'stream', tunnel: 'culvert', name: 'Torrent' }, geometry: geom },
        { type: 'way', id: 2, tags: { 'disused:waterway': 'river', old_name: 'Riera de Sant Martí' }, geometry: geom },
        { type: 'way', id: 3, tags: { waterway: 'canal', disused: 'yes', width: '6 m' }, geometry: geom },
        { type: 'way', id: 4, tags: { man_made: 'dyke' }, geometry: geom },
        { type: 'way', id: 5, tags: { barrier: 'fence' }, geometry: geom },
        { type: 'way', id: 1, tags: { waterway: 'stream' }, geometry: geom },
      ],
    }
    const h = extractHydrology(json)
    expect(h.channels.map((c) => [c.id, c.cls, c.culvert, c.historic])).toEqual([
      ['w1', 'stream', true, false], ['w2', 'river', false, true], ['w3', 'canal', false, true],
    ])
    expect(h.channels[1].name).toBe('Riera de Sant Martí')
    expect(h.channels[2].widthM).toBe(6)
    expect(h.barriers.map((b) => b.cls)).toEqual(['dyke'])
  })

  it('tells water barriers from fences', () => {
    expect(waterBarrierOf({ barrier: 'wall' })).toBe('wall')
    expect(waterBarrierOf({ barrier: 'hedge' })).toBeNull()
    expect(waterBarrierOf({ highway: 'primary', embankment: 'yes' })).toBe('embankment')
    expect(channelOf({ 'was:waterway': 'stream' })).toEqual({ cls: 'stream', historic: true })
    expect(channelOf({ waterway: 'riverbank' })).toBeNull()
  })
})
