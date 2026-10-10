// ─── url-params.ts ────────────────────────────────────────────────────────────
// Parse the app's URL query string so an IFC model can be deep-linked or embedded
// in an <iframe> (blogs, articles, CDE panels, third-party screens) and the
// surrounding chrome tuned for the host context. Entirely client-side — works on
// static hosting (GitHub Pages) with no server.
//
// Examples:
//   ?model=https://cde.example.com/file.ifc
//   ?model=https://host/a.ifc,https://host/b.ifc&embed=1          (federated)
//   ?model=https://host/file.ifc&embed=1&ui=kiosk&validate=0
//   ?model=https://host/file.ifc&embed=1&select=1234&lang=es
//   ?model=https://host/file.ifc&map=terrain,buildings&scan=https://host/site.laz
//   ?model=https://host/file.ifc&embed=1&panels=scene,map   (only those tools)
//   ?model=https://host/file.ifc&embed=1&panels=-measurement (all but that one)
//   ?model=https://host/file.ifc&embed=1&bg=white&solar=06-21T18:00   (look + sun)
//   ?model=https://host/file.ifc&layers=https://host/twin-setup.json  (data layers)
//
// See docs/EMBED_URL_PARAMS.md for the full reference.

import { parsePanelAllowlist, type PanelId } from './ui/panel-rail'
import { parseBackgroundSpec, type BackgroundSettings } from './scene/background'
import { MAP_LOOKS } from './geo/map-look'

export type EmbedUiPreset = 'minimal' | 'full' | 'kiosk' | 'client' | 'article'

const PRESETS: readonly EmbedUiPreset[] = ['minimal', 'full', 'kiosk', 'client', 'article']

/** Named views a `?view=` deep link may ask for (the camera presets). */
const VIEWS = ['iso', 'top', 'bottom', 'front', 'back', 'left', 'right'] as const
export type UrlView = typeof VIEWS[number]

/** How the mouse wheel behaves: always zooms, or only with Ctrl/⌘ held. */
export type WheelMode = 'always' | 'ctrl'

