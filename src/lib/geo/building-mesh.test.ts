// ─── building-mesh tests ──────────────────────────────────────────────────────
// The regression these exist for: footprints were triangulated in NORMALIZED
// units, where a 20 m wall is ~3e-8. That is close enough to earcut's
// degeneracy epsilon that most real footprints collapsed to zero triangles and
// were silently dropped — a whole city block rendered as a handful of blocks.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
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

describe('roof shapes', () => {
  const withStyle = (shape: 'flat' | 'gabled' | 'pyramidal', roofHeightM = 3) => ({
    ...squareFootprint('r', 20, 12),
    style: { roofShape: shape, roofHeightM },
  })

  it('a flat roof caps the extrusion at the top', () => {
    const g = buildBuildingsGeometry([withStyle('flat')], OPTS)!.geometry
    expect(g.getAttribute('position').count).toBe(30)
  })

  it('a gabled roof adds ridge geometry beyond the flat cap', () => {
    const flat = buildBuildingsGeometry([withStyle('flat')], OPTS)!.geometry
    const gabled = buildBuildingsGeometry([withStyle('gabled')], OPTS)!.geometry
    expect(gabled.getAttribute('position').count)
      .toBeGreaterThan(flat.getAttribute('position').count)
  })

  it('a pyramidal roof rises to a single apex', () => {
    const g = buildBuildingsGeometry([withStyle('pyramidal')], OPTS)!.geometry
    const p = g.getAttribute('position')
    let maxZ = -Infinity
    let atMax = 0
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i)
      if (z > maxZ + 1e-12) { maxZ = z; atMax = 1 } else if (Math.abs(z - maxZ) < 1e-12) atMax++
    }
    // Four apex vertices (one per fanned edge), all at the same point.
    expect(atMax).toBe(4)
  })

  it('never exceeds the tagged total height — the roof eats into it', () => {
    const top = (shape: 'flat' | 'gabled' | 'pyramidal'): number => {
      const p = buildBuildingsGeometry([withStyle(shape)], OPTS)!.geometry.getAttribute('position')
      let max = -Infinity
      for (let i = 0; i < p.count; i++) max = Math.max(max, p.getZ(i))
      return max
    }
    expect(top('gabled')).toBeCloseTo(top('flat'), 12)
    expect(top('pyramidal')).toBeCloseTo(top('flat'), 12)
  })

  it('clamps an absurd roof height to half the building', () => {
    // roof:height 999 on a 12 m building must not invert the walls.
    const g = buildBuildingsGeometry([withStyle('gabled', 999)], OPTS)!.geometry
    const p = g.getAttribute('position')
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < p.count; i++) { min = Math.min(min, p.getZ(i)); max = Math.max(max, p.getZ(i)) }
    expect(max).toBeGreaterThan(min)
  })

  it('tints roof and walls from tagged colours', () => {
    const plain = buildBuildingsGeometry([squareFootprint('a', 20)], OPTS)!.geometry
    const tintedG = buildBuildingsGeometry([{
      ...squareFootprint('a', 20),
      style: { roofShape: 'flat', roofHeightM: 0, roofColor: '#ff0000', wallColor: '#0000ff' },
    }], OPTS)!.geometry
    const colorOf = (g: typeof plain, i: number): number[] => {
      const c = g.getAttribute('color')
      return [c.getX(i), c.getY(i), c.getZ(i)]
    }
    // Untinted vertices are greyscale; tinted ones are not.
    const [pr, pg, pb] = colorOf(plain, 0)
    expect(pr).toBeCloseTo(pg, 9)
    expect(pg).toBeCloseTo(pb, 9)
    const [tr, tg] = colorOf(tintedG, 0)
    expect(tr).toBeGreaterThan(tg)
  })
})

