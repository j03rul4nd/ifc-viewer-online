import { describe, it, expect } from 'vitest'
import {
  distanceM, collectModelSites, FAR_APART_THRESHOLD_M,
  type ModelInput,
} from './model-sites'
import type { GeorefExtraction, GeoPlacement } from './geo-types'

function extraction(lat: number | null, lon: number | null): GeorefExtraction {
  return {
    status: lat === null ? 'none' : 'found',
    rung: lat === null ? 4 : 3,
    lat, lon,
    eastings: null, northings: null,
    epsgCode: null, crsName: null,
    rotationDeg: 0,
    largeWcsOffset: false,
    reasons: [],
    raw: {},
  } as unknown as GeorefExtraction
}

function placement(lat: number, lon: number): GeoPlacement {
  return {
    lat, lon, rotationDeg: 0, heightOffsetM: 0,
    source: 'ifc', confidence: 'high',
  } as GeoPlacement
}

function model(id: string, opts: Partial<ModelInput> = {}): ModelInput {
  return {
    modelId: id,
    label: `${id}.ifc`,
    extraction: null,
    placement: null,
    ...opts,
  }
}

describe('distanceM', () => {
  it('is 0 for the same point', () => {
    expect(distanceM(41.3851, 2.1734, 41.3851, 2.1734)).toBeCloseTo(0, 6)
  })

  it('matches a known separation (Barcelona → Madrid ≈ 505 km)', () => {
    const d = distanceM(41.3851, 2.1734, 40.4168, -3.7038)
    expect(d / 1000).toBeGreaterThan(495)
    expect(d / 1000).toBeLessThan(515)
  })

  it('is symmetric', () => {
    const a = distanceM(46.02, 7.75, 45.97, 7.65)
    const b = distanceM(45.97, 7.65, 46.02, 7.75)
    expect(a).toBeCloseTo(b, 6)
  })

  it('handles a one-degree latitude step (≈111 km)', () => {
    const d = distanceM(0, 0, 1, 0) / 1000
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('collectModelSites', () => {
  it('returns an empty picture for no models', () => {
    const r = collectModelSites([], null)
    expect(r.sites).toEqual([])
    expect(r.located).toEqual([])
    expect(r.missing).toEqual([])
    expect(r.spreadM).toBe(0)
    expect(r.farApart).toBe(false)
  })

  it('separates located from missing models', () => {
    const r = collectModelSites([
      model('a', { placement: placement(41.38, 2.17) }),
      model('b'),
      model('c', { extraction: extraction(null, null) }),
    ], 'a')
    expect(r.located.map((s) => s.modelId)).toEqual(['a'])
    expect(r.missing.map((s) => s.modelId)).toEqual(['b', 'c'])
  })

  it('falls back to a direct site lat/lon when no placement was resolved', () => {
    const r = collectModelSites([
      model('a', { extraction: extraction(46.02, 7.75) }),
    ], 'a')
    expect(r.located).toHaveLength(1)
    expect(r.located[0].lat).toBeCloseTo(46.02, 6)
  })

  it('prefers a resolved placement over the raw extraction', () => {
    const r = collectModelSites([
      model('a', { extraction: extraction(0, 0), placement: placement(41.38, 2.17) }),
    ], 'a')
    expect(r.located[0].lat).toBeCloseTo(41.38, 6)
  })

  it('marks exactly the anchor model', () => {
    const r = collectModelSites([
      model('a', { placement: placement(41.38, 2.17) }),
      model('b', { placement: placement(41.39, 2.18) }),
    ], 'b')
    expect(r.sites.filter((s) => s.anchor).map((s) => s.modelId)).toEqual(['b'])
  })

  it('treats a federated set on the same site as agreeing', () => {
    // Three files ~300 m apart — the normal federated case.
    const r = collectModelSites([
      model('arch', { placement: placement(41.3851, 2.1734) }),
      model('struct', { placement: placement(41.3862, 2.1741) }),
      model('mep', { placement: placement(41.3845, 2.1729) }),
    ], 'arch')
    expect(r.spreadM).toBeLessThan(FAR_APART_THRESHOLD_M)
    expect(r.farApart).toBe(false)
  })

  it('flags contradicting files instead of averaging them', () => {
    // The classic error: one file left at null island.
    const r = collectModelSites([
      model('good', { placement: placement(41.3851, 2.1734) }),
      model('bogus', { placement: placement(0, 0) }),
    ], 'good')
    expect(r.farApart).toBe(true)
    expect(r.spreadM).toBeGreaterThan(FAR_APART_THRESHOLD_M)
    // The anchor keeps its own real coordinates — never a midpoint.
    const anchor = r.sites.find((s) => s.anchor)
    expect(anchor?.lat).toBeCloseTo(41.3851, 6)
  })

  it('reports the GREATEST pairwise distance, not just the first pair', () => {
    const r = collectModelSites([
      model('a', { placement: placement(41.3851, 2.1734) }),
      model('b', { placement: placement(41.3861, 2.1744) }), // close to a
      model('c', { placement: placement(40.4168, -3.7038) }), // Madrid
    ], 'a')
    expect(r.spreadM / 1000).toBeGreaterThan(490)
    expect(r.farApart).toBe(true)
  })

  it('never flags a single located model as far apart', () => {
    const r = collectModelSites([
      model('a', { placement: placement(41.38, 2.17) }),
      model('b'),
    ], 'a')
    expect(r.spreadM).toBe(0)
    expect(r.farApart).toBe(false)
  })

  it('rejects non-finite coordinates as missing', () => {
    const r = collectModelSites([
      model('a', { extraction: extraction(NaN, 2.17) }),
    ], 'a')
    expect(r.missing.map((s) => s.modelId)).toEqual(['a'])
  })
})
