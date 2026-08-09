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
    // NAD83 / UTM — what US public LiDAR is delivered in.
    expect(unwrap(resolveCrs('EPSG:26913')).def).toContain('+proj=utm +zone=13')
    expect(unwrap(resolveCrs('EPSG:26901')).def).toContain('+proj=utm +zone=1')
    expect(unwrap(resolveCrs('EPSG:26923')).def).toContain('+proj=utm +zone=23')
    expect(unwrap(resolveCrs('EPSG:26715')).def).toContain('+proj=utm +zone=15')
  })

  it('never expands NAD27 to +datum=NAD27, which proj4js cannot shift', () => {
    // +datum=NAD27 pulls in +nadgrids=@conus,… and proj4js ships no NADCON
    // grids. The @ makes them optional, so the shift is SKIPPED silently and
    // Clarke 1866 coordinates come back labelled WGS84, ~100 m out. An explicit
    // 3-parameter shift is the honest substitute.
    const def = unwrap(resolveCrs('EPSG:26715')).def
    expect(def).not.toContain('nadgrids')
    expect(def).not.toContain('+datum=NAD27')
    expect(def).toContain('+ellps=clrk66')
    expect(def).toContain('+towgs84=-8,160,176')
    expect(unwrap(resolveCrs('EPSG:26715')).note).toMatch(/NAD27/)
  })

  it('leaves the codes between the NAD bands unresolved rather than guessing', () => {
    // 26924-26999 and 26723-26799 are not UTM. An off-by-one in the band
    // arithmetic would hand back a plausible zone for a code that is not one.
    for (const code of ['EPSG:26924', 'EPSG:26900', 'EPSG:26723', 'EPSG:26700']) {
      expect(resolveCrs(code).ok, code).toBe(false)
    }
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

  it('NAD83 UTM13N puts the Red Rocks sample scan in Colorado', () => {
    // The demo cloud's own header bbox corner (see demo-models/point-clouds.ts).
    // Red Rocks Amphitheatre sits at roughly 39.665°N, 105.205°W, so this is a
    // check against the real world rather than against the projection's origin.
    const def = unwrap(resolveCrs('EPSG:26913'))
    const out = unwrap(gridToWgs84(def, 482_060.5, 4_390_187.5))
    expect(out.lat).toBeCloseTo(39.66, 2)
    expect(out.lon).toBeCloseTo(-105.21, 2)
    expect(out.inDomain).toBe(true)
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
