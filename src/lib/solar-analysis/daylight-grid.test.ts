import { describe, it, expect } from 'vitest'
import { roomGrid, insideFloor, overcastWeights, cieOvercast, internalReflected, gridLevel, roomReflectance, type Tri2 } from './daylight-grid'

const box = { min: { x: 0, y: 3, z: 0 }, max: { x: 6, y: 5.7, z: 4 } }
// An L: the 6 × 4 box minus its top-right 3 × 2 corner.
const L: Tri2[] = [
  { ax: 0, az: 0, bx: 6, bz: 0, cx: 6, cz: 2 }, { ax: 0, az: 0, bx: 6, bz: 2, cx: 0, cz: 2 },
  { ax: 0, az: 2, bx: 3, bz: 2, cx: 3, cz: 4 }, { ax: 0, az: 2, bx: 3, bz: 4, cx: 0, cz: 4 },
]

describe('daylight grid', () => {
  it('lays points on the working plane, clear of the walls', () => {
    const g = roomGrid(box, [], 1)
    expect(g.length).toBe(5 * 3)
    expect(g.every((p) => p.y === 3.85 && p.x >= 0.5 && p.x <= 5.5 && p.z >= 0.5 && p.z <= 3.5)).toBe(true)
  })

  it('follows the real footprint of an L-shaped room', () => {
    expect(insideFloor(1, 3, L)).toBe(true)
    expect(insideFloor(5, 3, L)).toBe(false)
    const g = roomGrid(box, L, 0.5)
    expect(g.some((p) => p.x > 3 && p.z > 2)).toBe(false)
    expect(g.length).toBeGreaterThan(20)
  })

  it('CIE overcast: the zenith is three times the horizon; weights add up to the horizontal illuminance', () => {
    expect(cieOvercast(Math.PI / 2) / cieOvercast(0)).toBeCloseTo(3, 6)
    const dirs = Array.from({ length: 2000 }, (_, i) => {
      const y = 1 - (i + 0.5) / 2000, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5))
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r }
    })
    const { horizontal } = overcastWeights(dirs)
    // ∫ (1 + 2 sin h)/3 · sin h dω over the hemisphere = 7π/9.
    expect(horizontal).toBeCloseTo((7 * Math.PI) / 9, 2)
  })

  it('internally reflected component: BRE order of magnitude', () => {
    // 6 m² glass, 120 m² of surfaces, R 0.5, T 0.7: 0.7·6·(39·0.3 + 5·0.65)/(120·0.5) ≈ 1.05 %
    expect(internalReflected({ transmittance: 0.7, glazedArea: 6, innerArea: 120, reflectance: 0.5 })).toBeCloseTo(1.05, 2)
    expect(internalReflected({ transmittance: 0.7, glazedArea: 6, innerArea: 120, reflectance: 0.5, obstructionDeg: 60 }))
      .toBeLessThan(internalReflected({ transmittance: 0.7, glazedArea: 6, innerArea: 120, reflectance: 0.5 }))
  })

  it('glass lowers a room\'s mean reflectance', () => {
    expect(roomReflectance(0.5, 100, 0)).toBe(0.5)
    expect(roomReflectance(0.5, 100, 25)).toBeCloseTo(0.4, 6)
  })

  it('EN 17037 levels from the share of the plane', () => {
    const t = { d100: 0.7, d300: 2, d500: 3.4, d750: 5 }
    // 60 % of points ≥ 2 %, all ≥ 0.7 % → minimum.
    expect(gridLevel([...Array(60).fill(2.5), ...Array(40).fill(1)], t).level).toBe('minimum')
    // Same, but 10 % of points in the dark → none.
    expect(gridLevel([...Array(60).fill(2.5), ...Array(30).fill(1), ...Array(10).fill(0.2)], t).level).toBe('none')
    expect(gridLevel(Array(100).fill(6), t).level).toBe('high')
  })
})

describe('floors', () => {
  it('groups rooms whose floors sit at the same level', async () => {
    const { floorsOf } = await import('./daylight-grid')
    const b = (y: number, x: number) => ({ min: { x, y, z: 0 }, max: { x: x + 4, y: y + 3, z: 5 } })
    const f = floorsOf([{ key: 'a', box: b(0, 0) }, { key: 'b', box: b(0.2, 5) }, { key: 'c', box: b(3.5, 0) }])
    expect(f.map((g) => g.keys)).toEqual([['a', 'b'], ['c']])
    expect(f[0].max.x).toBe(9)
  })
})
