// ─── placement tests ──────────────────────────────────────────────────────────
// Control points use projection-origin properties (UTM central meridian =
// lon 9°E at E=500000 for zone 32), not memorized coordinates.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  placementFromExtraction,
  savePlacement,
  loadPlacement,
  clearPlacement,
  resolvePlacement,
  type ModelBoundsLike,
} from './placement'
import { clearCustomProj4, resolveCrs } from './crs'
import type { GeoPlacement, GeorefExtraction } from './geo-types'

function extraction(partial: Partial<GeorefExtraction>): GeorefExtraction {
  return {
    status: 'found', rung: 1, epsgCode: 'EPSG:25832',
    lat: null, lon: null, heightM: null, rotationDeg: 0,
    eastings: null, northings: null, scale: 1,
    raw: {}, reasons: [], largeWcsOffset: false,
    ...partial,
  }
}

function bounds(x: number, z: number): ModelBoundsLike {
  return { center: { x, y: 5, z }, size: { x: 20, y: 10, z: 20 } }
}

const MANUAL: GeoPlacement = {
  lat: 41.3851, lon: 2.1734, rotationDeg: 15, heightOffsetM: 2,
  source: 'manual', confidence: 'high',
}

beforeEach(() => {
  localStorage.clear()
  clearCustomProj4()
})

// ── placementFromExtraction · rung 3 ────────────────────────────────────────────

describe('placementFromExtraction · site lat/lon (rung 3)', () => {
  it('passes lat/lon and rotation through with approximate confidence', () => {
    const r = placementFromExtraction(
      extraction({ status: 'partial', rung: 3, epsgCode: null, lat: 41.3851, lon: 2.1734, rotationDeg: 30 }),
      bounds(0, 0),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.lat).toBe(41.3851)
      expect(r.value.lon).toBe(2.1734)
      expect(r.value.rotationDeg).toBe(30)
      expect(r.value.confidence).toBe('approximate')
      expect(r.value.source).toBe('ifc')
    }
  })
})

// ── placementFromExtraction · rung 1/2 ──────────────────────────────────────────

