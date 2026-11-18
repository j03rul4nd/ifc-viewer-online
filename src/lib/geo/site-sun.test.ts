import { describe, expect, it } from 'vitest'
import { siteSunFor } from './site-sun'

const BCN = { lat: 41.4, lon: 2.19 }
const JUNE = new Date('2026-06-21T12:00:00Z')
const DECEMBER = new Date('2026-12-21T12:00:00Z')

describe('siteSunFor', () => {
  it('sets the dusk sun in the west, low', () => {
    const s = siteSunFor('dusk', BCN.lat, BCN.lon, JUNE)!
    expect(s.azimuth).toBeGreaterThan(270)
    expect(s.azimuth).toBeLessThan(320)
    expect(s.altitude).toBeLessThan(10)
  })

  it('rises in the east', () => {
    const s = siteSunFor('dawn', BCN.lat, BCN.lon, JUNE)!
    expect(s.azimuth).toBeGreaterThan(40)
    expect(s.azimuth).toBeLessThan(90)
  })

  it('follows the season: the winter sunset is further south', () => {
    const june = siteSunFor('dusk', BCN.lat, BCN.lon, JUNE)!
    const dec = siteSunFor('dusk', BCN.lat, BCN.lon, DECEMBER)!
    expect(dec.azimuth).toBeLessThan(june.azimuth)
  })

  it('puts the afternoon sun south-west in the north, higher in summer', () => {
    const june = siteSunFor('day', BCN.lat, BCN.lon, JUNE)!
    const dec = siteSunFor('day', BCN.lat, BCN.lon, DECEMBER)!
    expect(june.azimuth).toBeGreaterThan(180)
    expect(june.altitude).toBeGreaterThan(dec.altitude)
  })

  it('leaves the night moon and polar days to the preset', () => {
    expect(siteSunFor('night', BCN.lat, BCN.lon, JUNE)).toBeNull()
    // Svalbard in June: the sun never sets.
    expect(siteSunFor('dusk', 78.2, 15.6, JUNE)).toBeNull()
  })

  it('never puts the sun below the preset colours\' horizon', () => {
    const s = siteSunFor('dawn', BCN.lat, BCN.lon, DECEMBER)!
    expect(s.altitude).toBeGreaterThanOrEqual(3)
  })
})
