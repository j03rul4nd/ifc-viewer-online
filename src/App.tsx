import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import Viewer from './components/Viewer'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import UploadOverlay from './components/UploadOverlay'
import Landing from './components/Landing'
import ModelTree from './components/ModelTree'
import { ColumnStrip } from './components/ColumnStrip'
import { PanelRail } from './components/PanelRail'
import { usePanelRail } from './hooks/usePanelRail'
import { useWakeLock } from './hooks/useWakeLock'
import ValidationPanel from './components/ValidationPanel'
import ToastContainer from './components/ToastContainer'
import CameraControls from './components/CameraControls'
import WalkHud from './components/WalkHud'
import ModelInfoPanel from './components/ModelInfoPanel'
import ScenePanel from './components/ScenePanel'
import MeasurementPanel from './components/MeasurementPanel'
import SectionPanel from './components/SectionPanel'
import FloorPlanPanel from './components/FloorPlanPanel'
import ExportModal from './components/ExportModal'
import KeyboardHelpModal from './components/KeyboardHelpModal'
import SceneContextMenu, { type SceneContextMenuPayload } from './components/SceneContextMenu'
import { MobileSelectionBar } from './components/mobile/MobileSelectionBar'
import { MobileElementCard } from './components/mobile/MobileElementCard'
import SharedReportView, { decodeReportHash } from './components/SharedReportView'
import VerifyCertificateView from './components/VerifyCertificateView'
import WelcomeView from './components/WelcomeView'
import DashboardView from './components/dashboard/DashboardView'
import AdminView from './components/dashboard/AdminView'
import { isAccountEnabled, useCloudAccountStore } from './stores/cloudAccountStore'

// Client-side admin gate: a UX fast-path only — the REAL boundary is the
// Worker (users.global_role = super_admin; non-admins read 404 on /admin/*).
// Keyed by Clerk user id, NOT email: this repo and the shipped bundle are
// public, and a personal email hardcoded here would be exposed to anyone
// (GDPR data-minimisation + a phishing-target signal). The id is pseudonymous
// and useless without the Worker-side role.
const ADMIN_USER_IDS = new Set(['user_3GP6gqE5WAmVzHobM0BosBk9A58'])

// Dedicated auth pages ride in the lazy vendor-auth chunk (they import
// @clerk/*) — loaded only when /sign-in, /sign-up or /account is visited.
const LazyAuthPage = React.lazy(() => import('./components/account/AuthPage'))
// /ebook — the lead-magnet landing. Lazy so the handbook page (and its cover
// image markup) never costs the landing or the viewer a byte.
const LazyEbookView = React.lazy(() => import('./components/EbookView'))
import type { SharedReportPayload } from './components/SharedReportView'
import DemoGallery from './components/DemoGallery'
import MobileBottomNav from './components/MobileBottomNav'
import { MobileSheet } from './components/mobile/MobileSheet'
import OverlayHud from './components/OverlayHud'
import Blog from './components/Blog'
import PrivacyPolicy from './components/legal/PrivacyPolicy'
import { ebookByRoute } from './lib/ebook'
import TermsOfUse from './components/legal/TermsOfUse'
import EmbedModal from './components/EmbedModal'
import IdsModal from './components/IdsModal'
import { useCompareStore } from './stores/compareStore'
import { planCompareOverlay } from './lib/compare/overlay'
import IdsPanel from './components/IdsPanel'
import EirProfileEditor from './components/eir/EirProfileEditor'
import { useEirStore } from './stores/eirStore'
import { parseEirProfile, compileEirToIds } from './lib/eir'
import InviteRibbon from './components/InviteRibbon'
import InviteView from './components/InviteView'
import InviteFeedbackNudge from './components/InviteFeedbackNudge'
// Tour Mode (D-24) — lazy: nothing loads until the user opens the recorder/player
const TourPlayer   = React.lazy(() => import('./components/TourPlayer'))
const ClipStudio   = React.lazy(() => import('./components/studio/ClipStudio'))
const CoverStudioModal = React.lazy(() => import('./components/CoverStudioModal'))
const CompareModal = React.lazy(() => import('./components/CompareModal'))
const TourRecorder = React.lazy(() => import('./components/TourRecorder'))
// Client presentation skin (D-25) — lazy: loads only when ui=client / toggled on
const ClientPresentationLayout = React.lazy(() => import('./components/ClientPresentationLayout'))
import { isGisEnabled } from './lib/geo/gis-flag'
import { parsePanelTarget, parsePanelList } from './lib/ui/panel-commands'
import { closeAllPanels } from './lib/ui/panel-registry'
import { isSolarEnabled } from './lib/solar/solar-flag'
import { isPointCloudEnabled } from './lib/pointcloud/pc-flag'
import { isMeshEnabled } from './lib/mesh/mesh-flag'
import { isVideoEnabled } from './lib/video/video-flag'
import { useMeshStore } from './stores/meshStore'
import { useVectorLayerStore, hasPersistedVectorLayers } from './stores/vectorLayerStore'
import { useVideoStore } from './stores/videoStore'
import { usePointCloudStore } from './stores/pointCloudStore'
import { useModelGroups } from './hooks/useModelGroups'
import { useTransformHistoryStore } from './stores/transformHistoryStore'
// pc-types is deliberately dependency-free — importing it here costs the
// entry bundle nothing, which is why clampOffset and NO_OFFSET live there.
import { NO_OFFSET } from './lib/pointcloud/pc-types'
import { useSolarStore } from './stores/solarStore'

// Lazy: GeoPanel statically imports proj4/placement/geo runners, which must
// stay out of the entry chunk. Only ever mounted when VITE_FEATURE_GIS is on.
const GeoPanel = React.lazy(() => import('./components/GeoPanel'))
const SolarPanel = React.lazy(() => import('./components/SolarPanel'))
const SolarAnalysisPanel = React.lazy(() => import('./components/solar/SolarAnalysisPanel'))
// Lazy: PointCloudPanel statically imports the point cloud engine, its shader
// and its readers — none of that may reach the entry chunk.
const PointCloudPanel = React.lazy(() => import('./components/PointCloudPanel'))
// Lazy for the same reason: MeshPanel statically imports three's GLTF, OBJ and
// MTL loaders, which nobody who never imports a model should download.
const MeshPanel = React.lazy(() => import('./components/MeshPanel'))
// Lazy: the data-layer panel pulls proj4 + the vector builders. Mounted only
// once used, and kept mounted while layers exist (it owns their sync).
const VectorLayersPanel = React.lazy(() => import('./components/VectorLayersPanel'))
const TwinDevicesPanel = React.lazy(() => import('./components/TwinDevicesPanel'))
// The data legend overlay: lazy for the same reason, mounted only with data layers.
const DataLegend = React.lazy(() => import('./components/DataLegend'))
const TimeBar = React.lazy(() => import('./components/TimeBar'))
// Video resources are a separate lazy chunk: no media/Three implementation is
// downloaded until the tool is opened.
const VideoPanel = React.lazy(() => import('./components/VideoPanel'))
import { DEFAULT_DEMO_MODEL, DEMO_FILENAMES, DEMO_MODELS, type DemoModel, type DemoSet } from './demo-models/models'
import { lighten } from './lib/utils'
import { modelRegistry } from './lib/model-registry'
import { expandWithDecomp } from './lib/visibility'
import { useIfcLoader } from './lib/loader'
import {
  resetLoading, notifyModelRemoving, notifyModelRemoved, cancelAllLoads, type LoadingHooks,
  submitPointClouds, submitMeshes, canLoadKind, describeSourceError, sourceErrorKey, type SourceSubmitItem,
  removeSourceResult, clearSources, loadPointCloudsOnce, loadMeshesOnce,
} from './lib/loading'
import { legacyPhase } from './lib/loading/phases'
import {
  classifyFiles, groupMeshFiles, hasFilePayload, routedCount, fileExtensionOf, MESH_ENTRY_EXTENSIONS,
} from './lib/loading/drop-routing'
import { ACTIVE_STATUSES, type JobOrigin, type JobOutcome, type LoadSource } from './lib/loading/types'
import { fetchFileFromUrl } from './lib/fetch-ifc-url'
import { useLoadingStore, jobForModel } from './stores/loadingStore'
import { useSceneGroupStore } from './stores/sceneGroupStore'
import { LoadingCenter, LoadingIndicator, FirstLoadCard } from './components/loading'
import { publishAggregateResult } from './lib/validator'
import { useEditorHistory } from './hooks/useEditorHistory'
import { useValidationRunner } from './hooks/useValidationRunner'
import { useElementFocus } from './hooks/useElementFocus'
import { usePersistedPreferences } from './hooks/usePersistedPreferences'
import { useValidationStore } from './stores/validationStore'
import { useUIStore } from './stores/uiStore'
import { canonicalIfcType } from './lib/url-params'
import { useModelStore } from './stores/modelStore'
import { useEditorStore } from './stores/editorStore'
import { useSceneStore } from './stores/sceneStore'
import { useTakeoffStore } from './stores/takeoffStore'
import { useGeoStore } from './stores/geoStore'
import { parseBackgroundSpec } from './lib/scene/background'
import { planCutY } from './lib/cover/cuts'
import { applyTemplate, PRESENTATION_TEMPLATES, type PresentationTemplateId } from './lib/templates/presentationTemplates'
import { useClipStudioStore } from './stores/clipStudioStore'
import { linkViewer } from './lib/capture/viewer-link'
import { useCoverStudioStore } from './stores/coverStudioStore'
import { LOOSE } from './lib/scene-tree'
import { modelFileKey, type ModelGroups } from './hooks/useModelGroups'
import type { SdkCoverCommand } from './lib/event-bus'
import { projectDuration } from './lib/capture/project'
import type { TourStep } from './types'
import { useCaptureStore } from './stores/captureStore'
import { usePresentationStore } from './stores/presentationStore'
import { toast } from './stores/toastStore'
import { appBus } from './lib/event-bus'
import type { ViewerAPI } from './lib/viewer'
import { DEFAULT_HIDDEN_TYPES } from './lib/viewer'
import type { GeoPlacement } from './lib/geo/geo-types'
import { useTwinDeviceStore } from './stores/twinDeviceStore'
import { TwinLabels } from './components/TwinLabels'
import type { Route, ViewerStyle, SelectedInfo, ViewerHandle, ModelInfo, Category, CameraPreset } from './types'
import * as Icons from './components/Icons'
import { useSeo } from './seo'
import i18n from './i18n/config'
import {
  parseAppUrlParams,
  resolveEmbedChrome,
  emitEmbedEvent,
  isEmbedded,
  rememberHostOrigin,
} from './lib/url-params'
import { fetchIfcFromUrl } from './lib/fetch-ifc-url'
import { resolveInvite, shouldShowInviteRibbon, shouldShowInviteView } from './lib/invite-registry'
import { getStoredEntrySource } from './lib/attribution'
import { runIds, cancelActiveIdsRuns, IdsCheckError } from './lib/ids/ids-runner'
import { parseIds, IdsParseError } from './lib/ids/ids-parser'
import { renderReasons } from './lib/ids/ids-engine-facets'
import { useIdsStore } from './stores/idsStore'
import { useOverlayStore } from './stores/overlayStore'
import {
  trackFileOpened,
  trackValidationCompleted,
  trackLandingCtaClicked,
  trackValidationPanelOpened,
  trackRouteChanged,
  trackViewerFirstInteraction,
  trackFeatureUsed,
  trackFileOpenFailed,
  trackIdsFileLoaded,
} from './lib/analytics'

// ── ModelTree imperative handle ───────────────────────────────────────────────
// Re-exported from the component so the ref type has one definition; see
// ModelTree.tsx for what the outcome means and why there is one.
import type { ModelTreeHandle, RevealOutcome } from './components/ModelTree'
export type { ModelTreeHandle, RevealOutcome }

/**
 * Hand an SDK command to the panel that owns the feature and resolve once that
 * panel acknowledges it.
 *
 * The panels serving `sdk:*` are lazy AND gated, so a host command can arrive
 * before there is anyone to receive it. Dropping it would look to the host like
 * a silent failure; re-emitting until something answers would run a command
 * like `add` twice. So we wait for a subscriber to exist, then emit exactly
 * once, and give up with a reason the host can act on.
 */
async function dispatchPanelCommand<E extends 'sdk:solar' | 'sdk:site' | 'sdk:pointcloud' | 'sdk:video' | 'sdk:mesh'>(
  event: E,
  payload: Omit<Parameters<Parameters<typeof appBus.on<E>>[1]>[0], 'done'>,
  opts: {
    unavailable: string
    timeoutMs?: number
    /**
     * How long to wait for the owning panel to mount. The default suits a
     * command sent by a host into a running viewer. A command that rides the
     * PAGE LOAD needs far longer: the panels are lazy and gated behind the
     * model being ready, so on a cold load the wasm parse of a multi-megabyte
     * IFC happens first and three seconds expires before anyone is listening.
     */
    subscriberTimeoutMs?: number
  } = { unavailable: 'Panel unavailable' },
): Promise<string | undefined> {
  const deadline = Date.now() + (opts.subscriberTimeoutMs ?? 3_000)
  while (!appBus.hasListeners(event)) {
    if (Date.now() > deadline) throw new Error(opts.unavailable)
    await new Promise((r) => setTimeout(r, 50))
  }
  return new Promise<string | undefined>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`"${event}" did not complete in time`)),
      opts.timeoutMs ?? 15 * 60_000,   // a multi-GB scan parses for minutes
    )
    appBus.emit(event, {
      ...payload,
      done: (ok: boolean, errorOrId?: string) => {
        clearTimeout(timer)
        if (ok) resolve(errorOrId)
        else reject(new Error(errorOrId ?? 'Command failed'))
      },
    } as Parameters<Parameters<typeof appBus.on<E>>[1]>[0])
  })
}

/**
 * A file name for a scan fetched from a URL.
 *
 * It has to keep its extension: the point cloud reader registry routes on it,
 * so a scan called "download" is a scan nothing can open. Falls back to .las,
 * which is what an extensionless LiDAR URL almost always is.
 */