/** Parsed, validated view of the relevant URL query params. */
export interface AppUrlParams {
  /** Public IFC URLs to auto-load (comma-separated `model`/`src`/`url`, or repeated). */
  modelUrls: string[]
  /** Optional display file names, positionally parallel to `modelUrls`. */
  fileNames: string[]
  /** Embed mode on — slims the chrome for iframe hosting. */
  embed: boolean
  /** Chrome preset; defaults to 'minimal' when embed is on. */
  preset: EmbedUiPreset
  /** Run validation automatically after load (default true). */
  autoValidate: boolean
  /** UI language code requested by the host (validated by the caller). */
  lang?: string
  /** Accent colour (validated `#rgb`/`#rrggbb`) to theme the viewer to a host. */
  accent?: string
  /** expressId to select + frame once the model has loaded. */
  select?: number
  /** Canonical IFC class to isolate after load, e.g. "IFCWALL" (best-effort). */
  isolate?: string
  /**
   * Invite / campaign tag from `?ref=` (alias `?invite=`). Opaque, non-PII —
   * an outreach identifier like `li_ignacy`, `hn`, `md_<slug>`. Consumed by
   * attribution.ts; never rendered as a person's name. See
   * personalized-invite-system-research.md §11.
   */
  ref?: string
  /**
   * Sun-study deep link (`?solar=YYYY-MM-DDTHH:MM` or evergreen
   * `?solar=MM-DDTHH:MM`): open the Sun & Moon study at this SITE-LOCAL wall
   * time once the model loads. Only honoured when the model's location can be
   * resolved — a deep link must never pop the blocking default-location notice.
   */
  solar?: { year?: number; month: number; day: number; minutes: number }
  /**
   * `?bg=` — the scene background for this page view: a preset (`white`,
   * `paper`, `blueprint`, `sky`, `studio`), one colour (`f4f4f5`) or a
   * top,bottom gradient (`dbeafe,ffffff`). Not saved as the visitor's
   * preference. See parseBackgroundSpec.
   */
  background?: BackgroundSettings
  /** `?moon=1` — enable the moon light for the solar deep link. */
  solarMoon?: boolean
  /**
   * `?map=1` — drop the model onto the basemap once it loads, using its own
   * georeferencing. Extra tokens turn on the layers a demo usually wants:
   * `?map=terrain,buildings,showcase`.
   *
   * Only worth anything for a georeferenced model: with nothing to place the
   * building by, map mode has to ask the user where it is, and a deep link that
   * opens a "where is this?" dialog is worse than one that does nothing.
   */
  map?: MapDeepLink
  /**
   * `?scan=<url>` — point clouds to fetch and load alongside the model
   * (comma-separated or repeated, like `model`).
   *
   * The scan lands wherever the alignment ladder puts it. When it shares a
   * projected CRS with the model that is exact; when it does not, the panel
   * says so rather than pretending.
   */
  scanUrls: string[]
  /**
   * `?layers=<url>` — a data-layer setup (exported from the Data layers panel)
   * to open: sources, styles, groups, alerts. The JSON is hosted wherever the
   * sharer likes (CORS needed). While it is in the URL it is what the scene
   * shows: the visitor's own saved layers are neither restored nor touched.
   */
  layersUrl?: string
  /**
   * `?view=iso` — once every model has loaded, frame them from this preset with
   * a tight fit (`?fill=0.85` of the frame). The `article` preset implies
   * `view=iso`. See camera-framing fitPose.
   */
  view?: UrlView
  /** `?fill=` — share of the frame the model fills (0.2–0.98) for `view`. */
  fill?: number
  /**
   * `?wheel=ctrl` — the wheel scrolls the host page and zooms only with
   * Ctrl/⌘ held, like an embedded map. The `article` preset implies it: a
   * reader scrolling past a figure must not get stuck zooming into it.
   */
  wheel?: WheelMode
  /**
   * `?turntable=1` (6°/s) or `?turntable=<deg/s>` — a slow idle orbit once
   * the model is in, stopped by the visitor's first touch. Never under
   * prefers-reduced-motion. Since v1.15.
   */
  turntable?: number
  /**
   * `?camera=px,py,pz,tx,ty,tz` — open on this exact camera (scene metres, Y
   * up: eye then orbit target), once the models are in. Wins over `view`.
   */
  camera?: { position: [number, number, number]; target: [number, number, number] }
  /**
   * `?hide=w123,w456` — OpenStreetMap features to hide in map mode for this
   * page view (not saved as the visitor's own hidden features).
   */
  hideFeatures: string[]
  /**
   * `?scene=<url>` — a scene document (docs/SCENE_FORMAT.md) to open. It is
   * resolved before the app mounts and contributes its own parameters (see
   * setSceneParams); kept here so the app knows a scene is in charge.
   */
  sceneUrl?: string
  /** Granular chrome overrides. `undefined` = fall back to the preset default. */
  overrides: {
    toolbar?: boolean
    tree?: boolean
    sidebar?: boolean
    panel?: boolean
    home?: boolean
    cameraControls?: boolean
    /** `rail=0` — the icon rail of tool panels on the right edge. */
    rail?: boolean
    /** `stats=0` — the model info chip (size, element count, GPU backend). */
    stats?: boolean
    /**
     * `panels=scene,map` allows exactly those tools; `panels=-measurement`
     * subtracts. Undefined means no opinion. One parameter for all nine
     * panels, and for every one we add — see docs/RIGHT_EDGE.md.
     */
    panels?: PanelId[]
  }
}

/** What `?map=` asked for. Omitted fields leave the app's own defaults alone. */
export interface MapDeepLink {
  enabled: boolean
  /**
   * `look=<id>` or `look=<from>..<to>` (map-look MAP_LOOKS ids): open in a look,
   * or play a time-of-day transition between two once the scene is built.
   */
  look?: string
  lookTo?: string
  terrain?: boolean
  buildings?: boolean
  /** `showcase` also downloads the authored props — heavier, and the nicer shot. */
  detail?: 'showcase'
}

