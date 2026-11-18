import { describe, expect, it } from 'vitest'
import { labelKey, placeScreenLabels, type ScreenItem } from './screen-labels'

const item = (key: string, priority: number, sx: number, sy: number, w = 60, h = 16): ScreenItem =>
  ({ key, priority, sx, sy, w, h })

describe('placeScreenLabels', () => {
  it('keeps the more important name where two collide', () => {
    expect(placeScreenLabels([item('suburb', 500, 100, 100), item('city', 800, 110, 104)], 10)).toEqual(['city'])
  })
  it('keeps names that do not touch', () => {
    expect(placeScreenLabels([item('a', 1, 100, 100), item('b', 2, 400, 300)], 10).sort()).toEqual(['a', 'b'])
  })
  it('gives each layer a quota, so POIs never crowd out places', () => {
    const pois = Array.from({ length: 10 }, (_, i) => ({ ...item(`poi${i}`, 900 - i, i * 100, 50), layerId: 'poi' }))
    const town = { ...item('town', 100, 300, 400), layerId: 'place' }
    const kept = placeScreenLabels([...pois, town], 50, { poi: 3 })
    expect(kept.filter((k) => k.startsWith('poi'))).toHaveLength(3)
    expect(kept).toContain('town')
  })

  it('caps the number of names on screen', () => {
    const many = Array.from({ length: 50 }, (_, i) => item(`p${i}`, i, (i % 10) * 120, Math.floor(i / 10) * 60))
    expect(placeScreenLabels(many, 20)).toHaveLength(20)
  })
})

describe('labelKey', () => {
  it('gives one identity to one place seen by two tiles', () => {
    expect(labelKey('place', 'Poblenou', 0.50601, 0.62)).toBe(labelKey('place', 'Poblenou', 0.506012, 0.620004))
  })
  it('separates two places of the same name far apart', () => {
    expect(labelKey('place', 'Sant Martí', 0.5, 0.6)).not.toBe(labelKey('place', 'Sant Martí', 0.52, 0.6))
  })
})
