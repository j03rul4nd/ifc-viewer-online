// ─── Lane scheduler (pure) ────────────────────────────────────────────────────
// Who gets a lane next. Every function takes the whole state and `now` as
// input and returns a decision — no clock, no timers, no mutation — so the
// admission rules in docs/MODEL_LOADING.md §4 are tested as plain tables, and
// the manager is left with the bookkeeping (who holds what, who is waiting).
//
// Ordering everywhere is (effective priority, seq): the user's priority, lifted
// by aging so nothing starves, with submission order as the stable tie-break.

import type { JobStatus, Priority, SourceKind, WaitReason } from './types'

/** A waiting job climbs one priority level per this much waiting. */
export const AGING_MS = 45_000
/** Smaller jobs may overtake a memory-blocked head only this long. */
export const RESERVE_AFTER_MS = 30_000

// ── Ordering ──────────────────────────────────────────────────────────────────

/**
 * Priority after aging: one level toward `critical` per `agingMs` waited.
 * Floor at 0 — aging never makes a job more urgent than the user can.
 */
export function effectivePriority(priority: Priority, waitedMs: number, agingMs: number = AGING_MS): Priority {
  if (!(agingMs > 0) || !(waitedMs > 0)) return priority
  const lifted = priority - Math.floor(waitedMs / agingMs)
  return (lifted < 0 ? 0 : lifted) as Priority
}

export interface Ranked {
  seq: number
  effectivePriority: Priority
}

/** Sort comparator: effective priority first, then submission order. */
export function compareCandidates(a: Ranked, b: Ranked): number {
  return a.effectivePriority - b.effectivePriority || a.seq - b.seq
}

export interface LaneCandidate {
  jobId: string
  seq: number
  priority: Priority
  /** When this request joined the lane queue (aging clock). */
  enqueuedAt: number
  /** Held by the user: never granted, and not given a WaitReason (its status says it). */
  held: boolean
}

/** Non-held candidates in grant order, each with its effective priority. */
export function orderCandidates<T extends LaneCandidate>(
  candidates: readonly T[], now: number | undefined, agingMs: number = AGING_MS,
): Array<T & Ranked> {
  const out: Array<T & Ranked> = []
  for (const c of candidates) {
    if (c.held) continue
    const eff = now === undefined ? c.priority : effectivePriority(c.priority, now - c.enqueuedAt, agingMs)
    out.push({ ...c, effectivePriority: eff })
  }
  out.sort(compareCandidates)
  return out
}

export interface LaneDecision {
  grant: string[]
  blocked: Record<string, WaitReason>
}

// ── Convert lane ──────────────────────────────────────────────────────────────

export interface ConvertHolder {
  jobId: string
  peakBytes: number
  exclusive: boolean
}

export interface ConvertCandidate extends LaneCandidate {
  peakBytes: number
  exclusive: boolean
}

export interface ConvertInput {
  holders: readonly ConvertHolder[]
  candidates: readonly ConvertCandidate[]
  maxConcurrent: number
  budgetBytes: number
  pressure: 'normal' | 'elevated' | 'critical'
  now: number
  reserveAfterMs?: number
  agingMs?: number
  /**
   * The anchor of an empty scene (the model that will set the coordinate base
   * and that every other model's attach waits for) still has to convert and
   * is about to ask for this lane. While set, only that job may be granted.
   *
   * Measured on the Hotel Vela set: without it, the two smaller disciplines
   * finished downloading 30 ms earlier, took the slots, and the architecture
   * model — the one the user sees first — waited 2.9 s for a lane while
   * nothing could appear on screen anyway.
   */
  reserveForAnchor?: string | null
}

/**
 * Convert admission (§4):
 *   - an exclusive holder blocks everything;
 *   - `elevated` pressure → one conversion at a time; `critical` → one, and
 *     only when nothing converts (the heap is nearly full: never stack);
 *   - an exclusive candidate runs only on an empty lane and then alone;
 *   - otherwise grant in order while slots remain and the summed peak estimate
 *     fits the budget — except the first job on an empty lane, which always
 *     runs (a file bigger than the budget still loads, just alone);
 *   - a job that cannot run yet (memory or exclusive) may be overtaken by
 *     smaller ones only for `reserveAfterMs`; after that the lane is reserved
 *     for it, or a stream of small files would starve a large one forever.
 */
