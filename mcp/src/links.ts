// ─── links.ts ─────────────────────────────────────────────────────────────────
// Links into the browser viewer at www.ifcvieweronline.eu. The viewer runs
// entirely in the visitor's browser, so a link costs nothing to serve: the
// server builds the URL, the person (or the AI client) opens it.

import portLibrary from '../../src/demo-models/port-library.json'
import { PORT_SITE, searchPort, portCategories, type PortObject } from '../../src/demo-models/port-library'
import { fixGuidePath } from '../../src/lib/fix-guide-url'

export const SITE = 'https://www.ifcvieweronline.eu'

export type ViewPreset = 'iso' | 'top' | 'front' | 'back' | 'left' | 'right' | 'bottom'
export type UiPreset = 'full' | 'minimal' | 'kiosk' | 'client' | 'article'

export interface ViewerLinkOptions {
  /** Public http(s) URLs of IFC files. Several load as one federated scene. */
  models: string[]
  ui?: UiPreset
  view?: ViewPreset
  /** Drop the models on the city map at their own georeference. */
  map?: boolean
  /** Run validation after load (drives the Health Score badge). */
  validate?: boolean
  /** Isolate one IFC class, e.g. IfcWall. */
  isolate?: string
  /** Open the drawings pane with a floor plan cut from the model. */
  drawingsPlan?: boolean
  lang?: string
  /** Public point-cloud URLs to load with the models. */
  scans?: string[]
}

/** Throws if `u` is not a public http(s) URL — the viewer cannot read local paths. */
export function assertPublicUrl(u: string): string {
  let url: URL
  try { url = new URL(u) } catch { throw new Error(`"${u}" is not a URL. The browser viewer needs a public http(s) link to the file (a local path only works with validate_ifc and check_ids).`) }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`"${u}" must be an http(s) URL.`)
  return url.toString()
}

export function viewerUrl(o: ViewerLinkOptions): string {
  if (!o.models.length) throw new Error('Give at least one model URL.')
  const p = new URLSearchParams()
  for (const m of o.models) p.append('model', assertPublicUrl(m))
  for (const s of o.scans ?? []) p.append('scan', assertPublicUrl(s))
  if (o.ui) p.set('ui', o.ui)
  if (o.view) p.set('view', o.view)
  if (o.map) p.set('map', '1')
  if (o.validate === false) p.set('validate', '0')
  if (o.isolate) p.set('isolate', o.isolate)
  if (o.drawingsPlan) p.set('drawings', 'plan')
  if (o.lang) p.set('lang', o.lang)
  return `${SITE}/?${p.toString()}`
}

/** An <iframe> for a web page, docs site or dashboard. */
export function embedHtml(o: ViewerLinkOptions, title = 'IFC model in 3D'): string {
  const src = viewerUrl({ ui: 'article', view: 'iso', ...o }).replace(/&/g, '&amp;')
  return `<iframe src="${src}" title="${title.replace(/"/g, '&quot;')}" width="100%" height="520" style="border:0;border-radius:8px" loading="lazy" allow="fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`
}

export function fixGuideUrl(ruleId: string, lang = 'en'): string {
  return `${SITE}/${fixGuidePath(ruleId, lang)}`
}

// ── 3D sketch ─────────────────────────────────────────────────────────────────

export const SKETCH_URL = `${SITE}/sketch/`

// ── Digital twins ─────────────────────────────────────────────────────────────

export interface TwinScene { id: string; title: string; city: string; live: string; url: string; embed: string }

const scene = (id: string, title: string, city: string, live: string): TwinScene => {
  const doc = `${SITE}/scenes/${id}.scene.json`
  const q = `scene=${encodeURIComponent(doc)}`
  return { id, title, city, live, url: `${SITE}/?${q}`, embed: `${SITE}/?${q}&ui=article` }
}

/** The ready-made city twins served with the viewer (public/scenes). */
export const TWIN_SCENES: TwinScene[] = [
  scene('barcelona-placa-catalunya', 'Barcelona · Plaça de Catalunya — open-data digital twin', 'Barcelona', 'Bicing bikes, Endolla EV chargers, street traffic, air quality'),
  scene('helsinki-rautatientori', 'Helsinki · Rautatientori — open-data digital twin', 'Helsinki', 'FMI air-quality and weather stations, buses'),
  scene('tokyo-tochomae', 'Tokyo · Tochōmae — Toei Ōedo line digital twin', 'Tokyo', 'Ōedo line status, Toei stations and buses'),
  scene('tokyo-waseda', 'Tokyo · Waseda — Toden Arakawa line digital twin', 'Tokyo', 'Trams at the stop, Toei stations'),
]

export const TWIN_BUILDER_URL = `${SITE}/twin-builder/`

// ── Port de Barcelona IFC library ─────────────────────────────────────────────

const PORT = portLibrary as PortObject[]

export interface PortHit { id: string; name: string; category: string; schema?: string; lod?: string; sizeKb?: number; viewerUrl?: string; ifcUrl?: string; sourceUrl: string }

export function portSearch(query: string, category?: string, limit = 20): { categories: string[]; total: number; results: PortHit[] } {
  const found = searchPort(PORT, query, category ?? null)
  return {
    categories: portCategories(PORT),
    total: found.length,
    results: found.slice(0, limit).map((o) => {
      const ifcUrl = o.file ? `${SITE}/models/port-bcn/${encodeURIComponent(o.file)}` : undefined
      return {
        id: o.id, name: o.name, category: o.category, schema: o.schema, lod: o.lod,
        sizeKb: o.size ? Math.round(o.size / 1000) : undefined,
        ifcUrl, viewerUrl: ifcUrl ? viewerUrl({ models: [ifcUrl], view: 'iso' }) : undefined,
        sourceUrl: PORT_SITE,
      }
    }),
  }
}
