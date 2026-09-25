// ─── Point cloud store ────────────────────────────────────────────────────────
// Single source of truth for point cloud *intent and status*. The 3D resources
// live in src/lib/pointcloud/point-cloud-system.ts; this store never holds a
// Three object or a typed array (repo convention: serialisable state only).
//
// Async safety is PER LOAD. A parse is stale when its own load was aborted, when
// its own entry is gone, or when `epoch` moved — and only clearClouds() moves
// it. removeCloud() deliberately does not: it used to bump the same global
// epoch, so removing ANY cloud (an errored row, an id that was already gone, the
// four removals a temporal replay makes on start) failed every sibling still
// parsing with `error.cancelled` and froze every COPC already streaming. See
// pc-runner for the per-load check.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createLogger } from '../lib/logger'
import {
  clampOffset, DEFAULT_DISPLAY, MAX_POINTS_DEFAULT, RENDER_BUDGET_DEFAULT,
  type AlignmentOffset, type PointCloudAlignment, type PointCloudDisplay, type UpAxis,
  type PointCloudEntry, type PointColorMode,
} from '../lib/pointcloud/pc-types'

const log = createLogger('PointCloudStore')

const LS_DISPLAY = 'ifc-pc-display:v1'
const LS_BUDGET  = 'ifc-pc-budget:v1'

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch (e) { log.warn(`localStorage write failed for ${key}:`, e) }
}

const COLOR_MODES: PointColorMode[] = ['rgb', 'intensity', 'elevation', 'classification', 'flat']

/** Persisted display prefs, field by field — a corrupt entry must not brick the panel. */
export function parseDisplay(raw: string | null): PointCloudDisplay {
  if (!raw) return { ...DEFAULT_DISPLAY }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_DISPLAY }
    const o = parsed as Record<string, unknown>
    const num = (key: keyof PointCloudDisplay, min: number, max: number): number => {
      const v = o[key]
      return typeof v === 'number' && Number.isFinite(v)
        ? Math.min(max, Math.max(min, v))
        : (DEFAULT_DISPLAY[key] as number)
    }
    const bool = (key: keyof PointCloudDisplay): boolean =>
      typeof o[key] === 'boolean' ? o[key] as boolean : DEFAULT_DISPLAY[key] as boolean

    return {
      pointSize: num('pointSize', 0.5, 20),
      attenuate: bool('attenuate'),
      opacity: num('opacity', 0.05, 1),
      colorMode: COLOR_MODES.includes(o.colorMode as PointColorMode)
        ? o.colorMode as PointColorMode : DEFAULT_DISPLAY.colorMode,
      flatColor: typeof o.flatColor === 'number' ? o.flatColor : DEFAULT_DISPLAY.flatColor,
      density: num('density', 0.05, 1),
      confidenceThreshold: num('confidenceThreshold', 0, 1),
      round: bool('round'),
      edl: bool('edl'),
    }
  } catch {
    return { ...DEFAULT_DISPLAY }
  }
}

/**
 * Where a manual placement gets written. Installed by the lazy point cloud chunk
 * (pc-runner) rather than imported here: the toolbar imports this store eagerly,
 * and the writer lives beside proj4 in pc-align. Registering it keeps proj4 out
 * of the entry bundle — the same reason clampOffset sits in pc-types.
 */
let onOffsetPersist: ((fileKey: string, offset: AlignmentOffset) => void) | null = null

let onUpAxisPersist: ((fileKey: string, axis: UpAxis) => void) | null = null

export function registerOffsetPersistence(
  fn: (fileKey: string, offset: AlignmentOffset) => void,
  upAxisFn?: (fileKey: string, axis: UpAxis) => void,
): void {
  onOffsetPersist = fn
  if (upAxisFn) onUpAxisPersist = upAxisFn
}

function readBudget(): number {
  const v = parseInt(lsGet(LS_BUDGET) ?? '', 10)
  return Number.isFinite(v) && v >= 250_000 && v <= 20_000_000 ? v : RENDER_BUDGET_DEFAULT
}

// ── Store types ────────────────────────────────────────────────────────────────

interface PointCloudStore {
  clouds: PointCloudEntry[]
  /** Which cloud the transform controls operate on. */
  activeCloudId: string | null
  panelOpen: boolean
  /** Display settings, shared by every cloud (persisted). */
  display: PointCloudDisplay
  /** Points drawn per frame at density 1 (persisted). */
  renderBudget: number
  /** Hard ceiling on resident points across all clouds. */
  maxPoints: number
  /**
   * Scene-clear token — bumped by clearClouds() ONLY. Removing one cloud is
   * detected per load, from that cloud's own entry disappearing; see the header.
   */
  epoch: number