/** Fully-resolved chrome flags — preset defaults with per-param overrides applied. */
export interface EmbedChrome {
  embed: boolean
  showToolbar: boolean
  showTree: boolean
  showSidebar: boolean
  /** Auto-open the validation panel once a model loads. */
  openPanel: boolean
  /** Show the "back to home" button. */
  showHome: boolean
  showCameraControls: boolean
  /** The icon rail of tool panels. */
  showRail: boolean
  /** The model info chip (file size, element count, GPU backend). */
  showModelInfo: boolean
  /** The collapsed validation / IDS bar at the bottom. */
  showValidation: boolean
  /**
   * Presentation quiet: no floating load indicator, no cache badge, no toasts.
   * The host shows its own progress (the `model-progress` events) and the
   * frame stays a picture.
   */
  quiet: boolean
  /**
   * Which rail panels this audience gets, or undefined for all that apply.
   *
   * A list rather than a flag per tool: the rail is where every new tool lands,
   * so a host must be able to scope it once and stay correct as we ship more.
   */
  panels?: PanelId[]
}

// ── Boolean param parsing ──────────────────────────────────────────────────────
// `?embed` (no value) reads as "" via URLSearchParams.get and means true.
const TRUTHY = new Set(['1', 'true', 'yes', 'on', ''])
const FALSY  = new Set(['0', 'false', 'no', 'off'])

function parseBool(v: string | null): boolean | undefined {
  if (v == null) return undefined
  const s = v.trim().toLowerCase()
  if (TRUTHY.has(s)) return true
  if (FALSY.has(s)) return false
  return undefined
}

// ── Pretty invite path: /i/<code> or /invite/<code> ───────────────────────────
// The Vercel SPA rewrite already serves index.html for any non-/assets/ path, so
// a pretty invite link needs only this parser (no infra change). The code charset
// matches sanitizeInviteCode so the value is always PostHog-safe / non-PII.
const INVITE_PATH_RE = /^\/(?:i|invite)\/([A-Za-z0-9_-]{1,64})\/?$/

/**
 * Extract an invite code from a pretty path (`/i/<code>` or `/invite/<code>`),
 * accounting for the app's BASE_URL. Returns undefined when the path isn't an
 * invite path. SSR-safe (defaults to the live pathname in the browser).
 */
export function parseInvitePath(pathname?: string): string | undefined {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '')
  const rel = base && path.startsWith(base) ? path.slice(base.length) : path
  const m = INVITE_PATH_RE.exec(rel || '/')
  return m ? m[1] : undefined
}

/**
 * Accept absolute http(s) URLs and root-relative paths; reject the rest.
 *
 * THE LEADING SLASH IS NOT PEDANTRY. These lists are comma-separated, so a
 * rejected URL that happens to contain a comma leaves its tail behind as a
 * separate entry: `?scan=data:text/plain,x` splits into `data:text/plain`
 * (rejected on its scheme) and a bare `x`. Resolved against the current page
 * that is a perfectly good same-origin URL, so without this it sails through
 * and the app goes off to fetch a path nobody asked for.
 *
 * Requiring `/` costs nothing — every relative link a host would write, and
 * every one we write ourselves, is root-relative — and it makes the tail of a
 * rejected URL stay rejected.
 */
