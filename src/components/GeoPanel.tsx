// ─── GeoPanel ─────────────────────────────────────────────────────────────────
// GIS / Map mode UI (plan T16+T17): enable flow with privacy consent, layer
// picker with satellite terms sheet, georeferencing status + reasons, CRS
// picker for unknown EPSG, manual + fine placement editing, terrain toggle,
// degraded banner, and the (legally required) attribution pill.
//
// This component is loaded via React.lazy — it statically imports placement,
// crs (proj4) and the geo runners, which must all stay out of the entry chunk.
// Product state lives in geoStore; GPU state lives in the viewer's GeoSystem.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../stores/geoStore'
import { useSceneStore } from '../stores/sceneStore'
import { modelRegistry } from '../lib/model-registry'
import { ensureGeorefExtracted } from '../lib/geo/geo-extract-runner'
import { resolvePlacement, placementFromExtraction, savePlacement } from '../lib/geo/placement'
import { registerCustomProj4, resolveCrs } from '../lib/geo/crs'
import { DEFAULT_PROVIDER_ID, resolveProvider, saveCustomProvider } from '../lib/geo/providers'
import { TERRARIUM_ATTRIBUTION } from '../lib/geo/elevation'
import { CONTOUR_INTERVALS } from '../lib/geo/terrain-look'
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

  const enabledAtRef = useRef(0)

  const getGeo = useCallback((): Promise<GeoSystemAPI> | null => {
    const viewer = viewerApiRef.current
    return viewer ? viewer.getGeo() : null
  }, [viewerApiRef])

  // Keep the local extraction mirror in sync with the store entry.
  const storeExtraction = activeModelId ? store.georefByModel[activeModelId] : undefined
  useEffect(() => { setExtraction(storeExtraction ?? null) }, [storeExtraction])

  // ── Attributions (provider + terrain) ────────────────────────────────────────
  const refreshAttributions = useCallback(async (): Promise<void> => {
    const geo = await getGeo()
    if (!geo) return
    const s = useGeoStore.getState()
    const list = [...geo.getAttributions()]
    if (s.terrainEnabled && s.terrainStatus === 'ready') list.push(TERRARIUM_ATTRIBUTION)
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
      if (useGeoStore.getState().terrainEnabled) void applyTerrain(true)
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
  const layerKindActive = (id: string): boolean => store.baseLayerId === id
  const satelliteActive = ['esri-imagery', 'eox-s2', 'gibs'].includes(store.baseLayerId)

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
            // 304px, not the original 260: the panel now carries layer, terrain,
            // relief and placement controls, and 260 could not fit four
            // segments of translated text without clipping them.
            style={{ width: 'min(304px, calc(100vw - 24px))' }}
          >
            <div className="glass-md border border-[var(--border-strong)] rounded-[12px] overflow-hidden shadow-2xl max-h-[calc(100vh-140px)] overflow-y-auto">
              {/* Header */}
              <div className={`${SECTION_X} pt-3 pb-2.5 border-b border-[var(--border)] flex items-center justify-between gap-2`}>
                <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase truncate">
                  {t('panel.title')}
                </div>
                <button
                  onClick={() => store.setPanelOpen(false)}
                  className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                  title={t('panel.close')}
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l10 10M12 2L2 12"/>
                  </svg>
                </button>
              </div>

              {/* Enable / status row */}
              <PanelSection divided={false}>
                {mapMode !== 'on' && (
                  <button
                    onClick={() => { void handleShowOnMap() }}
                    disabled={!activeModelId || mapMode === 'starting'}
                    className="w-full px-2.5 py-2 rounded-[8px] text-[12px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40 transition-opacity"
                  >
                    {mapMode === 'starting' ? t('enable.starting') : t('enable.show')}
                  </button>
                )}
                {mapMode === 'on' && (
                  <button
                    onClick={() => { void handleDisable() }}
                    className="w-full px-2.5 py-2 rounded-[8px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                  >
                    {t('enable.hide')}
                  </button>
                )}
                {!activeModelId && (
                  <div className="text-[10.5px] text-[var(--text-faint)]">{t('enable.noModel')}</div>
                )}
                {mapMode === 'error' && (
                  <div className="text-[11px] text-[var(--danger)] leading-snug">
                    {tDynamic(store.mapErrorKey ?? 'errors.enableFailed')}
                  </div>
                )}
                {store.degraded && (
                  <div className="text-[10.5px] leading-snug px-2 py-1.5 rounded-[7px] border border-[rgba(229,72,77,0.4)] bg-[rgba(229,72,77,0.08)] text-[var(--text-dim)]">
                    {t('degraded.banner')}
                  </div>
                )}
              </PanelSection>

              {/* Georeferencing status */}
              {extraction && (
                <PanelSection title={t('status.title')}>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11.5px] font-medium min-w-0">
                      <StatusDot status={extraction.status} />
                      <span className="truncate">{t(`status.${extraction.status}`)}</span>
                    </div>
                    {extraction.rung !== null && (
                      <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t(`status.rung${extraction.rung}`)}</div>
                    )}
                    {extraction.epsgCode && (
                      // CRS codes and proj4 strings are arbitrary length — they
                      // must wrap, never push the panel wider.
                      <div className="text-[10.5px] font-mono text-[var(--text-dim)] break-words">
                        {t('status.crs')}: {extraction.epsgCode}
                      </div>
                    )}
                    {extraction.largeWcsOffset && (
                      <div className="text-[10px] text-[#F5A623] leading-snug">{t('status.largeOffset')}</div>
                    )}
                  </div>
                  {extraction.reasons.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {extraction.reasons.map((r) => (
                        <li key={r} className="text-[10px] text-[var(--text-faint)] leading-snug break-words">• {tDynamic(`reasons.${r}`)}</li>
                      ))}
                    </ul>
                  )}
                  <div>
                    <button
                      onClick={() => setDebugOpen((v) => !v)}
                      className="text-[9.5px] font-mono text-[var(--text-faint)] hover:text-[var(--text-dim)] transition-colors"
                    >
                      {debugOpen ? '▾' : '▸'} {t('status.debug')}
                    </button>
                    {debugOpen && (
                      <pre className="mt-1.5 text-[9px] font-mono text-[var(--text-faint)] whitespace-pre-wrap break-all leading-snug max-h-[120px] overflow-y-auto">
                        {Object.entries(extraction.raw).map(([k, v]) => `${k}: ${String(v)}`).join('\n') || '—'}
                      </pre>
                    )}
                  </div>
                </PanelSection>
              )}

              {/* CRS picker */}
              {crsFormOpen && (
                <div className="border-t border-[var(--border)] px-3.5 py-3 flex flex-col gap-2">
                  <div className="text-[11px] font-semibold">{t('crs.title')}</div>
                  <div className="text-[10.5px] text-[var(--text-dim)] leading-snug">
                    {t('crs.body', { name: extraction?.epsgCode ?? '?' })}
                  </div>
                  <label className="text-[10px] text-[var(--text-faint)]">{t('crs.epsgLabel')}</label>
                  <input
                    value={crsCode}
                    onChange={(e) => setCrsCode(e.target.value)}
                    placeholder={t('crs.epsgPlaceholder')}
                    className="geo-input"
                  />
                  <label className="text-[10px] text-[var(--text-faint)]">{t('crs.proj4Label')}</label>
                  <input
                    value={crsProj4}
                    onChange={(e) => setCrsProj4(e.target.value)}
                    placeholder={t('crs.proj4Placeholder')}
                    className="geo-input"
                  />
                  {crsError && <div className="text-[10px] text-[var(--danger)]">{t('crs.invalid')}</div>}
                  <button
                    onClick={() => { void handleCrsApply() }}
                    className="px-2.5 py-1.5 rounded-[7px] text-[11px] font-semibold bg-[var(--accent)] text-white"
                  >
                    {t('crs.apply')}
                  </button>
                </div>
              )}

              {/* Manual placement form */}
              {manualFormOpen && (
                <div className="border-t border-[var(--border)] px-3.5 py-3 flex flex-col gap-2">
                  <div className="text-[10.5px] text-[var(--text-dim)] leading-snug">{t('placement.manualIntro')}</div>
                  <div className="flex gap-1.5">
                    <div className="flex-1">
                      <label className="text-[10px] text-[var(--text-faint)]">{t('placement.lat')}</label>
                      <input value={manualLat} onChange={(e) => setManualLat(e.target.value)} placeholder="41.3851" className="geo-input" inputMode="decimal" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-[var(--text-faint)]">{t('placement.lon')}</label>
                      <input value={manualLon} onChange={(e) => setManualLon(e.target.value)} placeholder="2.1734" className="geo-input" inputMode="decimal" />
                    </div>
                  </div>
                  <button
                    onClick={() => { void handleManualApply() }}
                    disabled={!Number.isFinite(parseFloat(manualLat)) || !Number.isFinite(parseFloat(manualLon))}
                    className="px-2.5 py-1.5 rounded-[7px] text-[11px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40"
                  >
                    {t('enable.show')}
                  </button>
                </div>
              )}

              {/* Manual entry shortcut for non-georeferenced models */}
              {!manualFormOpen && mapMode === 'off' && extraction && (extraction.status === 'none' || extraction.status === 'invalid') && (
                <div className="border-t border-[var(--border)] px-3.5 py-3">
                  <button
                    onClick={() => setManualFormOpen(true)}
                    className="text-[11px] text-[var(--accent)] hover:underline"
                  >
                    {t('placement.manualShow')}
                  </button>
                </div>
              )}

              {/* Layers */}
              <PanelSection title={t('layers.title')}>
                <Segmented
                  options={[
                    { id: 'osm', label: t('layers.streets'), active: layerKindActive('osm') },
                    { id: 'opentopomap', label: t('layers.topo'), active: layerKindActive('opentopomap') },
                    { id: 'satellite', label: t('layers.satellite'), active: satelliteActive },
                    { id: 'custom', label: t('layers.custom'), active: layerKindActive('custom') },
                  ]}
                  onSelect={handleLayerClick}
                />

                {/* Terrain toggle */}
                <label className="flex items-start gap-2 text-[11.5px] text-[var(--text-dim)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={store.terrainEnabled}
                    onChange={(e) => handleTerrainToggle(e.target.checked)}
                    className="accent-[var(--accent)] mt-[2px] shrink-0"
                  />
                  <span className="min-w-0 leading-snug">
                    {store.terrainStatus === 'loading' ? t('layers.terrainLoading') : t('layers.terrain')}
                    {store.terrainStatus === 'error' && (
                      <span className="block text-[10px] text-[var(--danger)] leading-snug">{t('errors.terrainFailed')}</span>
                    )}
                  </span>
                </label>

                {/* Terrain visualization controls */}
                {store.terrainEnabled && (
                  <div className="flex flex-col gap-2 pt-0.5">
                    <div className="text-[10px] text-[var(--text-faint)]">{t('layers.style')}</div>
                    <Segmented
                      options={([
                        ['imagery', t('layers.styleImagery')],
                        ['shaded', t('layers.styleShaded')],
                        ['hypsometric', t('layers.styleHypso')],
                        ['slope', t('layers.styleSlope')],
                      ] as const).map(([id, label]) => ({ id, label, active: store.terrainStyle === id }))}
                      onSelect={handleTerrainStyle}
                    />
                    <LookSlider
                      label={t('layers.exaggeration')}
                      value={store.terrainExaggeration}
                      min={1} max={3} step={0.25}
                      format={(v) => `×${v}`}
                      onChange={handleTerrainExaggeration}
                    />

                    {/* ── Advanced relief controls ────────────────────────────
                        Everything here re-bakes live from data already in
                        memory — no refetch, so dragging a slider is instant. */}
                    <details className="mt-1 group">
                      <summary className="cursor-pointer list-none text-[10px] text-[var(--text-faint)] hover:text-[var(--text-dim)] select-none">
                        ▸ {t('layers.advancedRelief')}
                      </summary>
                      <div className="mt-1.5 flex flex-col gap-1.5 pl-1 border-l border-[var(--border)]">
                        <LookSlider
                          label={t('layers.sunAzimuth')}
                          value={store.terrainLook.sunAzimuth}
                          min={0} max={359} step={5}
                          format={(v) => `${v}°`}
                          onChange={(v) => handleTerrainLook({ sunAzimuth: v })}
                        />
                        <LookSlider
                          label={t('layers.sunAltitude')}
                          value={store.terrainLook.sunAltitude}
                          min={5} max={90} step={5}
                          format={(v) => `${v}°`}
                          onChange={(v) => handleTerrainLook({ sunAltitude: v })}
                        />
                        <LookSlider
                          label={t('layers.softness')}
                          value={store.terrainLook.softness}
                          min={0} max={1} step={0.1}
                          format={(v) => `${Math.round(v * 100)}%`}
                          onChange={(v) => handleTerrainLook({ softness: v })}
                        />
                        <LookSlider
                          label={t('layers.occlusion')}
                          value={store.terrainLook.occlusion}
                          min={0} max={1} step={0.1}
                          format={(v) => `${Math.round(v * 100)}%`}
                          onChange={(v) => handleTerrainLook({ occlusion: v })}
                        />
                        <LookSlider
                          label={t('layers.detail')}
                          value={store.terrainLook.detail}
                          min={0} max={1} step={0.1}
                          format={(v) => `${Math.round(v * 100)}%`}
                          onChange={(v) => handleTerrainLook({ detail: v })}
                        />
                        {/* Non-negotiable: invented geometry must say so. */}
                        {store.terrainLook.detail > 0 && (
                          <div className="text-[9.5px] leading-snug text-[var(--warn,#F5A623)]">
                            {t('layers.detailWarning')}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[var(--text-faint)] whitespace-nowrap">
                            {t('layers.contours')}
                          </span>
                          <select
                            value={store.terrainLook.contourInterval}
                            onChange={(e) => handleTerrainLook({ contourInterval: parseFloat(e.target.value) })}
                            className="flex-1 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-[5px] px-1 h-[22px] text-[10.5px] outline-none"
                          >
                            {CONTOUR_INTERVALS.map((m) => (
                              <option key={m} value={m}>{m === 0 ? t('layers.contoursOff') : `${m} m`}</option>
                            ))}
                          </select>
                        </div>

                        <button
                          onClick={handleResetLook}
                          className="self-start text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] underline"
                        >
                          {t('layers.resetRelief')}
                        </button>
                      </div>
                    </details>
                  </div>
                )}
              </PanelSection>

              {/* Satellite terms sheet */}
              {termsSheetOpen && (
                <div className="border-t border-[var(--border)] px-3.5 py-3 flex flex-col gap-2">
                  <div className="text-[11px] font-semibold">{t('layers.termsTitle')}</div>
                  <div className="text-[10px] text-[var(--text-dim)] leading-snug">{t('layers.termsBody')}</div>
                  {[
                    { id: 'esri-imagery', note: t('layers.esriNote') },
                    { id: 'eox-s2', note: t('layers.eoxNote') },
                    { id: 'gibs', note: t('layers.gibsNote') },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => handleTermsAccept(opt.id)}
                      className="text-left px-2 py-1.5 rounded-[7px] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                    >
                      <div className="text-[10.5px] leading-snug text-[var(--text-dim)]">{opt.note}</div>
                      <div className="text-[10px] text-[var(--accent)] mt-0.5">{t('layers.accept')}</div>
                    </button>
                  ))}
                  <button onClick={() => setTermsSheetOpen(false)} className="text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text)]">
                    {t('layers.cancel')}
                  </button>
                </div>
              )}

              {/* Custom provider form */}
              {customFormOpen && (
                <div className="border-t border-[var(--border)] px-3.5 py-3 flex flex-col gap-2">
                  <div className="text-[11px] font-semibold">{t('layers.customTitle')}</div>
                  <label className="text-[10px] text-[var(--text-faint)]">{t('layers.customUrl')}</label>
                  <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder={t('layers.customUrlPlaceholder')} className="geo-input" />
                  <label className="text-[10px] text-[var(--text-faint)]">{t('layers.customAttribution')}</label>
                  <input value={customAttr} onChange={(e) => setCustomAttr(e.target.value)} className="geo-input" />
                  {customError && <div className="text-[10px] text-[var(--danger)]">{t('layers.customInvalid')}</div>}
                  <button onClick={handleCustomSave} className="px-2.5 py-1.5 rounded-[7px] text-[11px] font-semibold bg-[var(--accent)] text-white">
                    {t('layers.customSave')}
                  </button>
                </div>
              )}

              {/* Placement section (map on) */}
              {mapMode === 'on' && store.placement && (
                <div className="border-t border-[var(--border)] px-3.5 py-3 flex flex-col gap-2">
                  <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.08em] uppercase">
                    {t('placement.title')}
                  </div>
                  <div className="text-[10px] text-[var(--text-faint)]">
                    {store.placement.source === 'ifc' ? t('placement.sourceIfc') : t('placement.sourceManual')}
                    {' · '}
                    {store.placement.confidence === 'high' ? t('status.confidenceHigh') : t('status.confidenceApproximate')}
                  </div>
                  <div className="text-[10.5px] font-mono text-[var(--text-dim)] tabular-nums">
                    {store.placement.lat.toFixed(5)}, {store.placement.lon.toFixed(5)} · {normalizeDeg(store.placement.rotationDeg).toFixed(1)}°
                  </div>

                  {!editing && (
                    <button
                      onClick={() => { void beginEdit() }}
                      className="px-2.5 py-1.5 rounded-[7px] text-[11px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      {t('placement.edit')}
                    </button>
                  )}

                  {editing && draftPlacement && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        <div className="flex-1">
                          <label className="text-[10px] text-[var(--text-faint)]">{t('placement.lat')}</label>
                          <input
                            value={String(draftPlacement.lat)}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              if (Number.isFinite(v)) store.updateDraft({ lat: v })
                            }}
                            className="geo-input" inputMode="decimal"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-[var(--text-faint)]">{t('placement.lon')}</label>
                          <input
                            value={String(draftPlacement.lon)}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              if (Number.isFinite(v)) store.updateDraft({ lon: v })
                            }}
                            className="geo-input" inputMode="decimal"
                          />
                        </div>
                      </div>

                      <label className="text-[10px] text-[var(--text-faint)]">{t('placement.rotation')}</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="range" min={0} max={360} step={0.5}
                          value={normalizeDeg(draftPlacement.rotationDeg)}
                          onChange={(e) => store.updateDraft({ rotationDeg: parseFloat(e.target.value) })}
                          className="flex-1 accent-[var(--accent)]"
                        />
                        <span className="text-[10.5px] font-mono w-12 text-right tabular-nums">
                          {normalizeDeg(draftPlacement.rotationDeg).toFixed(1)}°
                        </span>
                      </div>

                      <label className="text-[10px] text-[var(--text-faint)]">{t('placement.height')}</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" step={0.5}
                          value={String(draftPlacement.heightOffsetM)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            if (Number.isFinite(v)) store.updateDraft({ heightOffsetM: v })
                          }}
                          className="geo-input flex-1"
                        />
                        <button
                          onClick={() => store.updateDraft({ heightOffsetM: 0 })}
                          className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)]"
                        >
                          {t('placement.resetHeight')}
                        </button>
                      </div>

                      {/* Nudge pad */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[var(--text-faint)]">{t('placement.nudge')}</span>
                        <div className="grid grid-cols-3 gap-0.5">
                          <span />
                          <NudgeBtn label="↑" onClick={() => nudgeDraft(0, 10)} />
                          <span />
                          <NudgeBtn label="←" onClick={() => nudgeDraft(-10, 0)} />
                          <NudgeBtn label="·" onClick={() => { /* centre — no-op */ }} />
                          <NudgeBtn label="→" onClick={() => nudgeDraft(10, 0)} />
                          <span />
                          <NudgeBtn label="↓" onClick={() => nudgeDraft(0, -10)} />
                          <span />
                        </div>
                        <span className="text-[9.5px] text-[var(--text-faint)]">10 m</span>
                      </div>

                      <button
                        onClick={() => setPicking((v) => !v)}
                        className={[
                          'px-2.5 py-1.5 rounded-[7px] text-[11px] font-medium border transition-colors',
                          picking
                            ? 'border-[var(--accent)] text-[var(--accent)]'
                            : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)]',
                        ].join(' ')}
                      >
                        {picking ? t('placement.picking') : t('placement.pick')}
                      </button>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { void finishEdit(true) }}
                          className="flex-1 px-2.5 py-1.5 rounded-[7px] text-[11px] font-semibold bg-[var(--accent)] text-white"
                        >
                          {t('placement.apply')}
                        </button>
                        <button
                          onClick={() => { void finishEdit(false) }}
                          className="flex-1 px-2.5 py-1.5 rounded-[7px] text-[11px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)]"
                        >
                          {t('placement.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Vertical datum disclaimer when terrain is on */}
              {store.terrainEnabled && store.terrainStatus === 'ready' && (
                <div className="border-t border-[var(--border)] px-3.5 py-3 text-[9.5px] text-[var(--text-faint)] leading-snug">
                  {t('attribution.vertical')}
                </div>
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
      className="w-6 h-6 rounded-[5px] text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
    >
      {label}
    </button>
  )
}

// ── Panel layout primitives ────────────────────────────────────────────────────
// The panel grew section by section and each one invented its own padding, which
// is how labels ended up overflowing their buttons. These three primitives are
// the whole layout system: one spacing scale, one section rhythm, and controls
// that are physically incapable of clipping their own text.

/** Horizontal padding shared by every section — the panel's optical margin. */
const SECTION_X = 'px-3.5'

interface PanelSectionProps {
  title?: string
  /** First section omits the divider; every other one carries it. */
  divided?: boolean
  children: React.ReactNode
}

function PanelSection({ title, divided = true, children }: PanelSectionProps) {
  return (
    <div className={`${SECTION_X} py-3 ${divided ? 'border-t border-[var(--border)]' : ''}`}>
      {title && (
        <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.08em] uppercase mb-2">
          {title}
        </div>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

interface SegmentedOption<T extends string> {
  id: T
  label: string
  active?: boolean
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  onSelect: (id: T) => void
  /**
   * Minimum width per segment; segments wrap onto a new row below it. The
   * default lays four options out as a tidy 2×2 inside the panel, which gives
   * every translated label room to be read in full rather than ellipsised.
   */
  minWidth?: number
}

/**
 * Wrapping segmented control. `flex-wrap` + a min-width per segment is what
 * fixes the clipping: a long label ("Personalizada", "Hypsometric") pushes its
 * segment onto the next row instead of being cut off, in EVERY locale — which a
 * fixed `grid-cols-4` can never guarantee, since translations vary in length.
 */
function Segmented<T extends string>({ options, onSelect, minWidth = 118 }: SegmentedProps<T>) {
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
            'flex-1 px-2 py-1.5 rounded-[7px] text-[10.5px] font-medium leading-tight',
            'truncate transition-colors',
            o.active
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Compact labelled slider for the advanced relief controls ───────────────────

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
      <span className="text-[10px] font-mono w-[30px] text-right tabular-nums text-[var(--text-dim)]">
        {format(value)}
      </span>
    </label>
  )
}
