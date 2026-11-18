import { describe, expect, it } from 'vitest'
import { sampleSurface } from './surface-sampling'
import { boxGeometry, translated } from './synthetic-scene'

const box = boxGeometry(7, 'IfcColumn', [0, 0, 0], [1, 2, 4])

describe('sampleSurface', () => {
  it('computes world area and puts every sample on the surface', () => {
    const s = sampleSurface(box, { count: 500 })
    expect(s.area).toBeCloseTo(2 * (2 + 4 + 8), 5)
    for (let i = 0; i < 500; i++) {
      const x = s.positions[i * 3], y = s.positions[i * 3 + 1], z = s.positions[i * 3 + 2]
      const onFace = Math.min(Math.abs(x), Math.abs(x - 1), Math.abs(y), Math.abs(y - 2), Math.abs(z), Math.abs(z - 4))
      expect(onFace).toBeLessThan(1e-5)
    }
  })

  it('is deterministic per seed and differs across seeds', () => {
    const a = sampleSurface(box, { count: 100, seed: 1 })
    const b = sampleSurface(box, { count: 100, seed: 1 })
    const c = sampleSurface(box, { count: 100, seed: 2 })
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions))
    expect(Array.from(a.positions)).not.toEqual(Array.from(c.positions))
  })

  it('weights faces by area', () => {
    const s = sampleSurface(box, { count: 20000, seed: 3 })
    let top = 0
    for (let i = 0; i < 20000; i++) if (Math.abs(s.positions[i * 3 + 2] - 4) < 1e-5) top++
    // top face is 2 m² of 28 m²
    expect(top / 20000).toBeCloseTo(2 / 28, 2)
  })

  it('emits outward unit normals', () => {
    const s = sampleSurface(box, { count: 300 })
    for (let i = 0; i < 300; i++) {
      const p = [s.positions[i * 3] - 0.5, s.positions[i * 3 + 1] - 1, s.positions[i * 3 + 2] - 2]
      const n = [s.normals[i * 3], s.normals[i * 3 + 1], s.normals[i * 3 + 2]]
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5)
      expect(p[0] * n[0] + p[1] * n[1] + p[2] * n[2]).toBeGreaterThan(0)
    }
  })

  it('applies the column-major world matrix', () => {
    const s = sampleSurface(translated(box, 10, 0, 0), { count: 200 })
    for (let i = 0; i < 200; i++) expect(s.positions[i * 3]).toBeGreaterThanOrEqual(10 - 1e-5)
  })

  it('clamps density-derived counts and handles empty geometry', () => {
    expect(sampleSurface(box, { density: 1 }).positions.length / 3).toBe(50)
    expect(sampleSurface(box, { density: 1000 }).positions.length / 3).toBe(2000)
    const empty = sampleSurface({ id: 1, ifcClass: 'X', positions: new Float32Array(), indices: new Uint32Array() })
    expect(empty.positions.length).toBe(0)
  })
})
