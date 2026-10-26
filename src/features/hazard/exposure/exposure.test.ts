// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import type { OsmFeature } from '../../../lib/geo/osm-features'
import { parseKml, parseKmlOrKmz } from '../io/kml'
import { classifyPlacemark, curveNumberGrid, exposureFromKml, exposureFromOsm, type HazardGrid } from './exposure'
import { criticalRainCsv, criticalRainGeoJson, criticalRows } from './report'
import { curveNumber } from '../core/scs-cn'
import { runHazard } from '../core/storm'

// 1 m per 1e-5 degree, origin at (0, 0): a 20 × 20 grid of 10 m cells.
const G: HazardGrid = { nx: 20, ny: 20, dx: 10, toLocal: (lat, lon) => ({ a: lon * 1e5, b: lat * 1e5 }) }
const ll = (a: number, b: number): string => `${a / 1e5},${b / 1e5},0`

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Quebrada</name>
  <Folder><name>Ámbito de estudio</name>
    <Placemark><name>Límite</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
      ${ll(0, 0)} ${ll(150, 0)} ${ll(150, 150)} ${ll(0, 150)} ${ll(0, 0)}
    </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
  </Folder>
  <Folder><name>Instituciones educativas</name>
    <Placemark><name>I.E. N° 501 &amp; anexo</name><Point><coordinates>${ll(55, 55)}</coordinates></Point></Placemark>
  </Folder>
  <Placemark><name>Posta de salud</name><description><![CDATA[<b>MINSA</b> nivel I-2]]></description>
    <Point><coordinates>${ll(15, 125)}</coordinates></Point></Placemark>
  <Placemark><name>Lote 12</name>
    <ExtendedData><Data name="uso"><value>Vivienda</value></Data><SchemaData><SimpleData name="pisos">2</SimpleData></SchemaData></ExtendedData>
    <MultiGeometry><Point><coordinates>${ll(95, 35)}</coordinates></Point></MultiGeometry></Placemark>
  <Placemark><LineString><coordinates>${ll(5, 5)} ${ll(5, 105)}</coordinates></LineString></Placemark>
