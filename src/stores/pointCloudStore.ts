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
  type PointCloudEntry, type PointColorMode, type CloudStyleOverride,
  CLOUD_STYLE_KEYS,
} from '../lib/pointcloud/pc-types'
import { pickIdentityColor } from '../lib/pointcloud/pc-style'
import { readCloudPrefs, writeCloudPrefs } from '../lib/pointcloud/pc-prefs'
import { nextSelection, type ClickMode } from '../lib/selection'

const log = createLogger('PointCloudStore')

const LS_DISPLAY = 'ifc-pc-display:v1'
const LS_BUDGET  = 'ifc-pc-budget:v1'

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch (e) { log.warn(`localStorage write failed for ${key}:`, e) }
}

export const COLOR_MODES: PointColorMode[] = ['rgb', 'intensity', 'elevation', 'classification', 'flat', 'scan', 'topic']

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
      // Analysis filters are session state — see PointCloudDisplay.
      sliceEnabled: DEFAULT_DISPLAY.sliceEnabled,
      sliceMin: DEFAULT_DISPLAY.sliceMin,
      sliceMax: DEFAULT_DISPLAY.sliceMax,
      classMask: DEFAULT_DISPLAY.classMask,
      contours: DEFAULT_DISPLAY.contours,
      contourInterval: DEFAULT_DISPLAY.contourInterval,
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

/** A style override validated like parseDisplay; undefined keys dropped; {} → null. */
function cleanStyle(style: CloudStyleOverride | null | undefined): CloudStyleOverride | null {
  if (!style) return null
  const out: CloudStyleOverride = {}
  if (style.colorMode !== undefined && COLOR_MODES.includes(style.colorMode)) out.colorMode = style.colorMode
  if (typeof style.flatColor === 'number' && Number.isFinite(style.flatColor)) {
    out.flatColor = Math.min(0xFFFFFF, Math.max(0, Math.round(style.flatColor)))
  }
  if (typeof style.pointSize === 'number' && Number.isFinite(style.pointSize)) {
    out.pointSize = Math.min(20, Math.max(0.5, style.pointSize))
  }
  if (typeof style.opacity === 'number' && Number.isFinite(style.opacity)) {
    out.opacity = Math.min(1, Math.max(0.05, style.opacity))
  }
  return Object.keys(out).length ? out : null
}

