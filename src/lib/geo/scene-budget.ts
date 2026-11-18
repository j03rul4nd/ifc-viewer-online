// ─── scene-budget ─────────────────────────────────────────────────────────────
// How much surrounding geometry this device can carry, and how to tell when it
// is carrying too much.
//
// Map mode can put millions of triangles around a model: a dense district at
// Showcase is thousands of storey-banded blocks, tens of thousands of instanced
// trees and a street of authored props. On a workstation that is a view to
// bring to a client; on a thin laptop it is a frame every half second and, at
// the far end, a lost WebGL context that takes the model down with it. Neither
// of those is something the user asked for by ticking "Trees".
//
// Two guards, both pure so they can be tested without a GPU:
//
//   1. A TRIANGLE BUDGET applied after each layer is built and before anything
//      joins the scene. Layers are admitted in priority order — the buildings
//      and streets that make a place recognisable before the benches — and one
//      that would overflow the budget is left out and NAMED, never silently
//      dropped. The user can lift the budget with one click.
//
//   2. A FRAME WATCH fed from the map's own RAF. It reports sustained low frame
//      rates, ignoring the stalls that are not the scene's fault: a backgrounded
//      tab (no frames at all), and the shader compiles right after a rebuild.
//
// Nothing here imports three.js — the triangle counting lives in geo-system,
// which owns the objects.

import type { FeatureKind } from './osm-features'
import type { BuildingDetail } from './building-mesh'

/** A buildable slice of the scene: an OSM layer, or the invented scenery. */
export type LayerKey = FeatureKind | 'scenery'

/**
 * Which layers survive when the budget is tight, most important first.
 *
 * The order is "what makes the place recognisable": the masses and the street
 * grid first, then water and parks, then what stands on them. Scenery is last
 * because it is invented — it is the one layer nobody loses information by
 * missing.
 */
export const LAYER_PRIORITY: readonly LayerKey[] = [
  'building', 'road', 'water', 'green', 'rail', 'bridge', 'pier',
  'tree', 'sand', 'rock', 'signal', 'barrier', 'furniture', 'scenery',
]

export type DeviceTier = 'low' | 'mid' | 'high'

/** The subset of `navigator` the tier reads — injectable for tests. */
export interface DeviceHints {
  /** GB, rounded down by the browser (Chromium only). */
  deviceMemory?: number
  hardwareConcurrency?: number
  /** Touch-first devices share memory with a small GPU. */
  maxTouchPoints?: number
  userAgent?: string
}

/**
 * A coarse device class from what the browser is willing to say.
 *
 * Deliberately conservative in the middle: `deviceMemory` is missing outside
 * Chromium, and treating "unknown" as high-end is how a Safari laptop ends up
 * with a Showcase budget sized for a desktop GPU.
 */
export function deviceTier(hints: DeviceHints = readHints()): DeviceTier {
  const mem = hints.deviceMemory
  const cores = hints.hardwareConcurrency ?? 4
  const mobile = (hints.maxTouchPoints ?? 0) > 1 && /Mobi|Android|iPhone|iPad/i.test(hints.userAgent ?? '')
  if (mobile) return mem !== undefined && mem >= 8 && cores >= 8 ? 'mid' : 'low'
  if (mem !== undefined && mem <= 4) return 'low'
  if (cores <= 4 && (mem === undefined || mem < 8)) return 'low'
  if (mem !== undefined && mem >= 8 && cores >= 8) return 'high'
  return 'mid'
}

function readHints(): DeviceHints {
  if (typeof navigator === 'undefined') return {}
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    maxTouchPoints: nav.maxTouchPoints,
    userAgent: nav.userAgent,
  }
}

/**
 * Triangles of SURROUNDING context the tier can draw at an interactive rate,
 * with the model and the basemap on top. Instanced geometry counts once per
 * instance — the GPU draws every copy.
 *
 * Generous on purpose: this is a guard against the scene that would stall or
 * lose the context, not a quality setting. A normal district at Detailed sits
 * well under every figure.
 */
export const TRIANGLE_BUDGET: Record<DeviceTier, number> = {
  low: 2_500_000,
  mid: 5_000_000,
  high: 10_000_000,
}

export interface BudgetInput {
  key: LayerKey
  triangles: number
}

export interface BudgetDecision {
  /** Layers to put in the scene. */
  keep: Set<LayerKey>
  /** Layers left out to stay inside the budget, in priority order. */
  skipped: LayerKey[]
  /** Triangles of what is kept. */
  triangles: number
}

/**
 * Admit layers in priority order while they fit.
 *
 * Greedy by priority, not by size: a layer that does not fit is skipped, but a
 * smaller, lower-priority one after it may still be admitted — dropping the
 * benches because the trees did not fit would be losing something for nothing.
 *
 * The most important layer present is ALWAYS kept, even alone over budget: an
 * empty neighbourhood reads as a failure, and the buildings are the reason the
 * user turned the surroundings on.
 */
export function applyBudget(layers: ReadonlyArray<BudgetInput>, budget: number): BudgetDecision {
  const rank = (k: LayerKey): number => {
    const i = LAYER_PRIORITY.indexOf(k)
    return i < 0 ? LAYER_PRIORITY.length : i
  }
  const ordered = [...layers].sort((a, b) => rank(a.key) - rank(b.key))
  const keep = new Set<LayerKey>()
  const skipped: LayerKey[] = []
  let total = 0
  for (const layer of ordered) {
    const tris = Math.max(0, layer.triangles)
    if (keep.size === 0 || total + tris <= budget) {
      keep.add(layer.key)
      total += tris
    } else {
      skipped.push(layer.key)
    }
  }
  return { keep, skipped, triangles: total }
}

