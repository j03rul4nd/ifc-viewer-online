// ─── Phase plans, aggregate progress and ETA ──────────────────────────────────
// Pure functions over PhaseState[] — no clock, no store, no DOM. The manager
// owns the states; this module only answers "how far along is this job?" and
// "can we honestly say how long it has left?".
//
// Weights are a SHARE OF THE WORK, not durations: they were read off profiles
// of real loads (a 60 MB architectural IFC on a mid laptop, cold cache), where
// geometry dominates, attributes and relations follow, and the fragments
// attach is the only big main-thread cost. They only shape the ESTIMATED
// overall %; nothing is scheduled by them.

import type { JobStatus, PhaseId, PhasePlanEntry, PhaseState } from './types'

// ── Plans ─────────────────────────────────────────────────────────────────────

/** Cold load: the IFC goes through the parser worker. */
export const IFC_PLAN_MISS: readonly PhasePlanEntry[] = Object.freeze([
  { id: 'identify',     weight: 1 },
  { id: 'cache-lookup', weight: 1 },
  { id: 'geometry',     weight: 46 },
  { id: 'properties',   weight: 14 },
  { id: 'relations',    weight: 9 },
  { id: 'serialize',    weight: 6 },
  { id: 'cache-write',  weight: 3 },
  { id: 'attach',       weight: 12 },
  { id: 'setup',        weight: 4 },
  { id: 'read',         weight: 2 },
  { id: 'stream',       weight: 1, background: true },
  { id: 'index',        weight: 1, background: true },
] as PhasePlanEntry[])

/**
 * Cache hit: no conversion. Reading the cached `.frag` is real work now
 * (cache-lookup 8) and the attach becomes most of the job.
 */
export const IFC_PLAN_HIT: readonly PhasePlanEntry[] = Object.freeze([
  { id: 'identify',     weight: 2 },
  { id: 'cache-lookup', weight: 8 },
  { id: 'attach',       weight: 60 },
  { id: 'setup',        weight: 18 },
  { id: 'read',         weight: 12 },
  { id: 'stream',       weight: 1, background: true },
  { id: 'index',        weight: 1, background: true },
] as PhasePlanEntry[])

/** Prepended for URL sources: the body stream is the one truly measurable phase. */
export const DOWNLOAD_ENTRY: Readonly<PhasePlanEntry> = Object.freeze({ id: 'download', weight: 18 })

/**
 * A fresh, mutable copy of the IFC plan. URL sources download first in BOTH
 * cases — the cache key needs the fetched file's size and Last-Modified, so a
 * hit is only known after the bytes (or at least the headers) arrived.
 */
export function ifcPlan(opts: { url: boolean; cached: boolean }): PhasePlanEntry[] {
  const base = opts.cached ? IFC_PLAN_HIT : IFC_PLAN_MISS
  const plan = base.map((e) => ({ ...e }))
  if (opts.url) plan.unshift({ ...DOWNLOAD_ENTRY })
  return plan
}

/** Every phase pending, no fraction yet. */
export function createPhaseStates(plan: readonly PhasePlanEntry[]): PhaseState[] {
  return plan.map((e) => {
    const s: PhaseState = { id: e.id, status: 'pending', weight: e.weight, fraction: null }
    if (e.background) s.background = true
    return s
  })
}

// ── Aggregate progress ────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * The job's estimated overall fraction.
 *   - background phases never count (the model is interactive before them);
 *   - skipped phases leave the denominator (a cache hit does not "jump" by
 *     crediting work that never ran — the plan simply got shorter);
 *   - done phases count fully, the active one by its REAL fraction or 0.
 * Monotonic as long as phases only move forward; the manager additionally
 * keeps a high-water mark per attempt for replans that change the weights.
 */
export function aggregateProgress(phases: readonly PhaseState[]): { fraction: number; determinate: boolean } {
  let total = 0
  let done = 0
  let determinate = false
  let counted = 0
  let settled = 0
  for (const p of phases) {
    if (p.background) continue
    counted++
    if (p.status === 'skipped') { settled++; continue }
    total += p.weight
    if (p.status === 'done') {
      done += p.weight
      settled++
    } else if (p.status === 'active') {
      done += p.weight * (p.fraction === null ? 0 : clamp01(p.fraction))
      determinate = p.fraction !== null
    } else if (p.status === 'failed') {
      // Where it stopped — a failed row keeps its bar instead of snapping back.
      done += p.weight * (p.fraction === null ? 0 : clamp01(p.fraction))
    }
  }
  // Exactly 1 when everything that counts is settled: float sums of weights can
  // land on 0.9999999, which would render as "99 %" on a loaded model.
  if (counted > 0 && settled === counted) return { fraction: 1, determinate }
  if (total <= 0) return { fraction: 0, determinate }
  return { fraction: clamp01(done / total), determinate }
}

