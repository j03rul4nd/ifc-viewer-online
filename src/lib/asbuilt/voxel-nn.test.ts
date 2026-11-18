import { describe, expect, it } from 'vitest'
import { seededRandom } from './surface-sampling'
import { buildVoxelGrid, nearestDistance } from './voxel-nn'

describe('voxel nearest neighbour', () => {
  it('matches brute force across chunks, negative coords included', () => {
    const rand = seededRandom(5)
    const chunks = [0, 1, 2].map(() => Float32Array.from({ length: 3 * 400 }, () => rand() * 4 - 2))
    const grid = buildVoxelGrid(chunks, 0.3)
    expect(grid.count).toBe(1200)
    for (let q = 0; q < 200; q++) {
      const x = rand() * 4 - 2, y = rand() * 4 - 2, z = rand() * 4 - 2
      let best = Infinity
      for (const c of chunks) for (let i = 0; i < c.length; i += 3) {
        best = Math.min(best, Math.hypot(c[i] - x, c[i + 1] - y, c[i + 2] - z))
      }
      const got = nearestDistance(grid, x, y, z, 0.3)
      if (best <= 0.3) expect(got).toBeCloseTo(best, 5)
      else expect(got).toBe(Infinity)
    }
  })

  it('respects a max radius smaller than the cell', () => {
    const grid = buildVoxelGrid([new Float32Array([0, 0, 0])], 1)
    expect(nearestDistance(grid, 0.5, 0, 0, 0.4)).toBe(Infinity)
    expect(nearestDistance(grid, 0.3, 0, 0, 0.4)).toBeCloseTo(0.3, 6)
  })

  it('handles an empty cloud and rejects a bad cell size', () => {
    expect(nearestDistance(buildVoxelGrid([], 1), 0, 0, 0)).toBe(Infinity)
    expect(() => buildVoxelGrid([], 0)).toThrow()
  })
})
