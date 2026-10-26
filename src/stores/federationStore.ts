// ─── Federation store ─────────────────────────────────────────────────────────
// Presentation state of a multi-model set: per-model opacity, colour by
// discipline, and the saved views. Opacity and colour are per session (keyed by
// model id, cleared with the scene); views persist on the device, keyed by
// file name (see lib/federation).

import { create } from 'zustand'
import { DISCIPLINE_COLORS, detectDiscipline, type Discipline, type FederationView } from '../lib/federation'

const VIEWS_KEY = 'ifc-federation-views-v1'
const MAX_VIEWS = 30

function readViews(): FederationView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.name === 'string' && v.visible) : []
  } catch { return [] }
}

function writeViews(views: FederationView[]): void {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)) } catch { /* quota / private mode */ }
}

interface FederationStore {
  opacityById: Record<string, number>
  /** Discipline the user set by hand, overriding the file-name guess. */
  disciplineById: Record<string, Discipline>
  colorByDiscipline: boolean
  views: FederationView[]

  setOpacity: (id: string, opacity: number) => void
  setDiscipline: (id: string, d: Discipline) => void
  setColorByDiscipline: (on: boolean) => void
  saveView: (view: FederationView) => void
  deleteView: (id: string) => void
  forgetModel: (id: string) => void
  reset: () => void
}

export const useFederationStore = create<FederationStore>()((set) => ({
  opacityById: {},
  disciplineById: {},
  colorByDiscipline: false,
  views: readViews(),

  setOpacity: (id, opacity) => set((s) => ({ opacityById: { ...s.opacityById, [id]: opacity } })),
  setDiscipline: (id, d) => set((s) => ({ disciplineById: { ...s.disciplineById, [id]: d } })),
  setColorByDiscipline: (on) => set({ colorByDiscipline: on }),
  saveView: (view) => set((s) => {
    const views = [view, ...s.views.filter((v) => v.name !== view.name)].slice(0, MAX_VIEWS)
    writeViews(views)
    return { views }
  }),
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
  reset: () => set({ opacityById: {}, disciplineById: {}, colorByDiscipline: false }),
}))

/** The discipline of a model: the user's choice, else the file name's. */
export function disciplineOf(m: { id: string; fileName: string }, overrides: Record<string, Discipline>): Discipline {
  return overrides[m.id] ?? detectDiscipline(m.fileName)
}

export const disciplineColor = (d: Discipline): string => DISCIPLINE_COLORS[d]
