// ─── Drawings store ───────────────────────────────────────────────────────────
// The sheets open next to the model. Files stay in memory in this tab: nothing
// is uploaded and, for now, nothing survives a reload (export to keep it).

import { create } from 'zustand'
import { IDENTITY, LAYER_PALETTE, robustBounds, shownEntities, type Drawing, type Entity, type Layer, type NewEntity, type Placement } from '../lib/drawing/types'

export type DrawingTool = 'select' | 'pan' | 'line' | 'polyline' | 'rect' | 'circle' | 'text' | 'dimension' | 'calibrate' | 'align'

interface Snapshot { entities: Entity[]; layers: Layer[]; placement: Placement; metresPerUnit: number | null }

const MAX_UNDO = 60
let seq = 1
let entitySeq = 1

export const withIds = (list: NewEntity[]): Entity[] => list.map((e) => ({ ...e, id: entitySeq++ } as Entity))

export interface DrawingInput {
  name: string
  source: Drawing['source']
  layers: Layer[]
  entities: NewEntity[]
  page?: Drawing['page']
  metresPerUnit?: number | null
  skipped?: Record<string, number>
  placement?: Placement
  elevation?: number
  lineWeight?: number
}

/**
 * Where a new sheet lands: scaled by what its units say, centred on what is
 * already open. A sheet with its own coordinates would otherwise be kilometres
 * from the plan it is meant to match, and two clicks can't align what you can't see.
 */
export function initialPlacement(input: Pick<DrawingInput, 'entities' | 'page' | 'metresPerUnit'> & { layers?: Layer[] }, others: Drawing[]): Placement {
  const scale = input.metresPerUnit ?? 1
  const own = robustBounds({ entities: shownEntities(input.entities as Entity[], input.layers ?? []), page: input.page })
  const ref = others.find((d) => d.visible && (d.entities.length || d.page))
  const refB = ref ? robustBounds({ entities: shownEntities(ref.entities, ref.layers), page: ref.page }) : null
  if (!own || !refB) return { ...IDENTITY, scale }
  const c = { x: (refB.minX + refB.maxX) / 2, y: (refB.minY + refB.maxY) / 2 }
  const q = ref!.placement
  const cos = Math.cos(q.rotation) * q.scale; const sin = Math.sin(q.rotation) * q.scale
  const target = { x: cos * c.x - sin * c.y + q.x, y: sin * c.x + cos * c.y + q.y }
  // A picture or a unitless file: same width as the reference, so it can be seen at all.
  const refW = (refB.maxX - refB.minX) * q.scale
  const finalScale = input.metresPerUnit ? scale : refW / Math.max(own.maxX - own.minX, 1e-9)
  return {
    scale: finalScale, rotation: 0,
    x: target.x - ((own.minX + own.maxX) / 2) * finalScale,
    y: target.y - ((own.minY + own.maxY) / 2) * finalScale,
  }
}

interface DrawingState {
  panelOpen: boolean
  drawings: Drawing[]
  activeId: string | null
  tool: DrawingTool
  activeLayer: string | null
  selectedId: number | null
  /** White paper instead of the dark CAD background. */
  paper: boolean
  liveData: boolean
  pendingFiles: File[]
  undo: Record<string, Snapshot[]>
  redo: Record<string, Snapshot[]>
  setPanelOpen(open: boolean): void
  enqueueFiles(files: File[]): void
  takePendingFiles(): File[]
  addDrawing(input: DrawingInput): string
  removeDrawing(id: string): void
  setActive(id: string): void
  setTool(tool: DrawingTool): void
  setActiveLayer(name: string | null): void
  select(id: number | null): void
  setPaper(paper: boolean): void
  setLiveData(on: boolean): void
  patch(id: string, p: Partial<Pick<Drawing, 'visible' | 'in3d' | 'elevation' | 'name' | 'page' | 'opacity'>>): void
  /** Undoable: every change to a sheet's content or placement goes through here. */
  edit(id: string, change: (d: Drawing) => Partial<Pick<Drawing, 'entities' | 'layers' | 'placement' | 'metresPerUnit'>>): void
  addEntities(id: string, list: NewEntity[]): void
  undoEdit(): void
  redoEdit(): void
  /** Sheets saved in this browser come back, ids and all. */
  hydrate(list: Drawing[]): void
}

const snap = (d: Drawing): Snapshot => ({ entities: d.entities, layers: d.layers, placement: d.placement, metresPerUnit: d.metresPerUnit })