</Document></kml>`

describe('KML reader', () => {
  it('reads placemarks with folders, entities, CDATA, ExtendedData and MultiGeometry', () => {
    const pm = parseKml(KML)
    expect(pm).toHaveLength(5)
    expect(pm[1].name).toBe('I.E. N° 501 & anexo')
    expect(pm[1].folders).toEqual(['Quebrada', 'Instituciones educativas'])
    expect(pm[2].description).toBe('MINSA nivel I-2')
    expect(pm[3].data).toEqual({ uso: 'Vivienda', pisos: '2' })
    expect(pm[3].geometries[0]).toEqual({ type: 'point', point: { lat: 35 / 1e5, lon: 95 / 1e5 } })
    expect(pm[0].geometries[0].type).toBe('polygon')
  })
  it('opens a KMZ', () => {
    const kmz = zipSync({ 'doc.kml': strToU8(KML), 'files/icon.png': new Uint8Array([1, 2]) })
    expect(parseKmlOrKmz(kmz)).toHaveLength(5)
    expect(parseKmlOrKmz(strToU8(KML))).toHaveLength(5)
  })
})

describe('exposure', () => {
  const pm = parseKml(KML)
  it('classifies by folder, name, description and data', () => {
    expect(pm.map(classifyPlacemark)).toEqual(['other', 'school', 'health', 'housing', 'road'])
  })
  it('masks the study area and places each element on its cells', () => {
    const ex = exposureFromKml(pm, G)
    expect(ex.area).not.toBeNull()
    expect(ex.mask!.reduce((s, v) => s + v, 0)).toBe(15 * 15)
    expect(ex.elements.map((e) => e.kind)).toEqual(['school', 'health', 'housing', 'road'])
    expect(ex.elements[0].cells).toEqual([5 * 20 + 5])
    expect(ex.elements[3].cells.length).toBe(11)
  })
  it('falls back to OSM schools, homes and named roads', () => {
    const H = { heightM: 0, minHeightM: 0, estimated: true }
    const S = { roofShape: 'flat' as const, roofHeightM: 0 }
    const sq = (a: number, b: number) => [[a, b], [a + 12, b], [a + 12, b + 12], [a, b + 12]].map(([x, y]) => ({ lat: y / 1e5, lon: x / 1e5 }))
    const f: OsmFeature[] = [
      { id: 'w1', kind: 'building', label: 'School', ring: sq(20, 20), height: H, style: S },
      { id: 'w2', kind: 'building', label: 'Warehouse', ring: sq(60, 60), height: H, style: S },
      { id: 'w3', kind: 'road', name: 'Jr. Lima', ring: [{ lat: 0.0005, lon: 0 }, { lat: 0.0005, lon: 0.001 }], height: H, style: S },
      { id: 'w4', kind: 'road', ring: [{ lat: 0.001, lon: 0 }, { lat: 0.001, lon: 0.001 }], height: H, style: S },
    ]
    expect(exposureFromOsm(f, G).map((e) => [e.id, e.kind])).toEqual([['osm-w1', 'school'], ['osm-w3', 'road']])
  })
  it('builds curve numbers from OSM cover, roads over fields, NaN outside the area', () => {
    const H = { heightM: 0, minHeightM: 0, estimated: true }
    const S = { roofShape: 'flat' as const, roofHeightM: 0 }
    const field = [[0, 0], [200, 0], [200, 100], [0, 100]].map(([x, y]) => ({ lat: y / 1e5, lon: x / 1e5 }))
    const f: OsmFeature[] = [
      { id: 'a', kind: 'green', label: 'Forest', ring: field, height: H, style: S },
      { id: 'r', kind: 'road', ring: [{ lat: 0.0005, lon: 0 }, { lat: 0.0005, lon: 0.002 }], height: H, style: S },
    ]
    const mask = exposureFromKml(pm, G).mask
    const cn = curveNumberGrid(G, f, 'C', 'II', 'shrub', mask)
    expect(cn[2 * 20 + 2]).toBe(curveNumber('forest', 'C'))
    expect(cn[5 * 20 + 2]).toBe(98)
    expect(cn[12 * 20 + 2]).toBe(curveNumber('shrub', 'C'))
    expect(cn[19 * 20 + 19]).toBeNaN()
  })
})

describe('critical-rain report', () => {
  it('sorts by critical rain and writes CSV and GeoJSON', () => {
    // A hillside rising along +j inside the KMZ's area; the school sits low on it.
    const z = new Float32Array(400)
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) z[j * 20 + i] = Math.max(0, j - 3) * 10 * Math.tan(0.66)
    const ex = exposureFromKml(parseKml(KML), G)
    const res = runHazard({
      dem: { nx: 20, ny: 20, dx: 10, z }, cn: new Float32Array(400).fill(80),
      cumRainMm: [50, 100, 200, 400], elements: ex.elements, mask: ex.mask, runoffThresholdMm: 1e9,
    })
    // Outside the mask no cell fails.
    expect(res.steps[res.steps.length - 1].pFail[19 * 20 + 19]).toBeNaN()
    const rows = criticalRows(ex.elements, res.critical)
    const reached = rows.filter((r) => r.rainMm !== null).map((r) => r.rainMm!)
    expect(reached).toEqual([...reached].sort((a, b) => a - b))
    const csv = criticalRainCsv(rows)
    expect(csv.split('\n')[0]).toBe('id,name,kind,critical_rain_mm,cause,unstable_without_rain')
    expect(csv).toContain(',I.E. N° 501 & anexo,school,')
    const gj = JSON.parse(criticalRainGeoJson(rows, ex.elements, (c) => ({ lat: (Math.floor(c / 20) + 0.5) * 10 / 1e5, lon: ((c % 20) + 0.5) * 10 / 1e5 })))
    const school = gj.features.find((f: { properties: { kind: string } }) => f.properties.kind === 'school')
    expect(school.geometry.coordinates).toEqual([[0.00055, 0.00055]])
  })
})
