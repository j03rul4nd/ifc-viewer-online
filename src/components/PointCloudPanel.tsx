// ─── PointCloudPanel ──────────────────────────────────────────────────────────
// Point cloud UI, in the shape of the existing floating panels (GeoPanel /
// SolarPanel): load a scan, see how it was aligned and why, adjust it if the
// answer was a guess, and control how it draws.
//
// Loaded via React.lazy — this chunk pulls the point cloud engine, its shader
// and its readers. Product state lives in pointCloudStore; GPU resources live
// in the viewer's PointCloudSystem (reached through viewer.getPointClouds()).
//
// Design rule taken from the brief: do not expose a transform the system can
// determine itself. The XYZ/rotation/scale controls only appear when the
// alignment rung is a guess ('local' / 'manual') or the user asks for them.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ViewportPanel } from './ViewportPanel'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { useSceneStore } from '../stores/sceneStore'
import { useUIStore } from '../stores/uiStore'
import { loadPointCloud, streamPointCloud, cancelPointCloud, realignCloud } from '../lib/pointcloud/pc-runner'
import { saveCloudProj4 } from '../lib/pointcloud/pc-align'
import { registerCustomProj4 } from '../lib/geo/crs'
import { acceptAttribute, isCopcName } from '../lib/pointcloud/pc-format'
import { toast } from '../stores/toastStore'
import { createLogger } from '../lib/logger'
import { appBus } from '../lib/event-bus'
import { publishInspectorTarget } from '../lib/inspector'
import { emitEmbedEvent } from '../lib/url-params'
import {
  DEMO_POINT_CLOUDS, DEMO_SOURCES, fetchDemoPointCloud, formatDemoSize, type DemoPointCloud,
} from '../demo-models/point-clouds'
import type { ViewerAPI } from '../lib/viewer'
import type { PointCloudSystemAPI, CloudStats, PickedPoint } from '../lib/pointcloud/point-cloud-system'
import type {
  PointCloudEntry, PointColorMode, PointCloudDisplay,
} from '../lib/pointcloud/pc-types'

interface PointCloudPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

const log = createLogger('PointCloudPanel')

const COLOR_MODES: PointColorMode[] = ['rgb', 'intensity', 'elevation', 'classification', 'flat']

/** Confidence → badge colour. A guess must never look like a measurement. */
const CONFIDENCE_TINT: Record<string, string> = {
  exact: '#30A46C',
  high: '#5E9ED6',
  approximate: '#F5A623',
  manual: '#E5484D',
}

