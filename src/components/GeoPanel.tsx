// ─── GeoPanel ─────────────────────────────────────────────────────────────────
// GIS / Map mode UI (plan T16+T17): enable flow with privacy consent, layer
// picker with satellite terms sheet, georeferencing status + reasons, CRS
// picker for unknown EPSG, manual + fine placement editing, terrain toggle,
// degraded banner, and the (legally required) attribution pill.
//
// This component is loaded via React.lazy — it statically imports placement,
// crs (proj4) and the geo runners, which must all stay out of the entry chunk.
// Product state lives in geoStore; GPU state lives in the viewer's GeoSystem.

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../stores/geoStore'
import { useSceneStore } from '../stores/sceneStore'
import { useEditorStore } from '../stores/editorStore'
import { toast } from '../stores/toastStore'
import { modelRegistry } from '../lib/model-registry'
import { ensureGeorefExtracted } from '../lib/geo/geo-extract-runner'
import { resolvePlacement, placementFromExtraction, savePlacement } from '../lib/geo/placement'
import { registerCustomProj4, resolveCrs } from '../lib/geo/crs'
import { DEFAULT_PROVIDER_ID, resolveProvider, saveCustomProvider } from '../lib/geo/providers'
import { TERRARIUM_ATTRIBUTION } from '../lib/geo/elevation'
import { CONTOUR_INTERVALS } from '../lib/geo/terrain-look'
import { BUILDINGS_ATTRIBUTION } from '../lib/geo/buildings'
import { collectModelSites, type ModelInput } from '../lib/geo/model-sites'
import { FEATURE_KINDS, type FeatureKind } from '../lib/geo/osm-features'
import type { BuildingDetail } from '../lib/geo/building-mesh'
import { WGS84_RADIUS, normalizeDeg } from '../lib/geo/geo-math'
import {
  trackMapModeEnabled, trackMapModeDisabled, trackMapLayerChanged,
  trackMapPlacementSaved, trackMapTerrainToggled, trackMapGeorefExtracted, trackMapError,
} from '../lib/analytics'
import type { ViewerAPI } from '../lib/viewer'
import type { GeoSystemAPI } from '../lib/geo/geo-system'
import type { GeoPlacement, GeorefExtraction, MapProvider, TerrainStyle, TerrainLook } from '../lib/geo/geo-types'

interface GeoPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

// Leaflet (~150 kB) loads only when a map surface is actually shown — opening
// the panel to read a georeferencing status must not pay for it.
const PlacementMiniMap = React.lazy(() => import('./PlacementMiniMap'))

/**
 * Where the manual-placement map opens before the user has chosen anything.
 * Deliberately NOT 0,0 (null island reads as a real answer) and deliberately
 * not the device's location, which would need a permission prompt nobody asked
 * for. Barcelona matches the placeholder coordinates already in the inputs.
 */
const MANUAL_FALLBACK = { lat: 41.3851, lon: 2.1734 }

