// ─── Resource policy ──────────────────────────────────────────────────────────
// What this machine can afford while loading: how many IFC conversions (and
// point cloud / mesh decodes) may run side by side, how much transient memory
// the conversions may claim together, and how the answer changes when the heap
// fills up or an allocation fails.
//
// Every input is a browser hint that may be missing (Safari and Firefox expose
// neither `deviceMemory` nor `performance.memory`), so every rule has a
// conservative fallback. The probe takes the global object as a parameter and
// guards each access, so the policy runs unchanged in node tests and workers.

import type {
  AdapterEstimate, HeapSample, MemoryPressure, PolicySnapshot, ResourcePolicy,
} from './types'
import { createLogger } from '../logger'

export type { ResourcePolicy, HeapSample } from './types'

const log = createLogger('Load')

const MB = 1024 * 1024
const GB = 1024 * MB

/** Files at least this large convert alone. */
export const LARGE_FILE_BYTES = 150 * MB
/** Per-convert fixed overhead: WASM heap, IfcImporter builders, worker. */
const CONVERT_BASE_BYTES = 100 * MB
/** Convert peak ≈ size × 5 — the worker's JS copy, two web-ifc parses and geometry arrays. */
const CONVERT_SIZE_FACTOR = 5
const DEV_MAX_CONVERTS_KEY = 'ifc:load-max-converts'
const DEV_MAX_DECODES_KEY = 'ifc:load-max-decodes'
/**
 * Point cloud / mesh decoders at once. A scan parses in its own worker, a mesh
 * mostly between awaits on the main thread (Draco in its pool), and each is
 * bounded by its own subsystem's cap (the resident-point budget, the mesh size
 * checks) rather than by the convert admission estimate — so two may overlap,
 * a scan beside a site mesh, on a lane that never takes an IFC convert slot.
 */
const DEFAULT_MAX_DECODES = 2

// ── Environment probe ─────────────────────────────────────────────────────────

export interface EnvironmentProbe {
  cores: number | null
  deviceMemoryGB: number | null
  crossOriginIsolated: boolean
  mobile: boolean
  /** `performance.memory.jsHeapSizeLimit` (Chromium) — the MAIN heap only. */
  heapLimitBytes: number | null
}

interface NavigatorLike {
  hardwareConcurrency?: number
  deviceMemory?: number
  userAgentData?: { mobile?: boolean }
}

interface GlobalLike {
  navigator?: NavigatorLike
  crossOriginIsolated?: boolean
  matchMedia?: (q: string) => { matches: boolean }
  screen?: { width?: number; height?: number }
  performance?: { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }
  localStorage?: { getItem(key: string): string | null }
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function probeMobile(g: GlobalLike): boolean {
  try {
    if (g.navigator?.userAgentData?.mobile === true) return true
  } catch { /* exotic navigator */ }
  try {
    // A coarse pointer alone is a touch laptop; with a small screen it is a
    // phone or a small tablet — the devices whose tabs get killed first.
    const coarse = typeof g.matchMedia === 'function' && g.matchMedia('(pointer: coarse)').matches
    if (!coarse) return false
    const w = positive(g.screen?.width)
    const h = positive(g.screen?.height)
    return w !== null && h !== null && Math.min(w, h) < 900
  } catch {
    return false
  }
}

/** Read what the runtime tells about itself. Never throws. */
export function probeEnvironment(g: unknown = globalThis): EnvironmentProbe {
  const gl = (g ?? {}) as GlobalLike
  let cores: number | null = null
  let deviceMemoryGB: number | null = null
  let heapLimitBytes: number | null = null
  let isolated = false
  try { cores = positive(gl.navigator?.hardwareConcurrency) } catch { /* guarded */ }
  try { deviceMemoryGB = positive(gl.navigator?.deviceMemory) } catch { /* guarded */ }
  try { isolated = gl.crossOriginIsolated === true } catch { /* guarded */ }
  try { heapLimitBytes = positive(gl.performance?.memory?.jsHeapSizeLimit) } catch { /* guarded */ }
  return { cores, deviceMemoryGB, crossOriginIsolated: isolated, mobile: probeMobile(gl), heapLimitBytes }
}

/** Main-thread heap usage from `performance.memory`, or null where it does not exist. */
export function readHeap(g: unknown = globalThis): HeapSample | null {
  try {
    const mem = (g as GlobalLike | null)?.performance?.memory
    const used = positive(mem?.usedJSHeapSize)
    const limit = positive(mem?.jsHeapSizeLimit)
    return used !== null && limit !== null ? { used, limit } : null
  } catch {
    return null
  }
}

/** A DEV-only lane width override from localStorage (1..8), or null. */
function readDevMax(key: string): number | null {
  if (!import.meta.env.DEV) return null
  try {
    const raw = (globalThis as GlobalLike).localStorage?.getItem(key)
    if (raw == null) return null
    const n = Math.floor(Number(raw))
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 8) : null
  } catch {
    return null
  }
}

// ── Policy ────────────────────────────────────────────────────────────────────

