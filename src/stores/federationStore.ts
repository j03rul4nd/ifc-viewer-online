// ─── Federation store ─────────────────────────────────────────────────────────
// Presentation state of a multi-model set: per-model opacity, colour by
// discipline, and the saved views. Opacity and colour are per session (keyed by
// model id, cleared with the scene); views persist on the device, keyed by
// file name (see lib/federation).

import { create } from 'zustand'
import {
  DISCIPLINE_COLORS, detectDiscipline, sanitizeStoredView, mergeImportedViews,
  type Discipline, type FederationView,
} from '../lib/federation'

const VIEWS_KEY = 'ifc-federation-views-v1'
export const MAX_VIEWS = 30

function readViews(): FederationView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map(sanitizeStoredView).filter((v): v is FederationView => v !== null).slice(0, MAX_VIEWS)
  } catch { return [] }
}

function writeViews(views: FederationView[]): void {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)) } catch { /* quota / private mode */ }
}

/**
 * A model taken out of the scene to free GPU memory but kept in the set: its
 * IFC bytes stay here (this tab only) so it reloads in one click without the
 * file dialog. Bytes live outside the reactive state — they are big and never
 * rendered.
 */
export interface ParkedModel {
  id: string
  fileName: string
  fileSize: number
  parkedAt: number
}
const parkedBytes = new Map<string, ArrayBuffer>()
export const takeParkedBytes = (id: string): ArrayBuffer | null => {
  const b = parkedBytes.get(id) ?? null
  parkedBytes.delete(id)
  return b
}

interface FederationStore {
  opacityById: Record<string, number>
  /** Discipline the user set by hand, overriding the file-name guess. */
  disciplineById: Record<string, Discipline>
  colorByDiscipline: boolean
  views: FederationView[]
  parked: ParkedModel[]

  park: (fileName: string, bytes: ArrayBuffer) => void
  /** Drop a parked entry (after it was reloaded, or to forget it). */
  unpark: (id: string) => void
  setOpacity: (id: string, opacity: number) => void
  setDiscipline: (id: string, d: Discipline) => void
  setColorByDiscipline: (on: boolean) => void
  saveView: (view: FederationView) => void
  /** Views from a federation file: never replace or push out local ones (see mergeImportedViews). */
  importViews: (views: FederationView[]) => { imported: FederationView[]; skipped: number }
  deleteView: (id: string) => void
  forgetModel: (id: string) => void
  reset: () => void
}

export const useFederationStore = create<FederationStore>()((set, get) => ({
  opacityById: {},
  disciplineById: {},
  colorByDiscipline: false,
  views: readViews(),
  parked: [],

  park: (fileName, bytes) => set((s) => {
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    parkedBytes.set(id, bytes)
    for (const p of s.parked) if (p.fileName === fileName) parkedBytes.delete(p.id)
    return { parked: [...s.parked.filter((p) => p.fileName !== fileName), { id, fileName, fileSize: bytes.byteLength, parkedAt: Date.now() }] }
  }),
  unpark: (id) => set((s) => {
    parkedBytes.delete(id)
    return { parked: s.parked.filter((p) => p.id !== id) }
  }),

  setOpacity: (id, opacity) => set((s) => ({ opacityById: { ...s.opacityById, [id]: opacity } })),
  setDiscipline: (id, d) => set((s) => ({ disciplineById: { ...s.disciplineById, [id]: d } })),
  setColorByDiscipline: (on) => set({ colorByDiscipline: on }),
  saveView: (view) => set((s) => {
    const views = [view, ...s.views.filter((v) => v.name !== view.name)].slice(0, MAX_VIEWS)
    writeViews(views)
    return { views }
  }),
  importViews: (incoming) => {
    const r = mergeImportedViews(get().views, incoming, MAX_VIEWS)
    if (r.imported.length > 0) { writeViews(r.views); set({ views: r.views }) }
    return { imported: r.imported, skipped: r.skipped }
  },
  deleteView: (id) => set((s) => {
    const views = s.views.filter((v) => v.id !== id)
    writeViews(views)
    return { views }
  }),
  forgetModel: (id) => set((s) => {
    const { [id]: _o, ...opacityById } = s.opacityById
    const { [id]: _d, ...disciplineById } = s.disciplineById
    return { opacityById, disciplineById }
  }),
  // Views are the user's, not the scene's: they survive a reset.
  reset: () => {
    parkedBytes.clear()
    set({ opacityById: {}, disciplineById: {}, colorByDiscipline: false, parked: [] })
  },
}))

/** The discipline of a model: the user's choice, else the file name's. */
export function disciplineOf(m: { id: string; fileName: string }, overrides: Record<string, Discipline>): Discipline {
  return overrides[m.id] ?? detectDiscipline(m.fileName)
}

export const disciplineColor = (d: Discipline): string => DISCIPLINE_COLORS[d]
