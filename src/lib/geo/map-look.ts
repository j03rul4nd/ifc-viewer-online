// ─── map-look ─────────────────────────────────────────────────────────────────
// The art direction of map mode: one choice that sets the light, the building
// finish and the basemap together, the way Mapbox Standard's light presets and
// themes do — but reaching further, into the BIM model's own surroundings.
//
// A look is three orthogonal decisions, kept separate so they can be mixed:
//
//   LightPreset    — the one sun: where it is, its colour, how much sky fills
//                    the shadows, fog, exposure, and how lit windows glow.
//   BuildingFinish — what the context buildings are made of on screen:
//                    their real colours, white card (a model maquette), a
//                    single tone, a technical drawing, glass at night.
//   map style      — the cartography on the ground (basemap/map-styles.ts).
//
// Everything here is applied as uniforms and light parameters — switching a
// look never rebuilds geometry, so it is instant on any scene.
//
// Why curated looks on top: the space of (light × finish × style) has ~200
// combinations and most are ugly. Six that were designed together are what a
// user wants to click; the parts stay available underneath.

import type { MapStyleId } from './basemap/map-styles'

export type LightPresetId = 'dawn' | 'day' | 'dusk' | 'night'
export type BuildingFinishId = 'natural' | 'clay' | 'monochrome' | 'blueprint'

export interface SkyPalette {
  zenith: string
  horizon: string
  ground: string
  /** Sun (or moon) disc colour when high and when on the horizon. */
  sunHigh: string
  sunLow: string
  /** Multiplies the whole sky — the ambient fill it gives. */
  intensity: number
}

export interface LightPreset {
  id: LightPresetId
  /** Bearing the light comes FROM (° from north) and its height (°). */
  sunAzimuth: number
  sunAltitude: number
  /** Key (sun/moon) light colour and intensity. */
  keyColor: string
  keyIntensity: number
  sky: SkyPalette
  /** Distance fog colour — what the far city dissolves into. */
  fog: string
  /** Renderer tone-mapping exposure. */
  exposure: number
  /** 0–1: how much of the glazing glows from inside. */
  windowGlow: number
  /** Colour of that light: warm tungsten mixed with cool LED offices. */
  glowColor: string
  /** Multiplies the basemap (unlit tiles) so the ground sits in the same light. */
  groundTint: string
  /**
   * Warm floodlight on the MODEL (model-staging.ts). 0 by day; after dark it
   * keeps the model the most legible thing on screen.
   */
  floodlight: number
  /**
   * Multiplies the ROADS (and bridges) instead of groundTint. After dark this
   * is sodium amber and brighter than the ground: the streets read as lit
   * ribbons through a dark city, the single strongest cue of a night map.
   */
  streetTint: string
  /**
   * Multiplies the BASEMAP tiles. Usually = groundTint; at night the look's
   * basemap (Dark) is already a night map, and darkening it again by the full
   * moonlight tint put out its streets — so it gets a gentler one.
   */
  mapTint: string
  /**
   * × the viewer's own fill lights (hemisphere, ambient, fill directionals).
   * They are tuned for a model on a turntable at noon; left alone, a night
   * look's lit (detailed) facades came out almost white.
   */
  ambient: number
}

export interface BuildingFinish {
  id: BuildingFinishId
  /** The single surface colour this finish paints with (clay, tone, ink). */
  tint: string
  /** 0 = real colours, 1 = fully the tint (window/storey relief is kept). */
  tintMix: number
  /** How much of the facade's own light/dark relief survives the tint. */
  relief: number
  /** Contact shade at the foot of the walls (fake ambient occlusion). */
  ao: number
}

export type MapLookId = 'daylight' | 'maquette' | 'golden' | 'night' | 'blueprint' | 'dawn'

export interface MapLook {
  id: MapLookId
  light: LightPresetId
  finish: BuildingFinishId
  /** The basemap that belongs to this look (null keeps the user's own). */
  mapStyle: MapStyleId | null
}

// ── Light presets ──────────────────────────────────────────────────────────────
// Values were set by eye against Barcelona's Poblenou fixture, keeping three
// rules: one light source, shadows never pure black (sky fill), and the model
// always brighter than its context (exposure is tuned for the model's palette).

