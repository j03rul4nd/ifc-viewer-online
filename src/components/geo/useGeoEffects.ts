// ─── useGeoEffects ────────────────────────────────────────────────────────────
// The map panel's long-lived subscriptions: the SDK bridge, the scene health
// feed, adaptive quality, and click-to-inspect / click-to-hide on the canvas.
//
// Mounted once by GeoPanel, whatever face of the panel is showing — and even
// while the panel is closed, because the SDK drives map mode through here and
// the canvas handlers must keep working with the panel out of the way.

import React, { useEffect, useRef } from 'react'
import { useGeoStore } from '../../stores/geoStore'
import { useSceneStore } from '../../stores/sceneStore'
import { appBus } from '../../lib/event-bus'
import { publishInspectorTarget } from '../../lib/inspector'
import { emitEmbedEvent } from '../../lib/url-params'
import { modelRegistry } from '../../lib/model-registry'
import { ensureGeorefExtracted } from '../../lib/geo/geo-extract-runner'
import { resolvePlacement } from '../../lib/geo/placement'
import { lowerDetail } from '../../lib/geo/scene-budget'
import { FEATURE_KINDS, type FeatureKind } from '../../lib/geo/osm-features'
import type { ViewerAPI } from '../../lib/viewer'
import type { GeoSystemAPI } from '../../lib/geo/geo-system'
import type { GeoController } from './useGeoController'