export default function GeoPanel({ viewerApiRef }: GeoPanelProps) {
  const { t } = useTranslation('geo')
  // Reason codes from the extraction ladder and store error keys arrive as
  // plain strings — valid geo-namespace keys by construction, but not provable
  // to the typed t(). The defaultValue overload accepts arbitrary keys (same
  // pattern as ValidationPanel.localizedProfileName).
  const tDynamic = (key: string): string => t(key, { defaultValue: key })
  const store = useGeoStore()
  const activeModelId = useSceneStore((s) => s.activeModelId)

  const [showConsent, setShowConsent] = useState(false)
  const [termsSheetOpen, setTermsSheetOpen] = useState(false)
  const [customFormOpen, setCustomFormOpen] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [customAttr, setCustomAttr] = useState('')
  const [customError, setCustomError] = useState(false)
  const [crsFormOpen, setCrsFormOpen] = useState(false)
  const [crsCode, setCrsCode] = useState('')
  const [crsProj4, setCrsProj4] = useState('')
  const [crsError, setCrsError] = useState(false)
  const [manualFormOpen, setManualFormOpen] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLon, setManualLon] = useState('')
  const [picking, setPicking] = useState(false)
  const [extraction, setExtraction] = useState<GeorefExtraction | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  /**
   * Which group of controls the body is showing. The panel used to stack every
   * group in one column, which meant ~1500px of scroll in a 304px-wide well and
   * no way to know an option existed unless you scrolled onto it. Four tabs make
   * the whole option space visible at a glance and keep each body short.
   */
  const [tab, setTab] = useState<TabId>('base')
  /** Relief sliders are secondary to the style choice — collapsed by default. */
  const [reliefOpen, setReliefOpen] = useState(false)

  const enabledAtRef = useRef(0)

  const getGeo = useCallback((): Promise<GeoSystemAPI> | null => {
    const viewer = viewerApiRef.current
    return viewer ? viewer.getGeo() : null
  }, [viewerApiRef])

  // Keep the local extraction mirror in sync with the store entry.
  const storeExtraction = activeModelId ? store.georefByModel[activeModelId] : undefined
  useEffect(() => { setExtraction(storeExtraction ?? null) }, [storeExtraction])

  // ── Multi-model site picture ─────────────────────────────────────────────────
  // Map mode has one placement (the basemap aligns to one scene origin), but a
  // federated project is several files. This resolves where each loaded model
  // claims to be so the panel can show agreement — or disagreement — honestly.
  const sceneModels = useSceneStore((s) => s.models)
  const georefByModel = store.georefByModel
  const modelSites = useMemo(() => {
    const inputs: ModelInput[] = sceneModels.map((m) => {
      const g = georefByModel[m.id] ?? null
      // Bounds are only needed for grid-coordinate rungs; a failure here simply
      // leaves the model "unlocated", which is exactly what we want to show.
      const bounds = viewerApiRef.current?.getModelBounds(m.id) ?? null
      const resolved = g ? placementFromExtraction(g, bounds) : null
      return {
        modelId: m.id,
        label: m.fileName,
        extraction: g,
        placement: resolved?.ok ? resolved.value : null,
      }
    })
    return collectModelSites(inputs, activeModelId)
    // `store.placement` participates because applying a manual placement should
    // refresh the pins without waiting for another extraction.
  }, [sceneModels, georefByModel, activeModelId, viewerApiRef, store.placement])

  /** Sibling pins (everything located that is not the anchor). */
  const otherPins = useMemo(
    () => modelSites.located
      .filter((s) => !s.anchor)
      .map((s) => ({ id: s.modelId, lat: s.lat!, lon: s.lon!, label: s.label, secondary: true })),
    [modelSites],
  )

  // ── Attributions (provider + terrain) ────────────────────────────────────────
  const refreshAttributions = useCallback(async (): Promise<void> => {
    const geo = await getGeo()
    if (!geo) return
    const s = useGeoStore.getState()
    const list = [...geo.getAttributions()]
    if (s.terrainEnabled && s.terrainStatus === 'ready') list.push(TERRARIUM_ATTRIBUTION)
    // ODbL requires attributing OSM whenever its data is shown, and building
    // footprints are OSM data even when the basemap is someone else's imagery.
    if (s.buildingsEnabled && s.buildingsStatus === 'ready') list.push(BUILDINGS_ATTRIBUTION)
    s.setAttributions(list)
  }, [getGeo])

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
      // Re-apply the persisted toggles. Both survive a reload in localStorage,
      // so without this the checkboxes come back ticked over an empty scene and
      // the only way to get the context back is to untick and tick again.
      if (useGeoStore.getState().terrainEnabled) void applyTerrain(true)
      if (useGeoStore.getState().buildingsEnabled) void handleBuildingsToggle(true)
    } catch {
      useGeoStore.getState().fail(epoch, 'errors.enableFailed')
      trackMapError({ stage: 'enable' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getGeo, refreshAttributions])

  const handleShowOnMap = useCallback(async (): Promise<void> => {
    if (!activeModelId || !viewerApiRef.current) return
    if (!useGeoStore.getState().consentGiven) { setShowConsent(true); return }
    setManualFormOpen(false)
    setCrsFormOpen(false)

    const g = await ensureGeorefExtracted(activeModelId)
    trackMapGeorefExtracted({
      status: (g.status === 'extracting' ? 'unknown' : g.status),
      rung: g.rung,
      has_epsg: g.epsgCode !== null,
    })
    const cacheKey = modelRegistry.get(activeModelId)?.opfsCacheKey ?? null
    const bounds = viewerApiRef.current.getModelBounds(activeModelId)
    const resolved = resolvePlacement(cacheKey, g, bounds)
    if (resolved.ok) {
      await enableWithPlacement(resolved.value, g)
      return
    }
    if (resolved.error.message === 'unknownCrs') {
      setCrsCode(g.epsgCode ?? '')
      setCrsFormOpen(true)
      return
    }
    // none / invalid / conversion failures → manual placement flow
    setManualFormOpen(true)
  }, [activeModelId, viewerApiRef, enableWithPlacement])

  const handleDisable = useCallback(async (): Promise<void> => {
    const geo = await getGeo()
    geo?.disable()
    useGeoStore.getState().disable()
    if (enabledAtRef.current > 0) {
      trackMapModeDisabled({ duration_s: Math.round((Date.now() - enabledAtRef.current) / 1000) })
      enabledAtRef.current = 0
    }
  }, [getGeo])

  // ── CRS picker submit ────────────────────────────────────────────────────────
  const handleCrsApply = useCallback(async (): Promise<void> => {
    if (!activeModelId || !viewerApiRef.current) return
    setCrsError(false)
    const code = crsCode.trim()
    if (crsProj4.trim()) {
      const reg = registerCustomProj4(code || 'CUSTOM', crsProj4.trim())
      if (!reg.ok) { setCrsError(true); return }
    } else if (!code || !resolveCrs(code).ok) {
      setCrsError(true)
      return
    }
    const g = useGeoStore.getState().georefByModel[activeModelId]
    if (!g) return
    const patched: GeorefExtraction = { ...g, epsgCode: code || g.epsgCode }
    const bounds = viewerApiRef.current.getModelBounds(activeModelId)
    const r = placementFromExtraction(patched, bounds)
    if (!r.ok) { setCrsError(true); return }
    setCrsFormOpen(false)
    const cacheKey = modelRegistry.get(activeModelId)?.opfsCacheKey
    if (cacheKey) savePlacement(cacheKey, r.value, crsProj4.trim() || undefined)
    await enableWithPlacement(r.value, patched)
  }, [activeModelId, viewerApiRef, crsCode, crsProj4, enableWithPlacement])

  // ── Manual placement submit ──────────────────────────────────────────────────
  const handleManualApply = useCallback(async (): Promise<void> => {
    const lat = parseFloat(manualLat)
    const lon = parseFloat(manualLon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return
    const placement: GeoPlacement = {
      lat, lon, rotationDeg: 0, heightOffsetM: 0, source: 'manual', confidence: 'approximate',
    }
    setManualFormOpen(false)
    const cacheKey = activeModelId ? modelRegistry.get(activeModelId)?.opfsCacheKey : null
    if (cacheKey) {
      savePlacement(cacheKey, placement)
      trackMapPlacementSaved({ source: 'manual' })
    }
    await enableWithPlacement(placement, extraction)
  }, [manualLat, manualLon, activeModelId, enableWithPlacement, extraction])

  // ── Layers ───────────────────────────────────────────────────────────────────
  const applyProvider = useCallback(async (p: MapProvider): Promise<void> => {
    useGeoStore.getState().setBaseLayer(p.id)
    trackMapLayerChanged({ layer: p.id as Parameters<typeof trackMapLayerChanged>[0]['layer'] })
    if (useGeoStore.getState().mapMode === 'on') {
      const geo = await getGeo()
      geo?.setProvider(p)
      void refreshAttributions()
    }
  }, [getGeo, refreshAttributions])

  const handleLayerClick = useCallback((id: string): void => {
    if (id === 'satellite') { setTermsSheetOpen(true); return }
    if (id === 'custom') {
      const existing = resolveProvider('custom')
      if (!existing) { setCustomFormOpen(true); return }
      void applyProvider(existing)
      return
    }
    const p = resolveProvider(id)
    if (p) void applyProvider(p)
  }, [applyProvider])

  const handleTermsAccept = useCallback((id: string): void => {
    useGeoStore.getState().acceptTerms(id)
    setTermsSheetOpen(false)
    const p = resolveProvider(id)
    if (p) void applyProvider(p)
  }, [applyProvider])

  const handleCustomSave = useCallback((): void => {
    const r = saveCustomProvider(customUrl, customAttr)
    if (!r.ok) { setCustomError(true); return }
    setCustomError(false)
    setCustomFormOpen(false)
    void applyProvider(r.value)
  }, [customUrl, customAttr, applyProvider])

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

  const handleTerrainToggle = useCallback((enabled: boolean): void => {
    useGeoStore.getState().setTerrainEnabled(enabled)
    trackMapTerrainToggled({ enabled })
    if (useGeoStore.getState().mapMode === 'on') void applyTerrain(enabled)
  }, [applyTerrain])

  const handleTerrainStyle = useCallback((style: TerrainStyle): void => {
    useGeoStore.getState().setTerrainStyle(style)
    void getGeo()?.then((geo) => geo.setTerrainStyle(style))
  }, [getGeo])

  const handleTerrainExaggeration = useCallback((k: number): void => {
    useGeoStore.getState().setTerrainExaggeration(k)
    void getGeo()?.then((geo) => geo.setTerrainExaggeration(k))
  }, [getGeo])

  /**
   * Write the current placement into the model's IfcSite as a normal, undoable
   * edit — so it exports with the file instead of living only in this browser.
   * Nothing is written to disk here: it joins the diff stack like a rename, and
   * the user still has to export.
   */
  const handleSaveGeorefToIfc = useCallback((): void => {
    const placement = useGeoStore.getState().placement
    const g = activeModelId ? useGeoStore.getState().georefByModel[activeModelId] : null
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
  }, [activeModelId, t])

  /**
   * Toggle surrounding OSM buildings. The query can take seconds and can fail
   * (Overpass is a shared public service), so every outcome maps to a distinct
   * status the panel reports rather than a spinner that never resolves.
   */
  const handleBuildingsToggle = useCallback(async (enabled: boolean): Promise<void> => {
    const epoch = useGeoStore.getState().epoch
    useGeoStore.getState().setBuildingsEnabled(enabled)
    if (!enabled) {
      // Tell the scene too. Without this the checkbox reads "off" while the
      // buildings, trees and water are still standing in the viewport — the
      // control and what you can see disagree until the next enable rebuilds.
      void getGeo()?.then((geo) => geo.setBuildings(false))
      return
    }
    try {
      const geo = await getGeo()
      if (!geo) return
      const outcome = await geo.setBuildings(true)
      useGeoStore.getState().setBuildingsResult(epoch, {
        status: outcome.status === 'off' ? 'idle' : outcome.status,
        counts: outcome.status === 'ready' ? outcome.counts : undefined,
        estimated: outcome.status === 'ready' ? outcome.estimatedCount : 0,
        truncated: outcome.status === 'ready' ? outcome.truncated : false,
      })
      if (outcome.status === 'error') trackMapError({ stage: 'buildings' })
      void refreshAttributions()
    } catch {
      useGeoStore.getState().setBuildingsResult(epoch, { status: 'error' })
      trackMapError({ stage: 'buildings' })
    }
  }, [getGeo, refreshAttributions])

  /** Toggle one OSM layer — instant, rebuilt from the cached features. */
  const handleFeatureLayer = useCallback((kind: FeatureKind, visible: boolean): void => {
    useGeoStore.getState().setFeatureLayer(kind, visible)
    const layers = useGeoStore.getState().featureLayers
    void getGeo()?.then((geo) => geo.setFeatureLayers(layers))
  }, [getGeo])

  /** Facade detail — re-extrudes from the cached features, so it is instant. */
  const handleContextDetail = useCallback((level: BuildingDetail): void => {
    useGeoStore.getState().setContextDetail(level)
    void getGeo()?.then((geo) => geo.setContextDetail(level))
  }, [getGeo])

  const handleTerrainLook = useCallback((patch: Partial<TerrainLook>): void => {
    useGeoStore.getState().setTerrainLook(patch)
    const look = useGeoStore.getState().terrainLook
    void getGeo()?.then((geo) => geo.setTerrainLook(look))
  }, [getGeo])

  const handleResetLook = useCallback((): void => {
    useGeoStore.getState().resetTerrainLook()
    const look = useGeoStore.getState().terrainLook
    void getGeo()?.then((geo) => geo.setTerrainLook(look))
  }, [getGeo])

  // ── Placement editor ─────────────────────────────────────────────────────────
  const beginEdit = useCallback(async (): Promise<void> => {
    const p = useGeoStore.getState().placement
    if (!p) return
    useGeoStore.getState().beginEditing(p)
    const geo = await getGeo()
    geo?.setEditorPointerLock(true)
  }, [getGeo])

  // Live-apply draft changes to the scene while editing.
  const { editing, draftPlacement } = store
  useEffect(() => {
    if (!editing || !draftPlacement) return
    void getGeo()?.then((geo) => { if (useGeoStore.getState().editing) geo.setPlacement(draftPlacement) })
  }, [editing, draftPlacement, getGeo])

  const finishEdit = useCallback(async (apply: boolean): Promise<void> => {
    const s = useGeoStore.getState()
    const draft = s.draftPlacement
    setPicking(false)
    const geo = await getGeo()
    geo?.setEditorPointerLock(false)
    if (apply && draft) {
      const manual: GeoPlacement = { ...draft, source: 'manual', confidence: 'approximate' }
      s.applyDraft()
      useGeoStore.getState().setPlacement(manual)
      geo?.setPlacement(manual)
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
  }, [getGeo, activeModelId, applyTerrain])

  // Pick-on-map: one quick click places the draft (no drag conflicts with orbit).
  useEffect(() => {
    if (!picking) return
    let downX = 0, downY = 0
    const onDown = (e: PointerEvent): void => { downX = e.clientX; downY = e.clientY }
    const onUp = (e: PointerEvent): void => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return
      if (!(e.target instanceof HTMLCanvasElement)) return
      void getGeo()?.then((geo) => {
        const hit = geo.pickGround(e.clientX, e.clientY)
        if (hit) {
          useGeoStore.getState().updateDraft({ lat: hit.lat, lon: hit.lon })
          setPicking(false)
        }
      })
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPicking(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [picking, getGeo])

  const nudgeDraft = useCallback((dEastM: number, dNorthM: number): void => {
    const draft = useGeoStore.getState().draftPlacement
    if (!draft) return
    useGeoStore.getState().updateDraft({
      lat: draft.lat + (dNorthM / WGS84_RADIUS) * RAD,
      lon: draft.lon + (dEastM / (WGS84_RADIUS * Math.cos(draft.lat * DEG))) * RAD,
    })
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────────

  const { mapMode, panelOpen } = store
  const mapOn = mapMode === 'on'
  const layerKindActive = (id: string): boolean => store.baseLayerId === id
  const satelliteActive = ['esri-imagery', 'eox-s2', 'gibs'].includes(store.baseLayerId)

  /**
   * A blocking step the user has to answer before the map can come on. It takes
   * over the whole body: burying "we need a coordinate system" inside a tab is
   * how the old panel left people staring at a button that appeared to do
   * nothing.
   */
  const blockingStep: 'crs' | 'manual' | null =
    crsFormOpen ? 'crs' : manualFormOpen ? 'manual' : null

  /** A sheet owned by the Basemap tab (provider terms / custom tile URL). */
  const baseSheet: 'terms' | 'custom' | null =
    termsSheetOpen ? 'terms' : customFormOpen ? 'custom' : null

  const visibleLayerCount = FEATURE_KINDS.filter((k) => store.featureLayers[k]).length

  // Badges tell each tab to speak for itself, so nothing has to be opened just
  // to find out whether anything in it is on.
  const TABS: { id: TabId; label: string; badge?: string; dot?: boolean }[] = [
    { id: 'base',    label: t('panel.tabs.base') },
    { id: 'terrain', label: t('panel.tabs.terrain'), dot: store.terrainEnabled },
    {
      id: 'context',
      label: t('panel.tabs.context'),
      dot: store.buildingsEnabled,
      // Only when something is hidden: "5/5" is noise that also squeezes the
      // label, while "3/5" is the one fact you cannot see from the outside.
      badge: store.buildingsEnabled && store.buildingsStatus === 'ready'
        && visibleLayerCount < FEATURE_KINDS.length
        ? `${visibleLayerCount}/${FEATURE_KINDS.length}` : undefined,
    },
    { id: 'place',   label: t('panel.tabs.place'), dot: mapOn && !!store.placement },
  ]

  /** One-line answer to "where am I and is this thing on?". */
  const summary = mapOn && store.placement
    ? `${store.placement.lat.toFixed(4)}, ${store.placement.lon.toFixed(4)} · ${normalizeDeg(store.placement.rotationDeg).toFixed(0)}°`
    : null

  return (
    <>
      {/* Attribution pill — must stay visible whenever the map is on (license). */}
      {mapMode === 'on' && store.attributions.length > 0 && (
        <div
          className="absolute bottom-2 right-2 z-20 pointer-events-auto max-w-[60%] px-2 py-1 rounded-[6px] text-[9.5px] leading-tight text-[var(--text-dim)] bg-[rgba(10,10,14,0.72)] border border-[var(--border)]"
          data-testid="geo-attribution"
        >
          {store.attributions.join(' · ')}
        </div>
      )}

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
            className="absolute right-3 top-14 z-20 pointer-events-auto select-none"
            style={{ width: 'min(332px, calc(100vw - 24px))' }}
          >
            {/* Column layout, not one long scroller: header, action and tabs are
                pinned, and ONLY the active tab body scrolls. */}
            <div className="glass-md border border-[var(--border-strong)] rounded-[12px] overflow-hidden shadow-2xl flex flex-col max-h-[calc(100vh-140px)]">

              {/* ── Header ────────────────────────────────────────────────── */}
              <div className={`${SECTION_X} pt-2.5 pb-2 flex items-center gap-2 shrink-0`}>
                <span className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">
                  {t('panel.title')}
                </span>
                <ModeChip mode={mapMode} label={t(`panel.mode.${mapOn ? 'on' : mapMode === 'starting' ? 'starting' : mapMode === 'error' ? 'error' : 'off'}`)} />
                <button
                  onClick={() => store.setPanelOpen(false)}
                  className="ml-auto -mr-1 p-1 rounded-[6px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                  title={t('panel.close')}
                  aria-label={t('panel.close')}
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l10 10M12 2L2 12"/>
                  </svg>
                </button>
              </div>

              {/* ── Primary action — pinned, so it never scrolls out of reach ── */}
              <div className={`${SECTION_X} pb-2.5 flex flex-col gap-1.5 shrink-0`}>
                {!mapOn ? (
                  <button
                    onClick={() => { void handleShowOnMap() }}
                    disabled={!activeModelId || mapMode === 'starting'}
                    className="w-full h-[34px] rounded-[9px] text-[12.5px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40 hover:brightness-110 active:scale-[0.99] transition-all"
                  >
                    {mapMode === 'starting' ? t('enable.starting') : t('enable.show')}
                  </button>
                ) : (
                  <button
                    onClick={() => { void handleDisable() }}
                    className="w-full h-[34px] rounded-[9px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-[0.99] transition-all"
                  >
                    {t('enable.hide')}
                  </button>
                )}

                {summary && (
                  <div className="text-[10px] font-mono tabular-nums text-[var(--text-faint)] truncate" title={summary}>
                    {summary}
                  </div>
                )}
                {!activeModelId && (
                  <div className="text-[10.5px] text-[var(--text-faint)] leading-snug">{t('enable.noModel')}</div>
                )}
                {mapMode === 'error' && (
                  <Notice tone="danger">{tDynamic(store.mapErrorKey ?? 'errors.enableFailed')}</Notice>
                )}
                {store.degraded && <Notice tone="danger">{t('degraded.banner')}</Notice>}
              </div>

              {/* ── Body ──────────────────────────────────────────────────── */}
              {blockingStep ? (
                /* One question at a time, full width, with a way back out. */
                <div className="border-t border-[var(--border)] flex-1 overflow-y-auto">
                  {blockingStep === 'crs' && (
                    <Sheet
                      title={t('crs.title')}
                      onBack={() => setCrsFormOpen(false)}
                      backLabel={t('panel.back')}
                    >
                      <p className="text-[10.5px] text-[var(--text-dim)] leading-snug">
                        {t('crs.body', { name: extraction?.epsgCode ?? '?' })}
                      </p>
                      <Field label={t('crs.epsgLabel')}>
                        <input value={crsCode} onChange={(e) => setCrsCode(e.target.value)} placeholder={t('crs.epsgPlaceholder')} className="geo-input" />
                      </Field>
                      <Field label={t('crs.proj4Label')}>
                        <input value={crsProj4} onChange={(e) => setCrsProj4(e.target.value)} placeholder={t('crs.proj4Placeholder')} className="geo-input" />
                      </Field>
                      {crsError && <Notice tone="danger">{t('crs.invalid')}</Notice>}
                      <button onClick={() => { void handleCrsApply() }} className="h-[30px] rounded-[8px] text-[11.5px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 transition-all">
                        {t('crs.apply')}
                      </button>
                      {/* Not knowing the CRS must not be a dead end. */}
                      <button
                        onClick={() => { setCrsFormOpen(false); setManualFormOpen(true) }}
                        className="self-start text-[11px] text-[var(--accent)] hover:underline underline-offset-2"
                      >
                        {t('placement.manualShow')}
                      </button>
                    </Sheet>
                  )}

                  {blockingStep === 'manual' && (
                    <Sheet
                      title={t('placement.manualShow')}
                      onBack={() => setManualFormOpen(false)}
                      backLabel={t('panel.back')}
                    >
                      <p className="text-[10.5px] text-[var(--text-dim)] leading-snug">{t('placement.manualIntro')}</p>

                      {/* Pick on a real map instead of guessing two numbers. Gated
                          on the same consent as 3D map mode — it fetches tiles. */}
                      {store.consentGiven && (
                        <Suspense fallback={<div className="h-[150px] rounded-[8px] bg-[var(--surface-2)]" />}>
                          <PlacementMiniMap
                            lat={Number.isFinite(parseFloat(manualLat)) ? parseFloat(manualLat) : MANUAL_FALLBACK.lat}
                            lon={Number.isFinite(parseFloat(manualLon)) ? parseFloat(manualLon) : MANUAL_FALLBACK.lon}
                            onChange={(la, lo) => {
                              setManualLat(la.toFixed(6))
                              setManualLon(lo.toFixed(6))
                            }}
                            otherPins={otherPins}
                          />
                        </Suspense>
                      )}

                      <div className="flex gap-1.5">
                        <Field label={t('placement.lat')} className="flex-1 min-w-0">
                          <input value={manualLat} onChange={(e) => setManualLat(e.target.value)} placeholder="41.3851" inputMode="decimal" className="geo-input" />
                        </Field>
                        <Field label={t('placement.lon')} className="flex-1 min-w-0">
                          <input value={manualLon} onChange={(e) => setManualLon(e.target.value)} placeholder="2.1734" inputMode="decimal" className="geo-input" />
                        </Field>
                      </div>
                      <button
                        onClick={() => { void handleManualApply() }}
                        disabled={!Number.isFinite(parseFloat(manualLat)) || !Number.isFinite(parseFloat(manualLon))}
                        className="h-[30px] rounded-[8px] text-[11.5px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40 hover:brightness-110 transition-all"
                      >
                        {t('enable.show')}
                      </button>
                    </Sheet>
                  )}
                </div>
              ) : (
                <>
                  {/* ── Tabs ────────────────────────────────────────────────── */}
                  <div
                    role="tablist"
                    aria-label={t('panel.title')}
                    className={`${SECTION_X} flex gap-0.5 border-b border-[var(--border)] shrink-0`}
                    onKeyDown={(e) => {
                      const i = TABS.findIndex((x) => x.id === tab)
                      if (e.key === 'ArrowRight') { e.preventDefault(); setTab(TABS[(i + 1) % TABS.length].id) }
                      if (e.key === 'ArrowLeft')  { e.preventDefault(); setTab(TABS[(i - 1 + TABS.length) % TABS.length].id) }
                    }}
                  >
                    {TABS.map((x) => (
                      <button
                        key={x.id}
                        role="tab"
                        id={`geo-tab-${x.id}`}
                        aria-selected={tab === x.id}
                        aria-controls={`geo-panel-${x.id}`}
                        tabIndex={tab === x.id ? 0 : -1}
                        onClick={() => setTab(x.id)}
                        className={[
                          'relative flex-1 min-w-0 pt-1.5 pb-2 px-0.5 text-[10px] font-medium leading-tight',
                          'transition-colors rounded-t-[6px]',
                          tab === x.id
                            ? 'text-[var(--text)]'
                            : 'text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)]',
                        ].join(' ')}
                      >
                        <span className="flex items-center justify-center gap-[3px] min-w-0">
                          <span className="truncate">{x.label}</span>
                          {x.badge
                            ? <span className="shrink-0 font-mono text-[9px] text-[var(--text-faint)] tabular-nums">{x.badge}</span>
                            : x.dot
                              ? <span className="shrink-0 w-[5px] h-[5px] rounded-full bg-[var(--accent)]" />
                              : null}
                        </span>
                        {tab === x.id && (
                          <motion.span
                            layoutId="geo-tab-underline"
                            className="absolute left-1 right-1 -bottom-px h-[2px] rounded-full bg-[var(--accent)]"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          />
                        )}
                      </button>
                    ))}
                  </div>

                  <div
                    role="tabpanel"
                    id={`geo-panel-${tab}`}
                    aria-labelledby={`geo-tab-${tab}`}
                    className="flex-1 overflow-y-auto overscroll-contain"
                  >
                    {/* ── Basemap ─────────────────────────────────────────── */}
                    {tab === 'base' && (
                      baseSheet === 'terms' ? (
                        <Sheet title={t('layers.termsTitle')} onBack={() => setTermsSheetOpen(false)} backLabel={t('panel.back')}>
                          <p className="text-[10px] text-[var(--text-dim)] leading-snug">{t('layers.termsBody')}</p>
                          {[
                            { id: 'esri-imagery', note: t('layers.esriNote') },
                            { id: 'eox-s2', note: t('layers.eoxNote') },
                            { id: 'gibs', note: t('layers.gibsNote') },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => handleTermsAccept(opt.id)}
                              className="text-left px-2.5 py-2 rounded-[8px] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
                            >
                              <div className="text-[10.5px] leading-snug text-[var(--text-dim)]">{opt.note}</div>
                              <div className="text-[10px] text-[var(--accent)] mt-0.5">{t('layers.accept')}</div>
                            </button>
                          ))}
                        </Sheet>
                      ) : baseSheet === 'custom' ? (
                        <Sheet title={t('layers.customTitle')} onBack={() => setCustomFormOpen(false)} backLabel={t('panel.back')}>
                          <Field label={t('layers.customUrl')}>
                            <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder={t('layers.customUrlPlaceholder')} className="geo-input" />
                          </Field>
                          <Field label={t('layers.customAttribution')}>
                            <input value={customAttr} onChange={(e) => setCustomAttr(e.target.value)} className="geo-input" />
                          </Field>
                          {customError && <Notice tone="danger">{t('layers.customInvalid')}</Notice>}
                          <button onClick={handleCustomSave} className="h-[30px] rounded-[8px] text-[11.5px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 transition-all">
                            {t('layers.customSave')}
                          </button>
                        </Sheet>
                      ) : (
                        <Group>
                          <Choices
                            options={[
                              { id: 'osm', label: t('layers.streets'), active: layerKindActive('osm') },
                              { id: 'opentopomap', label: t('layers.topo'), active: layerKindActive('opentopomap') },
                              { id: 'satellite', label: t('layers.satellite'), active: satelliteActive },
                              { id: 'custom', label: t('layers.custom'), active: layerKindActive('custom') },
                            ]}
                            onSelect={handleLayerClick}
                          />
                        </Group>
                      )
                    )}

                    {/* ── Terrain ─────────────────────────────────────────── */}
                    {tab === 'terrain' && (
                      <Group>
                        <SwitchRow
                          label={t('layers.terrain')}
                          checked={store.terrainEnabled}
                          onChange={handleTerrainToggle}
                          busy={store.terrainStatus === 'loading'}
                          note={
                            store.terrainStatus === 'loading' ? t('layers.terrainLoading')
                            : store.terrainStatus === 'error' ? t('errors.terrainFailed')
                            : undefined
                          }
                          tone={store.terrainStatus === 'error' ? 'danger' : 'muted'}
                        />

                        {!store.terrainEnabled && (
                          <p className="text-[10px] text-[var(--text-faint)] leading-snug">
                            {t('panel.terrainHint')}
                          </p>
                        )}

                        {store.terrainEnabled && (
                          <>
                            <Caption>{t('layers.style')}</Caption>
                            <Choices
                              options={([
                                ['imagery', t('layers.styleImagery')],
                                ['shaded', t('layers.styleShaded')],
                                ['hypsometric', t('layers.styleHypso')],
                                ['slope', t('layers.styleSlope')],
                                ['ecosystem', t('layers.styleEcosystem')],
                              ] as const).map(([id, label]) => ({ id, label, active: store.terrainStyle === id }))}
                              onSelect={handleTerrainStyle}
                            />
                            {/* This style INFERS vegetation belts from altitude — it is
                                not observed land cover, and must never be read as such. */}
                            {store.terrainStyle === 'ecosystem' && (
                              <Notice tone="warn">{t('layers.styleEcosystemNote')}</Notice>
                            )}

                            <LookSlider
                              label={t('layers.exaggeration')}
                              value={store.terrainExaggeration}
                              min={1} max={3} step={0.25}
                              format={(v) => `×${v}`}
                              onChange={handleTerrainExaggeration}
                            />

                            {/* Everything below re-bakes from data already in
                                memory — dragging a slider is instant, no refetch. */}
                            <Expander
                              open={reliefOpen}
                              onToggle={() => setReliefOpen((v) => !v)}
                              label={t('layers.advancedRelief')}
                            >
                              <LookSlider label={t('layers.sunAzimuth')} value={store.terrainLook.sunAzimuth} min={0} max={359} step={5} format={(v) => `${v}°`} onChange={(v) => handleTerrainLook({ sunAzimuth: v })} />
                              <LookSlider label={t('layers.sunAltitude')} value={store.terrainLook.sunAltitude} min={5} max={90} step={5} format={(v) => `${v}°`} onChange={(v) => handleTerrainLook({ sunAltitude: v })} />
                              <LookSlider label={t('layers.softness')} value={store.terrainLook.softness} min={0} max={1} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => handleTerrainLook({ softness: v })} />
                              <LookSlider label={t('layers.occlusion')} value={store.terrainLook.occlusion} min={0} max={1} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => handleTerrainLook({ occlusion: v })} />
                              <LookSlider label={t('layers.detail')} value={store.terrainLook.detail} min={0} max={1} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => handleTerrainLook({ detail: v })} />
                              {/* Non-negotiable: invented geometry must say so. */}
                              {store.terrainLook.detail > 0 && (
                                <Notice tone="warn">{t('layers.detailWarning')}</Notice>
                              )}

                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-[var(--text-faint)] w-[54px] shrink-0">
                                  {t('layers.contours')}
                                </span>
                                <select
                                  value={store.terrainLook.contourInterval}
                                  onChange={(e) => handleTerrainLook({ contourInterval: parseFloat(e.target.value) })}
                                  className="flex-1 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-[6px] px-1.5 h-[24px] text-[10.5px] outline-none focus:border-[var(--accent)]"
                                >
                                  {CONTOUR_INTERVALS.map((m) => (
                                    <option key={m} value={m}>{m === 0 ? t('layers.contoursOff') : `${m} m`}</option>
                                  ))}
                                </select>
                              </div>

                              <button
                                onClick={handleResetLook}
                                className="self-start text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] underline underline-offset-2"
                              >
                                {t('layers.resetRelief')}
                              </button>
                            </Expander>

                            {store.terrainStatus === 'ready' && (
                              <p className="text-[9.5px] text-[var(--text-faint)] leading-snug pt-1">
                                {t('attribution.vertical')}
                              </p>
                            )}
                          </>
                        )}
                      </Group>
                    )}

                    {/* ── Surroundings ────────────────────────────────────── */}
                    {tab === 'context' && (
                      <Group>
                        {!mapOn && <Notice tone="muted">{t('panel.mapOff')}</Notice>}

                        <SwitchRow
                          label={t('layers.buildings')}
                          checked={store.buildingsEnabled}
                          onChange={(v) => { void handleBuildingsToggle(v) }}
                          disabled={!mapOn}
                          busy={store.buildingsStatus === 'loading'}
                          note={
                            store.buildingsStatus === 'loading' ? t('layers.buildingsLoading')
                            : store.buildingsStatus === 'error' ? t('layers.buildingsFailed')
                            : store.buildingsStatus === 'empty' ? t('layers.buildingsEmpty')
                            : store.buildingsEnabled && store.buildingsStatus === 'ready'
                              ? t('layers.buildingsCount', { count: store.buildingsCounts.building })
                                + (store.buildingsEstimated > 0
                                  ? ` · ${t('layers.buildingsEstimated', { count: store.buildingsEstimated })}`
                                  : '')
                              : undefined
                          }
                          tone={store.buildingsStatus === 'error' ? 'danger' : 'muted'}
                        />
                        {store.buildingsTruncated && <Notice tone="warn">{t('layers.buildingsTruncated')}</Notice>}

                        {/* How much of a facade to model. Re-extrudes from the
                            features already in memory — no refetch. */}
                        <Caption>{t('layers.facadeDetail')}</Caption>
                        <Choices
                          options={([
                            ['simple', t('layers.facadeSimple')],
                            ['detailed', t('layers.facadeRich')],
                          ] as const).map(([id, label]) => ({
                            id, label, active: store.contextDetail === id,
                          }))}
                          onSelect={handleContextDetail}
                        />
                        <p className="text-[10px] text-[var(--text-faint)] leading-snug">
                          {t('layers.facadeHint')}
                        </p>

                        {/* Per-layer visibility, with counts, so an empty layer
                            reads as "none mapped here" and not as a dead toggle. */}
                        {store.buildingsEnabled && store.buildingsStatus === 'ready' && (
                          <>
                            <Caption>{t('panel.tabs.context')}</Caption>
                            <div className="flex flex-col">
                              {FEATURE_KINDS.map((kind) => (
                                <SwitchRow
                                  key={kind}
                                  compact
                                  label={t(`layers.osm.${kind}`)}
                                  trailing={
                                    <span className="font-mono tabular-nums text-[9.5px] text-[var(--text-faint)]">
                                      {store.buildingsCounts[kind]}
                                    </span>
                                  }
                                  checked={store.featureLayers[kind]}
                                  disabled={store.buildingsCounts[kind] === 0}
                                  onChange={(v) => handleFeatureLayer(kind, v)}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </Group>
                    )}

                    {/* ── Placement ───────────────────────────────────────── */}
                    {tab === 'place' && (
                      <Group>
                        {mapOn && store.placement && (
                          <>
                            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
                              <span>{store.placement.source === 'ifc' ? t('placement.sourceIfc') : t('placement.sourceManual')}</span>
                              <span>·</span>
                              <span>{store.placement.confidence === 'high' ? t('status.confidenceHigh') : t('status.confidenceApproximate')}</span>
                            </div>

                            {store.consentGiven && (
                              <Suspense fallback={<div className="h-[150px] rounded-[8px] bg-[var(--surface-2)]" />}>
                                <PlacementMiniMap
                                  lat={(editing && draftPlacement ? draftPlacement : store.placement).lat}
                                  lon={(editing && draftPlacement ? draftPlacement : store.placement).lon}
                                  onChange={editing ? (la, lo) => store.updateDraft({ lat: la, lon: lo }) : undefined}
                                  otherPins={otherPins}
                                  fitAll={modelSites.farApart}
                                />
                              </Suspense>
                            )}

                            {modelSites.located.length > 1 && (
                              <p className="text-[10px] text-[var(--text-faint)] leading-snug">{t('placement.anchorHint')}</p>
                            )}
                            {modelSites.farApart && (
                              <Notice tone="warn">
                                {t('placement.modelsFarApart', {
                                  count: modelSites.located.length,
                                  km: Math.round(modelSites.spreadM / 1000),
                                })}
                              </Notice>
                            )}
                            {modelSites.sites.length > 1 && (
                              <ul className="flex flex-col gap-0.5">
                                {modelSites.sites.map((s) => (
                                  <li key={s.modelId} className="flex items-center gap-1.5 text-[10px] min-w-0">
                                    <span
                                      className="w-[6px] h-[6px] rounded-full shrink-0"
                                      style={{ background: s.lat === null ? 'var(--text-faint)' : s.anchor ? 'var(--accent)' : 'var(--text-dim)' }}
                                    />
                                    <span className="truncate text-[var(--text-dim)]" title={s.label}>{s.label}</span>
                                    {s.anchor && <span className="shrink-0 text-[9px] text-[var(--accent)]">{t('placement.anchorModel')}</span>}
                                    {s.lat === null && <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{t('placement.noGeoref')}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}

                            {!editing ? (
                              <div className="flex flex-col gap-1.5">
                                <button
                                  onClick={() => { void beginEdit() }}
                                  className="h-[30px] rounded-[8px] text-[11.5px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                                >
                                  {t('placement.edit')}
                                </button>
                                {extraction?.siteExpressId ? (
                                  <>
                                    <button
                                      onClick={handleSaveGeorefToIfc}
                                      className="h-[30px] rounded-[8px] text-[11.5px] font-medium border border-[var(--accent)] text-[var(--accent)] hover:bg-[rgba(94,106,210,0.12)] transition-colors"
                                    >
                                      {t('placement.saveToIfc')}
                                    </button>
                                    <span className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('placement.saveToIfcHint')}</span>
                                  </>
                                ) : (
                                  <span className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('placement.saveToIfcNoSite')}</span>
                                )}
                              </div>
                            ) : draftPlacement && (
                              <div className="flex flex-col gap-2">
                                <div className="flex gap-1.5">
                                  <Field label={t('placement.lat')} className="flex-1">
                                    <input
                                      value={String(draftPlacement.lat)}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value)
                                        if (Number.isFinite(v)) store.updateDraft({ lat: v })
                                      }}
                                      className="geo-input" inputMode="decimal"
                                    />
                                  </Field>
                                  <Field label={t('placement.lon')} className="flex-1">
                                    <input
                                      value={String(draftPlacement.lon)}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value)
                                        if (Number.isFinite(v)) store.updateDraft({ lon: v })
                                      }}
                                      className="geo-input" inputMode="decimal"
                                    />
                                  </Field>
                                </div>

                                <LookSlider
                                  label={t('placement.rotation')}
                                  value={normalizeDeg(draftPlacement.rotationDeg)}
                                  min={0} max={360} step={0.5}
                                  format={(v) => `${v.toFixed(0)}°`}
                                  onChange={(v) => store.updateDraft({ rotationDeg: v })}
                                />

                                <div className="flex items-end gap-1.5">
                                  <Field label={t('placement.height')} className="flex-1">
                                    <input
                                      type="number" step={0.5}
                                      value={String(draftPlacement.heightOffsetM)}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value)
                                        if (Number.isFinite(v)) store.updateDraft({ heightOffsetM: v })
                                      }}
                                      className="geo-input"
                                    />
                                  </Field>
                                  <button
                                    onClick={() => store.updateDraft({ heightOffsetM: 0 })}
                                    className="h-[26px] px-2 text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                                  >
                                    {t('placement.resetHeight')}
                                  </button>
                                </div>

                                {/* Nudge pad — a d-pad reads as one control, where
                                    a row of arrows read as four unrelated buttons. */}
                                <div className="flex items-center gap-2.5">
                                  <div className="grid grid-cols-3 gap-0.5 shrink-0">
                                    <span />
                                    <NudgeBtn label="↑" onClick={() => nudgeDraft(0, 10)} />
                                    <span />
                                    <NudgeBtn label="←" onClick={() => nudgeDraft(-10, 0)} />
                                    <span className="w-6 h-6 flex items-center justify-center text-[9px] text-[var(--text-faint)]">10m</span>
                                    <NudgeBtn label="→" onClick={() => nudgeDraft(10, 0)} />
                                    <span />
                                    <NudgeBtn label="↓" onClick={() => nudgeDraft(0, -10)} />
                                    <span />
                                  </div>
                                  <button
                                    onClick={() => setPicking((v) => !v)}
                                    className={[
                                      'flex-1 h-[30px] rounded-[8px] text-[11px] font-medium border transition-colors',
                                      picking
                                        ? 'border-[var(--accent)] text-[var(--accent)] bg-[rgba(94,106,210,0.10)]'
                                        : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)]',
                                    ].join(' ')}
                                  >
                                    {picking ? t('placement.picking') : t('placement.pick')}
                                  </button>
                                </div>

                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => { void finishEdit(true) }}
                                    className="flex-1 h-[30px] rounded-[8px] text-[11.5px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 active:scale-[0.99] transition-all"
                                  >
                                    {t('placement.apply')}
                                  </button>
                                  <button
                                    onClick={() => { void finishEdit(false) }}
                                    className="flex-1 h-[30px] rounded-[8px] text-[11.5px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
                                  >
                                    {t('placement.cancel')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Georeferencing provenance — why the model landed here. */}
                        {extraction && (
                          <>
                            <Caption>{t('status.title')}</Caption>
                            <div className="flex items-center gap-1.5 text-[11px] font-medium min-w-0">
                              <StatusDot status={extraction.status} />
                              <span className="truncate">{t(`status.${extraction.status}`)}</span>
                            </div>
                            {extraction.rung !== null && (
                              <p className="text-[10px] text-[var(--text-faint)] leading-snug">{t(`status.rung${extraction.rung}`)}</p>
                            )}
                            {extraction.epsgCode && (
                              <p className="text-[10.5px] font-mono text-[var(--text-dim)] break-words">
                                {t('status.crs')}: {extraction.epsgCode}
                              </p>
                            )}
                            {extraction.largeWcsOffset && <Notice tone="warn">{t('status.largeOffset')}</Notice>}
                            {extraction.reasons.length > 0 && (
                              <ul className="flex flex-col gap-1">
                                {extraction.reasons.map((r) => (
                                  <li key={r} className="text-[10px] text-[var(--text-faint)] leading-snug break-words">• {tDynamic(`reasons.${r}`)}</li>
                                ))}
                              </ul>
                            )}
                            {!mapOn && (extraction.status === 'none' || extraction.status === 'invalid') && (
                              <button
                                onClick={() => setManualFormOpen(true)}
                                className="self-start text-[11px] text-[var(--accent)] hover:underline underline-offset-2"
                              >
                                {t('placement.manualShow')}
                              </button>
                            )}
                            <Expander open={debugOpen} onToggle={() => setDebugOpen((v) => !v)} label={t('status.debug')}>
                              <pre className="text-[9px] font-mono text-[var(--text-faint)] whitespace-pre-wrap break-all leading-snug max-h-[120px] overflow-y-auto">
                                {Object.entries(extraction.raw).map(([k, v]) => `${k}: ${String(v)}`).join('\n') || '—'}
                              </pre>
                            </Expander>
                          </>
                        )}
                      </Group>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Consent modal — shown once before the first tile request */}
      <AnimatePresence>
        {showConsent && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(0,0,0,0.5)] pointer-events-auto"
          >
            <div className="glass-md border border-[var(--border-strong)] rounded-[12px] p-4 max-w-[340px] mx-3">
              <div className="text-[13px] font-semibold mb-1.5">{t('consent.title')}</div>
              <div className="text-[11.5px] text-[var(--text-dim)] leading-relaxed mb-3">{t('consent.body')}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    useGeoStore.getState().setConsent(true)
                    setShowConsent(false)
                    void handleShowOnMap()
                  }}
                  className="flex-1 px-3 py-2 rounded-[8px] text-[12px] font-semibold bg-[var(--accent)] text-white"
                >
                  {t('consent.accept')}
                </button>
                <button
                  onClick={() => setShowConsent(false)}
                  className="flex-1 px-3 py-2 rounded-[8px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)]"
                >
                  {t('consent.cancel')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Small bits ──────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: GeorefExtraction['status'] }) {
  const color =
    status === 'found' ? '#30A46C'
    : status === 'partial' ? '#F5A623'
    : status === 'invalid' ? 'var(--danger)'
    : 'var(--text-faint)'
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
}

function NudgeBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 rounded-[5px] text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:scale-95 transition-all"
    >
      {label}
    </button>
  )
}

/** Map state as a colour + word, next to the title where it is read first. */
function ModeChip({ mode, label }: { mode: string; label: string }) {
  const tone =
    mode === 'on' ? { fg: 'var(--ok, #30A46C)', bg: 'rgba(48,163,108,0.12)' }
    : mode === 'starting' ? { fg: 'var(--accent-2)', bg: 'rgba(94,106,210,0.14)' }
    : mode === 'error' ? { fg: 'var(--danger)', bg: 'rgba(229,72,77,0.12)' }
    : { fg: 'var(--text-faint)', bg: 'var(--surface-2)' }
  return (
    <span
      className="px-1.5 py-[1px] rounded-[5px] text-[9px] font-medium uppercase tracking-[0.08em]"
      style={{ color: tone.fg, background: tone.bg }}
    >
      {label}
    </span>
  )
}

// ── Panel layout primitives ────────────────────────────────────────────────────
// The panel grew section by section and each one invented its own padding and
// its own idea of a control, which is how it ended up as 1500px of scroll with
// no visible hierarchy. These primitives are the whole layout system: one
// spacing scale, one row shape, one way to say "this is a group", and controls
// that are physically incapable of clipping their own text.

/** Horizontal padding shared by every section — the panel's optical margin. */
const SECTION_X = 'px-3.5'

type TabId = 'base' | 'terrain' | 'context' | 'place'

/** A tab body: consistent padding and vertical rhythm, nothing else. */
function Group({ children }: { children: React.ReactNode }) {
  return <div className={`${SECTION_X} py-3 flex flex-col gap-2.5`}>{children}</div>
}

/** Small uppercase label that starts a group of related controls. */
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9.5px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase pt-0.5">
      {children}
    </div>
  )
}

