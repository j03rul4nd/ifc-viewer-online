// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { planGrid } from './frame'
import { inflowCandidates, inflowWeights, sourceRadiusM, type InflowChannel } from './inflow-source'

// A 100 × 100 m grid at 2 m; scene x east, z = −north.
const plan = planGrid({ points: [{ x: 0, z: 0 }, { x: 100, z: -100 }], rotation: 0, marginM: 0, cellM: 2, maxCells: 1e6 })
const P = (x: number, n: number) => ({ x, z: -n })
const ch = (id: string, line: Array<{ x: number; z: number }>, o: Partial<InflowChannel> = {}): InflowChannel => ({
  id, cls: 'stream', historic: false, culvert: false, widthM: 3, line, ...o,
})

describe('where watercourses enter the grid', () => {
  it('enters where the line crosses in, following the direction OSM draws it', () => {
    const c = inflowCandidates(plan, [ch('s', [P(-30, 50), P(130, 50)])])
    expect(c).toHaveLength(1)
    expect(c[0].edge).toBe(true)
    expect(c[0].entry.x).toBeCloseTo(1, 5) // half a cell inside the west edge
    expect(-c[0].entry.z).toBeCloseTo(50, 5)
  })

  it('takes a course rising inside the area, but not a way that only continues another', () => {
    const a = ch('a', [P(-20, 30), P(40, 30)], { name: 'Riera' })
    const b = ch('b', [P(40, 30), P(90, 10)], { name: 'Riera' })
    const spring = ch('c', [P(60, 80), P(120, 80)])
    const ids = inflowCandidates(plan, [a, b, spring]).map((x) => x.id)
    expect(ids.sort()).toEqual(['a', 'c'])
  })

  it('ignores courses that never come in, and lists the widest first', () => {
    const out = ch('out', [P(-50, -50), P(-10, -10)])
    const river = ch('river', [P(50, 140), P(50, -40)], { cls: 'river', widthM: 20 })
    const gone = ch('gone', [P(130, 20), P(20, 20)], { historic: true, widthM: 5 })
    const c = inflowCandidates(plan, [out, gone, river])
    expect(c.map((x) => x.id)).toEqual(['river', 'gone'])
    expect(c[1].historic).toBe(true)
  })
})

describe('the cells a discharge enters by', () => {
  it('spreads it over the open cells within the radius', () => {
    const blocked = new Uint8Array(plan.nx * plan.ny)
    const w = inflowWeights(plan, blocked, P(51, 51), 3)!
    const cells = [...w.keys()].filter((c) => w[c] > 0)
    expect(cells.length).toBeGreaterThan(4)
    for (const c of cells) expect(w[c]).toBe(1)
  })

  it('falls back to the nearest open cell when the point is on a building', () => {
    const blocked = new Uint8Array(plan.nx * plan.ny)
    for (let j = 20; j < 30; j++) for (let i = 20; i < 30; i++) blocked[j * plan.nx + i] = 1
    const w = inflowWeights(plan, blocked, P(50, 50), 1)!
    const cells = [...w.keys()].filter((c) => w[c] > 0)
    expect(cells).toHaveLength(1)
    expect(blocked[cells[0]]).toBe(0)
  })

  it('sizes the source by the channel, or a few cells for a point', () => {
    expect(sourceRadiusM(2, 20)).toBe(10)
    expect(sourceRadiusM(2, 1)).toBe(2)
    expect(sourceRadiusM(2)).toBe(3)
  })
})
