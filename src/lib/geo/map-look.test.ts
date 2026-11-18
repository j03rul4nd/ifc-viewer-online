import { describe, expect, it } from 'vitest'
import {
  BUILDING_FINISHES, clampLookTuning, easeInOut, hexToRgb, lerpLightPreset, LIGHT_PRESETS, MAP_LOOKS, resolveLook,
  skyBackdropStops, srgbToLinear, tunedLight,
} from './map-look'
import { isMapStyleId } from './basemap/map-styles'

describe('map looks', () => {
  it('every curated look points at a real light, finish and map style', () => {
    for (const l of MAP_LOOKS) {
      expect(LIGHT_PRESETS[l.light]).toBeDefined()
      expect(BUILDING_FINISHES[l.finish]).toBeDefined()
      if (l.mapStyle) expect(isMapStyleId(l.mapStyle)).toBe(true)
    }
  })

  it('falls back to the first look for an unknown id', () => {
    expect(resolveLook('nope').id).toBe(MAP_LOOKS[0].id)
    expect(resolveLook(null).id).toBe(MAP_LOOKS[0].id)
  })

  it('lights windows only when it is dark enough to need them', () => {
    expect(LIGHT_PRESETS.day.windowGlow).toBe(0)
    expect(LIGHT_PRESETS.night.windowGlow).toBeGreaterThan(LIGHT_PRESETS.dusk.windowGlow)
  })

  it('keeps the sun low at dawn and dusk, the shadows long', () => {
    expect(LIGHT_PRESETS.dawn.sunAltitude).toBeLessThan(15)
    expect(LIGHT_PRESETS.dusk.sunAltitude).toBeLessThan(15)
    expect(LIGHT_PRESETS.day.sunAltitude).toBeGreaterThan(30)
  })

  it('lights the streets warm against a cool moonlit ground after dark, and only then', () => {
    // Temperature, not brightness, separates them: a brighter street tint
    // turned the pale road meshes into a daylit sand field (measured).
    const [sr, , sb] = hexToRgb(LIGHT_PRESETS.night.streetTint)
    const [gr, , gb] = hexToRgb(LIGHT_PRESETS.night.groundTint)
    expect(sr).toBeGreaterThan(sb)
    expect(gb).toBeGreaterThan(gr)
    expect(LIGHT_PRESETS.day.streetTint).toBe(LIGHT_PRESETS.day.groundTint)
  })

  it('night pairs with a dark basemap — an unlit bright map would glare', () => {
    expect(resolveLook('night').mapStyle).toBe('dark')
  })
})

describe('look tuning', () => {
  it('clamps to safe ranges and ignores garbage', () => {
    expect(clampLookTuning({ exposure: 9, glow: -1 })).toEqual({ exposure: 1.6, glow: 0 })
    expect(clampLookTuning({ exposure: NaN })).toEqual({ exposure: 1, glow: 1 })
  })
  it('multiplies the preset — lights off at glow 0, untouched at 1', () => {
    const night = LIGHT_PRESETS.night
    const off = tunedLight(night, { exposure: 1, glow: 0 })
    expect(off.windowGlow).toBe(0)
    expect(off.floodlight).toBe(0)
    expect(tunedLight(night, { exposure: 1, glow: 1 })).toEqual(night)
    expect(tunedLight(night, { exposure: 1.2, glow: 1 }).exposure).toBeCloseTo(night.exposure * 1.2, 6)
  })
})

describe('time-of-day transition', () => {
  const { day, night } = LIGHT_PRESETS

  it('starts exactly at one preset and lands exactly on the other', () => {
    const at0 = lerpLightPreset(day, night, 0)
    const at1 = lerpLightPreset(day, night, 1)
    expect(at0.sky.zenith).toBe(day.sky.zenith)
    expect(at0.exposure).toBe(day.exposure)
    expect(at1.fog).toBe(night.fog)
    expect(at1.windowGlow).toBe(night.windowGlow)
  })

  it('turns the city lights on gradually, not at a cut', () => {
    const mid = lerpLightPreset(day, night, 0.5)
    expect(mid.windowGlow).toBeGreaterThan(0)
    expect(mid.windowGlow).toBeLessThan(night.windowGlow)
  })

  it('moves the sun the short way round', () => {
    const a = { ...day, sunAzimuth: 350 }
    const b = { ...day, sunAzimuth: 10 }
    expect(lerpLightPreset(a, b, 0.5).sunAzimuth).toBeCloseTo(0, 6)
  })

  it('eases in and out', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBe(0.5)
    expect(easeInOut(0.1)).toBeLessThan(0.1)
  })
})

describe('sky backdrop', () => {
  it('runs zenith → horizon → fog, ending in the fog so the horizon has no edge', () => {
    for (const light of Object.values(LIGHT_PRESETS)) {
      const stops = skyBackdropStops(light)
      expect(stops[0]).toEqual([0, light.sky.zenith])
      expect(stops[stops.length - 1]).toEqual([1, light.fog])
      for (let i = 1; i < stops.length; i++) expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0])
    }
  })
})

describe('colour helpers', () => {
  it('parses hex and linearises', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0])
    expect(hexToRgb('bad')).toEqual([1, 1, 1])
    expect(srgbToLinear(1)).toBeCloseTo(1, 6)
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3)
  })
})
