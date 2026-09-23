// ─── Clip Studio store ─────────────────────────────────────────────────────────
// State of the multi-clip editor. The project itself (lib/capture/project.ts)
// is plain data; media are held BY REFERENCE (Blob / ImageBitmap handles, the
// same allowance captureStore makes for its clip — D-05/D-18): nothing here is
// a Three.js object or a copied buffer.
//
// Every project edit goes through `edit()`, which records the previous state,
// so undo/redo covers everything the user can change on the timeline.

import { create } from 'zustand'
import type { Recipe } from '../lib/director/recipe'
import { devtools } from 'zustand/middleware'
import { clampTracks, createProject, projectDuration, type EditProject } from '../lib/capture/project'
import type { SourceMedia } from '../lib/capture/project-export'
import type { ProjectFill } from '../lib/capture/project-compositor'
import { PLATFORM_SPECS, type Platform } from '../lib/capture/auto-edit'

export type StudioSelection =
  | { kind: 'clip'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'overlay'; id: string }
  | null

export type OutputPreset = Platform | 'square' | 'wide'

export interface StudioOutput {
  preset: OutputPreset
  width: number
  height: number
  fps: number
  fill: ProjectFill
  watermark: boolean
}

export const OUTPUT_PRESETS: Record<OutputPreset, { width: number; height: number }> = {
  reel: { width: PLATFORM_SPECS.reel.width, height: PLATFORM_SPECS.reel.height },
  tiktok: { width: PLATFORM_SPECS.tiktok.width, height: PLATFORM_SPECS.tiktok.height },
  linkedin: { width: PLATFORM_SPECS.linkedin.width, height: PLATFORM_SPECS.linkedin.height },
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
}

export interface StudioJob {
  label: string
  /** 0–1, or null while indeterminate. */
  progress: number | null
}

const MAX_HISTORY = 60

interface ClipStudioState {
  open: boolean
  project: EditProject
  media: Map<string, SourceMedia>
  selection: StudioSelection
  playhead: number
  output: StudioOutput
  job: StudioJob | null
  past: EditProject[]
  future: EditProject[]
  /** Project before the drag in progress, so a whole drag is ONE undo step. */
  gestureBase: EditProject | null

  openStudio: () => void
  /** A presentation the studio should generate as soon as it is open (tour player, other entry points). */
  pendingRecipe: Recipe | null
  requestGenerate: (recipe: Recipe) => void
  takePendingRecipe: () => Recipe | null
  closeStudio: () => void
  /** Apply a project edit and record it for undo. */
  edit: (fn: (p: EditProject) => EditProject) => void
  /** Start/finish a drag: edits in between collapse into one undo step. */
  beginGesture: () => void
  endGesture: () => void
  /** Replace the whole project (auto clip) — also undoable. */
  replaceProject: (p: EditProject, media?: Map<string, SourceMedia>) => void
  addMedia: (id: string, media: SourceMedia) => void
  undo: () => void
  redo: () => void
  select: (s: StudioSelection) => void
  setPlayhead: (t: number) => void
  setOutput: (patch: Partial<StudioOutput>) => void
  setPreset: (preset: OutputPreset) => void
  setJob: (job: StudioJob | null) => void
}

const DEFAULT_OUTPUT: StudioOutput = {
  preset: 'reel', ...OUTPUT_PRESETS.reel, fps: 30, fill: 'crop', watermark: false,
}

export const useClipStudioStore = create<ClipStudioState>()(
  devtools(
    (set, get) => ({
      open: false,
      project: createProject(),
      media: new Map(),
      selection: null,
      playhead: 0,
      output: DEFAULT_OUTPUT,
      job: null,
      past: [],
      future: [],
      gestureBase: null,

      openStudio: () => set({ open: true }, false, 'studio/open'),
      pendingRecipe: null,
      requestGenerate: (recipe) => set({ open: true, pendingRecipe: recipe }, false, 'studio/requestGenerate'),
      takePendingRecipe: () => {
        const r = get().pendingRecipe
        if (r) set({ pendingRecipe: null }, false, 'studio/takePending')
        return r
      },
      closeStudio: () => set({ open: false, job: null }, false, 'studio/close'),

      edit: (fn) => {
        const prev = get().project
        const next = clampTracks(fn(prev))
        if (next === prev) return
        const inGesture = get().gestureBase !== null
        set((s) => ({
          project: next,
          past: inGesture ? s.past : [...s.past, prev].slice(-MAX_HISTORY),
          future: inGesture ? s.future : [],
          playhead: Math.min(s.playhead, projectDuration(next)),
        }), false, 'studio/edit')
      },

      beginGesture: () => set((s) => ({ gestureBase: s.gestureBase ?? s.project }), false, 'studio/gesture'),
      endGesture: () => set((s) => {
        const base = s.gestureBase
        if (!base) return s
        if (base === s.project) return { gestureBase: null }
        return { gestureBase: null, past: [...s.past, base].slice(-MAX_HISTORY), future: [] }
      }, false, 'studio/gestureEnd'),

      replaceProject: (p, media) => set((s) => ({
        project: p,
        media: media ?? s.media,
        past: [...s.past, s.project].slice(-MAX_HISTORY),
        future: [],
        selection: null,
        playhead: 0,
      }), false, 'studio/replace'),

      addMedia: (id, m) => set((s) => {
        const media = new Map(s.media)
        media.set(id, m)
        return { media }
      }, false, 'studio/addMedia'),

      undo: () => set((s) => {
        const prev = s.past[s.past.length - 1]
        if (!prev) return s
        return { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], selection: null }
      }, false, 'studio/undo'),

      redo: () => set((s) => {
        const next = s.future[0]
        if (!next) return s
        return { project: next, future: s.future.slice(1), past: [...s.past, s.project], selection: null }
      }, false, 'studio/redo'),

      select: (selection) => set({ selection }, false, 'studio/select'),
      setPlayhead: (t) => set({ playhead: Math.max(0, t) }, false, 'studio/playhead'),
      setOutput: (patch) => set((s) => ({ output: { ...s.output, ...patch } }), false, 'studio/output'),
      setPreset: (preset) => set((s) => ({ output: { ...s.output, preset, ...OUTPUT_PRESETS[preset] } }), false, 'studio/preset'),
      setJob: (job) => set({ job }, false, 'studio/job'),
    }),
    { name: 'clipStudio' },
  ),
)