describe('facade variation and storey banding', () => {
  it('gives a block many facade tones, not one flat grey', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...squareFootprint(`b${i}`, 20),
      id: `w${i}`,
    }))
    const g = buildBuildingsGeometry(many, OPTS)!.geometry
    const c = g.getAttribute('color')
    const wall = new Set<string>()
    // Sample wall vertices (they follow the 6 roof-cap vertices of each block).
    for (let i = 10; i < c.count; i += 30) {
      wall.add([c.getX(i), c.getY(i), c.getZ(i)].map((v) => v.toFixed(4)).join())
    }
    expect(wall.size).toBeGreaterThan(20)
  })

  it('is deterministic — the same block renders identically every time', () => {
    const f = { ...squareFootprint('a', 20), id: 'w7' }
    const colorsOf = (): number[] => {
      const c = buildBuildingsGeometry([f], OPTS)!.geometry.getAttribute('color')
      return Array.from({ length: c.count }, (_, i) => c.getX(i))
    }
    expect(colorsOf()).toEqual(colorsOf())
  })

  it('keeps facades muted — context must not out-shout the model', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...squareFootprint(`b${i}`, 20),
      id: `w${i}`,
    }))
    const c = buildBuildingsGeometry(many, OPTS)!.geometry.getAttribute('color')
    for (let i = 10; i < c.count; i += 30) {
      const [r, g, b] = [c.getX(i), c.getY(i), c.getZ(i)]
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.25)
    }
  })

  it('still lets a tagged wall colour win over the generated tone', () => {
    const tagged = buildBuildingsGeometry([{
      ...squareFootprint('a', 20),
      id: 'w1',
      style: { roofShape: 'flat' as const, roofHeightM: 0, wallColor: '#ff0000' },
    }], OPTS)!.geometry.getAttribute('color')
    // Wall vertices (after the 6 roof-cap ones) must be strongly red.
    const [r, g] = [tagged.getX(10), tagged.getY(10)]
    expect(r).toBeGreaterThan(g * 3)
  })
})

describe('facade detail levels', () => {
  const tower = {
    ...squareFootprint('a', 24),
    id: 'w1',
    height: { heightM: 32, minHeightM: 0, estimated: false },
  }

  it('models each storey when asked, and one quad per wall when not', () => {
    const simple = buildBuildingsGeometry([tower], OPTS)!.geometry
    const detailed = buildBuildingsGeometry([tower], { ...OPTS, detail: 'detailed' })!.geometry
    const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count

    // 32 m ≈ 10 storeys, each two bands — an order of magnitude more wall.
    expect(verts(detailed)).toBeGreaterThan(verts(simple) * 4)
    // Still ONE merged geometry: the whole point is that detail costs
    // triangles, never draw calls.
    expect(detailed.groups.length).toBe(simple.groups.length)
  })

  it('gives the facade a rhythm instead of one flat gradient', () => {
    const lums = (detail: 'simple' | 'detailed'): number[] => {
      const g = buildBuildingsGeometry([tower], { ...OPTS, detail })!.geometry
      const pos = g.getAttribute('position')
      const col = g.getAttribute('color')
      const out: number[] = []
      for (let i = 0; i < pos.count; i++) {
        // Wall vertices only: the roof cap is the one facing straight up.
        if (g.getAttribute('normal').getZ(i) === 0) {
          out.push(Number((col.getX(i) + col.getY(i) + col.getZ(i)).toFixed(4)))
        }
      }
      return out
    }

    const simple = lums('simple')
    const detailed = lums('detailed')

    // Banding means several distinct tones up a wall, not a two-stop gradient.
    expect(new Set(detailed).size).toBeGreaterThan(new Set(simple).size)
    // And the darkest thing on the facade — ground-floor glazing — is darker
    // than anything the plain extrusion produces.
    expect(Math.min(...detailed)).toBeLessThan(Math.min(...simple))
  })

  it('keeps a tagged colour in charge at either level', () => {
    const red = {
      ...tower,
      style: { roofShape: 'flat' as const, roofHeightM: 0, wallColor: '#ff0000' },
    }
    for (const detail of ['simple', 'detailed'] as const) {
      const col = buildBuildingsGeometry([red], { ...OPTS, detail })!.geometry.getAttribute('color')
      let reddest = 0
      for (let i = 0; i < col.count; i++) {
        if (col.getX(i) > col.getY(i) * 3) reddest++
      }
      expect(reddest).toBeGreaterThan(0)
    }
  })

  it('does not explode on a 200-storey tower', () => {
    const spire = { ...tower, height: { heightM: 640, minHeightM: 0, estimated: false } }
    const g = buildBuildingsGeometry([spire], { ...OPTS, detail: 'detailed' })!.geometry
    // Banding is capped, so height cannot run the triangle budget away.
    expect(g.getAttribute('position').count).toBeLessThan(2000)
  })
})

