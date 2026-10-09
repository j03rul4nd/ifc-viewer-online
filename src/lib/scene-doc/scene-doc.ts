// ─── scene-doc ────────────────────────────────────────────────────────────────
// ONE file for a whole digital-twin scene: which models, which data layers and
// how they look, which live devices paint which elements, and how the view
// opens (map, background, sun, camera). Versioned, validated, and readable by
// a person — it is meant to be kept in a repository, hand-edited, published on
// any static host and opened with `?scene=<url>`, or carried inside the link
// itself (`#scene=…`, see scene-link.ts) when there is nowhere to host it.
//
// It does NOT invent a parallel world. Each part is the format the app already
// speaks, so a scene is applied by the code that already applies each part:
//   models  → the `?model=` loader (URLs only: a local file cannot be shared)
//   layers  → the entries of an `ifc-viewer-data-layers` v1 file
//   twin    → the sources and bindings of a `.twin.json` v1 file
//   view    → the deep-link grammar of `?map=`, `?look=`, `?bg=`, `?solar=`,
//             `?view=`, plus an exact camera
//
// Never carries secrets: the layers part goes through the same scrubbing as a
// layer export, and twin sources never include their request headers.
//
// Pure: no DOM, no stores.

import type { DeviceSource, Binding } from '../twin/devices'

export const SCENE_FORMAT = 'ifc-viewer-scene'
export const SCENE_VERSION = 1
/** JSON Schema of v1 — editors offer completion and checks when a file names it. */
export const SCENE_SCHEMA_URL = 'https://www.ifcvieweronline.eu/schemas/scene-v1.json'

export interface SceneModel {
  /** http(s) URL, or a same-origin path starting with "/". */
  url: string
  /** Display / file name (default: from the URL). */
  name?: string
}

export interface SceneCamera {
  /** Scene coordinates (metres, Y up), as tours and BCF viewpoints use them. */
  position: [number, number, number]
  target: [number, number, number]
}

export interface SceneView {
  /** `?map=` grammar: "1", "terrain", "terrain,buildings", "showcase"… */
  map?: string
  /** `?look=` grammar (needs map). */
  look?: string
  /** `?bg=` grammar: a preset id or a #rrggbb colour. */
  background?: string
  /** `?solar=` grammar: [YYYY-]MM-DDTHH:MM. */
  solar?: string
  /** `?view=` preset: iso, top, front… (ignored when `camera` is set). */
  view?: string
  camera?: SceneCamera
}

export interface SceneMeta {
  title: string
  description?: string
  author?: string
  /** Licence of THIS scene document (the data keep their own, see layers' attribution). */
  license?: string
  tags?: string[]
  place?: { name?: string; lat?: number; lon?: number }
  createdAt?: string
  /**
   * Things a visitor must know before trusting what they see ("asset values in
   * the IFC are illustrative"). Shown when the scene opens.
   */
  notes?: string[]
}

export interface SceneDoc {
  $schema?: string
  format: typeof SCENE_FORMAT
  v: typeof SCENE_VERSION
  meta: SceneMeta
  models: SceneModel[]
  /** Entries of an `ifc-viewer-data-layers` v1 file, as exported. */
  layers: unknown[]
  twin: { sources: DeviceSource[]; bindings: Binding[] } | null
  view: SceneView
}

/** What a scene reads from the network, for "which sources does this use?". */
export interface SceneSource {
  kind: 'model' | 'layer' | 'device'
  name: string
  url: string
  attribution: string | null
  /** Live: refreshed while the scene is open. */
  live: boolean
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const isUrl = (v: unknown): v is string => typeof v === 'string' && (/^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v))
const vec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

export type SceneValidation =
  | { ok: true; doc: SceneDoc; warnings: string[] }
  | { ok: false; errors: string[] }

/**
 * Check a parsed document. Errors stop the scene (wrong format, a newer
 * version, nothing to show); warnings drop one part and keep the rest (a
 * model URL that is not http(s), a camera with five numbers). Messages name
 * the JSON path, so a hand-edited file says where it is wrong.
 */
