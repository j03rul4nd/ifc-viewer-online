// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { affectedCsv, affectedKind, findAffected, type Candidate, type GridResult } from './affected'

/**
 * A 20 × 20 grid of 1 m cells, flat ground at y = 0, aligned with the scene
 * (cell (i, j) spans x ∈ [i, i+1], z ∈ [−j−1, −j]). A building occupies
 * i, j ∈ [8, 11] (blocked). Water: 0.30 m deep west of i = 8, dry east of it.
 */
function site(): GridResult {
  const nx = 20, ny = 20
  const bedY = new Float32Array(nx * ny)
  const blocked = new Uint8Array(nx * ny)
  const hMax = new Float32Array(nx * ny)
  const tWet = new Float32Array(nx * ny).fill(-1)
  const tPeak = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i
      if (i >= 8 && i <= 11 && j >= 8 && j <= 11) { blocked[c] = 1; continue }
      if (i < 8) { hMax[c] = 0.3; tWet[c] = 600; tPeak[c] = 1800 }
    }
  }
  return { plan: { frame: { originX: 0, originZ: 0, rotation: 0 }, nx, ny, dx: 1 }, bedY, blocked, hMax, tWet, tPeak }
}

const el = (expressId: number, ifcClass: string, x0: number, x1: number, b0: number, b1: number, y0: number, y1 = y0 + 2): Candidate => ({
  modelId: 'm', expressId, ifcClass,
  box: { min: { x: x0, y: y0, z: -b1 }, max: { x: x1, y: y1, z: -b0 } },
})

describe('affected elements', () => {
  it('reads the water standing outside a door set in a wall (the cells under it are blocked)', () => {
    // Door in the building's west wall, sill 10 cm above the ground.
    const r = findAffected([el(1, 'IFCDOOR', 8, 8.2, 9, 10, 0.1)], site())
    expect(r).toHaveLength(1)
    expect(r[0].depth).toBeCloseTo(0.2, 5)
    expect(r[0].waterDepth).toBeCloseTo(0.3, 5)
    expect(r[0].belowGround).toBe(false)
    expect(r[0].arrivalS).toBe(600)
    expect(r[0].peakS).toBe(1800)
  })

  it('leaves out what the water does not reach: a higher sill, the dry side, an interior element', () => {
    const r = findAffected([
      el(2, 'IFCDOOR', 8, 8.2, 9, 10, 0.4), // sill above the water
      el(3, 'IFCDOOR', 11.8, 12, 9, 10, 0.0), // east wall: dry outside
      el(4, 'IFCFLOWTERMINAL', 9.5, 10.5, 9.5, 10.5, 0.0), // inside, walled in, ring of 1 cell
    ], site(), { ringM: 1 })
    expect(r).toHaveLength(0)
  })

  it('flags a basement: a level, not a depth, and sorted after what the water reaches directly', () => {
    const r = findAffected([
      el(5, 'IFCSPACE', 8, 11.9, 8, 11.9, -3.5, -0.5), // basement under the building
      el(6, 'IFCDOOR', 8, 8.2, 9, 10, 0.05),
      el(7, 'IFCWINDOW', 8, 8.2, 10, 11, 0.2),
    ], site())
    expect(r.map((e) => e.expressId)).toEqual([6, 7, 5])
    const basement = r[2]
    expect(basement.belowGround).toBe(true)
    expect(basement.depth).toBeCloseTo(3.8, 5)
    expect(basement.waterDepth).toBeCloseTo(0.3, 5)
  })

  it('finds the footprint through a rotated grid', () => {
    const g = site()
    const rot = 0.6
    g.plan.frame = { originX: 100, originZ: -50, rotation: rot }
    // The same door, moved into the rotated frame: grid-local (a, b) → scene.
    const c = Math.cos(rot), s = Math.sin(rot)
    const at = (a: number, b: number) => ({ x: 100 + a * c - b * s, z: -(50 + a * s + b * c) })
    const p = [at(8, 9), at(8.2, 9), at(8, 10), at(8.2, 10)]
    const box = {
      min: { x: Math.min(...p.map((q) => q.x)), y: 0.1, z: Math.min(...p.map((q) => q.z)) },
      max: { x: Math.max(...p.map((q) => q.x)), y: 2.1, z: Math.max(...p.map((q) => q.z)) },
    }
    const r = findAffected([{ modelId: 'm', expressId: 9, ifcClass: 'IFCDOOR', box }], g)
    expect(r).toHaveLength(1)
    expect(r[0].depth).toBeCloseTo(0.2, 5)
  })

  it('ignores the rain film on a raised step (a centimetre of water 18 cm up is not 19 cm of flood)', () => {
    const g = site()
    g.hMax.fill(0)
    // East of the building: a step 18 cm high, wet with 1.1 cm of rain.
    for (let j = 0; j < 20; j++) for (let i = 12; i < 20; i++) { g.bedY[j * 20 + i] = 0.18; g.hMax[j * 20 + i] = 0.011 }
    const hall = el(1, 'IFCSPACE', 8, 11.9, 8, 11.9, 0)
    expect(findAffected([hall], g)).toEqual([])
    // With 1 cm counting as water (the old default) it was reported.
    expect(findAffected([hall], g, { minDepthM: 0.01 })[0]?.depth).toBeCloseTo(0.191, 3)
  })

  it('reports nothing on a dry run', () => {
    const g = site()
    g.hMax.fill(0)
    expect(findAffected([el(1, 'IFCDOOR', 8, 8.2, 9, 10, -1)], g)).toEqual([])
  })

  it('groups classes and writes a CSV with absolute elevations when the datum is known', () => {
    expect(affectedKind('IfcDoor')).toBe('opening')
    expect(affectedKind('IFCSPACE')).toBe('space')
    expect(affectedKind('IFCRAMPFLIGHT')).toBe('access')
    expect(affectedKind('IFCPUMP')).toBe('equipment')
    const [r] = findAffected([el(1, 'IFCDOOR', 8, 8.2, 9, 10, 0.1)], site())
    r.name = 'Door "main"'
    r.globalId = '2O2Fr$t4X7Zf8NOew3FLOH'
    const csv = affectedCsv([r], (y) => y + 12.5).trim().split('\n')
    expect(csv).toHaveLength(2)
    expect(csv[1]).toBe('"m",1,"2O2Fr$t4X7Zf8NOew3FLOH","IFCDOOR","Door ""main""","",0.200,0.300,no,0.100,0.300,12.600,12.800,600,1800')
    expect(affectedCsv([r], null).split('\n')[1]).toContain(',0.100,0.300,,,600,1800')
  })
})