function scopeFor(ids: string[], clouds: PointCloudEntry[]): 'all' | 'selection' {
  return ids.length > 0 && clouds.length >= 2 ? 'selection' : 'all'
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
  /** Scene default display (persisted). Scans may override CLOUD_STYLE_KEYS (entry.style). */
  display: PointCloudDisplay
  /** Session selection, in clouds order. May be empty. */
  selectedCloudIds: string[]
  selectionAnchorId: string | null
  /** What style edits target; see selectEffectiveScope for the effective one. */
  editScope: 'all' | 'selection'
  /** The 'Sample scans and LiDAR demos' disclosure. */
  samplesOpen: boolean
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

  /** List click with Explorer rules, over `order` (default: load order). */
  clickCloud: (id: string, mode: ClickMode, order?: readonly string[]) => void
  selectClouds: (ids: string[], anchor?: string | null) => void
  clearSelection: () => void
  setEditScope: (scope: 'all' | 'selection') => void
  /** Display name, persisted per file; '' or null → the file name. */
  renameCloud: (id: string, name: string | null) => void
  /** Identity colour, persisted per file. */
  setCloudColor: (id: string, color: number) => void
  /** Merge per-scan overrides (null clears), persisted per file. */
  setCloudStyle: (ids: readonly string[], patch: CloudStyleOverride | null) => void
  /** Scene default AND strip those fields from every scan: 'All' means all. */
  setDisplayAll: (patch: Partial<PointCloudDisplay>) => void
  clearCloudStyles: () => void
  openSamples: () => void
  setSamplesOpen: (open: boolean) => void
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
      selectedCloudIds: [],
      selectionAnchorId: null,
      editScope: 'all',
      samplesOpen: false,

      setPanelOpen: (open) => set({ panelOpen: open }, false, 'setPanelOpen'),

      // Never touches the selection: an auto-selected new scan would silently
      // turn the next style edit into an override. It still becomes the active
      // cloud (the SDK's default target).
      addCloud: (entry) =>
        set(
          (s) => {
            const others = s.clouds.filter((c) => c.id !== entry.id)
            const prefs = readCloudPrefs(entry.fileKey)
            let color = entry.color ?? prefs.color
            if (color === undefined) {
              color = pickIdentityColor(others.map((c) => c.color).filter((c): c is number => c !== undefined))
              writeCloudPrefs(entry.fileKey, { color })
            }
            const next: PointCloudEntry = {
              ...entry,
              name: entry.name ?? prefs.name ?? null,
              color,
              style: entry.style ?? cleanStyle(prefs.style),
            }
            return { clouds: [...others, next], activeCloudId: entry.id }
          },
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
            const selectedCloudIds = s.selectedCloudIds.filter((x) => x !== id)
            return {
              clouds,
              selectedCloudIds,
              selectionAnchorId: s.selectionAnchorId === id ? null : s.selectionAnchorId,
              editScope: selectedCloudIds.length === 0 || clouds.length < 2 ? 'all' : s.editScope,
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
        set((s) => ({
          clouds: [], activeCloudId: null, epoch: s.epoch + 1,
          selectedCloudIds: [], selectionAnchorId: null, editScope: 'all', samplesOpen: false,
        }), false, 'clearClouds'),

      clickCloud: (id, mode, order) =>
        set(
          (s) => {
            const ids = s.clouds.map((c) => c.id)
            if (!ids.includes(id)) return s
            const next = nextSelection(
              { ids: s.selectedCloudIds, anchor: s.selectionAnchorId }, id, mode,
              (order ?? ids).filter((x) => ids.includes(x)),
            )
            // Keep the clouds order whatever surface was clicked.
            const selected = ids.filter((x) => next.ids.includes(x))
            const activeCloudId = selected.includes(id) ? id
              : s.activeCloudId && selected.includes(s.activeCloudId) ? s.activeCloudId
                : selected[selected.length - 1] ?? s.activeCloudId
            return {
              selectedCloudIds: selected, selectionAnchorId: next.anchor, activeCloudId,
              editScope: scopeFor(selected, s.clouds),
            }
          },
          false,
          'clickCloud',
        ),

      selectClouds: (ids, anchor) =>
        set(
          (s) => {
            const want = new Set(ids)
            const selected = s.clouds.map((c) => c.id).filter((x) => want.has(x))
            return {
              selectedCloudIds: selected,
              selectionAnchorId: anchor !== undefined ? anchor : (selected[0] ?? null),
              activeCloudId: selected.length ? (s.activeCloudId && want.has(s.activeCloudId) ? s.activeCloudId : selected[selected.length - 1]) : s.activeCloudId,
              editScope: scopeFor(selected, s.clouds),
            }
          },
          false,
          'selectClouds',
        ),

      clearSelection: () =>
        set({ selectedCloudIds: [], selectionAnchorId: null, editScope: 'all' }, false, 'clearSelection'),

      setEditScope: (scope) =>
        set((s) => ({ editScope: s.selectedCloudIds.length === 0 ? 'all' : scope }), false, 'setEditScope'),

      renameCloud: (id, name) =>
        set(
          (s) => {
            const clean = (name ?? '').trim().slice(0, 80) || null
            return {
              clouds: s.clouds.map((c) => {
                if (c.id !== id) return c
                writeCloudPrefs(c.fileKey, { name: clean })
                return { ...c, name: clean }
              }),
            }
          },
          false,
          'renameCloud',
        ),

      setCloudColor: (id, color) =>
        set(
          (s) => {
            const clean = Math.min(0xFFFFFF, Math.max(0, Math.round(Number.isFinite(color) ? color : 0)))
            return {
              clouds: s.clouds.map((c) => {
                if (c.id !== id) return c
                writeCloudPrefs(c.fileKey, { color: clean })
                return { ...c, color: clean }
              }),
            }
          },
          false,
          'setCloudColor',
        ),

      setCloudStyle: (ids, patch) =>
        set(
          (s) => {
            const want = new Set(ids)
            return {
              clouds: s.clouds.map((c) => {
                if (!want.has(c.id)) return c
                const style = patch === null ? null : cleanStyle({ ...(c.style ?? {}), ...patch })
                writeCloudPrefs(c.fileKey, { style })
                return { ...c, style }
              }),
            }
          },
          false,
          'setCloudStyle',
        ),

      setDisplayAll: (patch) => {
        get().setDisplay(patch)
        const keys = CLOUD_STYLE_KEYS.filter((k) => k in patch)
        if (keys.length === 0) return
        set(
          (s) => ({
            clouds: s.clouds.map((c) => {
              if (!c.style || !keys.some((k) => k in c.style!)) return c
              const rest = { ...c.style }
              for (const k of keys) delete rest[k]
              const style = cleanStyle(rest)
              writeCloudPrefs(c.fileKey, { style })
              return { ...c, style }
            }),
          }),
          false,
          'setDisplayAll',
        )
      },

      clearCloudStyles: () =>
        set(
          (s) => ({
            clouds: s.clouds.map((c) => {
              if (!c.style) return c
              writeCloudPrefs(c.fileKey, { style: null })
              return { ...c, style: null }
            }),
          }),
          false,
          'clearCloudStyles',
        ),

      openSamples: () => set({ panelOpen: true, samplesOpen: true }, false, 'openSamples'),
      setSamplesOpen: (open) => set({ samplesOpen: open }, false, 'setSamplesOpen'),
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

export const selectCloudById = (id: string) => (s: PointCloudStore): PointCloudEntry | null =>
  s.clouds.find((c) => c.id === id) ?? null

/** 'all' whenever there are fewer than 2 scans or nothing is selected. */
export const selectEffectiveScope = (s: PointCloudStore): 'all' | 'selection' =>
  s.clouds.length < 2 || s.selectedCloudIds.length === 0 ? 'all' : s.editScope

/** The ids a scoped edit writes to, in clouds order. Use with useShallow. */
export const selectScopeTargets = (s: PointCloudStore): string[] =>
  selectEffectiveScope(s) === 'all' ? s.clouds.map((c) => c.id) : s.selectedCloudIds

/**
 * A flat projection of everything the panel body renders, WITHOUT progress,
 * pointCount and declaredCount — so a streamed chunk re-renders only its own
 * row and the list header. Use with useShallow.
 */
export const selectPanelStructure = (s: PointCloudStore): unknown[] =>
  s.clouds.flatMap((c) => [
    c.id, c.status, c.visible, c.fileName, c.fileKey, c.format, c.sourceKind, c.errorKey,
    c.streamErrorKey, c.truncated, c.frame, c.attributes, c.alignment, c.alignedToModelId,
    c.name, c.color, c.style, c.fileDate,
  ])

/** What a scan is called in the UI: its given name, else its file name. */
export const cloudLabel = (c: Pick<PointCloudEntry, 'name' | 'fileName'>): string =>
  c.name?.trim() || c.fileName
