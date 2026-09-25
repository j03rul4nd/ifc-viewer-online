// ─── useGeoController ─────────────────────────────────────────────────────────
// Every action the map panel can take, in one place, shared by both faces of
// the panel (Basic and Advanced) and by the SDK bridge.
//
// This is the logic that used to live inline in GeoPanel.tsx next to 900 lines
// of markup. It moved for two reasons: the two panel modes must drive EXACTLY
// the same code (a preset and the advanced switches cannot be allowed to reach
// the scene by different routes), and a section's markup should be readable
// without scrolling past the placement ladder.
//
// Division of labour, unchanged: geoStore holds product state, the viewer's
// GeoSystem holds GPU state, and this hook is the only thing that talks to
// both. Sections read the store and call these actions — nothing else.

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../../stores/geoStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useValidationStore } from '../../stores/validationStore'
import { useEditorStore } from '../../stores/editorStore'
import { toast } from '../../stores/toastStore'
import { modelRegistry } from '../../lib/model-registry'
import { createLogger } from '../../lib/logger'
import { facilityKindFromTree } from '../../lib/geo/context-suppression'
import { ensureGeorefExtracted } from '../../lib/geo/geo-extract-runner'
import { resolvePlacement, placementFromExtraction, savePlacement } from '../../lib/geo/placement'
import { registerCustomProj4, resolveCrs } from '../../lib/geo/crs'
import { DEFAULT_PROVIDER_ID, resolveProvider, saveCustomProvider } from '../../lib/geo/providers'
import { TERRARIUM_ATTRIBUTION } from '../../lib/geo/elevation'
import { BUILDINGS_ATTRIBUTION, OVERTURE_ATTRIBUTION } from '../../lib/geo/buildings'
import { lowerDetail } from '../../lib/geo/scene-budget'
import { presetById, type ScenePresetId } from '../../lib/geo/scene-presets'
import type { FeatureKind } from '../../lib/geo/osm-features'
import type { BuildingDetail, ContextTone } from '../../lib/geo/building-mesh'
import {
  trackMapModeEnabled, trackMapModeDisabled, trackMapLayerChanged,
  trackMapPlacementSaved, trackMapTerrainToggled, trackMapGeorefExtracted, trackMapError,
} from '../../lib/analytics'
import type { ViewerAPI } from '../../lib/viewer'
import type { GeoSystemAPI } from '../../lib/geo/geo-system'
import type { GeoPlacement, GeorefExtraction, MapProvider, TerrainStyle, TerrainLook } from '../../lib/geo/geo-types'

const log = createLogger('GeoPanel')

/**
 * The sub-flow that owns the panel body, if any. One at a time, by type: the
 * old panel could have the CRS form, the manual form and a terms sheet all
 * "open" at once, and which one you saw depended on render order.
 */
export type GeoFlow =
  | { kind: 'consent' }
  | { kind: 'crs'; epsg: string }
  | { kind: 'manual' }
  | { kind: 'terms' }
  | { kind: 'custom' }

/** The satellite providers, all behind the same terms sheet. */
export const SATELLITE_PROVIDERS = ['esri-imagery', 'eox-s2', 'gibs'] as const

export interface GeoController {
  getGeo: () => Promise<GeoSystemAPI> | null
  /** Run something against the geo system; never throws into React. */
  withGeo: (fn: (geo: GeoSystemAPI) => void | Promise<unknown>) => void
  flow: GeoFlow | null
  setFlow: (f: GeoFlow | null) => void

  // Lifecycle
  showOnMap: () => Promise<void>
  /** Enable at a resolved placement — the step after the georeference ladder. */
  enableWithPlacement: (placement: GeoPlacement, g: GeorefExtraction | null) => Promise<void>
  acceptConsent: () => void
  disable: () => Promise<void>
  applyCrs: (code: string, proj4: string) => Promise<boolean>
  applyManual: (lat: number, lon: number) => Promise<void>

  // Basemap
  selectBasemap: (id: string) => void
  acceptTerms: (id: string) => void
  saveCustomSource: (url: string, attribution: string) => boolean
  switchProviderAfterFailure: () => void