/** Inline message with a tone. Replaces five bespoke coloured divs. */
function Notice({ tone = 'muted', children }: { tone?: 'muted' | 'warn' | 'danger'; children: React.ReactNode }) {
  const style =
    tone === 'danger' ? 'border-[rgba(229,72,77,0.4)] bg-[rgba(229,72,77,0.08)] text-[var(--text-dim)]'
    : tone === 'warn' ? 'border-[rgba(245,166,35,0.4)] bg-[rgba(245,166,35,0.08)] text-[var(--text-dim)]'
    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-faint)]'
  return (
    <div className={`text-[10px] leading-snug px-2 py-1.5 rounded-[7px] border ${style}`}>
      {children}
    </div>
  )
}

/** Labelled form field — label and control always travel together. */
function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[10px] text-[var(--text-faint)]">{label}</span>
      {children}
    </label>
  )
}

/** A sub-flow that takes over the body, with an unmistakable way back. */
function Sheet({ title, backLabel, onBack, children }: {
  title: string
  backLabel: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className={`${SECTION_X} py-3 flex flex-col gap-2.5`}>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onBack}
          className="-ml-1 p-1 rounded-[6px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          aria-label={backLabel}
          title={backLabel}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 2.5L4 7l4.5 4.5" />
          </svg>
        </button>
        <span className="text-[11.5px] font-semibold">{title}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * One setting per row: name on the left, state on the right, always in the same
 * place. A real switch rather than a checkbox — at this size a checkbox reads as
 * a bullet, and "is it on?" has to be answerable from across the panel.
 */
function SwitchRow({ label, checked, onChange, disabled = false, busy = false, note, tone = 'muted', trailing, compact = false }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  busy?: boolean
  note?: string
  tone?: 'muted' | 'danger'
  trailing?: React.ReactNode
  compact?: boolean
}) {
  return (
    <label
      className={[
        'flex items-center gap-2 rounded-[7px] -mx-1 px-1 transition-colors',
        compact ? 'py-1' : 'py-1.5',
        disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${compact ? 'text-[10.5px]' : 'text-[11.5px]'} text-[var(--text-dim)]`}>
          {label}
        </span>
        {note && (
          <span className={`block text-[9.5px] leading-snug ${tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--text-faint)]'}`}>
            {note}
          </span>
        )}
      </span>
      {trailing}
      {busy && (
        <span className="w-[9px] h-[9px] rounded-full border-[1.5px] border-[var(--accent)] border-t-transparent animate-spin shrink-0" aria-hidden />
      )}
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        aria-hidden
        className={[
          'relative shrink-0 w-[26px] h-[15px] rounded-full transition-colors',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[var(--bg)]',
        ].join(' ')}
      >
        <span
          className="absolute top-[2px] left-[2px] w-[11px] h-[11px] rounded-full bg-white transition-transform duration-150"
          style={{ transform: checked ? 'translateX(11px)' : 'translateX(0)' }}
        />
      </span>
    </label>
  )
}