export function validateSceneDoc(input: unknown): SceneValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!isObj(input)) return { ok: false, errors: ['The scene is not a JSON object.'] }
  if (input.format !== SCENE_FORMAT) return { ok: false, errors: [`format: expected "${SCENE_FORMAT}".`] }
  if (typeof input.v !== 'number') return { ok: false, errors: ['v: missing version number.'] }
  if (input.v > SCENE_VERSION) return { ok: false, errors: [`v: this scene is version ${input.v}; this viewer reads up to ${SCENE_VERSION}.`] }

  const metaIn = isObj(input.meta) ? input.meta : {}
  if (!isObj(input.meta)) warnings.push('meta: missing; using an untitled scene.')
  const meta: SceneMeta = { title: typeof metaIn.title === 'string' && metaIn.title.trim() ? metaIn.title.trim() : 'Untitled scene' }
  for (const k of ['description', 'author', 'license', 'createdAt'] as const) if (typeof metaIn[k] === 'string') meta[k] = metaIn[k] as string
  if (Array.isArray(metaIn.tags)) meta.tags = metaIn.tags.filter((t): t is string => typeof t === 'string')
  if (Array.isArray(metaIn.notes)) meta.notes = metaIn.notes.filter((t): t is string => typeof t === 'string')
  if (isObj(metaIn.place)) {
    const p = metaIn.place
    meta.place = {
      ...(typeof p.name === 'string' ? { name: p.name } : {}),
      ...(typeof p.lat === 'number' && Math.abs(p.lat) <= 90 ? { lat: p.lat } : {}),
      ...(typeof p.lon === 'number' && Math.abs(p.lon) <= 180 ? { lon: p.lon } : {}),
    }
  }

  const models: SceneModel[] = []
  if (input.models !== undefined && !Array.isArray(input.models)) warnings.push('models: not a list; ignored.')
  ;(Array.isArray(input.models) ? input.models : []).forEach((m, i) => {
    if (!isObj(m) || !isUrl(m.url)) { warnings.push(`models[${i}].url: not an http(s) URL or a "/" path; model skipped.`); return }
    models.push({ url: m.url, ...(typeof m.name === 'string' ? { name: m.name } : {}) })
  })

  let layers: unknown[] = []
  if (input.layers !== undefined) {
    if (!Array.isArray(input.layers)) warnings.push('layers: not a list; ignored.')
    else layers = input.layers.filter((l, i) => {
      const ok = isObj(l) && typeof l.name === 'string' && isObj(l.source)
      if (!ok) warnings.push(`layers[${i}]: not a layer entry (needs name and source); skipped.`)
      return ok
    })
  }

  let twin: SceneDoc['twin'] = null
  if (input.twin !== undefined && input.twin !== null) {
    const t = input.twin
    if (!isObj(t) || !Array.isArray(t.sources) || !Array.isArray(t.bindings)) warnings.push('twin: needs sources and bindings lists; ignored.')
    else {
      const sources = t.sources.filter((s): s is DeviceSource => isObj(s) && typeof s.id === 'string' && typeof s.url === 'string' && isObj(s.mapping))
        .map((s) => ({ ...s, name: String(s.name ?? s.url), intervalS: Math.max(1, Number(s.intervalS) || 30), enabled: s.enabled !== false }))
      const ids = new Set(sources.map((s) => s.id))
      const bindings = t.bindings.filter((b): b is Binding => isObj(b) && typeof b.id === 'string' && typeof b.sourceId === 'string'
        && ids.has(b.sourceId) && typeof b.deviceId === 'string' && Array.isArray(b.targets) && Array.isArray(b.rules))
        .map((b) => ({ ...b, staleColor: b.staleColor ?? null, staleAfterS: Number(b.staleAfterS) || 0 }))
      if (sources.length < t.sources.length) warnings.push(`twin.sources: ${t.sources.length - sources.length} invalid source(s) skipped.`)
      if (bindings.length < t.bindings.length) warnings.push(`twin.bindings: ${t.bindings.length - bindings.length} binding(s) without a valid source skipped.`)
      twin = { sources, bindings }
    }
  }

  const viewIn = isObj(input.view) ? input.view : {}
  const view: SceneView = {}
  for (const k of ['map', 'look', 'background', 'solar', 'view'] as const) {
    const v = viewIn[k]
    if (v === undefined) continue
    if (typeof v === 'string' && v.trim() && v.length <= 200) view[k] = v.trim()
    else warnings.push(`view.${k}: expected a short string; ignored.`)
  }
  if (viewIn.camera !== undefined) {
    const c = viewIn.camera
    if (isObj(c) && vec3(c.position) && vec3(c.target)) view.camera = { position: c.position, target: c.target }
    else warnings.push('view.camera: needs position and target as [x, y, z]; ignored.')
  }

  if (models.length === 0 && layers.length === 0) errors.push('The scene has no models and no layers: there is nothing to show.')
  if (errors.length) return { ok: false, errors }
  return { ok: true, doc: { format: SCENE_FORMAT, v: SCENE_VERSION, meta, models, layers, twin, view }, warnings }
}

