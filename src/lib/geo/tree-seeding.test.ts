// ─── tree-seeding tests ───────────────────────────────────────────────────────
// The regression these exist for: greenery polygons had no trees at all. A
// `landuse=forest` drew as a flat green carpet, because the only trees in the
// scene were `natural=tree` nodes somebody had mapped one at a time.
//
// Everything here runs in plain metres, so the numbers read as what they are.

import { describe, it, expect } from 'vitest'
import {
  seedRegion, seedFringe, allocateDensity, naturalCountFor, ringArea, principalAxis,
  buildKeepOut,
  type SeedRegion, type SeededTree,
} from './tree-seeding'
import type { GreenCover } from './osm-features'

/** A `w` x `h` rectangle with its corner on the origin. */
const box = (id: string, w: number, h: number, cover: GreenCover): SeedRegion => ({
  id, cover, shape: 'broadleaf',
  ringM: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }],
})

const inBox = (t: SeededTree, w: number, h: number): boolean =>
  t.x >= -1e-9 && t.x <= w + 1e-9 && t.y >= -1e-9 && t.y <= h + 1e-9

describe('planting a polygon', () => {
  it('grows a wood where there was a carpet', () => {
    const trees = seedRegion(box('w', 200, 200, 'forest'))
    // 4 ha at 9 m spacing is about 490 stems. The exact number is not the
    // point; that it is hundreds rather than zero is the whole feature.
    expect(trees.length).toBeGreaterThan(400)
    expect(trees.length).toBeLessThan(600)
  })

  it('keeps every tree inside its own outline', () => {
    // A tree growing out of the pavement next to the park is worse than no park.
    const trees = seedRegion(box('w', 120, 80, 'forest'))
    expect(trees.every((t) => inBox(t, 120, 80))).toBe(true)
  })

  it('respects a concave outline rather than filling its bounding box', () => {
    // An L: the missing quadrant must stay empty.
    const ell: SeedRegion = {
      id: 'l', cover: 'forest', shape: 'broadleaf',
      ringM: [
        { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 80 },
        { x: 80, y: 80 }, { x: 80, y: 200 }, { x: 0, y: 200 },
      ],
    }
    const trees = seedRegion(ell)
    expect(trees.length).toBeGreaterThan(100)
    const inHole = trees.filter((t) => t.x > 90 && t.y > 90)
    expect(inHole).toHaveLength(0)
  })

  it('is deterministic — the same site grows the same forest', () => {
    const a = seedRegion(box('w', 150, 150, 'forest'))
    const b = seedRegion(box('w', 150, 150, 'forest'))
    expect(a).toEqual(b)
    // And a screenshot taken tomorrow matches: ids are stable, not sequential.
    expect(new Set(a.map((t) => t.id)).size).toBe(a.length)
  })

  it('plants a different density for every kind of ground', () => {
    const count = (cover: GreenCover): number => seedRegion(box('g', 200, 200, cover)).length
    // Scrub is dense low cover; a park is specimen trees on mown grass; a lawn
    // or a pitch is grass and nothing else, and inventing trees over one would
    // be a statement about the site that is simply false.
    expect(count('shrub')).toBeGreaterThan(count('forest'))
    expect(count('forest')).toBeGreaterThan(count('park'))
    expect(count('bare')).toBe(0)
  })

  it('refuses to plant something too small to read as a mass', () => {
    expect(seedRegion(box('t', 8, 8, 'forest'))).toHaveLength(0)
  })

  it('sizes a shrub like a shrub and a forest tree like a tree', () => {
    const tall = seedRegion(box('f', 200, 200, 'forest'))
    const low = seedRegion(box('s', 200, 200, 'shrub'))
    const mean = (ts: SeededTree[]): number => ts.reduce((n, t) => n + t.heightM, 0) / ts.length
    expect(mean(tall)).toBeGreaterThan(mean(low) * 3)
  })

  it('varies height and crown within one mass', () => {
    // A wood of identical trees is as obvious a tell as a wood of none.
    const trees = seedRegion(box('f', 200, 200, 'forest'))
    // Rounded to the centimetre a few genuinely collide; the point is that
    // almost every tree is its own height rather than the class default.
    const heights = new Set(trees.map((t) => t.heightM.toFixed(2)))
    expect(heights.size).toBeGreaterThan(trees.length * 0.7)
    // Crowns span barely two metres, so at centimetre precision the VALUE
    // range is the limit, not the variation — measure it finer.
    const radii = new Set(trees.map((t) => t.radiusM.toFixed(4)))
    expect(radii.size).toBeGreaterThan(trees.length * 0.7)
  })
})

