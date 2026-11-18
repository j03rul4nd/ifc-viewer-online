// ─── perimeter-blocks tests ───────────────────────────────────────────────────
// A synthetic Cerdà block: a 110 m square ring of deep plots that meet in the
// middle, as CartoBCN maps them. The split must hollow it out to the buildable
// depth, keep the front heights, and leave everything that is not a guess alone.

import { describe, it, expect } from 'vitest'
import { splitPerimeterBlocks, insetConvex, convexHull, area } from './perimeter-blocks'
import type { BuildingHeight } from './buildings'

const LAT = 41.39
const LON = 2.16
const kLon = 111_320 * Math.cos((LAT * Math.PI) / 180)
const ll = (x: number, y: number) => ({ lat: LAT + y / 111_320, lon: LON + x / kLon })
const guess: BuildingHeight = { heightM: 20, minHeightM: 0, estimated: true, basis: 'guess' }

/** Plots of `w` m frontage along each side of a `side` m square, each reaching the centre. */
function block(side = 110, w = 22): Array<{ id: string; ring: ReturnType<typeof ll>[]; height: BuildingHeight }> {
  const h = side / 2
  const out: Array<{ id: string; ring: ReturnType<typeof ll>[]; height: BuildingHeight }> = []
  // Triangular-ish wedges from each frontage to the centre tile the square exactly.
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]]
  let n = 0
  for (let s = 0; s < 4; s++) {
    const [ax, ay] = corners[s], [bx, by] = corners[(s + 1) % 4]
    const steps = Math.round(side / w)
    for (let k = 0; k < steps; k++) {
      const p0 = [ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps]
      const p1 = [ax + ((bx - ax) * (k + 1)) / steps, ay + ((by - ay) * (k + 1)) / steps]
      out.push({ id: `p${n++}`, ring: [ll(p0[0], p0[1]), ll(p1[0], p1[1]), ll(0, 0)], height: { ...guess } })
    }
  }
  return out
}

describe('perimeter-blocks geometry', () => {
  it('insets a convex polygon on every side', () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    const inner = insetConvex(sq, 20)!
    expect(area(inner)).toBeCloseTo(60 * 60, 3)
    expect(insetConvex(sq, 60)).toBeNull()
  })

  it('takes the hull counter-clockwise and complete', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(area(convexHull(pts))).toBeCloseTo(100, 6)
  })
})

describe('splitPerimeterBlocks', () => {
  const rules = () => ({ depthM: 25, interiorHeightM: 4.5 })

  it('hollows a block of deep plots out to the buildable depth', () => {
    const plots = block()
    const r = splitPerimeterBlocks(plots, LAT, rules)
    expect(r.blocks).toHaveLength(1)
    expect(r.split).toBe(plots.length)
    const interior = r.buildings.filter((b) => b.interior)
    const fronts = r.buildings.filter((b) => !b.interior)
    expect(interior.length).toBe(plots.length)
    for (const b of interior) expect(b.height.heightM).toBe(4.5)
    for (const b of fronts) expect(b.height.heightM).toBe(20)
    // The interior outline is the block less 25 m each side: 60 × 60 m.
    const interiorArea = (() => {
      const pts = r.blocks[0].interior.map((p) => ({ x: (p.lon - LON) * kLon, y: (p.lat - LAT) * 111_320 }))
      return area(pts)
    })()
    expect(interiorArea).toBeGreaterThan(55 * 55)
    expect(interiorArea).toBeLessThan(65 * 65)
  })

  it('leaves surveyed heights, building parts and places with no fabric alone', () => {
    const plots = block().map((p, i) => i === 0
      ? { ...p, height: { heightM: 30, minHeightM: 0, estimated: false, basis: 'height' as const } }
      : i === 1 ? { ...p, isBuildingPart: true } : p)
    const r = splitPerimeterBlocks(plots, LAT, rules)
    expect(r.split).toBe(plots.length - 2)
    expect(r.buildings.find((b) => b.id === 'p0')!.height.heightM).toBe(30)
    expect(splitPerimeterBlocks(block(), LAT, () => null).split).toBe(0)
  })

  it('keeps a mapped garden open instead of roofing it', () => {
    const r = splitPerimeterBlocks(block(), LAT, rules, () => true)
    expect(r.buildings.filter((b) => b.interior)).toHaveLength(0)
    expect(r.split).toBeGreaterThan(0)
  })
})