/** Parse + validate a scene from text. */
export function parseSceneDoc(text: string): SceneValidation {
  let json: unknown
  try { json = JSON.parse(text) } catch { return { ok: false, errors: ['The file is not valid JSON.'] } }
  return validateSceneDoc(json)
}

/** Cheap sniff: is this text a scene document? */
export function isSceneDoc(text: string): boolean {
  const head = text.slice(0, 300)
  return head.includes(`"format": "${SCENE_FORMAT}"`) || head.includes(`"format":"${SCENE_FORMAT}"`)
}

/**
 * The deep-link half of a scene: the query parameters the app already reads.
 * Layers and the twin are not URL-shaped and are applied by their importers.
 */
export function sceneToQuery(doc: SceneDoc): URLSearchParams {
  const q = new URLSearchParams()
  for (const m of doc.models) q.append('model', m.url)
  if (doc.models.some((m) => m.name)) for (const m of doc.models) q.append('name', m.name ?? '')
  const v = doc.view
  if (v.map) q.set('map', v.map)
  if (v.map && v.look) q.set('look', v.look)
  if (v.background) q.set('bg', v.background)
  if (v.solar) q.set('solar', v.solar)
  if (v.camera) q.set('camera', [...v.camera.position, ...v.camera.target].map((n) => +n.toFixed(3)).join(','))
  else if (v.view) q.set('view', v.view)
  return q
}

/** Everything the scene fetches, with its attribution — the "data sources" panel and docs. */
export function sceneSources(doc: SceneDoc): SceneSource[] {
  const out: SceneSource[] = doc.models.map((m) => ({
    kind: 'model', name: m.name ?? decodeURIComponent(m.url.split('/').pop() ?? m.url), url: m.url, attribution: null, live: false,
  }))
  for (const l of doc.layers) {
    if (!isObj(l)) continue
    const feed = isObj(l.feed) ? l.feed : null
    const src = isObj(l.source) ? l.source : {}
    const url = (feed && typeof feed.url === 'string' ? feed.url : null)
      ?? (typeof l.fetchUrl === 'string' ? l.fetchUrl : null)
      ?? (typeof src.url === 'string' ? src.url : typeof src.endpoint === 'string' ? src.endpoint : null)
    if (!url) continue
    const live = isObj(l.live) && l.live.enabled === true
    out.push({ kind: 'layer', name: String(l.name), url, attribution: typeof l.attribution === 'string' ? l.attribution : null, live })
    const geomUrl = feed && isObj(feed.join) && typeof feed.join.geomUrl === 'string' ? feed.join.geomUrl : null
    if (geomUrl) out.push({ kind: 'layer', name: `${String(l.name)} (geometry)`, url: geomUrl, attribution: typeof l.attribution === 'string' ? l.attribution : null, live: false })
  }
  for (const s of doc.twin?.sources ?? []) {
    if (/^(sim|sample):/.test(s.url)) continue
    out.push({ kind: 'device', name: s.name, url: s.url, attribution: null, live: s.enabled })
  }
  return out
}

/** Assemble a scene from its parts (what "Export scene" writes). */
export function buildSceneDoc(parts: {
  meta: SceneMeta
  models: SceneModel[]
  layers: unknown[]
  twin: SceneDoc['twin']
  view: SceneView
}): SceneDoc {
  return {
    $schema: SCENE_SCHEMA_URL,
    format: SCENE_FORMAT, v: SCENE_VERSION,
    meta: { ...parts.meta, createdAt: parts.meta.createdAt ?? new Date().toISOString() },
    models: parts.models, layers: parts.layers,
    twin: parts.twin && (parts.twin.sources.length || parts.twin.bindings.length) ? {
      // Request headers (API keys) never leave the device that typed them.
      sources: parts.twin.sources.map(({ id, name, url, intervalS, mapping, enabled }) => ({ id, name, url, intervalS, mapping, enabled })),
      bindings: parts.twin.bindings,
    } : null,
    view: parts.view,
  }
}
