import { describe, expect, it } from 'vitest'
import {
  buildHydroNetwork, joinPatches, levelOnProfile, nodeKey, solveWaterLevels, structureOf, waterRegimeOf,
  type LL,
} from './hydro-network'

// A small valley running east, ~111 m per 0.001° of longitude at the equator.
const P = (lon: number, lat = 0): LL => ({ lat, lon })
/** Ground that falls 1 m per 0.001° eastward from 50 m. */
const slope = (p: LL) => 50 - p.lon * 1000

describe('buildHydroNetwork', () => {
  it('finds sources, a confluence and a mouth into the sea', () => {
    const net = buildHydroNetwork([
      { id: 'a', line: [P(0, 0.001), P(0.002)], widthM: 10 },
      { id: 'b', line: [P(0, -0.001), P(0.002)], widthM: 6 },
      { id: 'c', line: [P(0.002), P(0.005)], widthM: 14 },
    ], [], [{ id: 'sea', isSea: true, ring: [P(0.004, -1), P(1, -1), P(1, 1), P(0.004, 1)] }])
    expect(net.nodes.get(nodeKey(P(0.002)))!.kind).toBe('confluence')
    expect(net.nodes.get(nodeKey(P(0, 0.001)))!.kind).toBe('source')
    const mouth = net.nodes.get(nodeKey(P(0.005)))!
    expect(mouth.kind).toBe('mouth-sea')
    expect(mouth.bodyId).toBe('sea')
    expect(net.nodes.get(nodeKey(P(0.002)))!.widthM).toBe(14)
  })

  it('tells a lake outlet and a bifurcation apart', () => {
    const lake = { id: 'lake', isSea: false, ring: [P(-0.002, -0.001), P(0.0005, -0.001), P(0.0005, 0.001), P(-0.002, 0.001)] }
    const net = buildHydroNetwork([
      { id: 'out', line: [P(0), P(0.002)], widthM: 8 },
      { id: 'l', line: [P(0.002), P(0.004, 0.001)], widthM: 5 },
      { id: 'r', line: [P(0.002), P(0.004, -0.001)], widthM: 5 },
    ], [], [lake])
    expect(net.nodes.get(nodeKey(P(0)))!.kind).toBe('outlet')
    expect(net.nodes.get(nodeKey(P(0.002)))!.kind).toBe('bifurcation')
  })
})

describe('solveWaterLevels', () => {
  it('never lets the water rise downstream over a bridge hump in the DEM', () => {
    const net = buildHydroNetwork([{ id: 'r', line: [P(0), P(0.001), P(0.002), P(0.003)], widthM: 10 }], [], [])
    const hump = (p: LL) => (p.lon === 0.002 ? 80 : slope(p))
    const prof = solveWaterLevels(net, hump, () => undefined).get('r')!
    for (let i = 1; i < prof.levelsM.length; i++) expect(prof.levelsM[i]).toBeLessThanOrEqual(prof.levelsM[i - 1])
    expect(prof.levelsM[2]).toBe(49)
  })

  it('joins tributaries at one level: the outgoing reach starts at the lower', () => {
    const net = buildHydroNetwork([
      { id: 'hi', line: [P(0, 0.001), P(0.002)], widthM: 6 },
      { id: 'lo', line: [P(0, -0.001), P(0.002)], widthM: 6 },
      { id: 'down', line: [P(0.002), P(0.004)], widthM: 10 },
    ], [], [])
    const ground = (p: LL) => (p.lat < 0 && p.lon === 0.002 ? 40 : slope(p))
    const prof = solveWaterLevels(net, ground, () => undefined)
    expect(prof.get('down')!.levelsM[0]).toBe(Math.min(prof.get('hi')!.levelsM[1], prof.get('lo')!.levelsM[1]))
  })

  it('floors the reach at the sea it drains into', () => {
    const sea = { id: 'sea', isSea: true, ring: [P(0.002, -1), P(1, -1), P(1, 1), P(0.002, 1)] }
    const net = buildHydroNetwork([{ id: 'r', line: [P(0), P(0.001), P(0.003)], widthM: 10 }], [], [sea])
    // The DEM over the estuary reads below the datum.
    const prof = solveWaterLevels(net, (p) => (p.lon > 0.0005 ? -4 : 3), (id) => (id === 'sea' ? 0 : undefined)).get('r')!
    expect(prof.levelsM).toEqual([3, 0, 0])
  })

  it('drops by at least the tagged height at a weir', () => {
    const weir = structureOf('n1', { waterway: 'weir', height: '2.5' }, P(0.002))!
    const net = buildHydroNetwork([{ id: 'r', line: [P(0), P(0.001), P(0.002), P(0.003)], widthM: 10 }], [weir], [])
    const prof = solveWaterLevels(net, () => 20, () => undefined).get('r')!
    expect(prof.levelsM).toEqual([20, 20, 17.5, 17.5])
  })

  it('survives a canal loop', () => {
    const net = buildHydroNetwork([
      { id: 'a', line: [P(0), P(0.001)], widthM: 5 },
      { id: 'b', line: [P(0.001), P(0.001, 0.001)], widthM: 5 },
      { id: 'c', line: [P(0.001, 0.001), P(0)], widthM: 5 },
    ], [], [])
    expect(solveWaterLevels(net, slope, () => undefined).size).toBe(3)
  })
})

describe('levelOnProfile', () => {
  it('interpolates along the centreline', () => {
    const lv = levelOnProfile(P(0.0005, 0.00001), { lineId: 'r', line: [P(0), P(0.001)], levelsM: [10, 8] })
    expect(lv).toBeCloseTo(9, 1)
  })
})

describe('joinPatches', () => {
  it('pads a confluence, carries a mouth into the sea and marks white water', () => {
    const fall = structureOf('n9', { waterway: 'waterfall' }, P(0.001))!
    const net = buildHydroNetwork([
      { id: 'a', line: [P(0, 0.001), P(0.002)], widthM: 10 },
      { id: 'b', line: [P(0, -0.001), P(0.002)], widthM: 6 },
      { id: 'c', line: [P(0.002), P(0.003), P(0.005)], widthM: 14 },
      { id: 'f', line: [P(0, 0.002), P(0.001), P(0.002, 0.002)], widthM: 4 },
    ], [fall], [{ id: 'sea', isSea: true, ring: [P(0.004, -1), P(1, -1), P(1, 1), P(0.004, 1)] }])
    const roles = joinPatches(net).map((p) => p.role).sort()
    expect(roles).toEqual(['junction', 'mouth', 'whitewater'])
    expect(fall.dropM).toBe(5)
  })
})

describe('regimes and structures', () => {
  it('reads stagnant, tidal and flowing water', () => {
    expect(waterRegimeOf({ natural: 'water', water: 'pond' })).toBe('still')
    expect(waterRegimeOf({ natural: 'water', water: 'reservoir' })).toBe('still')
    expect(waterRegimeOf({ natural: 'water', water: 'lagoon' })).toBe('tidal')
    expect(waterRegimeOf({ natural: 'water', water: 'river' })).toBe('flowing')
    expect(waterRegimeOf({ waterway: 'riverbank' })).toBe('flowing')
  })
  it('ignores what is not a drop', () => {
    expect(structureOf('x', { waterway: 'river' }, P(0))).toBeNull()
    expect(structureOf('x', { waterway: 'dam' }, P(0))!.dropM).toBe(8)
  })
})