  // Terrain
  toggleTerrain: (enabled: boolean) => void
  setTerrainStyle: (style: TerrainStyle) => void
  setExaggeration: (k: number) => void
  setTerrainLook: (patch: Partial<TerrainLook>) => void
  resetTerrainLook: () => void

  // Surroundings
  toggleBuildings: (enabled: boolean) => Promise<void>
  setFeatureLayer: (kind: FeatureKind, visible: boolean) => void
  setFeatureLayers: (kinds: ReadonlyArray<FeatureKind>, visible: boolean) => void
  setContextDetail: (level: BuildingDetail, opts?: { auto?: boolean }) => void
  setContextTone: (tone: ContextTone) => void
  setSuppressContext: (enabled: boolean) => void
  setVehicles: (enabled: boolean) => void
  applyPreset: (id: ScenePresetId) => void

  // Scene health
  rebuildScene: () => void
  setBudgetLifted: (lifted: boolean) => void
  lowerQuality: () => void
  restoreQuality: () => void

  // Placement
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  beginEditPlacement: () => void
  finishEditPlacement: (apply: boolean) => Promise<void>
  saveGeorefToIfc: () => void
  /** Refresh the attribution pill — the licence obligation follows what is drawn. */
  refreshAttributions: () => Promise<void>
  applyTerrain: (enabled: boolean) => Promise<void>
}

const GeoControllerContext = createContext<GeoController | null>(null)

export const GeoControllerProvider = GeoControllerContext.Provider

export function useGeoCtl(): GeoController {
  const ctl = useContext(GeoControllerContext)
  if (!ctl) throw new Error('useGeoCtl outside GeoControllerProvider')
  return ctl
}

