// ─── city-search tests ────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { searchCities, normalizeCityQuery, loadCities, type SearchableCity } from './city-search'

function city(name: string, country: string, lat = 0, lon = 0): SearchableCity {
  return { name, country, lat, lon, norm: normalizeCityQuery(name) }
}

// Population-ordered fixture (index = rank)
const CITIES: SearchableCity[] = [
  city('Barcelona', 'ES', 41.39, 2.17),
  city('München', 'DE', 48.14, 11.58),
  city('Madrid', 'ES', 40.42, -3.7),
  city('Barcelona', 'VE', 10.14, -64.68),
  city('New Barcelona Heights', 'US'),
  city('Málaga', 'ES', 36.72, -4.42),
]

describe('normalizeCityQuery', () => {
  it('strips diacritics and case', () => {
    expect(normalizeCityQuery('MÁLAGA')).toBe('malaga')
    expect(normalizeCityQuery('München')).toBe('munchen')
    expect(normalizeCityQuery('  São Paulo ')).toBe('sao paulo')
  })
})

describe('searchCities', () => {
  it('requires at least 2 characters', () => {
    expect(searchCities('b', CITIES)).toEqual([])
    expect(searchCities('', CITIES)).toEqual([])
  })

  it('prefix matches come first, in population (dataset) order', () => {
    const r = searchCities('barcelona', CITIES)
    expect(r.map((c) => `${c.name}-${c.country}`)).toEqual([
      'Barcelona-ES', 'Barcelona-VE', 'New Barcelona Heights-US',
    ])
  })

  it('is diacritic- and case-insensitive both ways', () => {
    expect(searchCities('malaga', CITIES)[0].name).toBe('Málaga')
    expect(searchCities('MÜNCH', CITIES)[0].name).toBe('München')
    expect(searchCities('munch', CITIES)[0].name).toBe('München')
  })

  it('honours the limit', () => {
    expect(searchCities('barcelona', CITIES, 2)).toHaveLength(2)
  })
})

describe('bundled dataset (GeoNames)', () => {
  it('loads, is big, and finds major cities with coordinates', async () => {
    const cities = await loadCities()
    expect(cities.length).toBeGreaterThan(30_000)
    const madrid = searchCities('madrid', cities)[0]
    expect(madrid.country).toBe('ES')
    expect(madrid.lat).toBeCloseTo(40.42, 1)
    expect(madrid.lon).toBeCloseTo(-3.7, 1)
    // Population ranking: the Spanish capital outranks smaller Madrids.
    const tokyo = searchCities('tokyo', cities)[0]
    expect(tokyo.country).toBe('JP')
  })
})