export function isLoadableUrl(u: string): boolean {
  const raw = u?.trim()
  if (!raw) return false
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith('/')) return false
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
    const parsed = new URL(raw, base)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function splitList(values: string[]): string[] {
  return values
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Parameters a scene document contributes (scene-boot.ts), merged UNDER the
 * real query string: what the visitor's URL says explicitly still wins, so
 * `?scene=…&bg=white` opens the scene on white.
 */
let sceneParams: URLSearchParams | null = null
export function setSceneParams(q: URLSearchParams | null): void { sceneParams = q }

function withSceneParams(p: URLSearchParams): URLSearchParams {
  if (!sceneParams) return p
  const merged = new URLSearchParams(sceneParams)
  for (const key of new Set(p.keys())) {
    merged.delete(key)
    for (const v of p.getAll(key)) merged.append(key, v)
  }
  return merged
}

/** `px,py,pz,tx,ty,tz` → a camera, or undefined when it is not six finite numbers. */
function parseCamera(v: string | null): AppUrlParams['camera'] {
  if (!v) return undefined
  const n = v.split(',').map((x) => Number(x.trim()))
  if (n.length !== 6 || !n.every(Number.isFinite)) return undefined
  return { position: [n[0], n[1], n[2]], target: [n[3], n[4], n[5]] }
}

/** Parse the given query string (defaults to the live `window.location.search`). */
export function parseAppUrlParams(search?: string): AppUrlParams {
  const qs = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const p = search === undefined ? withSceneParams(new URLSearchParams(qs)) : new URLSearchParams(qs)

  const rawModels = splitList([...p.getAll('model'), ...p.getAll('src'), ...p.getAll('url')])
  const modelUrls = rawModels.filter(isLoadableUrl)
  const fileNames = splitList([...p.getAll('name'), ...p.getAll('file')])

  const uiParam = (p.get('ui') ?? '').trim().toLowerCase()
  const preset: EmbedUiPreset = (PRESETS as readonly string[]).includes(uiParam)
    ? (uiParam as EmbedUiPreset)
    : 'minimal'

  // Embed mode turns on with ?embed, with an explicit ?ui=<preset>, or implicitly
  // when the only thing the host passed is a model (so a bare deep-link still works
  // as the full app — embed must be opt-in).
  const embed = parseBool(p.get('embed')) === true || (PRESETS as readonly string[]).includes(uiParam)

  const selectRaw = Number.parseInt(p.get('select') ?? '', 10)
  const isolateRaw = (p.get('isolate') ?? '').trim().toUpperCase()
  const refRaw = sanitizeInviteCode(p.get('ref') ?? p.get('invite'))
  const lang = (p.get('lang') ?? '').trim() || undefined
  const accentRaw = (p.get('accent') ?? '').trim()
  // Accept "#rgb"/"#rrggbb" or the same without the leading '#'. Reject anything
  // else to keep it safe to inject into a CSS custom property.
  const accentHex = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(accentRaw)
    ? (accentRaw.startsWith('#') ? accentRaw : `#${accentRaw}`)
    : undefined

  return {
    modelUrls,
    fileNames,
    embed,
    preset,
    autoValidate: parseBool(p.get('validate')) !== false,
    lang,
    accent: accentHex,
    select: Number.isFinite(selectRaw) && selectRaw > 0 ? selectRaw : undefined,
    isolate: isolateRaw ? canonicalIfcType(isolateRaw) : undefined,
    ref: refRaw,
    background: parseBackgroundSpec(p.get('bg') ?? '') ?? undefined,
    solar: parseSolarParam(p.get('solar')),
    solarMoon: parseBool(p.get('moon')),
    map: withLook(parseMapParam(p.get('map')), p.get('look')),
    scanUrls: splitList(p.getAll('scan')).filter(isLoadableUrl),
    layersUrl: [p.get('layers') ?? ''].map((u) => u.trim()).find(isLoadableUrl),
    view: parseView(p.get('view')) ?? (preset === 'article' && embed ? 'iso' : undefined),
    fill: parseFill(p.get('fill')),
    wheel: parseWheel(p.get('wheel')) ?? (preset === 'article' && embed ? 'ctrl' : undefined),
    turntable: parseTurntable(p.get('turntable')),
    camera: parseCamera(p.get('camera')),
    hideFeatures: (p.get('hide') ?? '').split(',').map((x) => x.trim()).filter((x) => /^[nwr]\d{1,15}$/.test(x)).slice(0, 200),
    sceneUrl: [p.get('scene') ?? ''].map((u) => u.trim()).find(isLoadableUrl),
    overrides: {
      toolbar:        parseBool(p.get('toolbar')),
      tree:           parseBool(p.get('tree')),
      sidebar:        parseBool(p.get('sidebar')),
      panel:          parseBool(p.get('panel')),
      home:           parseBool(p.get('home')),
      cameraControls: parseBool(p.get('controls')),
      rail:           parseBool(p.get('rail')),
      stats:          parseBool(p.get('stats')),
      panels: parsePanelAllowlist(p.get('panels')),
    },
  }
}

/**
 * `?map=1` / `?map=0`, or a comma list of layers: `terrain`, `buildings`,
 * `showcase`. Naming a layer implies the map itself — `?map=terrain` meaning
 * "terrain but no map" is not a thing anyone wants.
 *
 * An unrecognised token turns the map on and is otherwise ignored, on purpose:
 * a typo in one layer should not silently cost the host the whole feature.
 */
const LOOK_IDS: readonly string[] = MAP_LOOKS.map((l) => l.id)

/**
 * `?look=` rides on the map: it says how the site is lit, so without `?map`
 * there is nothing to light and it is ignored. Unknown ids are dropped (a typo
 * must not cost the host the map).
 */
export function withLook(map: MapDeepLink | undefined, v: string | null): MapDeepLink | undefined {
  if (!map || !v) return map
  const [from, to] = v.trim().toLowerCase().split('..').map((s) => s.trim())
  const ok = (id: string | undefined) => (id && LOOK_IDS.includes(id) ? id : undefined)
  const look = ok(from)
  const lookTo = ok(to)
  return { ...map, ...(look ? { look } : {}), ...(look && lookTo && lookTo !== look ? { lookTo } : {}) }
}

function parseMapParam(v: string | null): MapDeepLink | undefined {
  if (v === null) return undefined
  const raw = v.trim().toLowerCase()
  const bool = parseBool(raw)
  if (bool === false) return undefined
  if (bool === true || raw === '') return { enabled: true }

  const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean)
  if (tokens.length === 0) return { enabled: true }
  const link: MapDeepLink = { enabled: true }
  for (const token of tokens) {
    if (token === 'terrain')   link.terrain = true
    if (token === 'buildings') link.buildings = true
    if (token === 'showcase')  link.detail = 'showcase'
  }
  return link
}

