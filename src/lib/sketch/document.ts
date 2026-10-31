// ─── Editing the document ─────────────────────────────────────────────────────
// Every edit returns a new document that shares what it did not touch. Undo is
// therefore a list of earlier documents, and holding a hundred of them costs
// little more than holding one.

import type { PaperKind, PlacedImage, SavedView, SketchDoc, SketchLayer, SketchPage, Stroke } from './types'

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export function createLayer(name: string): SketchLayer {
  return { id: newId(), name, visible: true, locked: false, strokes: [] }
}

export function createPage(layerName = '1'): SketchPage {
  const layer = createLayer(layerName)
  return { id: newId(), layers: [layer], activeLayerId: layer.id, placed: [], views: [], thumb: '' }
}

export function createDoc(): SketchDoc {
  const page = createPage()
  return { version: 1, pages: [page], activePageId: page.id, paper: 'warm' }
}

export const activePage = (doc: SketchDoc): SketchPage =>
  doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0]

export const activeLayer = (page: SketchPage): SketchLayer =>
  page.layers.find((l) => l.id === page.activeLayerId) ?? page.layers[0]

function updatePage(doc: SketchDoc, patch: (page: SketchPage) => SketchPage): SketchDoc {
  const current = activePage(doc)
  return { ...doc, pages: doc.pages.map((p) => (p === current ? patch(p) : p)) }
}

function updateLayer(page: SketchPage, id: string, patch: (layer: SketchLayer) => SketchLayer): SketchPage {
  return { ...page, layers: page.layers.map((l) => (l.id === id ? patch(l) : l)) }
}

/** Null when the active layer cannot take it, so the caller can say why. */
export function addStroke(doc: SketchDoc, stroke: Stroke): SketchDoc | null {
  const layer = activeLayer(activePage(doc))
  if (layer.locked || !layer.visible) return null
  return updatePage(doc, (page) => updateLayer(page, layer.id, (l) => ({ ...l, strokes: [...l.strokes, stroke] })))
}

export function removeStrokes(doc: SketchDoc, ids: ReadonlySet<string>): SketchDoc {
  if (ids.size === 0) return doc
  return updatePage(doc, (page) => ({
    ...page,
    layers: page.layers.map((l) =>
      l.locked || !l.strokes.some((s) => ids.has(s.id)) ? l : { ...l, strokes: l.strokes.filter((s) => !ids.has(s.id)) },
    ),
  }))
}

export function clearLayer(doc: SketchDoc): SketchDoc {
  const layer = activeLayer(activePage(doc))
  if (layer.locked) return doc
  return updatePage(doc, (page) => updateLayer(page, layer.id, (l) => ({ ...l, strokes: [] })))
}

export function addLayer(doc: SketchDoc, name: string): SketchDoc {
  const layer = createLayer(name)
  return updatePage(doc, (page) => ({ ...page, layers: [...page.layers, layer], activeLayerId: layer.id }))
}

export function patchLayer(doc: SketchDoc, id: string, patch: Partial<Pick<SketchLayer, 'visible' | 'locked' | 'name'>>): SketchDoc {
  return updatePage(doc, (page) => updateLayer(page, id, (l) => ({ ...l, ...patch })))
}

export function setActiveLayer(doc: SketchDoc, id: string): SketchDoc {
  return updatePage(doc, (page) => ({ ...page, activeLayerId: id }))
}

/** The last layer stays: a page with nothing to draw on is a dead end. */
export function deleteLayer(doc: SketchDoc, id: string): SketchDoc {
  return updatePage(doc, (page) => {
    if (page.layers.length <= 1) return page
    const layers = page.layers.filter((l) => l.id !== id)
    return { ...page, layers, activeLayerId: page.activeLayerId === id ? layers[layers.length - 1].id : page.activeLayerId }
  })
}

export function addPage(doc: SketchDoc): SketchDoc {
  const page = createPage()
  return { ...doc, pages: [...doc.pages, page], activePageId: page.id }
}

export function setActivePage(doc: SketchDoc, id: string): SketchDoc {
  return doc.pages.some((p) => p.id === id) ? { ...doc, activePageId: id } : doc
}