// ── ETA ───────────────────────────────────────────────────────────────────────

const MB = 1024 * 1024

export interface EtaInput {
  phases: readonly PhaseState[]
  sizeBytes: number
  /** Session calibration: mean wall ms per MB, per phase. */
  msPerMB: Partial<Record<PhaseId, number>>
  now: number
  /** When the active phase started (net of lane waits, if the caller tracks them). */
  activePhaseStartedAt: number | null | undefined
  /** The active phase's real fraction, or null when it only reports activity. */
  activeFraction: number | null
}

/**
 * Remaining time, or null when it cannot be predicted honestly.
 *
 * Two sources of truth only:
 *   1. `download`: bytes over elapsed time is a real rate. The ETA is the rest
 *      of the download plus the remaining phases — and only when the session
 *      has calibrated every one of them. A download-only figure is not the
 *      job's time left: "about 5 s" next to the whole-job bar, followed by an
 *      unmeasured geometry parse of minutes, is exactly the lie ruled out below.
 *   2. Any other determinate phase that has run long enough to have a stable
 *      rate (≥ 15 % and ≥ 3 s), AND every phase after it is calibrated from an
 *      earlier load in this session. One uncalibrated phase ahead and there is
 *      no ETA — "about 40 s" followed by an unmeasured two-minute parse is
 *      worse than showing elapsed time.
 */
export function computeEta(input: EtaInput): { etaMs: number | null; reliable: boolean } {
  const none = { etaMs: null, reliable: false }
  const { phases, sizeBytes, msPerMB, now, activePhaseStartedAt, activeFraction } = input
  const activeIdx = phases.findIndex((p) => p.status === 'active' && !p.background)
  if (activeIdx < 0 || activePhaseStartedAt == null || activeFraction === null) return none
  const f = clamp01(activeFraction)
  const elapsed = now - activePhaseStartedAt
  if (!(elapsed > 0) || f <= 0) return none

  const sizeMB = Math.max(0, sizeBytes) / MB
  let remainingCalibrated = 0
  let allCalibrated = true
  for (let i = activeIdx + 1; i < phases.length; i++) {
    const p = phases[i]
    if (p.background || p.status !== 'pending') continue
    const rate = msPerMB[p.id]
    if (rate === undefined || !Number.isFinite(rate)) { allCalibrated = false; continue }
    remainingCalibrated += rate * sizeMB
  }

  const inPhase = elapsed * (1 - f) / f
  const active = phases[activeIdx]
  if (active.id === 'download') {
    if (f <= 0.05 || elapsed <= 1000 || !allCalibrated) return none
    return { etaMs: Math.max(0, Math.round(inPhase + remainingCalibrated)), reliable: true }
  }
  if (f < 0.15 || elapsed < 3000 || !allCalibrated) return none
  return { etaMs: Math.max(0, Math.round(inPhase + remainingCalibrated)), reliable: true }
}

// ── Legacy phase (SDK `model-progress`, frozen public contract) ───────────────

export type LegacyPhase = 'reading' | 'parsing' | 'uploading' | 'done'

const LEGACY: Record<PhaseId, LegacyPhase> = {
  download: 'reading', identify: 'reading', 'cache-lookup': 'reading', read: 'reading', fetch: 'reading',
  geometry: 'parsing', properties: 'parsing', relations: 'parsing', serialize: 'parsing', decode: 'parsing',
  'cache-write': 'uploading', attach: 'uploading', setup: 'uploading', stream: 'uploading',
  index: 'uploading', place: 'uploading',
}

/**
 * The four-value phase SDK hosts already parse. Once the model is committed
 * (or the job is over) it is `done`, even while background phases still run —
 * hosts treat `done` as "interactive", which is exactly what loaded means.
 */
export function legacyPhase(phase: PhaseId | null, status: JobStatus): LegacyPhase {
  if (status === 'loaded' || status === 'failed' || status === 'cancelled' ||
      status === 'removed' || status === 'unloading') return 'done'
  if (phase === null) return 'reading'
  return LEGACY[phase] ?? 'reading'
}
