import { describe, it, expect } from 'vitest'
import { parseTable, detectDelimiter, detectGeometry, tableToGeoJson, parseWkt } from './csv'
import { applyJoin } from './join'
import { parseGeoJson } from './geojson'

const files = import.meta.glob('./__fixtures__/bcn-*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const geomCsv = files['./__fixtures__/bcn-transit-relacio-trams.csv']
const statusDat = files['./__fixtures__/bcn-trams.dat']

describe('csv (Barcelona traffic, as published)', () => {
  it('reads the tramos network: header, quoted names with accents, a coordinate-list column', () => {
    const t = parseTable(geomCsv)
    expect(t.columns).toEqual(['Tram', 'Descripció', 'Coordenades'])
    expect(t.rows[0][1]).toBe('Diagonal (Ronda de Dalt a Doctor Marañón)')
    expect(detectGeometry(t)).toEqual({ kind: 'coordlist', col: 2 })
    const gj = tableToGeoJson(t)!
    const layer = parseGeoJson(gj)
    expect(layer.ok).toBe(true)
    if (layer.ok) {
      expect(layer.value.counts.line).toBe(t.rows.length)
      expect(layer.value.features[0].properties.Tram).toBe(1)
    }
  })

  it('reads the headerless live status feed with "#" separators', () => {
    expect(detectDelimiter(statusDat)).toBe('#')
    const t = parseTable(statusDat, { columns: ['tram', 'time', 'estat', 'previst'] })
    expect(t.columns).toEqual(['tram', 'time', 'estat', 'previst'])
    expect(t.rows[2]).toEqual(['3', '20261008171601', '2', '2'])
    expect(detectGeometry(t).kind).toBe('none')
  })

  it('joins status onto the network by tram id', () => {
    const net = parseGeoJson(tableToGeoJson(parseTable(geomCsv))!)
    if (!net.ok) throw net.error
    const status = parseTable(statusDat, { columns: ['tram', 'time', 'estat', 'previst'] })
    const j = applyJoin(net.value, status, { layerKey: 'Tram', tableKey: 'tram' })
    expect(j.matched).toBe(12)
    expect(j.data.features[3].properties).toMatchObject({ Tram: 4, estat: 5, previst: 4 })
    expect(j.data.propertyKeys).toContain('estat')
  })

  it('a section that stops reporting loses its old value', () => {
    const net = parseGeoJson(tableToGeoJson(parseTable(geomCsv))!)
    if (!net.ok) throw net.error
    const first = applyJoin(net.value, parseTable('3#t#5#5', { columns: ['tram', 'time', 'estat', 'previst'] }), { layerKey: 'Tram', tableKey: 'tram' })
    const next = applyJoin(first.data, parseTable('4#t#1#1', { columns: ['tram', 'time', 'estat', 'previst'] }), { layerKey: 'Tram', tableKey: 'tram' })
    expect(next.data.features[2].properties.estat).toBeNull()
    expect(next.data.features[3].properties.estat).toBe(1)
  })
})

describe('csv (general)', () => {
  it('lon/lat columns, ";" separator and decimal commas', () => {
    const t = parseTable('nom;lat;lon;places\n"Parking A";41,39;2,17;120\nParking B;41.40;2.18;80\n')
    const gj = tableToGeoJson(t)! as { features: Array<{ geometry: { coordinates: number[] }; properties: Record<string, unknown> }> }
    expect(gj.features[0].geometry.coordinates).toEqual([2.17, 41.39])
    expect(gj.features[1].properties.places).toBe(80)
  })

  it('WKT', () => {
    expect(parseWkt('LINESTRING (2.1 41.3, 2.2 41.4)')).toEqual({ type: 'LineString', coordinates: [[2.1, 41.3], [2.2, 41.4]] })
    expect(parseWkt('POINT Z (2.1 41.3 12)')).toEqual({ type: 'Point', coordinates: [2.1, 41.3, 12] })
    expect(parseWkt('POLYGON ((0 0, 1 0, 1 1, 0 0))')!.type).toBe('Polygon')
    const t = parseTable('id,geom\n1,"POINT (2.17 41.39)"\n')
    expect(detectGeometry(t)).toEqual({ kind: 'wkt', col: 1 })
  })
})

describe('traffic rendering helpers', () => {
  it('offsetLine shifts to the right of travel, both directions apart', async () => {
    const { offsetLine } = await import('./vector-mesh')
    // Eastbound along x: right of travel in plan (z south) is +z.
    const east = offsetLine([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], 3)
    expect(east[0].z).toBeCloseTo(3); expect(east[1].z).toBeCloseTo(3)
    const west = offsetLine([{ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], 3)
    expect(west[0].z).toBeCloseTo(-3)
  })
  it('offsetLine caps the miter at sharp turns', async () => {
    const { offsetLine } = await import('./vector-mesh')
    const r = offsetLine([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0.1 }], 2)
    expect(Math.hypot(r[1].x - 10, r[1].z)).toBeLessThanOrEqual(4.01)
  })
  it('tableTime reads compact local timestamps and keeps the newest', async () => {
    const { tableTime } = await import('./feeds')
    expect(tableTime(['20261008171601', '20261008170101'])).toBe(new Date(2026, 9, 8, 17, 16, 1).getTime())
    expect(tableTime(['n/a'])).toBeNull()
  })
})
