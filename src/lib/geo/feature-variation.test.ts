import { describe, it, expect } from 'vitest'
import {
  hashId, variate, jitter, treeShape, foliageColor,
  facadeColor, storeyBanding, storeysFor, greenTone,
} from './feature-variation'

describe('hashId / variate', () => {
  it('is deterministic — the same site always renders identically', () => {
    expect(hashId('w123')).toBe(hashId('w123'))
    expect(variate('w123', 1)).toBe(variate('w123', 1))
  })

  it('separates different ids', () => {
    expect(hashId('w123')).not.toBe(hashId('w124'))
  })

  it('keeps channels independent, so properties do not correlate', () => {
    // If channels correlated, every tall tree would also be the darkest one —
    // which reads as a pattern rather than variety.
    const a = variate('w1', 1)
    const b = variate('w1', 2)
    expect(a).not.toBeCloseTo(b, 3)
  })

  it('stays in [0,1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = variate(`w${i}`, i % 5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('spreads roughly evenly across the range', () => {
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 2000; i++) buckets[Math.floor(variate(`x${i}`, 0) * 10)]++
    for (const b of buckets) {
      expect(b).toBeGreaterThan(120)  // no empty or starved bucket
      expect(b).toBeLessThan(300)
    }
  })
})

describe('jitter', () => {
  it('stays inside the requested band', () => {
    for (let i = 0; i < 300; i++) {
      const v = jitter(`t${i}`, 0, 10, 0.25)
      expect(v).toBeGreaterThanOrEqual(7.5 - 1e-9)
      expect(v).toBeLessThanOrEqual(12.5 + 1e-9)
    }
  })

  it('is a no-op at amount 0', () => {
    expect(jitter('t1', 0, 10, 0)).toBe(10)
  })

  it('actually varies across features', () => {
    const values = new Set(Array.from({ length: 50 }, (_, i) => jitter(`t${i}`, 0, 10, 0.3)))
    expect(values.size).toBeGreaterThan(40)
  })
})

describe('treeShape', () => {
  it('reads leaf_type when tagged', () => {
    expect(treeShape({ leaf_type: 'needleleaved' })).toBe('needleleaf')
    expect(treeShape({ leaf_type: 'broadleaved' })).toBe('broadleaf')
  })

  it('defaults untagged trees to broadleaf', () => {
    // Most mapped trees are street trees; a street of conifers looks wrong far
    // more often than the reverse.
    expect(treeShape({})).toBe('broadleaf')
    expect(treeShape(undefined)).toBe('broadleaf')
    expect(treeShape({ genus: 'Quercus' })).toBe('broadleaf')
  })
})

describe('foliageColor', () => {
  it('is green — the green channel always leads', () => {
    for (let i = 0; i < 200; i++) {
      const [r, g, b] = foliageColor(`n${i}`, i % 2 ? 'broadleaf' : 'needleleaf')
      expect(g).toBeGreaterThan(r)
      expect(g).toBeGreaterThan(b)
    }
  })

  it('keeps every channel in [0,1]', () => {
    for (let i = 0; i < 300; i++) {
      for (const v of foliageColor(`n${i}`, 'broadleaf')) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('varies between trees instead of one flat green', () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => foliageColor(`n${i}`, 'broadleaf').join()))
    expect(seen.size).toBeGreaterThan(50)
  })

  it('renders needleleaf darker than broadleaf on average', () => {
    const mean = (shape: 'broadleaf' | 'needleleaf'): number => {
      let sum = 0
      for (let i = 0; i < 200; i++) sum += foliageColor(`n${i}`, shape)[1]
      return sum / 200
    }
    expect(mean('needleleaf')).toBeLessThan(mean('broadleaf'))
  })

  it('is deterministic per tree', () => {
    expect(foliageColor('n7', 'broadleaf')).toEqual(foliageColor('n7', 'broadleaf'))
  })
})

describe('facadeColor', () => {
  it('produces muted neutrals, never a saturated colour', () => {
    for (let i = 0; i < 200; i++) {
      const [r, g, b] = facadeColor(`w${i}`)
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      expect(max - min).toBeLessThan(0.2)      // low saturation
      expect(max).toBeLessThanOrEqual(1)
      expect(min).toBeGreaterThan(0.4)         // never near-black
    }
  })

  it('mixes tones across a block instead of one flat grey', () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => facadeColor(`w${i}`).join()))
    expect(seen.size).toBeGreaterThan(50)
  })

  it('is deterministic per building', () => {
    expect(facadeColor('w42')).toEqual(facadeColor('w42'))
  })
})