export function useGeoController(viewerApiRef: React.MutableRefObject<ViewerAPI | null>): GeoController {
  const { t } = useTranslation('geo')
  const [flow, setFlow] = useState<GeoFlow | null>(null)
  const enabledAtRef = useRef(0)

  const getGeo = useCallback((): Promise<GeoSystemAPI> | null => {
    const viewer = viewerApiRef.current
    return viewer ? viewer.getGeo() : null
  }, [viewerApiRef])

  const withGeo = useCallback((fn: (geo: GeoSystemAPI) => void | Promise<unknown>): void => {
    const p = getGeo()
    if (!p) return
    // A failed map action is logged, never thrown into a click handler: an
    // unhandled rejection here used to surface as nothing at all, with the
    // control and the scene quietly disagreeing afterwards.
    void p.then(fn).catch((err: unknown) => {
      log.warn('map action failed:', err instanceof Error ? err.message : err)
    })
  }, [getGeo])

  // ── Attributions (provider + terrain + OSM) ──────────────────────────────────
  const refreshAttributions = useCallback(async (): Promise<void> => {
    const geo = await getGeo()
    if (!geo) return
    const s = useGeoStore.getState()
    const list = [...geo.getAttributions()]
    if (s.terrainEnabled && s.terrainStatus === 'ready') list.push(TERRARIUM_ATTRIBUTION)
    // ODbL requires attributing OSM whenever its data is shown, and building
    // footprints are OSM data even when the basemap is someone else's imagery.
    if (s.buildingsEnabled && s.buildingsStatus === 'ready') {
      list.push(BUILDINGS_ATTRIBUTION)
      // Credited only while its footprints are actually drawn. Attribution
      // follows use: a district whose extra buildings all de-duplicated away
      // is drawing nobody's data but OpenStreetMap's.
      if (s.buildingsOverture > 0) list.push(OVERTURE_ATTRIBUTION)
    }
    s.setAttributions(list)
  }, [getGeo])

  // ── Terrain ──────────────────────────────────────────────────────────────────
  const applyTerrain = useCallback(async (enabled: boolean): Promise<void> => {
    const s = useGeoStore.getState()
    const epoch = s.epoch
    s.setTerrainStatus(epoch, enabled ? 'loading' : 'idle')
    try {
      const geo = await getGeo()
      if (!geo) return
      // Sync persisted visual prefs into the geo system BEFORE the build so
      // the patch comes up already styled/exaggerated.
      geo.setTerrainStyle(s.terrainStyle)
      geo.setTerrainExaggeration(s.terrainExaggeration)
      geo.setTerrainLook(s.terrainLook)
      await geo.setTerrain(enabled)
      useGeoStore.getState().setTerrainStatus(epoch, enabled ? 'ready' : 'idle')
      void refreshAttributions()
    } catch {
      useGeoStore.getState().setTerrainStatus(epoch, 'error')
      trackMapError({ stage: 'terrain' })
    }
  }, [getGeo, refreshAttributions])

  const toggleTerrain = useCallback((enabled: boolean): void => {
    useGeoStore.getState().setTerrainEnabled(enabled)
    trackMapTerrainToggled({ enabled })
    if (useGeoStore.getState().mapMode === 'on') void applyTerrain(enabled)
  }, [applyTerrain])

  const setTerrainStyle = useCallback((style: TerrainStyle): void => {
    useGeoStore.getState().setTerrainStyle(style)
    withGeo((geo) => geo.setTerrainStyle(style))
  }, [withGeo])

  const setExaggeration = useCallback((k: number): void => {
    useGeoStore.getState().setTerrainExaggeration(k)
    // The store clamps; the scene gets the clamped value.
    const clamped = useGeoStore.getState().terrainExaggeration
    withGeo((geo) => geo.setTerrainExaggeration(clamped))
  }, [withGeo])

  const setTerrainLook = useCallback((patch: Partial<TerrainLook>): void => {
    useGeoStore.getState().setTerrainLook(patch)
    const look = useGeoStore.getState().terrainLook
    withGeo((geo) => geo.setTerrainLook(look))
  }, [withGeo])

  const resetTerrainLook = useCallback((): void => {
    useGeoStore.getState().resetTerrainLook()
    const look = useGeoStore.getState().terrainLook
    withGeo((geo) => geo.setTerrainLook(look))
  }, [withGeo])

  // ── Surroundings ─────────────────────────────────────────────────────────────

  /**
   * Toggle surrounding OSM buildings. The query can take seconds and can fail
   * (Overpass is a shared public service), so every outcome maps to a distinct
   * status the panel reports rather than a spinner that never resolves.
   */
  const toggleBuildings = useCallback(async (enabled: boolean): Promise<void> => {
    const epoch = useGeoStore.getState().epoch
    useGeoStore.getState().setBuildingsEnabled(enabled)
    if (useGeoStore.getState().mapMode !== 'on') {
      // Map off: this is an intent, applied when the map comes on. There is no
      // query in flight, so the status must not claim one.
      useGeoStore.getState().setBuildingsResult(epoch, { status: 'idle' })
      return
    }
    if (!enabled) {
      // Tell the scene too. Without this the switch reads "off" while the
      // buildings, trees and water are still standing in the viewport.
      withGeo((geo) => geo.setBuildings(false))
      void refreshAttributions()
      return
    }
    try {
      const geo = await getGeo()
      if (!geo) return
      // Push the STICKY preferences into the scene before the first build.
      //
      // The geo system is constructed fresh with hardcoded defaults ('simple',
      // no scenery), while these are persisted and are already rendering as
      // chosen in this panel. Nothing else carries them across, and the setters
      // early-return when the value "has not changed" — so a reload left the
      // detail control reading Showcase while the scene was built simple. That
      // is the failure users describe as "the button doesn't do anything", and
      // it is invisible in tests because the store and the UI agree perfectly.
      const prefs = useGeoStore.getState()
      geo.setContextDetail(prefs.contextDetail)
      geo.setContextTone(prefs.contextTone)
      geo.setVehicles(prefs.vehicles)
      geo.setFeatureLayers(prefs.featureLayers)
      geo.setBudgetOverride(prefs.budgetLifted)
      // Tell the scene WHAT the model is before the first build, so the OSM
      // context yields correctly on the first frame rather than flickering the
      // mapped building on and off again. Read the active model from the store,
      // NOT from a closure: a captured id goes stale the moment the user loads
      // a second model before turning the map on.
      const modelId = useSceneStore.getState().activeModelId
      geo.setContextSuppression({
        enabled: prefs.suppressContext,
        kind: facilityKindFromTree(
          modelId ? useValidationStore.getState().spatialTrees[modelId] : null,
        ),
      })
      // The geo system starts with an empty set, while these were struck out in
      // a previous session and the panel already lists them as hidden.
      geo.setHiddenFeatures(prefs.hiddenFeatures.map((h) => h.id))
      const outcome = await geo.setBuildings(true)
      // 'off' is not a result, it is "this call was superseded" — map mode went
      // down under it, or a later toggle took over. Writing it as 'idle' with
      // zero counts is a claim about the neighbourhood, and a false one.
      if (outcome.status === 'off') return
      useGeoStore.getState().setBuildingsResult(epoch, {
        status: outcome.status,
        counts: outcome.status === 'ready' ? outcome.counts : undefined,
        estimated: outcome.status === 'ready' ? outcome.estimatedCount : 0,
        truncated: outcome.status === 'ready' ? outcome.truncated : false,
        overture: outcome.status === 'ready' ? outcome.overture : 0,
      })
      if (outcome.status === 'error') trackMapError({ stage: 'buildings' })
      void refreshAttributions()
    } catch {
      useGeoStore.getState().setBuildingsResult(epoch, { status: 'error' })
      trackMapError({ stage: 'buildings' })
    }
  }, [getGeo, withGeo, refreshAttributions])

  /** One OSM layer — removed on the spot, or built alone from the cache. */
  const setFeatureLayer = useCallback((kind: FeatureKind, visible: boolean): void => {
    useGeoStore.getState().setFeatureLayer(kind, visible)
    const layers = useGeoStore.getState().featureLayers
    withGeo((geo) => geo.setFeatureLayers(layers))
  }, [withGeo])

  /** A group of layers in one go — one scene update, not one per layer. */
  const setFeatureLayers = useCallback((kinds: ReadonlyArray<FeatureKind>, visible: boolean): void => {
    const s = useGeoStore.getState()
    for (const k of kinds) s.setFeatureLayer(k, visible)
    const layers = useGeoStore.getState().featureLayers
    withGeo((geo) => geo.setFeatureLayers(layers))
  }, [withGeo])

  /** Facade detail — re-extrudes from the cached features, never refetches. */
  const setContextDetail = useCallback((level: BuildingDetail, opts?: { auto?: boolean }): void => {
    const s = useGeoStore.getState()
    s.setContextDetail(level)
    // A level chosen by hand supersedes an automatic step-down: the notice
    // offering the old level back would now be offering something else.
    if (!opts?.auto) s.setAutoDowngrade(null)
    withGeo((geo) => geo.setContextDetail(level))
  }, [withGeo])

  /** How loud the context is — rebuilt from cache. */
  const setContextTone = useCallback((tone: ContextTone): void => {
    useGeoStore.getState().setContextTone(tone)
    withGeo((geo) => geo.setContextTone(tone))
  }, [withGeo])

  /**
   * Whether the OSM context gives way where the model stands. The facility
   * kind is re-read on every toggle: the user can load a bridge after the map
   * is already up, and a stale `building` would leave the mapped deck fighting
   * the modelled one.
   */
  const setSuppressContext = useCallback((enabled: boolean): void => {
    useGeoStore.getState().setSuppressContext(enabled)
    const id = useSceneStore.getState().activeModelId
    const kind = facilityKindFromTree(id ? useValidationStore.getState().spatialTrees[id] : null)
    withGeo((geo) => geo.setContextSuppression({ enabled, kind }))
  }, [withGeo])

  /** Decorative vehicles — built alone from cache. */
  const setVehicles = useCallback((enabled: boolean): void => {
    useGeoStore.getState().setVehicles(enabled)
    withGeo((geo) => geo.setVehicles(enabled))
  }, [withGeo])

  /**
   * Apply a preset by writing the ordinary preferences. Appearance first: the
   * geo system coalesces them into ONE rebuild, which then runs before (or
   * instead of) anything the terrain and surroundings switches trigger.
   */
  const applyPreset = useCallback((id: ScenePresetId): void => {
    const p = presetById(id)
    const s = useGeoStore.getState()
    if (p.buildings) {
      if (s.contextDetail !== p.detail) setContextDetail(p.detail)
      if (s.vehicles !== p.vehicles) setVehicles(p.vehicles)
    }
    if (s.terrainEnabled !== p.terrain) toggleTerrain(p.terrain)
    // Map off, this only records the intent; enabling re-applies it.
    if (s.buildingsEnabled !== p.buildings) void toggleBuildings(p.buildings)
  }, [setContextDetail, setVehicles, toggleTerrain, toggleBuildings])

  // ── Scene health ─────────────────────────────────────────────────────────────
  const rebuildScene = useCallback((): void => {
    withGeo((geo) => geo.rebuildScene())
  }, [withGeo])

  const setBudgetLifted = useCallback((lifted: boolean): void => {
    useGeoStore.getState().setBudgetLifted(lifted)
    withGeo((geo) => geo.setBudgetOverride(lifted))
  }, [withGeo])

  /**
   * One step lighter. Down the detail ladder first; at the bottom, the two
   * layers that are most geometry for least information — trees and furniture.
   */
  const lowerQuality = useCallback((): void => {
    const s = useGeoStore.getState()
    const next = lowerDetail(s.contextDetail)
    if (next) { setContextDetail(next); return }
    const heavy = (['tree', 'furniture'] as const).filter((k) => s.featureLayers[k])
    if (heavy.length > 0) setFeatureLayers(heavy, false)
  }, [setContextDetail, setFeatureLayers])

  const restoreQuality = useCallback((): void => {
    const s = useGeoStore.getState()
    const d = s.autoDowngrade
    if (!d) return
    // The user has seen the trade and chosen the heavier view: never lower this
    // level on their behalf again this session.
    s.blockAutoDowngrade(d.from)
    setContextDetail(d.from)
  }, [setContextDetail])

  // ── Enable / disable ─────────────────────────────────────────────────────────
  const enableWithPlacement = useCallback(async (placement: GeoPlacement, g: GeorefExtraction | null): Promise<void> => {
    const epoch = useGeoStore.getState().startEnable()
    try {
      const geoPromise = getGeo()
      if (!geoPromise) throw new Error('viewer not ready')
      const geo = await geoPromise
      const provider =
        resolveProvider(useGeoStore.getState().baseLayerId) ?? resolveProvider(DEFAULT_PROVIDER_ID)!
      geo.setDegradedCallback((d) => {
        useGeoStore.getState().setDegraded(d)
        if (d) trackMapError({ stage: 'tiles' })
      })
      await geo.enable(placement, provider)
      const s = useGeoStore.getState()
      if (epoch !== s.epoch) { geo.disable(); return } // cancelled mid-flight
      s.setPlacement(placement)
      s.confirmEnabled(epoch)
      enabledAtRef.current = Date.now()
      trackMapModeEnabled({ georef_status: g?.status ?? 'none', source: placement.source })
      void refreshAttributions()
      // Re-apply the persisted toggles. Both survive in the store, so without
      // this the switches come back on over an empty scene and the only way to
      // get the context back is to switch off and on again.
      if (useGeoStore.getState().terrainEnabled) void applyTerrain(true)
      if (useGeoStore.getState().buildingsEnabled) void toggleBuildings(true)
    } catch {
      useGeoStore.getState().fail(epoch, 'errors.enableFailed')
      trackMapError({ stage: 'enable' })
    }
  }, [getGeo, refreshAttributions, applyTerrain, toggleBuildings])

  const showOnMap = useCallback(async (): Promise<void> => {
    const activeModelId = useSceneStore.getState().activeModelId
    if (!activeModelId || !viewerApiRef.current) return
    if (!useGeoStore.getState().consentGiven) { setFlow({ kind: 'consent' }); return }
    setFlow(null)

    const g = await ensureGeorefExtracted(activeModelId)
    trackMapGeorefExtracted({
      status: (g.status === 'extracting' ? 'unknown' : g.status),
      rung: g.rung,
      has_epsg: g.epsgCode !== null,
    })
    const viewer = viewerApiRef.current
    if (!viewer) return
    const cacheKey = modelRegistry.get(activeModelId)?.opfsCacheKey ?? null
    const bounds = viewer.getModelBounds(activeModelId)
    const resolved = resolvePlacement(cacheKey, g, bounds)
    if (resolved.ok) {
      await enableWithPlacement(resolved.value, g)
      return
    }
    if (resolved.error.message === 'unknownCrs') {
      setFlow({ kind: 'crs', epsg: g.epsgCode ?? '' })
      return
    }
    // none / invalid / conversion failures → manual placement flow
    setFlow({ kind: 'manual' })
  }, [viewerApiRef, enableWithPlacement])

  const acceptConsent = useCallback((): void => {
    useGeoStore.getState().setConsent(true)
    setFlow(null)
    void showOnMap()
  }, [showOnMap])

  const disable = useCallback(async (): Promise<void> => {
    const geo = await getGeo()
    geo?.disable()
    useGeoStore.getState().disable()
    if (enabledAtRef.current > 0) {
      trackMapModeDisabled({ duration_s: Math.round((Date.now() - enabledAtRef.current) / 1000) })
      enabledAtRef.current = 0
    }
  }, [getGeo])

  const applyCrs = useCallback(async (codeRaw: string, proj4Raw: string): Promise<boolean> => {
    const activeModelId = useSceneStore.getState().activeModelId
    const viewer = viewerApiRef.current
    if (!activeModelId || !viewer) return false
    const code = codeRaw.trim()
    const proj4 = proj4Raw.trim()
    if (proj4) {
      const reg = registerCustomProj4(code || 'CUSTOM', proj4)
      if (!reg.ok) return false
    } else if (!code || !resolveCrs(code).ok) {
      return false
    }
    const g = useGeoStore.getState().georefByModel[activeModelId]
    if (!g) return false
    const patched: GeorefExtraction = { ...g, epsgCode: code || g.epsgCode }
    const r = placementFromExtraction(patched, viewer.getModelBounds(activeModelId))
    if (!r.ok) return false
    setFlow(null)
    const cacheKey = modelRegistry.get(activeModelId)?.opfsCacheKey
    if (cacheKey) savePlacement(cacheKey, r.value, proj4 || undefined)
    await enableWithPlacement(r.value, patched)
    return true
  }, [viewerApiRef, enableWithPlacement])

  const applyManual = useCallback(async (lat: number, lon: number): Promise<void> => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return
    const placement: GeoPlacement = {
      lat, lon, rotationDeg: 0, heightOffsetM: 0, source: 'manual', confidence: 'approximate',
    }
    setFlow(null)
    const activeModelId = useSceneStore.getState().activeModelId
    const cacheKey = activeModelId ? modelRegistry.get(activeModelId)?.opfsCacheKey : null
    if (cacheKey) {
      savePlacement(cacheKey, placement)
      trackMapPlacementSaved({ source: 'manual' })
    }
    const extraction = activeModelId ? useGeoStore.getState().georefByModel[activeModelId] ?? null : null
    await enableWithPlacement(placement, extraction)
  }, [enableWithPlacement])

  // ── Basemap ──────────────────────────────────────────────────────────────────
  const applyProvider = useCallback((p: MapProvider): void => {
    useGeoStore.getState().setBaseLayer(p.id)
    trackMapLayerChanged({ layer: p.id as Parameters<typeof trackMapLayerChanged>[0]['layer'] })
    if (useGeoStore.getState().mapMode === 'on') {
      withGeo((geo) => {
        geo.setProvider(p)
        void refreshAttributions()
      })
    }
  }, [withGeo, refreshAttributions])

  const selectBasemap = useCallback((id: string): void => {
    if (id === 'satellite') { setFlow({ kind: 'terms' }); return }
    if (id === 'custom') {
      const existing = resolveProvider('custom')
      if (!existing) { setFlow({ kind: 'custom' }); return }
      applyProvider(existing)
      return
    }
    const p = resolveProvider(id)
    if (p) applyProvider(p)
  }, [applyProvider])

  const acceptTerms = useCallback((id: string): void => {
    useGeoStore.getState().acceptTerms(id)
    setFlow(null)
    const p = resolveProvider(id)
    if (p) applyProvider(p)
  }, [applyProvider])

  const saveCustomSource = useCallback((url: string, attribution: string): boolean => {
    const r = saveCustomProvider(url, attribution)
    if (!r.ok) return false
    setFlow(null)
    applyProvider(r.value)
    return true
  }, [applyProvider])

  /**
   * The degraded banner's way out: a provider that is not the one failing.
   * Streets and Topo are the two keyless, terms-free sources, so each is the
   * other's fallback.
   */
  const switchProviderAfterFailure = useCallback((): void => {
    const current = useGeoStore.getState().baseLayerId
    const next = resolveProvider(current === 'osm' ? 'opentopomap' : 'osm')
    if (next) applyProvider(next)
    useGeoStore.getState().setDegraded(false)
  }, [applyProvider])

  // ── Placement editor ─────────────────────────────────────────────────────────
  const beginEditPlacement = useCallback((): void => {
    const p = useGeoStore.getState().placement
    if (!p) return
    useGeoStore.getState().beginEditing(p)
    withGeo((geo) => geo.setEditorPointerLock(true))
  }, [withGeo])

  const finishEditPlacement = useCallback(async (apply: boolean): Promise<void> => {
    const s = useGeoStore.getState()
    const draft = s.draftPlacement
    const geo = await getGeo()
    geo?.setEditorPointerLock(false)
    if (apply && draft) {
      const manual: GeoPlacement = { ...draft, source: 'manual', confidence: 'approximate' }
      s.applyDraft()
      useGeoStore.getState().setPlacement(manual)
      geo?.setPlacement(manual)
      const activeModelId = useSceneStore.getState().activeModelId
      const cacheKey = activeModelId ? modelRegistry.get(activeModelId)?.opfsCacheKey : null
      if (cacheKey) {
        savePlacement(cacheKey, manual)
        trackMapPlacementSaved({ source: 'manual' })
      }
      // Terrain tiles are anchored geographically — rebuild after a move.
      if (s.terrainEnabled) {
        await geo?.setTerrain(false)
        void applyTerrain(true)
      }
    } else {
      s.cancelEditing()
      const original = useGeoStore.getState().placement
      if (original) geo?.setPlacement(original)
    }
  }, [getGeo, applyTerrain])

  // ── Placement → IFC ──────────────────────────────────────────────────────────
  /**
   * Write the current placement into the model's IfcSite as a normal, undoable
   * edit — so it exports with the file instead of living only in this browser.
   * Nothing is written to disk here: it joins the diff stack like a rename, and
   * the user still has to export.
   */
  const saveGeorefToIfc = useCallback((): void => {
    const s = useGeoStore.getState()
    const placement = s.placement
    const activeModelId = useSceneStore.getState().activeModelId
    const g = activeModelId ? s.georefByModel[activeModelId] : null
    if (!placement || !activeModelId || !g?.siteExpressId) return
    useEditorStore.getState().addCommand({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      modelId: activeModelId,
      description: t('placement.saveToIfcDescription'),
      diffs: [{
        type: 'SET_GEOREF',
        expressId: g.siteExpressId,
        lat: placement.lat,
        lon: placement.lon,
        // Only write an elevation we actually know; inventing 0 would claim
        // the site sits at sea level.
        elevationM: g.heightM,
        oldLat: g.lat,
        oldLon: g.lon,
        oldElevationM: g.heightM,
      }],
    })
    toast(t('placement.saveToIfcDone'), 'success')
  }, [t])

  return useMemo<GeoController>(() => ({
    getGeo, withGeo, flow, setFlow,
    showOnMap, enableWithPlacement, acceptConsent, disable, applyCrs, applyManual,
    selectBasemap, acceptTerms, saveCustomSource, switchProviderAfterFailure,
    toggleTerrain, setTerrainStyle, setExaggeration, setTerrainLook, resetTerrainLook,
    toggleBuildings, setFeatureLayer, setFeatureLayers, setContextDetail, setContextTone,
    setSuppressContext, setVehicles, applyPreset,
    rebuildScene, setBudgetLifted, lowerQuality, restoreQuality,
    viewerApiRef, beginEditPlacement, finishEditPlacement,
    saveGeorefToIfc, refreshAttributions, applyTerrain,
  }), [
    getGeo, withGeo, flow,
    showOnMap, enableWithPlacement, acceptConsent, disable, applyCrs, applyManual,
    selectBasemap, acceptTerms, saveCustomSource, switchProviderAfterFailure,
    toggleTerrain, setTerrainStyle, setExaggeration, setTerrainLook, resetTerrainLook,
    toggleBuildings, setFeatureLayer, setFeatureLayers, setContextDetail, setContextTone,
    setSuppressContext, setVehicles, applyPreset,
    rebuildScene, setBudgetLifted, lowerQuality, restoreQuality,
    viewerApiRef, beginEditPlacement, finishEditPlacement,
    saveGeorefToIfc, refreshAttributions, applyTerrain,
  ])
}