function parseView(v: string | null): UrlView | undefined {
  const raw = (v ?? '').trim().toLowerCase()
  return (VIEWS as readonly string[]).includes(raw) ? raw as UrlView : undefined
}

function parseFill(v: string | null): number | undefined {
  if (v === null) return undefined
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n)) return undefined
  // Accept a ratio (0.85) or a percentage (85).
  const r = n > 1 ? n / 100 : n
  return Math.min(0.98, Math.max(0.2, r))
}

function parseTurntable(v: string | null): number | undefined {
  if (v === null) return undefined
  const b = parseBool(v)
  if (b === true) return 6
  if (b === false) return undefined
  const n = Number.parseFloat(v)
  return Number.isFinite(n) && n > 0 ? Math.min(90, n) : undefined
}

function parseWheel(v: string | null): WheelMode | undefined {
  const raw = (v ?? '').trim().toLowerCase()
  if (raw === 'ctrl' || raw === 'modifier' || raw === 'cmd') return 'ctrl'
  if (raw === 'always' || raw === 'zoom') return 'always'
  return undefined
}

/** Mirror of the viewer's canonicalType() so isolate=IfcWallStandardCase matches. */
export function canonicalIfcType(raw: string): string {
  return raw.replace('STANDARDCASE', '').replace('ELEMENTEDCASE', '')
}

/** `YYYY-MM-DDTHH:MM` (exact) or `MM-DDTHH:MM` (evergreen — current year). */
function parseSolarParam(v: string | null): AppUrlParams['solar'] {
  if (!v) return undefined
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim())
  if (!m) return undefined
  const year = m[1] ? parseInt(m[1], 10) : undefined
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  const hour = parseInt(m[4], 10)
  const minute = parseInt(m[5], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return undefined
  return { year, month, day, minutes: hour * 60 + minute }
}

/**
 * Invite/campaign tag sanitizer. Accepts an opaque outreach identifier
 * (`[A-Za-z0-9_-]`, 1–64 chars) and rejects anything else, so the value is
 * always safe to use as a PostHog property and never carries free-text/PII.
 */
function sanitizeInviteCode(v: string | null): string | undefined {
  if (!v) return undefined
  const s = v.trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : undefined
}

const TOOLS = { showRail: true, showModelInfo: true, showValidation: true, quiet: false } as const
const CANVAS = { showRail: false, showModelInfo: false, showValidation: false, quiet: true } as const

