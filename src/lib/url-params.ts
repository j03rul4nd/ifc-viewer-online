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
//
// See docs/EMBED_URL_PARAMS.md for the full reference.

export type EmbedUiPreset = 'minimal' | 'full' | 'kiosk'

const PRESETS: readonly EmbedUiPreset[] = ['minimal', 'full', 'kiosk']

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
  /** Granular chrome overrides. `undefined` = fall back to the preset default. */
  overrides: {
    toolbar?: boolean
    tree?: boolean
    sidebar?: boolean
    panel?: boolean
    home?: boolean
    cameraControls?: boolean
  }
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

/** Accept absolute http(s) URLs and same-origin relative paths; reject the rest. */
export function isLoadableUrl(u: string): boolean {
  if (!u) return false
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
    const parsed = new URL(u, base)
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
    overrides: {
      toolbar:        parseBool(p.get('toolbar')),
      tree:           parseBool(p.get('tree')),
      sidebar:        parseBool(p.get('sidebar')),
      panel:          parseBool(p.get('panel')),
      home:           parseBool(p.get('home')),
      cameraControls: parseBool(p.get('controls')),
    },
  }
}

/** Mirror of the viewer's canonicalType() so isolate=IfcWallStandardCase matches. */
function canonicalIfcType(raw: string): string {
  return raw.replace('STANDARDCASE', '').replace('ELEMENTEDCASE', '')
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
 * Post an event to the embedding parent window so a host (CDE, blog) can react
 * to viewer lifecycle. No-op when not embedded. Uses '*' targetOrigin because
 * the host origin is unknown; payloads never contain model contents, only meta.
 */
export function emitEmbedEvent(type: EmbedEventType, payload?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage({ source: 'ifc-validator', type, ...payload }, '*')
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
