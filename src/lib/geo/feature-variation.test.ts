import { describe, it, expect } from 'vitest'
import {
  hashId, variate, jitter, treeShape, foliageColor,
  facadeColor, storeyBanding, storeysFor, greenTone,
  buildingRegion, roofColorFor, defaultRoofShape, defaultRoofFraction,
  coverSpeciesMix, speciesFor,
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

describe('where the building is', () => {
  it('places the regions that have their own palette', () => {
    expect(buildingRegion(34.99, 135.78)).toBe('east-asia')   // Kyoto
    expect(buildingRegion(41.38, 2.17)).toBe('mediterranean') // Barcelona
    expect(buildingRegion(52.37, 4.90)).toBe('northern-europe')
    expect(buildingRegion(40.71, -74.0)).toBe('north-america')
  })

  it('says generic rather than guessing where it does not know', () => {
    expect(buildingRegion(-33.87, 151.21)).toBe('generic')  // Sydney
    expect(buildingRegion(-1.29, 36.82)).toBe('generic')    // Nairobi
    expect(buildingRegion(NaN, 0)).toBe('generic')
  })
})

describe('facadeColor in context', () => {
  it('is still deterministic — the same block always looks the same', () => {
    const ctx = { use: 'house', region: 'east-asia' } as const
    expect(facadeColor('w1', ctx)).toEqual(facadeColor('w1', ctx))
  })

  it('paints a Kyoto street differently from a Rotterdam one', () => {
    // The whole point. Before this, both came out of one list of six European
    // renders and a neighbourhood in Japan looked like a Dutch suburb.
    const ids = Array.from({ length: 40 }, (_, i) => `b${i}`)
    const asia = ids.map((id) => facadeColor(id, { region: 'east-asia', use: 'house' }))
    const euro = ids.map((id) => facadeColor(id, { region: 'northern-europe', use: 'house' }))
    const differ = asia.filter((c, i) => c.join() !== euro[i].join()).length
    expect(differ).toBeGreaterThan(30)
  })

  it('gives a shrine a palette nothing else in the street has', () => {
    const shrine = facadeColor('s1', { region: 'east-asia', use: 'shrine' })
    const house = facadeColor('s1', { region: 'east-asia', use: 'house' })
    expect(shrine.join()).not.toBe(house.join())
  })

  it('falls back to the old behaviour with no context at all', () => {
    // The plain footprint path has no tags and no site, and must keep working.
    expect(facadeColor('x')).toEqual(facadeColor('x', {}))
  })

  it('goes near-monochrome in the discreet treatment', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `n${i}`)
    const spread = (cs: Array<[number, number, number]>): number => {
      const channel = (k: number): number =>
        Math.max(...cs.map((c) => c[k])) - Math.min(...cs.map((c) => c[k]))
      return Math.max(channel(0), channel(1), channel(2))
    }
    const neutral = ids.map((id) => facadeColor(id, { region: 'east-asia', tone: 'neutral' }))
    const natural = ids.map((id) => facadeColor(id, { region: 'east-asia' }))
    expect(spread(neutral)).toBeLessThan(spread(natural))
    // And every one of them is grey: no channel runs away from the others.
    for (const c of neutral) {
      expect(Math.max(...c) - Math.min(...c)).toBeLessThan(0.05)
    }
  })
})

describe('inferring a roof', () => {
  it('gives an East Asian temple the deep hipped roof it is known for', () => {
    expect(defaultRoofShape({ use: 'temple', region: 'east-asia' })).toBe('pyramidal')
    // And it is most of what you see, not a lid.
    expect(defaultRoofFraction({ use: 'temple' })).toBeGreaterThan(defaultRoofFraction({ use: 'house' }))
  })

  it('pitches a house anywhere', () => {
    expect(defaultRoofShape({ use: 'house', region: 'generic' })).toBe('gabled')
  })

  it('leaves everything urban and everything unknown flat', () => {
    // Inventing pitches across a city centre would be a louder lie than a cap.
    expect(defaultRoofShape({ use: 'apartments' })).toBe('flat')
    expect(defaultRoofShape({ use: 'tower' })).toBe('flat')
    expect(defaultRoofShape({})).toBe('flat')
    expect(defaultRoofShape()).toBe('flat')
  })

  it('states a roof colour only where the place implies one', () => {
    expect(roofColorFor({ use: 'temple', region: 'east-asia' })).not.toBeNull()
    expect(roofColorFor({ use: 'generic', region: 'generic' })).toBeNull()
    // The discreet treatment states nothing.
    expect(roofColorFor({ use: 'temple', region: 'east-asia', tone: 'neutral' })).toBeNull()
  })
})

describe('which species an untagged wood grows', () => {
  it('grows conifer on a Japanese hillside instead of a European default', () => {
    // The measured failure this exists for: 8289 of 8292 seeded trees came out
    // broadleaf over Kyoto, on sugi and hinoki plantation.
    const [dominant] = coverSpeciesMix('forest', 'east-asia')[0]
    expect(dominant).toBe('needleleaf')
  })

  it('keeps every wood a mixture, never a plantation of clones', () => {
    for (const region of ['east-asia', 'mediterranean', 'northern-europe', 'generic'] as const) {
      const mix = coverSpeciesMix('forest', region)
      expect(mix.length).toBeGreaterThan(1)
      // A minority worth seeing, not a rounding error.
      const smallest = Math.min(...mix.map(([, w]) => w))
      expect(smallest).toBeGreaterThan(0.1)
    }
  })

  it('draws both species out of one wood, in roughly the stated proportion', () => {
    const ids = Array.from({ length: 4000 }, (_, i) => `w1@${i}`)
    const needle = ids.filter((id) => speciesFor(id, 'forest', 'east-asia') === 'needleleaf').length
    // 0.75 of the mix. Loose bounds: the point is that BOTH appear and the
    // dominance is real, not that the hash is a perfect uniform.
    expect(needle / ids.length).toBeGreaterThan(0.68)
    expect(needle / ids.length).toBeLessThan(0.82)
  })

  it('is deterministic, so a screenshot is reproducible', () => {
    expect(speciesFor('w7@42', 'forest', 'east-asia')).toBe(speciesFor('w7@42', 'forest', 'east-asia'))
  })

  it('never returns a species that would cost a third instanced mesh', () => {
    // Draw calls follow the number of SPECIES on screen. Broadleaf and conifer
    // each already have their own mesh; a third here would be a third mesh.
    const covers = ['forest', 'shrub', 'orchard', 'park'] as const
    const regions = ['east-asia', 'mediterranean', 'northern-europe', 'north-america', 'generic'] as const
    for (const cover of covers) {
      for (const region of regions) {
        for (const [shape] of coverSpeciesMix(cover, region)) {
          expect(['broadleaf', 'needleleaf']).toContain(shape)
        }
      }
    }
  })

  it('leaves scrub and orchards unmixed, for reasons that are not species', () => {
    // Scrub is a low rounded mass; an orchard is one crop per field, and mixing
    // it would undo the regularity that makes it read as agriculture.
    expect(coverSpeciesMix('shrub', 'east-asia')).toHaveLength(1)
    expect(coverSpeciesMix('orchard', 'east-asia')).toHaveLength(1)
  })
})
