import { describe, expect, it } from 'vitest'
import {
  CADASTRE, HILLSHADE, PNOA, hillshadeAlpha, plannedRequests, terrariumHeight, tileBoundsMercator, tileLonLatBounds,
} from './raster-sources'
import { regionToXyz } from './vector-overlay'
import { getMapStyle } from './map-styles'

// Barcelona, Poblenou: z16 tile containing 41.40 N, 2.19 E.
const BCN = { z: 16, x: 33166, y: 24448 }

describe('tile geometry', () => {
  it('locates an XYZ tile in lon/lat', () => {
    const b = tileLonLatBounds(BCN.z, BCN.x, BCN.y)
    expect(b.west).toBeLessThan(2.19)
    expect(b.east).toBeGreaterThan(2.18)
    expect(b.north).toBeGreaterThan(b.south)
  })
  it('gives web-mercator metres for the world tile', () => {
    const [x0, y0, x1, y1] = tileBoundsMercator(0, 0, 0)
    expect(x0).toBeCloseTo(-20037508.34, 1)
    expect(y1).toBeCloseTo(20037508.34, 1)
    expect(x1 - x0).toBeCloseTo(y1 - y0, 6)
  })
  it('maps a normalized region (y north) back to its XYZ address', () => {
    const n = 2 ** BCN.z
    const region = [BCN.x / n, 1 - (BCN.y + 1) / n, (BCN.x + 1) / n, 1 - BCN.y / n]
    expect(regionToXyz(region)).toEqual(BCN)
  })
})

describe('PNOA', () => {
  it('fills a 512 px tile with four 256 px WMTS tiles one level deeper', () => {
    const r = plannedRequests(PNOA, BCN.z, BCN.x, BCN.y)
    expect(r).toHaveLength(4)
    expect(r[0].url).toContain(`tilematrix=17&tilerow=${BCN.y * 2}&tilecol=${BCN.x * 2}`)
    expect(r[3]).toMatchObject({ fx: 0.5, fy: 0.5, fw: 0.5, fh: 0.5 })
  })
  it('requests nothing outside Spain', () => {
    // z10 tile over Paris.
    expect(plannedRequests(PNOA, 10, 518, 352)).toEqual([])
  })
})

describe('Cadastre', () => {
  it('asks one WMS image at the exact tile box, only from z16', () => {
    const r = plannedRequests(CADASTRE, BCN.z, BCN.x, BCN.y)
    expect(r).toHaveLength(1)
    expect(r[0].url).toContain('CRS=EPSG:3857')
    expect(r[0].url).toContain('WIDTH=512&HEIGHT=512')
    expect(plannedRequests(CADASTRE, 15, BCN.x >> 1, BCN.y >> 1)).toEqual([])
  })
})

describe('styles mixing sources', () => {
  it('hybrid puts the orthophoto under the vectors and drops ground fills', () => {
    const h = getMapStyle('hybrid')
    expect(h.rasters).toEqual([{ source: 'pnoa', placement: 'under', opacity: 1 }])
    expect(h.layers.some((l) => l.id === 'water' || l.id === 'building' || l.id === 'park')).toBe(false)
  })
  it('BIM lays the cadastral parcels over the map', () => {
    expect(getMapStyle('bim').rasters[0]).toMatchObject({ source: 'cadastre', placement: 'over' })
  })
  it('standard adds only the computed relief, multiplied under the roads', () => {
    expect(getMapStyle('standard').rasters).toEqual([
      { source: 'hillshade', placement: 'relief', opacity: 0.55, blend: 'multiply' },
    ])
    expect(getMapStyle('contrast').rasters).toEqual([])
  })
})

describe('hillshade', () => {
  it('decodes terrarium heights', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0)
    expect(terrariumHeight(128, 100, 128)).toBeCloseTo(100.5, 6)
  })

  it('leaves flat ground untouched', () => {
    const n = 8
    const a = hillshadeAlpha(new Float32Array(n * n).fill(120), n, 30, 1)
    expect(Math.max(...a)).toBe(0)
  })

  it('shades a slope facing away from the north-west light, not one facing it', () => {
    const n = 8
    // Height rises to the south-east: slopes face NW (lit). Mirror faces SE.
    const facingLight = new Float32Array(n * n)
    const facingAway = new Float32Array(n * n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      facingLight[y * n + x] = (x + y) * 20
      facingAway[y * n + x] = -(x + y) * 20
    }
    const lit = hillshadeAlpha(facingLight, n, 30, 1)[3 * n + 3]
    const dark = hillshadeAlpha(facingAway, n, 30, 1)[3 * n + 3]
    expect(lit).toBe(0)
    expect(dark).toBeGreaterThan(0.3)
  })

  it('reads one data tile for all its overzoomed children', () => {
    const a = HILLSHADE.urlsFor(15, 16584, 12224)[0].url
    const b = HILLSHADE.urlsFor(15, 16585, 12225)[0].url
    expect(a).toBe(b)
    expect(a).toContain('/terrarium/13/4146/3056.png')
    expect(plannedRequests(HILLSHADE, 17, 0, 0)).toEqual([])
  })
})
