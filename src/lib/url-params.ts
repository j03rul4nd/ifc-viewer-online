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
//
// See docs/EMBED_URL_PARAMS.md for the full reference.

import { parsePanelAllowlist, type PanelId } from './ui/panel-rail'

export type EmbedUiPreset = 'minimal' | 'full' | 'kiosk' | 'client'

const PRESETS: readonly EmbedUiPreset[] = ['minimal', 'full', 'kiosk', 'client']

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
  /** Granular chrome overrides. `undefined` = fall back to the preset default. */
  overrides: {
    toolbar?: boolean
    tree?: boolean
    sidebar?: boolean
    panel?: boolean
    home?: boolean
    cameraControls?: boolean
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

/** Parse the given query string (defaults to the live `window.location.search`). */
export function parseAppUrlParams(search?: string): AppUrlParams {
  const qs = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const p = new URLSearchParams(qs)

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
    solar: parseSolarParam(p.get('solar')),
    solarMoon: parseBool(p.get('moon')),
    map: parseMapParam(p.get('map')),
    scanUrls: splitList(p.getAll('scan')).filter(isLoadableUrl),
    overrides: {
      toolbar:        parseBool(p.get('toolbar')),
      tree:           parseBool(p.get('tree')),
      sidebar:        parseBool(p.get('sidebar')),
      panel:          parseBool(p.get('panel')),
      home:           parseBool(p.get('home')),
      cameraControls: parseBool(p.get('controls')),
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

/** Mirror of the viewer's canonicalType() so isolate=IfcWallStandardCase matches. */
function canonicalIfcType(raw: string): string {
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

const PRESET_CHROME: Record<EmbedUiPreset, Omit<EmbedChrome, 'embed'>> = {
  minimal: { showToolbar: true,  showTree: false, showSidebar: true,  openPanel: false, showHome: false, showCameraControls: true  },
  full:    { showToolbar: true,  showTree: true,  showSidebar: true,  openPanel: true,  showHome: false, showCameraControls: true  },
  kiosk:   { showToolbar: false, showTree: false, showSidebar: false, openPanel: false, showHome: false, showCameraControls: false },
  // Client presentation skin (D-25): show-only for non-technical audiences.
  // Camera presets stay ON (simplified navigation); everything technical is
  // hidden. uiStore.clientMode is set from this preset at boot and layers the
  // ClientPresentationLayout on top.
  // No `panels` list here. The client skin already decides what it mounts, and
  // a second list restating that from memory is how the rail ended up offering
  // Scene and Map in a skin that renders neither.
  client:  { showToolbar: false, showTree: false, showSidebar: false, openPanel: false, showHome: false, showCameraControls: true  },
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
export function emitEmbedEvent(type: EmbedEventType, payload?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage({ source: 'ifc-validator', type, ...payload }, hostOrigin ?? '*')
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
