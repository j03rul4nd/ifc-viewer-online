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
import ValidationPanel from './components/ValidationPanel'
import ToastContainer from './components/ToastContainer'
import CameraControls from './components/CameraControls'
import ModelInfoPanel from './components/ModelInfoPanel'
import ScenePanel from './components/ScenePanel'
import MeasurementPanel from './components/MeasurementPanel'
import SectionPanel from './components/SectionPanel'
import FloorPlanPanel from './components/FloorPlanPanel'
import ExportModal from './components/ExportModal'
import KeyboardHelpModal from './components/KeyboardHelpModal'
import SceneContextMenu, { type SceneContextMenuPayload } from './components/SceneContextMenu'
import SharedReportView, { decodeReportHash } from './components/SharedReportView'
import VerifyCertificateView from './components/VerifyCertificateView'
import WelcomeView from './components/WelcomeView'
import { isAccountEnabled, useCloudAccountStore } from './stores/cloudAccountStore'

// Dedicated auth pages ride in the lazy vendor-auth chunk (they import
// @clerk/*) — loaded only when /sign-in, /sign-up or /account is visited.
const LazyAuthPage = React.lazy(() => import('./components/account/AuthPage'))
import type { SharedReportPayload } from './components/SharedReportView'
import DemoGallery from './components/DemoGallery'
import MobileBottomNav from './components/MobileBottomNav'
import OverlayHud from './components/OverlayHud'
import Blog from './components/Blog'
import PrivacyPolicy from './components/legal/PrivacyPolicy'
import TermsOfUse from './components/legal/TermsOfUse'
import EmbedModal from './components/EmbedModal'
import IdsModal from './components/IdsModal'
import IdsPanel from './components/IdsPanel'
import EirProfileEditor from './components/eir/EirProfileEditor'
import { useEirStore } from './stores/eirStore'
import { parseEirProfile, compileEirToIds } from './lib/eir'
import InviteRibbon from './components/InviteRibbon'
import InviteView from './components/InviteView'
import InviteFeedbackNudge from './components/InviteFeedbackNudge'
// Tour Mode (D-24) — lazy: nothing loads until the user opens the recorder/player
const TourPlayer   = React.lazy(() => import('./components/TourPlayer'))
const TourRecorder = React.lazy(() => import('./components/TourRecorder'))
// Client presentation skin (D-25) — lazy: loads only when ui=client / toggled on
const ClientPresentationLayout = React.lazy(() => import('./components/ClientPresentationLayout'))
import { isGisEnabled } from './lib/geo/gis-flag'
import { isSolarEnabled } from './lib/solar/solar-flag'
import { useSolarStore } from './stores/solarStore'

