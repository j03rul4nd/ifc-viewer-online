// ─── Solar store ──────────────────────────────────────────────────────────────
// Product state for the Sun & Moon Study (docs/SUN_MOON_STUDY_PLAN.md §4 D3-D5).
// The solar system (src/lib/solar/solar-system.ts) owns the Three.js light
// resources; this store owns serializable intent only (geoStore convention).
//
// Key modelling decisions (from the validated product spec):
//   • `location.source`/`northSource` are FIRST-CLASS — the UI renders them as
//     badges, and 'default' requires explicit acknowledgement (never silent).
//   • Presets store TIME ONLY (month/day/minutes + moon flag) — they re-resolve
//     against the CURRENT location at apply time, so fixing the location later
//     fixes every saved preset automatically.
//   • Time is stored as a UTC instant; all wall-clock conversions go through
//     sun-math's timezone helpers with the SITE timezone (never the browser's).

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createLogger } from '../lib/logger'

const log = createLogger('SolarStore')

// ── Types ───────────────────────────────────────────────────────────────────────

export type SolarLocationSource = 'ifc' | 'map' | 'manual' | 'default'
export type SolarNorthSource = 'ifc' | 'assumed'
export type SolarQuality = 'standard' | 'high'
export type SolarFollow = 'manual' | 'realtime'

export interface SolarLocation {
  lat: number
  lon: number
  /** Placement yaw in degrees — same value the map compass uses. */
  yawDeg: number
  source: SolarLocationSource
  northSource: SolarNorthSource
}

export interface SolarPreset {
  id: string
  name: string
  /** 1–12. Evergreen: no year stored. */
  month: number
  day: number
  /** Minutes since site-local midnight. */
  minutes: number
  moonOn: boolean
}

// ── localStorage (versioned, defensive — geoStore pattern) ─────────────────────

const LS_QUALITY = 'ifc-solar-quality:v1'
const LS_PRESETS_PREFIX = 'ifc-solar-presets:v1:'
const LS_LOCATION_PREFIX = 'ifc-solar-location:v1:'

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch (e) {
    log.warn(`localStorage write failed for ${key}:`, e)
  }
}

function readQuality(): SolarQuality {
  return lsGet(LS_QUALITY) === 'high' ? 'high' : 'standard'
}

function isPreset(v: unknown): v is SolarPreset {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<SolarPreset>
  return (
    typeof p.id === 'string' && typeof p.name === 'string' &&
    typeof p.month === 'number' && p.month >= 1 && p.month <= 12 &&
    typeof p.day === 'number' && p.day >= 1 && p.day <= 31 &&
    typeof p.minutes === 'number' && p.minutes >= 0 && p.minutes < 1440 &&
    typeof p.moonOn === 'boolean'
  )
}

function readPresets(cacheKey: string): SolarPreset[] {
  const raw = lsGet(LS_PRESETS_PREFIX + cacheKey)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPreset) : []
  } catch {
    return []
  }
}

function writePresets(cacheKey: string, presets: SolarPreset[]): void {
  lsSet(LS_PRESETS_PREFIX + cacheKey, JSON.stringify(presets))
}

/** Manually entered site coordinates, persisted per file (plan D3 rung 3). */
export function saveManualLocation(cacheKey: string, lat: number, lon: number): void {
  lsSet(LS_LOCATION_PREFIX + cacheKey, JSON.stringify({ lat, lon }))
}

export function loadManualLocation(cacheKey: string): { lat: number; lon: number } | null {
  const raw = lsGet(LS_LOCATION_PREFIX + cacheKey)
  if (!raw) return null
  try {
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    const { lat, lon } = p as { lat?: unknown; lon?: unknown }
    if (typeof lat !== 'number' || typeof lon !== 'number') return null
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    return { lat, lon }
  } catch {
    return null
  }
}

// ── Store ───────────────────────────────────────────────────────────────────────

