// ─── Geo store ────────────────────────────────────────────────────────────────
// Single source of truth for GIS / Map mode *intent and status*. The geo system
// (src/lib/geo/geo-system.ts) owns the Three.js resources; this store never
// holds Three objects (repo convention: serializable state only).
//
// Async safety — the EPOCH pattern (plan §6.3): every async chain captures
// `epoch` at start and checks it before committing. `disable()` and
// `resetForScene()` bump the epoch, instantly invalidating in-flight work.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createLogger } from '../lib/logger'
import { clampTerrainLook, DEFAULT_TERRAIN_LOOK } from '../lib/geo/terrain-look'
import type { GeoPlacement, GeorefExtraction, MapMode, TerrainStatus, TerrainStyle, TerrainLook } from '../lib/geo/geo-types'

const log = createLogger('GeoStore')

// ── localStorage keys (versioned) ──────────────────────────────────────────────

const LS_CONSENT = 'ifc-geo-consent:v1'
const LS_LAYER   = 'ifc-geo-layer:v1'
const LS_TERMS   = 'ifc-geo-terms:v1'
const LS_TERRAIN_STYLE = 'ifc-geo-terrain-style:v1'
const LS_TERRAIN_EXAGG = 'ifc-geo-terrain-exagg:v1'
const LS_TERRAIN_LOOK  = 'ifc-geo-terrain-look:v1'
const LS_BUILDINGS     = 'ifc-geo-buildings:v1'

function readTerrainStyle(): TerrainStyle {
  const raw = lsGet(LS_TERRAIN_STYLE)
  return raw === 'shaded' || raw === 'hypsometric' || raw === 'slope' || raw === 'ecosystem'
    ? raw : 'imagery'
}

/** Persisted advanced look; anything malformed falls back to the defaults. */
function readTerrainLook(): TerrainLook {
  const raw = lsGet(LS_TERRAIN_LOOK)
  if (!raw) return { ...DEFAULT_TERRAIN_LOOK }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return clampTerrainLook(parsed as Partial<TerrainLook>)
    }
  } catch { /* corrupt — fall through */ }
  return { ...DEFAULT_TERRAIN_LOOK }
}

function readTerrainExaggeration(): number {
  const v = parseFloat(lsGet(LS_TERRAIN_EXAGG) ?? '1')
  return Number.isFinite(v) ? Math.min(3, Math.max(1, v)) : 1
}

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch (e) {
    log.warn(`localStorage write failed for ${key}:`, e)
  }
}

function readTerms(): Record<string, boolean> {
  const raw = lsGet(LS_TERMS)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'boolean') out[k] = v
      }
      return out
    }
  } catch { /* corrupt — fall through to defaults */ }
  return {}
}

// ── Store types ─────────────────────────────────────────────────────────────────

interface GeoStore {
  mapMode: MapMode
  /** i18n key (geo namespace) describing the error state, e.g. 'errors.chunkLoad'. */
  mapErrorKey: string | null
  /** Cancellation token — see header comment. */
  epoch: number
  /** Active base layer provider id (persisted). */
  baseLayerId: string
  /** Per-provider terms acknowledgement (persisted). */
  termsAccepted: Record<string, boolean>
  /** Tile-network consent — shown once before the first tile request (persisted). */
  consentGiven: boolean
  terrainEnabled: boolean
  terrainStatus: TerrainStatus
  /** Terrain visualization style (persisted). */
  terrainStyle: TerrainStyle
  /** Vertical exaggeration ×k, 1–3 (persisted). */
  terrainExaggeration: number
  /** Advanced terrain look (sun, softness, occlusion, detail, contours). */
  terrainLook: TerrainLook
  /** Surrounding OSM buildings toggle (persisted). */
  buildingsEnabled: boolean
  /** Lifecycle of the building fetch, for honest UI states. */
  buildingsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  /** How many buildings are drawn, and how many had guessed heights. */
  buildingsCount: number
  buildingsEstimated: number
  /** True when the query hit its cap — the view is a partial picture. */
  buildingsTruncated: boolean
  georefByModel: Record<string, GeorefExtraction>
  /** EFFECTIVE placement driving the geoRoot transform. */
  placement: GeoPlacement | null
  /** Placement editor active. */
  editing: boolean
  /** Editor working copy; null unless editing. */
  draftPlacement: GeoPlacement | null
  /** Attribution strings of everything currently on screen (license obligation). */
  attributions: string[]
  /** Tile-failure degraded banner. */
  degraded: boolean
  panelOpen: boolean