describe('placementFromExtraction · MapConversion (rung 1/2)', () => {
  it('inverts the central-meridian control point (E=500000 → lon=9°E)', () => {
    const r = placementFromExtraction(
      extraction({ eastings: 500_000, northings: 0 }),
      null,
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.lon).toBeCloseTo(9, 5)
      expect(r.value.lat).toBeCloseTo(0, 5)
      expect(r.value.confidence).toBe('high')
    }
  })

  it('anchors at the model centroid: scene +X (east) shifts the longitude', () => {
    const r = placementFromExtraction(
      extraction({ eastings: 500_000, northings: 0 }),
      bounds(1000, 0), // 1 km east of the file origin
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      // 1000 m / ~111.32 km per degree at the equator ≈ +0.008983°
      expect(r.value.lon).toBeCloseTo(9.008983, 3)
      expect(r.value.lat).toBeCloseTo(0, 4)
    }
  })

  it('maps scene −Z to north (y_P = −scene.z)', () => {
    const r = placementFromExtraction(
      extraction({ eastings: 500_000, northings: 0 }),
      bounds(0, -1000), // 1 km north in scene space
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.lat).toBeCloseTo(0.00904, 3) // ~1000 m / 110.57 km per degree
      expect(r.value.lon).toBeCloseTo(9, 4)
    }
  })

  it('rotates the centroid by γ before translating (γ=90° turns east into north)', () => {
    const r = placementFromExtraction(
      extraction({ eastings: 500_000, northings: 0, rotationDeg: 90 }),
      bounds(1000, 0),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.lon).toBeCloseTo(9, 4)           // no eastward shift
      expect(r.value.lat).toBeCloseTo(0.00904, 3)     // shift went north instead
      expect(r.value.rotationDeg).toBe(90)
    }
  })

  it('applies the MapConversion scale to centroid offsets', () => {
    const r = placementFromExtraction(
      extraction({ eastings: 500_000, northings: 0, scale: 2 }),
      bounds(500, 0), // 500 scene-m × scale 2 = 1000 grid-m
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.lon).toBeCloseTo(9.008983, 3)
  })

  it('errors with unknownCrs when the EPSG cannot be resolved', () => {
    const r = placementFromExtraction(
      extraction({ eastings: 500_000, northings: 0, epsgCode: 'LOCAL_DATUM_7' }),
      null,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('unknownCrs')
  })

  it('errors with unknownCrs when the EPSG code is missing entirely', () => {
    const r = placementFromExtraction(
      extraction({ eastings: 500_000, northings: 0, epsgCode: null }),
      null,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('unknownCrs')
  })

  it('errors with crsOutOfDomain when the inverse lands outside the CRS area', () => {
    const r = placementFromExtraction(
      extraction({ eastings: -8_000_000, northings: 0 }), // absurd for UTM 32N
      null,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(['crsOutOfDomain', 'crsConversionFailed']).toContain(r.error.message)
  })

  it('errors with notGeoreferenced when nothing usable exists', () => {
    const r = placementFromExtraction(
      extraction({ status: 'none', rung: 4, epsgCode: null }),
      null,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('notGeoreferenced')
  })

  it('resolves after the user registers a custom proj4 for an unknown code', async () => {
    const g = extraction({ eastings: 500_000, northings: 0, epsgCode: 'EPSG:99999' })
    expect(placementFromExtraction(g, null).ok).toBe(false)
    const { registerCustomProj4 } = await import('./crs')
    registerCustomProj4('EPSG:99999', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs')
    const r = placementFromExtraction(g, null)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.lon).toBeCloseTo(9, 4)
  })
})

// ── Persistence ─────────────────────────────────────────────────────────────────

describe('placement persistence', () => {
  it('save → load roundtrip keeps the versioned envelope', () => {
    savePlacement('cache-key-1', MANUAL, '+proj=utm +zone=31 +datum=WGS84')
    const env = loadPlacement('cache-key-1')
    expect(env?.v).toBe(1)
    expect(env?.placement).toEqual(MANUAL)
    expect(env?.customProj4).toContain('+proj=utm')
    expect(typeof env?.savedAt).toBe('number')
  })

  it('is keyed per file — other cache keys stay empty', () => {
    savePlacement('cache-key-1', MANUAL)
    expect(loadPlacement('cache-key-2')).toBeNull()
  })

  it('rejects corrupt or invalid envelopes', () => {
    localStorage.setItem('ifc-geo-placement:v1:bad1', '{not json')
    localStorage.setItem('ifc-geo-placement:v1:bad2', JSON.stringify({ v: 2, placement: MANUAL }))
    localStorage.setItem('ifc-geo-placement:v1:bad3', JSON.stringify({ v: 1, placement: { lat: 'x' } }))
    expect(loadPlacement('bad1')).toBeNull()
    expect(loadPlacement('bad2')).toBeNull()
    expect(loadPlacement('bad3')).toBeNull()
  })

  it('clearPlacement removes the entry', () => {
    savePlacement('cache-key-1', MANUAL)
    clearPlacement('cache-key-1')
    expect(loadPlacement('cache-key-1')).toBeNull()
  })
})

// ── resolvePlacement orchestration ──────────────────────────────────────────────

describe('resolvePlacement', () => {
  it('saved manual placement wins over extraction', () => {
    savePlacement('key', MANUAL)
    const r = resolvePlacement('key', extraction({ eastings: 500_000, northings: 0 }), null)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.source).toBe('manual')
      expect(r.value.lat).toBe(MANUAL.lat)
    }
  })

  it('falls back to extraction when nothing is saved', () => {
    const r = resolvePlacement('key', extraction({ eastings: 500_000, northings: 0 }), null)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.source).toBe('ifc')
  })

  it('re-registers a persisted custom proj4 definition', () => {
    savePlacement('key', MANUAL, '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs')
    expect(resolveCrs('EPSG:88888').ok).toBe(false)
    const r = resolvePlacement('key', extraction({ epsgCode: 'EPSG:88888' }), null)
    expect(r.ok).toBe(true)
    expect(resolveCrs('EPSG:88888').ok).toBe(true)
  })

  it('errors when neither saved nor extracted data exists', () => {
    const r = resolvePlacement('key', null, null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('notGeoreferenced')
  })
})