describe('lit facades', () => {
  const block = {
    ...squareFootprint('a', 24),
    id: 'w1',
    height: { heightM: 28, minHeightM: 0, estimated: false },
  }

  it('leaves directional shading OUT when a shader will do the lighting', () => {
    // Unlit: opposite walls differ, because the sun is baked into the colours.
    const baked = buildBuildingsGeometry([block], OPTS)!.geometry
    // Lit: the same walls carry the same albedo, and the material shades them.
    const albedo = buildBuildingsGeometry([block], { ...OPTS, lit: true })!.geometry

    const wallTones = (g: THREE.BufferGeometry): Set<string> => {
      const n = g.getAttribute('normal')
      const c = g.getAttribute('color')
      const out = new Set<string>()
      for (let i = 0; i < c.count; i++) {
        if (n.getZ(i) === 0) out.add(c.getX(i).toFixed(4))
      }
      return out
    }

    // Baking a sun into four differently-oriented walls produces more distinct
    // tones than pure albedo does.
    expect(wallTones(baked).size).toBeGreaterThan(wallTones(albedo).size)
  })

  it('keeps the contact shading at grade — a lit building must not float', () => {
    const g = buildBuildingsGeometry([block], { ...OPTS, lit: true })!.geometry
    const pos = g.getAttribute('position')
    const nor = g.getAttribute('normal')
    const col = g.getAttribute('color')

    let lowest = Infinity, highest = -Infinity
    for (let i = 0; i < pos.count; i++) {
      if (nor.getZ(i) !== 0) continue
      lowest = Math.min(lowest, pos.getZ(i))
      highest = Math.max(highest, pos.getZ(i))
    }
    let atBase = 0, atTop = 0
    for (let i = 0; i < pos.count; i++) {
      if (nor.getZ(i) !== 0) continue
      if (pos.getZ(i) === lowest) atBase = Math.max(atBase, col.getX(i))
      if (pos.getZ(i) === highest) atTop = Math.max(atTop, col.getX(i))
    }
    expect(atBase).toBeLessThan(atTop)
  })

  it('sets a parapet on detailed flat roofs, and none on simple ones', () => {
    const roofZ = (detail: 'simple' | 'detailed'): number => {
      const g = buildBuildingsGeometry([block], { ...OPTS, detail })!.geometry
      const pos = g.getAttribute('position')
      const nor = g.getAttribute('normal')
      let z = -Infinity
      for (let i = 0; i < pos.count; i++) {
        if (nor.getZ(i) === 1) z = Math.max(z, pos.getZ(i))
      }
      return z
    }
    const wallTop = (detail: 'simple' | 'detailed'): number => {
      const g = buildBuildingsGeometry([block], { ...OPTS, detail })!.geometry
      const pos = g.getAttribute('position')
      const nor = g.getAttribute('normal')
      let z = -Infinity
      for (let i = 0; i < pos.count; i++) {
        if (nor.getZ(i) === 0) z = Math.max(z, pos.getZ(i))
      }
      return z
    }
    // Simple: roof deck is flush with the top of the wall.
    expect(roofZ('simple')).toBeCloseTo(wallTop('simple'), 12)
    // Detailed: the wall carries on above the deck as an upstand.
    expect(roofZ('detailed')).toBeLessThan(wallTop('detailed'))
  })
})

describe('hit-testing a merged neighbourhood', () => {
  it('reports which slice of the buffer each building owns', () => {
    const a = { ...squareFootprint('a', 20), id: 'w1' }
    const b = { ...squareFootprint('b', 20), id: 'w2' }
    const built = buildBuildingsGeometry([a, b], OPTS)!

    expect(built.ranges).toHaveLength(2)
    expect(built.ranges[0].id).toBe('w1')
    expect(built.ranges[1].id).toBe('w2')
    // Contiguous and in order — that is what lets a hit be binary-searched.
    expect(built.ranges[0].start).toBe(0)
    expect(built.ranges[0].end).toBe(built.ranges[1].start)
    expect(built.ranges[1].end).toBe(built.geometry.getAttribute('position').count)
  })

  it('skips buildings with no id rather than mis-attributing them', () => {
    const anon = { ...squareFootprint('a', 20), id: undefined }
    const named = { ...squareFootprint('b', 20), id: 'w2' }
    const built = buildBuildingsGeometry([anon, named], OPTS)!
    expect(built.ranges.map((r) => r.id)).toEqual(['w2'])
  })
})