export const LIGHT_PRESETS: Readonly<Record<LightPresetId, LightPreset>> = {
  dawn: {
    id: 'dawn', sunAzimuth: 95, sunAltitude: 9,
    keyColor: '#ffc9a3', keyIntensity: 1.6,
    sky: { zenith: '#5d7fb8', horizon: '#f2c7a8', ground: '#2d2a2a', sunHigh: '#fff1dc', sunLow: '#ff9b62', intensity: 0.9 },
    fog: '#e7cdbb', exposure: 1.0, windowGlow: 0.25, glowColor: '#ffcf8a', groundTint: '#f6e6dc', floodlight: 0.4, streetTint: '#f6e6dc', mapTint: '#f6e6dc', ambient: 0.75,
  },
  day: {
    id: 'day', sunAzimuth: 215, sunAltitude: 48,
    keyColor: '#fff6ea', keyIntensity: 2.6,
    sky: { zenith: '#29509e', horizon: '#9eb8d9', ground: '#292624', sunHigh: '#fff6e0', sunLow: '#ffa060', intensity: 1 },
    fog: '#c9d6e4', exposure: 1.0, windowGlow: 0, glowColor: '#ffd9a0', groundTint: '#ffffff', floodlight: 0, streetTint: '#ffffff', mapTint: '#ffffff', ambient: 1,
  },
  dusk: {
    id: 'dusk', sunAzimuth: 285, sunAltitude: 5,
    keyColor: '#ff9a5c', keyIntensity: 1.4,
    sky: { zenith: '#2c3770', horizon: '#ff9f6b', ground: '#24191a', sunHigh: '#ffd2a0', sunLow: '#ff6a3d', intensity: 0.75 },
    fog: '#c98d78', exposure: 1.05, windowGlow: 0.55, glowColor: '#ffc27a', groundTint: '#ecc8b6', floodlight: 0.9, streetTint: '#f2d0a8', mapTint: '#ecc8b6', ambient: 0.6,
  },
  night: {
    // The moon as key light: high, cold and weak. The scene is carried by the
    // sky fill and the windows — exactly how a city reads after dark.
    id: 'night', sunAzimuth: 160, sunAltitude: 38,
    keyColor: '#8fa6d9', keyIntensity: 0.35,
    sky: { zenith: '#05070f', horizon: '#1a2240', ground: '#07080c', sunHigh: '#c8d6ff', sunLow: '#8a9cd0', intensity: 0.35 },
    fog: '#121829', exposure: 1.0, windowGlow: 1, glowColor: '#ffc46b', groundTint: '#3f4866', floodlight: 1.6, streetTint: '#5a4630', mapTint: '#aab2cc', ambient: 0.3,
  },
}

// ── Building finishes ──────────────────────────────────────────────────────────

export const BUILDING_FINISHES: Readonly<Record<BuildingFinishId, BuildingFinish>> = {
  natural: { id: 'natural', tint: '#ffffff', tintMix: 0, relief: 1, ao: 0.2 },
  // White card: the architect's model. The IFC in full colour stands in a
  // white maquette of its city — the single most "designed" look there is.
  clay: { id: 'clay', tint: '#f1eee8', tintMix: 1, relief: 0.95, ao: 0.32 },
  monochrome: { id: 'monochrome', tint: '#b9bec6', tintMix: 1, relief: 0.9, ao: 0.28 },
  // Technical drawing: deep navy volumes; the model is the only colour.
  blueprint: { id: 'blueprint', tint: '#2a4a78', tintMix: 1, relief: 0.9, ao: 0.35 },
}

// ── Curated looks ─────────────────────────────────────────────────────────────

export const MAP_LOOKS: readonly MapLook[] = [
  { id: 'daylight', light: 'day', finish: 'natural', mapStyle: 'standard' },
  { id: 'maquette', light: 'day', finish: 'clay', mapStyle: 'standard' },
  { id: 'golden', light: 'dusk', finish: 'natural', mapStyle: 'standard' },
  { id: 'night', light: 'night', finish: 'natural', mapStyle: 'dark' },
  { id: 'blueprint', light: 'day', finish: 'blueprint', mapStyle: 'bim' },
  { id: 'dawn', light: 'dawn', finish: 'monochrome', mapStyle: 'light' },
]

export const DEFAULT_LOOK_ID = 'daylight'

export function resolveLook(id: string | null | undefined): MapLook {
  return MAP_LOOKS.find((l) => l.id === id) ?? MAP_LOOKS[0]
}

// ── User tuning ───────────────────────────────────────────────────────────────