export interface PolicyOverrides {
  maxConcurrentConverts: number
  maxConcurrentDecodes: number
  memoryBudgetBytes: number
  largeFileBytes: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Build the policy once per session. Pressure is the only thing that moves
 * afterwards: `sample()` follows the heap ratio, `reportOom()` pins it at
 * `elevated` — after one allocation failure, running two conversions again is
 * how the tab dies on the next pair of files.
 */
export function createResourcePolicy(
  env: EnvironmentProbe = probeEnvironment(),
  overrides?: Partial<PolicyOverrides>,
): ResourcePolicy {
  // Base concurrency: ONE conversion at a time, on every device. This was
  // meant to scale with cores and was measured instead (Chromium, 12 cores,
  // 16 GB, Hotel Vela ARC 5.2 MB + STR 1.4 MB + MEP 0.2 MB, cold cache):
  //
  //   concurrent converts   ARC geometry   MEP geometry   whole set
  //   1                     1.5 s          0.09 s         7.2 s
  //   2                     1.6 s          2.75 s         7.6 s
  //   3                     11.7 s         9.8 s          16.0 s
  //
  // IfcImporter builds its geometry in JS arrays and web-ifc parses the file
  // twice; concurrent workers fight over allocation and memory bandwidth, not
  // cores, and every job gets slower than running them in turn. The overlap
  // that does pay is across lanes — the next file downloads while this one
  // converts, and a converted model attaches while the next one converts —
  // which the scheduler gives anyway. `ifc:load-max-converts` (DEV) and the
  // override keep the knob for re-measuring on other hardware.
  const devMax = readDevMax(DEV_MAX_CONVERTS_KEY)
  let baseMax: number
  if (overrides?.maxConcurrentConverts !== undefined) baseMax = Math.max(1, Math.floor(overrides.maxConcurrentConverts))
  else if (devMax !== null) baseMax = devMax
  else baseMax = 1

  // Decodes get their own lane width. `ifc:load-max-decodes` (DEV) mirrors
  // the convert knob.
  const devDecodes = readDevMax(DEV_MAX_DECODES_KEY)
  let baseDecodes: number
  if (overrides?.maxConcurrentDecodes !== undefined) baseDecodes = Math.max(1, Math.floor(overrides.maxConcurrentDecodes))
  else if (devDecodes !== null) baseDecodes = devDecodes
  else baseDecodes = DEFAULT_MAX_DECODES

  // Budget for summed convert peaks. `deviceMemory` is rounded and capped at
  // 8 by browsers, so 0.4 × it tops out at 3.2 GB. The main heap limit is NOT
  // a cap here: conversions happen in workers with their own heaps.
  const budget = overrides?.memoryBudgetBytes !== undefined
    ? Math.max(1, overrides.memoryBudgetBytes)
    : env.deviceMemoryGB !== null
      ? Math.min(env.deviceMemoryGB * 0.4 * GB, 3.2 * GB)
      : env.mobile ? 1 * GB : 2 * GB
  const largeFile = overrides?.largeFileBytes ?? LARGE_FILE_BYTES

  let pressure: MemoryPressure = 'normal'
  let oomSticky = false

  function maxConcurrentConverts(): number {
    return pressure === 'normal' ? baseMax : 1
  }

  /** One decode at a time as soon as the heap is under pressure: a scan's typed arrays live on it. */
  function maxConcurrentDecodes(): number {
    return pressure === 'normal' ? baseDecodes : 1
  }

  return {
    snapshot(): PolicySnapshot {
      return {
        cores: env.cores,
        deviceMemoryGB: env.deviceMemoryGB,
        crossOriginIsolated: env.crossOriginIsolated,
        mobile: env.mobile,
        maxConcurrentConverts: maxConcurrentConverts(),
        maxConcurrentDownloads: 2,
        maxConcurrentDecodes: maxConcurrentDecodes(),
        memoryBudgetBytes: budget,
        largeFileBytes: largeFile,
        pressure,
      }
    },
    estimate(sizeBytes: number): AdapterEstimate {
      const size = Math.max(0, sizeBytes || 0)
      const peakBytes = size * CONVERT_SIZE_FACTOR + CONVERT_BASE_BYTES
      return { peakBytes, exclusive: size >= largeFile || peakBytes > 0.6 * budget }
    },
    maxConcurrentConverts,
    maxConcurrentDownloads: () => 2,
    maxConcurrentDecodes,
    memoryBudgetBytes: () => budget,
    largeFileBytes: () => largeFile,
    pressure: () => pressure,
    sample(heap?: HeapSample | null): MemoryPressure {
      if (!heap || !(heap.limit > 0)) return pressure
      const ratio = heap.used / heap.limit
      const next: MemoryPressure = ratio >= 0.92 ? 'critical'
        : ratio >= 0.8 || oomSticky ? 'elevated'
        : 'normal'
      if (next !== pressure) {
        log.info(`[IFC-LOAD] memory pressure ${pressure} → ${next} heap=${Math.round(ratio * 100)}%`)
        pressure = next
      }
      return pressure
    },
    reportOom(): void {
      oomSticky = true
      if (pressure === 'normal') {
        log.warn('[IFC-LOAD] out of memory reported — one conversion at a time for the rest of the session')
        pressure = 'elevated'
      }
    },
  }
}
