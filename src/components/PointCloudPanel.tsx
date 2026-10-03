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
import { useIsMobile } from '../hooks/useIsMobile'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { useSceneStore } from '../stores/sceneStore'
import { useUIStore } from '../stores/uiStore'
import { cancelPointCloud, realignCloud, budgetUsage } from '../lib/pointcloud/pc-runner'
import PointBudgetMeter from './PointBudgetMeter'
import { submitPointClouds, loadPointCloudsOnce, describeSourceError, cancelLoadsOfKind } from '../lib/loading'
import { useLoadingStore } from '../stores/loadingStore'
import { saveCloudProj4 } from '../lib/pointcloud/pc-align'
import { registerCustomProj4 } from '../lib/geo/crs'
import { acceptAttribute } from '../lib/pointcloud/pc-format'
import { toast } from '../stores/toastStore'
import { createLogger } from '../lib/logger'
import { appBus } from '../lib/event-bus'
import { publishInspectorTarget } from '../lib/inspector'
import { emitEmbedEvent } from '../lib/url-params'
import { TemporalReplayController, type TemporalReplaySnapshot } from '../lib/pointcloud/temporal-replay'
import {
  SimulatedLiveTransport,
  type SimulatedTransportMode, type SimulatedTransportSnapshot,
} from '../lib/pointcloud/simulated-live-transport'
import {
  DEMO_POINT_CLOUDS, DEMO_SOURCES, formatDemoSize, type DemoPointCloud,
} from '../demo-models/point-clouds'
import {
  getTemporalLidarShowcase, TEMPORAL_LIDAR_SHOWCASES, type TemporalShowcaseId,
} from '../demo-models/realtime-lidar-showcases'
import {
  diagnoseCloud, bestColorMode, colorModeAvailable, matchPreset,
  APPEARANCE_PRESETS, UNIT_FIX_SCALE,
  type BoxCS, type FixId, type Issue, type AppearancePresetId,
} from '../lib/pointcloud/pc-diagnostics'
import type { ViewerAPI } from '../lib/viewer'
import type { PointCloudSystemAPI, CloudStats, PickedPoint } from '../lib/pointcloud/point-cloud-system'
import type {
  PointCloudEntry, PointColorMode, PointCloudDisplay,
} from '../lib/pointcloud/pc-types'

interface PointCloudPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onLoadCompanionModel?: (demoModelId?: string) => Promise<void>
}

const log = createLogger('PointCloudPanel')

const COLOR_MODES: PointColorMode[] = ['rgb', 'intensity', 'elevation', 'classification', 'flat']
type PanelTab = 'appearance' | 'placement' | 'view' | 'analyze' | 'samples' | 'help'
const PANEL_TABS: PanelTab[] = ['appearance', 'placement', 'view', 'analyze', 'samples', 'help']
/**
 * One-click analysis set-ups. Each is a combination of the shader filters
 * (slice / classes / contours), a colour mode, a camera and — for the
 * clearance — the measurement tool, so a task starts from a readable view
 * instead of from six sliders. Every one is undone by "Clear filters".
 */
type RecipeId = 'floorPlan' | 'terrain' | 'vegetation' | 'slab' | 'scanVsBim' | 'clearance'
const RECIPES: RecipeId[] = ['floorPlan', 'terrain', 'vegetation', 'slab', 'scanVsBim', 'clearance']
/** ASPRS classes shown in the filter, in the order people look for them. */
const FILTER_CLASSES = [2, 6, 3, 4, 5, 11, 9, 7, 1, 10, 13, 14, 15, 0, 8, 12]
const VEGETATION_NOISE_MASK = (1 << 3) | (1 << 4) | (1 << 5) | (1 << 7)
const ALL_CLASSES_MASK = 0xffff
const CONTOUR_STEPS = [0.01, 0.02, 0.05, 0.1, 0.5, 1, 5]
/** Swatches for the class chips — the shader palette's values (pc-material). */
const CLASS_SWATCH = [
  '#999ead', '#8c919e', '#8c6647', '#6b9e59', '#54b361', '#338c47', '#d97359', '#e6404d',
  '#b3b359', '#4d8ce6', '#bf80d9', '#737380', '#a6a6b3', '#e6bf59', '#f2a640', '#cc9966',
]
/** A contour step that gives roughly fifteen lines over a height range. */
function niceStep(range: number): number {
  const raw = Math.max(range, 0.1) / 15
  return [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50].find((s) => s >= raw) ?? 100
}
type HelpSymptom = 'sideways' | 'invisible' | 'wrongSize' | 'misplaced' | 'colours' | 'sparse' | 'blobby' | 'slow' | 'broken'
const HELP_SYMPTOMS: HelpSymptom[] = ['sideways', 'invisible', 'wrongSize', 'misplaced', 'colours', 'sparse', 'blobby', 'slow', 'broken']
const PRESET_IDS: AppearancePresetId[] = ['balanced', 'detail', 'presentation', 'performance']
/** Draw-budget steps behind the Advanced quality control. */
const QUALITY_LEVELS = [
  { id: 'low', budget: 1_500_000 },
  { id: 'medium', budget: 4_000_000 },
  { id: 'high', budget: 8_000_000 },
  { id: 'ultra', budget: 14_000_000 },
] as const
/** Samples shown before "show all" — the featured ones first. */
const SAMPLES_COLLAPSED = 4
const SEVERITY_TINT: Record<Issue['severity'], string> = { error: '#E5484D', warn: '#F5A623', info: '#5E9ED6' }
type DemoViewMode = 'point-cloud' | 'ifc' | 'overlay' | 'xray' | 'scan-vs-bim' | 'comparison'

/** Confidence → badge colour. A guess must never look like a measurement. */
const CONFIDENCE_TINT: Record<string, string> = {
  exact: '#30A46C',
  high: '#5E9ED6',
  approximate: '#F5A623',
  manual: '#E5484D',
}

/**
 * Follow a job's download on the demo chip that started it — the Loading
 * Center has the full row; the chip only needs its bar. Resolves once the
 * download is over (or the job ended without one): the chip is free again
 * then, even if the job still waits for a decode slot or the scene's anchor.
 */
function followDownload(jobId: string, onFraction: (fraction: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const check = (s: ReturnType<typeof useLoadingStore.getState>): boolean => {
      const job = s.jobs.find((j) => j.id === jobId)
      if (!job) return true
      const download = job.phases.find((p) => p.id === 'download')
      if (download) onFraction(download.status === 'done' ? 1 : download.fraction ?? 0)
      const downloading = download !== undefined && (download.status === 'pending' || download.status === 'active')
      return !downloading || !['queued', 'running', 'waiting', 'held'].includes(job.status)
    }
    if (check(useLoadingStore.getState())) { resolve(); return }
    const off = useLoadingStore.subscribe((s) => { if (check(s)) { off(); resolve() } })
  })
}