  // ── Actions ───────────────────────────────────────────────────────────────────
  startEnable: () => number
  confirmEnabled: (epoch: number) => void
  fail: (epoch: number, errorKey: string) => void
  disable: () => void
  setBaseLayer: (id: string) => void
  acceptTerms: (id: string) => void
  setConsent: (v: boolean) => void
  setTerrainEnabled: (v: boolean) => void
  setTerrainStatus: (epoch: number, s: TerrainStatus) => void
  setTerrainStyle: (s: TerrainStyle) => void
  /** Patch-merge the advanced look (clamped + persisted). */
  setTerrainLook: (patch: Partial<TerrainLook>) => void
  /** Restore the shipped look (measured-only: no synthetic detail, no contours). */
  resetTerrainLook: () => void
  setBuildingsEnabled: (v: boolean) => void
  setBuildingsResult: (
    epoch: number,
    result: { status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'; count?: number; estimated?: number; truncated?: boolean },
  ) => void
  setTerrainExaggeration: (k: number) => void
  setGeoref: (modelId: string, g: GeorefExtraction) => void
  removeGeoref: (modelId: string) => void
  setPlacement: (p: GeoPlacement | null) => void
  beginEditing: (fallback: GeoPlacement) => void
  updateDraft: (patch: Partial<GeoPlacement>) => void
  applyDraft: () => void
  cancelEditing: () => void
  setAttributions: (a: string[]) => void
  setDegraded: (v: boolean) => void
  setPanelOpen: (v: boolean) => void
  /** Full reset on navigate-to-landing (parallels sceneStore.clearScene). */
  resetForScene: () => void
}

// ── Store ───────────────────────────────────────────────────────────────────────

export const useGeoStore = create<GeoStore>()(
  devtools(
    (set, get) => ({
      mapMode:        'off' as MapMode,
      mapErrorKey:    null,
      epoch:          0,
      baseLayerId:    lsGet(LS_LAYER) ?? 'osm',
      termsAccepted:  readTerms(),
      consentGiven:   lsGet(LS_CONSENT) === '1',
      terrainEnabled: false,
      terrainStatus:  'idle' as TerrainStatus,
      terrainStyle:   readTerrainStyle(),
      terrainExaggeration: readTerrainExaggeration(),
      terrainLook:    readTerrainLook(),
      buildingsEnabled:   lsGet(LS_BUILDINGS) === '1',
      buildingsStatus:    'idle' as const,
      buildingsCount:     0,
      buildingsEstimated: 0,
      buildingsTruncated: false,
      georefByModel:  {},
      placement:      null,
      editing:        false,
      draftPlacement: null,
      attributions:   [],
      degraded:       false,
      panelOpen:      false,

      startEnable: () => {
        const s = get()
        if (s.mapMode === 'on' || s.mapMode === 'starting') {
          if (import.meta.env.DEV) throw new Error(`[GeoStore] illegal transition: startEnable from '${s.mapMode}'`)
          log.warn(`startEnable ignored from '${s.mapMode}'`)
          return s.epoch
        }
        const epoch = s.epoch + 1
        set({ mapMode: 'starting', mapErrorKey: null, epoch }, false, 'startEnable')
        return epoch
      },

      confirmEnabled: (epoch) =>
        set(
          (s) => {
            if (epoch !== s.epoch || s.mapMode !== 'starting') return s // stale or cancelled
            return { ...s, mapMode: 'on' as MapMode, mapErrorKey: null }
          },
          false,
          'confirmEnabled',
        ),

      fail: (epoch, errorKey) =>
        set(
          (s) => {
            if (epoch !== s.epoch || s.mapMode === 'off') return s // stale
            return { ...s, mapMode: 'error' as MapMode, mapErrorKey: errorKey }
          },
          false,
          'fail',
        ),

      disable: () =>
        set(
          (s) => ({
            ...s,
            mapMode:        'off' as MapMode,
            mapErrorKey:    null,
            epoch:          s.epoch + 1,
            editing:        false,
            draftPlacement: null,
            terrainStatus:  'idle' as TerrainStatus,
            attributions:   [],
            degraded:       false,
          }),
          false,
          'disable',
        ),

      setBaseLayer: (id) => {
        lsSet(LS_LAYER, id)
        set({ baseLayerId: id }, false, 'setBaseLayer')
      },

      acceptTerms: (id) => {
        const next = { ...get().termsAccepted, [id]: true }
        lsSet(LS_TERMS, JSON.stringify(next))
        set({ termsAccepted: next }, false, 'acceptTerms')
      },

      setConsent: (v) => {
        if (v) lsSet(LS_CONSENT, '1')
        set({ consentGiven: v }, false, 'setConsent')
      },

      setTerrainEnabled: (v) =>
        set({ terrainEnabled: v }, false, 'setTerrainEnabled'),

      setTerrainStatus: (epoch, status) =>
        set(
          (s) => (epoch !== s.epoch ? s : { ...s, terrainStatus: status }),
          false,
          'setTerrainStatus',
        ),

      setTerrainStyle: (style) => {
        lsSet(LS_TERRAIN_STYLE, style)
        set({ terrainStyle: style }, false, 'setTerrainStyle')
      },

      setTerrainLook: (patch) =>
        set(
          (s) => {
            const next = clampTerrainLook({ ...s.terrainLook, ...patch })
            lsSet(LS_TERRAIN_LOOK, JSON.stringify(next))
            return { terrainLook: next }
          },
          false,
          'setTerrainLook',
        ),

      setBuildingsEnabled: (v) => {
        lsSet(LS_BUILDINGS, v ? '1' : '0')
        set(
          v
            ? { buildingsEnabled: true, buildingsStatus: 'loading' as const }
            : { buildingsEnabled: false, buildingsStatus: 'idle' as const, buildingsCount: 0, buildingsEstimated: 0, buildingsTruncated: false },
          false,
          'setBuildingsEnabled',
        )
      },

      // Epoch-guarded like every other async result (plan §6.3): a reply that
      // lands after the user disabled map mode must not resurrect state.
      setBuildingsResult: (epoch, result) =>
        set(
          (s) => (epoch !== s.epoch ? s : {
            ...s,
            buildingsStatus: result.status,
            buildingsCount: result.count ?? 0,
            buildingsEstimated: result.estimated ?? 0,
            buildingsTruncated: result.truncated ?? false,
          }),
          false,
          'setBuildingsResult',
        ),

      resetTerrainLook: () => {
        lsSet(LS_TERRAIN_LOOK, JSON.stringify(DEFAULT_TERRAIN_LOOK))
        set({ terrainLook: { ...DEFAULT_TERRAIN_LOOK } }, false, 'resetTerrainLook')
      },

      setTerrainExaggeration: (k) => {
        const clamped = Number.isFinite(k) ? Math.min(3, Math.max(1, k)) : 1
        lsSet(LS_TERRAIN_EXAGG, String(clamped))
        set({ terrainExaggeration: clamped }, false, 'setTerrainExaggeration')
      },

      setGeoref: (modelId, g) =>
        set(
          (s) => ({ georefByModel: { ...s.georefByModel, [modelId]: g } }),
          false,
          'setGeoref',
        ),

      removeGeoref: (modelId) =>
        set(
          (s) => {
            if (!(modelId in s.georefByModel)) return s
            const next = { ...s.georefByModel }
            delete next[modelId]
            return { ...s, georefByModel: next }
          },
          false,
          'removeGeoref',
        ),

      setPlacement: (p) =>
        set({ placement: p }, false, 'setPlacement'),

      beginEditing: (fallback) =>
        set(
          (s) => ({ editing: true, draftPlacement: s.placement ?? fallback }),
          false,
          'beginEditing',
        ),

      updateDraft: (patch) =>
        set(
          (s) => {
            if (!s.editing || !s.draftPlacement) return s
            return { ...s, draftPlacement: { ...s.draftPlacement, ...patch } }
          },
          false,
          'updateDraft',
        ),

      applyDraft: () =>
        set(
          (s) => {
            if (!s.editing || !s.draftPlacement) return s
            return { ...s, placement: s.draftPlacement, editing: false, draftPlacement: null }
          },
          false,
          'applyDraft',
        ),

      cancelEditing: () =>
        set({ editing: false, draftPlacement: null }, false, 'cancelEditing'),

      setAttributions: (a) =>
        set(
          (s) => {
            // Avoid churn re-renders when the list is unchanged.
            if (a.length === s.attributions.length && a.every((v, i) => v === s.attributions[i])) return s
            return { ...s, attributions: a }
          },
          false,
          'setAttributions',
        ),

      setDegraded: (v) =>
        set({ degraded: v }, false, 'setDegraded'),

      setPanelOpen: (v) =>
        set({ panelOpen: v }, false, 'setPanelOpen'),

      resetForScene: () =>
        set(
          (s) => ({
            ...s,
            mapMode:        'off' as MapMode,
            mapErrorKey:    null,
            epoch:          s.epoch + 1,
            terrainEnabled: false,
            terrainStatus:  'idle' as TerrainStatus,
            georefByModel:  {},
            placement:      null,
            editing:        false,
            draftPlacement: null,
            attributions:   [],
            degraded:       false,
            panelOpen:      false,
          }),
          false,
          'resetForScene',
        ),
    }),
    { name: 'GeoStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ───────────────────────────────────────────────────────────────────

export const selectMapMode      = (s: GeoStore) => s.mapMode
export const selectPlacement    = (s: GeoStore) => s.placement
export const selectEditing      = (s: GeoStore) => s.editing
export const selectAttributions = (s: GeoStore) => s.attributions
export const selectBaseLayerId  = (s: GeoStore) => s.baseLayerId
export const selectGeoPanelOpen = (s: GeoStore) => s.panelOpen
