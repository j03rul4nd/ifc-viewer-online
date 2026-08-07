// ─── building-mesh tests ──────────────────────────────────────────────────────
// The regression these exist for: footprints were triangulated in NORMALIZED
// units, where a 20 m wall is ~3e-8. That is close enough to earcut's
// degeneracy epsilon that most real footprints collapsed to zero triangles and
// were silently dropped — a whole city block rendered as a handful of blocks.

import { describe, it, expect } from 'vitest'
import { buildBuildingsGeometry } from './building-mesh'
import type { BuildingFootprint } from './buildings'

/** Square footprint of `sizeM` metres, anchored near Barcelona. */
function squareFootprint(id: string, sizeM: number, heightM = 12): BuildingFootprint {
  const lat = 41.3874
  const lon = 2.1686
  const dLat = sizeM / 111_132
  const dLon = sizeM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return {
    id,
    ring: [
      { lat, lon },
      { lat, lon: lon + dLon },
      { lat: lat + dLat, lon: lon + dLon },
      { lat: lat + dLat, lon },
    ],
    height: { heightM, minHeightM: 0, estimated: false },
  }
}

const OPTS = { anchorLat: 41.3874 }

describe('buildBuildingsGeometry', () => {
  it('builds geometry for a realistic 20 m footprint (the precision regression)', () => {
    const result = buildBuildingsGeometry([squareFootprint('a', 20)], OPTS)
    expect(result).not.toBeNull()
    expect(result!.count).toBe(1)
    expect(result!.geometry.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('keeps EVERY building in a dense block, not a fraction of them', () => {
    // 200 small footprints — before the fix the vast majority were dropped.
    const many = Array.from({ length: 200 }, (_, i) => squareFootprint(`b${i}`, 12 + (i % 7)))
    const result = buildBuildingsGeometry(many, OPTS)
    expect(result!.count).toBe(200)
  })

  it('survives footprints down to a few metres across', () => {
    for (const size of [3, 5, 8, 50, 200]) {
      const r = buildBuildingsGeometry([squareFootprint(`s${size}`, size)], OPTS)
      expect(r, `dropped a ${size} m footprint`).not.toBeNull()
      expect(r!.count).toBe(1)
    }
  })

  it('emits matching position, normal and colour attributes', () => {
    const g = buildBuildingsGeometry([squareFootprint('a', 20)], OPTS)!.geometry
    const pos = g.getAttribute('position').count
    expect(g.getAttribute('normal').count).toBe(pos)
    expect(g.getAttribute('color').count).toBe(pos)
  })

  it('produces both a roof cap and walls', () => {
    // A square: roof cap = 2 triangles (6 verts); walls = 4 edges x 2
    // triangles x 3 verts = 24. Non-indexed, so 30 vertices in total.
    const g = buildBuildingsGeometry([squareFootprint('a', 20)], OPTS)!.geometry
    expect(g.getAttribute('position').count).toBe(30)
  })

  it('extrudes upward — the roof sits above the base', () => {
    const g = buildBuildingsGeometry([squareFootprint('a', 20, 30)], OPTS)!.geometry
    const pos = g.getAttribute('position')
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    expect(maxZ).toBeGreaterThan(minZ)
    // Taller building → taller extrusion.
    const tallerG = buildBuildingsGeometry([squareFootprint('a', 20, 60)], OPTS)!.geometry
    const tallerPos = tallerG.getAttribute('position')
    let tallerMax = -Infinity
    for (let i = 0; i < tallerPos.count; i++) tallerMax = Math.max(tallerMax, tallerPos.getZ(i))
    expect(tallerMax).toBeGreaterThan(maxZ)
  })

  it('handles both ring windings identically', () => {
    const cw = squareFootprint('cw', 20)
    const ccw: BuildingFootprint = { ...cw, ring: [...cw.ring].reverse() }
    const a = buildBuildingsGeometry([cw], OPTS)!
    const b = buildBuildingsGeometry([ccw], OPTS)!
    expect(a.geometry.getAttribute('position').count)
      .toBe(b.geometry.getAttribute('position').count)
  })

  it('sits buildings on the sampled ground when terrain is present', () => {
    const flat = buildBuildingsGeometry([squareFootprint('a', 20)], OPTS)!.geometry
    const raised = buildBuildingsGeometry([squareFootprint('a', 20)], {
      ...OPTS,
      sampleGroundM: () => 500,
      anchorElevationM: 0,
    })!.geometry
    const topOf = (g: typeof flat): number => {
      const p = g.getAttribute('position')
      let max = -Infinity
      for (let i = 0; i < p.count; i++) max = Math.max(max, p.getZ(i))
      return max
    }
    expect(topOf(raised)).toBeGreaterThan(topOf(flat))
  })

  it('counts estimated heights separately from surveyed ones', () => {
    const surveyed = squareFootprint('a', 20)
    const guessed: BuildingFootprint = {
      ...squareFootprint('b', 20),
      height: { heightM: 12, minHeightM: 0, estimated: true },
    }
    const r = buildBuildingsGeometry([surveyed, guessed], OPTS)!
    expect(r.count).toBe(2)
    expect(r.estimatedCount).toBe(1)
  })

  it('returns null rather than an empty mesh when nothing is usable', () => {
    expect(buildBuildingsGeometry([], OPTS)).toBeNull()
    const degenerate: BuildingFootprint = {
      id: 'd',
      ring: [{ lat: 41, lon: 2 }, { lat: 41, lon: 2 }, { lat: 41, lon: 2 }],
      height: { heightM: 10, minHeightM: 0, estimated: true },
    }
    expect(buildBuildingsGeometry([degenerate], OPTS)).toBeNull()
  })

  it('skips a bad footprint without losing the good ones around it', () => {
    const degenerate: BuildingFootprint = {
      id: 'd',
      ring: [{ lat: 41, lon: 2 }, { lat: 41, lon: 2 }],
      height: { heightM: 10, minHeightM: 0, estimated: true },
    }
    const r = buildBuildingsGeometry([degenerate, squareFootprint('a', 20)], OPTS)!
    expect(r.count).toBe(1)
  })
})