interface SolarStore {
  /** Sun study active (lights driven by the solar system). */
  active: boolean
  panelOpen: boolean
  /** Study instant (UTC ms). */
  timeUTC: number
  /** IANA zone of the SITE (auto via tz-lookup; user-overridable). */
  timeZone: string
  tzOverridden: boolean
  follow: SolarFollow
  moonOn: boolean
  /** Physical sky dome on (session-only). */
  skyOn: boolean
  quality: SolarQuality
  /** Resolved site location + provenance badges. Null until first resolve. */
  location: SolarLocation | null
  presets: SolarPreset[]
  /** Cache key the presets were loaded for (persistence scope). */
  presetsKey: string | null

  setActive: (v: boolean) => void
  setPanelOpen: (v: boolean) => void
  setTimeUTC: (ms: number) => void
  setTimeZone: (tz: string, overridden: boolean) => void
  setFollow: (f: SolarFollow) => void
  setMoonOn: (v: boolean) => void
  setSkyOn: (v: boolean) => void
  setQuality: (q: SolarQuality) => void
  setLocation: (loc: SolarLocation | null) => void
  /** Load the per-file preset list (call when the active model changes). */
  loadPresetsFor: (cacheKey: string | null) => void
  addPreset: (p: SolarPreset) => void
  removePreset: (id: string) => void
  /** Full reset on navigate-to-landing (persisted prefs survive). */
  resetForScene: () => void
}

export const useSolarStore = create<SolarStore>()(
  devtools(
    (set, get) => ({
      active: false,
      panelOpen: false,
      timeUTC: Date.now(),
      timeZone: 'UTC',
      tzOverridden: false,
      follow: 'manual' as SolarFollow,
      moonOn: false,
      skyOn: false,
      quality: readQuality(),
      location: null,
      presets: [],
      presetsKey: null,

      setActive: (v) => set({ active: v }, false, 'setActive'),
      setPanelOpen: (v) => set({ panelOpen: v }, false, 'setPanelOpen'),
      setTimeUTC: (ms) => set({ timeUTC: ms }, false, 'setTimeUTC'),

      setTimeZone: (tz, overridden) =>
        set({ timeZone: tz, tzOverridden: overridden }, false, 'setTimeZone'),

      setFollow: (f) => set({ follow: f }, false, 'setFollow'),
      setMoonOn: (v) => set({ moonOn: v }, false, 'setMoonOn'),
      setSkyOn: (v) => set({ skyOn: v }, false, 'setSkyOn'),

      setQuality: (q) => {
        lsSet(LS_QUALITY, q)
        set({ quality: q }, false, 'setQuality')
      },

      setLocation: (loc) => set({ location: loc }, false, 'setLocation'),

      loadPresetsFor: (cacheKey) =>
        set(
          { presetsKey: cacheKey, presets: cacheKey ? readPresets(cacheKey) : [] },
          false,
          'loadPresetsFor',
        ),

      addPreset: (p) => {
        const s = get()
        const presets = [...s.presets.filter((x) => x.id !== p.id), p]
        if (s.presetsKey) writePresets(s.presetsKey, presets)
        set({ presets }, false, 'addPreset')
      },

      removePreset: (id) => {
        const s = get()
        const presets = s.presets.filter((x) => x.id !== id)
        if (s.presetsKey) writePresets(s.presetsKey, presets)
        set({ presets }, false, 'removePreset')
      },

      resetForScene: () =>
        set(
          {
            active: false,
            panelOpen: false,
            follow: 'manual' as SolarFollow,
            moonOn: false,
            skyOn: false,
            location: null,
            presets: [],
            presetsKey: null,
            tzOverridden: false,
          },
          false,
          'resetForScene',
        ),
    }),
    { name: 'SolarStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ───────────────────────────────────────────────────────────────────

export const selectSolarActive = (s: SolarStore) => s.active
export const selectSolarPanelOpen = (s: SolarStore) => s.panelOpen
export const selectSolarLocation = (s: SolarStore) => s.location
export const selectSolarPresets = (s: SolarStore) => s.presets
