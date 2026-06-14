import { describe, it, expect, beforeEach } from 'vitest'
import { useGeoStore } from './geoStore'
import type { GeoPlacement, GeorefExtraction } from '../lib/geo/geo-types'

const PLACEMENT: GeoPlacement = {
  lat: 41.3851, lon: 2.1734, rotationDeg: 0, heightOffsetM: 0,
  source: 'manual', confidence: 'approximate',
}

const EXTRACTION: GeorefExtraction = {
  status: 'found', rung: 1, epsgCode: 'EPSG:25832',
  lat: null, lon: null, heightM: 0, rotationDeg: 0,
  eastings: 500000, northings: 5000000, scale: 1,
  raw: {}, reasons: [], largeWcsOffset: false,
}

beforeEach(() => {
  localStorage.clear()
  useGeoStore.getState().resetForScene()
  // resetForScene leaves persisted fields (consent/layer/terms) — clear those too
  useGeoStore.setState({ consentGiven: false, baseLayerId: 'osm', termsAccepted: {} })
})

describe('geoStore · mapMode state machine', () => {
  it('off → starting → on', () => {
    const epoch = useGeoStore.getState().startEnable()
    expect(useGeoStore.getState().mapMode).toBe('starting')
    useGeoStore.getState().confirmEnabled(epoch)
    expect(useGeoStore.getState().mapMode).toBe('on')
  })

  it('stale confirmEnabled is ignored (enable → disable → late confirm)', () => {
    const epoch = useGeoStore.getState().startEnable()
    useGeoStore.getState().disable()
    useGeoStore.getState().confirmEnabled(epoch) // stale epoch
    expect(useGeoStore.getState().mapMode).toBe('off')
  })

  it('disable bumps the epoch (cancels in-flight work)', () => {
    const e1 = useGeoStore.getState().startEnable()
    useGeoStore.getState().disable()
    expect(useGeoStore.getState().epoch).toBeGreaterThan(e1)
  })

  it('fail moves starting → error with an i18n key, retry is possible', () => {
    const epoch = useGeoStore.getState().startEnable()
    useGeoStore.getState().fail(epoch, 'errors.chunkLoad')
    expect(useGeoStore.getState().mapMode).toBe('error')
    expect(useGeoStore.getState().mapErrorKey).toBe('errors.chunkLoad')
    // retry
    const e2 = useGeoStore.getState().startEnable()
    useGeoStore.getState().confirmEnabled(e2)
    expect(useGeoStore.getState().mapMode).toBe('on')
  })

  it('stale fail is ignored', () => {
    const e1 = useGeoStore.getState().startEnable()
    useGeoStore.getState().confirmEnabled(e1)
    useGeoStore.getState().fail(e1 - 1, 'errors.chunkLoad') // stale
    expect(useGeoStore.getState().mapMode).toBe('on')
  })

  it('startEnable while already on throws in dev (illegal transition)', () => {
    const epoch = useGeoStore.getState().startEnable()
    useGeoStore.getState().confirmEnabled(epoch)
    expect(() => useGeoStore.getState().startEnable()).toThrow(/illegal transition/)
  })

  it('resetForScene forces everything off and bumps epoch', () => {
    const epoch = useGeoStore.getState().startEnable()
    useGeoStore.getState().confirmEnabled(epoch)
    useGeoStore.getState().setPlacement(PLACEMENT)
    useGeoStore.getState().setGeoref('m1', EXTRACTION)
    useGeoStore.getState().resetForScene()
    const s = useGeoStore.getState()
    expect(s.mapMode).toBe('off')
    expect(s.placement).toBeNull()
    expect(s.georefByModel).toEqual({})
    expect(s.epoch).toBeGreaterThan(epoch)
  })
})