const PRESET_CHROME: Record<EmbedUiPreset, Omit<EmbedChrome, 'embed'>> = {
  minimal: { showToolbar: true,  showTree: false, showSidebar: true,  openPanel: false, showHome: false, showCameraControls: true,  ...TOOLS },
  full:    { showToolbar: true,  showTree: true,  showSidebar: true,  openPanel: true,  showHome: false, showCameraControls: true,  ...TOOLS },
  // "3D canvas only", as documented. It used to keep the tool rail, the model
  // info chip, the validation bar and the load indicator, which is what made a
  // kiosk figure look like a screenshot of the app.
  kiosk:   { showToolbar: false, showTree: false, showSidebar: false, openPanel: false, showHome: false, showCameraControls: false, ...CANVAS },
  // A figure in an article (v1.14): the kiosk canvas, plus the presentation
  // defaults a reader needs — a tight iso framing once loaded (`view=iso`) and
  // a wheel that scrolls the page unless Ctrl/⌘ is held (`wheel=ctrl`). Tool
  // panels a host opens over the bridge (measure, sun, walk) still mount.
  article: { showToolbar: false, showTree: false, showSidebar: false, openPanel: false, showHome: false, showCameraControls: false, ...CANVAS },
  // Client presentation skin (D-25): show-only for non-technical audiences.
  // Camera presets stay ON (simplified navigation); everything technical is
  // hidden. uiStore.clientMode is set from this preset at boot and layers the
  // ClientPresentationLayout on top.
  // No `panels` list here. The client skin already decides what it mounts, and
  // a second list restating that from memory is how the rail ended up offering
  // Scene and Map in a skin that renders neither.
  client:  { showToolbar: false, showTree: false, showSidebar: false, openPanel: false, showHome: false, showCameraControls: true,  ...TOOLS },
}

/** Resolve the final chrome flags from a parsed param set. */
export function resolveEmbedChrome(params: AppUrlParams): EmbedChrome {
  // Non-embed = the normal, full application.
  if (!params.embed) {
    return {
      embed: false,
      showToolbar: true,
      showTree: true,
      showSidebar: true,
      openPanel: true,
      showHome: true,
      showCameraControls: true,
      ...TOOLS,
    }
  }
  const d = PRESET_CHROME[params.preset]
  const o = params.overrides
  return {
    embed: true,
    showToolbar:        o.toolbar        ?? d.showToolbar,
    showTree:           o.tree           ?? d.showTree,
    showSidebar:        o.sidebar        ?? d.showSidebar,
    openPanel:          o.panel          ?? d.openPanel,
    showHome:           o.home           ?? d.showHome,
    showCameraControls: o.cameraControls ?? d.showCameraControls,
    showRail:           o.rail           ?? d.showRail,
    showModelInfo:      o.stats          ?? d.showModelInfo,
    showValidation:     d.showValidation,
    quiet:              d.quiet,
    panels:             o.panels         ?? d.panels,
  }
}

// ── postMessage bridge (outbound events to the embedding parent) ───────────────

export type EmbedEventType =
  | 'ready'
  | 'model-loaded'
  | 'model-error'
  | 'model-progress'
  | 'validation-completed'
  | 'element-selected'
  // Emitted when click-to-read is armed on a point cloud and a point is hit.
  // The payload carries the file's own coordinates alongside the scene ones,
  // because that is the number a host system will already have on record.
  | 'pointcloud-picked'
  // Emitted when a feature of the OpenStreetMap surroundings is clicked in map
  // mode. Context, not model: none of it is validated or exported, and its
  // height is usually an estimate — which the payload says outright.
  | 'map-feature-picked'
  // Walk mode turned on or off (by the visitor's keyboard or by the host).
  | 'walk-changed'
  // A measurement was added, removed or renamed. The payload is the whole list,
  // so a host never has to replay deltas to know what is on screen.
  | 'measurements-changed'
  // A tour started, moved to another step, or ended (SDK 1.12).
  | 'tour-started'
  | 'tour-step'
  | 'tour-ended'
  // The director is generating or exporting a presentation (SDK 1.12).
  | 'presentation-progress'
  // A feature of a data layer was clicked (SDK 1.17): its layer and properties.
  | 'layer-feature-picked'
  // A layer or twin rule started or stopped alerting (SDK 1.17).
  | 'alert'
  | 'result'

/** True when the app is running inside an iframe. */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    // Cross-origin parent blocks the comparison → we are framed.
    return true
  }
}

