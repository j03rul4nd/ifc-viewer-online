// ─── Presentation store (Tour Mode — D-24) ─────────────────────────────────────
// State for the guided validation walkthrough: the current tour (session-only,
// deliberately NOT persisted to OPFS — see D-24), the recorder's draft stops,
// and playback position. Serialisable-only rule (D-05/D-18): camera poses are
// plain {position, target} objects; all Three.js work stays in viewer.ts.
//
// Lifecycle events (tour:started / tour:step-changed / tour:completed) are
// emitted by the components driving playback, not by the store — the store is
// a passive state holder (same division as validationStore vs validator.ts).

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Tour, TourStep } from '../types'

export type TourMode = 'idle' | 'recording' | 'playing'

interface PresentationStore {
  /** The active tour (auto-generated or manually recorded). Session-only. */
  tour: Tour | null
  mode: TourMode
  /** Playback position (only meaningful while mode === 'playing'). */
  stepIndex: number
  /** "Isolate this element" toggle for the current step (presenter choice). */
  isolateActive: boolean
  /** Presentation template that produced the current tour (D-26); null = none/manual. */
  templateId: string | null

  /** Replace the whole tour (auto-generation or import). */
  setTour: (tour: Tour | null) => void
  setTemplateId: (id: string | null) => void
  /** Open/close the manual recorder. */
  setRecording: (on: boolean) => void
  /** Append a manually captured stop (creates a manual tour when none exists). */
  addStep: (step: TourStep) => void
  removeStep: (stepId: string) => void
  /** Move a step to a new index (drag-to-reorder / arrow buttons). */
  moveStep: (stepId: string, toIndex: number) => void
  updateCaption: (stepId: string, caption: string) => void
  /** Enter playback at a given step. */
  play: (startAt?: number) => void
  setStepIndex: (index: number) => void
  setIsolateActive: (on: boolean) => void
  /** Leave playback (back to idle or recording). */
  exitPlayback: () => void
  /** Full reset on navigate-to-landing. */
  resetPresentation: () => void
}

function emptyManualTour(): Tour {
  return { id: crypto.randomUUID(), title: '', steps: [], createdFrom: 'manual' }
}

export const usePresentationStore = create<PresentationStore>()(
  devtools(
    (set) => ({
      tour: null,
      mode: 'idle' as TourMode,
      stepIndex: 0,
      isolateActive: false,
      templateId: null,

      setTour: (tour) =>
        set({ tour, stepIndex: 0 }, false, 'setTour'),

      setTemplateId: (id) =>
        set({ templateId: id }, false, 'setTemplateId'),

      setRecording: (on) =>
        set(
          (s) => ({ ...s, mode: on ? 'recording' : 'idle' as TourMode }),
          false,
          'setRecording',
        ),

      addStep: (step) =>
        set(
          (s) => {
            const tour = s.tour ?? emptyManualTour()
            return { ...s, tour: { ...tour, steps: [...tour.steps, step] } }
          },
          false,
          'addStep',
        ),

      removeStep: (stepId) =>
        set(
          (s) => {
            if (!s.tour) return s
            return { ...s, tour: { ...s.tour, steps: s.tour.steps.filter((st) => st.id !== stepId) } }
          },
          false,
          'removeStep',
        ),

      moveStep: (stepId, toIndex) =>
        set(
          (s) => {
            if (!s.tour) return s
            const steps = [...s.tour.steps]
            const from = steps.findIndex((st) => st.id === stepId)
            if (from === -1) return s
            const to = Math.min(Math.max(0, toIndex), steps.length - 1)
            if (from === to) return s
            const [moved] = steps.splice(from, 1)
            steps.splice(to, 0, moved)
            return { ...s, tour: { ...s.tour, steps } }
          },
          false,
          'moveStep',
        ),

      updateCaption: (stepId, caption) =>
        set(
          (s) => {
            if (!s.tour) return s
            return {
              ...s,
              tour: {
                ...s.tour,
                steps: s.tour.steps.map((st) => st.id === stepId ? { ...st, caption: caption || undefined } : st),
              },
            }
          },
          false,
          'updateCaption',
        ),

      play: (startAt = 0) =>
        set(
          (s) => {
            if (!s.tour || s.tour.steps.length === 0) return s
            const idx = Math.min(Math.max(0, startAt), s.tour.steps.length - 1)
            return { ...s, mode: 'playing' as TourMode, stepIndex: idx, isolateActive: false }
          },
          false,
          'play',
        ),

      setStepIndex: (index) =>
        set(
          (s) => {
            if (!s.tour) return s
            const idx = Math.min(Math.max(0, index), s.tour.steps.length - 1)
            return { ...s, stepIndex: idx }
          },
          false,
          'setStepIndex',
        ),

      setIsolateActive: (on) =>
        set({ isolateActive: on }, false, 'setIsolateActive'),

      exitPlayback: () =>
        set(
          (s) => ({
            ...s,
            // Manual tours go back to the recorder; auto tours back to idle.
            mode: (s.tour?.createdFrom === 'manual' ? 'recording' : 'idle') as TourMode,
            isolateActive: false,
          }),
          false,
          'exitPlayback',
        ),

      resetPresentation: () =>
        set(
          { tour: null, mode: 'idle' as TourMode, stepIndex: 0, isolateActive: false, templateId: null },
          false,
          'resetPresentation',
        ),
    }),
    { name: 'PresentationStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ──────────────────────────────────────────────────────────────────

export const selectTour          = (s: PresentationStore) => s.tour
export const selectTourMode      = (s: PresentationStore) => s.mode
export const selectStepIndex     = (s: PresentationStore) => s.stepIndex
export const selectIsolateActive = (s: PresentationStore) => s.isolateActive
export const selectCurrentStep   = (s: PresentationStore) =>
  s.tour && s.mode === 'playing' ? s.tour.steps[s.stepIndex] ?? null : null
