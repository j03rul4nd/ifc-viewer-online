// ─── solarStore tests ─────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSolarStore, saveManualLocation, loadManualLocation,
  type SolarPreset, type SolarLocation,
} from './solarStore'

const LOC: SolarLocation = {
  lat: 40.4168, lon: -3.7038, yawDeg: 12,
  source: 'ifc', northSource: 'ifc',
}

function preset(id: string, name = 'Invierno 16h'): SolarPreset {
  return { id, name, month: 12, day: 21, minutes: 16 * 60, moonOn: false }
}

beforeEach(() => {
  localStorage.clear()
  useSolarStore.getState().resetForScene()
  useSolarStore.setState({ quality: 'standard' })
})

describe('solarStore · basics', () => {
  it('activation, time, tz and location transitions', () => {
    const s = useSolarStore.getState()
    s.setActive(true)
    s.setTimeUTC(1_750_000_000_000)
    s.setTimeZone('Europe/Madrid', false)
    s.setLocation(LOC)
    const now = useSolarStore.getState()
    expect(now.active).toBe(true)
    expect(now.timeUTC).toBe(1_750_000_000_000)
    expect(now.timeZone).toBe('Europe/Madrid')
    expect(now.location?.source).toBe('ifc')
  })

  it('quality persists across resets (user pref)', () => {
    useSolarStore.getState().setQuality('high')
    useSolarStore.getState().resetForScene()
    expect(useSolarStore.getState().quality).toBe('high')
    expect(localStorage.getItem('ifc-solar-quality:v1')).toBe('high')
  })

  it('resetForScene clears session state', () => {
    const s = useSolarStore.getState()
    s.setActive(true)
    s.setMoonOn(true)
    s.setLocation(LOC)
    s.resetForScene()
    const now = useSolarStore.getState()
    expect(now.active).toBe(false)
    expect(now.moonOn).toBe(false)
    expect(now.location).toBeNull()
  })
})

describe('solarStore · presets (evergreen, per file)', () => {
  it('add/remove persists under the cache key', () => {
    const s = useSolarStore.getState()
    s.loadPresetsFor('file-A')
    s.addPreset(preset('p1'))
    s.addPreset(preset('p2', 'Verano 9h'))
    expect(useSolarStore.getState().presets).toHaveLength(2)

    // Reload from storage — survives
    s.loadPresetsFor('file-A')
    expect(useSolarStore.getState().presets).toHaveLength(2)

    useSolarStore.getState().removePreset('p1')
    s.loadPresetsFor('file-A')
    expect(useSolarStore.getState().presets.map((p) => p.id)).toEqual(['p2'])
  })

  it('presets are scoped per file', () => {
    const s = useSolarStore.getState()
    s.loadPresetsFor('file-A')
    s.addPreset(preset('p1'))
    s.loadPresetsFor('file-B')
    expect(useSolarStore.getState().presets).toHaveLength(0)
  })

  it('presets store time only — no location fields (re-resolve contract)', () => {
    const p = preset('p1')
    expect('lat' in p).toBe(false)
    expect('lon' in p).toBe(false)
  })

  it('rejects corrupt persisted presets', () => {
    localStorage.setItem('ifc-solar-presets:v1:bad', '{nope')
    useSolarStore.getState().loadPresetsFor('bad')
    expect(useSolarStore.getState().presets).toEqual([])
    localStorage.setItem(
      'ifc-solar-presets:v1:bad2',
      JSON.stringify([{ id: 'x', name: 'y', month: 99, day: 1, minutes: 0, moonOn: false }]),
    )
    useSolarStore.getState().loadPresetsFor('bad2')
    expect(useSolarStore.getState().presets).toEqual([])
  })
})

describe('manual location persistence', () => {
  it('round-trips per file and validates ranges', () => {
    saveManualLocation('file-A', 41.38, 2.17)
    expect(loadManualLocation('file-A')).toEqual({ lat: 41.38, lon: 2.17 })
    expect(loadManualLocation('file-B')).toBeNull()
    localStorage.setItem('ifc-solar-location:v1:bad', JSON.stringify({ lat: 999, lon: 0 }))
    expect(loadManualLocation('bad')).toBeNull()
  })
})