export default function PointCloudPanel({ viewerApiRef }: PointCloudPanelProps) {
  const { t } = useTranslation('pointcloud')
  // Runtime-built keys (reader error codes, alignment reasons) can't be proved
  // against the typed resource map — same escape hatch GeoPanel uses.
  const tDynamic = (key: string, opts?: Record<string, unknown>): string =>
    t(key, { defaultValue: key, ...opts })
  const store = usePointCloudStore()
  const sceneModels = useSceneStore((s) => s.models)
  const activeModelId = useSceneStore((s) => s.activeModelId)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stats, setStats] = useState<CloudStats | null>(null)
  const [showTransform, setShowTransform] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [demoBusy, setDemoBusy] = useState<string | null>(null)
  const [demoProgress, setDemoProgress] = useState(0)
  const [realigning, setRealigning] = useState(false)
  const [proj4Text, setProj4Text] = useState('')
  const [proj4Error, setProj4Error] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const measurementTool = useUIStore((st) => st.activeMeasurementTool)
  const [picked, setPicked] = useState<PickedPoint | null>(null)
  const [pickMissed, setPickMissed] = useState(false)

  const activeCloud = store.clouds.find((c) => c.id === store.activeCloudId) ?? null

  const getSystem = useCallback((): Promise<PointCloudSystemAPI> | null => {
    const viewer = viewerApiRef.current
    return viewer ? viewer.getPointClouds() : null
  }, [viewerApiRef])

  // ── Push display settings into the shader whenever they change ──────────────
  useEffect(() => {
    if (store.clouds.length === 0) return
    void getSystem()?.then((system) => {
      system.setDisplay(store.display)
      system.setRenderBudget(store.renderBudget)
    })
  }, [store.display, store.renderBudget, store.clouds.length, getSystem])

  // ── Poll the render stats while anything is loaded ──────────────────────────
  useEffect(() => {
    if (store.clouds.length === 0) { setStats(null); return }
    let cancelled = false
    const read = (): void => {
      void getSystem()?.then((system) => {
        if (!cancelled) setStats(system.getStats())
      })
    }
    read()
    const iv = setInterval(read, 1000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [store.clouds.length, getSystem])

  // ── Loading ─────────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (
    files: FileList | File[],
    sourceUrl?: string,
  ): Promise<void> => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const system = await viewer.getPointClouds()

    for (const file of Array.from(files)) {
      const load = {
        file,
        system,
        modelBounds: activeModelId ? viewer.getModelBounds(activeModelId) : viewer.getModelBounds(),
        modelId: activeModelId,
        // A downloaded scan is identified by its URL. Without this the File's
        // lastModified — the instant of the fetch — becomes its identity, and a
        // demo would arrive as a brand new scan on every single load.
        sourceUrl,
      }
      // COPC carries an octree, so it streams: the worker stays open and the
      // camera decides what gets read. Everything else is one-shot.
      const result = isCopcName(file.name)
        ? await streamPointCloud(load)
        : await loadPointCloud(load)
      if (!result.ok) {
        toast(tDynamic(result.errorKey ?? 'error.parseFailed'), 'error')
      } else if (result.cloudId) {
        // First scan in an empty scene: show the user what they just loaded.
        if (usePointCloudStore.getState().clouds.length === 1 && sceneModels.length === 0) {
          system.frame(result.cloudId)
        }
      }
    }
  }, [viewerApiRef, activeModelId, sceneModels.length, t])

  /**
   * Fetch a public sample and hand it to the SAME loader a dropped file uses.
   * Nothing downstream knows a demo is a demo — which is the point: what the
   * user sees here is exactly what they will see with their own scan.
   */
  const handleDemo = useCallback(async (demo: DemoPointCloud): Promise<void> => {
    setDemoBusy(demo.id)
    setDemoProgress(0)
    try {
      const file = await fetchDemoPointCloud(demo, { onProgress: setDemoProgress })
      await handleFiles([file], demo.url)
    } catch (e) {
      toast(t('demos.failed'), 'error')
      log.warn(`demo cloud "${demo.id}" failed:`, e)
    } finally {
      setDemoBusy(null)
      setDemoProgress(0)
    }
  }, [handleFiles, t])

  const handleRemove = useCallback((cloud: PointCloudEntry): void => {
    cancelPointCloud(cloud.id)
    void getSystem()?.then((system) => system.remove(cloud.id))
    usePointCloudStore.getState().removeCloud(cloud.id)
  }, [getSystem])

  const handleVisible = useCallback((cloud: PointCloudEntry, visible: boolean): void => {
    usePointCloudStore.getState().setVisible(cloud.id, visible)
    void getSystem()?.then((system) => system.setVisible(cloud.id, visible))
  }, [getSystem])

  // ── SDK bridge: `sdk:pointcloud` from the embed postMessage handler ─────────
  // Loading a scan needs the viewer's PointCloudSystem, the model bounds to
  // align against and the alignment ladder — all of which live here, so the
  // embed bridge delegates rather than duplicating any of it. `add` reports the
  // new cloud id back through `done` so the host can address it afterwards.
  useEffect(() => appBus.on('sdk:pointcloud', (cmd) => {
    void (async () => {
      try {
        const viewer = viewerApiRef.current
        if (!viewer) throw new Error('Viewer not ready')
        const system = await viewer.getPointClouds()

        switch (cmd.action) {
          case 'add': {
            if (!cmd.file) throw new Error('No point cloud data provided')
            const load = {
              file: cmd.file,
              sourceUrl: cmd.sourceUrl,
              system,
              modelBounds: activeModelId ? viewer.getModelBounds(activeModelId) : viewer.getModelBounds(),
              modelId: activeModelId,
            }
            // Mirror handleFiles: COPC carries an octree and streams, everything
            // else is one-shot. A host handing over a .copc.laz must get the same
            // treatment as a dropped file, not a silently worse path.
            const result = isCopcName(cmd.file.name)
              ? await streamPointCloud(load)
              : await loadPointCloud(load)
            if (!result.ok || !result.cloudId) {
              // The runner speaks in i18n keys; resolve to prose the host can read.
              throw new Error(tDynamic(result.errorKey ?? 'error.parseFailed'))
            }
            // Same courtesy the drop target gets: a first scan in an empty
            // scene is framed, otherwise the camera would sit on nothing.
            if (usePointCloudStore.getState().clouds.length === 1 && sceneModels.length === 0) {
              system.frame(result.cloudId)
            }
            cmd.done?.(true, result.cloudId)
            return
          }
          case 'remove': {
            if (!cmd.cloudId) throw new Error('No cloudId provided')
            cancelPointCloud(cmd.cloudId)
            system.remove(cmd.cloudId)
            usePointCloudStore.getState().removeCloud(cmd.cloudId)
            break
          }
          case 'clear': {
            for (const c of usePointCloudStore.getState().clouds) {
              cancelPointCloud(c.id)
              system.remove(c.id)
            }
            usePointCloudStore.getState().clearClouds()
            break
          }
          case 'visible': {
            if (!cmd.cloudId) throw new Error('No cloudId provided')
            const on = cmd.visible !== false
            usePointCloudStore.getState().setVisible(cmd.cloudId, on)
            system.setVisible(cmd.cloudId, on)
            break
          }
          case 'frame': {
            const id = cmd.cloudId ?? usePointCloudStore.getState().clouds[0]?.id
            if (!id) throw new Error('No point cloud loaded')
            system.frame(id)
            break
          }
          case 'placement': {
            const target = cmd.cloudId ?? usePointCloudStore.getState().activeCloudId
            if (!target) throw new Error('No point cloud loaded')
            // clampOffset in the store is what keeps a host from tipping a scan
            // somewhere only a reset escapes from.
            usePointCloudStore.getState().setOffset(target, (cmd.placement ?? {}) as never)
            break
          }
          case 'upAxis': {
            const target = cmd.cloudId ?? usePointCloudStore.getState().activeCloudId
            if (!target) throw new Error('No point cloud loaded')
            if (cmd.upAxis !== 'y' && cmd.upAxis !== 'z') throw new Error('upAxis must be "y" or "z"')
            usePointCloudStore.getState().setUpAxis(target, cmd.upAxis)
            await realignCloud(target, {
              modelBounds: activeModelId ? viewer.getModelBounds(activeModelId) : viewer.getModelBounds(),
              modelId: activeModelId,
              system,
            })
            break
          }
          case 'inspect': {
            // Arms the same click-to-read mode the panel's button arms; picks
            // are reported to the host through `pointcloud-picked`.
            setInspecting(cmd.inspect !== false)
            break
          }
          case 'display': {
            // The effect above pushes store changes into the shader, so writing
            // the store is enough — no second code path to keep in sync.
            if (cmd.display) {
              usePointCloudStore.getState().setDisplay(cmd.display as Partial<PointCloudDisplay>)
            }
            if (typeof cmd.renderBudget === 'number') {
              usePointCloudStore.getState().setRenderBudget(cmd.renderBudget)
            }
            break
          }
        }
        cmd.done?.(true)
      } catch (err) {
        cmd.done?.(false, err instanceof Error ? err.message : String(err))
      }
    })()
  // tDynamic is recreated every render; the effect only needs it to resolve an
  // error key at call time, so it is deliberately not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [viewerApiRef, activeModelId, sceneModels.length])

  const handleOffset = useCallback((patch: Parameters<typeof store.setOffset>[1]): void => {
    const cloud = usePointCloudStore.getState().clouds.find((c) => c.id === store.activeCloudId)
    if (!cloud) return
    usePointCloudStore.getState().setOffset(cloud.id, patch)
    const next = usePointCloudStore.getState().clouds.find((c) => c.id === cloud.id)
    if (next?.alignment) void getSystem()?.then((system) => system.setAlignment(cloud.id, next.alignment!))
  }, [store.activeCloudId, getSystem])

  /**
   * Re-derive the placement against whatever model is active now. The common
   * case is a scan opened before the IFC, which had nothing to align to.
   */
  const handleRealign = useCallback(async (): Promise<void> => {
    const viewer = viewerApiRef.current
    const id = store.activeCloudId
    if (!viewer || !id) return
    setRealigning(true)
    try {
      const system = await viewer.getPointClouds()
      await realignCloud(id, {
        system,
        modelId: activeModelId,
        modelBounds: activeModelId ? viewer.getModelBounds(activeModelId) : viewer.getModelBounds(),
      })
    } finally {
      setRealigning(false)
    }
  }, [viewerApiRef, store.activeCloudId, activeModelId])

  /**
   * Accept a proj4 definition for a CRS this build has no entry for, then
   * re-derive the placement. Reuses the map's CRS registry rather than adding a
   * second one — a definition registered here resolves everywhere.
   */
  const handleProj4Apply = useCallback(async (): Promise<void> => {
    const cloud = usePointCloudStore.getState().clouds.find((c) => c.id === store.activeCloudId)
    const code = cloud?.frame?.epsgCode
    const def = proj4Text.trim()
    if (!cloud || !code || !def) return

    setProj4Error(false)
    const reg = registerCustomProj4(code, def)
    if (!reg.ok) { setProj4Error(true); return }

    saveCloudProj4(cloud.fileKey, code, def)
    setProj4Text('')
    await handleRealign()
  }, [store.activeCloudId, proj4Text])

  /**
   * Flip which axis the scan treats as up, and re-derive the placement.
   *
   * This is the "my scan is lying on its side" button. It is one click rather
   * than a slider because the correction is always exactly 90° — expressing that
   * through a rotation control would be asking the user to find a right angle by
   * dragging, and they would land on 89.5°.
   */
  const handleUpAxis = useCallback((axis: 'y' | 'z'): void => {
    const cloud = usePointCloudStore.getState().clouds
      .find((c) => c.id === usePointCloudStore.getState().activeCloudId)
    if (!cloud) return
    usePointCloudStore.getState().setUpAxis(cloud.id, axis)
    // Re-run the ladder rather than patching the transform: the up axis feeds
    // the bbox comparisons the local rung makes, so the whole placement can
    // legitimately change once it is right.
    void (async () => {
      const viewer = viewerApiRef.current
      if (!viewer) return
      const system = await viewer.getPointClouds()
      await realignCloud(cloud.id, {
        modelBounds: activeModelId ? viewer.getModelBounds(activeModelId) : viewer.getModelBounds(),
        modelId: activeModelId,
        system,
      })
    })()
  }, [viewerApiRef, activeModelId])

  const handleResetOffset = useCallback((): void => {
    const id = store.activeCloudId
    if (!id) return
    usePointCloudStore.getState().resetOffset(id)
    const next = usePointCloudStore.getState().clouds.find((c) => c.id === id)
    if (next?.alignment) void getSystem()?.then((system) => system.setAlignment(id, next.alignment!))
  }, [store.activeCloudId, getSystem])

  const setDisplay = (patch: Partial<PointCloudDisplay>): void =>
    usePointCloudStore.getState().setDisplay(patch)

  // ── Inspect: click one point and read what the file recorded there ──────────
  useEffect(() => {
    if (!inspecting) return
    // Stand down while a measurement tool is armed. Scans are measurable now —
    // the cloud root is a raycast target, so @thatopen's tools reach it — and
    // this handler does not stopPropagation, so both would act on the same
    // click: one point read out here, one measurement vertex placed there. The
    // measurement is the deliberate action; inspect yields to it.
    if (measurementTool !== 'none') return
    const canvas = viewerApiRef.current?.getCanvas()
    if (!canvas) return

    const onClick = (e: MouseEvent): void => {
      void getSystem()?.then((system) => {
        const hit = system.pickPoint(e.clientX, e.clientY)
        setPicked(hit)
        setPickMissed(hit === null)
        // And to the shared inspector, so a scanned point is read in the same
        // place as an IFC element and an OSM building - rather than in a
        // readout only someone who already opened this panel would find.
        if (hit) {
          const cloud = usePointCloudStore.getState().clouds.find((c) => c.id === hit.cloudId)
          publishInspectorTarget({
            kind: 'point',
            cloudId: hit.cloudId,
            cloudName: cloud?.fileName ?? hit.cloudId,
            // The FILE's coordinates, not the scene's: the scene position has
            // the alignment transform baked in and matches nothing anybody has
            // on paper.
            position: hit.sourcePosition,
            unit: cloud?.frame?.unitScale === 1 ? 'm' : null,
            intensity: hit.intensity ?? undefined,
            classification: hit.classification ?? undefined,
          })
        }
        // Mirror the pick to an embedding host (SDK `pointcloud-picked`).
        // sourcePosition is the value a surveyor would quote, so it rides
        // alongside the scene position rather than instead of it.
        if (hit) {
          emitEmbedEvent('pointcloud-picked', {
            cloudId: hit.cloudId,
            position: { x: hit.position.x, y: hit.position.y, z: hit.position.z },
            sourcePosition: hit.sourcePosition,
            classification: hit.classification,
            intensity: hit.intensity,
            distance: hit.distance,
          })
        }
      })
    }
    // Capture phase: read the click before the viewer's own selection handling,
    // so inspecting a scan never doubles as selecting an IFC element behind it.
    canvas.addEventListener('click', onClick, true)
    canvas.style.cursor = 'crosshair'
    return () => {
      canvas.removeEventListener('click', onClick, true)
      canvas.style.cursor = ''
    }
  }, [inspecting, measurementTool, viewerApiRef, getSystem])

  // ── Visibility presets (model / scan / both) ────────────────────────────────
  const setIsolation = useCallback((mode: 'both' | 'cloud' | 'model'): void => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const modelsVisible = mode !== 'cloud'
    for (const model of sceneModels) {
      viewer.setModelVisible(model.id, modelsVisible)
      // Mirror it into sceneStore too, or the Scene panel keeps showing these
      // models as visible while they are hidden.
      useSceneStore.getState().setModelVisible(model.id, modelsVisible)
    }
    void getSystem()?.then((system) => {
      for (const cloud of usePointCloudStore.getState().clouds) {
        const visible = mode !== 'model'
        usePointCloudStore.getState().setVisible(cloud.id, visible)
        system.setVisible(cloud.id, visible)
      }
    })
  }, [viewerApiRef, sceneModels, getSystem])

  const attributes = activeCloud?.attributes
  const alignment = activeCloud?.alignment ?? null
  const needsTransform = alignment?.rung === 'manual' || alignment?.rung === 'local'

  return (
    <ViewportPanel
      open={store.panelOpen}
      onClose={() => store.setPanelOpen(false)}
      label={t('title')}
      // A sheet, not a dock: loading a scan, reading why it landed where it did
      // and nudging it are real work, not a three-button palette.
      mobile="sheet"
      widthPx={300}
      anchor="top"
      maxHeight="calc(100vh - 140px)"
    >
      {/* flex-1 + min-h-0: the only flex child of the shell, so it takes the
          available height and lets the scroll region below actually shrink —
          in the desktop card and inside the mobile sheet alike. */}
      <div className="flex flex-col flex-1 min-h-0" data-testid="point-cloud-panel">

          {/* Header — pinned. */}
          <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">
              {t('title')}
            </div>
            <button
              onClick={() => store.setPanelOpen(false)}
              className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
              title={t('close')}
              aria-label={t('close')}
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>

          {/* ── Load — pinned too, so it never scrolls out of reach ────────── */}
          <div className="p-2 flex flex-col gap-1.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttribute()}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'cursor-pointer rounded-[8px] border border-dashed px-2.5 py-3 text-center transition-colors',
                dragOver
                  ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                  : 'border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
              ].join(' ')}
            >
              <div className="text-[12px] font-medium text-[var(--text)]">
                {store.clouds.length === 0 ? t('load.drop') : t('load.another')}
              </div>
              <div className="text-[10px] font-mono text-[var(--text-faint)] mt-0.5">{t('load.formats')}</div>
              <div className="text-[10px] text-[var(--text-faint)] mt-1">{t('load.hint')}</div>
            </div>

            {sceneModels.length === 0 && store.clouds.length > 0 && (
              <Note>{t('status.noModel')}</Note>
            )}
          </div>

        {/* ── Everything below scrolls ─────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Sample scans ───────────────────────────────────────────────── */}
          {store.clouds.length === 0 && (
            <Section title={t('demos.title')}>
              <div className="text-[10px] text-[var(--text-faint)] leading-snug mb-0.5">{t('demos.hint')}</div>
              {DEMO_POINT_CLOUDS.map((demo) => {
                const busy = demoBusy === demo.id
                return (
                  <button
                    key={demo.id}
                    disabled={demoBusy !== null}
                    onClick={() => { void handleDemo(demo) }}
                    className={[
                      'w-full text-left rounded-[8px] border px-2 py-1.5 transition-colors',
                      busy
                        ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                        : 'border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11.5px] text-[var(--text)] truncate flex-1">{demo.name}</span>
                      <span className="text-[9.5px] font-mono text-[var(--text-faint)] shrink-0">
                        {formatDemoSize(demo.sizeBytes)}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-dim)] leading-snug mt-0.5">
                      {tDynamic(`demos.items.${demo.descriptionKey}`)}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap mt-1">
                      <DemoChip>{formatCount(demo.pointCount)}</DemoChip>
                      <DemoChip>{demo.format}</DemoChip>
                      {demo.hasColor && <DemoChip>{t('demos.chip.colour')}</DemoChip>}
                      {demo.hasClassification && <DemoChip>{t('demos.chip.classification')}</DemoChip>}
                      {demo.unit && <DemoChip>{demo.unit}</DemoChip>}
                      <DemoChip>
                        {demo.epsg ? t('demos.chip.crs', { code: demo.epsg }) : t('demos.chip.noCrs')}
                      </DemoChip>
                    </div>
                    {busy && (
                      <div className="mt-1 h-[2px] rounded-full bg-[var(--border)] overflow-hidden">
                        <div className="h-full bg-[var(--accent)] transition-[width]"
                          style={{ width: `${Math.round(demoProgress * 100)}%` }} />
                      </div>
                    )}
                  </button>
                )
              })}
              {/* One link per distinct source. Crediting them all to the first
                  one silently mis-attributed every sample that came from
                  somewhere else — and one of these corpora is CC BY, where the
                  attribution is the licence term, not a courtesy. */}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                <span className="text-[10px] text-[var(--text-faint)]">{t('demos.source')}</span>
                {DEMO_SOURCES.map((source) => (
                  <a
                    key={source.sourceUrl}
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] underline underline-offset-2"
                  >
                    {source.sourceLabel}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* ── Loaded clouds ──────────────────────────────────────────────── */}
          {store.clouds.length > 0 && (
            <div className="px-2 pb-2 flex flex-col gap-1">
              {store.clouds.map((cloud) => (
                <CloudRow
                  key={cloud.id}
                  cloud={cloud}
                  active={cloud.id === store.activeCloudId}
                  onSelect={() => usePointCloudStore.getState().setActiveCloud(cloud.id)}
                  onToggleVisible={() => handleVisible(cloud, !cloud.visible)}
                  onRemove={() => handleRemove(cloud)}
                  t={t}
                  tDynamic={tDynamic}
                />
              ))}
            </div>
          )}

          {/* ── Alignment ──────────────────────────────────────────────────── */}
          {activeCloud && alignment && (
            <Section title={t('align.title')}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[var(--text)]">{t(`align.rung.${alignment.rung}`)}</span>
                <Badge tint={CONFIDENCE_TINT[alignment.confidence] ?? '#888'}>
                  {t(`align.confidence.${alignment.confidence}`)}
                </Badge>
              </div>

              {activeCloud.frame?.epsgCode
                ? <div className="text-[10px] font-mono text-[var(--text-faint)] mt-1">
                    {t('align.crs', { code: activeCloud.frame.epsgCode })}
                  </div>
                : <div className="text-[10px] text-[var(--text-faint)] mt-1">{t('align.crsNone')}</div>}

              {activeCloud.frame && (
                <div className="text-[10px] font-mono text-[var(--text-faint)]">
                  {t('align.unit', { unit: formatUnit(activeCloud.frame.unitScale) })}
                  {' · '}
                  {t(activeCloud.frame.unitSource === 'declared' ? 'align.unitDeclared' : 'align.unitAssumed')}
                </div>
              )}

              {activeCloud.frame && activeCloud.frame.upAxisSource !== 'declared' && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-faint)] shrink-0">
                    {t('align.upAxis')}
                  </span>
                  <div className="flex rounded-[7px] overflow-hidden border border-[var(--border-strong)]">
                    {(['z', 'y'] as const).map((axis) => (
                      <button
                        key={axis}
                        onClick={() => handleUpAxis(axis)}
                        aria-pressed={activeCloud.frame!.upAxis === axis}
                        className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                          activeCloud.frame!.upAxis === axis
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast,#fff)]'
                            : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        {axis === 'z' ? t('align.upAxisZ') : t('align.upAxisY')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {activeCloud.frame && activeCloud.frame.upAxisSource === 'assumed' && (
                <div className="text-[10px] text-[var(--text-faint)] mt-1 leading-snug">
                  {t('align.upAxisGuessed')}
                </div>
              )}

              {alignment.reasons.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {alignment.reasons.map((key) => (
                    <li key={key} className="text-[10.5px] leading-snug text-[var(--text-dim)]">· {tDynamic(key)}</li>
                  ))}
                </ul>
              )}

              {alignment.confidence === 'manual' && <Note tone="warn">{t('align.manualWarning')}</Note>}

              {/* Actionable CRS gap: the file names a system we have no
                  definition for. Offer the fix instead of only the diagnosis. */}
              {alignment.reasons.includes('align.reason.cloudCrsUnknown') && activeCloud.frame?.epsgCode && (
                <div className="mt-1.5 flex flex-col gap-1 rounded-[8px] border border-[var(--border-strong)] p-2">
                  <div className="text-[9.5px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">
                    {t('align.crsForm.title')}
                  </div>
                  <div className="text-[10px] text-[var(--text-faint)] leading-snug">
                    {t('align.crsForm.hint', { code: activeCloud.frame.epsgCode })}
                  </div>
                  <input
                    value={proj4Text}
                    onChange={(e) => { setProj4Text(e.target.value); setProj4Error(false) }}
                    placeholder={t('align.crsForm.placeholder')}
                    spellCheck={false}
                    className="w-full px-1.5 py-1 rounded-[6px] text-[10px] font-mono bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                  />
                  {proj4Error && <Note tone="warn">{t('align.crsForm.invalid')}</Note>}
                  <SmallButton onClick={() => { void handleProj4Apply() }} disabled={!proj4Text.trim() || realigning}>
                    {t('align.crsForm.apply')}
                  </SmallButton>
                </div>
              )}

              <div className="flex gap-1 mt-1.5">
                <SmallButton onClick={() => setShowTransform((v) => !v)}>
                  {t('transform.title')}
                </SmallButton>
                {/* Only worth offering when there IS a model to align against and
                    the cloud was not already aligned to it. */}
                {sceneModels.length > 0 && activeCloud.status === 'ready' && (
                  <SmallButton onClick={() => { void handleRealign() }} disabled={realigning}>
                    {t('align.recompute')}
                  </SmallButton>
                )}
              </div>
            </Section>
          )}

          {/* ── Manual transform (only when the system had to guess) ────────── */}
          {activeCloud && alignment && (showTransform || needsTransform) && (
            <Section title={t('transform.title')}>
              <Slider label={t('transform.x')} value={alignment.offset.x} min={-200} max={200} step={0.05}
                unit="m" onChange={(v) => handleOffset({ x: v })} />
              <Slider label={t('transform.y')} value={alignment.offset.y} min={-100} max={100} step={0.05}
                unit="m" onChange={(v) => handleOffset({ y: v })} />
              <Slider label={t('transform.z')} value={alignment.offset.z} min={-200} max={200} step={0.05}
                unit="m" onChange={(v) => handleOffset({ z: v })} />
              <Slider label={t('transform.rotation')} value={alignment.offset.yawDeg} min={-180} max={180} step={0.5}
                unit="°" onChange={(v) => handleOffset({ yawDeg: v })} />
              <Slider label={t('transform.pitch')} value={alignment.offset.pitchDeg} min={-45} max={45} step={0.25}
                unit="°" onChange={(v) => handleOffset({ pitchDeg: v })} />
              <Slider label={t('transform.roll')} value={alignment.offset.rollDeg} min={-45} max={45} step={0.25}
                unit="°" onChange={(v) => handleOffset({ rollDeg: v })} />
              <Slider label={t('transform.scale')} value={alignment.offset.scaleMul} min={0.1} max={3} step={0.001}
                unit="×" digits={3} onChange={(v) => handleOffset({ scaleMul: v })} />
              <button
                onClick={handleResetOffset}
                className="mt-1 w-full px-2 py-1.5 rounded-[7px] text-[11px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
              >
                {t('transform.reset')}
              </button>
              <div className="text-[10px] text-[var(--text-faint)] mt-1 leading-snug">{t('transform.hint')}</div>
            </Section>
          )}

          {/* ── Appearance ─────────────────────────────────────────────────── */}
          {store.clouds.length > 0 && (
            <Section title={t('display.title')}>
              <div className="text-[10.5px] text-[var(--text-dim)]">{t('display.colorMode')}</div>
              <div className="flex flex-wrap gap-1">
                {COLOR_MODES.map((mode) => {
                  const available =
                    mode === 'flat' || mode === 'elevation' ||
                    (mode === 'rgb' && attributes?.color) ||
                    (mode === 'intensity' && attributes?.intensity) ||
                    (mode === 'classification' && attributes?.classification)
                  return (
                    <button
                      key={mode}
                      disabled={!available}
                      title={available ? undefined : t('display.modeUnavailable')}
                      onClick={() => setDisplay({ colorMode: mode })}
                      className={[
                        'px-2 py-1 rounded-[7px] text-[10.5px] font-medium transition-colors',
                        store.display.colorMode === mode
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]',
                        available ? '' : 'opacity-35 cursor-not-allowed',
                      ].join(' ')}
                    >
                      {t(`display.mode.${mode}`)}
                    </button>
                  )
                })}
              </div>

              {store.display.colorMode === 'flat' && (
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] text-[var(--text-dim)]">{t('display.flatColor')}</span>
                  <input
                    type="color"
                    value={`#${store.display.flatColor.toString(16).padStart(6, '0')}`}
                    onChange={(e) => setDisplay({ flatColor: parseInt(e.target.value.slice(1), 16) })}
                    className="h-5 w-8 rounded-[4px] border border-[var(--border-strong)] bg-transparent cursor-pointer"
                  />
                </label>
              )}

              <Slider label={t('display.pointSize')} value={store.display.pointSize} min={0.5} max={10} step={0.1}
                unit="px" onChange={(v) => setDisplay({ pointSize: v })} />
              <Slider label={t('display.opacity')} value={store.display.opacity} min={0.05} max={1} step={0.01}
                digits={2} onChange={(v) => setDisplay({ opacity: v })} />
              <Slider label={t('display.density')} value={store.display.density} min={0.05} max={1} step={0.01}
                digits={2} onChange={(v) => setDisplay({ density: v })} />
              <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('display.densityHint')}</div>

              {attributes?.confidence && (
                <>
                  <Slider label={t('display.confidence')} value={store.display.confidenceThreshold}
                    min={0} max={1} step={0.01} digits={2}
                    onChange={(v) => setDisplay({ confidenceThreshold: v })} />
                  <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('display.confidenceHint')}</div>
                </>
              )}

              <div className="flex gap-1 mt-1">
                <Toggle active={store.display.attenuate} onClick={() => setDisplay({ attenuate: !store.display.attenuate })}>
                  {t('display.attenuate')}
                </Toggle>
                <Toggle active={store.display.round} onClick={() => setDisplay({ round: !store.display.round })}>
                  {t('display.round')}
                </Toggle>
              </div>
            </Section>
          )}

          {/* ── Inspect ────────────────────────────────────────────────────── */}
          {store.clouds.length > 0 && (
            <Section title={t('inspect.title')}>
              <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('inspect.hint')}</div>
              <div className="flex gap-1">
                <SmallButton onClick={() => {
                  setInspecting((v) => !v)
                  setPicked(null); setPickMissed(false)
                }}>
                  {inspecting ? t('inspect.active') : t('inspect.enable')}
                </SmallButton>
                {picked && <SmallButton onClick={() => { setPicked(null); setPickMissed(false) }}>
                  {t('inspect.clear')}
                </SmallButton>}
              </div>

              {pickMissed && <Note>{t('inspect.none')}</Note>}

              {picked && (
                <div className="mt-1 flex flex-col gap-0.5 text-[10px] font-mono text-[var(--text-dim)]">
                  <Field label={t('inspect.scene')}
                    value={`${picked.position.x.toFixed(2)}, ${picked.position.y.toFixed(2)}, ${picked.position.z.toFixed(2)}`} />
                  <Field label={t('inspect.source')}
                    value={`${picked.sourcePosition.x.toFixed(3)}, ${picked.sourcePosition.y.toFixed(3)}, ${picked.sourcePosition.z.toFixed(3)}`} />
                  {picked.classification !== null && attributes?.classification && (
                    <Field label={t('inspect.classification')} value={String(picked.classification)} />
                  )}
                  {picked.intensity !== null && attributes?.intensity && (
                    <Field label={t('inspect.intensity')} value={String(picked.intensity)} />
                  )}
                  <Field label={t('inspect.distance')} value={`${picked.distance.toFixed(2)} m`} />
                </div>
              )}
            </Section>
          )}

          {/* ── View ───────────────────────────────────────────────────────── */}
          {store.clouds.length > 0 && (
            <Section title={t('view.title')}>
              <div className="flex gap-1">
                <SmallButton onClick={() => { void getSystem()?.then((s) => s.frame(store.activeCloudId ?? undefined)) }}>
                  {t('view.fitCloud')}
                </SmallButton>
                <SmallButton onClick={() => { void getSystem()?.then((s) => s.frameWithModel()) }}>
                  {t('view.fitBoth')}
                </SmallButton>
              </div>
              {sceneModels.length > 0 && (
                <div className="flex gap-1 mt-1">
                  <SmallButton onClick={() => setIsolation('both')}>{t('view.both')}</SmallButton>
                  <SmallButton onClick={() => setIsolation('cloud')}>{t('view.isolateCloud')}</SmallButton>
                  <SmallButton onClick={() => setIsolation('model')}>{t('view.isolateModel')}</SmallButton>
                </div>
              )}

              {stats && stats.pointCount > 0 && (
                <div className="mt-1.5 text-[10px] font-mono text-[var(--text-faint)] leading-relaxed">
                  <div>{t('status.points', { count: formatCount(stats.pointCount) })}</div>
                  <div>{t('status.pointsDrawn', {
                    drawn: formatCount(stats.drawnCount), total: formatCount(stats.pointCount),
                  })}</div>
                  <div>{t('status.chunks', { count: stats.chunkCount })}</div>
                  <div>{t('status.memory', { mb: Math.round(stats.gpuBytes / 1048576) })}</div>
                </div>
              )}
            </Section>
          )}
        </div>
      </div>
    </ViewportPanel>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-2 border-t border-[var(--border)] flex flex-col gap-1">
      <div className="text-[9.5px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">{title}</div>
      {children}
    </div>
  )
}

