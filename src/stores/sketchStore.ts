import { create } from 'zustand'
import {
  commit, createDoc, redo, replacePresent, startHistory, undo, type History,
} from '../lib/sketch/document'
import { EMPTY_BRAND, type SketchBrand } from '../lib/sketch/brand'
import type { BrushPreset } from '../lib/sketch/brushes'
import type { KeyOverrides } from '../lib/sketch/keymap'
import type { Symmetry } from '../lib/sketch/edit'
import { DEFAULT_INK, type InkSettings } from '../lib/sketch/ink'
import { presetPlane } from '../lib/sketch/plane'
import { DEFAULT_ORBIT, type SketchRenderer } from '../lib/sketch/renderer'
import type { BrushKind, OrbitState, ReferenceImage, SketchDoc, SketchPlane } from '../lib/sketch/types'

// ── Sketch studio state ───────────────────────────────────────────────────────
// One store, so a panel subscribes to the field it shows and a stroke re-renders
// none of them. What moves per pointer event never comes here: the live stroke
// stays in the input hook. The drawing tools persist, because a brush is a
// working preference. The document persists elsewhere (IndexedDB).

export type SketchTool = BrushKind | 'line' | 'eraser' | 'pick' | 'lasso' | 'picker' | 'reshape' | 'laser'
export type PanelTab = 'ink' | 'plane' | 'view' | 'layers' | 'file'

export interface ContextEntry { id: string; name: string; kind: 'mesh' | 'points'; visible: boolean }

export interface PenInfo { kind: string; pressure: number; tilt: number; hasPressure: boolean }

interface Prefs {
  tool: SketchTool
  color: string
  width: number
  ink: InkSettings
  snapEnds: boolean
  fingerDraw: boolean
  railSide: 'left' | 'right'
  railOpen: boolean
  tab: PanelTab
  opacity: number
  colorB: string
  recent: string[]
  symmetry: Symmetry
  eraser: 'part' | 'stroke'
  brushes: BrushPreset[]
  keys: KeyOverrides
  /** Draw on the axis plane most facing the view, chosen as each stroke starts. */
  autoPlane: boolean
  /** A stroke that starts on a line end carries the plane there. */
  anchorStart: boolean
}

const KEY = 'ifc-sketch:prefs:v1'
const DEFAULTS: Prefs = {
  tool: 'pen', color: '#17130F', width: 3, ink: DEFAULT_INK, snapEnds: true,
  fingerDraw: true, railSide: 'left', railOpen: true, tab: 'ink',
  opacity: 1, colorB: '#FFFFFF', recent: [], symmetry: 'off', eraser: 'part', brushes: [], keys: {}, autoPlane: false, anchorStart: true,
}

function loadPrefs(): Prefs {
  if (typeof localStorage === 'undefined') return DEFAULTS
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    return { ...DEFAULTS, ...saved, ink: { ...DEFAULT_INK, ...saved.ink } }
  } catch {
    return DEFAULTS
  }
}

export interface SketchState extends Prefs {
  history: History
  images: ReferenceImage[]
  plane: SketchPlane
  orbit: OrbitState
  engine: SketchRenderer | null
  context: ContextEntry[]
  usingPen: boolean
  pen: PenInfo | null
  drawing: boolean
  /** Lassoed stroke ids. */
  selection: string[]
  uiHidden: boolean
  brand: SketchBrand
  /** Presenting: a minimal bar, and the audience window follows. */
  meeting: boolean
  /** The laser, as a share of the drawing's box. Null when off. */
  laser: { x: number; y: number } | null
  /** A link or an audience window: nothing here is edited or saved. */
  readOnly: boolean
  refsOpen: boolean
  sheetOpen: boolean
  preparing: boolean
  recording: boolean
  saveFailed: boolean
  gpuLost: boolean
  notice: string

  setPrefs: (patch: Partial<Prefs>) => void
  setInk: (patch: Partial<InkSettings>) => void
  set: (patch: Partial<Omit<SketchState, keyof Prefs>>) => void
  /** An edit that undo can step back over. */
  edit: (change: (doc: SketchDoc) => SketchDoc | null) => boolean
  /** A change that is not a step: page switch, thumbnail, a sweep under way. */
  touch: (change: (doc: SketchDoc) => SketchDoc) => void
  undo: () => void
  redo: () => void
  flash: (message: string) => void
}

export const useSketchStore = create<SketchState>()((set, get) => ({
  ...loadPrefs(),
  history: startHistory(createDoc()),
  images: [],
  plane: presetPlane('front'),
  orbit: DEFAULT_ORBIT,
  engine: null,
  context: [],
  usingPen: false,
  pen: null,
  drawing: false,
  selection: [],
  uiHidden: false,
  brand: EMPTY_BRAND,
  meeting: false,
  laser: null,
  readOnly: false,
  refsOpen: false,
  sheetOpen: false,
  preparing: false,
  recording: false,
  saveFailed: false,
  gpuLost: false,
  notice: '',

  setPrefs: (patch) => {
    set(patch)
    const { tool, color, width, ink, snapEnds, fingerDraw, railSide, railOpen, tab, opacity, colorB, recent, symmetry, eraser, brushes, keys, autoPlane, anchorStart } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify({ tool, color, width, ink, snapEnds, fingerDraw, railSide, railOpen, tab, opacity, colorB, recent, symmetry, eraser, brushes, keys, autoPlane, anchorStart }))
    } catch { /* private mode: the session still works */ }
  },
  setInk: (patch) => get().setPrefs({ ink: { ...get().ink, ...patch } }),
  set: (patch) => set(patch),
  edit: (change) => {
    const { history } = get()
    const next = change(history.present)
    if (!next) return false
    set({ history: commit(history, next) })
    return true
  },
  touch: (change) => set((s) => ({ history: replacePresent(s.history, change(s.history.present)) })),
  undo: () => set((s) => ({ history: undo(s.history) })),
  redo: () => set((s) => ({ history: redo(s.history) })),
  flash: (notice) => {
    set({ notice })
    window.setTimeout(() => { if (get().notice === notice) set({ notice: '' }) }, 3200)
  },
}))