export const useDrawingStore = create<DrawingState>()((set, get) => ({
  panelOpen: false,
  drawings: [],
  activeId: null,
  tool: 'select',
  activeLayer: null,
  selectedId: null,
  paper: false,
  liveData: true,
  pendingFiles: [],
  undo: {},
  redo: {},

  setPanelOpen: (panelOpen) => set({ panelOpen }),
  enqueueFiles: (files) => set((s) => ({ pendingFiles: [...s.pendingFiles, ...files], panelOpen: true })),
  takePendingFiles: () => { const f = get().pendingFiles; if (f.length) set({ pendingFiles: [] }); return f },

  addDrawing(input) {
    const id = `drawing-${seq++}`
    const s = get()
    // A generated sheet is someone else's geometry: markup goes on a layer of its own.
    const generated = ['plan', 'section', 'scan', 'diff'].includes(input.source)
    const layers = !input.layers.length
      ? [{ name: '0', color: LAYER_PALETTE[0], visible: true, locked: false }]
      : generated ? [...input.layers, { name: 'Markup', color: '#ffb020', visible: true, locked: false }] : input.layers
    const drawing: Drawing = {
      id, name: input.name, source: input.source, layers,
      entities: withIds(input.entities), page: input.page,
      placement: input.placement ?? initialPlacement(input, s.drawings),
      metresPerUnit: input.metresPerUnit ?? null,
      visible: true, in3d: false, elevation: input.elevation ?? 0, lineWeight: input.lineWeight,
      skipped: input.skipped ?? {},
    }
    set({ drawings: [...s.drawings, drawing], activeId: id, activeLayer: generated && input.layers.length ? 'Markup' : layers[0].name, selectedId: null, tool: 'select' })
    return id
  },
  removeDrawing(id) {
    set((s) => {
      const drawings = s.drawings.filter((d) => d.id !== id)
      const activeId = s.activeId === id ? drawings[drawings.length - 1]?.id ?? null : s.activeId
      const active = drawings.find((d) => d.id === activeId)
      return { drawings, activeId, activeLayer: active?.layers[0]?.name ?? null, selectedId: null }
    })
  },
  setActive(id) {
    const d = get().drawings.find((x) => x.id === id)
    if (d) set({ activeId: id, activeLayer: d.layers[0]?.name ?? null, selectedId: null })
  },
  setTool: (tool) => set({ tool, selectedId: tool === 'select' ? get().selectedId : null }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  select: (selectedId) => set({ selectedId }),
  setPaper: (paper) => set({ paper }),
  setLiveData: (liveData) => set({ liveData }),
  patch: (id, p) => set((s) => ({ drawings: s.drawings.map((d) => (d.id === id ? { ...d, ...p } : d)) })),
  edit(id, change) {
    set((s) => {
      const d = s.drawings.find((x) => x.id === id)
      if (!d) return s
      return {
        drawings: s.drawings.map((x) => (x.id === id ? { ...x, ...change(x) } : x)),
        undo: { ...s.undo, [id]: [...(s.undo[id] ?? []).slice(-MAX_UNDO + 1), snap(d)] },
        redo: { ...s.redo, [id]: [] },
      }
    })
  },
  addEntities(id, list) {
    get().edit(id, (d) => ({ entities: [...d.entities, ...withIds(list)] }))
  },
  undoEdit() {
    set((s) => {
      const id = s.activeId
      const stack = id ? s.undo[id] : null
      const d = s.drawings.find((x) => x.id === id)
      if (!id || !d || !stack?.length) return s
      const prev = stack[stack.length - 1]
      return {
        drawings: s.drawings.map((x) => (x.id === id ? { ...x, ...prev } : x)),
        undo: { ...s.undo, [id]: stack.slice(0, -1) },
        redo: { ...s.redo, [id]: [...(s.redo[id] ?? []), snap(d)] },
        selectedId: null,
      }
    })
  },
  hydrate(list) {
    if (!list.length) return
    set((s) => {
      const have = new Set(s.drawings.map((d) => d.id))
      const fresh = list.filter((d) => !have.has(d.id))
      for (const d of fresh) {
        seq = Math.max(seq, Number(d.id.split('-')[1]) + 1 || seq)
        for (const e of d.entities) if (e.id >= entitySeq) entitySeq = e.id + 1
      }
      const drawings = [...fresh, ...s.drawings]
      const activeId = s.activeId ?? drawings[drawings.length - 1]?.id ?? null
      const active = drawings.find((d) => d.id === activeId)
      return { drawings, activeId, activeLayer: s.activeLayer ?? active?.layers[0]?.name ?? null }
    })
  },
  redoEdit() {
    set((s) => {
      const id = s.activeId
      const stack = id ? s.redo[id] : null
      const d = s.drawings.find((x) => x.id === id)
      if (!id || !d || !stack?.length) return s
      const next = stack[stack.length - 1]
      return {
        drawings: s.drawings.map((x) => (x.id === id ? { ...x, ...next } : x)),
        redo: { ...s.redo, [id]: stack.slice(0, -1) },
        undo: { ...s.undo, [id]: [...(s.undo[id] ?? []), snap(d)] },
        selectedId: null,
      }
    })
  },
}))