/** One step down the detail ladder, or null at the bottom. */
export function lowerDetail(detail: BuildingDetail): BuildingDetail | null {
  return detail === 'showcase' ? 'detailed' : detail === 'detailed' ? 'simple' : null
}

// ── Frame watch ─────────────────────────────────────────────────────────────

export interface FrameVerdict {
  /** Frames per second over the last window, rounded. */
  fps: number
  /** True once the rate has stayed low for `slowWindows` windows in a row. */
  slow: boolean
}

export interface FrameWatchOptions {
  /** Length of one measuring window. */
  windowMs?: number
  /** Below this the window counts as slow. */
  slowFps?: number
  /** Above this a slow scene counts as recovered (hysteresis). */
  recoverFps?: number
  /** Consecutive slow windows before the verdict flips. */
  slowWindows?: number
  /** A frame gap longer than this is a hidden tab, not a slow scene. */
  gapMs?: number
}

export interface FrameWatch {
  /** Feed one RAF timestamp. Returns a verdict when a window closes. */
  sample(nowMs: number): FrameVerdict | null
  /**
   * Ignore frames until `untilMs`. Used right after a rebuild: the first frames
   * compile shaders and upload buffers, and that stall is a one-off, not the
   * scene's steady cost.
   */
  pause(untilMs: number): void
  reset(): void
}

export function createFrameWatch(opts: FrameWatchOptions = {}): FrameWatch {
  const windowMs = opts.windowMs ?? 1000
  const slowFps = opts.slowFps ?? 20
  const recoverFps = opts.recoverFps ?? 28
  const slowWindows = opts.slowWindows ?? 4
  const gapMs = opts.gapMs ?? 1000

  let last: number | null = null
  let windowStart: number | null = null
  let frames = 0
  let slowRun = 0
  let fastRun = 0
  let slow = false
  let pausedUntil = -Infinity

  const restartWindow = (now: number): void => {
    windowStart = now
    frames = 0
  }

  return {
    sample(now) {
      const prev = last
      last = now
      if (now < pausedUntil) { windowStart = null; return null }
      // A long gap is the tab being hidden (Chrome freezes the RAF), or a
      // one-off stall we already paused for. Either way it says nothing about
      // the scene's steady frame rate.
      if (prev === null || now - prev > gapMs || windowStart === null) {
        restartWindow(now)
        return null
      }
      frames++
      const elapsed = now - windowStart
      if (elapsed < windowMs) return null

      const fps = (frames * 1000) / elapsed
      restartWindow(now)
      if (fps < slowFps) { slowRun++; fastRun = 0 } else if (fps > recoverFps) { fastRun++; slowRun = 0 } else { slowRun = 0; fastRun = 0 }
      if (!slow && slowRun >= slowWindows) slow = true
      if (slow && fastRun >= 2) slow = false
      return { fps: Math.round(fps), slow }
    },
    pause(untilMs) {
      pausedUntil = Math.max(pausedUntil, untilMs)
      windowStart = null
    },
    reset() {
      last = null
      windowStart = null
      frames = 0
      slowRun = 0
      fastRun = 0
      slow = false
      pausedUntil = -Infinity
    },
  }
}

// ── Scene report ────────────────────────────────────────────────────────────

export interface SceneLayerStat {
  key: LayerKey
  /**
   * Triangles drawn (instances counted). 0 when failed; for a skipped layer,
   * what it WOULD have cost — the reason it was left out.
   */
  triangles: number
  /** Build time for this layer, ms. */
  ms: number
  status: 'ok' | 'failed' | 'skipped'
}

/**
 * What the last scene build produced, for the panel.
 *
 * Plain data — it crosses from geo-system (lazy chunk) into geoStore (eager),
 * and the store holds serializable state only.
 */
export interface SceneReport {
  phase: 'idle' | 'building' | 'ready'
  /** 0..1 while building; 1 when ready. */
  progress: number
  layers: SceneLayerStat[]
  /** Triangles in the scene now. */
  triangles: number
  /** Wall time of the last build, ms (includes the yields between layers). */
  buildMs: number
  budget: number
  tier: DeviceTier
  /** Whether the user lifted the budget for this session. */
  budgetLifted: boolean
  /**
   * WebGL contexts lost while the map was on. Each one halves the budget: a
   * lost context in map mode is almost always memory pressure from the scene.
   */
  contextLosses: number
  skipped: LayerKey[]
  failed: LayerKey[]
}

/** Count of triangles, readable at panel scale: 845, 12.4 k, 1.2 M. */
export function formatTriangles(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)} k`
  return `${(n / 1_000_000).toFixed(1)} M`
}

/**
 * Low-memory MOBILE device (iPhone Safari et al.): the 'low' tier on a touch
 * device. Desktop 'low' machines are deliberately excluded so the desktop map
 * path is unchanged; the extra caps keyed on this exist because iOS kills the
 * WebContent process (silent page reload) past ~1–1.5 GB incl. GPU.
 */
export function isLowMemoryDevice(hints: DeviceHints = readHints()): boolean {
  const mobile = (hints.maxTouchPoints ?? 0) > 1 && /Mobi|Android|iPhone|iPad/i.test(hints.userAgent ?? '')
  return mobile && deviceTier(hints) === 'low'
}

/**
 * Tile LRU ceiling. 80 on low-memory mobile; 300 elsewhere (mid/high kept at
 * the historical value — desktop behaviour must not change).
 */
export function tileLruMax(lowMemory: boolean = isLowMemoryDevice()): number {
  return lowMemory ? 80 : 300
}

/** Multiplier for scatter caps (props, boats): ×0.25 on low-memory mobile. */
export function propCapScale(lowMemory: boolean = isLowMemoryDevice()): number {
  return lowMemory ? 0.25 : 1
}