export default function PointCloudPanel({
  viewerApiRef, onLoadCompanionModel,
}: PointCloudPanelProps) {
  const { t } = useTranslation('pointcloud')
  // Runtime-built keys (reader error codes, alignment reasons) can't be proved
  // against the typed resource map — same escape hatch GeoPanel uses.
  const tDynamic = (key: string, opts?: Record<string, unknown>): string =>
    t(key, { defaultValue: key, ...opts })

  /**
   * An error key the namespace knows, or a message a person can act on.
   *
   * i18next echoes back a key it does not have, so an unmapped failure used to
   * put the literal string "error.somethingWeird" in a toast. That is worse than
   * a generic message: it looks like a crash, it is untranslated, and it tells
   * the user nothing they can do. The specific code still reaches the console.
   */
  const describeError = useCallback((key: string | null | undefined): string => {
    if (!key) return t('error.parseFailed')
    const text = t(key as never, { defaultValue: key })
    if (text !== key) return text
    log.warn(`unmapped point cloud error key: ${key}`)
    return t('error.parseFailed')
  }, [t])
  const store = usePointCloudStore()
  const sceneModels = useSceneStore((s) => s.models)
  const activeModelId = useSceneStore((s) => s.activeModelId)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tablistRef = useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState<CloudStats | null>(null)
  // The resident-point budget as the runner's ledger sees it (whole-file scans
  // and the reservations of the ones still loading) — why a scan waits or
  // comes out truncated, shown before it happens rather than after.
  const [budget, setBudget] = useState<{ resident: number; reserved: number; max: number } | null>(null)
  const [showTransform, setShowTransform] = useState(false)
  // Height range the shader's slice and elevation ramp work in (all scans, scene Y).
  const [elevRange, setElevRange] = useState<{ min: number; max: number } | null>(null)
  // A recipe that needs a height (slab flatness) waits here for the next pick.
  const pendingRecipeRef = useRef<RecipeId | null>(null)
  const [boxes, setBoxes] = useState<{ key: string; cloudBox: BoxCS | null; modelBox: BoxCS | null } | null>(null)
  const [tab, setTab] = useState<PanelTab>('appearance')
  const [showAllSamples, setShowAllSamples] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState<HelpSymptom | null>(null)
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
  const [demoViewMode, setDemoViewMode] = useState<DemoViewMode>('overlay')
  const [comparisonBlend, setComparisonBlend] = useState(0.5)
  const replayControllerRef = useRef<TemporalReplayController | null>(null)
  const replayTransportRef = useRef<SimulatedLiveTransport | null>(null)
  const [replayState, setReplayState] = useState<TemporalReplaySnapshot | null>(null)
  const [transportMode, setTransportMode] = useState<SimulatedTransportMode>('stable')
  const [transportState, setTransportState] = useState<SimulatedTransportSnapshot | null>(null)
  const [replayPointCount, setReplayPointCount] = useState(0)
  const [replayTruncated, setReplayTruncated] = useState(0)
  const [replayBusy, setReplayBusy] = useState(false)
  const [replayError, setReplayError] = useState(false)
  const [mcapBusy, setMcapBusy] = useState(false)
  const [mcapError, setMcapError] = useState(false)
  const [selectedReplayId, setSelectedReplayId] = useState<TemporalShowcaseId>('operations-pavilion')
  const [runningReplayId, setRunningReplayId] = useState<TemporalShowcaseId | null>(null)

  const activeCloud = store.clouds.find((c) => c.id === store.activeCloudId) ?? null
  const selectedShowcase = getTemporalLidarShowcase(selectedReplayId)
  const activeShowcase = runningReplayId
    ? getTemporalLidarShowcase(runningReplayId)
    : selectedShowcase
  const companionLoaded = sceneModels.some((model) => model.fileName === activeShowcase.modelFileName)

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

  // ── Poll the render stats while the panel is open ──────────────────────────
  // Only while it is OPEN: the panel stays mounted when closed (it owns the SDK
  // bridge), and a once-a-second re-render of every section nobody can see was
  // pure waste. Each read only sets state when a value actually moved, so an
  // idle scene does not re-render at all. The same tick gathers the boxes the
  // check-up compares (scan size, distance to the model).
  useEffect(() => {
    if (store.clouds.length === 0) { setStats(null); setBudget(null); setBoxes(null); return }
    if (!store.panelOpen) return
    let cancelled = false
    const read = (): void => {
      if (typeof document !== 'undefined' && document.hidden) return
      void getSystem()?.then((system) => {
        if (cancelled) return
        const next = system.getStats()
        setStats((prev) => prev && prev.pointCount === next.pointCount && prev.drawnCount === next.drawnCount &&
          prev.chunkCount === next.chunkCount && prev.gpuBytes === next.gpuBytes ? prev : next)
        const id = usePointCloudStore.getState().activeCloudId
        const b = id ? system.getBounds(id) : null
        const viewer = viewerApiRef.current
        const modelId = useSceneStore.getState().activeModelId
        const cloudBox: BoxCS | null = b ? {
          center: { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 },
          size: { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z },
        } : null
        const modelBox = viewer && useSceneStore.getState().models.length > 0
          ? (modelId ? viewer.getModelBounds(modelId) : viewer.getModelBounds()) : null
        const key = JSON.stringify([cloudBox, modelBox], (_k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v)
        setBoxes((prev) => prev?.key === key ? prev : { key, cloudBox, modelBox })
        const all = system.getBounds()
        if (all) {
          const next = { min: Math.round(all.min.y * 100) / 100, max: Math.round(all.max.y * 100) / 100 }
          setElevRange((prev) => prev && prev.min === next.min && prev.max === next.max ? prev : next)
        }
      })
      const nextBudget = budgetUsage()
      setBudget((prev) => prev && prev.resident === nextBudget.resident && prev.reserved === nextBudget.reserved &&
        prev.max === nextBudget.max ? prev : nextBudget)
    }
    read()
    const iv = setInterval(read, 1000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [store.clouds.length, store.panelOpen, store.activeCloudId, getSystem, viewerApiRef])

  // ── Colour fallback ─────────────────────────────────────────────────────────
  // Display settings are shared and persisted, so a scan with no RGB used to
  // open in "Scan colour" and draw as one flat blob — the single most common
  // "my point cloud looks broken" report. When a scan lands, switch to the most
  // informative mode it actually carries. Once per scan: after that the user's
  // choice stands.
  const colourCheckedRef = useRef(new Set<string>())
  useEffect(() => {
    const cloud = store.clouds.find((c) => c.id === store.activeCloudId)
    if (!cloud || cloud.status !== 'ready' || colourCheckedRef.current.has(cloud.id)) return
    colourCheckedRef.current.add(cloud.id)
    const mode = usePointCloudStore.getState().display.colorMode
    if (!colorModeAvailable(mode, cloud.attributes)) {
      usePointCloudStore.getState().setDisplay({ colorMode: bestColorMode(cloud.attributes) })
    }
  }, [store.clouds, store.activeCloudId])

  // ── Loading ─────────────────────────────────────────────────────────────────
  // Every scan is a job in the loading queue, one per file — the same path a
  // drop on the viewer, ?scan= and the SDK take. The queue decides what
  // decodes when (the decode lane, the resident-point budget), aligns each scan
  // against the active model once the model that anchors the scene is in,
  // shows real progress in the Loading Center, frames the first scan of an
  // empty scene, and toasts a failure itself (the loading hooks), so this
  // panel neither loops over files nor reports errors of its own. The files
  // used to go through the runner one at a time with the alignment inputs
  // captured here, before the model they belonged to had landed.
  const handleFiles = useCallback((files: FileList | File[]): void => {
    const list = Array.from(files)
    if (list.length === 0) return
    // A scan already in the scene is framed and offered again, not decoded twice.
    void loadPointCloudsOnce(list.map((file) => ({ source: { type: 'file', file } })), { origin: 'upload' })
  }, [])

  /**
   * A public sample, loaded as a URL job: the SAME path a host's
   * addPointCloudFromUrl takes, with the URL as the scan's identity (a saved
   * offset survives a reload). The chip's bar follows the job's download.
   */
  const handleDemo = useCallback(async (demo: DemoPointCloud): Promise<void> => {
    setDemoBusy(demo.id)
    setDemoProgress(0)
    // A demo already open is shown, not downloaded again.
    const [handle] = await loadPointCloudsOnce(
      [{ source: { type: 'url', url: demo.url, fileName: demo.fileName } }],
      { origin: 'demo' },
    )
    try {
      if (handle) await followDownload(handle.id, setDemoProgress)
    } finally {
      setDemoBusy(null)
      setDemoProgress(0)
    }
  }, [])

  const stopReplay = useCallback((): void => {
    replayControllerRef.current?.dispose()
    replayControllerRef.current = null
    replayTransportRef.current = null
    setReplayState(null)
    setTransportState(null)
    setReplayPointCount(0)
    setReplayTruncated(0)
    setRunningReplayId(null)
  }, [])

  /**
   * Exhibition path: load the companion IFC, create ONE resident dynamic
   * buffer, and drive it with a finite recorded-style timeline. The geometry is
   * synthetic and the UI says so; what this proves is the temporal workflow,
   * not a physical sensor connection.
   */
  const handleStartReplay = useCallback(async (requestedId?: string): Promise<void> => {
    const viewer = viewerApiRef.current
    if (!viewer || replayBusy) return
    const showcase = getTemporalLidarShowcase(requestedId ?? selectedReplayId)
    setSelectedReplayId(showcase.id)
    setReplayBusy(true)
    setReplayError(false)
    try {
      const alreadyLoaded = useSceneStore.getState().models
        .some((model) => model.fileName === showcase.modelFileName)
      if (!alreadyLoaded && onLoadCompanionModel) await onLoadCompanionModel(showcase.demoModelId)
      const system = await viewer.getPointClouds()

      stopReplay()
      for (const item of TEMPORAL_LIDAR_SHOWCASES) {
        system.remove(item.cloudId)
        usePointCloudStore.getState().removeCloud(item.cloudId)
      }

      const source = showcase.createSource()
      const transport = new SimulatedLiveTransport(source.capacity)
      transport.setMode(transportMode)
      replayTransportRef.current = transport
      const companion = useSceneStore.getState().models
        .find((model) => model.fileName === showcase.modelFileName)
      const alignment = showcase.align(
        companion ? viewer.getModelBounds(companion.id) : viewer.getModelBounds(),
      )
      system.create(showcase.cloudId, alignment, source.sourceFrame.origin)
      system.addDynamicBuffer(showcase.cloudId, source.capacity)

      usePointCloudStore.getState().addCloud({
        id: showcase.cloudId,
        fileName: tDynamic(`replay.showcases.${showcase.copyKey}.name`),
        sourceKind: 'temporal-replay',
        fileSize: 0,
        // The frame is already GPU-ready rather than parsed from a container;
        // PLY is retained only as the closest immutable format in the existing
        // store union. sourceKind is the product-facing truth.
        format: 'ply',
        status: 'ready',
        errorKey: null,
        progress: 100,
        pointCount: source.basePointCount,
        declaredCount: source.basePointCount,
        truncated: false,
        streamErrorKey: null,
        visible: true,
        frame: source.sourceFrame,
        attributes: { color: true, intensity: true, classification: true, confidence: false },
        alignment,
        alignedToModelId: companion?.id ?? null,
        fileKey: `demo:${showcase.cloudId}:v1`,
        loadedAt: Date.now(),
      })

      // A translucent IFC makes the moving returns legible while keeping the
      // designed geometry available for comparison.
      for (const model of useSceneStore.getState().models) {
        viewer.setModelVisible(model.id, true)
        viewer.setModelOpacity(model.fileName === showcase.modelFileName ? showcase.modelOpacity : 0.18, model.id)
        useSceneStore.getState().setModelVisible(model.id, true)
      }
      usePointCloudStore.getState().setDisplay({
        colorMode: 'rgb', pointSize: showcase.pointSize, opacity: 0.94,
        density: 1, attenuate: false, round: true,
      })
      system.setDisplay(usePointCloudStore.getState().display)

      const controller = new TemporalReplayController({
        durationMs: showcase.durationMs,
        frameRate: showcase.frameRate,
        createFrame: (positionMs, sequence) => source.sample(positionMs, sequence),
        onFrame: (frame, state) => {
          setReplayState(state)
          transport.transmit(frame, (decoded) => {
            const update = system.updateDynamicFrame(showcase.cloudId, decoded)
            if (!update) return
            setReplayPointCount(update.count)
            setReplayTruncated(update.truncated)
          })
          setTransportState(transport.snapshot())
        },
      })
      replayControllerRef.current = controller
      setRunningReplayId(showcase.id)
      controller.play()
      setReplayState(controller.snapshot())
      setTransportState(transport.snapshot())
      system.frameWithModel()
      // `frameWithModel` preserves the current viewing direction. That is
      // useful after manual work, but a fresh article iframe inherits the
      // orthographic-looking side direction used while its IFC was loading,
      // flattening a long tunnel into a thin strip. Start exhibition replays
      // from the same readable 3D preset exposed by the camera menu; visitors
      // can orbit, pan and dolly from there immediately.
      if (showcase.camera) {
        const origin = alignment.origin
        viewer.setCameraLookAt(
          {
            x: origin.x + showcase.camera.position.x,
            y: origin.y + showcase.camera.position.y,
            z: origin.z + showcase.camera.position.z,
          },
          {
            x: origin.x + showcase.camera.target.x,
            y: origin.y + showcase.camera.target.y,
            z: origin.z + showcase.camera.target.z,
          },
        )
      } else {
        viewer.setCameraPreset('iso')
      }
    } catch (error) {
      log.warn('LiDAR temporal replay could not start:', error)
      setReplayError(true)
    } finally {
      setReplayBusy(false)
    }
  // Runtime catalogue keys are resolved by tDynamic; `t` invalidates the
  // callback when the active language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApiRef, replayBusy, selectedReplayId, onLoadCompanionModel, stopReplay, t, transportMode])

  const handleTransportMode = useCallback((mode: SimulatedTransportMode): void => {
    setTransportMode(mode)
    const transport = replayTransportRef.current
    if (!transport) return
    transport.setMode(mode)
    setTransportState(transport.snapshot())
  }, [])

  const handleDownloadReplayMcap = useCallback(async (): Promise<void> => {
    if (mcapBusy) return
    setMcapBusy(true)
    setMcapError(false)
    try {
      const { createMcapPointRecordingBlob } = await import('../lib/pointcloud/mcap-point-recording')
      const showcase = activeShowcase
      const source = showcase.createSource()
      // 2 fps keeps the portable fixture compact; the on-screen replay remains
      // 12 fps. Frames are yielded and encoded one at a time because the source
      // deliberately reuses its typed arrays.
      function* frames() {
        let sequence = 1
        for (let positionMs = 0; positionMs <= showcase.durationMs; positionMs += 500) {
          yield source.sample(positionMs, sequence++)
        }
      }
      const blob = await createMcapPointRecordingBlob(frames())
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = showcase.mcapFileName
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(href), 0)
    } catch (error) {
      log.warn('MCAP point replay example could not be created:', error)
      setMcapError(true)
    } finally {
      setMcapBusy(false)
    }
  }, [mcapBusy, activeShowcase])

  const handleReplayToggle = useCallback((): void => {
    const controller = replayControllerRef.current
    if (!controller) return
    if (controller.snapshot().status === 'playing') controller.pause()
    else controller.play()
    setReplayState(controller.snapshot())
  }, [])

  const handleReplaySeek = useCallback((positionMs: number): void => {
    replayControllerRef.current?.seek(positionMs)
    if (replayControllerRef.current) setReplayState(replayControllerRef.current.snapshot())
  }, [])

  const handleReplaySpeed = useCallback((speed: number): void => {
    replayControllerRef.current?.setSpeed(speed)
    if (replayControllerRef.current) setReplayState(replayControllerRef.current.snapshot())
  }, [])

  const handleReplayLatest = useCallback((): void => {
    replayControllerRef.current?.jumpToLatest()
    if (replayControllerRef.current) setReplayState(replayControllerRef.current.snapshot())
  }, [])

  const handleReplayLoop = useCallback((): void => {
    const controller = replayControllerRef.current
    if (!controller) return
    controller.setLoop(!controller.snapshot().loop)
    setReplayState(controller.snapshot())
  }, [])

  useEffect(() => () => {
    replayControllerRef.current?.dispose()
  }, [])

  const handleRemove = useCallback((cloud: PointCloudEntry): void => {
    if (TEMPORAL_LIDAR_SHOWCASES.some((showcase) => showcase.cloudId === cloud.id)) stopReplay()
    cancelPointCloud(cloud.id)
    void getSystem()?.then((system) => system.remove(cloud.id))
    usePointCloudStore.getState().removeCloud(cloud.id)
  }, [getSystem, stopReplay])

  const handleVisible = useCallback((cloud: PointCloudEntry, visible: boolean): void => {
    if (TEMPORAL_LIDAR_SHOWCASES.some((showcase) => showcase.cloudId === cloud.id) && !visible) {
      replayControllerRef.current?.pause()
      if (replayControllerRef.current) setReplayState(replayControllerRef.current.snapshot())
    }
    usePointCloudStore.getState().setVisible(cloud.id, visible)
    void getSystem()?.then((system) => system.setVisible(cloud.id, visible))
  }, [getSystem])

  // ── SDK bridge: `sdk:pointcloud` from the embed postMessage handler ─────────
  // Display, placement, inspection and replay live here, so the embed bridge
  // delegates those. LOADING does not: App submits scans to the loading queue
  // itself (the `add` case below only serves any other emitter, through the
  // same queue), and without this panel — the client skin — App removes and
  // clears scans through the queue as well.
  useEffect(() => appBus.on('sdk:pointcloud', (cmd) => {
    void (async () => {
      try {
        const viewer = viewerApiRef.current
        if (!viewer) throw new Error('Viewer not ready')
        const system = await viewer.getPointClouds()

        switch (cmd.action) {
          case 'replay': {
            await handleStartReplay(cmd.replayId)
            break
          }
          case 'add': {
            // App submits scans to the loading queue itself now; this stays
            // for any other emitter of the command, and takes the same path.
            if (!cmd.file) throw new Error('No point cloud data provided')
            const [handle] = submitPointClouds(
              [{ source: { type: 'file', file: cmd.file }, sourceUrl: cmd.sourceUrl }],
              { origin: 'sdk' },
            )
            const outcome = await handle.settled
            if (outcome.status === 'cancelled') throw new Error('Load cancelled')
            if (outcome.status === 'failed') throw new Error(await describeSourceError(outcome.error))
            cmd.done?.(true, outcome.resultId)
            return
          }
          case 'remove': {
            if (!cmd.cloudId) throw new Error('No cloudId provided')
            if (TEMPORAL_LIDAR_SHOWCASES.some((showcase) => showcase.cloudId === cmd.cloudId)) stopReplay()
            cancelPointCloud(cmd.cloudId)
            system.remove(cmd.cloudId)
            usePointCloudStore.getState().removeCloud(cmd.cloudId)
            break
          }
          case 'clear': {
            // The loads still in the queue too: they have no entry yet, and
            // would land right after the clear.
            cancelLoadsOfKind('pointcloud')
            if (usePointCloudStore.getState().clouds.some((cloud) =>
              TEMPORAL_LIDAR_SHOWCASES.some((showcase) => showcase.cloudId === cloud.id))) {
              stopReplay()
            }
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
              modelCoordination: viewer.getModelCoordination(activeModelId ?? undefined),
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
  }), [viewerApiRef, activeModelId, sceneModels.length, stopReplay, handleStartReplay, describeError])

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
        modelCoordination: viewer.getModelCoordination(activeModelId ?? undefined),
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
        modelCoordination: viewer.getModelCoordination(activeModelId ?? undefined),
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
        const pending = pendingRecipeRef.current
        if (hit && pending) {
          pendingRecipeRef.current = null
          applyRecipeRef.current(pending, hit.position.y)
        }
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

  /** Presentation presets only change visibility/material opacity. The measured
   * point-cloud→IFC transform remains untouched across every mode. */
  const applyDemoView = useCallback((mode: Exclude<DemoViewMode, 'comparison'>): void => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    setDemoViewMode(mode)
    viewer.applyStyle(mode === 'xray' ? 'xray' : 'shaded')

    if (mode === 'point-cloud') {
      setIsolation('cloud')
      setDisplay({ opacity: 1 })
      return
    }
    if (mode === 'ifc') {
      setIsolation('model')
      for (const model of sceneModels) viewer.setModelOpacity(1, model.id)
      return
    }

    setIsolation('both')
    setDisplay({ opacity: mode === 'scan-vs-bim' ? 0.82 : 1 })
    const modelOpacity = mode === 'overlay' ? 0.45 : mode === 'scan-vs-bim' ? 0.72 : 0.20
    for (const model of sceneModels) viewer.setModelOpacity(modelOpacity, model.id)
  // setDisplay is a stable store write wrapper and deliberately not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApiRef, sceneModels, setIsolation])

  const applyComparison = useCallback((blend: number): void => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const value = Math.max(0, Math.min(1, blend))
    setComparisonBlend(value)
    setDemoViewMode('comparison')
    viewer.applyStyle('shaded')

    const showModels = value > 0.01
    const showClouds = value < 0.99
    for (const model of sceneModels) {
      viewer.setModelVisible(model.id, showModels)
      viewer.setModelOpacity(Math.max(0.02, value), model.id)
      useSceneStore.getState().setModelVisible(model.id, showModels)
    }
    setDisplay({ opacity: Math.max(0.05, 1 - value) })
    void getSystem()?.then((system) => {
      for (const cloud of usePointCloudStore.getState().clouds) {
        usePointCloudStore.getState().setVisible(cloud.id, showClouds)
        system.setVisible(cloud.id, showClouds)
      }
    })
  // setDisplay is a stable store write wrapper and deliberately not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApiRef, sceneModels, getSystem])

  const attributes = activeCloud?.attributes
  const alignment = activeCloud?.alignment ?? null
  const isReplayCloud = activeCloud?.sourceKind === 'temporal-replay'
  const needsTransform = !isReplayCloud &&
    (alignment?.rung === 'manual' || alignment?.rung === 'local')
  const hasClouds = store.clouds.length > 0
  // Bumped whenever an action's result is IN THE SCENE (a recipe applied, a
  // pick requested): on a phone the sheet steps down to peek so it is seen.
  const [viewNonce, setViewNonce] = useState(0)
  const activePreset = matchPreset(store.display, store.renderBudget)

  const issues: Issue[] = activeCloud
    ? diagnoseCloud({
        cloud: activeCloud,
        display: store.display,
        cloudBox: boxes?.cloudBox ?? null,
        modelBox: sceneModels.length > 0 ? boxes?.modelBox ?? null : null,
        totalPoints: stats?.pointCount ?? store.clouds.reduce((n, c) => n + c.pointCount, 0),
        density: store.display.density,
      })
    : []

  // Featured samples first, then the rest in catalogue order.
  const orderedSamples = [
    ...DEMO_POINT_CLOUDS.filter((d) => d.featured),
    ...DEMO_POINT_CLOUDS.filter((d) => !d.featured),
  ]
  const visibleSamples = showAllSamples ? orderedSamples : orderedSamples.slice(0, SAMPLES_COLLAPSED)

  const applyPreset = (id: AppearancePresetId): void => {
    const preset = APPEARANCE_PRESETS[id]
    setDisplay(preset.display)
    usePointCloudStore.getState().setRenderBudget(preset.renderBudget)
  }

  /**
   * Switch tab and, when the list above has been scrolled past, bring the new
   * tab's first group into view — otherwise it opens mid-way down, under the
   * sticky tab bar.
   */
  const selectTab = (id: PanelTab): void => {
    setTab(id)
    const scroller = scrollRef.current, bar = tablistRef.current
    if (!scroller || !bar) return
    // Measured against the scroller, not offsetTop: the offset parent is the
    // positioned panel shell, which counts the header too.
    const natural = scroller.scrollTop + bar.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    if (scroller.scrollTop > natural) scroller.scrollTop = natural
  }

  const fitActive = (): void => {
    void getSystem()?.then((s) => s.frame(usePointCloudStore.getState().activeCloudId ?? undefined))
  }

  /** What each fix DOES. The diagnostics only name them. */
  const applyFix = (fix: FixId, cloud: PointCloudEntry | null = activeCloud): void => {
    if (cloud && cloud.id !== usePointCloudStore.getState().activeCloudId) {
      usePointCloudStore.getState().setActiveCloud(cloud.id)
    }
    switch (fix) {
      case 'flipUpAxis':
        if (cloud?.frame) handleUpAxis(cloud.frame.upAxis === 'z' ? 'y' : 'z')
        break
      case 'bestColor':
        setDisplay({ colorMode: bestColorMode(cloud?.attributes) })
        break
      case 'showAll':
        for (const c of usePointCloudStore.getState().clouds) if (!c.visible) handleVisible(c, true)
        if (usePointCloudStore.getState().display.opacity < 0.2) setDisplay({ opacity: 1 })
        fitActive()
        break
      case 'opacityFull':
        setDisplay({ opacity: 1 })
        break
      case 'fitCloud':
        fitActive()
        break
      case 'fitBoth':
        void getSystem()?.then((s) => s.frameWithModel())
        break
      case 'realign':
        void handleRealign()
        break
      case 'openPlacement':
        selectTab('placement')
        setShowTransform(true)
        return
      case 'unitMm': case 'unitCm': case 'unitFt': case 'scaleUp':
        handleOffset({ scaleMul: UNIT_FIX_SCALE[fix] })
        // Framing after the new scale reaches the GPU, not before.
        setTimeout(fitActive, 50)
        break
      case 'performance':
        applyPreset('performance')
        break
      case 'remove':
        if (cloud) handleRemove(cloud)
        return
    }
    toast(t('fix.applied', { what: t(`fix.${fix}`) }), 'success')
  }

  /** Symptom → the usual fix. Each is reversible from Appearance/Placement. */
  const applySymptom = (symptom: HelpSymptom): void => {
    const d = usePointCloudStore.getState().display
    switch (symptom) {
      case 'sideways': applyFix('flipUpAxis'); return
      case 'invisible': applyFix('showAll'); return
      case 'misplaced':
        if (sceneModels.length > 0) void handleRealign()
        applyFix('openPlacement')
        return
      case 'slow': applyFix('performance'); return
      case 'colours': {
        const available = COLOR_MODES.filter((m) => m !== 'flat' && colorModeAvailable(m, attributes))
        const next = available[(available.indexOf(d.colorMode) + 1) % available.length] ?? 'elevation'
        setDisplay({ colorMode: next })
        toast(t('fix.applied', { what: t(`display.mode.${next}`) }), 'success')
        return
      }
      case 'sparse':
        setDisplay({ pointSize: Math.min(10, Math.round((d.pointSize + 1.5) * 10) / 10), round: true })
        toast(t('fix.applied', { what: t('help.sparse.label') }), 'success')
        return
      case 'blobby':
        setDisplay({ pointSize: Math.max(0.5, Math.round((d.pointSize - 1) * 10) / 10), attenuate: false })
        toast(t('fix.applied', { what: t('help.blobby.label') }), 'success')
        return
      case 'wrongSize': case 'broken':
        setHelpOpen((open) => open === symptom ? null : symptom)
    }
  }

  // ── Analysis: slice / classes / contours / recipes ─────────────────────────
  // All of it is shader state (pc-material), so every control is instant and
  // nothing re-reads or rewrites the scan.
  const elevSpan = elevRange ? Math.max(elevRange.max - elevRange.min, 0.001) : 1
  const toFraction = (y: number): number =>
    elevRange ? Math.max(0, Math.min(1, (y - elevRange.min) / elevSpan)) : 0
  const toHeight = (f: number): number => (elevRange ? elevRange.min + f * elevSpan : f)
  const disp = store.display
  const filtersActive = disp.sliceEnabled || disp.classMask !== ALL_CLASSES_MASK || disp.contours
  const hasClasses = store.clouds.some((c) => c.attributes?.classification)

  /** Keep a band of `half` metres either side of scene height `y`. */
  const sliceAround = (y: number, half: number): Partial<PointCloudDisplay> => ({
    sliceEnabled: true, sliceMin: toFraction(y - half), sliceMax: toFraction(y + half),
  })

  const clearAnalysis = (): void => {
    pendingRecipeRef.current = null
    setDisplay({ sliceEnabled: false, sliceMin: 0, sliceMax: 1, classMask: ALL_CLASSES_MASK, contours: false })
  }

  const recipeUnavailable = (id: RecipeId): string | null => {
    if (id === 'vegetation' && !hasClasses) return t('analyze.needsClasses')
    if (id === 'scanVsBim' && sceneModels.length === 0) return t('analyze.needsModel')
    return null
  }

  /**
   * Look at the scans themselves. The viewer's presets frame the MODEL, which
   * is the wrong box here: a terrain patch beside a building, or a scan with
   * the model hidden, ends up edge-on or off screen.
   */
  const viewScan = (view: 'iso' | 'top'): void => {
    const viewer = viewerApiRef.current
    void getSystem()?.then((system) => {
      const b = system.getBounds()
      if (!viewer || !b) return
      const c = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 }
      const r = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1) * 1.1
      const dir = view === 'top' ? { x: 0, y: 1, z: 0.001 } : { x: 0.62, y: 0.48, z: 0.62 }
      viewer.setCameraLookAt({ x: c.x + dir.x * r, y: c.y + dir.y * r, z: c.z + dir.z * r }, c)
    })
  }

  /** `atY` is a picked scene height, for the recipes that work at one. */
  const applyRecipe = (id: RecipeId, atY?: number): void => {
    const y = atY ?? picked?.position.y
    switch (id) {
      case 'floorPlan': {
        // Drawing convention: cut ~1.2 m above the floor — tall enough to catch
        // walls, doors and windows, low enough to miss most furniture tops.
        const at = y ?? (elevRange ? elevRange.min + 1.2 : 0)
        setDisplay({ ...sliceAround(at, 0.3), contours: false })
        viewScan('top')
        break
      }
      case 'terrain':
        setDisplay({
          colorMode: 'elevation', contours: true, contourInterval: niceStep(elevSpan),
          sliceEnabled: false, classMask: hasClasses ? 1 << 2 : ALL_CLASSES_MASK,
        })
        // Ground sits under the building: the model would hide exactly what
        // this recipe is about, and an iso preset frames the model, not the scan.
        if (sceneModels.length > 0) applyDemoView('point-cloud')
        viewScan('iso')
        break
      case 'vegetation':
        setDisplay({ classMask: ALL_CLASSES_MASK & ~VEGETATION_NOISE_MASK })
        break
      case 'slab':
        if (y === undefined) {
          pendingRecipeRef.current = 'slab'
          setInspecting(true)
          toast(t('analyze.pickFirst'), 'info')
          setViewNonce((n) => n + 1) // the pick happens on the scene: show it
          return
        }
        setDisplay({ ...sliceAround(y, 0.08), contours: true, contourInterval: 0.01, colorMode: 'elevation' })
        viewScan('top')
        break
      case 'scanVsBim':
        applyDemoView('scan-vs-bim')
        setDisplay({ colorMode: 'flat', flatColor: 0xff5a36, opacity: 1 })
        break
      case 'clearance':
        setInspecting(false)
        useUIStore.getState().setActiveMeasurementTool('distance')
        useUIStore.getState().setMeasurementPanelOpen(true)
        break
    }
    toast(t('analyze.applied', { what: t(`analyze.recipe.${id}.label`) }), 'success')
    setViewNonce((n) => n + 1)
  }
  const applyRecipeRef = useRef(applyRecipe)
  applyRecipeRef.current = applyRecipe

  const armMeasure = (tool: 'distance' | 'area' | 'angle' | 'point'): void => {
    setInspecting(false)
    const ui = useUIStore.getState()
    ui.setActiveMeasurementTool(ui.activeMeasurementTool === tool ? 'none' : tool)
    ui.setMeasurementPanelOpen(true)
  }

  const copyPicked = (): void => {
    if (!picked) return
    const p = picked.sourcePosition
    void navigator.clipboard?.writeText(`${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`).then(
      () => toast(t('inspect.copied'), 'success'),
      () => log.warn('clipboard write refused'),
    )
  }

  // ── Temporal replay block (start screen teaser + Samples tab) ──────────────
  const replayBlock = (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2" role="list" aria-label={tDynamic('replay.showcaseSelector')}>
        {TEMPORAL_LIDAR_SHOWCASES.map((showcase) => {
          const selected = activeShowcase.id === showcase.id
          return (
            <button
              key={showcase.id}
              type="button"
              role="listitem"
              data-testid={`lidar-showcase-${showcase.id}`}
              aria-pressed={selected}
              disabled={replayBusy}
              onClick={() => {
                if (replayState) void handleStartReplay(showcase.id)
                else setSelectedReplayId(showcase.id)
              }}
              className={`rounded-[10px] border px-2.5 py-2 text-left transition-colors disabled:opacity-50 ${
                selected
                  ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]'
              }`}
            >
              <div className="text-[12px] font-semibold leading-tight text-[var(--text)]">
                {tDynamic(`replay.showcases.${showcase.copyKey}.name`)}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--text-faint)]">
                {tDynamic(`replay.showcases.${showcase.copyKey}.short`)}
              </div>
              <div className="mt-1 font-mono text-[10px] text-[var(--text-faint)]">
                {formatCount(showcase.approximatePoints)} pts · {showcase.frameRate} FPS
              </div>
            </button>
          )
        })}
      </div>
      <div
        data-testid="lidar-replay-demo"
        className="rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface-2)] p-3 flex flex-col gap-2"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge tint="#F5A623">{t('replay.simulatedBadge')}</Badge>
          <DemoChip>IFC + LiDAR</DemoChip>
          <DemoChip>{activeShowcase.frameRate} FPS</DemoChip>
          {(companionLoaded || replayState) && <Badge tint="#30A46C">{t('replay.ifcLoaded')}</Badge>}
        </div>
        <div className="text-[13px] font-semibold text-[var(--text)]">
          {tDynamic(`replay.showcases.${activeShowcase.copyKey}.name`)}
        </div>
        <div className="text-[12px] leading-relaxed text-[var(--text-dim)]">
          {tDynamic(`replay.showcases.${activeShowcase.copyKey}.description`)}
        </div>

        {!replayState ? (
          <PrimaryButton testId="lidar-replay-start" disabled={replayBusy} onClick={() => { void handleStartReplay() }}>
            {replayBusy ? t('replay.loading') : t('replay.start')}
          </PrimaryButton>
        ) : (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tint={replayState.status === 'playing' ? '#30A46C' : '#F5A623'}>
                  {t(`replay.status.${replayState.status}`)}
                </Badge>
                <span className="text-[11px] font-mono tabular-nums text-[var(--text-faint)]">
                  {formatReplayTime(replayState.positionMs)} / {formatReplayTime(replayState.durationMs)}
                </span>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-faint)]">
                {formatCount(replayPointCount)} pts
              </span>
            </div>

            <input
              type="range"
              data-testid="lidar-replay-timeline"
              aria-label={t('replay.timeline')}
              min={0}
              max={replayState.durationMs}
              step={50}
              value={replayState.positionMs}
              onChange={(event) => handleReplaySeek(Number(event.target.value))}
              className="pc-range w-full"
            />

            <div className="flex gap-1.5">
              <SmallButton onClick={handleReplayToggle}>
                {replayState.status === 'playing' ? t('replay.pause') : t('replay.play')}
              </SmallButton>
              <SmallButton onClick={handleReplayLatest}>{t('replay.latest')}</SmallButton>
              <SmallButton onClick={() => { void handleStartReplay() }}>{t('replay.restart')}</SmallButton>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[var(--text-dim)]">{t('replay.speed')}</span>
              <Segmented
                label={t('replay.speed')}
                value={String(replayState.speed)}
                options={[0.5, 1, 2].map((speed) => ({ value: String(speed), label: `${speed}×` }))}
                onChange={(v) => handleReplaySpeed(Number(v))}
              />
            </div>

            <Switch label={t('replay.loop')} checked={replayState.loop} onChange={handleReplayLoop} />

            {transportState && (
              <Disclosure title={t('replay.transport.title')} badge={
                <Badge tint={
                  transportState.status === 'connected' ? '#30A46C'
                    : transportState.status === 'reconnecting' ? '#E5484D' : '#F5A623'
                }>
                  {t(`replay.transport.status.${transportState.status}`)}
                </Badge>
              }>
                <div data-testid="lidar-transport-telemetry" className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['stable', 'unstable'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        data-testid={`lidar-transport-${mode}`}
                        onClick={() => handleTransportMode(mode)}
                        aria-pressed={transportMode === mode}
                        className={`rounded-[8px] px-2 py-1.5 text-[11.5px] transition-colors ${
                          transportMode === mode
                            ? 'bg-[var(--accent)] text-white'
                            : 'border border-[var(--border-strong)] text-[var(--text-dim)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        {t(`replay.transport.mode.${mode}`)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono text-[var(--text-faint)]">
                    <span>{t('replay.transport.latency', { count: transportState.simulatedLatencyMs })}</span>
                    <span className="text-right">
                      {t('replay.transport.buffer', {
                        depth: transportState.buffer.depth,
                        capacity: transportState.buffer.capacity,
                      })}
                    </span>
                    <span>{t('replay.transport.loss', { count: transportState.linkDropped })}</span>
                    <span className="text-right">{t('replay.transport.reordered', { count: transportState.buffer.reordered })}</span>
                    <span>{t('replay.transport.invalid', { count: transportState.buffer.invalid })}</span>
                    <span className="text-right">{t('replay.transport.reconnects', { count: transportState.reconnects })}</span>
                    <span>{t('replay.sequence', { count: replayState.sequence })}</span>
                    <span className="text-right">{t('replay.dropped', { count: replayState.droppedFrames })}</span>
                  </div>
                  <Hint>{t('replay.transport.hint')}</Hint>
                </div>
              </Disclosure>
            )}
            {replayTruncated > 0 && <Note tone="warn">{t('replay.truncated', { count: replayTruncated })}</Note>}
          </div>
        )}

        <Hint>{t('replay.disclaimer')}</Hint>
        <button
          type="button"
          data-testid="lidar-replay-download-mcap"
          disabled={mcapBusy}
          title={t('replay.mcapHint')}
          onClick={() => { void handleDownloadReplayMcap() }}
          className="w-full rounded-[8px] border border-[var(--border-strong)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--text-dim)] hover:bg-[var(--surface)] hover:text-[var(--text)] disabled:opacity-50 transition-colors"
        >
          {mcapBusy ? t('replay.mcapBuilding') : t('replay.mcapDownload')}
        </button>
        {mcapError && <Note tone="warn">{t('replay.mcapFailed')}</Note>}
        {replayError && <Note tone="warn">{t('replay.failed')}</Note>}
      </div>
    </div>
  )

  // ── Sample scans ───────────────────────────────────────────────────────────
  const samplesBlock = (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2">
        {visibleSamples.map((demo) => {
          const busy = demoBusy === demo.id
          return (
            <button
              key={demo.id}
              type="button"
              data-testid={`pc-sample-${demo.id}`}
              disabled={demoBusy !== null}
              onClick={() => { void handleDemo(demo) }}
              title={tDynamic(`demos.items.${demo.descriptionKey}`)}
              className={[
                'group w-full text-left rounded-[12px] border px-3 py-2.5 transition-colors',
                busy
                  ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[var(--text)] truncate flex-1">{demo.name}</span>
                {demo.featured && <Badge tint="#5E9ED6">{t('ui.featured')}</Badge>}
                <span className="text-[11px] font-mono text-[var(--text-faint)] shrink-0">
                  {formatDemoSize(demo.sizeBytes)}
                </span>
              </div>
              <div className="text-[11.5px] text-[var(--text-dim)] leading-snug mt-1 line-clamp-2">
                {tDynamic(`demos.items.${demo.descriptionKey}`)}
              </div>
              <div className="flex items-center gap-1 flex-wrap mt-1.5">
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
                <div className="mt-2 h-[3px] rounded-full bg-[var(--border)] overflow-hidden">
                  <div className="h-full bg-[var(--accent)] transition-[width]"
                    style={{ width: `${Math.round(demoProgress * 100)}%` }} />
                </div>
              )}
            </button>
          )
        })}
      </div>
      {orderedSamples.length > SAMPLES_COLLAPSED && (
        <button
          type="button"
          onClick={() => setShowAllSamples((v) => !v)}
          className="self-center text-[12px] font-medium text-[var(--accent)] hover:underline underline-offset-2 py-1"
        >
          {showAllSamples ? t('ui.showFewerSamples') : t('ui.showAllSamples', { count: orderedSamples.length })}
        </button>
      )}
      {/* One link per distinct source. Crediting them all to the first one
          silently mis-attributed every sample that came from somewhere else —
          and one of these corpora is CC BY, where the attribution is the
          licence term, not a courtesy. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-[11px] text-[var(--text-faint)]">{t('demos.source')}</span>
        {DEMO_SOURCES.map((source) => (
          <a
            key={source.sourceUrl}
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] underline underline-offset-2"
          >
            {source.sourceLabel}
          </a>
        ))}
      </div>
    </div>
  )

  const fileInput = (
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
  )

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
    },
  }

  return (
    <ViewportPanel
      id="pointcloud"
      open={store.panelOpen}
      onClose={() => store.setPanelOpen(false)}
      label={t('title')}
      // A sheet, not a dock: loading a scan, reading why it landed where it did
      // and nudging it are real work, not a three-button palette.
      mobile="sheet"
      // Phone: a peek detent (header + the scan list) to look at the cloud
      // while filtering it, and a drop to it as soon as the first scan lands.
      peek
      collapseKey={hasClouds ? `loaded-${viewNonce}` : null}
      widthPx={380}
      anchor="top"
    >
      <style>{PANEL_CSS}</style>
      {/* flex-1 + min-h-0: the only flex child of the shell, so it takes the
          available height and lets the scroll region below actually shrink —
          in the desktop card and inside the mobile sheet alike. */}
      <div className="pc-panel flex flex-col flex-1 min-h-0" data-testid="point-cloud-panel" {...(hasClouds ? dropHandlers : {})}>
        {fileInput}

        {/* Header — pinned. */}
        <div className="px-4 pt-3 pb-2.5 border-b border-[var(--border)] flex items-center gap-2 shrink-0">
          <div className="text-[14px] font-semibold text-[var(--text)] flex-1">{t('title')}</div>
          {hasClouds && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 2v10M2 7h10" /></svg>
              {t('ui.add')}
            </button>
          )}
          <IconButton label={t('close')} onClick={() => store.setPanelOpen(false)}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </IconButton>
        </div>

        {dragOver && hasClouds && (
          <div className="mx-4 mt-3 rounded-[12px] border-2 border-dashed border-[var(--accent)] bg-[var(--surface-2)] py-4 text-center text-[13px] font-medium text-[var(--text)] shrink-0">
            {t('load.another')}
          </div>
        )}

        {!hasClouds ? (
          /* ── Start screen: open a file, or try a sample ───────────────── */
          <div key="start" className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-5">
            <div
              {...dropHandlers}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              className={[
                'cursor-pointer rounded-[14px] border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
                dragOver
                  ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                  : 'border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]',
              ].join(' ')}
            >
              <svg className="mx-auto mb-2 text-[var(--accent)]" width="34" height="34" viewBox="0 0 32 32" fill="currentColor" aria-hidden>
                {[[8, 20], [12, 14], [16, 18], [20, 11], [24, 16], [10, 24], [15, 25], [21, 22], [26, 23], [18, 7]].map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.3} opacity={0.55 + (i % 4) * 0.15} />
                ))}
              </svg>
              <div className="text-[15px] font-semibold text-[var(--text)]">{t('ui.startTitle')}</div>
              <div className="text-[12.5px] text-[var(--text-dim)] mt-1">{t('load.drop')}</div>
              <div className="text-[11px] font-mono text-[var(--text-faint)] mt-2">{t('load.formats')}</div>
              <div className="text-[11.5px] text-[var(--text-faint)] mt-2 leading-snug">{t('ui.startHint')} {t('load.hint')}</div>
            </div>

            <div className="flex flex-col gap-2.5">
              <SectionTitle>{t('ui.orSample')}</SectionTitle>
              {samplesBlock}
            </div>

            <Disclosure
              title={t('ui.replayTeaser')}
              subtitle={t('ui.replayTeaserHint')}
              open={replayOpen}
              onToggle={setReplayOpen}
              card
            >
              {replayBlock}
            </Disclosure>
          </div>
        ) : (
          /* One scroll region under the pinned header. Pinning the list, the
             check-up AND the tabs left no room for the content in a short
             viewport (the validation drawer open takes half of it); the tab bar
             sticks instead, so it is always reachable without eating height. */
          <div key="loaded" ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
            {/* ── Loaded scans ─────────────────────────────────────────────── */}
            <div className="px-4 pt-3 pb-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <SectionTitle>{t('ui.loaded')}</SectionTitle>
                {stats && stats.pointCount > 0 && (
                  <span className="text-[11px] font-mono text-[var(--text-faint)]">
                    {t('status.points', { count: formatCount(stats.pointCount) })}
                  </span>
                )}
              </div>
              {store.clouds.map((cloud) => (
                <CloudRow
                  key={cloud.id}
                  cloud={cloud}
                  active={cloud.id === store.activeCloudId}
                  issueCount={cloud.id === store.activeCloudId ? issues.filter((i) => i.severity !== 'info').length : 0}
                  onSelect={() => usePointCloudStore.getState().setActiveCloud(cloud.id)}
                  onToggleVisible={() => handleVisible(cloud, !cloud.visible)}
                  onFrame={() => {
                    usePointCloudStore.getState().setActiveCloud(cloud.id)
                    void getSystem()?.then((s) => s.frame(cloud.id))
                  }}
                  onRemove={() => handleRemove(cloud)}
                  t={t}
                  describeError={describeError}
                />
              ))}
              {sceneModels.length === 0 && <Note>{t('status.noModel')}</Note>}
            </div>

            {/* ── Replay transport while a temporal demo runs ─────────────── */}
            {isReplayCloud && replayState && (
              <div className="px-4 pb-2 flex items-center gap-2" aria-live="polite">
                <SmallButton onClick={handleReplayToggle}>
                  {replayState.status === 'playing' ? t('replay.pause') : t('replay.play')}
                </SmallButton>
                <input
                  type="range"
                  aria-label={t('replay.timeline')}
                  min={0}
                  max={replayState.durationMs}
                  step={50}
                  value={replayState.positionMs}
                  onChange={(event) => handleReplaySeek(Number(event.target.value))}
                  className="pc-range flex-[2]"
                />
                <span className="text-[11px] font-mono tabular-nums text-[var(--text-faint)] shrink-0">
                  {formatReplayTime(replayState.positionMs)}
                </span>
              </div>
            )}

            {/* ── Check-up: what looks wrong, and the one-click fix ─────────── */}
            {activeCloud && activeCloud.status !== 'parsing' && (
              <div className="px-4 pb-3">
                <CheckUp issues={issues} onFix={applyFix} t={t} describeError={describeError} cloud={activeCloud} />
              </div>
            )}

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            {/* Sentinel: a sticky element reports its STUCK offset, not where it sits. */}
            <div ref={tablistRef} aria-hidden />
            <div role="tablist" aria-label={t('title')} className="pc-tabs sticky top-0 z-10 px-3 border-b border-[var(--border)] flex gap-0.5 overflow-x-auto bg-[var(--surface)] backdrop-blur">
              {PANEL_TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`pc-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`pc-tabpanel-${id}`}
                  onClick={(e) => {
                    selectTab(id)
                    // Six tabs overflow a phone: bring the one picked into view.
                    e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
                  }}
                  className={[
                    'relative px-2.5 py-2 max-md:py-3 max-md:px-3 max-md:text-[13.5px] text-[12.5px] font-medium whitespace-nowrap transition-colors',
                    tab === id ? 'text-[var(--text)]' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]',
                  ].join(' ')}
                >
                  {t(`tabs.${id}`)}
                  {tab === id && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[var(--accent)]" />}
                </button>
              ))}
            </div>

            {/* ── Everything below scrolls ─────────────────────────────────── */}
            <div
              role="tabpanel"
              id={`pc-tabpanel-${tab}`}
              aria-labelledby={`pc-tab-${tab}`}
              className="px-4 py-4 flex flex-col gap-5"
            >
              {tab === 'appearance' && (
                <>
                  <Group title={t('presets.title')}>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PRESET_IDS.map((id) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={activePreset === id}
                          onClick={() => applyPreset(id)}
                          className={[
                            'rounded-[10px] border px-3 py-2 text-[12.5px] font-medium text-left transition-colors',
                            activePreset === id
                              ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)]'
                              : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:text-[var(--text)]',
                          ].join(' ')}
                        >
                          {t(`presets.${id}`)}
                        </button>
                      ))}
                    </div>
                    {activePreset === null && <Hint>{t('presets.custom')}</Hint>}
                  </Group>

                  <Group title={t('display.colorMode')}>
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_MODES.map((mode) => {
                        const available = colorModeAvailable(mode, attributes)
                        return (
                          <button
                            key={mode}
                            type="button"
                            disabled={!available}
                            aria-pressed={store.display.colorMode === mode}
                            title={available ? undefined : t('display.modeUnavailable')}
                            onClick={() => setDisplay({ colorMode: mode })}
                            className={[
                              'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                              store.display.colorMode === mode
                                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                                : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
                              available ? '' : 'opacity-35 cursor-not-allowed',
                            ].join(' ')}
                          >
                            {t(`display.mode.${mode}`)}
                          </button>
                        )
                      })}
                    </div>
                    {store.display.colorMode === 'flat' && (
                      <label className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[12px] text-[var(--text-dim)]">{t('display.flatColor')}</span>
                        <input
                          type="color"
                          value={`#${store.display.flatColor.toString(16).padStart(6, '0')}`}
                          onChange={(e) => setDisplay({ flatColor: parseInt(e.target.value.slice(1), 16) })}
                          className="h-7 w-10 rounded-[6px] border border-[var(--border-strong)] bg-transparent cursor-pointer"
                        />
                      </label>
                    )}
                  </Group>

                  <Group title={t('display.pointSize')}>
                    <Slider label={t('display.pointSize')} hideLabel value={store.display.pointSize} min={0.5} max={10} step={0.1}
                      unit="px" onChange={(v) => setDisplay({ pointSize: v })} />
                    <Switch label={t('display.round')} checked={store.display.round}
                      onChange={() => setDisplay({ round: !store.display.round })} />
                    <Switch label={t('display.attenuate')} checked={store.display.attenuate}
                      onChange={() => setDisplay({ attenuate: !store.display.attenuate })} />
                  </Group>

                  <Disclosure title={t('ui.advanced')}>
                    <div className="flex flex-col gap-3">
                      <Slider label={t('display.opacity')} value={store.display.opacity} min={0.05} max={1} step={0.01}
                        digits={2} onChange={(v) => setDisplay({ opacity: v })} />
                      <div>
                        <Slider label={t('display.density')} value={store.display.density} min={0.05} max={1} step={0.01}
                          digits={2} onChange={(v) => setDisplay({ density: v })} />
                        <Hint>{t('display.densityHint')}</Hint>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[12px] text-[var(--text-dim)]">{t('ui.quality')}</span>
                        <Segmented
                          label={t('ui.quality')}
                          value={QUALITY_LEVELS.find((q) => q.budget === store.renderBudget)?.id ?? ''}
                          options={QUALITY_LEVELS.map((q) => ({ value: q.id, label: t(`ui.qualityLevel.${q.id}`) }))}
                          onChange={(v) => {
                            const level = QUALITY_LEVELS.find((q) => q.id === v)
                            if (level) usePointCloudStore.getState().setRenderBudget(level.budget)
                          }}
                          stretch
                        />
                        <Hint>{t('ui.qualityHint')}</Hint>
                      </div>
                      {attributes?.confidence && (
                        <div>
                          <Slider label={t('display.confidence')} value={store.display.confidenceThreshold}
                            min={0} max={1} step={0.01} digits={2}
                            onChange={(v) => setDisplay({ confidenceThreshold: v })} />
                          <Hint>{t('display.confidenceHint')}</Hint>
                        </div>
                      )}
                    </div>
                  </Disclosure>

                  <button
                    type="button"
                    onClick={() => applyPreset('balanced')}
                    className="self-start text-[12px] text-[var(--text-faint)] hover:text-[var(--text)] underline underline-offset-2"
                  >
                    {t('presets.reset')}
                  </button>
                </>
              )}

              {tab === 'placement' && activeCloud && (
                alignment ? (
                  <>
                    <Group title={t('align.title')}>
                      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-medium text-[var(--text)]">{t(`align.rung.${alignment.rung}`)}</span>
                          <Badge tint={CONFIDENCE_TINT[alignment.confidence] ?? '#888'}>
                            {t(`align.confidence.${alignment.confidence}`)}
                          </Badge>
                        </div>
                        {!isReplayCloud && (
                          <>
                            <div className="text-[11.5px] font-mono text-[var(--text-faint)]">
                              {activeCloud.frame?.epsgCode
                                ? t('align.crs', { code: activeCloud.frame.epsgCode })
                                : t('align.crsNone')}
                            </div>
                            {activeCloud.frame && (
                              <div className="text-[11.5px] font-mono text-[var(--text-faint)]">
                                {t('align.unit', { unit: formatUnit(activeCloud.frame.unitScale) })}
                                {' · '}
                                {t(activeCloud.frame.unitSource === 'declared' ? 'align.unitDeclared' : 'align.unitAssumed')}
                              </div>
                            )}
                          </>
                        )}
                        {alignment.reasons.length > 0 && (
                          <ul className="mt-1 flex flex-col gap-1">
                            {alignment.reasons.map((key) => (
                              <li key={key} className="text-[12px] leading-snug text-[var(--text-dim)] flex gap-1.5">
                                <span className="text-[var(--text-faint)]">•</span><span>{tDynamic(key)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {alignment.confidence === 'manual' && <Note tone="warn">{t('align.manualWarning')}</Note>}
                      </div>
                      {!isReplayCloud && sceneModels.length > 0 && activeCloud.status === 'ready' && (
                        <SmallButton onClick={() => { void handleRealign() }} disabled={realigning}>
                          {t('align.recompute')}
                        </SmallButton>
                      )}
                    </Group>

                    {activeCloud.frame && activeCloud.frame.upAxisSource !== 'declared' && !isReplayCloud && (
                      <Group title={t('align.upAxis')}>
                        <Segmented
                          label={t('align.upAxis')}
                          value={activeCloud.frame.upAxis}
                          options={[{ value: 'z', label: t('align.upAxisZ') }, { value: 'y', label: t('align.upAxisY') }]}
                          onChange={(v) => handleUpAxis(v as 'y' | 'z')}
                          stretch
                        />
                        {activeCloud.frame.upAxisSource === 'assumed' && <Hint>{t('align.upAxisGuessed')}</Hint>}
                      </Group>
                    )}

                    {/* Actionable CRS gap: the file names a system we have no
                        definition for. Offer the fix instead of only the diagnosis. */}
                    {alignment.reasons.includes('align.reason.cloudCrsUnknown') && activeCloud.frame?.epsgCode && (
                      <Group title={t('align.crsForm.title')}>
                        <Hint>{t('align.crsForm.hint', { code: activeCloud.frame.epsgCode })}</Hint>
                        <input
                          value={proj4Text}
                          onChange={(e) => { setProj4Text(e.target.value); setProj4Error(false) }}
                          placeholder={t('align.crsForm.placeholder')}
                          aria-label={t('align.crsForm.title')}
                          spellCheck={false}
                          className="w-full px-2.5 py-2 rounded-[8px] text-[12px] font-mono bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        {proj4Error && <Note tone="warn">{t('align.crsForm.invalid')}</Note>}
                        <SmallButton onClick={() => { void handleProj4Apply() }} disabled={!proj4Text.trim() || realigning}>
                          {t('align.crsForm.apply')}
                        </SmallButton>
                      </Group>
                    )}

                    {!isReplayCloud && (
                      <Group title={t('help.wrongSize.label')}>
                        <div className="flex flex-wrap gap-1.5">
                          {(['unitMm', 'unitCm', 'unitFt'] as const).map((fix) => (
                            <Chip key={fix} active={alignment.offset.scaleMul === UNIT_FIX_SCALE[fix]} onClick={() => applyFix(fix)}>
                              {t(`fix.${fix}`)}
                            </Chip>
                          ))}
                          <Chip active={alignment.offset.scaleMul === 1} onClick={() => { handleOffset({ scaleMul: 1 }); setTimeout(fitActive, 50) }}>
                            ×1
                          </Chip>
                        </div>
                      </Group>
                    )}

                    {!isReplayCloud && (
                      <Disclosure
                        title={t('transform.title')}
                        open={showTransform || needsTransform}
                        onToggle={setShowTransform}
                      >
                        <div className="flex flex-col gap-3">
                          <Slider label={t('transform.x')} value={alignment.offset.x} min={-200} max={200} step={0.05}
                            unit="m" digits={2} onChange={(v) => handleOffset({ x: v })} />
                          <Slider label={t('transform.y')} value={alignment.offset.y} min={-100} max={100} step={0.05}
                            unit="m" digits={2} onChange={(v) => handleOffset({ y: v })} />
                          <Slider label={t('transform.z')} value={alignment.offset.z} min={-200} max={200} step={0.05}
                            unit="m" digits={2} onChange={(v) => handleOffset({ z: v })} />
                          <Slider label={t('transform.rotation')} value={alignment.offset.yawDeg} min={-180} max={180} step={0.5}
                            unit="°" onChange={(v) => handleOffset({ yawDeg: v })} />
                          <Slider label={t('transform.pitch')} value={alignment.offset.pitchDeg} min={-45} max={45} step={0.25}
                            unit="°" digits={2} onChange={(v) => handleOffset({ pitchDeg: v })} />
                          <Slider label={t('transform.roll')} value={alignment.offset.rollDeg} min={-45} max={45} step={0.25}
                            unit="°" digits={2} onChange={(v) => handleOffset({ rollDeg: v })} />
                          <Slider label={t('transform.scale')} value={alignment.offset.scaleMul}
                            min={Math.min(0.1, alignment.offset.scaleMul)} max={Math.max(3, alignment.offset.scaleMul)} step={0.001}
                            unit="×" digits={3} onChange={(v) => handleOffset({ scaleMul: v })} />
                          <SmallButton onClick={handleResetOffset}>{t('transform.reset')}</SmallButton>
                          <Hint>{t('transform.hint')}</Hint>
                        </div>
                      </Disclosure>
                    )}
                  </>
                ) : (
                  <Hint>{activeCloud.status === 'parsing' ? t('load.parsingShort') : describeError(activeCloud.errorKey)}</Hint>
                )
              )}

              {tab === 'view' && (
                <>
                  <Group title={t('view.title')}>
                    <div className="flex gap-1.5">
                      <SmallButton onClick={fitActive}>{t('view.fitCloud')}</SmallButton>
                      <SmallButton onClick={() => { void getSystem()?.then((s) => s.frameWithModel()) }}>
                        {t('view.fitBoth')}
                      </SmallButton>
                    </div>
                  </Group>

                  {sceneModels.length > 0 && (
                    <Group title={t('ui.compare')}>
                      <div className="grid grid-cols-3 gap-1.5" data-testid="scan-bim-demo-modes">
                        {(['point-cloud', 'overlay', 'ifc', 'xray', 'scan-vs-bim'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => applyDemoView(mode)}
                            aria-pressed={demoViewMode === mode}
                            className={`px-2 py-2 rounded-[9px] text-[11.5px] font-medium border transition-colors ${
                              demoViewMode === mode
                                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                                : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                            }`}
                          >
                            {t(`ui.modes.${mode}`)}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1 rounded-[10px] border border-[var(--border)] px-3 py-2">
                        <div className="flex justify-between text-[11px] text-[var(--text-faint)] mb-1">
                          <span>{t('ui.compareScan')}</span><span>{t('ui.compareModel')}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={comparisonBlend}
                          aria-label={t('ui.compare')}
                          onChange={(event) => applyComparison(Number(event.target.value))}
                          className="pc-range w-full"
                        />
                      </div>
                    </Group>
                  )}

                  {stats && stats.pointCount > 0 && (
                    <Group title={t('ui.stats')}>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Stat label={t('ui.drawn')}
                          value={`${formatCount(stats.drawnCount)} / ${formatCount(stats.pointCount)}`} />
                        <Stat label="GPU" value={`${Math.round(stats.gpuBytes / 1048576)} MB`} />
                      </div>
                      <Hint>{t('status.chunks', { count: stats.chunkCount })}</Hint>
                      {budget && budget.resident + budget.reserved > 0 && (
                        <PointBudgetMeter {...budget} t={t} format={formatCount} />
                      )}
                    </Group>
                  )}
                </>
              )}

              {tab === 'analyze' && (
                <>
                  {filtersActive && (
                    <div className="flex items-center gap-2 rounded-[10px] border border-[#F5A62355] bg-[#F5A62314] px-3 py-2">
                      <span className="w-2 h-2 rounded-full bg-[#F5A623] shrink-0" />
                      <span className="flex-1 text-[12px] text-[var(--text-dim)]">{t('analyze.activeBanner')}</span>
                      <button type="button" onClick={clearAnalysis}
                        className="text-[12px] font-medium text-[var(--accent)] hover:underline underline-offset-2 whitespace-nowrap">
                        {t('analyze.reset')}
                      </button>
                    </div>
                  )}

                  {/* ── Use cases: one click to a task-ready view ───────────── */}
                  <Group title={t('analyze.recipes.title')}>
                    <Hint>{t('analyze.recipes.hint')}</Hint>
                    <div className="grid grid-cols-2 gap-2" data-testid="pc-recipes">
                      {RECIPES.map((id) => {
                        const blocked = recipeUnavailable(id)
                        return (
                          <button
                            key={id}
                            type="button"
                            data-testid={`pc-recipe-${id}`}
                            disabled={blocked !== null}
                            title={blocked ?? t(`analyze.recipe.${id}.hint`)}
                            onClick={() => applyRecipe(id)}
                            className="flex flex-col gap-1.5 rounded-[12px] border border-[var(--border)] px-3 py-2.5 text-left hover:border-[var(--accent)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <RecipeIcon id={id} />
                            <span className="text-[12.5px] font-semibold leading-tight text-[var(--text)]">
                              {t(`analyze.recipe.${id}.label`)}
                            </span>
                            <span className="text-[11px] leading-snug text-[var(--text-faint)] line-clamp-3">
                              {blocked ?? t(`analyze.recipe.${id}.hint`)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </Group>

                  {/* ── Inspect a point ──────────────────────────────────────── */}
                  <Group title={t('inspect.title')}>
                    <Hint>{t('inspect.hint')}</Hint>
                    <div className="flex gap-1.5">
                      <SmallButton
                        active={inspecting}
                        onClick={() => {
                          setInspecting((v) => !v)
                          setPicked(null); setPickMissed(false)
                        }}
                      >
                        {inspecting ? t('inspect.active') : t('inspect.enable')}
                      </SmallButton>
                      {picked && <SmallButton onClick={() => { setPicked(null); setPickMissed(false) }}>
                        {t('inspect.clear')}
                      </SmallButton>}
                    </div>
                    {pickMissed && <Note>{t('inspect.none')}</Note>}
                    {picked && (
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5 flex flex-col gap-1 text-[11.5px] font-mono text-[var(--text-dim)]">
                        <Field label={t('inspect.scene')}
                          value={`${picked.position.x.toFixed(2)}, ${picked.position.y.toFixed(2)}, ${picked.position.z.toFixed(2)}`} />
                        <Field label={t('inspect.source')}
                          value={`${picked.sourcePosition.x.toFixed(3)}, ${picked.sourcePosition.y.toFixed(3)}, ${picked.sourcePosition.z.toFixed(3)}`} />
                        {picked.classification !== null && attributes?.classification && (
                          <Field label={t('inspect.classification')}
                            value={picked.classification < 16
                              ? `${picked.classification} · ${t(`analyze.classes.names.c${picked.classification}` as 'analyze.classes.names.c0')}`
                              : String(picked.classification)} />
                        )}
                        {picked.intensity !== null && attributes?.intensity && (
                          <Field label={t('inspect.intensity')} value={String(picked.intensity)} />
                        )}
                        <Field label={t('inspect.distance')} value={`${picked.distance.toFixed(2)} m`} />
                        <div className="flex gap-1.5 mt-1.5 font-sans">
                          <SmallButton onClick={copyPicked}>{t('inspect.copy')}</SmallButton>
                          <SmallButton onClick={() => setDisplay(sliceAround(picked.position.y, 0.3))}>
                            {t('inspect.sliceHere')}
                          </SmallButton>
                        </div>
                      </div>
                    )}
                  </Group>

                  {/* ── Height slice ─────────────────────────────────────────── */}
                  <Group title={t('analyze.slice.title')}>
                    <Switch label={t('analyze.slice.toggle')} checked={disp.sliceEnabled}
                      onChange={() => setDisplay({ sliceEnabled: !disp.sliceEnabled })} />
                    {disp.sliceEnabled && (
                      <div className="flex flex-col gap-3">
                        <Slider label={t('analyze.slice.from')} value={toHeight(disp.sliceMin)} digits={2} unit="m"
                          min={toHeight(0)} max={toHeight(1)} step={Math.max(0.01, elevSpan / 500)}
                          onChange={(v) => setDisplay({ sliceMin: Math.min(toFraction(v), disp.sliceMax) })} />
                        <Slider label={t('analyze.slice.to')} value={toHeight(disp.sliceMax)} digits={2} unit="m"
                          min={toHeight(0)} max={toHeight(1)} step={Math.max(0.01, elevSpan / 500)}
                          onChange={(v) => setDisplay({ sliceMax: Math.max(toFraction(v), disp.sliceMin) })} />
                      </div>
                    )}
                    <Hint>{t('analyze.slice.hint')}</Hint>
                  </Group>

                  {/* ── Contours ─────────────────────────────────────────────── */}
                  <Group title={t('analyze.contours.title')}>
                    <Switch label={t('analyze.contours.toggle')} checked={disp.contours}
                      onChange={() => setDisplay({ contours: !disp.contours })} />
                    {disp.contours && (
                      <div className="flex flex-wrap gap-1.5">
                        {CONTOUR_STEPS.map((step) => (
                          <Chip key={step} active={disp.contourInterval === step}
                            onClick={() => setDisplay({ contourInterval: step })}>
                            {step < 1 ? `${Math.round(step * 100)} cm` : `${step} m`}
                          </Chip>
                        ))}
                      </div>
                    )}
                    <Hint>{t('analyze.contours.hint')}</Hint>
                  </Group>

                  {/* ── Classes (only when a scan carries them) ──────────────── */}
                  {hasClasses && (
                    <Group title={t('analyze.classes.title')}>
                      <div className="flex flex-wrap gap-1.5">
                        <Chip active={disp.classMask === ALL_CLASSES_MASK}
                          onClick={() => setDisplay({ classMask: ALL_CLASSES_MASK })}>{t('analyze.classes.all')}</Chip>
                        <Chip active={disp.classMask === 1 << 2}
                          onClick={() => setDisplay({ classMask: 1 << 2 })}>{t('analyze.classes.ground')}</Chip>
                        <Chip active={disp.classMask === (ALL_CLASSES_MASK & ~VEGETATION_NOISE_MASK)}
                          onClick={() => setDisplay({ classMask: ALL_CLASSES_MASK & ~VEGETATION_NOISE_MASK })}>
                          {t('analyze.classes.noVeg')}
                        </Chip>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {FILTER_CLASSES.map((code) => {
                          const on = (disp.classMask >> code) & 1
                          return (
                            <button
                              key={code}
                              type="button"
                              role="switch"
                              aria-checked={!!on}
                              onClick={() => setDisplay({ classMask: disp.classMask ^ (1 << code) })}
                              className={`flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-[var(--surface-2)] ${
                                on ? 'text-[var(--text)]' : 'text-[var(--text-faint)] line-through opacity-60'
                              }`}
                            >
                              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: CLASS_SWATCH[code] }} />
                              <span className="truncate flex-1">
                                {t(`analyze.classes.names.c${code}` as 'analyze.classes.names.c0')}
                              </span>
                              <span className="font-mono text-[10px] text-[var(--text-faint)]">{code}</span>
                            </button>
                          )
                        })}
                      </div>
                      <Hint>{t('analyze.classes.hint')}</Hint>
                    </Group>
                  )}

                  {/* ── Measure (the shared tool, which snaps to scans) ─────── */}
                  <Group title={t('analyze.measure.title')}>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['distance', 'area', 'angle', 'point'] as const).map((tool) => (
                        <SmallButton key={tool} active={measurementTool === tool} onClick={() => armMeasure(tool)}>
                          {t(`analyze.measure.${tool}`)}
                        </SmallButton>
                      ))}
                    </div>
                    <Hint>{t('analyze.measure.hint')}</Hint>
                  </Group>
                </>
              )}

              {tab === 'samples' && (
                <>
                  <Group title={t('demos.title')}>
                    <Hint>{t('demos.hint')}</Hint>
                    {samplesBlock}
                  </Group>
                  <Group title={t('replay.title')}>
                    {replayBlock}
                  </Group>
                </>
              )}

              {tab === 'help' && (
                <Group title={t('help.title')}>
                  <Hint>{t('help.hint')}</Hint>
                  <div className="flex flex-col gap-1.5">
                    {HELP_SYMPTOMS.map((symptom) => {
                      const needsCloud = symptom !== 'broken'
                      const disabled = (needsCloud && (!activeCloud || activeCloud.status !== 'ready')) ||
                        (symptom === 'sideways' && (!activeCloud?.frame || isReplayCloud)) ||
                        (symptom === 'wrongSize' && isReplayCloud)
                      return (
                        <div key={symptom} className="flex flex-col">
                          <button
                            type="button"
                            disabled={disabled}
                            aria-expanded={symptom === 'wrongSize' || symptom === 'broken' ? helpOpen === symptom : undefined}
                            onClick={() => applySymptom(symptom)}
                            className="w-full flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3 py-2.5 text-left hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block text-[12.5px] font-medium text-[var(--text)]">{t(`help.${symptom}.label`)}</span>
                              <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">{t(`help.${symptom}.hint`)}</span>
                            </span>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-[var(--text-faint)] shrink-0">
                              <path d={helpOpen === symptom ? 'M3 9l4-4 4 4' : 'M5 3l4 4-4 4'} />
                            </svg>
                          </button>
                          {helpOpen === symptom && symptom === 'wrongSize' && alignment && (
                            <div className="flex flex-wrap gap-1.5 px-1 pt-2 pb-1">
                              {(['unitMm', 'unitCm', 'unitFt', 'scaleUp'] as const).map((fix) => (
                                <Chip key={fix} active={alignment.offset.scaleMul === UNIT_FIX_SCALE[fix]} onClick={() => applyFix(fix)}>
                                  {t(`fix.${fix}`)}
                                </Chip>
                              ))}
                              <Chip active={alignment.offset.scaleMul === 1} onClick={() => { handleOffset({ scaleMul: 1 }); setTimeout(fitActive, 50) }}>
                                ×1
                              </Chip>
                            </div>
                          )}
                          {helpOpen === symptom && symptom === 'broken' && (
                            <div className="px-1 pt-2 pb-1 text-[12px] leading-relaxed text-[var(--text-dim)]">
                              {t('help.brokenTips')}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Group>
              )}
            </div>
          </div>
        )}
      </div>
    </ViewportPanel>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Range styling: a thicker track and a larger thumb than the browser default. */
const PANEL_CSS = `
.pc-panel .pc-range { -webkit-appearance: none; appearance: none; height: 20px; background: transparent; cursor: pointer; }
.pc-panel .pc-range::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: var(--border-strong); }
.pc-panel .pc-range::-moz-range-track { height: 4px; border-radius: 999px; background: var(--border-strong); }
.pc-panel .pc-range::-moz-range-progress { height: 4px; border-radius: 999px; background: var(--accent); }
.pc-panel .pc-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: var(--accent); border: 2px solid var(--surface, #fff); box-shadow: 0 0 0 1px var(--accent); }
.pc-panel .pc-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: 2px solid var(--surface, #fff); }
.pc-panel .pc-range:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.pc-panel button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
@media (max-width: 767px) {
  .pc-panel .pc-range { height: 40px; touch-action: pan-y; }
  .pc-panel .pc-range::-webkit-slider-runnable-track { height: 6px; }
  .pc-panel .pc-range::-webkit-slider-thumb { width: 24px; height: 24px; margin-top: -9px; }
  .pc-panel .pc-range::-moz-range-thumb { width: 20px; height: 20px; }
  .pc-panel .pc-tabs { -webkit-mask-image: linear-gradient(to right, #000 85%, transparent); mask-image: linear-gradient(to right, #000 85%, transparent); scrollbar-width: none; }
}
`

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-[0.06em]">{children}</div>
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="text-[11.5px] leading-snug text-[var(--text-dim)] opacity-90">{children}</div>
}

function Badge({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-[6px] text-[10.5px] font-medium border whitespace-nowrap"
      style={{ color: tint, borderColor: `${tint}55`, background: `${tint}18` }}
    >
      {children}
    </span>
  )
}

/** Compact fact chip on a sample-scan card — every value read from the file. */
function DemoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-[1px] rounded-[5px] text-[10.5px] font-mono text-[var(--text-faint)] border border-[var(--border)]">
      {children}
    </span>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
        active
          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
          : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      {children}
    </button>
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

/** Small line glyph per analysis recipe — enough to scan the grid by shape. */
function RecipeIcon({ id }: { id: RecipeId }) {
  const paths: Record<RecipeId, React.ReactNode> = {
    floorPlan: <><path d="M3 4h14v12H3z" /><path d="M3 10h6M12 4v6M12 13v3" /></>,
    terrain: <><path d="M2 15c3-5 5-7 8-7s5 3 8 7" /><path d="M5 15c2-3 3-4 5-4s3 2 5 4" /></>,
    vegetation: <><path d="M10 17V9" /><path d="M10 9c-4 0-5-3-5-5 3 0 5 2 5 5zM10 11c3 0 5-2 5-5-3 0-5 2-5 5z" /><path d="M3 3l14 14" /></>,
    slab: <><path d="M2 12l8-4 8 4-8 4z" /><path d="M6 12l4-2 4 2-4 2z" /></>,
    scanVsBim: <><path d="M4 6h8v10H4z" /><circle cx="12" cy="5" r=".8" /><circle cx="15" cy="8" r=".8" /><circle cx="14" cy="12" r=".8" /><circle cx="16" cy="15" r=".8" /></>,
    clearance: <><path d="M4 3v14M16 3v14" /><path d="M4 10h12M7 8l-3 2 3 2M13 8l3 2-3 2" /></>,
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[id]}
    </svg>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div className="text-[10.5px] text-[var(--text-faint)] truncate">{label}</div>
      <div className="text-[13px] font-mono tabular-nums text-[var(--text)]">{value}</div>
    </div>
  )
}

function Note({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const color = tone === 'warn' ? '#F5A623' : 'var(--text-dim)'
  return (
    <div className="text-[11.5px] leading-snug" style={{ color }}>{children}</div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-8 h-8 max-md:w-10 max-md:h-10 shrink-0 flex items-center justify-center rounded-[8px] max-md:rounded-[10px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
    >
      {children}
    </button>
  )
}

function PrimaryButton(
  { onClick, children, disabled, testId }: { onClick: () => void; children: React.ReactNode; disabled?: boolean; testId?: string },
) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="w-full px-3 py-2.5 rounded-[10px] text-[13px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50 transition"
    >
      {children}
    </button>
  )
}

function SmallButton(
  { onClick, children, disabled, active }: { onClick: () => void; children: React.ReactNode; disabled?: boolean; active?: boolean },
) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        'flex-1 px-3 py-2 max-md:min-h-[44px] max-md:text-[13px] rounded-[9px] text-[12px] font-medium border disabled:opacity-40 transition-colors whitespace-nowrap',
        active
          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
          : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex items-center justify-between gap-3 py-1 max-md:min-h-[44px] text-left"
    >
      <span className="text-[12.5px] max-md:text-[13.5px] text-[var(--text-dim)]">{label}</span>
      <span className={`relative w-8 h-[18px] max-md:scale-125 max-md:mr-1 rounded-full transition-colors shrink-0 ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`}>
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-[left] ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
    </button>
  )
}

function Segmented({ label, value, options, onChange, stretch }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  stretch?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label}
      className={`flex rounded-[9px] border border-[var(--border-strong)] p-0.5 gap-0.5 ${stretch ? 'w-full' : ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={[
            'px-2.5 py-1 max-md:py-2 max-md:text-[12.5px] rounded-[7px] text-[11.5px] font-medium transition-colors',
            stretch ? 'flex-1' : '',
            value === o.value ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Disclosure({ title, subtitle, badge, open: controlledOpen, onToggle, card, children }: {
  title: string
  subtitle?: string
  badge?: React.ReactNode
  open?: boolean
  onToggle?: (open: boolean) => void
  card?: boolean
  children: React.ReactNode
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const toggle = (): void => {
    if (onToggle) onToggle(!open)
    else setLocalOpen(!open)
  }
  return (
    <div className={card ? 'rounded-[12px] border border-[var(--border)] p-3' : 'border-t border-[var(--border)] pt-3'}>
      <button type="button" aria-expanded={open} onClick={toggle} className="w-full flex items-center gap-2 text-left">
        <span className="flex-1 min-w-0">
          <span className="block text-[12.5px] font-semibold text-[var(--text)]">{title}</span>
          {subtitle && <span className="block text-[11.5px] text-[var(--text-faint)] mt-0.5">{subtitle}</span>}
        </span>
        {badge}
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          className={`text-[var(--text-faint)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" />
        </svg>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
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
  hideLabel?: boolean
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, unit, digits = 1, hideLabel, onChange }: SliderProps) {
  const readout = (
    <span className="text-[11.5px] font-mono tabular-nums text-[var(--text-faint)] whitespace-nowrap">
      {value.toFixed(digits)}{unit ? ` ${unit}` : ''}
    </span>
  )
  const input = (
    <input
      type="range"
      min={min} max={max} step={step} value={value}
      aria-label={hideLabel ? label : undefined}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="pc-range w-full"
    />
  )
  // Without a label the readout sits beside the track instead of on a line of its own.
  if (hideLabel) return <div className="flex items-center gap-3">{input}{readout}</div>
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--text-dim)]">{label}</span>
        {readout}
      </div>
      {input}
    </label>
  )
}

function CheckUp({ issues, onFix, t, describeError, cloud }: {
  issues: Issue[]
  onFix: (fix: FixId) => void
  t: TFunction<'pointcloud'>
  describeError: (key: string | null | undefined) => string
  cloud: PointCloudEntry
}) {
  const [expanded, setExpanded] = useState(true)
  // Phone: folded by default. Expanded, the list sat between the scan list and
  // the tabs and took most of the half-height sheet, pushing the tools below
  // the fold. The header still says how many issues there are, and a scan that
  // failed to load stays open — that one has to be read.
  const isMobile = useIsMobile()
  const hasError = issues.some((i) => i.severity === 'error')
  useEffect(() => {
    if (isMobile) setExpanded(hasError)
  }, [isMobile, hasError, cloud.id])
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-[#30A46C44] bg-[#30A46C12] px-3 py-2">
        <span className="w-2 h-2 rounded-full bg-[#30A46C] shrink-0" />
        <span className="text-[12px] text-[var(--text-dim)]">{t('diag.allGood')}</span>
      </div>
    )
  }
  const worst = issues[0].severity
  return (
    <div className="rounded-[12px] border overflow-hidden" style={{ borderColor: `${SEVERITY_TINT[worst]}55` }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 max-md:py-3 text-left"
        style={{ background: `${SEVERITY_TINT[worst]}14` }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEVERITY_TINT[worst] }} />
        <span className="flex-1 text-[12.5px] font-semibold text-[var(--text)]">{t('diag.title')}</span>
        <span className="text-[11.5px] text-[var(--text-faint)]">{t('diag.issueCount', { count: issues.length })}</span>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          className={`text-[var(--text-faint)] transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" />
        </svg>
      </button>
      {expanded && (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {issues.map((issue) => (
            <li key={issue.id} className="px-3 py-2.5 flex flex-col gap-2">
              <div className="flex gap-2">
                <span className="w-1.5 h-1.5 rounded-full mt-[6px] shrink-0" style={{ background: SEVERITY_TINT[issue.severity] }} />
                <div className="text-[12px] leading-snug text-[var(--text-dim)]">
                  {t(`diag.issue.${issue.id}`)}
                  {issue.id === 'failed' && cloud.errorKey && (
                    <span className="block mt-0.5 text-[var(--text-faint)]">{describeError(cloud.errorKey)}</span>
                  )}
                  {issue.id === 'partial' && cloud.streamErrorKey && (
                    <span className="block mt-0.5 text-[var(--text-faint)]">{describeError(cloud.streamErrorKey)}</span>
                  )}
                  {issue.id === 'truncated' && (
                    <span className="block mt-0.5 text-[var(--text-faint)]">
                      {t('status.truncated', { count: formatCount(cloud.pointCount) })}
                    </span>
                  )}
                </div>
              </div>
              {issue.fixes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-3.5">
                  {issue.fixes.map((fix, i) => (
                    <button
                      key={fix}
                      type="button"
                      onClick={() => onFix(fix)}
                      className={[
                        'px-2.5 py-1 rounded-[8px] text-[11.5px] font-medium transition-colors',
                        i === 0
                          ? 'bg-[var(--accent)] text-white hover:brightness-110'
                          : 'border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
                      ].join(' ')}
                    >
                      {t(`fix.${fix}`)}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface CloudRowProps {
  cloud: PointCloudEntry
  active: boolean
  issueCount: number
  onSelect: () => void
  onToggleVisible: () => void
  onFrame: () => void
  onRemove: () => void
  t: TFunction<'pointcloud'>
  describeError: (key: string | null | undefined) => string
}

function CloudRow({ cloud, active, issueCount, onSelect, onToggleVisible, onFrame, onRemove, t, describeError }: CloudRowProps) {
  const parsing = cloud.status === 'parsing'
  const failed = cloud.status === 'error'
  const dot = failed ? '#E5484D' : parsing ? 'var(--accent)' : issueCount > 0 ? '#F5A623' : '#30A46C'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={[
        'rounded-[10px] border px-3 py-2 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        active ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
        !cloud.visible && !failed ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${parsing ? 'animate-pulse' : ''}`} style={{ background: dot }} />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium text-[var(--text)] truncate" title={cloud.fileName}>{cloud.fileName}</div>
          <div className={`text-[11px] font-mono ${failed ? 'text-[#E5484D]' : 'text-[var(--text-faint)]'} truncate`}>
            {failed
              ? describeError(cloud.errorKey)
              : parsing
                ? `${t('load.parsingShort')} ${cloud.progress}%`
                : cloud.sourceKind === 'temporal-replay'
                  ? t('replay.rowStatus')
                  : `${t('status.points', { count: formatCount(cloud.pointCount) })} · ${cloud.format.toUpperCase()}`}
          </div>
        </div>
        {!failed && !parsing && (
          <RowIcon label={t('view.fitCloud')} onClick={onFrame}>
            <path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" />
          </RowIcon>
        )}
        {!failed && (
          <RowIcon label={cloud.visible ? t('actions.visible') : t('actions.hidden')} onClick={onToggleVisible} pressed={cloud.visible}>
            {cloud.visible
              ? <><path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" /><circle cx="7" cy="7" r="1.8" /></>
              : <><path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" /><path d="M2 12L12 2" /></>}
          </RowIcon>
        )}
        <RowIcon label={parsing ? t('actions.cancel') : t('actions.remove')} onClick={onRemove} danger>
          <path d="M3 3l8 8M11 3L3 11" />
        </RowIcon>
      </div>

      {parsing && (
        <div className="mt-2 h-[3px] rounded-full bg-[var(--border)] overflow-hidden">
          <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${cloud.progress}%` }} />
        </div>
      )}
    </div>
  )
}

function RowIcon({ label, onClick, children, danger, pressed }: {
  label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-[7px] text-[var(--text-faint)] hover:bg-[var(--surface)] transition-colors ${
        danger ? 'hover:text-[#E5484D]' : 'hover:text-[var(--text)]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} k`
  return String(n)
}

function formatReplayTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function formatUnit(unitScale: number): string {
  if (Math.abs(unitScale - 1) < 1e-9) return 'm'
  if (Math.abs(unitScale - 0.001) < 1e-9) return 'mm'
  if (Math.abs(unitScale - 0.01) < 1e-9) return 'cm'
  if (Math.abs(unitScale - 0.3048) < 1e-6) return 'ft'
  return `${unitScale} m`
}
