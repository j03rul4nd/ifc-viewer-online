import { describe, it, expect, afterEach } from 'vitest'
import {
  normalizeEpsgCode,
  resolveCrs,
  gridToWgs84,
  registerCustomProj4,
  clearCustomProj4,
} from './crs'
import { unwrap } from '../result'

afterEach(() => clearCustomProj4())

describe('crs · normalizeEpsgCode', () => {
  it('parses the common spellings', () => {
    expect(normalizeEpsgCode('EPSG:25832')).toBe('EPSG:25832')
    expect(normalizeEpsgCode('epsg:25832')).toBe('EPSG:25832')
    expect(normalizeEpsgCode('urn:ogc:def:crs:EPSG::25832')).toBe('EPSG:25832')
    expect(normalizeEpsgCode('EPSG 25832')).toBe('EPSG:25832')
    expect(normalizeEpsgCode('25832')).toBe('EPSG:25832')
  })

  it('parses loose UTM prose (the field-reality matcher)', () => {
    expect(normalizeEpsgCode('ETRS89 UTM Zone 32N')).toBe('EPSG:25832')
    expect(normalizeEpsgCode('WGS84 / UTM zone 33S')).toBe('EPSG:32733')
    expect(normalizeEpsgCode('UTM 18N')).toBe('EPSG:32618')
  })

  it('rejects unparseable strings', () => {
    expect(normalizeEpsgCode('Local Grid')).toBeNull()
    expect(normalizeEpsgCode('')).toBeNull()
    expect(normalizeEpsgCode(null)).toBeNull()
  })
})

describe('crs · resolveCrs', () => {
  it('resolves formulaic UTM families', () => {
    expect(unwrap(resolveCrs('EPSG:25832')).def).toContain('+proj=utm +zone=32')
    expect(unwrap(resolveCrs('EPSG:32618')).def).toContain('+proj=utm +zone=18')
    expect(unwrap(resolveCrs('EPSG:32733')).def).toContain('+south')
  })

  it('resolves bundled static defs', () => {
    expect(unwrap(resolveCrs('EPSG:27700')).def).toContain('+ellps=airy')
    expect(unwrap(resolveCrs('EPSG:2154')).def).toContain('+proj=lcc')
    expect(unwrap(resolveCrs('EPSG:31467')).def).toContain('+x_0=3500000')
  })

  it('returns err(unknownCrs) for unknown codes', () => {
    const r = resolveCrs('EPSG:99999')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('unknownCrs')
  })
})

describe('crs · gridToWgs84 control points (projection-origin invariants)', () => {
  it('UTM false easting: (500000, 0) on UTM33N is (0°, 15°E)', () => {
    const def = unwrap(resolveCrs('EPSG:32633'))
    const out = unwrap(gridToWgs84(def, 500_000, 0))
    expect(out.lat).toBeCloseTo(0, 6)
    expect(out.lon).toBeCloseTo(15, 6)
    expect(out.inDomain).toBe(true)
  })

  it('ETRS89 UTM32N central meridian is 9°E', () => {
    const def = unwrap(resolveCrs('EPSG:25832'))
    const out = unwrap(gridToWgs84(def, 500_000, 5_000_000))
    expect(out.lon).toBeCloseTo(9, 5)
    expect(out.lat).toBeGreaterThan(44)
    expect(out.lat).toBeLessThan(46)
  })

  it('Lambert-93 origin (700000, 6600000) is (46.5°N, 3°E)', () => {
    const def = unwrap(resolveCrs('EPSG:2154'))
    const out = unwrap(gridToWgs84(def, 700_000, 6_600_000))
    expect(out.lat).toBeCloseTo(46.5, 5)
    expect(out.lon).toBeCloseTo(3, 5)
  })

  it('Swiss LV95 origin (2600000, 1200000) is Bern (46.9524°N, 7.4396°E)', () => {
    const def = unwrap(resolveCrs('EPSG:2056'))
    const out = unwrap(gridToWgs84(def, 2_600_000, 1_200_000))
    // towgs84 datum shift moves the WGS84 result ~100 m off the Bessel origin.
    expect(out.lat).toBeCloseTo(46.9524, 2)
    expect(out.lon).toBeCloseTo(7.4396, 2)
  })

  it('Amersfoort RD origin (155000, 463000) is (52.156°N, 5.388°E)', () => {
    const def = unwrap(resolveCrs('EPSG:28992'))
    const out = unwrap(gridToWgs84(def, 155_000, 463_000))
    expect(out.lat).toBeCloseTo(52.1562, 2)
    expect(out.lon).toBeCloseTo(5.3876, 2)
  })

  it('flags out-of-domain results (UTM32 coordinates fed to UTM18)', () => {
    const def = unwrap(resolveCrs('EPSG:32618'))
    const out = unwrap(gridToWgs84(def, 500_000, 5_000_000))
    expect(out.inDomain).toBe(true) // central meridian is always in-domain
    const farOut = unwrap(gridToWgs84(def, 10_000_000, 5_000_000))
    expect(farOut.inDomain).toBe(false)
  })

  it('fails gracefully on non-finite input', () => {
    const def = unwrap(resolveCrs('EPSG:25832'))
    const r = gridToWgs84(def, NaN, 0)
    expect(r.ok).toBe(false)
  })
})

describe('crs · custom proj4 definitions', () => {
  it('registers and resolves a valid custom definition', () => {
    const r = registerCustomProj4('EPSG:31370', '+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +units=m +no_defs')
    expect(r.ok).toBe(true)
    const resolved = resolveCrs('EPSG:31370')
    expect(resolved.ok).toBe(true)
  })

  it('rejects garbage definitions', () => {
    const r = registerCustomProj4('X', 'not a projection')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('invalidProj4')
  })

  it('custom defs take precedence and are cleared by clearCustomProj4', () => {
    registerCustomProj4('EPSG:99998', '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs')
    expect(resolveCrs('EPSG:99998').ok).toBe(true)
    clearCustomProj4()
    expect(resolveCrs('EPSG:99998').ok).toBe(false)
  })
})
