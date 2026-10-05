import { describe, expect, it } from 'vitest'
import { getMapStyle, MAP_STYLE_IDS, nameOf, zoomValue, type LabelLayer, type LineLayer } from './map-styles'

describe('zoomValue', () => {
  it('returns constants and clamps outside the stops', () => {
    expect(zoomValue(3, 10)).toBe(3)
    expect(zoomValue([[10, 2], [14, 8]], 5)).toBe(2)
    expect(zoomValue([[10, 2], [14, 8]], 20)).toBe(8)
  })
  it('interpolates geometrically so widths survive a LOD switch', () => {
    // 4 px at z14, 16 px at z16 -> 8 px at z15 (linear would say 10).
    expect(zoomValue([[14, 4], [16, 16]], 15)).toBeCloseTo(8, 6)
  })
  it('falls back to linear through zero', () => {
    expect(zoomValue([[0, 0], [10, 10]], 5)).toBe(5)
  })
})

describe('nameOf', () => {
  it('prefers the viewer language, then the local name', () => {
    expect(nameOf({ name: 'Barcelona', 'name:ja': 'バルセロナ' }, 'ja')).toBe('バルセロナ')
    expect(nameOf({ name: 'Carrer de Mallorca' }, 'en')).toBe('Carrer de Mallorca')
    expect(nameOf({}, 'en')).toBeNull()
  })
})

describe('styles share one cartographic hierarchy', () => {
  it('builds every style', () => {
    for (const id of MAP_STYLE_IDS) expect(getMapStyle(id).layers.length).toBeGreaterThan(8)
  })

  it('draws road casings before fills and bridges after surface roads', () => {
    const ids = getMapStyle('standard').layers.map((l) => l.id)
    expect(ids.indexOf('road-case')).toBeLessThan(ids.indexOf('road'))
    expect(ids.indexOf('road')).toBeLessThan(ids.indexOf('bridge'))
    expect(ids.indexOf('water')).toBeLessThan(ids.indexOf('road'))
  })

  it('puts every label layer after all geometry', () => {
    const layers = getMapStyle('standard').layers
    const firstLabel = layers.findIndex((l) => l.type === 'label')
    expect(layers.slice(firstLabel).every((l) => l.type === 'label')).toBe(true)
  })

  it('ranks motorways wider than minor streets at every zoom', () => {
    const road = getMapStyle('standard').layers.find((l) => l.id === 'road') as LineLayer
    const w = road.width as (p: Record<string, unknown>, z: number) => number
    for (const z of [12, 14, 16, 18]) expect(w({ class: 'motorway' }, z)).toBeGreaterThan(w({ class: 'minor' }, z))
  })

  it('introduces information progressively with zoom', () => {
    const labels = getMapStyle('standard').layers.filter((l): l is LabelLayer => l.type === 'label')
    const poi = labels.find((l) => l.id === 'poi')!
    expect(poi.maxCount!(14)).toBe(0)
    expect(poi.maxCount!(18)).toBeGreaterThan(poi.maxCount!(15))
    const road = labels.find((l) => l.id === 'road-name')!
    expect(road.filter!({ class: 'minor' }, 14)).toBe(false)
    expect(road.filter!({ class: 'minor' }, 15)).toBe(true)
    expect(road.filter!({ class: 'primary' }, 13)).toBe(true)
  })

  it('keeps BIM and Minimal free of commercial POIs', () => {
    expect(getMapStyle('bim').layers.some((l) => l.id === 'poi')).toBe(false)
    expect(getMapStyle('minimal').layers.some((l) => l.id === 'poi')).toBe(false)
  })

  it('glows the major roads only in the night-designed style, under the roads', () => {
    const ids = getMapStyle('dark').layers.map((l) => l.id)
    expect(ids.indexOf('road-glow')).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf('road-glow')).toBeLessThan(ids.indexOf('road-case'))
    expect(getMapStyle('standard').layers.some((l) => l.id === 'road-glow')).toBe(false)
  })

  it('marks Dark as a dark style', () => {
    expect(getMapStyle('dark').dark).toBe(true)
    expect(getMapStyle('standard').dark).toBe(false)
  })
})
