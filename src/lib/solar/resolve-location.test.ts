import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { withSiteOverride, resolveSolarLocation, ensureSolarLocation, applySolarLocation } from './resolve-location'
import { useSolarStore, type SolarLocation } from '../../stores/solarStore'
import { useGeoStore } from '../../stores/geoStore'
import type { GeoPlacement } from '../geo/geo-types'

// Torre Poblenou's own placement: Barcelona, the Cerdà grid's 45° turn.
const TORRE: GeoPlacement = {
  lat: 41.407, lon: 2.19, rotationDeg: 45, heightOffsetM: 0, source: 'ifc', confidence: 'high',
}
const RICHMOND_HILL = { lat: 43.87, lon: -79.44 }

function resetStores(): void {
  useGeoStore.getState().setPlacement(null)
  const s = useSolarStore.getState()
  s.setLocation(null)
  s.setTimeZone('UTC', false)
}

describe('withSiteOverride (the ?site= rung)', () => {
  it("takes the link's place and keeps the model's own north", () => {
    const own: SolarLocation = { lat: 41.4, lon: 2.19, yawDeg: 45, source: 'ifc', northSource: 'ifc' }
    expect(withSiteOverride(RICHMOND_HILL, own)).toEqual({
      lat: 43.87, lon: -79.44, yawDeg: 45, source: 'manual', northSource: 'ifc',
    })
  })

  it('keeps a hand-placed yaw but does not claim the IFC said so', () => {
    const own: SolarLocation = { lat: 41.4, lon: 2.19, yawDeg: 30, source: 'map', northSource: 'assumed' }
    expect(withSiteOverride(RICHMOND_HILL, own)).toMatchObject({ yawDeg: 30, northSource: 'assumed', source: 'manual' })
  })

  it('assumes project north is true north for a model that resolves nowhere', () => {
    expect(withSiteOverride(RICHMOND_HILL, null)).toEqual({
      lat: 43.87, lon: -79.44, yawDeg: 0, source: 'manual', northSource: 'assumed',
    })
  })
})

describe('resolveSolarLocation', () => {
  beforeEach(resetStores)
  afterEach(() => {
    resetStores()
    window.history.replaceState(null, '', '/')
  })

  it('without a site, answers with the ladder (here: the map placement)', async () => {
    useGeoStore.getState().setPlacement(TORRE)
    expect(await resolveSolarLocation(null, null, undefined)).toEqual({
      lat: 41.407, lon: 2.19, yawDeg: 45, source: 'ifc', northSource: 'ifc',
    })
  })

  it('a site wins over the georeference and keeps its yaw', async () => {
    useGeoStore.getState().setPlacement(TORRE)
    expect(await resolveSolarLocation(null, null, RICHMOND_HILL)).toEqual({
      lat: 43.87, lon: -79.44, yawDeg: 45, source: 'manual', northSource: 'ifc',
    })
  })

  it("reads ?site= from the live link by default", async () => {
    window.history.replaceState(null, '', '/?model=/a.ifc&site=43.87,-79.44')
    expect(await resolveSolarLocation(null, null)).toMatchObject({ lat: 43.87, lon: -79.44, source: 'manual' })
  })

  it('is null when nothing knows where the model is', async () => {
    expect(await resolveSolarLocation(null, null, undefined)).toBeNull()
  })
})

describe('ensureSolarLocation / applySolarLocation', () => {
  beforeEach(resetStores)
  afterEach(() => {
    resetStores()
    window.history.replaceState(null, '', '/')
  })

  it('sets the location and the time zone that goes with it', async () => {
    window.history.replaceState(null, '', '/?site=43.87,-79.44')
    const loc = await ensureSolarLocation(null)
    expect(loc).toMatchObject({ lat: 43.87, lon: -79.44 })
    const s = useSolarStore.getState()
    expect(s.location).toEqual(loc)
    expect(s.timeZone).toBe('America/Toronto')
    expect(s.tzOverridden).toBe(false)
  })

  it('leaves a time zone the visitor picked by hand', () => {
    useSolarStore.getState().setTimeZone('Europe/Madrid', true)
    applySolarLocation({ lat: 43.87, lon: -79.44, yawDeg: 0, source: 'manual', northSource: 'assumed' })
    expect(useSolarStore.getState().timeZone).toBe('Europe/Madrid')
  })

  it('returns the location already set, without resolving again', async () => {
    const set: SolarLocation = { lat: 1, lon: 2, yawDeg: 3, source: 'manual', northSource: 'assumed' }
    useSolarStore.getState().setLocation(set)
    window.history.replaceState(null, '', '/?site=43.87,-79.44')
    expect(await ensureSolarLocation(null)).toBe(set)
    expect(useSolarStore.getState().timeZone).toBe('UTC')
  })

  it('is null, and sets nothing, when the model is nowhere', async () => {
    expect(await ensureSolarLocation(null)).toBeNull()
    expect(useSolarStore.getState().location).toBeNull()
  })
})