export function decideConvert(input: ConvertInput): LaneDecision {
  const reserveAfterMs = input.reserveAfterMs ?? RESERVE_AFTER_MS
  const ordered = orderCandidates(input.candidates, input.now, input.agingMs)
  const grant: string[] = []
  const blocked: Record<string, WaitReason> = {}
  if (ordered.length === 0) return { grant, blocked }

  if (input.holders.some((h) => h.exclusive)) {
    for (const c of ordered) blocked[c.jobId] = 'exclusive'
    return { grant, blocked }
  }
  const running = input.holders.length
  if (input.pressure === 'critical' && running > 0) {
    for (const c of ordered) blocked[c.jobId] = 'memory'
    return { grant, blocked }
  }

  if (input.reserveForAnchor) {
    const anchor = input.reserveForAnchor
    for (const c of ordered) if (c.jobId !== anchor) blocked[c.jobId] = 'anchor'
    const candidate = ordered.find((c) => c.jobId === anchor)
    if (!candidate) return { grant, blocked }
    // The anchor itself still obeys everything below (exclusive, memory).
    ordered.splice(0, ordered.length, candidate)
  }

  let max = Math.max(1, Math.floor(input.maxConcurrent))
  if (input.pressure !== 'normal') max = 1
  let sumPeak = 0
  for (const h of input.holders) sumPeak += Math.max(0, h.peakBytes)

  let reserved = false
  let exclusiveGranted = false
  for (const c of ordered) {
    if (exclusiveGranted) { blocked[c.jobId] = 'exclusive'; continue }
    if (reserved) { blocked[c.jobId] = 'slot'; continue }
    const laneEmpty = running === 0 && grant.length === 0
    const waited = input.now - c.enqueuedAt

    if (c.exclusive) {
      if (laneEmpty) {
        grant.push(c.jobId)
        exclusiveGranted = true
      } else {
        blocked[c.jobId] = 'exclusive'
        if (waited >= reserveAfterMs) reserved = true
      }
      continue
    }
    if (running + grant.length >= max) { blocked[c.jobId] = 'slot'; continue }
    const peak = Math.max(0, c.peakBytes)
    if (laneEmpty || sumPeak + peak <= input.budgetBytes) {
      grant.push(c.jobId)
      sumPeak += peak
      continue
    }
    blocked[c.jobId] = 'memory'
    if (waited >= reserveAfterMs) reserved = true
  }
  return { grant, blocked }
}

// ── Network lane ──────────────────────────────────────────────────────────────

export interface NetworkInput {
  holders: readonly { jobId: string }[]
  candidates: readonly LaneCandidate[]
  max: number
  now?: number
  agingMs?: number
  /**
   * Conversion is backed up: enough downloaded files already wait to convert.
   * Another download would only park one more whole file in memory, outside
   * what convert admission counts — so nobody is granted until it drains.
   */
  backlogged?: boolean
}

/** Plain slot lane: two downloads at a time, in order — none while conversion is backed up. */
export function decideNetwork(input: NetworkInput): LaneDecision {
  const ordered = orderCandidates(input.candidates, input.now, input.agingMs)
  const grant: string[] = []
  const blocked: Record<string, WaitReason> = {}
  if (input.backlogged) {
    for (const c of ordered) blocked[c.jobId] = 'slot'
    return { grant, blocked }
  }
  let free = Math.max(1, Math.floor(input.max)) - input.holders.length
  for (const c of ordered) {
    if (free > 0) { grant.push(c.jobId); free-- }
    else blocked[c.jobId] = 'slot'
  }
  return { grant, blocked }
}

// ── Attach lane ───────────────────────────────────────────────────────────────

const NOT_LIVE: ReadonlySet<JobStatus> = new Set<JobStatus>(['loaded', 'failed', 'cancelled', 'removed', 'unloading'])

export interface AnchorCandidate {
  id: string
  seq: number
  kind: SourceKind
  status: JobStatus
}

/**
 * The job that will set the coordinate base of an empty scene: the
 * first-submitted IFC job that is still going to attach. Held jobs are passed
 * over — "not now" from the user must not freeze every other model behind it;
 * the next live job anchors instead.
 */
export function pickAnchor(jobs: readonly AnchorCandidate[]): string | null {
  let best: AnchorCandidate | null = null
  for (const j of jobs) {
    if (j.kind !== 'ifc' || NOT_LIVE.has(j.status) || j.status === 'held') continue
    if (best === null || j.seq < best.seq) best = j
  }
  return best ? best.id : null
}

export interface AttachInput {
  holder: string | null
  candidates: readonly LaneCandidate[]
  sceneHasModels: boolean
  anchorJobId: string | null
  now?: number
  agingMs?: number
}

/**
 * One attach at a time. With an empty scene only the anchor may attach
 * (fragments takes the coordinate base from the first model it loads); a job
 * that finished converting early waits with reason `anchor` instead of
 * silently becoming the base of the federation.
 */
export function decideAttach(input: AttachInput): { grant: string | null; blocked: Record<string, WaitReason> } {
  const ordered = orderCandidates(input.candidates, input.now, input.agingMs)
  const blocked: Record<string, WaitReason> = {}
  if (ordered.length === 0) return { grant: null, blocked }
  if (input.holder !== null) {
    for (const c of ordered) blocked[c.jobId] = 'attach-lane'
    return { grant: null, blocked }
  }
  let grant: string | null = null
  if (!input.sceneHasModels && input.anchorJobId !== null) {
    if (ordered.some((c) => c.jobId === input.anchorJobId)) grant = input.anchorJobId
    for (const c of ordered) if (c.jobId !== grant) blocked[c.jobId] = 'anchor'
    return { grant, blocked }
  }
  grant = ordered[0].jobId
  for (let i = 1; i < ordered.length; i++) blocked[ordered[i].jobId] = 'attach-lane'
  return { grant, blocked }
}