export function useGeoEffects(
  ctl: GeoController,
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>,
): void {
  const mapMode = useGeoStore((s) => s.mapMode)
  const buildingsEnabled = useGeoStore((s) => s.buildingsEnabled)
  const hiddenFeatures = useGeoStore((s) => s.hiddenFeatures)
  const hideMode = useGeoStore((s) => s.hideMode)
  const slow = useGeoStore((s) => s.perf?.slow ?? false)
  const adaptiveQuality = useGeoStore((s) => s.adaptiveQuality)
  const { getGeo, withGeo, setContextDetail } = ctl
  // The SDK subscription reads the controller through a ref: the controller
  // object changes whenever a sub-flow opens, and re-subscribing the bus on
  // every one of those would open a window where a host command finds no
  // handler.
  const ctlRef = useRef(ctl)
  ctlRef.current = ctl

  // ── SDK bridge: `sdk:site` commands from the embed postMessage handler ───────
  // Map mode's whole lifecycle lives in this panel — consent, tile provider,
  // the placement ladder, terrain and OSM context — so the embed bridge
  // delegates here instead of reimplementing any of it.
  //
  // Consent: a host that asks for site context is declaring tile consent for
  // its OWN page, which is a decision only that host can make. The in-app
  // consent sheet exists for people who opened the app directly; it would be
  // meaningless to show it to a visitor of someone else's dashboard. This is
  // documented on the SDK's `setSiteContext()` and on the `?site=1` param.
  useEffect(() => appBus.on('sdk:site', (cmd) => {
    const ctl = ctlRef.current
    void (async () => {
      try {
        if (cmd.enabled === false) {
          await ctl.disable()
          cmd.done?.(true)
          return
        }

        // Look settings first: they are stored preferences, so applying them
        // before the enable means the map comes up already styled — and the
        // geo system coalesces them into a single rebuild.
        if (cmd.terrainStyle) ctl.setTerrainStyle(cmd.terrainStyle)
        if (cmd.exaggeration !== undefined) ctl.setExaggeration(cmd.exaggeration)
        if (cmd.detail) ctl.setContextDetail(cmd.detail)
        if (cmd.vehicles !== undefined) ctl.setVehicles(cmd.vehicles)
        if (cmd.layers) {
          const on: FeatureKind[] = []
          const off: FeatureKind[] = []
          for (const [kind, visible] of Object.entries(cmd.layers)) {
            if (!(FEATURE_KINDS as readonly string[]).includes(kind)) continue
            ;(visible ? on : off).push(kind as FeatureKind)
          }
          if (on.length) ctl.setFeatureLayers(on, true)
          if (off.length) ctl.setFeatureLayers(off, false)
        }

        if (useGeoStore.getState().mapMode !== 'on') {
          const activeModelId = useSceneStore.getState().activeModelId
          const viewer = viewerApiRef.current
          if (!activeModelId || !viewer) {
            throw new Error('No model in the scene — site context needs a loaded model')
          }
          useGeoStore.getState().setConsent(true)
          const g = await ensureGeorefExtracted(activeModelId)
          const key = modelRegistry.get(activeModelId)?.opfsCacheKey ?? null
          const resolved = resolvePlacement(key, g, viewer.getModelBounds(activeModelId))
          if (!resolved.ok) {
            throw new Error(resolved.error.message === 'unknownCrs'
              ? `Model CRS ${g.epsgCode ?? ''} is not recognised — place the model manually in Map mode first`.replace('  ', ' ')
              : 'Model is not georeferenced — place it manually in Map mode first')
          }
          await ctl.enableWithPlacement(resolved.value, g)
          if (useGeoStore.getState().mapMode !== 'on') {
            throw new Error('Map mode failed to start — the tile provider may be unreachable')
          }
        }

        // Terrain and OSM context go last: enabling re-applies the stored
        // preferences, so setting them earlier would be overwritten.
        if (cmd.terrain !== undefined) ctl.toggleTerrain(cmd.terrain)
        if (cmd.buildings !== undefined) await ctl.toggleBuildings(cmd.buildings)
        // `done` means DONE: the surroundings are built, not merely requested.
        const geo = await getGeo()
        await geo?.settled()
        cmd.done?.(true)
      } catch (err) {
        cmd.done?.(false, err instanceof Error ? err.message : String(err))
      }
    })()
  }), [getGeo, viewerApiRef])

  // ── Scene health feed ────────────────────────────────────────────────────────
  // Build progress, per-layer results and the frame watch, straight into the
  // store. Subscribed only while the map is on, so nothing reports into a panel
  // describing a scene that no longer exists.
  useEffect(() => {
    if (mapMode !== 'on') return
    let cancelled = false
    let api: GeoSystemAPI | null = null
    void getGeo()?.then((geo) => {
      if (cancelled) return
      api = geo
      const s = useGeoStore.getState()
      geo.setBudgetOverride(s.budgetLifted)
      geo.setSceneReportCallback((r) => useGeoStore.getState().setSceneReport(r))
      geo.setPerformanceCallback((v) => useGeoStore.getState().setPerf(v))
    })
    return () => {
      cancelled = true
      api?.setSceneReportCallback(null)
      api?.setPerformanceCallback(null)
    }
  }, [mapMode, getGeo])

  // ── Adaptive quality ─────────────────────────────────────────────────────────
  // When the frame watch says the view has STAYED slow, step the detail down
  // one level and say so, with the old level one click away. Each step waits
  // for a fresh verdict: the geo system resets its watch after every rebuild,
  // so a second step only happens if the lighter scene is still slow.
  useEffect(() => {
    if (!slow || !adaptiveQuality || mapMode !== 'on') return
    const s = useGeoStore.getState()
    if (!s.buildingsEnabled) return
    if (s.autoDowngradeBlocked.includes(s.contextDetail)) return
    const next = lowerDetail(s.contextDetail)
    if (!next) return
    s.setAutoDowngrade({ from: s.autoDowngrade?.from ?? s.contextDetail, to: next })
    setContextDetail(next, { auto: true })
  }, [slow, adaptiveQuality, mapMode, setContextDetail])

  // ── Placement draft ──────────────────────────────────────────────────────────
  // Live-apply the draft while editing, so the model moves under the map as the
  // pin, the nudge pad or the rotation slider moves.
  const editing = useGeoStore((s) => s.editing)
  const draftPlacement = useGeoStore((s) => s.draftPlacement)
  const panelOpen = useGeoStore((s) => s.panelOpen)
  useEffect(() => {
    if (!editing || !draftPlacement) return
    withGeo((geo) => { if (useGeoStore.getState().editing) geo.setPlacement(draftPlacement) })
  }, [editing, draftPlacement, withGeo])

  // Closing the panel mid-edit cancels the edit. Otherwise the editor's pointer
  // lock outlives the controls that release it, and the model stops answering
  // clicks with nothing on screen to say why.
  useEffect(() => {
    if (!panelOpen && editing) void ctlRef.current.finishEditPlacement(false)
  }, [panelOpen, editing])

  // ── Hand-hidden features ─────────────────────────────────────────────────────
  // The hand-hidden set is a preference like any other, so it is pushed the
  // same way: the store is the truth, the scene follows. `setHiddenFeatures`
  // early-returns on an unchanged set, so this costs nothing on unrelated
  // renders and rebuilds exactly once when the user hides or restores one.
  useEffect(() => {
    if (mapMode !== 'on') return
    const ids = hiddenFeatures.map((h) => h.id)
    withGeo((geo) => geo.setHiddenFeatures(ids))
  }, [mapMode, hiddenFeatures, withGeo])

  // Hide mode is only meaningful while there are surroundings to click, and a
  // mode nobody can leave is a bug. Dropping it here covers every exit —
  // turning the map off, turning the buildings off, or a failed refetch.
  useEffect(() => {
    if (mapMode !== 'on' || !buildingsEnabled) useGeoStore.getState().setHideMode(false)
  }, [mapMode, buildingsEnabled])

  // Say so on the cursor. Without it the only evidence that the next click
  // hides something is a switch in a panel the user has already looked away
  // from.
  useEffect(() => {
    const canvas = viewerApiRef.current?.getCanvas()
    if (!canvas || !hideMode) return
    const previous = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    return () => { canvas.style.cursor = previous }
  }, [hideMode, viewerApiRef])

  // ── Click the surroundings: inspect, or hide ─────────────────────────────────
  // The hover tooltip answers "what is that?" for as long as the mouse holds
  // still; this answers it for as long as you want, in the same panel that
  // describes an IFC element or a scanned point.
  //
  // Capture phase, like the scan's own inspect handler, so identifying a
  // neighbour never doubles as deselecting your model. Anonymous buildings are
  // included where the tooltip suppresses them: no name is not the same as
  // nothing to say, and the height and storeys are what a massing study wants.
  useEffect(() => {
    if (mapMode !== 'on' || !buildingsEnabled) return
    const canvas = viewerApiRef.current?.getCanvas()
    if (!canvas) return

    let cancelled = false
    let geo: GeoSystemAPI | null = null
    void getGeo()?.then((g) => { if (!cancelled) geo = g })

    const onClick = (e: MouseEvent): void => {
      // SYNCHRONOUS on purpose: picking inside a promise meant stopPropagation
      // no longer stopped anything, so the same click also deselected the
      // model standing behind the building.
      const feature = geo?.pickContextFeature(e.clientX, e.clientY)
      if (!feature) return
      e.stopPropagation()

      if (useGeoStore.getState().hideMode) {
        useGeoStore.getState().hideFeature({
          id: feature.id, kind: feature.kind, name: feature.name, label: feature.label,
        })
        return
      }

      // Out to an embedding host too, so a CDE can react to "they clicked the
      // school next door" the same way it reacts to an element selection.
      emitEmbedEvent('map-feature-picked', {
        id: feature.id,
        name: feature.name,
        label: feature.label,
        featureKind: feature.kind,
        heightM: feature.height?.heightM,
        heightEstimated: feature.height?.estimated ?? true,
      })
      publishInspectorTarget({
        kind: 'map-feature',
        id: feature.id,
        name: feature.name,
        label: feature.label,
        featureKind: feature.kind,
        heightM: feature.height?.heightM,
        // Estimated far more often than not — the inspector says which, because
        // an OSM height presented as surveyed is the kind of number that ends
        // up in someone's shadow study.
        heightEstimated: feature.height?.estimated,
      })
    }
    canvas.addEventListener('click', onClick, true)
    return () => {
      cancelled = true
      canvas.removeEventListener('click', onClick, true)
    }
  }, [mapMode, buildingsEnabled, viewerApiRef, getGeo])
}