describe('context palette and tone', () => {
  /** Every distinct wall colour in the merged buffer. */
  const tones = (g: THREE.BufferGeometry): Set<string> => {
    const c = g.getAttribute('color')
    const out = new Set<string>()
    for (let i = 0; i < c.count; i++) {
      out.add([c.getX(i), c.getY(i), c.getZ(i)].map((n) => n.toFixed(3)).join())
    }
    return out
  }

  const block = (n: number): BuildingFootprint[] =>
    Array.from({ length: n }, (_, i) => squareFootprint(`b${i}`, 16, 10 + (i % 5)))

  it('paints the same block differently in Kyoto and in Barcelona', () => {
    // The regression this closes: with no longitude, one list of six European
    // renders painted the planet, and a street in Japan came out a Dutch suburb.
    const kyoto = buildBuildingsGeometry(block(24), { anchorLat: 34.99, anchorLon: 135.78 })!
    const bcn = buildBuildingsGeometry(block(24), { anchorLat: 41.38, anchorLon: 2.17 })!
    expect([...tones(kyoto.geometry)].join('|')).not.toBe([...tones(bcn.geometry)].join('|'))
  })

  it('behaves exactly as before when nobody says where it is', () => {
    const a = buildBuildingsGeometry(block(12), OPTS)!
    const b = buildBuildingsGeometry(block(12), { anchorLat: 41.3874 })!
    expect([...tones(a.geometry)]).toEqual([...tones(b.geometry)])
  })

  it('gives a temple the roof it is known for, without a roof tag', () => {
    const plain = buildBuildingsGeometry(
      [squareFootprint('t', 20, 12)], { anchorLat: 34.99, anchorLon: 135.78 },
    )!
    const temple = buildBuildingsGeometry([{
      ...squareFootprint('t', 20, 12),
      style: { roofShape: 'flat', roofHeightM: 0, use: 'temple' },
    }], { anchorLat: 34.99, anchorLon: 135.78 })!
    // A pitched roof is more geometry than a flat cap, and a temple gets one.
    expect(temple.geometry.getAttribute('position').count)
      .toBeGreaterThan(plain.geometry.getAttribute('position').count)
  })

  it('still lets a tagged roof shape win over anything inferred', () => {
    const tagged = buildBuildingsGeometry([{
      ...squareFootprint('t', 20, 12),
      style: { roofShape: 'flat', roofHeightM: 0, roofTagged: true, use: 'house' },
    }], { anchorLat: 34.99, anchorLon: 135.78 })!
    // 30 vertices is the flat-capped square from the roof-shape tests above.
    expect(tagged.geometry.getAttribute('position').count).toBe(30)
  })

  it('drains the colour in the discreet treatment but keeps the massing', () => {
    const natural = buildBuildingsGeometry(block(24), { anchorLat: 34.99, anchorLon: 135.78 })!
    const neutral = buildBuildingsGeometry(
      block(24), { anchorLat: 34.99, anchorLon: 135.78, contextTone: 'neutral' },
    )!
    // Same skyline, same footprints — only the paint changes.
    expect(neutral.geometry.getAttribute('position').count)
      .toBe(natural.geometry.getAttribute('position').count)
    expect(tones(neutral.geometry).size).toBeLessThan(tones(natural.geometry).size)
  })

  it('overrides even a tagged colour when the context must stay quiet', () => {
    const loud = [{
      ...squareFootprint('c', 20, 12),
      style: { roofShape: 'flat' as const, roofHeightM: 0, wallColor: '#ff0000' },
    }]
    const g = buildBuildingsGeometry(loud, { anchorLat: 41.38, contextTone: 'neutral' })!
    const c = g.geometry.getAttribute('color')
    for (let i = 0; i < c.count; i++) {
      // Nothing red survives: a discreet context that lets one building shout
      // is not discreet.
      expect(c.getX(i) - c.getZ(i)).toBeLessThan(0.2)
    }
  })
})