export function deletePage(doc: SketchDoc, id: string): SketchDoc {
  if (doc.pages.length <= 1) return doc
  const at = doc.pages.findIndex((p) => p.id === id)
  const pages = doc.pages.filter((p) => p.id !== id)
  return { ...doc, pages, activePageId: doc.activePageId === id ? pages[Math.max(0, at - 1)].id : doc.activePageId }
}

export function setPageThumb(doc: SketchDoc, id: string, thumb: string): SketchDoc {
  return { ...doc, pages: doc.pages.map((p) => (p.id === id ? { ...p, thumb } : p)) }
}

export const addView = (doc: SketchDoc, view: SavedView): SketchDoc =>
  updatePage(doc, (page) => ({ ...page, views: [...page.views, view] }))

export const removeView = (doc: SketchDoc, id: string): SketchDoc =>
  updatePage(doc, (page) => ({ ...page, views: page.views.filter((v) => v.id !== id) }))

export const placeImage = (doc: SketchDoc, placed: PlacedImage): SketchDoc =>
  updatePage(doc, (page) => ({ ...page, placed: [...page.placed, placed] }))

export const patchPlaced = (doc: SketchDoc, id: string, patch: Partial<Pick<PlacedImage, 'opacity'>>): SketchDoc =>
  updatePage(doc, (page) => ({ ...page, placed: page.placed.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))

export const removePlaced = (doc: SketchDoc, id: string): SketchDoc =>
  updatePage(doc, (page) => ({ ...page, placed: page.placed.filter((p) => p.id !== id) }))

/** Removes an image from the library: nothing may keep pointing at missing bytes. */
export function forgetImage(doc: SketchDoc, imageId: string): SketchDoc {
  return { ...doc, pages: doc.pages.map((p) => (p.placed.some((i) => i.imageId === imageId) ? { ...p, placed: p.placed.filter((i) => i.imageId !== imageId) } : p)) }
}

export const setPaper = (doc: SketchDoc, paper: PaperKind): SketchDoc => ({ ...doc, paper })

// ── History ──────────────────────────────────────────────────────────────────

export const HISTORY_LIMIT = 200

export interface History {
  past: readonly SketchDoc[]
  present: SketchDoc
  future: readonly SketchDoc[]
}

export const startHistory = (present: SketchDoc): History => ({ past: [], present, future: [] })

export function commit(h: History, next: SketchDoc): History {
  if (next === h.present) return h
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] }
}

/** Changes what is shown without being a step of its own: page thumbnails, say. */
export const replacePresent = (h: History, next: SketchDoc): History => ({ ...h, present: next })

export function undo(h: History): History {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo(h: History): History {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}

// ── Reading back what was saved or imported ──────────────────────────────────

/** A file from anywhere: refuse what is not a sketch instead of half-loading it. */
export function isSketchDoc(value: unknown): value is SketchDoc {
  const d = value as Partial<SketchDoc> | null
  return !!d && d.version === 1 && Array.isArray(d.pages) && d.pages.length > 0 && typeof d.activePageId === 'string'
    && d.pages.every((p) => Array.isArray(p?.layers) && p.layers.length > 0 && (p.layers as SketchLayer[]).every((l) => Array.isArray(l?.strokes)))
}

/** JSON for a file: Float32Arrays do not survive JSON.stringify on their own. */
export function serializeDoc(doc: SketchDoc): string {
  return JSON.stringify(doc, (_key, value) => (value instanceof Float32Array ? Array.from(value, (n) => Math.round(n * 1e4) / 1e4) : value))
}

export function parseDoc(text: string): SketchDoc | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (!isSketchDoc(raw)) return null
  return {
    ...raw,
    pages: raw.pages.map((p) => ({
      ...p,
      placed: p.placed ?? [],
      views: p.views ?? [],
      layers: p.layers.map((l) => ({
        ...l,
        strokes: l.strokes.map((s) => ({ ...s, points: Float32Array.from(s.points as unknown as number[]) })),
      })),
    })),
  }
}