  setPanelOpen: (open: boolean) => void
  /** Register a cloud the moment its parse starts, so the UI can show progress. */
  addCloud: (entry: PointCloudEntry) => void
  updateCloud: (id: string, patch: Partial<PointCloudEntry>) => void
  removeCloud: (id: string) => void
  setActiveCloud: (id: string | null) => void
  setVisible: (id: string, visible: boolean) => void
  setAlignment: (id: string, alignment: PointCloudAlignment) => void
  /** Merge a manual nudge into the active alignment. Clamped. */
  setOffset: (id: string, offset: Partial<AlignmentOffset>) => void
  /**
   * Correct which axis the source treats as up.
   *
   * Writes to the FRAME rather than to the alignment, because the frame is the
   * single source of truth the aligner reads — leaving the two to disagree is
   * how a cloud ends up rendering one way and reporting another. The caller
   * re-runs the alignment afterwards.
   */
  setUpAxis: (id: string, axis: UpAxis) => void
  resetOffset: (id: string) => void
  setDisplay: (patch: Partial<PointCloudDisplay>) => void
  setRenderBudget: (budget: number) => void
  /** Drop every cloud — called on navigate-to-landing. */
  clearClouds: () => void
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const usePointCloudStore = create<PointCloudStore>()(
  devtools(
    (set, get) => ({
      clouds: [],
      activeCloudId: null,
      panelOpen: false,
      display: parseDisplay(lsGet(LS_DISPLAY)),
      renderBudget: readBudget(),
      maxPoints: MAX_POINTS_DEFAULT,
      epoch: 0,

      setPanelOpen: (open) => set({ panelOpen: open }, false, 'setPanelOpen'),

      addCloud: (entry) =>
        set(
          (s) => ({
            clouds: [...s.clouds.filter((c) => c.id !== entry.id), entry],
            activeCloudId: entry.id,
          }),
          false,
          'addCloud',
        ),

      updateCloud: (id, patch) =>
        set(
          (s) => ({ clouds: s.clouds.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
          false,
          'updateCloud',
        ),

      removeCloud: (id) =>
        set(
          (s) => {
            // An id that is not here changes nothing — returning the same state
            // keeps a redundant removal (panel X after the runner already
            // dropped a cancelled row) from notifying every subscriber.
            if (!s.clouds.some((c) => c.id === id)) return s
            const clouds = s.clouds.filter((c) => c.id !== id)
            return {
              clouds,
              // No epoch bump: see the header. The runner of THIS cloud notices
              // its entry is gone; its siblings must not notice anything.
              activeCloudId: s.activeCloudId === id ? (clouds[clouds.length - 1]?.id ?? null) : s.activeCloudId,
            }
          },
          false,
          'removeCloud',
        ),

      setActiveCloud: (id) => set({ activeCloudId: id }, false, 'setActiveCloud'),

      setVisible: (id, visible) =>
        set(
          (s) => ({ clouds: s.clouds.map((c) => (c.id === id ? { ...c, visible } : c)) }),
          false,
          'setVisible',
        ),

      setAlignment: (id, alignment) =>
        set(
          (s) => ({ clouds: s.clouds.map((c) => (c.id === id ? { ...c, alignment } : c)) }),
          false,
          'setAlignment',
        ),

      setOffset: (id, offset) =>
        set(
          (s) => ({
            clouds: s.clouds.map((c) => {
              if (c.id !== id || !c.alignment) return c
              const next = clampOffset({ ...c.alignment.offset, ...offset })
              // Persisted per file, so a placement the user worked out survives a
              // reload. Written here rather than in the panel because every path
              // that moves a cloud goes through this action.
              onOffsetPersist?.(c.fileKey, next)
              return { ...c, alignment: { ...c.alignment, offset: next } }
            }),
          }),
          false,
          'setOffset',
        ),

      setUpAxis: (id, axis) =>
        set(
          (s) => ({
            clouds: s.clouds.map((c) => {
              if (c.id !== id || !c.frame) return c
              // 'user' outranks both 'declared' and 'assumed' from here on, so
              // the panel stops offering a guess it no longer owns.
              onUpAxisPersist?.(c.fileKey, axis)
              return { ...c, frame: { ...c.frame, upAxis: axis, upAxisSource: 'user' } }
            }),
          }),
          false,
          'setUpAxis',
        ),

      resetOffset: (id) =>
        set(
          (s) => ({
            clouds: s.clouds.map((c) => {
              if (c.id !== id || !c.alignment) return c
              const identity = clampOffset({})
              onOffsetPersist?.(c.fileKey, identity)
              return { ...c, alignment: { ...c.alignment, offset: identity } }
            }),
          }),
          false,
          'resetOffset',
        ),

      setDisplay: (patch) => {
        const display = { ...get().display, ...patch }
        lsSet(LS_DISPLAY, JSON.stringify(display))
        set({ display }, false, 'setDisplay')
      },

      setRenderBudget: (budget) => {
        const clamped = Math.min(20_000_000, Math.max(250_000, Math.round(budget)))
        lsSet(LS_BUDGET, String(clamped))
        set({ renderBudget: clamped }, false, 'setRenderBudget')
      },

      // Display settings are a device preference: they deliberately survive a
      // clear, so the next cloud opens in the look the user chose.
      clearClouds: () =>
        set((s) => ({ clouds: [], activeCloudId: null, epoch: s.epoch + 1 }), false, 'clearClouds'),
    }),
    { name: 'PointCloudStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ──────────────────────────────────────────────────────────────────

export const selectClouds       = (s: PointCloudStore): PointCloudEntry[] => s.clouds
export const selectDisplay      = (s: PointCloudStore): PointCloudDisplay => s.display
export const selectPanelOpen    = (s: PointCloudStore): boolean => s.panelOpen
export const selectActiveCloud  = (s: PointCloudStore): PointCloudEntry | null =>
  s.clouds.find((c) => c.id === s.activeCloudId) ?? null
/** Points resident across every cloud — the number the memory badge shows. */
export const selectTotalPoints  = (s: PointCloudStore): number =>
  s.clouds.reduce((sum, c) => sum + c.pointCount, 0)