describe('an orchard is planted, not scattered', () => {
  // The tag says rows. Scattering it is the clearest possible statement that
  // nobody looked at the data, and rows read instantly from any angle.

  it('lines an orchard up in rows and leaves a wood alone', () => {
    /** How well the field collapses onto a lattice along a given axis. */
    const rowiness = (region: SeedRegion): number => {
      const trees = seedRegion(region)
      const axis = principalAxis(region.ringM)
      // Project across the rows; a planted field lands on a few distinct values.
      const across = trees.map((t) => -t.x * axis.sin + t.y * axis.cos)
      const buckets = new Set(across.map((v) => Math.round(v / 1.5)))
      return buckets.size / Math.max(1, trees.length)
    }
    const orchard = rowiness(box('o', 200, 200, 'orchard'))
    const wood = rowiness(box('w', 200, 200, 'forest'))
    // Fewer distinct offsets per tree means the trees share rows.
    expect(orchard).toBeLessThan(wood)
  })

  it('runs the rows along the plot, not along north', () => {
    // A diagonal field whose rows run east-west looks like a texture, not
    // like farming. The longest edge is the only evidence of the layout.
    const diagonal: SeedRegion = {
      id: 'd', cover: 'orchard', shape: 'broadleaf',
      ringM: [{ x: 0, y: 0 }, { x: 160, y: 160 }, { x: 140, y: 190 }, { x: -20, y: 30 }],
    }
    const axis = principalAxis(diagonal.ringM)
    expect(Math.abs(axis.cos - Math.SQRT1_2)).toBeLessThan(0.05)
    expect(seedRegion(diagonal).length).toBeGreaterThan(20)
  })
})

describe('the edge of a mass', () => {
  it('marks which trees stand on the boundary', () => {
    const trees = seedRegion(box('f', 200, 200, 'forest'))
    expect(trees.some((t) => t.edge > 0.6)).toBe(true)
    expect(trees.some((t) => t.edge === 0)).toBe(true)
  })

  it('shortens the treeline, because open-grown trees are shorter', () => {
    const trees = seedRegion(box('f', 300, 300, 'forest'))
    const mean = (ts: SeededTree[]): number => ts.reduce((n, t) => n + t.heightM, 0) / ts.length
    const rim = trees.filter((t) => t.edge > 0.7)
    const core = trees.filter((t) => t.edge === 0)
    expect(rim.length).toBeGreaterThan(0)
    expect(mean(rim)).toBeLessThan(mean(core))
  })

  it('stands vegetation ACROSS the boundary, not up against it', () => {
    // The whole point of the fringe: a park that ends on a ruled line is as
    // loud a tell as any amount of uniform colour. Something has to overhang.
    const fringe = seedFringe(box('p', 200, 200, 'park'))
    expect(fringe.length).toBeGreaterThan(20)
    const outside = fringe.filter((t) => !inBox(t, 200, 200))
    expect(outside.length).toBeGreaterThan(0)
    // But it is a margin, not a second forest: most of it stays inside.
    expect(outside.length).toBeLessThan(fringe.length * 0.6)
  })

  it('keeps the fringe low and bushy whatever stands behind it', () => {
    const fringe = seedFringe(box('f', 200, 200, 'forest'))
    expect(Math.max(...fringe.map((t) => t.heightM))).toBeLessThan(5)
  })

  it('gives a bare lawn no margin, because it genuinely ends at its fence', () => {
    expect(seedFringe(box('b', 200, 200, 'bare'))).toHaveLength(0)
  })
})