/** Fine-tuning on top of a look — multipliers, so it survives a look switch. */
export interface LookTuning {
  /** × the preset's exposure. */
  exposure: number
  /** × window glow, street wash and floodlight: "how lit is the city". */
  glow: number
}

export const DEFAULT_LOOK_TUNING: LookTuning = { exposure: 1, glow: 1 }

export function clampLookTuning(t: Partial<LookTuning>): LookTuning {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    exposure: Math.min(1.6, Math.max(0.6, num(t.exposure, 1))),
    glow: Math.min(2, Math.max(0, num(t.glow, 1))),
  }
}

/** The preset as the user tuned it. */
export function tunedLight(light: LightPreset, t: LookTuning): LightPreset {
  return {
    ...light,
    exposure: light.exposure * t.exposure,
    windowGlow: light.windowGlow * t.glow,
    floodlight: light.floodlight * t.glow,
  }
}

// ── Time-of-day transitions ───────────────────────────────────────────────────

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  // In linear light: an sRGB lerp between a blue night and a warm dusk passes
  // through a muddy grey; linear keeps the in-between luminous.
  const mix = (x: number, y: number) => {
    const l = srgbToLinear(x) + (srgbToLinear(y) - srgbToLinear(x)) * t
    const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, s)) * 255)
  }
  const n = (mix(ar, br) << 16) | (mix(ag, bg) << 8) | mix(ab, bb)
  return `#${n.toString(16).padStart(6, '0')}`
}

/** Azimuth by the short way round (350° → 10° goes through north, not south). */
function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return (((a + d * t) % 360) + 360) % 360
}

/**
 * A light preset part-way between two — the frame of a day→night clip.
 * t = 0 is `a`, 1 is `b`; every colour, every number and the sun move together.
 */
export function lerpLightPreset(a: LightPreset, b: LightPreset, t: number): LightPreset {
  const k = Math.min(1, Math.max(0, t))
  const num = (x: number, y: number) => x + (y - x) * k
  const col = (x: string, y: string) => lerpHex(x, y, k)
  return {
    id: k < 0.5 ? a.id : b.id,
    sunAzimuth: lerpAngle(a.sunAzimuth, b.sunAzimuth, k),
    sunAltitude: num(a.sunAltitude, b.sunAltitude),
    keyColor: col(a.keyColor, b.keyColor),
    keyIntensity: num(a.keyIntensity, b.keyIntensity),
    sky: {
      zenith: col(a.sky.zenith, b.sky.zenith),
      horizon: col(a.sky.horizon, b.sky.horizon),
      ground: col(a.sky.ground, b.sky.ground),
      sunHigh: col(a.sky.sunHigh, b.sky.sunHigh),
      sunLow: col(a.sky.sunLow, b.sky.sunLow),
      intensity: num(a.sky.intensity, b.sky.intensity),
    },
    fog: col(a.fog, b.fog),
    exposure: num(a.exposure, b.exposure),
    windowGlow: num(a.windowGlow, b.windowGlow),
    glowColor: col(a.glowColor, b.glowColor),
    groundTint: col(a.groundTint, b.groundTint),
    floodlight: num(a.floodlight, b.floodlight),
    streetTint: col(a.streetTint, b.streetTint),
    mapTint: col(a.mapTint, b.mapTint),
    ambient: num(a.ambient, b.ambient),
  }
}

/** Ease for a time-of-day move: slow at both ends, like a real dusk. */
export function easeInOut(t: number): number {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

// ── Sky backdrop ──────────────────────────────────────────────────────────────

/**
 * Colour stops (top → bottom of the screen) for the backdrop behind the map.
 * It ENDS in the fog colour on purpose: the far city fades into fog, and the
 * fog meets the sky at the horizon in the same colour — so there is no line
 * where the world stops. A flat fog-coloured background (what the first
 * version used) gave the haze but lost the sky; a sky without the fog stop
 * draws a hard edge along the horizon.
 */
export function skyBackdropStops(light: LightPreset): Array<[offset: number, color: string]> {
  return [
    [0, light.sky.zenith],
    [0.55, light.sky.horizon],
    [0.82, light.fog],
    [1, light.fog],
  ]
}

// ── Colour helpers (pure, linear-light aware) ─────────────────────────────────

/** '#rrggbb' → [r, g, b] in 0–1 sRGB. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [1, 1, 1]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** sRGB component → linear light (what shaders and lights work in). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