describe('storeyBanding', () => {
  it('stays near 1 — banding is a hint, not a stripe', () => {
    for (let i = 0; i <= 100; i++) {
      const v = storeyBanding(i / 100, 8)
      expect(v).toBeGreaterThan(0.9)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('oscillates once per storey', () => {
    // Sample a 4-storey wall; count the local minima.
    const samples = Array.from({ length: 400 }, (_, i) => storeyBanding(i / 400, 4))
    let minima = 0
    for (let i = 1; i < samples.length - 1; i++) {
      if (samples[i] < samples[i - 1] && samples[i] <= samples[i + 1]) minima++
    }
    expect(minima).toBeGreaterThanOrEqual(3)
    expect(minima).toBeLessThanOrEqual(5)
  })

  it('is disabled by zero strength or a degenerate storey count', () => {
    expect(storeyBanding(0.5, 8, 0)).toBe(1)
    expect(storeyBanding(0.5, 0)).toBe(1)
    expect(storeyBanding(0.5, -3)).toBe(1)
  })
})

describe('storeysFor', () => {
  it('divides height by a storey, never returning zero', () => {
    expect(storeysFor(12.8)).toBe(4)
    expect(storeysFor(3.2)).toBe(1)
    expect(storeysFor(0.5)).toBe(1)
    expect(storeysFor(0)).toBe(1)
  })
})

describe('greenTone', () => {
  it('makes forest markedly darker than a lawn', () => {
    const forest = greenTone({ landuse: 'forest' })
    const park = greenTone({ leisure: 'park' })
    expect(forest[1]).toBeLessThan(park[1])
  })

  it('distinguishes the kinds OSM actually carries', () => {
    const tones = [
      greenTone({ natural: 'wood' }),
      greenTone({ natural: 'scrub' }),
      greenTone({ leisure: 'pitch' }),
      greenTone({ landuse: 'cemetery' }),
      greenTone({ leisure: 'park' }),
    ].map((t) => t.join())
    expect(new Set(tones).size).toBe(5)
  })

  it('is green and in range for every input, including unknown ones', () => {
    const cases: Array<Record<string, string> | undefined> =
      [undefined, {}, { landuse: 'quarry' }, { leisure: 'park' }]
    for (const tags of cases) {
      const [r, g, b] = greenTone(tags)
      expect(g).toBeGreaterThan(r)
      expect(g).toBeGreaterThan(b)
      for (const v of [r, g, b]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('tree species detection', () => {
  it('reads the broad split from leaf_type', () => {
    expect(treeShape({ leaf_type: 'needleleaved' })).toBe('needleleaf')
    expect(treeShape({ leaf_type: 'broadleaved' })).toBe('broadleaf')
  })

  it('recognises the two silhouettes nothing else can stand in for', () => {
    // Spindles: a poplar avenue rendered as round crowns loses its rhythm.
    expect(treeShape({ genus: 'Populus' })).toBe('columnar')
    expect(treeShape({ species: 'Cupressus sempervirens' })).toBe('columnar')
    expect(treeShape({ taxon: 'Thuja occidentalis' })).toBe('columnar')
    // Palms: a coastal site full of green balls is noticed immediately.
    expect(treeShape({ genus: 'Phoenix' })).toBe('palm')
    expect(treeShape({ species: 'Washingtonia robusta' })).toBe('palm')
    expect(treeShape({ 'species:en': 'Canary Island date palm' })).toBe('palm')
  })

  it('lets the species override a contradictory leaf_type', () => {
    // Palms are broadleaved by botany and nothing like a lime by silhouette.
    expect(treeShape({ leaf_type: 'broadleaved', genus: 'Trachycarpus' })).toBe('palm')
  })

  it('falls back to broadleaf for anything unmapped', () => {
    expect(treeShape(undefined)).toBe('broadleaf')
    expect(treeShape({})).toBe('broadleaf')
    expect(treeShape({ genus: 'Tilia' })).toBe('broadleaf')
  })

  it('gives every silhouette its own foliage tone', () => {
    const tones = (['broadleaf', 'needleleaf', 'columnar', 'palm'] as const)
      .map((s) => foliageColor('t1', s).map((v) => v.toFixed(4)).join())
    expect(new Set(tones).size).toBe(4)
  })
})