// Lazy: GeoPanel statically imports proj4/placement/geo runners, which must
// stay out of the entry chunk. Only ever mounted when VITE_FEATURE_GIS is on.
const GeoPanel = React.lazy(() => import('./components/GeoPanel'))
const SolarPanel = React.lazy(() => import('./components/SolarPanel'))
import { DEFAULT_DEMO_MODEL, DEMO_FILENAMES, type DemoModel } from './demo-models/models'
import { fetchDemoModel } from './demo-models/fetchDemoModel'
import { lighten } from './lib/utils'
import { modelRegistry } from './lib/model-registry'
import { expandWithDecomp } from './lib/visibility'
import { useIfcLoader } from './lib/loader'
import { publishAggregateResult } from './lib/validator'
import { useEditorHistory } from './hooks/useEditorHistory'
import { useValidationRunner } from './hooks/useValidationRunner'
import { useElementFocus } from './hooks/useElementFocus'
import { usePersistedPreferences } from './hooks/usePersistedPreferences'
import { useValidationStore } from './stores/validationStore'
import { useUIStore } from './stores/uiStore'
import { useModelStore } from './stores/modelStore'
import { useEditorStore } from './stores/editorStore'
import { useSceneStore } from './stores/sceneStore'
import { useTakeoffStore } from './stores/takeoffStore'
import { useGeoStore } from './stores/geoStore'
import { useCaptureStore } from './stores/captureStore'
import { usePresentationStore } from './stores/presentationStore'
import { toast } from './stores/toastStore'
import { appBus } from './lib/event-bus'
import type { ViewerAPI } from './lib/viewer'
import type { Route, ViewerStyle, SelectedInfo, ViewerHandle, ModelInfo, Category, CameraPreset } from './types'
import * as Icons from './components/Icons'
import { useSeo } from './seo'
import i18n from './i18n/config'
import {
  parseAppUrlParams,
  resolveEmbedChrome,
  emitEmbedEvent,
  isEmbedded,
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
export interface ModelTreeHandle {
  revealElement: (expressId: number) => void
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
  useSeo()

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
      // Dedicated auth pages (F2) — only exist when accounts are enabled.
      if (isAccountEnabled()) {
        if (rel === '/sign-in' || rel.startsWith('/sign-in/')) return 'signin'
        if (rel === '/sign-up' || rel.startsWith('/sign-up/')) return 'signup'
        if (rel === '/account' || rel.startsWith('/account/')) return 'account'
      }
    }
    return 'landing'
  })

  // /verify/<cert_hash> — public certificate verification (F1). NOT in the
  // sitemap (the space of hashes is unbounded).
  const [verifyHash] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    const base = import.meta.env.BASE_URL ?? '/'
    const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
    return /^\/verify\/([^/]*)\/?$/.exec(rel)?.[1] ?? ''
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
  const [accent] = useState(() => urlParams.accent ?? '#5E6AD2')

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
      } else if (isAccountEnabled() && (rel === '/sign-in' || rel.startsWith('/sign-in/'))) {
        setRoute('signin')
      } else if (isAccountEnabled() && (rel === '/sign-up' || rel.startsWith('/sign-up/'))) {
        setRoute('signup')
      } else if (isAccountEnabled() && (rel === '/account' || rel.startsWith('/account/'))) {
        setRoute('account')
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
  const viewerRef    = useRef<ViewerHandle>(null)
  const modelTreeRef = useRef<ModelTreeHandle>(null)

  // requestId of the in-flight SDK-initiated load, echoed back so the SDK can
  // correlate its add()/addFromUrl() promise. null for app-initiated loads.
  const pendingRequestIdRef = useRef<string | null>(null)

  const prevRouteRef               = useRef<Route>(route)
  const hasTrackedFirstInteraction = useRef(false)

  // Demo gallery overlay + a flag so analytics tags demo loads as `source: 'demo'`.
  const [showDemoGallery, setShowDemoGallery] = useState(false)
  const demoLoadRef = useRef(false)

  // Size (MB) of the most recent load attempt, captured before handing the file
  // to the loader — on failure the File is out of scope in onError, and pairing
  // file_open_failed with a size is what reveals the real memory-bound ceiling.
  const lastLoadSizeMbRef = useRef<number | null>(null)

  // ── Shared-report route — decode on mount if URL hash contains #report=... ──
  const [sharedReport, setSharedReport] = useState<SharedReportPayload | null>(() => {
    if (typeof window === 'undefined') return null
    return decodeReportHash(window.location.hash)
  })

  // Model & loading state
  const [modelInfo,    setModelInfo]    = useState<ModelInfo | null>(null)
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loadError,    setLoadError]    = useState<string | null>(null)

  // Viewer interaction state
  const [viewerStyle] = useState<ViewerStyle>('shaded')
  const [selected,   setSelected]   = useState<SelectedInfo | null>(null)
  const [hidden,     setHidden]     = useState<Set<string>>(new Set())
  const [isolated,   setIsolated]   = useState<string | null>(null)
  // Single-element isolation (localId). Overrides category filters in the viewer.
  const [isolatedElement,      setIsolatedElement]      = useState<number | null>(null)
  const [isolatedElementModel, setIsolatedElementModel] = useState<string | null>(null)
  const [showUpload, setShowUpload]           = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showEmbedModal, setShowEmbedModal]   = useState(false)
  const [showIdsModal, setShowIdsModal]       = useState(false)
  const eirEditorOpen = useEirStore((s) => s.editorOpen)
  const [showHelp,   setShowHelp]             = useState(false)
  const [ctxMenu,    setCtxMenu]              = useState<SceneContextMenuPayload | null>(null)

  // Stores
  const { validationMode, result } = useValidationStore()
  const tourMode = usePresentationStore((s) => s.mode)
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
  const {
    treeVisible, treeWidth, hiddenElements, clearHiddenElements, setElementsVisible, clearHiddenElementsForModel,
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

  const {
    loadFile,
    progress,
    memoryStats,
    cacheEntries,
    deleteFromCache,
    isFromCache,
    opfsAvailable,
  } = useIfcLoader({
    viewerApiRef,
    onModelLoaded: (info, fromCache, modelId) => {
      setModelInfo(info)
      setLoadingState('loaded')
      setLoadError(null)
      // In embed mode the host decides whether the validation panel auto-opens
      // (the 'minimal' preset keeps it collapsed so only the 3D + score show).
      if (embedChrome.openPanel) {
        useIdsStore.getState().setPanelOpen(false) // bottom slot is exclusive with the IDS panel
        setValidationPanelOpen(true)
        trackValidationPanelOpened({ trigger: 'auto' })
      }
      // Notify an embedding parent (CDE / blog) that a model is ready. Echo the
      // SDK requestId (if this load was SDK-initiated) so it resolves the right
      // add()/addFromUrl() promise, then clear it.
      emitEmbedEvent('model-loaded', {
        modelId,
        fileName: info.fileName,
        elementCount: info.elementCount,
        fromCache,
        requestId: pendingRequestIdRef.current ?? undefined,
      })
      pendingRequestIdRef.current = null

      // Track when a second (or later) model is loaded into the scene
      if (useSceneStore.getState().models.length > 0) {
        trackFeatureUsed({ feature: 'multi_model' })
      }

      // Use the stable sceneModelId from the viewer so ScenePanel and multi-model code align
      addSceneModel(modelId, info)

      // Analytics: a demo load sets demoLoadRef; otherwise treat known demo
      // filenames as demo too (covers cached repeat loads), else it's an upload.
      const isDemo = demoLoadRef.current || DEMO_FILENAMES.has(info.fileName)
      demoLoadRef.current = false
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
      toast(
        fromCache
          ? tToasts('model.loadedFromCache', { fileName: info.fileName, count: info.elementCount })
          : tToasts('model.loaded', { fileName: info.fileName, count: info.elementCount }),
        'success',
      )
      if (urlParams.autoValidate) void validation.run(undefined, modelId)
    },
    onError: (msg) => {
      console.error('[IFC] Load error:', msg)
      setLoadingState('error')
      setLoadError(msg)
      trackFileOpenFailed({
        error_msg: msg.slice(0, 200),
        ...(lastLoadSizeMbRef.current != null ? { file_size_mb: lastLoadSizeMbRef.current } : {}),
      })
    },
  })

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

  useEffect(() => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const opts = { severities: ovSeverities, ghostOpacity: ovGhostOpacity, xray: ovXray }
    if (idsHighlightMode) {
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
  }, [validationMode, result, idsHighlightMode, idsResultsByModel, ovSeverities, ovGhostOpacity, ovXray])

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

  // ── Auto-open mobile sidebar when an element is selected ──────────────────
  // On desktop (md+) the sidebar is always visible, so no action needed there.
  useEffect(() => {
    if (selected && window.innerWidth < 768) {
      setMobileSidebarOpen(true)
    }
  }, [selected, setMobileSidebarOpen])

  // ── Track desktop breakpoint so tree Panel is never rendered on mobile ──
  // react-resizable-panels allocates the Panel's flex share even when its
  // inner content is hidden, so we must not mount the Panel at all on mobile.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent): void => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    setIsDesktop(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

  const handleFileLoad = (file: File): void => {
    setLoadingState('loading')
    setLoadError(null)
    setRoute('viewer')
    // Only reset viewer interaction state for the very first model load.
    // Loading additional models must not disturb existing selections/visibility.
    if (sceneModels.length === 0) {
      setModelInfo(null)
      setSelected(null)
      setHidden(new Set())
      setIsolated(null)
      setIsolatedElement(null)
      setIsolatedElementModel(null)
      clearHiddenElements()
    }
    lastLoadSizeMbRef.current = Math.round((file.size / 1_048_576) * 10) / 10
    void loadFile(file)
  }

  const openUploadModal = useCallback((): void => {
    if (loadingState === 'loading') return
    setShowUpload(true)
  }, [loadingState])

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

  // Global drop handler: route .ids files anywhere over the viewer to the IDS
  // flow. IFC drops still go through the explicit UploadOverlay; we only act on
  // (and preventDefault) .ids so we never interfere with that path.
  useEffect(() => {
    if (route !== 'viewer') return
    const onDragOver = (e: DragEvent): void => {
      if (Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === 'file')) e.preventDefault()
    }
    const onDrop = (e: DragEvent): void => {
      const file = e.dataTransfer?.files?.[0]
      if (file && file.name.toLowerCase().endsWith('.ids')) {
        e.preventDefault()
        void handleIdsFile(file)
      }
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [route, handleIdsFile])

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
    void (async () => {
      try {
        const file = await fetchDemoModel(DEFAULT_DEMO_MODEL)
        demoLoadRef.current = true
        handleFileLoad(file)
      } catch (err: unknown) {
        console.warn('[App] Demo file unavailable:', err)
        toast(tToasts('model.demoUnavailable'), 'warning')
        setShowUpload(true)
      }
    })()
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

  // The gallery already downloaded the chosen model into a File — switch to the
  // viewer and run the normal load pipeline (which handles OPFS caching/parse).
  const handleDemoModelReady = (_model: DemoModel, file: File): void => {
    setShowDemoGallery(false)
    demoLoadRef.current = true
    setRoute('viewer')
    handleFileLoad(file)
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
  const handleRevealInTree       = elementFocus.revealInTree

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
    setRoute('landing')
    setBlogSlug(null)
    setModelInfo(null)
    setLoadingState('idle')
    setLoadError(null)
    setSelected(null)
    setHidden(new Set())
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
    modelRegistry.clear()
    clearScene()
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

  // ── Load a single IFC File (shared by URL params, postMessage & SDK) ───────
  const loadIfcFile = useCallback(async (file: File): Promise<void> => {
    setRoute('viewer')
    setLoadingState('loading')
    setLoadError(null)
    // Reset viewer interaction state only when this is the first model.
    if (useSceneStore.getState().models.length === 0) {
      setModelInfo(null)
      setSelected(null)
      setHidden(new Set())
      setIsolated(null)
      setIsolatedElement(null)
      setIsolatedElementModel(null)
      clearHiddenElements()
    }
    // Await so the loader's concurrency guard doesn't reject a following load.
    lastLoadSizeMbRef.current = Math.round((file.size / 1_048_576) * 10) / 10
    await loadFile(file)
  }, [loadFile, clearHiddenElements])

  // ── Load model(s) from remote URLs (shared by ?model= and postMessage) ────
  // `requestId` is set by SDK-initiated loads so model-loaded/model-error echo it.
  const loadModelsFromUrls = useCallback(async (urls: string[], names: string[] = [], requestId?: string): Promise<void> => {
    for (let i = 0; i < urls.length; i++) {
      const url  = urls[i]
      try {
        const file = await fetchIfcFromUrl(url, names[i])
        pendingRequestIdRef.current = requestId ?? null
        await loadIfcFile(file)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[App] Failed to load model from URL:', url, msg)
        setLoadingState('error')
        setLoadError(msg)
        toast(tToasts('model.urlLoadFailed', { message: msg }), 'error')
        emitEmbedEvent('model-error', { url, message: msg, requestId })
        pendingRequestIdRef.current = null
      }
    }
  }, [loadIfcFile, tToasts])

  // ── Load model from raw IFC bytes handed in by a host app (SDK path) ───────
  const loadModelFromBytes = useCallback(async (name: string, bytes: Uint8Array, requestId?: string): Promise<void> => {
    const fname = name.toLowerCase().endsWith('.ifc') ? name : `${name}.ifc`
    try {
      pendingRequestIdRef.current = requestId ?? null
      await loadIfcFile(new File([bytes], fname, { type: 'application/x-step' }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[App] Failed to load model from bytes:', fname, msg)
      setLoadingState('error')
      setLoadError(msg)
      toast(tToasts('model.urlLoadFailed', { message: msg }), 'error')
      emitEmbedEvent('model-error', { name: fname, message: msg, requestId })
      pendingRequestIdRef.current = null
    }
  }, [loadIfcFile, tToasts])

  // ── Auto-load model(s) from URL params on mount (?model=…&embed=1) ────────
  const urlLoadStartedRef   = useRef(false)
  const urlActionsAppliedRef = useRef(false)

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

    if (urlParams.modelUrls.length === 0) {
      // Embed with no model → drop straight onto an upload prompt so the host
      // user can pick a file.
      if (urlParams.embed) setShowUpload(true)
      return
    }

    void loadModelsFromUrls(urlParams.modelUrls, urlParams.fileNames)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Inbound postMessage commands (host CDE → iframe) ──────────────────────
  // Lets a CDE drive the embedded viewer two-way (load / select / isolate / fit).
  // Only active when running inside an iframe. Commands use the `ifcviewer:` ns.
  useEffect(() => {
    if (!isEmbedded()) return
    const onMessage = (e: MessageEvent): void => {
      const data = e.data as { type?: unknown } | null
      if (!data || typeof data.type !== 'string' || !data.type.startsWith('ifcviewer:')) return
      const msg = data as { type: string; [k: string]: unknown }
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
          else if (ArrayBuffer.isView(raw)) bytes = new Uint8Array((raw as ArrayBufferView).buffer)
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
          if (type) viewerRef.current?.frameCategory(type)
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
        case 'ifcviewer:view': {
          const preset = typeof msg.preset === 'string' ? msg.preset : ''
          if (CAMERA_PRESETS.includes(preset as CameraPreset)) {
            viewerApiRef.current?.setCameraPreset(preset as CameraPreset)
          }
          break
        }
        case 'ifcviewer:set-language': {
          const lng = typeof msg.lang === 'string' ? msg.lang : null
          const supported = (i18n.options.supportedLngs || []) as string[]
          if (lng && supported.includes(lng) && i18n.language !== lng) void i18n.changeLanguage(lng)
          break
        }
        case 'ifcviewer:clear': {
          const ids = useSceneStore.getState().models.map((m) => m.id)
          void (async () => { for (const id of ids) await handleRemoveModel(id) })()
          setModelInfo(null)
          setLoadingState('idle')
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

  // ── Relay load progress to an embedding parent (SDK model-progress event) ──
  useEffect(() => {
    if (loadingState !== 'loading') return
    emitEmbedEvent('model-progress', {
      percent: progress.percent,
      phase:   progress.phase,
      requestId: pendingRequestIdRef.current ?? undefined,
    })
  }, [progress, loadingState])

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
                onNavigateHome={handleNavigateToLanding}
                onNavigateWelcome={() => {
                  history.replaceState(null, '', '/welcome')
                  setRoute('welcome')
                }}
              />
            </React.Suspense>
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
              <div className="flex-none z-20">
                {/* Show the active model's name; fall back to last-loaded when only one model exists */}
                {(() => {
                  const activeEntry = sceneModels.find((m) => m.id === activeModelId)
                  const displayName  = activeEntry?.fileName  ?? modelInfo?.fileName   ?? null
                  const displayCount = activeEntry?.elementCount ?? modelInfo?.elementCount ?? 0
                  return (
                    <Toolbar
                      fileName={displayName}
                      elementCount={displayCount}
                      loadingState={loadingState}
                      canIsolate={!!selected}
                      viewerApiRef={viewerApiRef}
                      onReset={() => viewerRef.current?.resetCamera()}
                      onIsolate={handleIsolate}
                      onUpload={openUploadModal}
                      onOpenDemoGallery={openDemoGallery}
                      onOpenExportModal={() => setShowExportModal(true)}
                      onOpenEmbed={() => setShowEmbedModal(true)}
                      onOpenIds={() => setShowIdsModal(true)}
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

                  {mobileSidebarOpen && (
                    <div
                      className="md:hidden drawer-backdrop"
                      onClick={() => setMobileSidebarOpen(false)}
                    />
                  )}

                  {/* Camera preset overlay (yields to the tour bar while playing —
                      it shares the bottom edge and presets fight the tour narrative) */}
                  {sceneModels.length > 0 && effectiveChrome.showCameraControls && tourMode !== 'playing' && (
                    <CameraControls
                      viewerApiRef={viewerApiRef}
                      visible={cameraControlsVisible}
                      onToggle={toggleCameraControls}
                    />
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
                  {sceneModels.length > 0 && tourMode !== 'playing' && !clientMode && (() => {
                    const displayInfo =
                      sceneModels.find((m) => m.id === activeModelId) ?? modelInfo
                    return displayInfo ? (
                      <ModelInfoPanel
                        modelInfo={displayInfo}
                        memoryStats={memoryStats}
                        isFromCache={isFromCache}
                        qualityScore={result?.qualityScore}
                        gpuBackend={gpuBackend}
                      />
                    ) : null
                  })()}

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
                      onSetTransform={setSceneModelTransform}
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

                  {effectiveChrome.showHome && (
                    <button
                      onClick={handleNavigateToLanding}
                      className="absolute top-3 left-3 z-[9] h-[30px] min-w-[30px] px-3 bg-[rgba(16,16,20,0.82)] backdrop-blur-[14px] border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[12px] font-medium flex items-center gap-1.5 hover:text-[var(--text)] transition-colors"
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
                  {!embedChrome.embed && tourMode !== 'playing' && !clientMode && (
                  <MobileBottomNav
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
                    onOpenHelp={() => setShowHelp(true)}
                    viewerApiRef={viewerApiRef}
                  />
                  )}
                </div>

                {/* Coordinator/exporter panels — never mount in the client skin (D-25) */}
                {!clientMode && (
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
            onClose={() => setShowUpload(false)}
            onLoad={handleFileLoad}
            onOpenDemoGallery={openDemoGallery}
            isLoading={loadingState === 'loading'}
            loadProgress={progress.percent}
            loadError={loadError}
            loadDone={loadingState === 'loaded'}
          />
        )}
      </AnimatePresence>

      {/* ── OPFS cache badge ── */}
      {opfsAvailable && cacheEntries.length > 0 && (
        <div
          title={tViewer('cache.tooltip', { count: cacheEntries.length })}
          onClick={() => { void Promise.all(cacheEntries.map((e) => deleteFromCache(e.key))) }}
          className="fixed left-4 z-50 px-2.5 py-1 bg-[rgba(16,16,20,0.82)] backdrop-blur border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[11px] cursor-pointer hover:text-[var(--text)] transition-colors select-none"
          style={{ bottom: `max(calc(var(--mobile-nav-h) + var(--mobile-nav-margin) + env(safe-area-inset-bottom, 0px) + 8px), 16px)` }}
        >
          {isFromCache ? tViewer('cache.fromCache') : tViewer('cache.cached', { count: cacheEntries.length })}
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
      <ToastContainer />
    </>
  )
}