describe('the instance budget', () => {
  // Same principle as the surface budget: a ceiling says how DENSE the world
  // is, never which parts of it exist.

  const natural = (areaM2: number): number => naturalCountFor(areaM2, 9)

  it('leaves everything at full density when it all fits', () => {
    const d = allocateDensity([{ id: 'a', areaM2: 10_000 }], 100_000, natural)
    expect(d.get('a')).toBe(1)
  })

  it('thins the whole site by one factor rather than dropping regions', () => {
    const regions = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, areaM2: 40_000 }))
    const d = allocateDensity(regions, 1200, natural)
    // Every region is present and every region is thinned the same amount — a
    // copse denser than the wood beside it reads as a bug.
    expect(d.size).toBe(12)
    const values = [...d.values()]
    expect(Math.min(...values)).toBeGreaterThan(0)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1e-9)
  })

  it('lets the caller favour what is near the model', () => {
    const d = allocateDensity([
      { id: 'near', areaM2: 40_000, weight: 1 },
      { id: 'far', areaM2: 40_000, weight: 0.33 },
    ], 600, natural)
    expect(d.get('near')!).toBeGreaterThan(d.get('far')!)
  })

  it('thins by widening the spacing, so the pattern stays even', () => {
    const full = seedRegion(box('f', 300, 300, 'forest'))
    const quarter = seedRegion(box('f', 300, 300, 'forest'), { density: 0.25 })
    expect(quarter.length).toBeGreaterThan(full.length * 0.15)
    expect(quarter.length).toBeLessThan(full.length * 0.35)
    // Still spread over the whole polygon, not crowded into one corner.
    const spanX = Math.max(...quarter.map((t) => t.x)) - Math.min(...quarter.map((t) => t.x))
    expect(spanX).toBeGreaterThan(250)
  })

  it('honours a hard per-region stop', () => {
    expect(seedRegion(box('f', 400, 400, 'forest'), { maxTrees: 50 })).toHaveLength(50)
  })

  it('measures area the way the caller expects', () => {
    expect(ringArea(box('a', 100, 50, 'forest').ringM)).toBeCloseTo(5000)
  })
})

describe('ground that is already taken', () => {
  // The park polygon includes its own lake and its own pavilions, because that
  // is how OSM draws a park: one outline around the lot, then the lake and the
  // buildings on top of it. Planting the outline grows trees out of the water —
  // 83 of them on Parc de la Ciutadella, 300 more through roofs.

  /** A `w` x `h` rectangle with its corner at (x, y). */
  const rect = (x: number, y: number, w: number, h: number) =>
    [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]

  it('answers what is inside and what is not', () => {
    const blocked = buildKeepOut([rect(40, 40, 60, 60)])
    expect(blocked(70, 70)).toBe(true)
    expect(blocked(10, 10)).toBe(false)
    // Outside the index's own cells entirely.
    expect(blocked(5000, -5000)).toBe(false)
  })

  it('indexes a polygon far bigger than one cell', () => {
    // A lake is hundreds of metres across; the index must not lose it to the
    // guard that stops one ring filling thousands of cells.
    const blocked = buildKeepOut([rect(0, 0, 4000, 4000)])
    expect(blocked(2000, 2000)).toBe(true)
    expect(blocked(-10, -10)).toBe(false)
  })

  it('is a constant no with nothing to keep out, so a plain wood pays nothing', () => {
    const blocked = buildKeepOut([])
    expect(blocked(0, 0)).toBe(false)
  })

  it('plants no tree in the lake in the middle of the park', () => {
    const park = box('p', 200, 200, 'park')
    const lake = rect(60, 60, 80, 80)
    const blocked = buildKeepOut([lake])
    const dry = seedRegion(park)
    const wet = seedRegion(park, { blocked })
    expect(wet.length).toBeLessThan(dry.length)
    const inLake = (t: SeededTree) => t.x > 60 && t.x < 140 && t.y > 60 && t.y < 140
    expect(dry.some(inLake), 'the old behaviour put trees in it').toBe(true)
    expect(wet.some(inLake)).toBe(false)
  })

  it('keeps the fringe out of the water too', () => {
    // The margin straddles the boundary on purpose, which is exactly how it
    // reaches over a lakeshore if nothing stops it.
    const shore = box('s', 100, 100, 'park')
    const water = rect(-40, -40, 200, 45)   // laps the southern edge
    const trees = seedFringe(shore, { blocked: buildKeepOut([water]) })
    expect(trees.every((t) => !(t.y < 5 && t.x > -40 && t.x < 160))).toBe(true)
  })
})
