// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { northUp, writeAsc, writeGeoTiff, type RasterOut } from './dem-export'
import { parseAsc, parseGeoTiff, sampleDem } from './dem-import'

/** 7 × 5 raster with a gradient and two no-data cells. */
function sample(epsg: number | null): RasterOut {
  const width = 7, height = 5
  const data = new Float32Array(width * height)
  for (let k = 0; k < data.length; k++) data[k] = (k % width) * 0.1 + Math.floor(k / width) * 1.25
  data[3] = NaN
  data[width * height - 1] = NaN
  return { width, height, data, x0: 432250, y0: 4584210, px: 2, epsg }
}

describe('raster export', () => {
  it('GeoTIFF round-trips through our own reader: values, no-data, origin, pixel size, EPSG', () => {
    const r = sample(25831)
    const buf = writeGeoTiff(r)
    const back = parseGeoTiff(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(back.width).toBe(7)
    expect(back.height).toBe(5)
    expect(back.x0).toBe(432250)
    expect(back.y0).toBe(4584210)
    expect(back.px).toBe(2)
    expect(back.py).toBe(2)
    expect(back.epsg).toBe(25831)
    for (let k = 0; k < r.data.length; k++) {
      if (Number.isNaN(r.data[k])) expect(back.data[k]).toBeNaN()
      else expect(back.data[k]).toBe(r.data[k])
    }
    // Centre of the top-left pixel.
    expect(sampleDem(back, 432251, 4584209)).toBeCloseTo(r.data[0], 6)
  })

  it('writes no CRS for a model that is not georeferenced', () => {
    const buf = writeGeoTiff(sample(null))
    const back = parseGeoTiff(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(back.epsg).toBeNull()
    expect(back.data[1]).toBeCloseTo(0.1, 6)
  })

  it('ASC round-trips (3 decimals) with the lower-left corner GIS expects', () => {
    const r = sample(null)
    const text = writeAsc(r)
    expect(text).toContain('yllcorner 4584200.000')
    const back = parseAsc(text)
    expect(back.x0).toBe(432250)
    expect(back.y0).toBe(4584210)
    expect(back.data[3]).toBeNaN()
    expect(back.data[8]).toBeCloseTo(r.data[8], 3)
  })

  it('turns a south-up grid north-up, masking cells', () => {
    // 2 × 3 grid, row 0 = south.
    const v = new Float32Array([1, 2, 3, 4, 5, 6])
    expect(Array.from(northUp(v, 2, 3))).toEqual([5, 6, 3, 4, 1, 2])
    const m = northUp(v, 2, 3, (c) => c !== 0)
    expect(m[4]).toBeNaN()
    expect(m[5]).toBe(2)
  })
})