/**
 * The origin that last sent us a command, learned from the incoming message.
 *
 * Replies are addressed to it rather than broadcast. See emitEmbedEvent.
 */
let hostOrigin: string | null = null

/**
 * Remember where commands are coming from, so answers can be addressed there.
 *
 * `"null"` is what a sandboxed or file:// parent reports, and postMessage
 * rejects it as a target — those hosts keep the broadcast behaviour, because a
 * reply nobody can receive is worse than a reply more windows can see.
 */
export function rememberHostOrigin(origin: string | undefined): void {
  if (origin && origin !== 'null') hostOrigin = origin
}

/** Test seam. */
export function __resetHostOrigin(): void { hostOrigin = null }

/**
 * Post an event to the embedding parent window so a host (CDE, blog) can react
 * to viewer lifecycle.  No-op when not embedded.
 *
 * ── Why the target origin is not simply '*'
 * A previous version of this comment claimed payloads "never contain model
 * contents, only meta". That has not been true for a long time: `result`
 * envelopes carry whatever the SDK asked for — `getElement` returns an element's
 * attributes and property sets — and `pointcloud-picked` carries the survey
 * coordinates of a real site.
 *
 * With '*', every one of those is readable by ANY script running on the
 * embedding page, not just the host's own code. The host chose to embed the
 * viewer, so it is entitled to the data; a third-party analytics or ad script
 * sharing that page is not, and it only has to add a message listener.
 *
 * So replies go to the origin that asked. The fallback stays '*' for the case
 * where no command has arrived yet (lifecycle events fired before any host
 * interaction) or the parent has an opaque origin — there, a message nobody can
 * receive would be strictly worse.
 */
export function emitEmbedEvent(type: EmbedEventType, payload?: Record<string, unknown>, transfer: Transferable[] = []): void {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage({ source: 'ifc-validator', type, ...payload }, hostOrigin ?? '*', transfer)
  } catch {
    /* parent may reject the message; nothing we can do, ignore */
  }
}

// ── Embed URL + snippet builders (used by the EmbedModal generator) ────────────

export interface EmbedUrlOptions {
  /** App origin + path, e.g. "https://app.example.com/". */
  baseUrl: string
  modelUrl: string
  fileName?: string
  preset: EmbedUiPreset
  autoValidate: boolean
  /** Force the validation panel open. */
  openPanel?: boolean
  lang?: string
  /** Accent colour (`#rrggbb`) to theme the viewer. */
  accent?: string
  /**
   * Limit the tool rail to these panels. `[]` means no rail at all.
   *
   * Undefined is "no opinion" and lets the preset decide, which is why an
   * empty array has to be serialised rather than skipped as falsy.
   */
  panels?: PanelId[]
}

/** Serialize options into a shareable app URL with embed params. */
export function buildEmbedUrl(o: EmbedUrlOptions): string {
  const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
  const u = new URL(o.baseUrl, base)
  // Drop any pre-existing query/hash so we start from a clean app URL.
  u.search = ''
  u.hash = ''
  u.searchParams.set('model', o.modelUrl)
  if (o.fileName) u.searchParams.set('name', o.fileName)
  u.searchParams.set('embed', '1')
  if (o.preset !== 'minimal') u.searchParams.set('ui', o.preset)
  if (!o.autoValidate) u.searchParams.set('validate', '0')
  if (o.openPanel) u.searchParams.set('panel', '1')
  if (o.lang) u.searchParams.set('lang', o.lang)
  if (o.accent) u.searchParams.set('accent', o.accent.replace(/^#/, ''))
  if (o.panels) u.searchParams.set('panels', o.panels.join(','))
  return u.toString()
}

/** Wrap an embed URL in a paste-ready, responsive <iframe> snippet. */
export function buildIframeSnippet(
  url: string,
  opts: { width?: string; height?: number } = {},
): string {
  const width = opts.width ?? '100%'
  const height = opts.height ?? 600
  return [
    '<iframe',
    `  src="${url}"`,
    `  width="${width}"`,
    `  height="${height}"`,
    '  style="border:0;border-radius:12px;max-width:100%"',
    '  loading="lazy"',
    '  allow="fullscreen"',
    '  title="IFC model viewer">',
    '</iframe>',
  ].join('\n')
}