function Badge({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-[5px] text-[9.5px] font-medium border"
      style={{ color: tint, borderColor: `${tint}55`, background: `${tint}18` }}
    >
      {children}
    </span>
  )
}

/** Compact fact chip on a sample-scan card — every value read from the file. */
function DemoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1 py-[1px] rounded-[4px] text-[9px] font-mono text-[var(--text-faint)] border border-[var(--border)]">
      {children}
    </span>
  )
}

/** Label + value row for the inspect read-out. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--text-faint)] shrink-0">{label}</span>
      <span className="text-[var(--text)] text-right break-all">{value}</span>
    </div>
  )
}

function Note({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const color = tone === 'warn' ? '#F5A623' : 'var(--text-faint)'
  return (
    <div className="text-[10px] leading-snug mt-1" style={{ color }}>{children}</div>
  )
}

function SmallButton(
  { onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean },
) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 px-2 py-1.5 rounded-[7px] text-[10.5px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-40 transition-colors whitespace-nowrap"
    >
      {children}
    </button>
  )
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 px-2 py-1 rounded-[7px] text-[10.5px] font-medium transition-colors',
        active ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  digits?: number
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, unit, digits = 1, onChange }: SliderProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-[var(--text-dim)]">{label}</span>
        <span className="text-[10px] font-mono tabular-nums text-[var(--text-faint)]">
          {value.toFixed(digits)}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  )
}

interface CloudRowProps {
  cloud: PointCloudEntry
  active: boolean
  onSelect: () => void
  onToggleVisible: () => void
  onRemove: () => void
  t: TFunction<'pointcloud'>
  tDynamic: (key: string, opts?: Record<string, unknown>) => string
}

function CloudRow({ cloud, active, onSelect, onToggleVisible, onRemove, t, tDynamic }: CloudRowProps) {
  const parsing = cloud.status === 'parsing'
  const failed = cloud.status === 'error'

  return (
    <div
      onClick={onSelect}
      className={[
        'rounded-[8px] border px-2 py-1.5 cursor-pointer transition-colors',
        active ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] text-[var(--text)] truncate">{cloud.fileName}</div>
          <div className="text-[9.5px] font-mono text-[var(--text-faint)]">
            {failed
              ? tDynamic(cloud.errorKey ?? 'error.parseFailed')
              : parsing
                ? `${t('load.parsingShort')} ${cloud.progress}%`
                : t('status.points', { count: formatCount(cloud.pointCount) })}
          </div>
        </div>
        {!failed && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleVisible() }}
            title={cloud.visible ? t('actions.visible') : t('actions.hidden')}
            className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors px-1"
          >
            {cloud.visible ? '◉' : '○'}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title={parsing ? t('actions.cancel') : t('actions.remove')}
          className="text-[var(--text-faint)] hover:text-[#E5484D] transition-colors px-1"
        >
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      {parsing && (
        <div className="mt-1 h-[2px] rounded-full bg-[var(--border)] overflow-hidden">
          <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${cloud.progress}%` }} />
        </div>
      )}
      {cloud.truncated && <Note tone="warn">{t('status.truncated', { count: formatCount(cloud.pointCount) })}</Note>}
    </div>
  )
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} k`
  return String(n)
}

function formatUnit(unitScale: number): string {
  if (Math.abs(unitScale - 1) < 1e-9) return 'm'
  if (Math.abs(unitScale - 0.001) < 1e-9) return 'mm'
  if (Math.abs(unitScale - 0.01) < 1e-9) return 'cm'
  if (Math.abs(unitScale - 0.3048) < 1e-6) return 'ft'
  return `${unitScale} m`
}