/**
 * Wrapping choice group. `flex-wrap` + a min-width per option is what fixes the
 * clipping: a long label ("Personalizada", "Hypsometric") pushes its option onto
 * the next row instead of being cut off, in EVERY locale — which a fixed
 * `grid-cols-4` can never guarantee, since translations vary in length.
 */
function Choices<T extends string>({ options, onSelect, minWidth = 90 }: {
  options: ReadonlyArray<{ id: T; label: string; active?: boolean }>
  onSelect: (id: T) => void
  minWidth?: number
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          title={o.label}
          aria-pressed={o.active ?? false}
          style={{ minWidth }}
          className={[
            'flex-1 px-2 h-[28px] rounded-[7px] text-[10.5px] font-medium leading-tight truncate',
            'border transition-colors active:scale-[0.98]',
            o.active
              ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
              : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Secondary controls behind one obvious affordance — a row, not a `▸` glyph. */
function Expander({ open, onToggle, label, children }: {
  open: boolean
  onToggle: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 -mx-1 px-1 py-1 rounded-[7px] text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <svg
          width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-150 shrink-0"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          aria-hidden
        >
          <path d="M4 2.5L8 6l-4 3.5" />
        </svg>
        {label}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-2 border-l border-[var(--border)]">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Compact labelled slider ────────────────────────────────────────────────────

interface LookSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function LookSlider({ label, value, min, max, step, format, onChange }: LookSliderProps) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] text-[var(--text-faint)] w-[54px] shrink-0">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[var(--accent)]"
        aria-label={label}
      />
      <span className="text-[10px] font-mono w-[34px] text-right tabular-nums text-[var(--text-dim)]">
        {format(value)}
      </span>
    </label>
  )
}