describe('geoStore · terrain epoch guard', () => {
  it('stale terrain status updates are dropped', () => {
    const epoch = useGeoStore.getState().startEnable()
    useGeoStore.getState().confirmEnabled(epoch)
    useGeoStore.getState().setTerrainStatus(epoch, 'loading')
    expect(useGeoStore.getState().terrainStatus).toBe('loading')
    useGeoStore.getState().disable()
    useGeoStore.getState().setTerrainStatus(epoch, 'ready') // stale
    expect(useGeoStore.getState().terrainStatus).toBe('idle')
  })
})

describe('geoStore · placement editing', () => {
  it('beginEditing seeds the draft from current placement', () => {
    useGeoStore.getState().setPlacement(PLACEMENT)
    useGeoStore.getState().beginEditing({ ...PLACEMENT, lat: 0, lon: 0 })
    expect(useGeoStore.getState().draftPlacement?.lat).toBe(PLACEMENT.lat)
  })

  it('beginEditing falls back when no placement exists', () => {
    useGeoStore.getState().beginEditing({ ...PLACEMENT, lat: 7 })
    expect(useGeoStore.getState().draftPlacement?.lat).toBe(7)
  })

  it('updateDraft patches only while editing; applyDraft commits', () => {
    useGeoStore.getState().updateDraft({ lat: 50 }) // not editing — no-op
    expect(useGeoStore.getState().draftPlacement).toBeNull()

    useGeoStore.getState().beginEditing(PLACEMENT)
    useGeoStore.getState().updateDraft({ rotationDeg: 90 })
    useGeoStore.getState().applyDraft()
    const s = useGeoStore.getState()
    expect(s.editing).toBe(false)
    expect(s.placement?.rotationDeg).toBe(90)
    expect(s.draftPlacement).toBeNull()
  })

  it('cancelEditing restores the pre-edit placement bit-exact', () => {
    useGeoStore.getState().setPlacement(PLACEMENT)
    useGeoStore.getState().beginEditing(PLACEMENT)
    useGeoStore.getState().updateDraft({ lat: -33, rotationDeg: 45 })
    useGeoStore.getState().cancelEditing()
    expect(useGeoStore.getState().placement).toEqual(PLACEMENT)
    expect(useGeoStore.getState().editing).toBe(false)
  })
})

describe('geoStore · persistence', () => {
  it('persists consent, layer and terms to localStorage', () => {
    useGeoStore.getState().setConsent(true)
    useGeoStore.getState().setBaseLayer('opentopomap')
    useGeoStore.getState().acceptTerms('esri-imagery')
    expect(localStorage.getItem('ifc-geo-consent:v1')).toBe('1')
    expect(localStorage.getItem('ifc-geo-layer:v1')).toBe('opentopomap')
    expect(JSON.parse(localStorage.getItem('ifc-geo-terms:v1')!)).toEqual({ 'esri-imagery': true })
  })

  it('tolerates corrupt terms JSON (falls back to empty)', () => {
    localStorage.setItem('ifc-geo-terms:v1', '{not json')
    // re-evaluate the reader through a fresh accept (merges onto parsed-empty)
    useGeoStore.setState({ termsAccepted: {} })
    useGeoStore.getState().acceptTerms('osm')
    expect(useGeoStore.getState().termsAccepted).toEqual({ osm: true })
  })
})

describe('geoStore · georef + attributions', () => {
  it('stores and removes per-model extractions', () => {
    useGeoStore.getState().setGeoref('m1', EXTRACTION)
    expect(useGeoStore.getState().georefByModel['m1']?.status).toBe('found')
    useGeoStore.getState().removeGeoref('m1')
    expect(useGeoStore.getState().georefByModel['m1']).toBeUndefined()
    // removing a missing id is a no-op, not an error
    useGeoStore.getState().removeGeoref('missing')
  })

  it('setAttributions skips identical lists (no churn re-renders)', () => {
    useGeoStore.getState().setAttributions(['© OpenStreetMap contributors'])
    const ref = useGeoStore.getState().attributions
    useGeoStore.getState().setAttributions(['© OpenStreetMap contributors'])
    expect(useGeoStore.getState().attributions).toBe(ref) // same reference
  })
})