function deriveScanFileName(url: string): string {
  let last = ''
  try { last = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() ?? '') }
  catch { last = '' }
  const name = last.replace(/[\/?:*"<>|]+/g, '_').trim()
  return /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name || 'scan'}.las`
}

/** The last path segment of a URL (query and fragment excluded), or ''. */
function urlPathName(url: string): string {
  try { return decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() ?? '') }
  catch { return '' }
}

// ── SDK reply shapes ────────────────────────────────────────────────────────
// What the embed bridge hands back to a host. Plain data, built from the same
// stores the panels read, and deliberately narrower than the internal state:
// every field here is one a host can come to depend on.

function asVec3(v: unknown): { x: number; y: number; z: number } | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const x = Number(o.x), y = Number(o.y), z = Number(o.z)
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null
}

function walkStateOut(s: { active: boolean; speed: number }): { active: boolean; speed: number } {
  return { active: s.active, speed: s.speed }
}

/** Site-local wall time of an instant, without pulling suncalc into this chunk. */
function wallDateTime(ms: number, timeZone: string): { date: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms))
    const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00'
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
  } catch {
    const d = new Date(ms).toISOString()
    return { date: d.slice(0, 10), time: d.slice(11, 16) }
  }
}

function solarStateOut() {
  const s = useSolarStore.getState()
  const wall = wallDateTime(s.timeUTC, s.timeZone)
  return {
    active: s.active,
    date: wall.date,
    time: wall.time,
    timeZone: s.timeZone,
    moon: s.moonOn,
    sky: s.skyOn,
    quality: s.quality,
    // `source` says how much to trust it: 'ifc' is the model's own
    // georeference, 'manual' a location someone typed or a host passed.
    location: s.location
      ? { lat: s.location.lat, lon: s.location.lon, source: s.location.source }
      : null,
  }
}

function siteStateOut() {
  const g = useGeoStore.getState()
  return {
    enabled: g.mapMode === 'on',
    status: g.mapMode,
    terrain: g.terrainEnabled,
    buildings: g.buildingsEnabled,
    buildingsStatus: g.buildingsStatus,
    detail: g.contextDetail,
    terrainStyle: g.terrainStyle,
    exaggeration: g.terrainExaggeration,
    vehicles: g.vehicles,
    placement: g.placement
      ? { lat: g.placement.lat, lon: g.placement.lon, rotationDeg: g.placement.rotationDeg, source: g.placement.source, confidence: g.placement.confidence }
      : null,
    // A licence obligation, not decoration: a host that shows the map must
    // show these.
    attributions: g.attributions.slice(),
  }
}

function sectionsOut(api: ViewerAPI) {
  const snap = api.getSections().getSnapshot()
  return {
    planes: snap.planes.map((p) => ({
      id: p.id, kind: p.kind, axis: p.axis, enabled: p.enabled, offset: p.offset,
      flipped: p.flipped, range: { min: p.range.min, max: p.range.max },
    })),
    box: snap.box ? { enabled: snap.box.enabled, ranges: snap.box.ranges } : null,
    active: snap.active,
  }
}

/** `autoplay`: true = the player's default pace, a number = ms per step, else off. */
function parseAutoplay(v: unknown): number | null {
  if (v === true) return 6_000
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.min(120_000, Math.max(1_500, v))
  return null
}

function tourStateOut() {
  const s = usePresentationStore.getState()
  return {
    playing: s.mode === 'playing',
    title: s.tour?.title ?? null,
    template: s.templateId,
    stepIndex: s.tour ? s.stepIndex : null,
    total: s.tour?.steps.length ?? 0,
    // Enough to save a tour and replay it later with playTour().
    steps: (s.tour?.steps ?? []).map((st) => ({
      position: st.camera.position,
      target: st.camera.target,
      caption: st.caption ?? null,
      modelId: st.modelId ?? null,
      highlight: st.highlightedExpressIds ?? [],
      isolate: st.isolatedCategories ?? [],
    })),
  }
}

function presentationStateOut() {
  const s = useClipStudioStore.getState()
  return {
    open: s.open,
    clips: s.project.clips.length,
    durationSec: Math.round(projectDuration(s.project) * 10) / 10,
    width: s.output.width,
    height: s.output.height,
  }
}

/**
 * Open Cover Studio if needed, wait for it to be listening, run one command.
 * The studio is a lazy modal that grabs the current view on open, so the
 * first command after opening waits for that too (inside the modal).
 */
async function coverCommand(cmd: Omit<SdkCoverCommand, 'done'>): Promise<unknown> {
  useCoverStudioStore.getState().setOpen(true)
  const deadline = Date.now() + 30_000
  while (!appBus.hasListeners('sdk:cover')) {
    if (Date.now() > deadline) throw new Error('Cover Studio did not open in time')
    await new Promise((r) => setTimeout(r, 50))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cover Studio did not finish in time')), 5 * 60_000)
    appBus.emit('sdk:cover', {
      ...cmd,
      done: (ok, error, data) => { clearTimeout(timer); if (ok) resolve(data); else reject(new Error(error ?? 'Cover command failed')) },
    })
  })
}

function groupsOut(g: ModelGroups) {
  return {
    groups: g.groups.map((x) => ({
      id: x.id, name: x.label, user: x.user, basis: x.basis,
      modelIds: [...x.memberIds], cloudIds: [...x.cloudIds],
    })),
    looseCloudIds: [...g.looseCloudIds],
  }
}

/** A group the user (or a host) created — the only kind that can be renamed, deleted or filled. */
function findUserGroup(id: unknown): { id: string; name: string } {
  const g = useSceneGroupStore.getState().userGroups.find((x) => x.id === id)
  if (!g) throw new Error(`No user group "${String(id)}" — automatic groups cannot be edited; create one with createGroup()`)
  return g
}

function measurementsOut(api: ViewerAPI) {
  const snap = api.getMeasure().getSnapshot()
  return {
    tool: snap.tool,
    units: snap.settings.units,
    // Values are always metres (square metres for areas, degrees for angles)
    // whatever the panel displays — a host formats them its own way.
    items: snap.items.map((m) => ({
      id: m.id,
      kind: m.kind,
      name: m.name,
      value: m.kind === 'point' ? null : m.value,
      ...(m.kind === 'area' ? { perimeter: m.perimeter, planar: m.planar } : {}),
      ...(m.kind === 'distance' ? { components: m.components } : {}),
      ...(m.kind === 'point' ? { coords: m.coords, frame: m.frame } : {}),
      points: m.points,
    })),
  }
}

// Camera presets accepted by the `ifcviewer:view` embed command.
const CAMERA_PRESETS: CameraPreset[] = ['iso', 'top', 'bottom', 'front', 'back', 'left', 'right']

// All non-English blog language prefixes supported in URLs
const BLOG_LANGS = 'es|de|fr|pt|it|ca|zh|ja|th'
const BLOG_LANG_RE = new RegExp(`^\\/(${BLOG_LANGS})\\/blog`)
const BLOG_SLUG_RE = new RegExp(`^(?:\\/(${BLOG_LANGS}))\\/blog\\/([^/]+)\\/?$`)

function blogUrlBase(lang: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const prefix = lang !== 'en' ? `${lang}/` : ''
  return base.endsWith('/') ? `${base}${prefix}blog/` : `${base}/${prefix}blog/`
}

export default function App() {
  const { t: tToasts } = useTranslation('toasts')
  const { t: tCommon } = useTranslation('common')
  const { t: tViewer } = useTranslation('viewer')
  const { t: tTourNs } = useTranslation('tour')
  const { t: tTree } = useTranslation('tree')
  const { t: tToolbar } = useTranslation('toolbar')
  const { t: tSidebar } = useTranslation('sidebar')
  // Each panel already names itself in its own namespace; the rail reuses those
  // names rather than inventing a second set that could drift from the headers.
  const { t: tCloud } = useTranslation('pointcloud')
  const { t: tMesh } = useTranslation('mesh')
  const { t: tSolar } = useTranslation('solar')


  // ── Embed / deep-link URL params (?model=…&embed=1&…) ─────────────────────
  // Parsed once at mount; drives auto-loading remote models and the chrome a
  // host iframe (blog, CDE panel, third-party screen) should show.
  const urlParams   = useMemo(() => parseAppUrlParams(), [])
  const embedChrome = useMemo(() => resolveEmbedChrome(urlParams), [urlParams])

  // ── Client presentation skin (D-25) ───────────────────────────────────────
  // `?ui=client` bootstraps uiStore.clientMode; from there the flag is a pure
  // UI layer toggleable in-app (no reload, no remount — model/camera persist).
  useEffect(() => {
    if (urlParams.preset === 'client') useUIStore.getState().setClientMode(true)
  }, [urlParams])

  // ── Shared tour links (D-26): `#tour=<payload>` auto-playback ─────────────
  // The model arrives via the existing ?model= pipeline; once it loads, the
  // decoded tour starts with zero clicks. Corrupt links degrade to a clear
  // toast + the normal viewer — never a blank screen.
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (!hash.startsWith('#tour=')) return
    void (async () => {
      const { parseTourHash, payloadToTour } = await import('./lib/share/tourShareLink')
      const payload = parseTourHash(hash)
      // Clean the fragment either way so reloads/copies don't re-trigger.
      history.replaceState(null, '', window.location.pathname + window.location.search)
      if (!payload) {
        toast(tTourNs('link.invalid'), 'error', { duration: 6000 })
        return
      }
      const startPlayback = (): void => {
        const store = usePresentationStore.getState()
        store.setTour(payloadToTour(payload))
        if (payload.tpl) store.setTemplateId(payload.tpl)
        store.play(0)
      }
      if (useSceneStore.getState().models.length > 0) startPlayback()
      else {
        const off = appBus.once('model:loaded', () => startPlayback())
        // If the model never arrives (bad ?model=, network error), the loader's
        // own error toast explains it; just stop waiting after a generous cap.
        window.setTimeout(off, 120_000)
      }
    })()
  // Run once at boot — the hash is consumed immediately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Personalized invite context (Phase 1) ────────────────────────────────
  // Resolved from the session attribution captured in main.tsx (NOT the live
  // URL, which has already been stripped of ?ref=/ /i/<code>). Drives the
  // subtractive, segment-aware ribbon. null for organic / unknown visits.
  const invite = useMemo(() => resolveInvite(getStoredEntrySource()?.source), [])
  const [inviteDismissed, setInviteDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem('ifc.invite.ribbonDismissed') === '1' } catch { return false }
  })
  const dismissInvite = useCallback((): void => {
    try { sessionStorage.setItem('ifc.invite.ribbonDismissed', '1') } catch { /* ignore */ }
    setInviteDismissed(true)
  }, [])

  // Dedicated welcome view (Phase 1.5 — referral/standards only). One-time +
  // skippable; the normal landing renders underneath it.
  const [inviteViewDismissed, setInviteViewDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem('ifc.invite.viewDismissed') === '1' } catch { return false }
  })
  const dismissInviteView = useCallback((): void => {
    try { sessionStorage.setItem('ifc.invite.viewDismissed', '1') } catch { /* ignore */ }
    setInviteViewDismissed(true)
  }, [])

  // Post-aha Mom-Test nudge (Phase 2 — once per session, after first validation,
  // invited non-public visitors only).
  const [feedbackNudgeOpen, setFeedbackNudgeOpen] = useState(false)
  const [feedbackNudgeSpent, setFeedbackNudgeSpent] = useState<boolean>(() => {
    try { return sessionStorage.getItem('ifc.invite.feedbackSpent') === '1' } catch { return false }
  })
  const dismissFeedbackNudge = useCallback((): void => {
    try { sessionStorage.setItem('ifc.invite.feedbackSpent', '1') } catch { /* ignore */ }
    setFeedbackNudgeOpen(false)
    setFeedbackNudgeSpent(true)
  }, [])

  const [route, setRoute] = useState<Route>(() => {
    if (typeof window !== 'undefined') {
      if (decodeReportHash(window.location.hash)) return 'report'
      // A deep-linked model (or explicit embed) opens straight into the viewer.
      if (urlParams.modelUrls.length > 0 || urlParams.embed) return 'viewer'
      const base = import.meta.env.BASE_URL ?? '/'
      const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
      if (BLOG_LANG_RE.test(rel) || rel.startsWith('/blog')) return 'blog'
      if (rel === '/privacy' || rel.startsWith('/privacy/')) return 'privacy'
      if (rel === '/terms'   || rel.startsWith('/terms/'))   return 'terms'
      if (rel.startsWith('/verify/')) return 'verify'
      if (rel === '/welcome' || rel.startsWith('/welcome/')) return 'welcome'
      if (rel === '/ebook'   || rel.startsWith('/ebook/'))   return 'ebook'
      // Dedicated auth pages (F2) — only exist when accounts are enabled.
      if (isAccountEnabled()) {
        if (rel === '/sign-in' || rel.startsWith('/sign-in/')) return 'signin'
        if (rel === '/sign-up' || rel.startsWith('/sign-up/')) return 'signup'
        if (rel === '/account' || rel.startsWith('/account/')) return 'account'
        if (rel === '/dashboard' || rel.startsWith('/dashboard/')) return 'dashboard'
        if (rel === '/admin' || rel.startsWith('/admin/')) return 'admin'
      }
    }
    return 'landing'
  })

  // Locale-driven document meta. Disabled on routes that own their own title
  // and share metadata. This hook lives in the parent, so it would otherwise
  // overwrite blog/article meta after the child effect has set it.
  useSeo({ enabled: route !== 'ebook' && route !== 'blog' })

  // /verify/<cert_hash> — public certificate verification (F1). NOT in the
  // sitemap (the space of hashes is unbounded).
  const [verifyHash] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    const base = import.meta.env.BASE_URL ?? '/'
    const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
    return /^\/verify\/([^/]*)\/?$/.exec(rel)?.[1] ?? ''
  })

  // /ebook sub-route: '' = the primary handbook, otherwise a book's route segment.
  const [ebookRoute, setEbookRoute] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    const base = import.meta.env.BASE_URL ?? '/'
    const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
    return /^\/ebook\/([^/]*)\/?$/.exec(rel)?.[1] ?? ''
  })

  // Blog sub-route: null = list, string = post slug
  const [blogSlug, setBlogSlug] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const base = import.meta.env.BASE_URL ?? '/'
    const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
    const m = BLOG_SLUG_RE.exec(rel) ?? /^\/blog\/([^/]+)\/?$/.exec(rel)
    // BLOG_SLUG_RE has 2 capture groups (lang, slug); plain blog RE has 1 (slug)
    return m ? (m[2] ?? m[1]) : null
  })

  // Blog language: 'en' | 'es' | 'de' | 'fr' | 'pt' | 'it' | 'ca' | 'zh' | 'ja' | 'th'
  const [blogLang, setBlogLang] = useState<string>(() => {
    if (typeof window === 'undefined') return 'en'
    const base = import.meta.env.BASE_URL ?? '/'
    const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
    const m = BLOG_LANG_RE.exec(rel)
    return m ? m[1] : 'en'
  })
  const [accent, setAccent] = useState(() => urlParams.accent ?? '#5E6AD2')

  const [landingTheme, setLandingTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('lp-theme') as 'dark' | 'light') ?? 'dark' } catch { return 'dark' }
  })
  const handleToggleLandingTheme = useCallback((): void => {
    setLandingTheme((cur) => {
      const next = cur === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('lp-theme', next) } catch { /* ignore */ }
      return next
    })
  }, [])

  // ── URL helpers for legal pages ──────────────────────────────────────────
  const legalUrl = (page: 'privacy' | 'terms'): string => {
    const base = import.meta.env.BASE_URL ?? '/'
    return base.endsWith('/') ? `${base}${page}` : `${base}/${page}`
  }

  const handleNavigateToPrivacy = useCallback((): void => {
    history.pushState(null, '', legalUrl('privacy'))
    setRoute('privacy')
  }, [])

  const handleNavigateToTerms = useCallback((): void => {
    history.pushState(null, '', legalUrl('terms'))
    setRoute('terms')
  }, [])

  // ── URL helpers for blog navigation ──────────────────────────────────────
  const handleNavigateToBlog = useCallback((lang?: string): void => {
    const resolvedLang = lang ?? 'en'
    const path = blogUrlBase(resolvedLang)
    history.pushState(null, '', path)
    setBlogLang(resolvedLang)
    setRoute('blog')
    setBlogSlug(null)
  }, [])

  const handleNavigateToBlogPost = useCallback((slug: string): void => {
    history.pushState(null, '', `${blogUrlBase(blogLang)}${slug}/`)
    setBlogSlug(slug)
  }, [blogLang])

  const handleNavigateFromBlogToList = useCallback((): void => {
    history.pushState(null, '', blogUrlBase(blogLang))
    setBlogSlug(null)
  }, [blogLang])

  // ── Browser back/forward support ──────────────────────────────────────────
  useEffect(() => {
    const onPopState = (): void => {
      const base = import.meta.env.BASE_URL ?? '/'
      const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
      if (window.location.hash && decodeReportHash(window.location.hash)) {
        setRoute('report')
      } else if (BLOG_LANG_RE.test(rel) || rel.startsWith('/blog')) {
        setRoute('blog')
        const langM = BLOG_LANG_RE.exec(rel)
        setBlogLang(langM ? langM[1] : 'en')
        const slugM = BLOG_SLUG_RE.exec(rel) ?? /^\/blog\/([^/]+)\/?$/.exec(rel)
        setBlogSlug(slugM ? (slugM[2] ?? slugM[1]) : null)
      } else if (rel === '/privacy' || rel.startsWith('/privacy/')) {
        setRoute('privacy')
      } else if (rel === '/terms' || rel.startsWith('/terms/')) {
        setRoute('terms')
      } else if (rel.startsWith('/verify/')) {
        setRoute('verify')
      } else if (rel === '/welcome' || rel.startsWith('/welcome/')) {
        setRoute('welcome')
      } else if (rel === '/ebook' || rel.startsWith('/ebook/')) {
        setRoute('ebook')
        setEbookRoute(/^\/ebook\/([^/]*)\/?$/.exec(rel)?.[1] ?? '')
      } else if (isAccountEnabled() && (rel === '/sign-in' || rel.startsWith('/sign-in/'))) {
        setRoute('signin')
      } else if (isAccountEnabled() && (rel === '/sign-up' || rel.startsWith('/sign-up/'))) {
        setRoute('signup')
      } else if (isAccountEnabled() && (rel === '/account' || rel.startsWith('/account/'))) {
        setRoute('account')
      } else if (isAccountEnabled() && (rel === '/dashboard' || rel.startsWith('/dashboard/'))) {
        setRoute('dashboard')
      } else if (isAccountEnabled() && (rel === '/admin' || rel.startsWith('/admin/'))) {
        setRoute('admin')
      } else {
        // "/" is ambiguous: it is the landing AND the (stateful, non-URL)
        // viewer. Never kick a user out of the viewer on a popstate — Clerk's
        // post-auth SPA navigations land here, and resetting to the landing
        // was throwing freshly signed-in users out of their loaded model.
        setRoute((current) => (current === 'viewer' ? current : 'landing'))
        setBlogSlug(null)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // ── First-session welcome (F2) ─────────────────────────────────────────────
  // The FIRST time this browser sees the user signed in, route them to
  // /welcome — but only from the landing (an OAuth redirect reloads the page
  // and would otherwise drop them there cold). Mid-work (viewer) the in-place
  // welcome toast already greeted them; the flag still burns so they are
  // never bounced later.
  const accountStatus = useCloudAccountStore((s) => s.status)
  const accountUserId = useCloudAccountStore((s) => s.userId)
  const isSupremeAdmin = accountStatus === 'signed-in' && !!accountUserId && ADMIN_USER_IDS.has(accountUserId)
  useEffect(() => {
    if (accountStatus !== 'signed-in' || !accountUserId) return
    const key = `ifcv.welcomed.${accountUserId}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch { return }
    if (route === 'landing') {
      history.pushState(null, '', '/welcome')
      setRoute('welcome')
    }
  }, [accountStatus, accountUserId, route])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-2', lighten(accent, 22))
  }, [accent])

  const viewerApiRef = useRef<ViewerAPI | null>(null)
  // The viewer frames groups for calls that carry none (SDK, embed, other
  // panels) — it needs the same grouping the Scene panel shows.
  const modelGroups = useModelGroups()
  const sceneGroupIdOf = modelGroups.groupIdOf
  const modelGroupsRef = useRef(modelGroups)
  modelGroupsRef.current = modelGroups
  const hasSceneModels = useSceneStore((s) => s.models.length > 0)
  // Mirror moves the viewer makes on its own (map satellites) into sceneStore,
  // or the Scene panel and group moves keep working from the old position.
  useEffect(() => {
    const api = viewerApiRef.current
    if (!api?.onModelTransformChange) return
    return api.onModelTransformChange((id, t) => {
      const m = useSceneStore.getState().models.find((x) => x.id === id)
      if (!m) return
      const p = m.transform.position as { x: number; y: number; z: number } | undefined
      const same = p && Math.abs(p.x - t.position.x) < 1e-6 && Math.abs(p.y - t.position.y) < 1e-6 && Math.abs(p.z - t.position.z) < 1e-6
      if (!same) useSceneStore.getState().setModelTransform(id, t)
    })
  }, [hasSceneModels])
  useEffect(() => { viewerApiRef.current?.setFramingGroups(sceneGroupIdOf) }, [sceneGroupIdOf])
  const viewerRef    = useRef<ViewerHandle>(null)
  const modelTreeRef = useRef<ModelTreeHandle>(null)

  // SDK correlation now travels on each load job (`requestId` on the job and
  // on every hook call), so a host's add() can never be resolved with another
  // request's model — the single pending-id slot this replaced could.

  const prevRouteRef               = useRef<Route>(route)
  const hasTrackedFirstInteraction = useRef(false)

  // Demo gallery overlay. Analytics tags demo loads by the job's origin.
  const [showDemoGallery, setShowDemoGallery] = useState(false)

  // Models whose `?validate` auto-run waits for the load queue to go idle.
  // Validation parses the IFC again in WASM; starting one per model while the
  // rest of a federated set is still converting stacks those parses.
  const pendingAutoValidateRef = useRef<Set<string>>(new Set())
  // Last `model-progress` relay per job: when (throttle) and the highest
  // percent sent (an automatic retry restarts the job's own progress at 0, and
  // a host's bar must still never move backwards).
  const progressRelayRef = useRef<Map<string, { at: number; percent: number }>>(new Map())
  // IFC files dropped on the viewer, handed to the upload dialog for review.
  const [uploadInitial, setUploadInitial] = useState<File[] | null>(null)
  // Scans / meshes of a drop whose IFCs are still in the upload dialog (see
  // routeDroppedFiles), and whether that dialog is open right now.
  const deferredDropRef = useRef<{ pointcloud: File[]; mesh: File[] } | null>(null)
  const showUploadRef = useRef(false)

  // ── Shared-report route — decode on mount if URL hash contains #report=... ──
  const [sharedReport, setSharedReport] = useState<SharedReportPayload | null>(() => {
    if (typeof window === 'undefined') return null
    return decodeReportHash(window.location.hash)
  })

  // Model & loading state
  const [modelInfo,    setModelInfo]    = useState<ModelInfo | null>(null)
  // `loadingState` is derived (see below, next to sceneModels): with a queue
  // there is no single "the load" whose state a flag could hold.
  const [loadError,    setLoadError]    = useState<string | null>(null)

  // Viewer interaction state
  const [viewerStyle] = useState<ViewerStyle>('shaded')
  const [selected,   setSelected]   = useState<SelectedInfo | null>(null)
  // Spaces start hidden — see DEFAULT_HIDDEN_TYPES for why a room's air was
  // tinting the whole facade.
  const [hidden,     setHidden]     = useState<Set<string>>(() => new Set(DEFAULT_HIDDEN_TYPES))
  const [isolated,   setIsolated]   = useState<string | null>(null)
  // Single-element isolation (localId). Overrides category filters in the viewer.
  const [isolatedElement,      setIsolatedElement]      = useState<number | null>(null)
  const [isolatedElementModel, setIsolatedElementModel] = useState<string | null>(null)
  const [showUpload, setShowUpload]           = useState(false)
  useEffect(() => { showUploadRef.current = showUpload }, [showUpload])
  const [showExportModal, setShowExportModal] = useState(false)
  const [showEmbedModal, setShowEmbedModal]   = useState(false)
  const [showIdsModal, setShowIdsModal]       = useState(false)
  const [showCompareModal, setShowCompareModal] = useState(false)
  const eirEditorOpen = useEirStore((s) => s.editorOpen)
  const [showHelp,   setShowHelp]             = useState(false)
  const [ctxMenu,    setCtxMenu]              = useState<SceneContextMenuPayload | null>(null)

  // Stores
  const { validationMode, result } = useValidationStore()
  const tourMode = usePresentationStore((s) => s.mode)
  const clipStudioOpen = useClipStudioStore((s) => s.open)
  const coverStudioOpen = useCoverStudioStore((s) => s.open)
  const clientMode = useUIStore((s) => s.clientMode)
  const clientAdvancedTools = useUIStore((s) => s.clientAdvancedTools)


  // Effective chrome (D-25): the client skin layers over the URL-derived embed
  // chrome — everything technical hidden, camera presets kept. All JSX gating
  // below uses this, so toggling client mode is an instant UI-layer change.
  const effectiveChrome = useMemo(
    () => clientMode
      ? {
          ...embedChrome,
          showToolbar: false,
          showTree: false,
          showSidebar: false,
          openPanel: false,
          showHome: false,
          showCameraControls: true,
        }
      : embedChrome,
    [embedChrome, clientMode],
  )

  // Embedded presets are a contract, not a suggestion inherited from the
  // visitor's last full-viewer session. The column layout is intentionally
  // remembered for the normal app, but that meant an article iframe opened
  // with the previously persisted validation drawer covering the entire live
  // 3D example even though `ui=minimal` resolves to `openPanel: false`.
  // `setState` changes this isolated runtime without rewriting the visitor's
  // saved full-viewer preference.
  useEffect(() => {
    if (embedChrome.embed) {
      // The tree too: a host that asked for it (`tree=1`) gets it open, not
      // folded to a strip because the reader once folded it in the app.
      useUIStore.setState({ validationPanelOpen: embedChrome.openPanel, treeVisible: embedChrome.showTree })
    }
  }, [embedChrome])

  // The rail's vocabulary. Icons live here rather than in the hook so the hook
  // imports no JSX and stays testable as plain logic.
  const railIcons = useMemo(() => ({
    properties:  <Icons.Sliders size={15} />,
    scene:       <Icons.Layers size={15} />,
    measurement: <Icons.Ruler size={15} />,
    section:     <Icons.Isolate size={15} />,
    plans:       <Icons.FileIfc size={15} />,
    map:         <Icons.Globe size={15} />,
    solar:       <Icons.Sparkles size={15} />,
    pointcloud:  <Icons.Zap size={15} />,
    mesh:        <Icons.Building size={15} />,
  }), [])
  const railLabels = useMemo(() => ({
    properties:  tSidebar('title'),
    scene:       tToolbar('scene'),
    measurement: tToolbar('measure'),
    section:     tToolbar('section'),
    plans:       tToolbar('plans'),
    map:         tToolbar('map'),
    solar:       tSolar('panel.title'),
    pointcloud:  tCloud('title'),
    mesh:        tMesh('title'),
  }), [tToolbar, tSidebar, tSolar, tCloud, tMesh])
  // Read here rather than from the destructured block below, which is declared
  // after this point in the component.
  const railMeasurementTool = useUIStore((s) => s.activeMeasurementTool)
  const railClipPlanes = useUIStore((s) => s.clipPlaneCount)
  const railPlanView = useUIStore((s) => s.activePlanViewId)
  const railModelCount = useSceneStore((s) => s.models.length)
  const runtimePanels = useUIStore((s) => s.runtimePanels)

  // Content gates: these two act ON something loaded, so the tool only earns
  // its place once there is something for it to act on.
  const pointCloudCount = usePointCloudStore((s) => s.clouds.length)
  const meshCount = useMeshStore((s) => s.meshes.length)
  const vectorLayersInUse = useVectorLayerStore((s) => s.panelOpen || s.layers.length > 0 || s.restorePending || !!s.setupUrl)
  // Operational twin: the runner (polling + painting) loads only once a source exists or the panel opens.
  const twinInUse = useTwinDeviceStore((s) => s.panelOpen || s.sources.length > 0)
  // `?twin=home|community`: a shared link that opens the model with a live twin demo on it.
  useEffect(() => {
    const id = /[?&]twin=(home|community)\b/.exec(window.location.search)?.[1] as 'home' | 'community' | undefined
    if (!id) return
    void import('./lib/twin/templates').then((m) => m.applyTemplateWhenLoaded(id))
  }, [])
  useEffect(() => {
    if (!twinInUse) return
    let stop: (() => void) | null = null
    let cancelled = false
    void import('./lib/twin/device-runner').then((m) => {
      if (!cancelled) stop = m.startTwinRunner(() => viewerApiRef.current)
    })
    return () => { cancelled = true; stop?.() }
  }, [twinInUse])
  // Layers saved on this device come back on boot. Only a flag here: the panel
  // (and with it proj4 + the vector chunk) mounts only when there IS something.
  // A `?layers=` link wins: it says what the scene shows, like `?model=`.
  useEffect(() => {
    const setup = urlParams.layersUrl
    if (setup) useVectorLayerStore.getState().setSetupUrl(setup)
    else if (hasPersistedVectorLayers()) useVectorLayerStore.getState().setRestorePending(true)
  }, [urlParams.layersUrl])

  // Availability, stated from the SAME conditions that render each panel below.
  // Written from memory instead, it drifted immediately: the client skin got a
  // rail offering Scene and Map, neither of which it mounts, so two of three
  // icons did nothing when pressed. If you change a panel's render condition,
  // change its line here.
  const railAvailable = useMemo(() => ({
    properties:  effectiveChrome.showSidebar,
    scene:       !clientMode,
    measurement: !clientMode || clientAdvancedTools,
    section:     !clientMode || clientAdvancedTools,
    plans:       !clientMode,
    map:         isGisEnabled() && !clientMode,
    solar:       isSolarEnabled(),
    pointcloud:  isPointCloudEnabled() && !clientMode && pointCloudCount > 0,
    mesh:        isMeshEnabled() && !clientMode && meshCount > 0,
  }), [effectiveChrome.showSidebar, clientMode, clientAdvancedTools, pointCloudCount, meshCount])

  // A parked tool can still be doing something; the rail and the mobile grid
  // both show it. The old mobile grid carried these and the rail did not.
  const railBadges = useMemo(() => ({
    measurement: { dot: railMeasurementTool !== 'none' },
    section:     { badge: railClipPlanes > 0 ? railClipPlanes : undefined },
    plans:       { dot: !!railPlanView },
    scene:       { badge: railModelCount > 1 ? railModelCount : undefined },
  }), [railMeasurementTool, railClipPlanes, railPlanView, railModelCount])

  const railItems = usePanelRail({
    icons: railIcons,
    labels: railLabels,
    badges: railBadges,
    available: railAvailable,
    // A runtime allowlist from the SDK outranks the one the URL arrived with:
    // a host that scopes the rail after load meant to, and should not have to
    // reload the iframe to do it.
    allow: runtimePanels ?? effectiveChrome.panels,
  })

  const mobileTools = useMemo(
    () => railItems.filter((item) => item.id !== 'properties'),
    [railItems],
  )
  const {
    treeVisible, setTreeVisible, treeWidth, hiddenElements, clearHiddenElements, setElementsVisible, clearHiddenElementsForModel,
    mobileSidebarOpen, setMobileSidebarOpen, setPendingSidebarTab,
    cameraControlsVisible, toggleCameraControls,
    scenePanelOpen, toggleScenePanel, setScenePanelOpen,
    setClipPanelOpen, setClipPlaneCount, setPlansPanelOpen,
    activePlanViewId, setActivePlanViewId,
    setMeasurementPanelOpen, setActiveMeasurementTool,
    gpuBackend, setGpuBackend,
    setValidationPanelOpen,
  } = useUIStore()

  const {
    models: sceneModels,
    activeModelId,
    addModel:           addSceneModel,
    setModelVisible:    setSceneModelVisible,
    setModelTransform:  setSceneModelTransform,
    setActiveModel:     setSceneActiveModel,
    removeModel:        removeSceneModel,
    clearScene,
  } = useSceneStore()

  // What used to be one flag is now a reading of the queue. 'loading' means
  // something is still loading — models already in the scene stay fully usable
  // meanwhile (the toolbar is told 'loaded' as soon as one model is in; the
  // loading indicator carries the activity). The deep-link effects keyed on
  // 'loaded' therefore wait for the WHOLE initial batch, which is what a
  // `?model=a,b&select=…` link needs.
  // Managed IFC loads that are actually working — not a job the user paused,
  // not a point cloud / mesh / terrain fetch the manager merely tracks. Those
  // must never hold the app in 'loading': a ?scan= link would tear its own
  // deep-link effect down on the first scan, and a paused file would block
  // ?validate and georef extraction indefinitely.
  const loadsActive = useLoadingStore((s) => s.summary.managedActive > 0)

  // `?view=` / `?turntable=` (the article preset): the presentation shot,
  // taken the first time the loads settle with something in the scene —
  // whoever loaded it: the URL, the SDK's addFromUrl, bytes from a host.
  // Once only: after that the camera belongs to the reader and the tools.
  const presentationShotRef = useRef(false)
  useEffect(() => {
    if (loadsActive || presentationShotRef.current) return
    if (!urlParams.view && !urlParams.turntable) return
    if (useSceneStore.getState().models.length === 0) return
    // A short quiet first: the SDK loads a federated set one model at a time,
    // and the queue is briefly idle between them.
    const timer = window.setTimeout(() => {
      if (presentationShotRef.current) return
      presentationShotRef.current = true
      const api = viewerApiRef.current
      if (!api) return
      if (urlParams.view) api.setCameraPreset(urlParams.view, { fill: urlParams.fill ?? 0.85, animate: false })
      if (urlParams.turntable) api.setTurntable(true, urlParams.turntable)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [loadsActive, urlParams])
  const loadingState: 'idle' | 'loading' | 'loaded' | 'error' =
    loadsActive ? 'loading' : sceneModels.length > 0 ? 'loaded' : loadError ? 'error' : 'idle'
  // Keep a phone's screen on while something runs on its own: a big model
  // streaming in, or a tour playing. See useWakeLock.
  useWakeLock(loadsActive || tourMode === 'playing')
  // Toolbar-less presets put the loading indicator in the bottom-left corner
  // the OPFS badge also uses; while there is anything to show there, the
  // badge (whose click clears the cache) yields the corner.
  const hasLoadHistory = useLoadingStore((s) => s.jobs.length > 0)
  const activeFromCache = useLoadingStore((s) => (
    activeModelId ? jobForModel(s.jobs, activeModelId)?.metrics.fromCache === true : false
  ))

  // Georef extractions land asynchronously, one per model. Subscribed rather
  // than read on demand so map placement re-runs the moment a model's
  // coordinates arrive — see the satellite resolver below.
  const georefByModel = useGeoStore((s) => s.georefByModel)
  /** Models a full georef extraction has already been requested for. */
  const georefRequestedRef = useRef<Set<string>>(new Set())

  // Undo/redo keyboard shortcuts
  useEditorHistory()

  // Persist tree preferences across sessions
  usePersistedPreferences()

  // Validation lifecycle
  const validation = useValidationRunner()

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  // Ctrl+Shift+V — validate | ? — shortcut help
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (route !== 'viewer') return
      // Don't fire shortcuts when typing in an input / textarea / contenteditable
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.shiftKey && e.key === 'V') {
        e.preventDefault()
        if (!validation.isRunning && validation.canRun) {
          void validation.runAll(undefined, true)
        }
      }

      if (e.key === '?' && !inInput && !mod) {
        e.preventDefault()
        setShowHelp((v) => !v)
      }

      // ── Element control shortcuts (no modifier, not while typing) ──────────
      // Use viewerApiRef / store setters directly (both declared above) so this
      // effect needn't depend on handlers defined later in the component.
      if (!inInput && !mod) {
        const key = e.key.toLowerCase()

        // F — frame/zoom to the selected element
        if (key === 'f' && selected) {
          e.preventDefault()
          viewerApiRef.current?.focusElement(parseInt(selected.id, 10), selected.modelId)
        }

        // H — hide selected element · Shift+H — restore full visibility
        if (key === 'h') {
          if (e.shiftKey) {
            if (hiddenElements.size > 0 || isolatedElement != null || isolated != null) {
              e.preventDefault()
              clearHiddenElements()
              setIsolatedElement(null)
              setIsolatedElementModel(null)
              setIsolated(null)
            }
          } else if (selected) {
            e.preventDefault()
            const eid = parseInt(selected.id, 10)
            const mid = selected.modelId ?? ''
            const decompMap = useValidationStore.getState().decompMaps[mid]
            setElementsVisible(expandWithDecomp(eid, decompMap), false, mid)
          }
        }

        // I — isolate selected element (toggle): show only it, hide everything else
        if (key === 'i' && selected) {
          e.preventDefault()
          const id = parseInt(selected.id, 10)
          const toggled = isolatedElement === id ? null : id
          setIsolatedElement(toggled)
          setIsolatedElementModel(toggled != null ? (selected.modelId ?? null) : null)
          setIsolated(null)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, validation.isRunning, validation.canRun, selected, hiddenElements, isolatedElement, isolated, clearHiddenElements, setElementsVisible])

  // Element focus/select/reveal handlers
  const elementFocus = useElementFocus(viewerApiRef, modelTreeRef)

  // ── Loading pipeline ──────────────────────────────────────────────────────
  // Every load — upload, drop, demo set, ?model=, SDK bytes, companion — is a
  // job in the loading manager (src/lib/loading, docs/MODEL_LOADING.md). What
  // App owns is the reaction: these hooks are refreshed on every render, so a
  // commit always runs the current closures (validation.run's `canRun`,
  // `embedChrome`, the setters) instead of the ones captured when the load
  // started.

  const loadHooks: LoadingHooks = {
    beforeSubmit: ({ sceneEmpty }) => {
      setRoute('viewer')
      setLoadError(null)
      // D-19: only the first model of an empty scene resets interaction state.
      // Loading more models must not disturb selection/visibility.
      if (sceneEmpty) {
        setModelInfo(null)
        setSelected(null)
        setHidden(new Set(DEFAULT_HIDDEN_TYPES))
        setIsolated(null)
        setIsolatedElement(null)
        setIsolatedElementModel(null)
        clearHiddenElements()
      }
    },

    onModelLoaded: (info, fromCache, modelId, ctx) => {
      // Read BEFORE addSceneModel: was this the first model of an empty scene?
      const firstInScene = useSceneStore.getState().models.length === 0
      setModelInfo(info)
      setLoadError(null)
      // Re-apply category filters now that there is geometry to apply them to.
      //
      // The reactive effect in Viewer.tsx keys on the identity of the hidden
      // SET, and that set is built before the load starts — so it fires against
      // an empty scene and never again, because nothing about it changed. That
      // cost nothing while the default was "hide nothing"; the moment spaces
      // started hidden by default it meant they were not.
      setHidden((prev) => new Set(prev))
      // In embed mode the host decides whether the validation panel auto-opens
      // (the 'minimal' preset keeps it collapsed so only the 3D + score show).
      // On a phone the sheet covers the model the user just opened: they reach
      // it from the bottom nav (Validar) when they want it.
      const isPhone = window.matchMedia('(max-width: 767px)').matches
      if (embedChrome.openPanel && !isPhone) {
        useIdsStore.getState().setPanelOpen(false) // bottom slot is exclusive with the IDS panel
        setValidationPanelOpen(true)
        trackValidationPanelOpened({ trigger: 'auto' })
      }
      // Notify an embedding parent (CDE / blog) that a model is ready, echoing
      // the SDK requestId of THIS job so it resolves the right add() promise.
      emitEmbedEvent('model-loaded', {
        modelId,
        fileName: info.fileName,
        elementCount: info.elementCount,
        fromCache,
        requestId: ctx.requestId ?? undefined,
      })
      progressRelayRef.current.delete(ctx.jobId)

      // Track when a second (or later) model is loaded into the scene
      if (!firstInScene) trackFeatureUsed({ feature: 'multi_model' })

      // Use the stable sceneModelId from the viewer so ScenePanel and multi-model code align
      addSceneModel(modelId, info)

      const isDemo = ctx.origin === 'demo' || ctx.origin === 'companion' || DEMO_FILENAMES.has(info.fileName)
      trackFileOpened({
        file_size_mb:  Math.round((info.fileSize / 1_048_576) * 10) / 10,
        element_count: info.elementCount,
        source:        isDemo ? 'demo' : 'upload',
        from_cache:    fromCache,
      })

      console.info(
        `[IFC] Loaded "${info.fileName}" (${info.elementCount} elements, id: ${modelId})` +
        (fromCache ? ' — from cache ⚡' : ' — parsed fresh'),
      )
      // Members of a batch are summarised once when the batch settles, so a
      // six-file federation does not stack six toasts.
      if (ctx.batchSize <= 1) {
        toast(
          fromCache
            ? tToasts('model.loadedFromCache', { fileName: info.fileName, count: info.elementCount })
            : tToasts('model.loaded', { fileName: info.fileName, count: info.elementCount }),
          'success',
        )
      }
      // `?validate` (default on) means "validate after load" — the Health Score
      // the landing promises. The old loader captured `validation.run` when the
      // load STARTED, while `canRun` was still false, so in practice it skipped
      // the first model and every member of a URL list or demo set. Now every
      // model is validated, once the queue is idle: validation parses the IFC
      // again in WASM, and doing that while other models convert slows both.
      if (urlParams.autoValidate) pendingAutoValidateRef.current.add(modelId)
    },

    onLoadFailed: (job, error) => {
      console.error('[IFC] Load failed:', job.fileName, `${error.code}@${error.phase ?? '-'}`, error.message)
      setLoadError(error.message)
      progressRelayRef.current.delete(job.id)
      // Analytics get the failure CLASS, never the raw message: those embed the
      // file name, which must not leave the browser.
      trackFileOpenFailed({
        error_msg: `${error.code}@${error.phase ?? 'unknown'}`,
        ...(job.sizeBytes > 0 ? { file_size_mb: Math.round((job.sizeBytes / 1_048_576) * 10) / 10 } : {}),
      })
      // Every failed load inside an iframe reaches the host, SDK-initiated or
      // not: a plain `?model=` embed (the EmbedModal snippet, the blog's
      // SpatialMediaDemo) switches to its error state on this event alone. URL
      // loads report `url`, as they always have; bytes/file loads `name`.
      emitEmbedEvent('model-error', {
        ...(job.sourceUrl ? { url: job.sourceUrl } : { name: job.fileName }),
        message: error.message,
        requestId: job.requestId ?? undefined,
      })
      const reason = error.code === 'http'
        ? i18n.t('loading:error.http', { status: error.httpStatus ?? '?' })
        : i18n.t(`loading:error.${error.code}`)
      toast(tToasts('model.loadFailedNamed', { fileName: job.displayName, reason }), 'error')
    },

    onLoadCancelled: (job) => {
      progressRelayRef.current.delete(job.id)
      // A host awaiting add() must hear about it — silence would look like a
      // 120 s hang on its side.
      emitEmbedEvent('model-error', {
        ...(job.sourceUrl ? { url: job.sourceUrl } : { name: job.fileName }),
        message: 'Load cancelled',
        requestId: job.requestId ?? undefined,
      })
    },

    onProgress: (job) => {
      // Relay load progress to an embedding parent (SDK `model-progress`), for
      // every load in the iframe as before — correlated by the job's own
      // requestId when it has one. Only while the job is still loading: the
      // background phases after commit (stream, index) must not re-show a
      // progress bar the host hid on model-loaded.
      if (!isEmbedded() || !ACTIVE_STATUSES.has(job.status)) return
      const now = Date.now()
      const prev = progressRelayRef.current.get(job.id)
      if (prev && now - prev.at < 250) return
      const percent = Math.max(prev?.percent ?? 0, Math.round(job.progress.fraction * 100))
      progressRelayRef.current.set(job.id, { at: now, percent })
      emitEmbedEvent('model-progress', {
        percent,
        phase: legacyPhase(job.phase, job.status),
        requestId: job.requestId ?? undefined,
      })
    },

    // A scan or a mesh that failed, whatever started it — the panels, a drop,
    // ?scan=, the SDK. One toast per failure, named, with the runner's own
    // reason; the panels no longer toast themselves, and a dropped file no
    // longer fails into the console alone. Never the SDK's model-error: that
    // event is about models (see LoadingHooks.onSourceFailed).
    onSourceFailed: (job, error) => {
      console.warn(`[App] ${job.kind} load failed:`, job.fileName, `${error.code}@${error.phase ?? '-'}`, error.message)
      void describeSourceError(error, job.kind).then((reason) => {
        toast(tToasts('model.loadFailedNamed', { fileName: job.displayName, reason }), 'error')
      })
    },

    onBatchSettled: (batch, counts) => {
      if (counts.loaded + counts.failed === 0) return
      if (counts.failed > 0) {
        toast(tToasts('model.batchPartial', { name: batch.name, loaded: counts.loaded, failed: counts.failed }), 'warning')
      } else {
        toast(tToasts('model.batchLoaded', { name: batch.name, count: counts.loaded }), 'success')
      }
    },

    onIdle: () => {
      // Only models still in the scene: an idle that coincides with a clear or
      // a trip to the landing must not start a validation of a model that is
      // about to be (or was just) torn down.
      const inScene = new Set(useSceneStore.getState().models.map((m) => m.id))
      const ids = [...pendingAutoValidateRef.current].filter((id) => inScene.has(id) && modelRegistry.get(id))
      pendingAutoValidateRef.current.clear()
      if (ids.length === 0) return
      // One at a time: validation is a single global run.
      void (async () => {
        for (const id of ids) {
          if (!modelRegistry.get(id) || !useSceneStore.getState().models.some((m) => m.id === id)) continue
          await validation.run(undefined, id)
        }
      })()
    },

    removeModel: (modelId) => handleRemoveModel(modelId),

    focusModel: (modelId) => {
      handleSetActiveModel(modelId)
      viewerApiRef.current?.frameActiveModel()
    },

    createGroup: (name, fileKeys) => useSceneGroupStore.getState().createGroup(name, fileKeys),
  }

  const {
    loadFile,
    loadUrls,
    loadBytes,
    memoryStats,
    cacheEntries,
    deleteFromCache,
    opfsAvailable,
  } = useIfcLoader({ viewerApiRef, hooks: loadHooks })

  // ── Sync the 3D overlay channel (validation OR IDS — mutually exclusive) ──
  // One combined effect: with two separate effects the disable-side of one
  // channel could clear the freshly applied highlights of the other (shared
  // bookkeeping in the viewer). IDS wins deterministically if both flags are
  // ever true (the toggle handlers prevent that state).

  const idsHighlightMode = useIdsStore((s) => s.highlightMode)
  const idsResultsByModel = useIdsStore((s) => s.resultsByModel)

  // Advanced overlay UX knobs (OverlayHud) — folded into the apply call so changing
  // a filter / slider re-runs this effect and repaints with the new look.
  const ovSeverities   = useOverlayStore((s) => s.severities)
  const ovGhostOpacity = useOverlayStore((s) => s.ghostOpacity)
  const ovXray         = useOverlayStore((s) => s.xray)

  const compareHighlight = useCompareStore((s) => s.highlight)
  const compareDiff      = useCompareStore((s) => s.diff)
  const compareHead      = useCompareStore((s) => s.head.modelIds)
  const compareBase      = useCompareStore((s) => s.base.modelIds)

  useEffect(() => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const opts = { severities: ovSeverities, ghostOpacity: ovGhostOpacity, xray: ovXray }
    if (compareHighlight && compareDiff) {
      // Version diff on the shared overlay channel: removed=error, modified=warning, added=info.
      viewer.setValidationHighlights(planCompareOverlay(compareDiff, compareHead, compareBase), true, opts)
    } else if (idsHighlightMode) {
      const failures = Object.entries(idsResultsByModel).flatMap(([mid, r]) =>
        r.specs.flatMap((s) => {
          // EIR specs carry their severity in the identifier ("eir:warning") so
          // the 3D overlay can paint warnings/info distinctly; plain IDS specs
          // have no severity → the controller uses the single idsFail colour.
          const sev = s.identifier?.startsWith('eir:') ? s.identifier.slice(4) : undefined
          const severity = sev === 'error' || sev === 'warning' || sev === 'info' ? sev : undefined
          return s.failures
            .filter((f) => f.expressId >= 0)
            .map((f) => ({ expressId: f.expressId, modelId: mid, severity }))
        }),
      )
      viewer.setIdsHighlights(failures, true, opts)
    } else if (validationMode) {
      viewer.setValidationHighlights(result?.issues ?? [], true, opts)
    } else {
      viewer.setValidationHighlights([], false) // clears the shared overlay channel
    }
  }, [validationMode, result, idsHighlightMode, idsResultsByModel, ovSeverities, ovGhostOpacity, ovXray, compareHighlight, compareDiff, compareHead, compareBase])

  // ── Analytics: track each completed validation run ────────────────────────
  const prevResultRef = useRef<typeof result>(null)
  useEffect(() => {
    if (!result || result === prevResultRef.current) return
    prevResultRef.current = result
    const topRule = Object.entries(result.stats.byRule ?? {})
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null
    trackValidationCompleted({
      error_count:   result.stats.errors,
      warning_count: result.stats.warnings,
      info_count:    result.stats.info,
      quality_score: result.qualityScore ?? 0,
      duration_ms:   result.durationMs,
      top_rule:      topRule,
    })
    // Surface the Health Score + counts to an embedding host (CDE dashboard, SDK).
    emitEmbedEvent('validation-completed', {
      qualityScore: result.qualityScore ?? null,
      errors:       result.stats.errors,
      warnings:     result.stats.warnings,
      info:         result.stats.info,
    })
  }, [result])

  // ── Post-aha invite nudge: surface the Mom-Test question once, after the ──
  // first validation completes, to an invited (non-public) visitor.
  useEffect(() => {
    if (!result) return
    if (!invite || invite.sourceKind === 'public') return
    if (feedbackNudgeSpent || feedbackNudgeOpen) return
    setFeedbackNudgeOpen(true)
  }, [result, invite, feedbackNudgeSpent, feedbackNudgeOpen])

  // ── Analytics: SPA route transitions (virtual pageviews) ─────────────────
  useEffect(() => {
    const from = prevRouteRef.current
    prevRouteRef.current = route
    if (route === from) return
    // Only track transitions TO viewer/report — initial landing is captured by PostHog's pageview
    if (route === 'viewer' || route === 'report') {
      trackRouteChanged({ to: route, from })
    }
  }, [route])

  // ── Analytics: first element selected in 3D (session-once) ───────────────
  useEffect(() => {
    if (selected && !hasTrackedFirstInteraction.current) {
      hasTrackedFirstInteraction.current = true
      trackViewerFirstInteraction()
    }
  }, [selected])

  // ── Sync active model in sceneStore when the user clicks an element ───────
  // commitSelection in the viewer auto-activates the hit model, but doesn't
  // update the sceneStore. We derive it from the selected element's modelId.
  // Deliberately NOT depending on activeModelId: this must only re-anchor when
  // the SELECTION changes. With activeModelId in the deps, activating another
  // model in the Scene panel while an element stays selected would be reverted
  // here a tick later (the click appeared to do nothing).
  useEffect(() => {
    if (selected?.modelId && selected.modelId !== useSceneStore.getState().activeModelId) {
      setSceneActiveModel(selected.modelId)
    }
  }, [selected, setSceneActiveModel])

  // ── Phones: selecting no longer opens the full Properties sheet ───────────
  // It used to, on every tap — the element just picked vanished behind a wall
  // of property sets, and looking around meant closing it each time. Now a
  // tap shows the selection bar; the bar opens the element card; the card
  // opens the full inspector (components/mobile/MobileElementCard).
  // The card follows the selection, and closes when nothing is selected.
  const [elementCardOpen, setElementCardOpen] = useState(false)
  useEffect(() => { if (!selected) setElementCardOpen(false) }, [selected])

  // ── Screen readers: say what the tap selected ──────────────────────────────
  // A tap on a canvas gives VoiceOver nothing to read. This polite live region
  // announces the element (or that the selection was cleared).
  const { t: tViewerA11y } = useTranslation('viewer')
  const [selectionAnnouncement, setSelectionAnnouncement] = useState('')
  const hadSelection = useRef(false)
  useEffect(() => {
    if (selected) {
      hadSelection.current = true
      const type = selected.type.replace(/^IFC/i, '')
      setSelectionAnnouncement(tViewerA11y('elementCard.selected', { name: selected.name || type, type: type.charAt(0) + type.slice(1).toLowerCase() }))
    } else if (hadSelection.current) {
      setSelectionAnnouncement(tViewerA11y('elementCard.deselected'))
    }
  }, [selected, tViewerA11y])

  // ── Track desktop breakpoint so tree Panel is never rendered on mobile ──
  // react-resizable-panels allocates the Panel's flex share even when its
  // inner content is hidden, so we must not mount the Panel at all on mobile.
  // An article figure is a 650–720 px frame on a desktop page: the same line
  // as useIsMobile draws for it (520 px), or the spatial tree a post is about
  // went into a closed phone sheet.
  const desktopQuery = urlParams.embed && urlParams.preset === 'article' ? '(min-width: 520px)' : '(min-width: 768px)'
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(desktopQuery).matches : true,
  )
  useEffect(() => {
    const mq = window.matchMedia(desktopQuery)
    const handler = (e: MediaQueryListEvent): void => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    setIsDesktop(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [desktopQuery])

  // ── Detect WebGPU availability ────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
          const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()
          setGpuBackend(adapter ? 'webgpu' : 'webgl')
        } else {
          setGpuBackend('webgl')
        }
      } catch {
        setGpuBackend('webgl')
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Queue one local file. Route switch and the first-model reset happen in the
  // `beforeSubmit` hook, the same for every entry point.
  const handleFileLoad = (file: File, origin: JobOrigin = 'upload'): Promise<JobOutcome> =>
    loadFile(file, { origin })

  // No "already loading" guard any more: the dialog adds to the queue.
  const openUploadModal = useCallback((): void => {
    setShowUpload(true)
  }, [])

  // ── Route a dropped/picked .ids file to the IDS flow (P5-2) ───────────────
  // Parse on the main thread, load into the store and open the IDS modal. Auto-
  // run is intentionally OFF (a long check shouldn't start from a drop) — the
  // user clicks Run. Returns true if the file was an .ids (handled here).
  const handleIdsFile = useCallback(async (file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.ids')) return false
    try {
      const doc = parseIds(await file.text())
      useIdsStore.getState().setLoaded(file.name, doc)
      const facetKinds = new Set<string>()
      for (const s of doc.specifications) {
        for (const f of s.applicability) facetKinds.add(f.kind)
        for (const r of s.requirements) facetKinds.add(r.facet.kind)
      }
      trackIdsFileLoaded({ spec_count: doc.specifications.length, facet_count: facetKinds.size })
      setShowIdsModal(true)
    } catch (err) {
      const msg = err instanceof IdsParseError ? err.message : (err instanceof Error ? err.message : String(err))
      useIdsStore.getState().setError('parse', i18n.t('ids:loader.parseError', { message: msg }))
      toast(i18n.t('ids:loader.invalidFile', { message: msg }), 'error')
      setShowIdsModal(true)
    }
    return true
  }, [])

  // ── Route dropped files by kind ───────────────────────────────────────────
  // One drop can carry a federation plus its survey: IFCs go to the upload
  // dialog (validation, duplicates, review → the loading queue), scans and
  // meshes straight to the loading queue as jobs of their own (one per scan,
  // one per model — a multi-file glTF is ONE model), an .ids to the IDS flow.
  // `classifyFiles` works on extensions only, so none of the point cloud /
  // mesh code is pulled into the entry chunk to decide. Scans and meshes do
  // not need their panels any more: they load in client mode too.
  const routeDroppedFiles = useCallback((files: File[]): void => {
    const r = classifyFiles(files)
    if (r.ifc.length > 0) {
      setUploadInitial(r.ifc)
      setShowUpload(true)
    }
    if (r.ids.length > 0) void handleIdsFile(r.ids[0])
    // Scans and meshes that arrive WITH IFCs wait for the upload dialog: it
    // reviews the IFCs before they become jobs, and a scan that started
    // meanwhile found no model to align against (nor an anchor job to wait
    // for) and landed at its own coordinates. Held here until the dialog
    // closes — after its submit, so the IFC is queued and anchors the scene.
    if ((r.ifc.length > 0 || showUploadRef.current) && (r.pointcloud.length > 0 || r.mesh.length > 0)) {
      const held = deferredDropRef.current ?? { pointcloud: [], mesh: [] }
      held.pointcloud.push(...r.pointcloud)
      held.mesh.push(...r.mesh)
      deferredDropRef.current = held
    } else {
      submitDroppedSources(r.pointcloud, r.mesh)
    }
    // GeoJSON never waits for the IFC dialog: a layer re-anchors on its own
    // when the model's placement arrives (vector-runner rebuilds on it).
    if (r.vector.length > 0) useVectorLayerStore.getState().enqueueFiles(r.vector)
    if (r.bcf.length > 0) toast(tToasts('model.dropBcfHint'), 'info')
    if (r.other.length > 0 && routedCount(r) === 0) {
      toast(tToasts('model.dropUnsupported', { count: r.other.length }), 'warning')
    }
  }, [handleIdsFile, tToasts])

  /** Dropped scans and meshes → the loading queue (one job per scan, one per model). */
  function submitDroppedSources(pointcloud: File[], mesh: File[]): void {
    if (pointcloud.length > 0) {
      if (canLoadKind('pointcloud')) {
        // A scan already in the scene is not decoded again (see loadPointCloudsOnce).
        void loadPointCloudsOnce(pointcloud.map((file) => ({ source: { type: 'file', file } })), { origin: 'drop' })
      } else {
        toast(tToasts('model.dropUnsupported', { count: pointcloud.length }), 'warning')
      }
    }
    if (mesh.length > 0) {
      const groups = groupMeshFiles(mesh)
      if (!canLoadKind('mesh')) {
        toast(tToasts('model.dropUnsupported', { count: mesh.length }), 'warning')
      } else if (groups.length === 0) {
        // Only sidecars (.bin, .mtl): nothing to decode. Said, not swallowed.
        toast(tToasts('model.dropUnsupported', { count: mesh.length }), 'warning')
      } else {
        void loadMeshesOnce(groups.map((g) => ({ source: { type: 'file', file: g.entry, sidecars: g.sidecars } })), { origin: 'drop' })
      }
    }
  }

  /** The upload dialog closed (after its submit, or dismissed): release what the drop held back. */
  const releaseDeferredDrop = (): void => {
    const held = deferredDropRef.current
    deferredDropRef.current = null
    if (held) submitDroppedSources(held.pointcloud, held.mesh)
  }

  // Global drop over the viewer. Only OS file drags count (`hasFilePayload`):
  // the scene tree's own row drag-and-drop must pass straight through. While the
  // upload dialog is open it owns drops itself and stops their propagation.
  useEffect(() => {
    if (route !== 'viewer') return
    const onDragOver = (e: DragEvent): void => {
      if (hasFilePayload(e.dataTransfer)) e.preventDefault()
    }
    const onDrop = (e: DragEvent): void => {
      // A drop zone that took the drop itself (the point cloud panel's, the
      // upload dialog's) prevented its default — React handlers run before the
      // event bubbles here. Handling it again loaded the same scan twice.
      if (e.defaultPrevented) return
      if (!hasFilePayload(e.dataTransfer)) return
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      routeDroppedFiles(files)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [route, routeDroppedFiles])

  // "Open an IFC file" CTA — go to viewer and immediately show the upload overlay
  // so the user can pick their own file instead of the demo being auto-loaded.
  const handleOpenUpload = (): void => {
    trackLandingCtaClicked({ variant: 'open_file' })
    setRoute('viewer')
    setShowUpload(true)
  }

  // Quick "Load demo model" path — loads the default curated model (bundled,
  // offline-safe, with a raw-host fallback) without opening the gallery.
  const handleLaunch = (): void => {
    trackLandingCtaClicked({ variant: 'load_demo' })
    setRoute('viewer')
    const demo = DEFAULT_DEMO_MODEL
    // A URL job: the download shows real progress in the loading UI, and the
    // bundled fallback is tried by the job itself.
    void loadUrls([{ url: demo.ifcUrl, fileName: demo.fileName, fallbackUrl: demo.fallbackUrl }], { origin: 'demo' })
      .then(([outcome]) => {
        // Could not even download it: offer the user's own file instead.
        if (outcome?.status === 'failed' && (outcome.error.code === 'network' || outcome.error.code === 'http')) {
          setShowUpload(true)
        }
      })
  }

  // Opens the demo gallery from anywhere (toolbar, upload overlay, …). Closes the
  // upload overlay first so the gallery isn't hidden behind it.
  const openDemoGallery = useCallback((): void => {
    setShowUpload(false)
    setShowDemoGallery(true)
  }, [])

  // Landing CTA opener — same as above plus the landing analytics event.
  const handleOpenDemoGallery = (): void => {
    trackLandingCtaClicked({ variant: 'load_demo' })
    openDemoGallery()
  }

  // A demo set is one batch of URL jobs: the manager downloads the members
  // (real byte progress in the loading UI), converts them in parallel and
  // attaches them in discipline order — the first member sets the coordinate
  // base, as it did when they were handed over one at a time. The gallery
  // closes at once instead of spinning through every download.
  const handleDemoSetSelected = (set: DemoSet): void => {
    setShowDemoGallery(false)
    setRoute('viewer')
    if (set.twin) {
      const template = set.twin
      void import('./lib/twin/templates').then((m) => m.applyTemplateWhenLoaded(template, set.models.length))
    }
    void loadUrls(
      set.models.map((m) => ({ url: m.ifcUrl, fileName: m.fileName, fallbackUrl: m.fallbackUrl })),
      { origin: 'demo', batchName: set.name },
    )
  }

  // Legacy gallery path (the gallery downloaded a File itself).
  const handleDemoModelReady = async (_model: DemoModel, file: File): Promise<void> => {
    setShowDemoGallery(false)
    await handleFileLoad(file, 'demo')
  }

  // One-click exhibition path from VideoPanel. The matching IFC is a normal
  // gallery model and goes through the normal loader/cache pipeline; the video
  // may already be playing while the IFC finishes parsing because it owns an
  // independent world-space transform. Resolves when the model is in the scene
  // (no fixed timeout: a slow parse is still a parse, and the loading UI says so).
  const handleLoadVideoCompanion = async (demoModelId = 'operations-pavilion-video'): Promise<void> => {
    const demo = DEMO_MODELS.find((model) => model.id === demoModelId)
    if (!demo || sceneModels.some((model) => model.fileName === demo.fileName)) return
    const [outcome] = await loadUrls(
      [{ url: demo.ifcUrl, fileName: demo.fileName, fallbackUrl: demo.fallbackUrl }],
      { origin: 'companion' },
    )
    if (outcome?.status !== 'loaded') {
      // The failure itself was already toasted by the loading hooks.
      console.warn('[App] Spatial companion IFC unavailable:', outcome)
      throw new Error('Companion IFC unavailable')
    }
  }

  const handleToggleHidden = (id: string): void => {
    setHidden((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleIsolate = (): void => {
    if (!selected) return
    if (isolated === selected.type) {
      setIsolated(null)
    } else {
      setIsolatedElement(null)
      setIsolatedElementModel(null)
      setIsolated(selected.type)
      viewerRef.current?.frameCategory(selected.type)
    }
  }

  // Isolate a specific category by type (used by the 3D context menu).
  const handleIsolateCategory = useCallback((type: string): void => {
    if (isolated === type) {
      setIsolated(null)
    } else {
      setIsolatedElement(null)
      setIsolated(type)
      viewerRef.current?.frameCategory(type)
    }
  }, [isolated])

  // Category isolation from the tree / category panel — clears any element isolation.
  const handleSetIsolatedCategory = useCallback((type: string | null): void => {
    if (type) {
      setIsolatedElement(null)
      setIsolatedElementModel(null)
    }
    setIsolated(type)
  }, [])

  // Hide a single element in the 3D scene (context menu + keyboard).
  // Expands to sub-components so hiding an IfcStair also hides its flights/slabs.
  const handleHideElement = useCallback((expressId: number, modelId: string): void => {
    const decompMap = useValidationStore.getState().decompMaps[modelId]
    setElementsVisible(expandWithDecomp(expressId, decompMap), false, modelId)
  }, [setElementsVisible])

  // Isolate a single element (toggle): show only it within its model. Used by context menu + keyboard.
  const handleIsolateElement = useCallback((expressId: number, modelId?: string): void => {
    setIsolatedElement((cur) => {
      const next = cur === expressId ? null : expressId
      setIsolatedElementModel(next != null ? (modelId ?? null) : null)
      return next
    })
    setIsolated(null)
  }, [])

  // Restore full visibility: clear hidden elements + element/category isolation.
  const handleRestoreVisibility = useCallback((): void => {
    clearHiddenElements()
    setIsolatedElement(null)
    setIsolatedElementModel(null)
    setIsolated(null)
  }, [clearHiddenElements])

  const handleJumpToElement      = elementFocus.jumpToElement
  const handleSelectTreeElement  = useCallback(
    (expressId: number, modelId?: string) => elementFocus.selectElement(expressId, modelId),
    [elementFocus],
  )
  const handleFocusElements      = elementFocus.focusElements
  const handleFrameElement       = elementFocus.frameElement
  /**
   * Reveal, and report when it could not do exactly what was asked.
   *
   * The tree lists what a storey CONTAINS, so anything that is a PART of
   * something else — the glazed panels of a curtain wall, the flight inside a
   * stair — is not in it. This used to be a button that did nothing at all for
   * those; now it shows the host and says which one.
   */
  const handleRevealInTree = useCallback((expressId: number, modelId?: string): void => {
    // On a phone the tree is a sheet: the properties sheet would sit on top of it.
    if (window.matchMedia('(max-width: 767px)').matches) useUIStore.getState().setMobileSidebarOpen(false)
    void elementFocus.revealInTree(expressId, modelId).then((outcome) => {
      if (!outcome.ok) {
        toast(tToasts('tree.notInTree'), 'info')
      } else if (outcome.viaHost) {
        toast(tToasts('tree.revealedHost', { name: outcome.hostName }), 'info')
      }
    })
  }, [elementFocus, tToasts])

  // ── Activate a specific model in both store and viewer ───────────────────
  const handleSetActiveModel = useCallback((id: string): void => {
    setSceneActiveModel(id)
    viewerApiRef.current?.setActiveModel(id)
  }, [setSceneActiveModel])

  // ── Remove a model from the scene, viewer, and all stores ────────────────
  const handleRemoveModel = useCallback(async (id: string): Promise<void> => {
    try {
      // If a 2D plan view is active, close it before removing the model
      if (activePlanViewId) {
        try { viewerApiRef.current?.closeStoreyView() } catch { }
        setActivePlanViewId(null)
      }
      // The loading center shows the row as "Removing…", then as history.
      notifyModelRemoving(id)
      await viewerApiRef.current?.removeModel(id)
      removeSceneModel(id)
      useModelStore.getState().removeModelEntry(id)
      useValidationStore.getState().clearValidationForModel(id)
      useTakeoffStore.getState().clearModelResult(id)
      useGeoStore.getState().removeGeoref(id)
      // IDS: abort an in-flight check for this model, then drop its results.
      if (useIdsStore.getState().runningModelId === id) cancelActiveIdsRuns()
      useIdsStore.getState().clearForModel(id)
      modelRegistry.unregister(id)
      // Remove all hidden-element keys that belonged to this model so the Set
      // doesn't accumulate stale composite keys ("${id}:${expressId}").
      clearHiddenElementsForModel(id)
      // If this model was the isolation target, clear that state too.
      setIsolatedElement((cur) => {
        if (cur != null) setIsolatedElementModel((m) => (m === id ? null : m))
        return cur
      })
      // Recompose the displayed validation result so the removed model's issues
      // drop out (and the panel clears if no validated models remain).
      publishAggregateResult()
      // Clear selection if the removed model owned the currently selected element
      setSelected((prev) => (prev?.modelId === id ? null : prev))
      pendingAutoValidateRef.current.delete(id)
      notifyModelRemoved(id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[App] Failed to remove model:', msg)
      toast(tToasts('model.removeFailed', { message: msg }), 'error')
    }
  }, [removeSceneModel, activePlanViewId, setActivePlanViewId, clearHiddenElementsForModel])

  // ── Navigate back to landing — reset all model/editor/validation state ────
  const handleNavigateToLanding = useCallback((): void => {
    const base = import.meta.env.BASE_URL ?? '/'
    if (window.location.pathname !== base && window.location.pathname !== base.replace(/\/$/, '')) {
      history.pushState(null, '', base)
    }
    // Cancel every load FIRST and bump the loading epoch: a model that is
    // already attaching must not repopulate the stores this function is about
    // to clear (the old loader kept going and left ghost rows behind).
    pendingAutoValidateRef.current.clear()
    progressRelayRef.current.clear()
    resetLoading()
    setRoute('landing')
    setBlogSlug(null)
    setModelInfo(null)
    setLoadError(null)
    setSelected(null)
    setHidden(new Set(DEFAULT_HIDDEN_TYPES))
    setIsolated(null)
    setIsolatedElement(null)
    setIsolatedElementModel(null)
    useModelStore.getState().clearModel()
    useEditorStore.getState().clearHistory()
    useValidationStore.getState().reset()
    useTakeoffStore.getState().reset()
    cancelActiveIdsRuns()
    useIdsStore.getState().reset()
    useGeoStore.getState().resetForScene()
    useSolarStore.getState().resetForScene()
    useCaptureStore.getState().resetCapture()
    usePresentationStore.getState().resetPresentation()
    // Point clouds hold the largest GPU allocation in the app — drop them with
    // the rest of the scene, and dispose the buffers rather than just the state.
    const loadedClouds = usePointCloudStore.getState().clouds
    if (loadedClouds.length > 0) {
      // Dynamic import: the runner chunk is already resolved whenever a cloud
      // exists, so this costs nothing — and keeps proj4 out of the entry bundle.
      void import('./lib/pointcloud/pc-runner').then((m) => {
        for (const cloud of loadedClouds) m.cancelPointCloud(cloud.id)
      })
      void viewerApiRef.current?.getPointClouds().then((system) => system.dispose())
    }
    usePointCloudStore.getState().clearClouds()
    useTransformHistoryStore.getState().clearHistory()
    // Imported meshes too: the viewer's mesh system is disposed with it, and
    // rows left behind listed "ready" models no scene held.
    useMeshStore.getState().clearMeshes()
    modelRegistry.clear()
    clearScene()
    appBus.emit('model:cleared', undefined)
    // Clean up Sprint 7+8 panel state and viewer tools
    setMeasurementPanelOpen(false)
    setActiveMeasurementTool('none')
    setClipPanelOpen(false)
    setClipPlaneCount(0)
    setPlansPanelOpen(false)
    setActivePlanViewId(null)
    try { viewerApiRef.current?.clearMeasurements() } catch { }
    try { viewerApiRef.current?.cleanupSectionAndPlans() } catch { }
  }, [clearScene, setMeasurementPanelOpen, setActiveMeasurementTool, setClipPanelOpen, setClipPlaneCount, setPlansPanelOpen, setActivePlanViewId])

  // Lightweight SPA navigation for the account surfaces (dashboard/admin/auth).
  // Mirrors handleNavigateToPrivacy's pushState+setRoute pattern.
  const handleSpaNavigate = useCallback((path: string): void => {
    history.pushState(null, '', path)
    if (path.startsWith('/dashboard')) setRoute('dashboard')
    else if (path.startsWith('/admin')) setRoute('admin')
    else if (path.startsWith('/sign-in')) setRoute('signin')
    else if (path.startsWith('/sign-up')) setRoute('signup')
    else if (path.startsWith('/account')) setRoute('account')
    else setRoute('landing')
  }, [])

  // ── Load model(s) from remote URLs (shared by ?model= and postMessage) ────
  // One batch of URL jobs: downloads run through the network lane with real
  // progress, conversions overlap, and each job carries the SDK requestId, so
  // model-loaded / model-error / model-progress are correlated per model and a
  // failed parse reports model-error instead of leaving the host to time out.
  const loadModelsFromUrls = useCallback(async (urls: string[], names: string[] = [], requestId?: string): Promise<void> => {
    await loadUrls(urls.map((url, i) => ({ url, fileName: names[i] })), { origin: 'url', requestId })
  }, [loadUrls])

  // ── Tell map mode which models can place themselves ────────────────────────
  //
  // Reports EVERY model that carries its own georeferencing, the anchor
  // included. Which one is the anchor is the map's decision, not this one's —
  // it follows from the placement the map holds, and the host does not know
  // that. Handing over an "everything but the anchor" list was the first
  // attempt, and it picked the wrong anchor: the active model, which stops
  // being the placed one the moment a second file loads.
  //
  // Everything else is then sent to wherever the map says its coordinates
  // land — which is the
  // difference between the Oriental Pearl Tower and the Shanghai World
  // Financial Center standing 1.4 km apart in Lujiazui, and both of them
  // stacked on the scene origin.
  //
  // Resolved here rather than in the viewer because it needs the georef store,
  // and the viewer imports no stores on purpose.
  useEffect(() => {
    const api = viewerApiRef.current
    if (!api?.setSatelliteResolver || !isGisEnabled()) return

    let cancelled = false
    // Dynamic, and gated on the flag: placement.ts pulls in proj4 through crs.ts,
    // and the whole geo tree is kept out of the entry chunk on purpose. A static
    // import here would have shipped a projection library to every visitor who
    // never opens the map.
    void import('./lib/geo/placement').then(({ placementFromExtraction }) => {
      if (cancelled) return
      api.setSatelliteResolver!(() => {
      const georefs = useGeoStore.getState().georefByModel
      const out: Array<{
        modelId: string
        placement: GeoPlacement
        bounds: NonNullable<ReturnType<typeof api.getModelBounds>>
      }> = []
      for (const m of useSceneStore.getState().models) {
        // Placed by hand: the user's calibration wins over the file's own
        // georeference, or every map move would silently undo it.
        if (m.placedByHand) continue
        const extraction = georefs[m.id]
        const bounds = api.getModelBounds(m.id)
        if (!extraction || !bounds) continue
        const resolved = placementFromExtraction(extraction, bounds)
        // A model with no usable georeferencing stays where the scene put it.
        // Inventing a location for it is the fabrication this pipeline refuses.
        if (!resolved.ok) continue
        out.push({ modelId: m.id, placement: resolved.value, bounds })
      }
        return out
      })
      // Ask for a FULL extraction for anything the cheap scan could not read.
      //
      // Loading only quick-scans each file (8 MB, token match) and that is
      // enough for most, but not all: the Shanghai World Financial Center came
      // back `unknown` and so was invisible to placement even though its
      // IfcSite carries coordinates. The full worker extraction is the
      // authority, and asking for it is what turns "we could not see it
      // cheaply" into either a position or an honest no.
      //
      // Guarded by a ref because a model that genuinely carries no
      // georeferencing settles on `unknown` for good, and re-requesting it
      // every time this effect runs would spin the worker forever.
      //
      // Deferred while models are still loading: each extraction is another
      // WASM parse of a whole IFC, and a federated drop would otherwise start
      // one per member on top of the conversions still running. The effect
      // re-runs when the queue goes idle (loadsActive is a dependency).
      const loadsRunning = useLoadingStore.getState().summary.managedActive > 0
      for (const m of loadsRunning ? [] : useSceneStore.getState().models) {
        const g = useGeoStore.getState().georefByModel[m.id]
        if (g && g.status !== 'unknown') continue
        if (georefRequestedRef.current.has(m.id)) continue
        georefRequestedRef.current.add(m.id)
        void import('./lib/geo/geo-extract-runner')
          .then((mod) => mod.ensureGeorefExtracted(m.id))
          .catch(() => { /* an unreadable file simply stays unplaced */ })
      }

      // Place whatever is loadable NOW. Doing this from onModelLoaded looked
      // right and was too early: that callback runs before the model reaches
      // the scene store, so the resolver saw one model however many had
      // arrived. An effect runs after React has settled, which is the point at
      // which the stores actually agree with the scene.
      api.refreshMapSatellites?.()
    })
    return () => { cancelled = true; api.setSatelliteResolver?.(null) }
  // Keyed on the model count AND the georef map, not on mount. viewerApiRef is
  // still null when this component first runs — the Viewer mounts underneath it
  // — so a []-deps effect registers nothing and the feature silently does not
  // exist. And extraction is async: a model can reach the store a beat before
  // its georeferencing does, so both have to re-trigger the placement.
  }, [sceneModels.length, georefByModel, loadsActive])

  // ── Load model from raw IFC bytes handed in by a host app (SDK path) ───────
  // The bytes stay the registry's copy once committed (no File wrap, no extra
  // read); failures and cancels reach the host as model-error via the hooks.
  const loadModelFromBytes = useCallback(async (name: string, bytes: Uint8Array, requestId?: string): Promise<void> => {
    await loadBytes(name, bytes, { requestId })
  }, [loadBytes])

  // ── Auto-load model(s) from URL params on mount (?model=…&embed=1) ────────
  const urlLoadStartedRef   = useRef(false)
  const urlActionsAppliedRef = useRef(false)
  const urlSceneAppliedRef   = useRef(false)

  useEffect(() => {
    if (urlLoadStartedRef.current) return
    urlLoadStartedRef.current = true

    // Apply a host-requested UI language if it's one we support.
    const supported = (i18n.options.supportedLngs || []) as string[]
    if (urlParams.lang && supported.includes(urlParams.lang) && i18n.language !== urlParams.lang) {
      void i18n.changeLanguage(urlParams.lang)
    }

    // Personalized invite locale (e.g. a Portuguese outreach link → pt). Applied
    // once per session and only when the host didn't request a language, so it
    // lands in the intended language without fighting a later manual switch.
    try {
      if (!urlParams.lang && invite?.locale && supported.includes(invite.locale) &&
          i18n.language !== invite.locale &&
          sessionStorage.getItem('ifc.invite.localeApplied') == null) {
        void i18n.changeLanguage(invite.locale)
        sessionStorage.setItem('ifc.invite.localeApplied', '1')
      }
    } catch { /* sessionStorage / i18n unavailable — keep detected language */ }

    // Announce readiness to an embedding parent (CDE / blog), advertising the
    // languages the host can pass to setLanguage / the `lang` param.
    emitEmbedEvent('ready', {
      languages: ((i18n.options.supportedLngs || []) as string[]).filter((l) => l && l !== 'cimode'),
    })

    // `?wheel=ctrl` (and the article preset): the wheel scrolls the host page.
    if (urlParams.wheel === 'ctrl') {
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
      viewerApiRef.current?.setWheelMode('ctrl', tViewer('wheelHint', { key: mac ? '⌘' : 'Ctrl' }))
    }

    if (urlParams.modelUrls.length === 0) {
      // Embed with no model → drop straight onto an upload prompt so the host
      // user can pick a file.
      if (urlParams.embed) setShowUpload(true)
      return
    }

    void loadModelsFromUrls(urlParams.modelUrls, urlParams.fileNames)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The inbound handler below is subscribed from an effect whose deps do not
  // include the rail or the filter state, so it reads them through refs —
  // otherwise `open-panel` would toggle the rail as it was when the handler
  // was last bound, and re-showing a model would re-apply stale filters.
  const railItemsRef = useRef(railItems)
  railItemsRef.current = railItems
  const filtersRef = useRef({ hidden, isolated, hiddenElements, isolatedElement, isolatedElementModel })
  filtersRef.current = { hidden, isolated, hiddenElements, isolatedElement, isolatedElementModel }

  // ── Inbound postMessage commands (host CDE → iframe) ──────────────────────
  // Lets a CDE drive the embedded viewer two-way (load / select / isolate / fit).
  // Only active when running inside an iframe. Commands use the `ifcviewer:` ns.
  useEffect(() => {
    if (!isEmbedded()) return
    const onMessage = (e: MessageEvent): void => {
      const data = e.data as { type?: unknown } | null
      if (!data || typeof data.type !== 'string' || !data.type.startsWith('ifcviewer:')) return
      const msg = data as { type: string; [k: string]: unknown }
      // Address replies to whoever asked, rather than broadcasting them to every
      // script on the embedding page. See emitEmbedEvent.
      rememberHostOrigin(e.origin)
      const requestId = typeof msg.requestId === 'string' ? msg.requestId : undefined
      // Reply to a query command with a `result` envelope the SDK correlates by id.
      const respond = async (fn: () => unknown): Promise<void> => {
        if (!requestId) return
        try {
          emitEmbedEvent('result', { requestId, ok: true, data: await fn() })
        } catch (err) {
          emitEmbedEvent('result', { requestId, ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      }
      // An embed that boots without a model opens the upload prompt, which is
      // right for a visitor and wrong once the HOST supplies the model: it sat
      // on top of every model an SDK add() loaded. A host load dismisses it.
      if (/^ifcviewer:(load|load-bytes|add-pointcloud|add-mesh)$/.test(msg.type)) setShowUpload(false)
      switch (msg.type) {
        case 'ifcviewer:load': {
          const urls = Array.isArray(msg.url) ? msg.url
            : typeof msg.url === 'string' ? [msg.url] : []
          const names = Array.isArray(msg.name) ? msg.name as string[]
            : typeof msg.name === 'string' ? [msg.name] : []
          const valid = urls.filter((u): u is string => typeof u === 'string')
          if (valid.length) void loadModelsFromUrls(valid, names, requestId)
          else if (requestId) emitEmbedEvent('model-error', { message: 'No valid URL provided', requestId })
          break
        }
        case 'ifcviewer:load-bytes': {
          // Host hands us raw IFC bytes from its own app — nothing is uploaded.
          const raw = msg.bytes
          let bytes: Uint8Array | null = null
          if (raw instanceof ArrayBuffer) bytes = new Uint8Array(raw)
          else if (raw instanceof Uint8Array) bytes = raw
          // Honour the view's window: a Uint16Array over part of a buffer used to
          // be read as the WHOLE buffer.
          else if (ArrayBuffer.isView(raw)) {
            const v = raw as ArrayBufferView
            bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
          }
          const name = typeof msg.name === 'string' ? msg.name : 'model.ifc'
          if (bytes && bytes.byteLength > 0) void loadModelFromBytes(name, bytes, requestId)
          else if (requestId) emitEmbedEvent('model-error', { message: 'Empty or invalid bytes', requestId })
          break
        }
        case 'ifcviewer:select': {
          const id = Number(msg.expressId)
          if (Number.isFinite(id) && id > 0) {
            const modelId = typeof msg.modelId === 'string' ? msg.modelId : undefined
            viewerApiRef.current?.selectElement(id, modelId)
            viewerApiRef.current?.focusElement(id, modelId)
          }
          break
        }
        case 'ifcviewer:isolate': {
          const type = typeof msg.ifcType === 'string' ? msg.ifcType.toUpperCase() : null
          handleSetIsolatedCategory(type)
          // frame: false (v1.15): a story step that sets its own shot next.
          if (type && msg.frame !== false) viewerRef.current?.frameCategory(type)
          break
        }
        case 'ifcviewer:fit':
          viewerApiRef.current?.frameActiveModel()
          break
        case 'ifcviewer:reset':
          viewerRef.current?.resetCamera()
          break
        case 'ifcviewer:show-all':
          handleRestoreVisibility()
          break
        // ── Presentation (v1.15): a figure that turns, and one that rests ──
        case 'ifcviewer:set-turntable': {
          void respond(() => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            const speed = typeof msg.speed === 'number' && Number.isFinite(msg.speed) ? msg.speed : 6
            return api.setTurntable(msg.enabled !== false, speed)
          })
          break
        }
        case 'ifcviewer:set-paused': {
          // The host scrolled the figure out of view: stop painting frames.
          void respond(() => {
            viewerApiRef.current?.setPaused(msg.paused === true)
            return { paused: msg.paused === true }
          })
          break
        }
        case 'ifcviewer:view': {
          // fill / azimuth / elevation (v1.14): a tight fit for presentation —
          // the model fills the frame instead of floating in its bounding
          // sphere. Answers with the framed scope when asked for a result.
          const preset = typeof msg.preset === 'string' && CAMERA_PRESETS.includes(msg.preset as CameraPreset)
            ? msg.preset as CameraPreset
            : 'iso'
          const scope = typeof msg.scope === 'string' && ['auto', 'active', 'group', 'all'].includes(msg.scope)
            ? msg.scope as 'auto' | 'active' | 'group' | 'all'
            : undefined
          const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
          void respond(() => {
            const framed = viewerApiRef.current?.setCameraPreset(preset, {
              ...(scope ? { scope } : {}),
              fill: num(msg.fill),
              azimuthDeg: num(msg.azimuth),
              elevationDeg: num(msg.elevation),
              animate: msg.animate !== false,
            })
            if (!framed) throw new Error('Nothing to frame — load a model first')
            return { scope: framed.scope }
          })
          break
        }
        // ── The panel rail, from outside ─────────────────────────────────
        // A host could load a scan but not open the panel that configures it,
        // could not ask which tool the user had open, and could not scope the
        // rail without reloading the iframe with a different `panels=`.
        case 'ifcviewer:open-panel': {
          const target = parsePanelTarget(msg.panel)
          // undefined means "an id we do not know" — ignored, not an error, so
          // a host page written against a newer build still works here.
          if (target === undefined) break
          if (target === null) { closeAllPanels(); break }
          const item = railItemsRef.current.find((i) => i.id === target)
          // Not on the rail = not available in this chrome, with this content.
          // Silently doing nothing beats pretending it opened.
          if (item && !item.open) item.onToggle()
          break
        }
        case 'ifcviewer:get-panels': {
          void respond(() => ({
            open: railItemsRef.current.find((i) => i.open)?.id ?? null,
            available: railItemsRef.current.map((i) => ({ id: i.id, label: i.label, open: i.open })),
          }))
          break
        }
        case 'ifcviewer:set-panels': {
          const list = parsePanelList(msg.panels)
          if (list !== undefined) useUIStore.getState().setRuntimePanels(list)
          break
        }
        case 'ifcviewer:set-language': {
          const lng = typeof msg.lang === 'string' ? msg.lang : null
          const supported = (i18n.options.supportedLngs || []) as string[]
          if (lng && supported.includes(lng) && i18n.language !== lng) void i18n.changeLanguage(lng)
          break
        }
        case 'ifcviewer:clear': {
          // Stop what is still loading first, or a model mid-attach would land
          // right after the scene was emptied. Pending auto-validations go
          // first: cancelling can make the queue idle, and idle runs them.
          pendingAutoValidateRef.current.clear()
          cancelAllLoads()
          const ids = useSceneStore.getState().models.map((m) => m.id)
          void (async () => { for (const id of ids) await handleRemoveModel(id) })()
          setModelInfo(null)
          setLoadError(null)
          break
        }

        // ── Query commands (reply with a `result` envelope) ──────────────────
        case 'ifcviewer:get-models':
          void respond(() => useSceneStore.getState().models.map((m) => ({
            id: m.id, fileName: m.fileName, elementCount: m.elementCount,
          })))
          break
        case 'ifcviewer:get-element': {
          const id = Number(msg.expressId)
          const modelId = typeof msg.modelId === 'string' ? msg.modelId : undefined
          void respond(() => (Number.isFinite(id) && id > 0
            ? (viewerApiRef.current?.getItemData(id, modelId) ?? null)
            : null))
          break
        }
        case 'ifcviewer:get-validation':
          void respond(() => {
            const r = useValidationStore.getState().result
            return r ? {
              qualityScore: r.qualityScore ?? null,
              errors: r.stats.errors, warnings: r.stats.warnings, info: r.stats.info,
            } : null
          })
          break
        case 'ifcviewer:screenshot':
          void respond(() => viewerApiRef.current?.takeSnapshot() ?? '')
          break
        case 'ifcviewer:get-stats':
          void respond(() => {
            const models = useSceneStore.getState().models
            return {
              elementCount: models.reduce((s, m) => s + m.elementCount, 0),
              models: models.map((m) => ({
                id: m.id,
                fileName: m.fileName,
                elementCount: m.elementCount,
                fileSize: m.fileSize,
                categories: m.categories.map((c) => ({ type: c.id, label: c.label, count: c.count })),
              })),
            }
          })
          break
        case 'ifcviewer:get-issues':
          void respond(() => {
            const r = useValidationStore.getState().result
            let issues = (r?.issues ?? []).map((i) => ({
              ruleId: i.ruleId,
              severity: i.severity,
              expressId: i.expressId,
              modelId: i.modelId ?? null,
              ifcClass: i.ifcClass,
              elementName: i.elementName,
              message: i.message,
              globalId: i.globalId,
              autoFixable: i.autoFixable,
            }))
            const sev = typeof msg.severity === 'string' ? msg.severity : null
            if (sev) issues = issues.filter((i) => i.severity === sev)
            const limit = Number(msg.limit)
            if (Number.isFinite(limit) && limit > 0) issues = issues.slice(0, limit)
            return { qualityScore: r?.qualityScore ?? null, total: r?.issues.length ?? 0, issues }
          })
          break
        case 'ifcviewer:check-ids':
          void respond(async () => {
            const xml = typeof msg.idsXml === 'string' ? msg.idsXml : ''
            if (!xml) throw new Error('No IDS XML provided')
            const mid = useSceneStore.getState().activeModelId ?? useSceneStore.getState().models[0]?.id ?? null
            const buffer = mid ? modelRegistry.getBuffer(mid) : null
            if (!mid || !buffer) throw new Error('No model buffer available — load an IFC first')
            const doc = parseIds(xml) // throws IdsParseError → message goes back to the SDK
            useIdsStore.getState().setLoaded('SDK', doc)
            useIdsStore.getState().startRun(mid)
            const t0 = performance.now()
            let result
            try {
              ({ result } = await runIds(doc, buffer))
            } catch (err) {
              // Keep the store consistent — v1 left it stuck in 'running'.
              useIdsStore.getState().setError(
                err instanceof IdsCheckError ? err.code : 'unknown',
                err instanceof Error ? err.message : String(err),
              )
              throw err
            }
            useIdsStore.getState().setResultForModel(mid, result, {
              at: Date.now(), idsFileName: 'SDK', durationMs: Math.round(performance.now() - t0), modelSchema: result.modelSchema,
            })
            // Frozen SDK wire shape: failures[].reasons stays string[] (EN prose).
            // The structured codes ride along additively as reasonCodes.
            return {
              ...result,
              specs: result.specs.map((s) => ({
                ...s,
                failures: s.failures.map((f) => ({ ...f, reasons: renderReasons(f.reasons), reasonCodes: f.reasons })),
              })),
            }
          })
          break

        case 'ifcviewer:check-eir':
          void respond(async () => {
            // Accept a profile object or its JSON string (compact shorthand ok).
            // parseEirProfile validates with Zod → a bad profile errors back to the SDK.
            const profile = parseEirProfile(msg.profile)
            const mid = useSceneStore.getState().activeModelId ?? useSceneStore.getState().models[0]?.id ?? null
            const buffer = mid ? modelRegistry.getBuffer(mid) : null
            if (!mid || !buffer) throw new Error('No model buffer available — load an IFC first')
            const doc = compileEirToIds(profile)
            useIdsStore.getState().setLoaded(profile.name, doc)
            useIdsStore.getState().startRun(mid)
            const t0 = performance.now()
            let result
            try {
              ({ result } = await runIds(doc, buffer))
            } catch (err) {
              useIdsStore.getState().setError(
                err instanceof IdsCheckError ? err.code : 'unknown',
                err instanceof Error ? err.message : String(err),
              )
              throw err
            }
            useIdsStore.getState().setResultForModel(mid, result, {
              at: Date.now(), idsFileName: profile.name, durationMs: Math.round(performance.now() - t0), modelSchema: result.modelSchema,
            })
            // Same frozen SDK wire shape as check-ids.
            return {
              ...result,
              specs: result.specs.map((s) => ({
                ...s,
                failures: s.failures.map((f) => ({ ...f, reasons: renderReasons(f.reasons), reasonCodes: f.reasons })),
              })),
            }
          })
          break

        // ── Mutating commands (fire-and-forget) ──────────────────────────────
        // ── Point clouds ───────────────────────────────────────────────
        // Loading goes through the loading queue (a managed job: download
        // lane with progress, decode lane, the scene anchor, per-job cancel);
        // every other command delegates to PointCloudPanel, which owns the
        // display, placement and replay state.
        case 'ifcviewer:add-pointcloud': {
          void respond(async () => {
            const name = typeof msg.name === 'string' ? msg.name : undefined
            let source: LoadSource
            if (msg.bytes instanceof ArrayBuffer) {
              source = { type: 'bytes', bytes: msg.bytes, fileName: name ?? 'scan.las' }
            } else if (typeof msg.url === 'string') {
              // The URL itself is the scan's identity across sessions (saved
              // offset, proj4, node cache) — the job keeps it as its source.
              // A name carrying a query is the URL's raw last segment (older
              // SDK clients default to url.split('/').pop()), not a name: a
              // signed ".copc.laz?X-Amz-…" would lose the extension the
              // readers route on. The URL's own path names it then.
              const usable = name && !/[?#]/.test(name) ? name : undefined
              source = { type: 'url', url: msg.url, fileName: usable ?? deriveScanFileName(msg.url) }
            } else {
              throw new Error('Provide bytes (ArrayBuffer) or url')
            }
            if (!canLoadKind('pointcloud')) throw new Error('Point clouds are not enabled in this build')
            const outcome = await submitPointClouds([{ source }], { origin: 'sdk', requestId })[0].settled
            if (outcome.status === 'loaded') return { cloudId: outcome.resultId }
            // In words, in the viewer's language — what the host always
            // received (a cancel too: the runner's own "Loading was cancelled").
            if (outcome.status === 'cancelled') {
              throw new Error(await describeSourceError({
                code: 'cancelled', message: 'cancelled', phase: null, autoRetryable: false, userRetryable: true,
                attempt: 1, detailKey: 'pointcloud:error.cancelled',
              }, 'pointcloud'))
            }
            throw new Error(await describeSourceError(outcome.error, 'pointcloud'))
          })
          break
        }
        // Remove and clear work without the panel too: the client skin
        // mounts none, and a host that can add a scan there must be able to
        // take it out. With the panel mounted it keeps the say (it also stops
        // a temporal replay).
        case 'ifcviewer:remove-pointcloud':
          void respond(async () => {
            const cloudId = typeof msg.cloudId === 'string' ? msg.cloudId : undefined
            if (!canLoadKind('pointcloud')) throw new Error('Point clouds are not enabled in this build')
            if (cloudId && !appBus.hasListeners('sdk:pointcloud')) {
              await removeSourceResult('pointcloud', cloudId)
              return { ok: true }
            }
            await dispatchPanelCommand('sdk:pointcloud', { action: 'remove', cloudId },
              { unavailable: 'Point clouds are not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:clear-pointclouds':
          void respond(async () => {
            if (!canLoadKind('pointcloud')) throw new Error('Point clouds are not enabled in this build')
            if (!appBus.hasListeners('sdk:pointcloud')) {
              await clearSources('pointcloud')
              return { ok: true }
            }
            await dispatchPanelCommand('sdk:pointcloud', { action: 'clear' },
              { unavailable: 'Point clouds are not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:pointcloud-visible':
          void respond(async () => {
            await dispatchPanelCommand('sdk:pointcloud',
              {
                action: 'visible',
                cloudId: typeof msg.cloudId === 'string' ? msg.cloudId : undefined,
                visible: msg.visible !== false,
              },
              { unavailable: 'Point clouds are not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:fit-pointcloud':
          void respond(async () => {
            await dispatchPanelCommand('sdk:pointcloud',
              { action: 'frame', cloudId: typeof msg.cloudId === 'string' ? msg.cloudId : undefined },
              { unavailable: 'Point clouds are not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:pointcloud-display':
          void respond(async () => {
            await dispatchPanelCommand('sdk:pointcloud',
              {
                action: 'display',
                display: (msg.display ?? undefined) as Record<string, unknown> | undefined,
                renderBudget: typeof msg.renderBudget === 'number' ? msg.renderBudget : undefined,
              },
              { unavailable: 'Point clouds are not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:inspect-pointcloud':
          void respond(async () => {
            await dispatchPanelCommand('sdk:pointcloud',
              { action: 'inspect', inspect: msg.inspect !== false },
              { unavailable: 'Point clouds are not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:pointcloud-placement':
          void respond(async () => {
            await dispatchPanelCommand('sdk:pointcloud',
              {
                action: 'placement',
                cloudId: typeof msg.cloudId === 'string' ? msg.cloudId : undefined,
                placement: (msg.placement ?? undefined) as Record<string, unknown> | undefined,
              },
              { unavailable: 'Point clouds are not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:pointcloud-upaxis':
          void respond(async () => {
            // Longer than the other placement commands: correcting the up axis
            // re-runs the alignment ladder, which reaches into the web-ifc
            // worker for the model's georeferencing.
            await dispatchPanelCommand('sdk:pointcloud',
              {
                action: 'upAxis',
                cloudId: typeof msg.cloudId === 'string' ? msg.cloudId : undefined,
                upAxis: msg.upAxis === 'y' ? 'y' : 'z',
              },
              { unavailable: 'Point clouds are not enabled in this build', timeoutMs: 120_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:start-pointcloud-replay':
          void respond(async () => {
            await dispatchPanelCommand('sdk:pointcloud',
              {
                action: 'replay',
                replayId: typeof msg.replayId === 'string' ? msg.replayId : undefined,
              },
              { unavailable: 'Point cloud replay is not enabled in this build', timeoutMs: 120_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:start-video-demo':
          void respond(async () => {
            await dispatchPanelCommand('sdk:video',
              { action: 'demo' },
              { unavailable: '3D video is not enabled in this build', timeoutMs: 120_000 })
            return { ok: true }
          })
          break
        // ── Imported models ────────────────────────────────────────────
        // Loading goes through the loading queue, as for scans; the other
        // mesh commands delegate to MeshPanel, which owns placement and
        // display. One call is ONE model: the entry file plus everything it
        // references (a .gltf needs its .bin and textures, an .obj its .mtl).
        case 'ifcviewer:add-mesh': {
          void respond(async () => {
            const files: File[] = []
            if (Array.isArray(msg.files)) {
              for (const f of msg.files as Array<{ name?: unknown; bytes?: unknown }>) {
                if (typeof f?.name === 'string' && f.bytes instanceof ArrayBuffer) {
                  files.push(new File([f.bytes], f.name))
                }
              }
            }
            const urls = Array.isArray(msg.urls) ? (msg.urls as unknown[]).filter((u): u is string => typeof u === 'string') : []
            if (files.length === 0 && urls.length === 0) throw new Error('Provide files (name + bytes) or urls')
            if (!canLoadKind('mesh')) throw new Error('Mesh import is not enabled in this build')

            let item: SourceSubmitItem
            if (files.length > 0) {
              // Bytes and URLs together (a raw postMessage can send both):
              // fetch the URLs here and import everything as one selection,
              // as before.
              for (const url of urls) {
                files.push(await fetchFileFromUrl(url, { fallbackName: 'model.glb', what: 'model' }))
              }
              const [group] = groupMeshFiles(files)
              if (!group) throw new Error('error.noEntryFile')
              item = { source: { type: 'file', file: group.entry, sidecars: group.sidecars } }
            } else {
              // URLs only: downloaded by the job (network lane, byte progress,
              // cancel). The entry is the first URL whose PATH names a model —
              // a signed "…/model.gltf?sig=…" is still a .gltf.
              const entryAt = Math.max(0, urls.findIndex((u) =>
                (MESH_ENTRY_EXTENSIONS as readonly string[]).includes(fileExtensionOf(urlPathName(u)))))
              item = {
                source: {
                  type: 'url',
                  url: urls[entryAt],
                  sidecars: urls.filter((_, i) => i !== entryAt).map((url) => ({ url })),
                },
              }
            }
            const outcome = await submitMeshes([item], { origin: 'sdk', requestId })[0].settled
            if (outcome.status === 'loaded') return { meshId: outcome.resultId }
            if (outcome.status === 'cancelled') throw new Error('error.cancelled')
            // The mesh wire contract is the raw i18n key ('error.noEntryFile').
            throw new Error(sourceErrorKey(outcome.error) ?? outcome.error.message)
          })
          break
        }
        case 'ifcviewer:remove-mesh':
          void respond(async () => {
            if (!canLoadKind('mesh')) throw new Error('Mesh import is not enabled in this build')
            const meshId = typeof msg.meshId === 'string' ? msg.meshId : undefined
            if (!appBus.hasListeners('sdk:mesh')) {
              const target = meshId ?? useMeshStore.getState().activeMeshId
              if (!target) throw new Error('No model loaded')
              await removeSourceResult('mesh', target)
              return { ok: true }
            }
            await dispatchPanelCommand('sdk:mesh', { action: 'remove', meshId },
              { unavailable: 'Mesh import is not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:clear-meshes':
          void respond(async () => {
            if (!canLoadKind('mesh')) throw new Error('Mesh import is not enabled in this build')
            if (!appBus.hasListeners('sdk:mesh')) {
              await clearSources('mesh')
              return { ok: true }
            }
            await dispatchPanelCommand('sdk:mesh', { action: 'clear' },
              { unavailable: 'Mesh import is not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:mesh-visible':
          void respond(async () => {
            await dispatchPanelCommand('sdk:mesh',
              {
                action: 'visible',
                meshId: typeof msg.meshId === 'string' ? msg.meshId : undefined,
                visible: msg.visible !== false,
              },
              { unavailable: 'Mesh import is not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:fit-mesh':
          void respond(async () => {
            await dispatchPanelCommand('sdk:mesh',
              { action: 'frame', meshId: typeof msg.meshId === 'string' ? msg.meshId : undefined },
              { unavailable: 'Mesh import is not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:mesh-placement':
          void respond(async () => {
            await dispatchPanelCommand('sdk:mesh',
              {
                action: 'placement',
                meshId: typeof msg.meshId === 'string' ? msg.meshId : undefined,
                placement: (msg.placement ?? undefined) as Record<string, unknown> | undefined,
              },
              { unavailable: 'Mesh import is not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:mesh-upaxis':
          void respond(async () => {
            await dispatchPanelCommand('sdk:mesh',
              {
                action: 'upAxis',
                meshId: typeof msg.meshId === 'string' ? msg.meshId : undefined,
                upAxis: msg.upAxis === 'z' ? 'z' : 'y',
              },
              { unavailable: 'Mesh import is not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:mesh-unit':
          void respond(async () => {
            await dispatchPanelCommand('sdk:mesh',
              {
                action: 'unit',
                meshId: typeof msg.meshId === 'string' ? msg.meshId : undefined,
                unitScale: typeof msg.unitScale === 'number' ? msg.unitScale : 1,
              },
              { unavailable: 'Mesh import is not enabled in this build', timeoutMs: 30_000 })
            return { ok: true }
          })
          break
        case 'ifcviewer:get-meshes':
          void respond(() => ({
            meshes: useMeshStore.getState().meshes.map((m) => ({
              id: m.id,
              fileName: m.fileName,
              format: m.format,
              status: m.status,
              visible: m.visible,
              stats: m.stats,
              // Both of these are usually GUESSES, and the host needs to know
              // which: glTF declares its axis, OBJ does not, and no format here
              // declares its unit at all.
              unitScale: m.frame?.unitScale ?? 1,
              unitSource: m.frame?.unitSource ?? 'assumed',
              upAxis: m.frame?.upAxis ?? 'y',
              upAxisSource: m.frame?.upAxisSource ?? 'assumed',
              placement: m.placement,
            })),
          }))
          break

        case 'ifcviewer:get-pointclouds':
          void respond(() => ({
            clouds: usePointCloudStore.getState().clouds.map((c) => ({
              id: c.id,
              fileName: c.fileName,
              format: c.format,
              status: c.status,
              // pointCount is what is RESIDENT, which is not what the file holds
              // when the budget truncated the parse — declaredCount is.
              pointCount: c.pointCount,
              declaredCount: c.declaredCount,
              truncated: c.truncated,
              visible: c.visible,
              crs: c.frame?.epsgCode ?? null,
              // PLY, PCD and text declare no orientation, so this is often a
              // guess — and getting it wrong lays the whole scan on its side.
              // `upAxisSource` is what lets a host know it may need to offer the
              // correction rather than trusting the number.
              upAxis: c.frame?.upAxis ?? 'z',
              upAxisSource: c.frame?.upAxisSource ?? 'assumed',
              placement: c.alignment?.offset ?? NO_OFFSET,
              // A scan placed by the `local` or `manual` rung is a guess. Hosts
              // must be able to tell that apart from an exact map conversion.
              alignment: c.alignment
                ? { rung: c.alignment.rung, confidence: c.alignment.confidence }
                : null,
            })),
          }))
          break

        // ── Presentation: look, walk, sun, map (SDK 1.11) ──────────────────
        // Everything here goes through the same store or panel the visitor's
        // own clicks do, so the viewer's UI never disagrees with what a host
        // set — the background menu shows the host's colour, the sun panel
        // shows the host's date.
        case 'ifcviewer:set-background': {
          void respond(() => {
            const bg = parseBackgroundSpec(msg.background)
            if (!bg) throw new Error('Unknown background — use a preset name, "#rrggbb", "#top,#bottom" or { top, bottom }')
            // Not saved: the iframe shares storage with the app itself.
            useSceneStore.getState().setBackground(bg, { persist: false })
            return bg
          })
          break
        }
        case 'ifcviewer:get-background':
          void respond(() => useSceneStore.getState().background)
          break
        case 'ifcviewer:set-accent': {
          void respond(() => {
            const raw = typeof msg.accent === 'string' ? msg.accent.trim() : ''
            if (!/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) throw new Error('Accent must be "#rrggbb"')
            setAccent(raw.startsWith('#') ? raw : `#${raw}`)
            return null
          })
          break
        }
        case 'ifcviewer:set-client-mode':
          void respond(() => { useUIStore.getState().setClientMode(msg.enabled !== false); return null })
          break
        case 'ifcviewer:set-render-quality': {
          void respond(() => {
            const q = msg.quality === 'quality' || msg.quality === 'high' ? 'quality' : 'standard'
            // Store and viewer both, as the Scene panel does: the store alone
            // only moves the toggle.
            useUIStore.getState().setRenderQuality(q)
            viewerApiRef.current?.setRenderQuality(q)
            return q
          })
          break
        }
        case 'ifcviewer:set-walk': {
          void respond(() => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            if (typeof msg.speed === 'number' && Number.isFinite(msg.speed) && msg.speed > 0) api.setWalkSpeed(msg.speed)
            if (typeof msg.enabled === 'boolean') {
              const on = api.setWalkMode(msg.enabled)
              if (msg.enabled && !on) throw new Error('Walk mode needs a model in the scene')
            }
            return walkStateOut(api.getWalkState())
          })
          break
        }
        case 'ifcviewer:get-walk':
          void respond(() => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            return walkStateOut(api.getWalkState())
          })
          break
        case 'ifcviewer:get-camera':
          void respond(() => viewerApiRef.current?.getCameraViewpoint() ?? null)
          break
        case 'ifcviewer:look-at': {
          void respond(() => {
            const p = asVec3(msg.position)
            const t = asVec3(msg.target)
            if (!p || !t) throw new Error('lookAt needs position and target as { x, y, z }')
            viewerApiRef.current?.setCameraLookAt(p, t, msg.animate !== false)
            return null
          })
          break
        }
        case 'ifcviewer:set-solar': {
          const cmd = (msg.solar && typeof msg.solar === 'object' ? msg.solar : {}) as Record<string, unknown>
          const loc = cmd.location as { lat?: unknown; lon?: unknown } | undefined
          void respond(async () => {
            if (!isSolarEnabled()) throw new Error('The sun study is not available in this build')
            if (!useSceneStore.getState().models.length) throw new Error('Load a model first — the sun study needs something to cast shadows')
            await dispatchPanelCommand('sdk:solar', {
              active:   typeof cmd.active === 'boolean' ? cmd.active : undefined,
              date:     typeof cmd.date === 'string' ? cmd.date : undefined,
              time:     typeof cmd.time === 'string' ? cmd.time : undefined,
              moon:     typeof cmd.moon === 'boolean' ? cmd.moon : undefined,
              sky:      typeof cmd.sky === 'boolean' ? cmd.sky : undefined,
              quality:  cmd.quality === 'high' || cmd.quality === 'standard' ? cmd.quality : undefined,
              location: loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon))
                && Math.abs(Number(loc.lat)) <= 90 && Math.abs(Number(loc.lon)) <= 180
                ? { lat: Number(loc.lat), lon: Number(loc.lon) } : undefined,
            }, { unavailable: 'The sun study did not come up in time', subscriberTimeoutMs: 60_000, timeoutMs: 30_000 })
            return solarStateOut()
          })
          break
        }
        case 'ifcviewer:get-solar':
          void respond(() => solarStateOut())
          break
        case 'ifcviewer:set-site': {
          const cmd = (msg.site && typeof msg.site === 'object' ? msg.site : {}) as Record<string, unknown>
          void respond(async () => {
            if (!isGisEnabled()) throw new Error('Map mode is not available in this build')
            if (!useSceneStore.getState().models.length) throw new Error('Load a model first — map mode places the model on the map')
            const pick = <T,>(v: unknown, ok: readonly T[]): T | undefined => ok.includes(v as T) ? v as T : undefined
            await dispatchPanelCommand('sdk:site', {
              enabled:      typeof cmd.enabled === 'boolean' ? cmd.enabled : true,
              terrain:      typeof cmd.terrain === 'boolean' ? cmd.terrain : undefined,
              buildings:    typeof cmd.buildings === 'boolean' ? cmd.buildings : undefined,
              vehicles:     typeof cmd.vehicles === 'boolean' ? cmd.vehicles : undefined,
              layers:       cmd.layers && typeof cmd.layers === 'object' ? cmd.layers as Record<string, boolean> : undefined,
              detail:       pick(cmd.detail, ['simple', 'detailed', 'showcase'] as const),
              terrainStyle: pick(cmd.terrainStyle, ['imagery', 'shaded', 'hypsometric', 'slope', 'ecosystem'] as const),
              exaggeration: typeof cmd.exaggeration === 'number' ? Math.min(3, Math.max(1, cmd.exaggeration)) : undefined,
            }, { unavailable: 'Map mode did not come up in time', subscriberTimeoutMs: 60_000, timeoutMs: 180_000 })
            return siteStateOut()
          })
          break
        }
        case 'ifcviewer:get-site':
          void respond(() => siteStateOut())
          break
        // ── Analysis: sections and measurements (SDK 1.11) ─────────────────
        // Driven on the viewer's own systems, the ones the panels drive, so a
        // cut made by a host shows up in the Section panel and can be dragged.
        case 'ifcviewer:add-section': {
          void respond(async () => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            const sections = api.getSections()
            let axis: 'x' | 'y' | 'z' = msg.axis === 'x' || msg.axis === 'y' ? msg.axis : 'z'
            let offset = typeof msg.offset === 'number' && Number.isFinite(msg.offset) ? msg.offset : undefined
            // A plan cut at a named storey — the cut a blog post means by
            // "the ground floor plan": 1.2 m above that level.
            if (msg.level !== undefined && msg.level !== null) {
              axis = 'z'
              const levels = await api.getStoreyLevels()
              const i = typeof msg.level === 'number'
                ? msg.level
                : levels.findIndex((l) => l.name.toLowerCase() === String(msg.level).toLowerCase())
              if (i < 0 || i >= levels.length) {
                throw new Error(`No storey "${String(msg.level)}" — the model has: ${levels.map((l) => l.name).join(', ') || 'none'}`)
              }
              offset = planCutY(levels[i].y, levels[i + 1]?.y ?? null)
            }
            const id = sections.addAxisPlane(axis)
            if (!id) throw new Error('Nothing to cut — load a model first')
            if (offset !== undefined) sections.setOffset(id, offset, true)
            if (msg.flip === true) sections.flip(id)
            return { id, ...sectionsOut(api) }
          })
          break
        }
        case 'ifcviewer:update-section': {
          void respond(() => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            const sections = api.getSections()
            const id = typeof msg.id === 'string' ? msg.id : ''
            const plane = sections.getSnapshot().planes.find((p) => p.id === id)
            if (!plane) throw new Error(`No section plane "${id}"`)
            if (typeof msg.offset === 'number' && Number.isFinite(msg.offset)) sections.setOffset(id, msg.offset, true)
            if (typeof msg.enabled === 'boolean') sections.setEnabled(id, msg.enabled)
            if (typeof msg.flipped === 'boolean' && msg.flipped !== plane.flipped) sections.flip(id)
            return sectionsOut(api)
          })
          break
        }
        case 'ifcviewer:remove-section': {
          void respond(() => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            const sections = api.getSections()
            if (typeof msg.id === 'string') sections.remove(msg.id)
            else sections.clear()
            return sectionsOut(api)
          })
          break
        }
        case 'ifcviewer:section-box': {
          void respond(async () => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            const sections = api.getSections()
            if (msg.fit === false) sections.removeBox()
            else {
              const ok = await sections.enableBox(msg.fit === 'selection' ? 'selection' : 'model')
              if (!ok) throw new Error(msg.fit === 'selection' ? 'Select an element first' : 'Nothing to box — load a model first')
            }
            return sectionsOut(api)
          })
          break
        }
        case 'ifcviewer:get-sections':
          void respond(async () => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            return { ...sectionsOut(api), levels: await api.getStoreyLevels() }
          })
          break
        case 'ifcviewer:set-measure-tool': {
          void respond(() => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            const tool = typeof msg.tool === 'string' && ['distance', 'path', 'area', 'angle', 'point'].includes(msg.tool)
              ? msg.tool as 'distance' | 'path' | 'area' | 'angle' | 'point'
              : 'none'
            // The tools read the pointer only while their panel is open, so
            // arming one opens it — the visitor then also sees what to click.
            // Arm FIRST: the panel re-arms its last-used tool on open when
            // none is armed, which would override the host's choice.
            api.getMeasure().setTool(tool)
            if (tool !== 'none') useUIStore.getState().setMeasurementPanelOpen(true)
            return null
          })
          break
        }
        case 'ifcviewer:get-measurements':
          void respond(() => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            return measurementsOut(api)
          })
          break
        case 'ifcviewer:clear-measurements':
          void respond(() => {
            const api = viewerApiRef.current
            if (!api) throw new Error('Viewer not ready')
            if (typeof msg.id === 'string') api.getMeasure().remove(msg.id)
            else api.getMeasure().clear()
            return measurementsOut(api)
          })
          break
        // ── Federated scenes: one model at a time (SDK 1.11) ───────────────
        case 'ifcviewer:model-visible': {
          void respond(() => {
            const id = typeof msg.modelId === 'string' ? msg.modelId : ''
            if (!useSceneStore.getState().models.some((m) => m.id === id)) throw new Error(`No model "${id}"`)
            const visible = msg.visible !== false
            useSceneStore.getState().setModelVisible(id, visible)
            viewerApiRef.current?.setModelVisible(id, visible)
            if (visible) {
              // Re-apply per-element/category filters after un-hiding a model
              // so hidden elements stay hidden — as the Scene panel does.
              const f = filtersRef.current
              viewerApiRef.current?.applyFilters(f.hidden, f.isolated, f.hiddenElements, f.isolatedElement, f.isolatedElementModel)
            }
            return null
          })
          break
        }
        case 'ifcviewer:model-opacity': {
          void respond(() => {
            const o = Number(msg.opacity)
            if (!Number.isFinite(o)) throw new Error('Opacity must be a number between 0 and 1')
            viewerApiRef.current?.setModelOpacity(Math.min(1, Math.max(0.05, o)), typeof msg.modelId === 'string' ? msg.modelId : undefined)
            return null
          })
          break
        }
        case 'ifcviewer:isolate-model': {
          void respond(() => {
            const id = typeof msg.modelId === 'string' ? msg.modelId : null
            const scene = useSceneStore.getState()
            if (id && !scene.models.some((m) => m.id === id)) throw new Error(`No model "${id}"`)
            for (const m of scene.models) {
              const visible = id === null || m.id === id
              if (m.visible !== visible) scene.setModelVisible(m.id, visible)
            }
            if (id) viewerApiRef.current?.isolateModel(id)
            else viewerApiRef.current?.showAllModels()
            return null
          })
          break
        }
        // ── Tours (SDK 1.12) ────────────────────────────────────────────────
        // A tour is the presentation store's tour; the TourPlayer the app
        // already renders plays it, so a host-started tour looks and behaves
        // exactly like one the visitor started (bar, captions, share link).
        case 'ifcviewer:start-tour': {
          void respond(async () => {
            const viewer = viewerApiRef.current
            if (!viewer || !useSceneStore.getState().models.length) throw new Error('Load a model first')
            const id = typeof msg.template === 'string' && msg.template in PRESENTATION_TEMPLATES
              ? msg.template as PresentationTemplateId : 'client-walkthrough'
            const result = useValidationStore.getState().result
            const issues = result?.issues ?? []
            const score = result?.qualityScore ?? null
            if (id === 'technical-review' && issues.length === 0) {
              throw new Error('A technical review needs validation issues — run validation first, or pick another template')
            }
            const ok = await applyTemplate(id, viewer, {
              issues,
              score,
              includeImprovements: msg.includeImprovements === true,
              strings: {
                title: typeof msg.title === 'string' && msg.title
                  ? msg.title
                  : id === 'technical-review' ? tTourNs('autoTitle') : tTourNs('showcase.title'),
                showcaseCaptions: [
                  tTourNs('showcase.captions.overview'),
                  tTourNs('showcase.captions.perspective'),
                  tTourNs('showcase.captions.front'),
                  tTourNs('showcase.captions.side'),
                  tTourNs('showcase.captions.aerial'),
                  tTourNs('showcase.captions.closing'),
                ],
                improvementsCaption: tTourNs('showcase.improvements'),
                scoreHeadline: score !== null ? tTourNs('showcase.headline', { score }) : undefined,
              },
            })
            if (!ok) throw new Error('Nothing to tour — the template produced no steps')
            setSdkTourAutoplay(parseAutoplay(msg.autoplay))
            return tourStateOut()
          })
          break
        }
        case 'ifcviewer:play-tour': {
          void respond(() => {
            if (!useSceneStore.getState().models.length) throw new Error('Load a model first')
            const raw = (msg.tour && typeof msg.tour === 'object' ? msg.tour : {}) as { title?: unknown; steps?: unknown }
            const steps = Array.isArray(raw.steps) ? raw.steps : []
            const built: TourStep[] = []
            steps.forEach((s, i) => {
              const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
              const position = asVec3(o.position)
              const target = asVec3(o.target)
              if (!position || !target) throw new Error(`Step ${i + 1}: position and target must be { x, y, z }`)
              const ids = Array.isArray(o.highlight) ? o.highlight.map(Number).filter((n) => Number.isFinite(n) && n > 0) : []
              const cats = Array.isArray(o.isolate) ? o.isolate.filter((c): c is string => typeof c === 'string').map((c) => canonicalIfcType(c.toUpperCase())) : []
              built.push({
                id: `sdk-${i}`,
                camera: { position, target },
                caption: typeof o.caption === 'string' ? o.caption : undefined,
                modelId: typeof o.modelId === 'string' ? o.modelId : undefined,
                highlightedExpressIds: ids.length ? ids.slice(0, 500) : undefined,
                isolatedCategories: cats.length ? cats : undefined,
              })
            })
            if (built.length === 0) throw new Error('A tour needs at least one step')
            const store = usePresentationStore.getState()
            store.setTour({
              id: `sdk-${Date.now().toString(36)}`,
              title: typeof raw.title === 'string' ? raw.title : '',
              steps: built,
              createdFrom: 'manual',
            })
            store.setTemplateId(null)
            const startAt = Number(msg.startAt)
            store.play(Number.isInteger(startAt) && startAt >= 0 && startAt < built.length ? startAt : 0)
            setSdkTourAutoplay(parseAutoplay(msg.autoplay))
            return tourStateOut()
          })
          break
        }
        case 'ifcviewer:tour-step': {
          void respond(() => {
            const store = usePresentationStore.getState()
            if (store.mode !== 'playing' || !store.tour) throw new Error('No tour is playing')
            const total = store.tour.steps.length
            const target = typeof msg.index === 'number' ? msg.index
              : store.stepIndex + (typeof msg.delta === 'number' ? msg.delta : 1)
            store.setStepIndex(Math.min(total - 1, Math.max(0, Math.round(target))))
            return tourStateOut()
          })
          break
        }
        case 'ifcviewer:stop-tour':
          void respond(() => {
            setSdkTourAutoplay(null)
            if (usePresentationStore.getState().mode === 'playing') usePresentationStore.getState().exitPlayback()
            return tourStateOut()
          })
          break
        case 'ifcviewer:set-tour-autoplay':
          void respond(() => { setSdkTourAutoplay(parseAutoplay(msg.autoplay)); return tourStateOut() })
          break
        case 'ifcviewer:get-tour':
          void respond(() => tourStateOut())
          break
        // ── Presentation director (SDK 1.12) ───────────────────────────────
        // A recipe becomes a Clip Studio project the same way the studio's
        // own "Generate" does; export renders it to a video file the host
        // receives as bytes. Nothing is uploaded — the MP4 is encoded here.
        case 'ifcviewer:get-recipes':
          void respond(async () => {
            const { BUILT_IN_RECIPES } = await import('./lib/director/recipe')
            return BUILT_IN_RECIPES.map((r) => ({
              id: r.id, name: r.name, format: r.format, targetSec: r.targetSec,
              style: r.style ?? 'classic', look: r.look ?? null, sections: [...r.sections],
            }))
          })
          break
        case 'ifcviewer:create-presentation': {
          void respond(async () => {
            if (!useSceneStore.getState().models.length) throw new Error('Load a model first')
            const { builtInRecipe, DEFAULT_RECIPE_ID, OUTPUT_FORMATS, PACES } = await import('./lib/director/recipe')
            const id = typeof msg.recipe === 'string' ? msg.recipe : DEFAULT_RECIPE_ID
            const base = builtInRecipe(id)
            if (!base) throw new Error(`No recipe "${id}" — see getPresentationRecipes()`)
            const o = (msg.options && typeof msg.options === 'object' ? msg.options : {}) as Record<string, unknown>
            const recipe = {
              ...base,
              ...(OUTPUT_FORMATS.includes(o.format as never) ? { format: o.format as typeof base.format } : {}),
              ...(PACES.includes(o.pace as never) ? { pace: o.pace as typeof base.pace } : {}),
              ...(typeof o.targetSec === 'number' && o.targetSec >= 5 && o.targetSec <= 180 ? { targetSec: Math.round(o.targetSec) } : {}),
              ...(o.music === 'none' ? { music: 'none' as const } : {}),
              ...(typeof o.watermark === 'boolean' ? { watermark: o.watermark } : {}),
              captions: {
                ...base.captions,
                ...(typeof o.title === 'string' ? { title: o.title } : {}),
                ...(typeof o.cta === 'string' ? { cta: o.cta } : {}),
                ...(typeof o.captions === 'boolean' ? { enabled: o.captions } : {}),
              },
            }
            const studio = useClipStudioStore
            studio.getState().requestGenerate(recipe)
            // Done = the studio took the recipe, ran its job, and stayed idle.
            // The job drops to null for a moment between phases (plan →
            // render → assemble), so idle only counts once it has lasted.
            await new Promise<void>((resolve, reject) => {
              let started = false
              let settle: ReturnType<typeof setTimeout> | null = null
              const finish = (err?: Error): void => {
                off(); clearTimeout(timer); if (settle) clearTimeout(settle)
                if (err) reject(err); else resolve()
              }
              const timer = setTimeout(() => finish(new Error('The presentation did not finish in time')), 15 * 60_000)
              const check = (): void => {
                const s = studio.getState()
                if (!s.open) { finish(new Error('The studio was closed before the presentation finished')); return }
                if (s.pendingRecipe !== null) return
                if (s.job) { started = true; if (settle) { clearTimeout(settle); settle = null }; return }
                // Never started (nothing to present is only toasted): give up
                // after a while and let the empty-project check explain.
                if (!settle) settle = setTimeout(() => finish(), started ? 2_500 : 10_000)
              }
              const off = studio.subscribe(check)
            })
            const s = studio.getState()
            if (!s.project.clips.length) throw new Error('Nothing to present — the model gave the director no shots')
            return presentationStateOut()
          })
          break
        }
        case 'ifcviewer:export-presentation': {
          const reqId = requestId
          void (async () => {
            try {
              const s = useClipStudioStore.getState()
              if (!s.project.clips.length) throw new Error('No presentation to export — call createPresentation() first')
              const { exportStudio } = await import('./lib/capture/studio-actions')
              const { DEFAULT_EXPORT } = await import('./lib/capture/export-settings')
              const res = [720, 1080, 1440].includes(Number(msg.resolution)) ? Number(msg.resolution) as 720 | 1080 | 1440 : DEFAULT_EXPORT.resolution
              let lastPct = -1
              const blob = await exportStudio(undefined, 'Exporting', {
                withMusic: msg.music !== false,
                settings: { ...DEFAULT_EXPORT, resolution: res },
                // One event per percent: the encoder reports every frame.
                onProgress: (f) => {
                  const pct = Math.floor(f * 100)
                  if (pct === lastPct) return
                  lastPct = pct
                  emitEmbedEvent('presentation-progress', { stage: 'export', progress: f })
                },
              })
              const bytes = await blob.arrayBuffer()
              if (reqId) emitEmbedEvent('result', { requestId: reqId, ok: true, data: { bytes, mimeType: blob.type, sizeBytes: bytes.byteLength } }, [bytes])
            } catch (err) {
              if (reqId) emitEmbedEvent('result', { requestId: reqId, ok: false, error: err instanceof Error ? err.message : String(err) })
            }
          })()
          break
        }
        case 'ifcviewer:close-presentation':
          void respond(() => { useClipStudioStore.getState().closeStudio(); return null })
          break
        // ── Cover Studio (SDK 1.13) ────────────────────────────────────────
        case 'ifcviewer:get-cover-options':
          void respond(async () => {
            const [{ RECIPE_IDS }, { COVER_TEMPLATE_IDS }, { COVER_FORMATS }, { COVER_PALETTES }] = await Promise.all([
              import('./lib/cover/recipes'), import('./lib/cover/templates'),
              import('./lib/cover/formats'), import('./lib/cover/palettes'),
            ])
            return {
              recipes: [...RECIPE_IDS],
              templates: [...COVER_TEMPLATE_IDS],
              formats: Object.values(COVER_FORMATS).map((f) => ({ id: f.id, width: f.width, height: f.height, ratio: f.ratio })),
              palettes: [...COVER_PALETTES.map((p) => p.id), 'image', 'image-dark'],
            }
          })
          break
        case 'ifcviewer:create-cover': {
          void respond(async () => {
            if (!useSceneStore.getState().models.length) throw new Error('Load a model first')
            const text = msg.text && typeof msg.text === 'object' ? Object.fromEntries(
              Object.entries(msg.text as Record<string, unknown>).filter(([, v]) => typeof v === 'string'),
            ) as Record<string, string> : undefined
            return coverCommand({
              action: 'apply',
              recipe: typeof msg.recipe === 'string' ? msg.recipe : undefined,
              template: typeof msg.template === 'string' ? msg.template : undefined,
              format: typeof msg.format === 'string' ? msg.format : undefined,
              palette: typeof msg.palette === 'string' ? msg.palette : undefined,
              text,
            })
          })
          break
        }
        case 'ifcviewer:compare': {
          // Two deliveries by URL → the comparison workspace, already run. A
          // head file that is loaded in the scene is mapped to it, so the
          // changes can be framed in 3D.
          void respond(async () => {
            const urls = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).filter((u): u is string => typeof u === 'string' && !!u)
            const base = urls(msg.base), head = urls(msg.head)
            if (!base.length || !head.length) throw new Error('compare needs base and head URLs')
            const [{ snapshotMany }, { diffSnapshotSets }, { useCompareStore }] = await Promise.all([
              import('./lib/compare/snapshot-runner'),
              import('./lib/compare/model-diff'),
              import('./stores/compareStore'),
            ])
            const fileName = (u: string): string => decodeURIComponent(u.split(/[?#]/)[0].split('/').pop() || 'model.ifc')
            const side = async (list: string[]) => snapshotMany(
              await Promise.all(list.map(async (u) => {
                const res = await fetch(new URL(u, window.location.href).href)
                if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`)
                return { fileName: fileName(u), buffer: await res.arrayBuffer(), geometry: true }
              })),
              (name, pct) => useCompareStore.getState().setProgress(name, pct),
            )
            useCompareStore.getState().setBusy(true)
            try {
              const b = await side(base)
              const h = await side(head)
              const scene = useSceneStore.getState().models
              const modelIds: Record<string, string> = {}
              for (const snap of h) {
                const m = scene.find((x) => x.fileName === snap.fileName)
                if (m) modelIds[snap.fileName] = m.id
              }
              const label = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback)
              const baseLabel = label(msg.baseLabel, b.map((x) => x.fileName).join(', '))
              const headLabel = label(msg.headLabel, h.map((x) => x.fileName).join(', '))
              const s = useCompareStore.getState()
              s.setSide('base', { label: baseLabel, snapshots: b, modelIds: {}, source: 'files' })
              s.setSide('head', { label: headLabel, snapshots: h, modelIds, source: 'files' })
              const diff = diffSnapshotSets(b, h, { base: baseLabel, head: headLabel })
              useCompareStore.getState().setDiff(diff)
              setShowCompareModal(true)
              return { changes: diff.elements.length }
            } finally {
              useCompareStore.getState().setBusy(false)
            }
          })
          break
        }
        case 'ifcviewer:get-cover':
          void respond(() => {
            if (!useCoverStudioStore.getState().open) return null
            return coverCommand({ action: 'state' })
          })
          break
        case 'ifcviewer:export-cover': {
          const reqId = requestId
          void (async () => {
            try {
              if (!useCoverStudioStore.getState().open) throw new Error('No cover open — call createCover() first')
              const type = ['png', 'jpeg', 'pdf', 'pptx', 'zip'].includes(msg.fileType as string) ? msg.fileType as 'png' : 'png'
              const r = await coverCommand({ action: 'export', type, slide: typeof msg.slide === 'number' ? msg.slide : undefined }) as { blob: Blob; slides: number }
              const bytes = await r.blob.arrayBuffer()
              if (reqId) emitEmbedEvent('result', { requestId: reqId, ok: true, data: { bytes, mimeType: r.blob.type, sizeBytes: bytes.byteLength, slides: r.slides } }, [bytes])
            } catch (err) {
              if (reqId) emitEmbedEvent('result', { requestId: reqId, ok: false, error: err instanceof Error ? err.message : String(err) })
            }
          })()
          break
        }
        case 'ifcviewer:close-cover':
          void respond(() => { useCoverStudioStore.getState().setOpen(false); return null })
          break
        // ── Scene groups (SDK 1.13) ────────────────────────────────────────
        // Same store and the same inferred grouping the Scene panel shows; a
        // group made by a host is a group the visitor can see and rename.
        case 'ifcviewer:get-groups':
          void respond(() => groupsOut(modelGroupsRef.current))
          break
        case 'ifcviewer:create-group': {
          void respond(() => {
            const name = typeof msg.name === 'string' ? msg.name.trim() : ''
            if (!name) throw new Error('A group needs a name')
            const ids = Array.isArray(msg.modelIds) ? msg.modelIds.filter((x): x is string => typeof x === 'string') : []
            const models = useSceneStore.getState().models
            const keys = ids.map((id) => {
              const m = models.find((x) => x.id === id)
              if (!m) throw new Error(`No model "${id}"`)
              return modelFileKey(m)
            })
            const id = useSceneGroupStore.getState().createGroup(name, keys)
            return { id }
          })
          break
        }
        case 'ifcviewer:rename-group': {
          void respond(() => {
            const g = findUserGroup(msg.groupId)
            const name = typeof msg.name === 'string' ? msg.name.trim() : ''
            if (!name) throw new Error('A group needs a name')
            useSceneGroupStore.getState().renameGroup(g.id, name)
            return null
          })
          break
        }
        case 'ifcviewer:delete-group':
          void respond(() => { useSceneGroupStore.getState().deleteGroup(findUserGroup(msg.groupId).id); return null })
          break
        case 'ifcviewer:assign-group': {
          void respond(() => {
            const id = typeof msg.itemId === 'string' ? msg.itemId : ''
            const to = msg.groupId === null ? null : msg.groupId === 'loose' ? LOOSE : findUserGroup(msg.groupId).id
            const model = useSceneStore.getState().models.find((m) => m.id === id)
            if (model) { useSceneGroupStore.getState().assignModel(modelFileKey(model), to); return null }
            const cloud = usePointCloudStore.getState().clouds.find((c) => c.id === id)
            if (cloud) { useSceneGroupStore.getState().assignCloud(cloud.fileKey, to); return null }
            throw new Error(`No model or point cloud "${id}"`)
          })
          break
        }
        case 'ifcviewer:group-visible':
        case 'ifcviewer:isolate-group': {
          void respond(() => {
            const groups = modelGroupsRef.current.groups
            const isolate = msg.type === 'ifcviewer:isolate-group'
            const target = msg.groupId === null && isolate ? null : groups.find((g) => g.id === msg.groupId)
            if (target === undefined) throw new Error(`No group "${String(msg.groupId)}" — see getGroups()`)
            const scene = useSceneStore.getState()
            const api = viewerApiRef.current
            for (const m of scene.models) {
              const inGroup = !!target && target.memberIds.includes(m.id)
              const visible = isolate ? (target === null || inGroup) : (inGroup ? msg.visible !== false : m.visible)
              if (visible !== m.visible) {
                scene.setModelVisible(m.id, visible)
                api?.setModelVisible(m.id, visible)
              }
            }
            const f = filtersRef.current
            api?.applyFilters(f.hidden, f.isolated, f.hiddenElements, f.isolatedElement, f.isolatedElementModel)
            return null
          })
          break
        }
        case 'ifcviewer:frame-group': {
          void respond(() => {
            const g = modelGroupsRef.current.groups.find((x) => x.id === msg.groupId)
            if (!g) throw new Error(`No group "${String(msg.groupId)}" — see getGroups()`)
            const ok = viewerApiRef.current?.frameItems([...g.memberIds, ...g.cloudIds])
            if (!ok) throw new Error('That group has nothing to frame')
            return null
          })
          break
        }
        case 'ifcviewer:remove-model': {
          const modelId = typeof msg.modelId === 'string' ? msg.modelId : null
          if (modelId) void handleRemoveModel(modelId)
          break
        }
        case 'ifcviewer:hide-elements':
        case 'ifcviewer:show-elements': {
          const raw = Array.isArray(msg.expressIds) ? msg.expressIds : []
          const ids = raw.map(Number).filter((n) => Number.isFinite(n) && n > 0)
          const modelId = typeof msg.modelId === 'string' ? msg.modelId : useSceneStore.getState().activeModelId
          if (ids.length && modelId) {
            const decompMap = useValidationStore.getState().decompMaps[modelId]
            const expanded = ids.flatMap((id) => expandWithDecomp(id, decompMap))
            useUIStore.getState().setElementsVisible(expanded, msg.type === 'ifcviewer:show-elements', modelId)
          }
          break
        }
        case 'ifcviewer:camera': {
          const p = msg.position as { x: number; y: number; z: number } | undefined
          const d = msg.direction as { x: number; y: number; z: number } | undefined
          if (p && d && typeof p === 'object' && typeof d === 'object') {
            viewerApiRef.current?.setCameraViewpoint(p, d)
          }
          break
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadModelsFromUrls, loadModelFromBytes, handleRemoveModel, handleRestoreVisibility])

  // (model-progress is relayed per job from the loading hooks — onProgress.)

  // ── Apply select / isolate deep-link actions once the first model is loaded ─
  useEffect(() => {
    if (urlActionsAppliedRef.current) return
    if (loadingState !== 'loaded' || sceneModels.length === 0) return
    urlActionsAppliedRef.current = true
    if (urlParams.select == null && !urlParams.isolate) return
    // Defer a tick so the freshly-loaded model is fully wired into the viewer.
    const timer = setTimeout(() => {
      if (urlParams.isolate) {
        handleSetIsolatedCategory(urlParams.isolate)
        viewerRef.current?.frameCategory(urlParams.isolate)
      }
      if (urlParams.select != null) {
        viewerApiRef.current?.selectElement(urlParams.select)
        viewerApiRef.current?.focusElement(urlParams.select)
      }
    }, 350)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingState, sceneModels.length])

  // ── Apply the map / scan deep links once the first model is loaded ─────────
  //
  // The map goes through the same `sdk:site` command the SDK uses (the
  // georeference ladder lives in its panel); the scans are URL jobs in the
  // loading queue, like the SDK's addPointCloudFromUrl.
  //
  // They wait for a model because neither means anything without one — the map
  // has nothing to place, and a scan would have nothing to align against.
  useEffect(() => {
    if (urlSceneAppliedRef.current) return
    if (loadingState !== 'loaded' || sceneModels.length === 0) return
    if (!urlParams.map && urlParams.scanUrls.length === 0) return
    urlSceneAppliedRef.current = true

    let cancelled = false

    // Two independent chains, NOT one sequence. Turning on OSM surroundings
    // awaits an Overpass query that routinely takes half a minute; running the
    // scan behind it meant a link with both looked like the scan had silently
    // failed for as long as the map took.
    if (urlParams.map) {
      const wanted = urlParams.map
      void (async () => {
        try {
          await dispatchPanelCommand('sdk:site', {
            enabled:   wanted.enabled,
            terrain:   wanted.terrain,
            buildings: wanted.buildings,
            detail:    wanted.detail,
            look:      wanted.look,
            lookTo:    wanted.lookTo,
          }, {
            // Two different failures wearing one message cost a debugging
            // session: the build flag being off, and the panel simply not
            // having mounted yet on a cold load. Only the flag can be checked,
            // so say which one this is.
            unavailable: isGisEnabled()
              ? 'Map mode did not come up in time'
              : 'Map mode is not available in this build',
            timeoutMs: 120_000,
            subscriberTimeoutMs: 60_000,
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[App] ?map= deep link failed:', message)
          if (!cancelled) toast(tToasts('model.mapFailed', { message }), 'error')
        }
      })()
    }

    // The scans are one batch of URL jobs: downloaded in the network lane with
    // real progress, decoded in the decode lane (the resident-point budget
    // decides who waits), aligned against the model once it is in. A failure
    // is toasted by the loading hooks, like any other scan's.
    if (urlParams.scanUrls.length > 0) {
      if (canLoadKind('pointcloud')) {
        // The same URL twice in the link, or a scan the page already holds,
        // is loaded once.
        void loadPointCloudsOnce(urlParams.scanUrls.map((url) => ({
          source: { type: 'url', url, fileName: deriveScanFileName(url) },
        })), { origin: 'url' })
      } else {
        toast(tToasts('model.scanLoadFailed', { message: 'Point clouds are not available in this build' }), 'error')
      }
    }

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingState, sceneModels.length])

  // The capture toolbar normally hands Clip Studio the viewer. When App mounts
  // the studio itself (no toolbar: kiosk, client) it has to do the same, or
  // every shot fails with "open a model".
  const studioViewerOwner = useRef({})
  const studioStandalone = clipStudioOpen && !effectiveChrome.showToolbar && tourMode !== 'playing'
  useEffect(() => {
    if (!studioStandalone) return
    const owner = studioViewerOwner.current
    linkViewer(owner, viewerApiRef.current)
    return () => linkViewer(owner, null)
  }, [studioStandalone])

  // ── SDK tours: autoplay and relayed progress (SDK 1.12) ───────────────────
  // Autoplay here rather than in the TourPlayer: the player's own toggle is
  // local UI state, and a host that asked for a self-running tour on a blog
  // should not depend on it. Ends the tour after the last step.
  const [sdkTourAutoplay, setSdkTourAutoplay] = useState<number | null>(null)
  const tourStepIndex = usePresentationStore((s) => s.stepIndex)
  useEffect(() => {
    if (sdkTourAutoplay === null || tourMode !== 'playing') return
    const id = window.setTimeout(() => {
      const st = usePresentationStore.getState()
      const total = st.tour?.steps.length ?? 0
      if (st.stepIndex >= total - 1) { st.exitPlayback(); setSdkTourAutoplay(null) }
      else st.setStepIndex(st.stepIndex + 1)
    }, sdkTourAutoplay)
    return () => window.clearTimeout(id)
  }, [sdkTourAutoplay, tourMode, tourStepIndex])
  useEffect(() => { if (tourMode !== 'playing') setSdkTourAutoplay(null) }, [tourMode])

  useEffect(() => {
    if (!isEmbedded()) return
    let prev = usePresentationStore.getState()
    const offTour = usePresentationStore.subscribe((s) => {
      const was = prev
      prev = s
      const caption = (st: typeof s) => st.tour?.steps[st.stepIndex]?.caption ?? null
      const total = s.tour?.steps.length ?? 0
      if (s.mode === 'playing' && was.mode !== 'playing') {
        emitEmbedEvent('tour-started', { title: s.tour?.title ?? '', total, template: s.templateId })
        emitEmbedEvent('tour-step', { index: s.stepIndex, total, caption: caption(s) })
      } else if (s.mode === 'playing' && (s.stepIndex !== was.stepIndex || s.tour !== was.tour)) {
        emitEmbedEvent('tour-step', { index: s.stepIndex, total, caption: caption(s) })
      } else if (s.mode !== 'playing' && was.mode === 'playing') {
        emitEmbedEvent('tour-ended', { completed: was.stepIndex >= (was.tour?.steps.length ?? 0) - 1 })
      }
    })
    let lastJob: string | null = null
    const offStudio = useClipStudioStore.subscribe((s) => {
      const key = s.job ? `${s.job.label}:${Math.round((s.job.progress ?? 0) * 100)}` : null
      if (key === lastJob) return
      lastJob = key
      if (s.job) emitEmbedEvent('presentation-progress', { stage: 'generate', label: s.job.label, progress: s.job.progress })
    })
    return () => { offTour(); offStudio() }
  }, [])

  // ── Relay walk mode and measurements to an embedding parent (SDK 1.11) ─────
  // Both change from inside the viewer (a key, a click), so a host that drew
  // its own "walking" badge or a table of measurements would otherwise have to
  // poll. Bound once a model is in: the viewer's systems exist from then on.
  useEffect(() => {
    if (!isEmbedded() || !hasSceneModels) return
    const api = viewerApiRef.current
    if (!api) return
    let lastWalk = api.getWalkState().active
    const offWalk = api.onWalkStateChange((s) => {
      if (s.active === lastWalk) return   // speed / pointer-lock chatter
      lastWalk = s.active
      emitEmbedEvent('walk-changed', walkStateOut(s))
    })
    const measure = api.getMeasure()
    // The snapshot is rebuilt on every change (tool, draft point), so compare
    // what a host sees rather than the array.
    const keyOf = (): string => measure.getSnapshot().items
      .map((m) => `${m.id}:${m.name ?? ''}:${m.kind === 'point' ? m.coords.x : m.value}`).join('|')
    let lastKey = keyOf()
    const offMeasure = measure.subscribe(() => {
      const key = keyOf()
      if (key === lastKey) return
      lastKey = key
      emitEmbedEvent('measurements-changed', measurementsOut(api))
    })
    return () => { offWalk(); offMeasure() }
  }, [hasSceneModels])

  // ── Relay element selection to an embedding parent (CDE integration) ───────
  useEffect(() => {
    if (!selected) return
    emitEmbedEvent('element-selected', {
      expressId: Number(selected.id),
      modelId:   selected.modelId ?? null,
      ifcType:   selected.type,
      name:      selected.name,
    })
  }, [selected])

  // ── Legend data — merged across all loaded models ────────────────────────
  // Single model: active model's categories (elementIds intact for drill-down).
  // Multi-model: deduplicate by IFC type, sum counts; per-model breakdown in
  // CategoryRow uses sceneModels directly so elementIds are not needed here.
  const legendCategories = useMemo((): Category[] => {
    if (sceneModels.length <= 1) {
      return (
        sceneModels.find((m) => m.id === activeModelId)?.categories ??
        modelInfo?.categories ?? []
      )
    }
    const map = new Map<string, Category>()
    for (const m of sceneModels) {
      for (const cat of m.categories) {
        const ex = map.get(cat.id)
        if (!ex) {
          map.set(cat.id, { ...cat, elementIds: [] })
        } else {
          ex.count += cat.count
        }
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [sceneModels, activeModelId, modelInfo])

  const legendElementCount = useMemo(
    () =>
      sceneModels.length > 0
        ? sceneModels.reduce((sum, m) => sum + m.elementCount, 0)
        : (modelInfo?.elementCount ?? 0),
    [sceneModels, modelInfo],
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {/* ── Shared report view (URL hash route) ── */}
        {route === 'report' && sharedReport && (
          <motion.div
            key="report"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <SharedReportView
              payload={sharedReport}
              onOpenViewer={() => {
                // Strip the report hash and navigate to landing
                history.replaceState(null, '', window.location.pathname + window.location.search)
                setSharedReport(null)
                setRoute('landing')
              }}
            />
          </motion.div>
        )}

        {route === 'verify' && (
          <motion.div
            key="verify"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <VerifyCertificateView hash={verifyHash} onNavigateToLanding={handleNavigateToLanding} />
          </motion.div>
        )}

        {route === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <WelcomeView onStart={handleNavigateToLanding} theme={landingTheme} />
          </motion.div>
        )}

        {route === 'ebook' && (
          <motion.div
            key="ebook"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <React.Suspense fallback={null}>
              <LazyEbookView onNavigateToLanding={handleNavigateToLanding} book={ebookByRoute(ebookRoute)} />
            </React.Suspense>
          </motion.div>
        )}

        {(route === 'signin' || route === 'signup' || route === 'account') && (
          <motion.div
            key="auth-page"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <React.Suspense fallback={null}>
              <LazyAuthPage
                kind={route}
                theme={landingTheme}
                onNavigateHome={handleNavigateToLanding}
                onNavigateWelcome={() => {
                  history.replaceState(null, '', '/welcome')
                  setRoute('welcome')
                }}
              />
            </React.Suspense>
          </motion.div>
        )}

        {route === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <DashboardView
              onNavigateHome={handleNavigateToLanding}
              onOpenViewer={handleNavigateToLanding}
              onNavigate={handleSpaNavigate}
              isAdmin={isSupremeAdmin}
              theme={landingTheme}
            />
          </motion.div>
        )}

        {route === 'admin' && (
          <motion.div
            key="admin"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <AdminView
              onBack={() => handleSpaNavigate('/dashboard')}
              authorized={isSupremeAdmin}
              theme={landingTheme}
            />
          </motion.div>
        )}

        {route === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
          >
            <Landing
              onLaunch={handleLaunch}
              onOpenUpload={handleOpenUpload}
              onOpenDemoGallery={handleOpenDemoGallery}
              onNavigateToBlog={handleNavigateToBlog}
              onNavigateToPrivacy={handleNavigateToPrivacy}
              onNavigateToTerms={handleNavigateToTerms}
              landingTheme={landingTheme}
              onToggleLandingTheme={handleToggleLandingTheme}
            />
          </motion.div>
        )}

        {route === 'blog' && (
          <motion.div
            key="blog"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <Blog
              slug={blogSlug}
              lang={blogLang}
              onNavigateToPost={handleNavigateToBlogPost}
              onNavigateToBlog={handleNavigateFromBlogToList}
              onNavigateToLanding={handleNavigateToLanding}
              landingTheme={landingTheme}
              onToggleLandingTheme={handleToggleLandingTheme}
            />
          </motion.div>
        )}

        {route === 'privacy' && (
          <motion.div
            key="privacy"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <PrivacyPolicy onNavigateToLanding={handleNavigateToLanding} />
          </motion.div>
        )}

        {route === 'terms' && (
          <motion.div
            key="terms"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <TermsOfUse onNavigateToLanding={handleNavigateToLanding} />
          </motion.div>
        )}

        {route === 'viewer' && (
          <motion.div
            key="viewer"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-[var(--bg)] flex flex-col"
          >
            {effectiveChrome.showToolbar && (
              // Phones: the toolbar floats over the scene (capsules, see
              // Toolbar) instead of taking a 44px band; the scene gets the
              // whole screen. Overlays anchored to the top of the viewport
              // clear it with --mobile-top-ui (index.css).
              <div className="flex-none z-20 max-md:absolute max-md:inset-x-0 max-md:top-0 max-md:z-[25] max-md:pointer-events-none">
                {/* Show the active model's name; fall back to last-loaded when only one model exists */}
                {(() => {
                  const activeEntry = sceneModels.find((m) => m.id === activeModelId)
                  const displayName  = activeEntry?.fileName  ?? modelInfo?.fileName   ?? null
                  const displayCount = activeEntry?.elementCount ?? modelInfo?.elementCount ?? 0
                  return (
                    <Toolbar
                      fileName={displayName}
                      elementCount={displayCount}
                      // Models already in the scene stay usable while others load;
                      // the loading indicator in the toolbar carries that activity.
                      loadingState={sceneModels.length > 0 ? 'loaded' : loadingState}
                      canIsolate={!!selected}
                      viewerApiRef={viewerApiRef}
                      onReset={() => viewerRef.current?.resetCamera()}
                      onIsolate={handleIsolate}
                      onUpload={openUploadModal}
                      onOpenDemoGallery={openDemoGallery}
                      onOpenExportModal={() => setShowExportModal(true)}
                      onOpenEmbed={() => setShowEmbedModal(true)}
                      onOpenIds={() => setShowIdsModal(true)}
                      onOpenCompare={() => setShowCompareModal(true)}
                      onOpenHelp={() => setShowHelp(true)}
                    />
                  )
                })()}
              </div>
            )}

            <PanelGroup
              orientation="horizontal"
              className="flex flex-1 overflow-hidden"
              style={{ height: '100%' }}
            >

              {/* Tree panel: only mounted on desktop — react-resizable-panels
                  allocates the Panel's flex share even when content is hidden,
                  so mounting it on mobile would shrink the canvas by 22%. */}
              {/* Collapsed tree: the strip stays on its own edge, and is the
                  control that brings it back. Before this the tree simply
                  vanished and the only way back was a menu two clicks away. */}
              {!treeVisible && sceneModels.length > 0 && isDesktop && effectiveChrome.showTree && (
                <ColumnStrip
                  edge="left"
                  label={tTree('spatialTree')}
                  onExpand={() => setTreeVisible(true)}
                />
              )}

              {treeVisible && sceneModels.length > 0 && isDesktop && effectiveChrome.showTree && (
                <>
                  <Panel
                    id="tree"
                    defaultSize="22%"
                    minSize="13%"
                    maxSize="45%"
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="flex flex-col h-full bg-[var(--surface)] overflow-hidden border-r border-[var(--border)]">
                      <ModelTree
                        ref={modelTreeRef}
                        onSelectElement={handleSelectTreeElement}
                        onFocusElements={handleFocusElements}
                        onFilterBySubtree={() => {
                          useValidationStore.getState().setFilters({ ruleIds: [], search: '' })
                        }}
                        // Act on a whole model from the row that names it. The
                        // tree is the index of what is loaded, so it is where
                        // people already point at the model they mean.
                        onRemoveModel={(id) => { void handleRemoveModel(id) }}
                        onOpenScene={(id) => {
                          handleSetActiveModel(id)
                          setScenePanelOpen(true)
                        }}
                        onFrameItems={(ids) => { viewerApiRef.current?.frameItems(ids) }}
                      />
                    </div>
                  </Panel>
                  <PanelResizeHandle
                    id="tree-resize"
                    className="w-[3px] bg-[var(--border)] hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors duration-100 cursor-col-resize flex-none"
                  />
                </>
              )}

              <Panel
                id="main"
                style={{ overflow: 'hidden' }}
              >
              <div className="flex flex-col overflow-hidden relative h-full">

                <div className="flex-1 relative">
                  <Viewer
                    ref={viewerRef}
                    viewerApiRef={viewerApiRef}
                    onSelect={setSelected}
                    onContextMenu={setCtxMenu}
                    hiddenCategories={hidden}
                    isolatedCategory={isolated}
                    hiddenElementIds={hiddenElements}
                    isolatedElementId={isolatedElement}
                    isolatedElementModelId={isolatedElementModel}
                    selectedId={selected?.id ?? null}
                    viewerStyle={viewerStyle}
                  />

                  {/* First load into an empty scene: the multiphase progress
                      card, centred and non-modal (renders nothing otherwise). */}
                  {!clientMode && <FirstLoadCard />}

                  {mobileSidebarOpen && (
                    <div
                      className="md:hidden drawer-backdrop"
                      onClick={() => setMobileSidebarOpen(false)}
                    />
                  )}

                  {/* Camera preset overlay (yields to the tour bar while playing —
                      it shares the bottom edge and presets fight the tour narrative) */}
                  {(sceneModels.length > 0 || pointCloudCount > 0) && effectiveChrome.showCameraControls && tourMode !== 'playing' && (
                    <CameraControls
                      viewerApiRef={viewerApiRef}
                      visible={cameraControlsVisible}
                      onToggle={toggleCameraControls}
                    />
                  )}

                  {/* Data legend — a chip in the corner while data layers are
                      visible; the legend itself only when the viewer opens it. */}
                  {twinInUse && <TwinLabels viewerApiRef={viewerApiRef} />}
                  {vectorLayersInUse && (
                    <React.Suspense fallback={null}>
                      <DataLegend viewerApiRef={viewerApiRef} />
                      <TimeBar />
                    </React.Suspense>
                  )}

                  {/* Walk mode HUD — renders itself only while walking, and
                      reads the viewer directly (the wheel and pointer lock
                      change walk state without passing through React). */}
                  {sceneModels.length > 0 && tourMode !== 'playing' && (
                    <WalkHud viewerApiRef={viewerApiRef} />
                  )}

                  {/* Advanced overlay HUD — shown while the issue overlay is on
                      (yields while a tour is playing: the tour bar narrates instead) */}
                  {sceneModels.length > 0 && (validationMode || idsHighlightMode) && tourMode !== 'playing' && !clientMode && (() => {
                    const counts = { error: 0, warning: 0, info: 0 }
                    if (idsHighlightMode) {
                      counts.error = Object.values(idsResultsByModel).reduce(
                        (acc, r) => acc + r.specs.reduce(
                          (a, s) => a + s.failures.filter((f) => f.expressId >= 0).length, 0), 0)
                    } else {
                      for (const i of (result?.issues ?? [])) counts[i.severity]++
                    }
                    return (
                      <OverlayHud
                        viewerApiRef={viewerApiRef}
                        channel={idsHighlightMode ? 'ids' : 'validation'}
                        counts={counts}
                      />
                    )
                  })()}

                  {/* Model info / weight panel — always shows the active model's data
                      (hidden while a tour plays: it sits exactly where the tour bar goes,
                      and file size / GPU stats are noise for a presentation audience) */}
                  {/* Not on phones: its name/size facts now live in the top model
                      capsule and the Scene panel it opens; GPU and memory stats
                      are noise on a phone and the pill took a band above the nav. */}
                  {isDesktop && sceneModels.length > 0 && tourMode !== 'playing' && !clientMode && effectiveChrome.showModelInfo && (() => {
                    const displayInfo =
                      sceneModels.find((m) => m.id === activeModelId) ?? modelInfo
                    return displayInfo ? (
                      <ModelInfoPanel
                        modelInfo={displayInfo}
                        modelId={activeModelId ?? undefined}
                        memoryStats={memoryStats}
                        isFromCache={activeFromCache}
                        qualityScore={result?.qualityScore}
                        gpuBackend={gpuBackend}
                      />
                    ) : null
                  })()}

                  {/* The minimised form of every floating panel: a rail of
                      icons on the right edge, panels opening to its left.
                      docs/PANEL_RAIL.md. Only with a model — with an empty
                      viewport there is nothing for any of them to act on. */}
                  {sceneModels.length > 0 && tourMode !== 'playing' && effectiveChrome.showRail && (
                    <div className="max-md:hidden">
                      <PanelRail items={railItems} />
                    </div>
                  )}

                  {/* Measurement panel (client mode: only via the presenter gear) */}
                  {sceneModels.length > 0 && (!clientMode || clientAdvancedTools) && (
                    <MeasurementPanel viewerApiRef={viewerApiRef} />
                  )}

                  {/* Section (clip plane) panel (client mode: only via the presenter gear) */}
                  {sceneModels.length > 0 && (!clientMode || clientAdvancedTools) && (
                    <SectionPanel viewerApiRef={viewerApiRef} />
                  )}

                  {/* Floor plan panel (hidden in the client skin) */}
                  {sceneModels.length > 0 && !clientMode && (
                    <FloorPlanPanel viewerApiRef={viewerApiRef} />
                  )}

                  {/* GIS map panel (flag-gated, lazy — pulls proj4 + geo code) */}
                  {isGisEnabled() && sceneModels.length > 0 && !clientMode && (
                    <React.Suspense fallback={null}>
                      <GeoPanel viewerApiRef={viewerApiRef} />
                    </React.Suspense>
                  )}

                  {/* Sun & Moon study panel (flag-gated, lazy — pulls suncalc/tz-lookup).
                      Client mode (D-25) gets the simplified variant — preset cards
                      first, no numeric UI — instead of being hidden: sun studies
                      are a stakeholder-presentation feature by design. */}
                  {isSolarEnabled() && sceneModels.length > 0 && (
                    <React.Suspense fallback={null}>
                      <SolarPanel viewerApiRef={viewerApiRef} variant={clientMode ? 'client' : 'technical'} />
                    </React.Suspense>
                  )}

                  {/* Solar & climate analysis: sun hours, irradiation, EN 17037,
                      the site's climate. Technical audiences only. */}
                  {isSolarEnabled() && sceneModels.length > 0 && !clientMode && (
                    <React.Suspense fallback={null}>
                      <SolarAnalysisPanel viewerApiRef={viewerApiRef} />
                    </React.Suspense>
                  )}

                  {/* Point cloud panel (flag-gated, lazy — pulls the point engine).
                      Available with no IFC loaded too: a scan on its own is a
                      legitimate thing to open. */}
                  {isPointCloudEnabled() && !clientMode && (
                    <React.Suspense fallback={null}>
                      <PointCloudPanel
                        viewerApiRef={viewerApiRef}
                        onLoadCompanionModel={handleLoadVideoCompanion}
                      />
                    </React.Suspense>
                  )}
                  {/* Same treatment as scans: an imported model is legitimate
                      with no IFC loaded, and hidden in client presentation mode
                      where the audience is not placing anything. */}
                  {isMeshEnabled() && !clientMode && (
                    <React.Suspense fallback={null}>
                      <MeshPanel
                        viewerApiRef={viewerApiRef}
                        activeModelId={activeModelId}
                        onClose={() => useMeshStore.getState().setPanelOpen(false)}
                      />
                    </React.Suspense>
                  )}
                  {vectorLayersInUse && (
                    <React.Suspense fallback={null}>
                      <VectorLayersPanel
                        viewerApiRef={viewerApiRef}
                        onClose={() => useVectorLayerStore.getState().setPanelOpen(false)}
                      />
                    </React.Suspense>
                  )}
                  {twinInUse && !clientMode && (
                    <React.Suspense fallback={null}>
                      <TwinDevicesPanel
                        selected={selected}
                        onClose={() => useTwinDeviceStore.getState().setPanelOpen(false)}
                      />
                    </React.Suspense>
                  )}
                  {isVideoEnabled() && !clientMode && (
                    <React.Suspense fallback={null}>
                      <VideoPanel
                        viewerApiRef={viewerApiRef}
                        companionLoaded={sceneModels.some((model) => model.fileName === 'IVO-Operations-Pavilion.ifc')}
                        onLoadCompanionModel={handleLoadVideoCompanion}
                        onClose={() => useVideoStore.getState().setPanelOpen(false)}
                      />
                    </React.Suspense>
                  )}

                  {/* Scene panel (model list + transform — never in the client skin) */}
                  {scenePanelOpen && !clientMode && (
                    <ScenePanel
                      models={sceneModels}
                      activeModelId={activeModelId}
                      transformMode="none"
                      viewerApiRef={viewerApiRef}
                      onSetActive={handleSetActiveModel}
                      onSetVisible={(id, v) => {
                        setSceneModelVisible(id, v)
                        viewerApiRef.current?.setModelVisible(id, v)
                        if (v) {
                          // Re-apply per-element/category filters immediately after
                          // un-hiding a model so hidden elements stay hidden.
                          viewerApiRef.current?.applyFilters(
                            hidden, isolated, hiddenElements, isolatedElement, isolatedElementModel,
                          )
                        }
                      }}
                      onTransformMode={() => {}}
                      onRemove={(id) => { void handleRemoveModel(id) }}
                      onValidate={(id) => { void validation.run(undefined, id, true) }}
                      onFrame={(id) => { handleSetActiveModel(id); viewerApiRef.current?.frameActiveModel() }}
                      onIsolate={(id) => { handleSetActiveModel(id) }}
                      onShowAll={() => { /* visibility already restored by ScenePanel */ }}
                      onClose={() => setScenePanelOpen(false)}
                    />
                  )}

                  {effectiveChrome.showSidebar && (
                    <Sidebar
                      categories={legendCategories}
                      elementCount={legendElementCount}
                      sceneModels={sceneModels}
                      selected={selected}
                      hidden={hidden}
                      onToggleHidden={handleToggleHidden}
                      isolated={isolated}
                      onSetIsolated={handleSetIsolatedCategory}
                      onFrame={(id) => viewerRef.current?.frameCategory(id)}
                      onSelectElement={(id) => viewerApiRef.current?.selectElement(id)}
                      onFrameElement={handleFrameElement}
                      onRevealInTree={handleRevealInTree}
                      viewerApiRef={viewerApiRef}
                      mobileOpen={mobileSidebarOpen}
                      onMobileClose={() => setMobileSidebarOpen(false)}
                    />
                  )}

                  {/* Spatial tree on a phone: the desktop column cannot fit, so the
                      same tree opens as a sheet (Tools → Tree). Picking an element
                      closes it so the selection is visible in the model. */}
                  {!isDesktop && sceneModels.length > 0 && effectiveChrome.showTree && (
                    <MobileSheet open={treeVisible} onClose={() => setTreeVisible(false)} label={tTree('spatialTree')} snapPoints={[0.55, 0.92]}>
                      <div className="flex flex-col h-full min-h-0 overflow-hidden">
                        <ModelTree
                          onSelectElement={(...args: Parameters<typeof handleSelectTreeElement>) => { handleSelectTreeElement(...args); setTreeVisible(false) }}
                          onFocusElements={handleFocusElements}
                          onFilterBySubtree={() => { useValidationStore.getState().setFilters({ ruleIds: [], search: '' }) }}
                          onRemoveModel={(id) => { void handleRemoveModel(id) }}
                          onOpenScene={(id) => { handleSetActiveModel(id); setTreeVisible(false); setScenePanelOpen(true) }}
                          onFrameItems={(ids) => { viewerApiRef.current?.frameItems(ids) }}
                        />
                      </div>
                    </MobileSheet>
                  )}

                  {effectiveChrome.showHome && (
                    <button
                      onClick={handleNavigateToLanding}
                      className="max-md:hidden absolute top-3 left-3 z-[9] h-[30px] min-w-[30px] px-3 bg-[rgba(16,16,20,0.82)] backdrop-blur-[14px] border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[12px] font-medium flex items-center gap-1.5 hover:text-[var(--text)] transition-colors"
                    >
                      <Icons.Chevron size={12} className="rotate-180" />
                      <span className="hidden xs:inline">{tCommon('actions.home')}</span>
                    </button>
                  )}

                  {/* ── Tour Mode (D-24): recorder panel + playback bar.
                      Mounted INSIDE the viewer container so they position
                      relative to the 3D viewport (never over tree/sidebar). ── */}
                  {tourMode === 'recording' && (
                    <React.Suspense fallback={null}>
                      <TourRecorder viewerApiRef={viewerApiRef} />
                    </React.Suspense>
                  )}

                  {/* ── Client presentation skin (D-25) — badge + CTA + gear.
                      Exit is only offered when the presenter toggled the mode
                      in-app; a ?ui=client link receiver stays in the skin. ── */}
                  {clientMode && sceneModels.length > 0 && (
                    <React.Suspense fallback={null}>
                      <ClientPresentationLayout viewerApiRef={viewerApiRef} canExit={!embedChrome.embed} />
                    </React.Suspense>
                  )}
                  {/* Clip Studio normally hangs off the toolbar's capture menu (or the
                      tour bar). With no toolbar — kiosk, client — nothing would
                      mount it, and an SDK createPresentation() would wait forever. */}
                  {coverStudioOpen && !effectiveChrome.showToolbar && tourMode !== 'playing' && (
                    <React.Suspense fallback={null}>
                      <CoverStudioModal viewerApiRef={viewerApiRef} onClose={() => useCoverStudioStore.getState().setOpen(false)} />
                    </React.Suspense>
                  )}

                  {clipStudioOpen && !effectiveChrome.showToolbar && tourMode !== 'playing' && (
                    <React.Suspense fallback={null}>
                      <ClipStudio />
                    </React.Suspense>
                  )}

                  {tourMode === 'playing' && (
                    <React.Suspense fallback={null}>
                      <TourPlayer
                        viewerApiRef={viewerApiRef}
                        ownsCaptureReplay={!effectiveChrome.showToolbar}
                        shareModelUrls={urlParams.modelUrls}
                      />
                    </React.Suspense>
                  )}

                  {/* ── Mobile bottom nav (only on < md; hidden in embed and
                      while a tour is playing — the tour bar takes the stage) ── */}
                  {!embedChrome.embed && tourMode !== 'playing' && !clientMode && sceneModels.length > 0 && (
                  <MobileSelectionBar
                    selected={selected}
                    suppressed={!!ctxMenu || elementCardOpen}
                    onFrame={handleFrameElement}
                    onIsolate={handleIsolateElement}
                    onHide={handleHideElement}
                    onProps={() => setElementCardOpen(true)}
                    onMore={(info) => setCtxMenu({ x: 0, y: 0, info })}
                  />
                  )}
                  {!embedChrome.embed && !clientMode && (
                  <MobileElementCard
                    open={elementCardOpen && !!selected}
                    selected={selected}
                    viewerApiRef={viewerApiRef}
                    onClose={() => setElementCardOpen(false)}
                    onFrame={handleFrameElement}
                    onIsolate={handleIsolateElement}
                    onHide={handleHideElement}
                    onIsolateCategory={handleIsolateCategory}
                    onReveal={(id, modelId) => { setElementCardOpen(false); handleRevealInTree(id, modelId) }}
                    onAllProperties={() => { setElementCardOpen(false); setPendingSidebarTab('props'); setMobileSidebarOpen(true) }}
                  />
                  )}
                  <div className="sr-only" aria-live="polite" aria-atomic="true">{selectionAnnouncement}</div>
                  {!embedChrome.embed && tourMode !== 'playing' && !clientMode && (
                  <MobileBottomNav
                    // Properties is excluded: the bottom nav already has its
                    // own tab for it, and the rail item toggles the desktop
                    // column's flag, which is not what a phone shows.
                    tools={mobileTools}
                    visible={sceneModels.length > 0}
                    selected={selected}
                    canIsolate={!!selected}
                    onOpenSidebarTab={(tab) => {
                      setPendingSidebarTab(tab)
                      setMobileSidebarOpen(true)
                    }}
                    onReset={() => viewerRef.current?.resetCamera()}
                    onUpload={openUploadModal}
                    onIsolate={handleIsolate}
                    onOpenDemoGallery={openDemoGallery}
                    onOpenExportModal={() => setShowExportModal(true)}
                    onOpenCompare={() => setShowCompareModal(true)}
                    onGoHome={effectiveChrome.showHome ? handleNavigateToLanding : undefined}
                    onOpenHelp={() => setShowHelp(true)}
                    viewerApiRef={viewerApiRef}
                  />
                  )}
                </div>

                {/* Coordinator/exporter panels — never mount in the client skin (D-25) */}
                {!clientMode && effectiveChrome.showValidation && (
                  <>
                    <IdsPanel viewerApiRef={viewerApiRef} onOpenLoader={() => setShowIdsModal(true)} />
                    <ValidationPanel onJumpToElement={handleJumpToElement} viewer={viewerRef.current} />
                  </>
                )}
              </div>
              </Panel>
            </PanelGroup>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Export modal ── */}
      {showExportModal && (
        <ExportModal
          viewerApiRef={viewerApiRef}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* ── Embed snippet generator ── */}
      {showEmbedModal && (
        <EmbedModal
          defaultModelUrl={urlParams.modelUrls[0]}
          defaultLang={i18n.language}
          onClose={() => setShowEmbedModal(false)}
        />
      )}

      {/* ── IDS check ── */}
      {showIdsModal && (
        <IdsModal onClose={() => setShowIdsModal(false)} />
      )}

      {/* ── Version comparison (sets of IFCs, IDS across versions, BCF sync) ── */}
      {showCompareModal && (
        <React.Suspense fallback={null}>
          <CompareModal onClose={() => setShowCompareModal(false)} viewerApiRef={viewerApiRef} />
        </React.Suspense>
      )}

      {/* ── EIR / BIM Validation profile editor ── */}
      {eirEditorOpen && (
        <EirProfileEditor onClose={() => useEirStore.getState().setEditorOpen(false)} />
      )}

      {/* ── Keyboard help modal ── */}
      <KeyboardHelpModal open={showHelp} onClose={() => setShowHelp(false)} />

      {/* ── Demo model gallery ── */}
      <DemoGallery
        open={showDemoGallery}
        onClose={() => setShowDemoGallery(false)}
        onModelReady={handleDemoModelReady}
        onSetSelected={handleDemoSetSelected}
      />

      {/* ── 3D scene context menu (right-click on an element) —
          suppressed in the client skin (no edit affordances, D-25) ── */}
      <SceneContextMenu
        payload={clientMode ? null : ctxMenu}
        onClose={() => setCtxMenu(null)}
        onFrame={handleFrameElement}
        onHide={handleHideElement}
        onIsolateElement={handleIsolateElement}
        onIsolateCategory={handleIsolateCategory}
        onReveal={handleRevealInTree}
        hiddenCount={hiddenElements.size}
        isolationActive={isolatedElement != null}
        onShowAllHidden={handleRestoreVisibility}
      />

      {/* ── Upload modal ── */}
      <AnimatePresence>
        {showUpload && (
          <UploadOverlay
            onClose={() => { setShowUpload(false); setUploadInitial(null); releaseDeferredDrop() }}
            onOpenDemoGallery={openDemoGallery}
            initialFiles={uploadInitial ?? undefined}
            initialOrigin={uploadInitial ? 'drop' : undefined}
            onNonIfcFiles={routeDroppedFiles}
          />
        )}
      </AnimatePresence>

      {/* ── Loading Center (popover on desktop, sheet on mobile; portals itself) ── */}
      {/* Quiet presets (kiosk, article) leave progress to the host: it gets
          model-progress events, and a figure is no place for a load panel. */}
      {route === 'viewer' && !effectiveChrome.quiet && <LoadingCenter anchor={effectiveChrome.showToolbar ? 'toolbar' : 'floating'} />}

      {/* ── Loading indicator for presets without a toolbar (kiosk, client) ── */}
      {route === 'viewer' && !effectiveChrome.showToolbar && !effectiveChrome.quiet && <LoadingIndicator variant="floating" />}

      {/* ── OPFS cache badge (yields its corner to the floating loading indicator) ── */}
      {/* Viewer only: on the blog and landing it sat in the corner of every
          article as "2 cached", which means nothing to a reader. */}
      {opfsAvailable && cacheEntries.length > 0 && route === 'viewer' && !effectiveChrome.quiet
        && !(!effectiveChrome.showToolbar && hasLoadHistory) && (
        <div
          title={tViewer('cache.tooltip', { count: cacheEntries.length })}
          onClick={() => { void Promise.all(cacheEntries.map((e) => deleteFromCache(e.key))) }}
          className="max-md:hidden fixed left-4 z-50 px-2.5 py-1 bg-[rgba(16,16,20,0.82)] backdrop-blur border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[11px] cursor-pointer hover:text-[var(--text)] transition-colors select-none"
          style={{ bottom: `max(calc(var(--mobile-nav-h) + var(--mobile-nav-margin) + env(safe-area-inset-bottom, 0px) + 8px), 16px)` }}
        >
          {activeFromCache ? tViewer('cache.fromCache') : tViewer('cache.cached', { count: cacheEntries.length })}
        </div>
      )}

      {/* ── Personalized invite — dedicated welcome (referral / standards) ── */}
      {route === 'landing' && invite && shouldShowInviteView(invite, { dismissed: inviteViewDismissed }) && (
        <InviteView
          context={invite}
          onOpenFile={() => { dismissInviteView(); handleOpenUpload() }}
          onOpenDemo={() => { dismissInviteView(); handleOpenDemoGallery() }}
          onDismiss={dismissInviteView}
        />
      )}

      {/* ── Personalized invite — slim ribbon (everyone else, desktop) ── */}
      {route === 'landing' && invite &&
        !shouldShowInviteView(invite, { dismissed: inviteViewDismissed }) &&
        shouldShowInviteRibbon(invite, { isMobile: !isDesktop, dismissed: inviteDismissed }) && (
        <InviteRibbon context={invite} onDismiss={dismissInvite} />
      )}

      {/* ── Personalized invite — post-aha Mom-Test nudge (viewer) ── */}
      {route === 'viewer' && invite && feedbackNudgeOpen && (
        <InviteFeedbackNudge context={invite} onDismiss={dismissFeedbackNudge} />
      )}

      {/* ── Global toast notifications ── */}
      {!(route === 'viewer' && effectiveChrome.quiet) && <ToastContainer />}
    </>
  )
}
