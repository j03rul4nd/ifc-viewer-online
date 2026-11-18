// ─── Loading Center view model ────────────────────────────────────────────────
// Everything the loading UI says about a job, computed from the store snapshot
// and nothing else. Pure: no React, no store, no DOM — the components pass `t`
// in, so every sentence the indicator, the center, the first-load card and the
// scene section print is pinned by job-view.test.ts rather than by eyeballing
// a running load.
//
// The honesty rules of docs/MODEL_LOADING.md §3 are enforced HERE, once, so no
// component can reintroduce a made-up number:
//   • a counter is printed only when the phase reported one;
//   • an ETA exists only when the manager says it is reliable;
//   • a speed that is an estimate says so ("≈");
//   • a percentage never reads 100 until the job has actually committed, and
//     does not appear at all until something was measured (activity instead);
//   • "All models loaded" is said only for a burst in which a model landed,
//     and a count says "models" only when every row it counts is one.
//
// "Model" means a managed IFC job (`isModelJob`), the manager's own predicate.
// Point clouds and meshes are managed jobs too — real phases, cancel, retry —
// but they are not the models the first-load card, the "all loaded" moment and
// the coordinate-base anchor are about; their rows speak in their own words
// (points, the reader) through the kind-aware phase keys of labels.ts.

import type { TFunction } from 'i18next'
import type {
  LoadBatchView, LoadError, LoadJobView, LoadSummary, PhaseId, PhaseState, SessionMetrics, SourceKind,
} from '../../lib/loading/types'
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from '../../lib/loading/types'
import { formatBytes } from '../../lib/utils'
import { COUNTER_KEYS, STATUS_KEYS, WAIT_KEYS, errorKey, phaseActiveKey, phaseKey } from './labels'

export type LoadingT = TFunction<'loading'>

const SEP = ' · '

// ── Status predicates ─────────────────────────────────────────────────────────

/**
 * A model job: managed IFC — the same predicate as the manager's. A scan still
 * decoding is not "your model on its way", and a tracked GIS fetch is not
 * managed at all.
 */
export function isModelJob(job: { managed: boolean; kind: SourceKind }): boolean {
  return job.managed && job.kind === 'ifc'
}

/** Still needs the user's attention: in flight, or stopped by an error. */
export function isLiveJob(job: LoadJobView): boolean {
  return ACTIVE_STATUSES.has(job.status) || job.status === 'failed' || job.status === 'unloading'
}

/** Anything that changes on its own while you watch — the rows that need a clock. */
export function isTicking(job: LoadJobView): boolean {
  return job.status === 'running' || job.status === 'waiting' || job.status === 'unloading'
}

/** The foreground phase doing work right now (never a background one). */
export function activePhase(job: LoadJobView): PhaseState | null {
  let byId: PhaseState | null = null
  for (const p of job.phases) {
    if (p.status === 'active' && !p.background) return p
    if (p.id === job.phase) byId = p
  }
  return byId && !byId.background ? byId : null
}

/** A post-commit enrichment phase (stream / index) still running, if any. */
export function backgroundPhase(job: LoadJobView): PhaseState | null {
  for (const p of job.phases) if (p.background && p.status === 'active') return p
  return null
}

/**
 * Percent for display. Rounded, but capped at 99 until the job has committed:
 * "100%" on a row that is still setting up the scene is the exact lie the
 * rewrite was for.
 */
export function displayPercent(fraction: number, committed: boolean): number {
  if (committed) return 100
  const f = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0
  return Math.min(99, Math.round(f * 100))
}

export function jobPercent(job: LoadJobView): number {
  return displayPercent(job.progress.fraction, job.status === 'loaded')
}

/**
 * The percent a row may print, or null when the job has measured nothing yet.
 * "0%" beside a job that is checking its header or reading the cache is not a
 * measurement, it is a placeholder that looks like one — the row shows
 * activity instead until some phase has reported (or finished) real work.
 */
export function shownPercent(job: LoadJobView): number | null {
  if (job.status !== 'loaded' && !job.progress.determinate && !(job.progress.fraction > 0)) return null
  return jobPercent(job)
}

// ── Queue and anchor ──────────────────────────────────────────────────────────

function byQueueOrder(a: LoadJobView, b: LoadJobView): number {
  return a.effectivePriority - b.effectivePriority || a.seq - b.seq
}

/**
 * The queue a job stands in. An IFC waits for a convert slot; a scan and a
 * mesh share the decode lane. The scheduler grants the two independently, so
 * an IFC queued for conversion is never "ahead" of a scan, and counting it
 * would print "#3" beside a mesh that is next in its own line.
 */
function queueFamily(kind: SourceKind): string {
  return kind === 'pointcloud' || kind === 'mesh' ? 'decode' : kind
}

/**
 * `queued` means "has done no heavy work yet", not "waits for a slot": a job
 * that early can already be held by the coordinate-base anchor (a cache hit
 * behind the first model still converting) or by the point budget. Those rows
 * print their reason — "Queued · #1" would hide the one thing keeping them —
 * and they are not in the slot line the other rows are numbered in.
 */
function queuedWithReason(job: LoadJobView): boolean {
  return job.status === 'queued' && (job.waitReason === 'anchor' || job.waitReason === 'budget')
}

/**
 * 1-based place among the jobs queued for the same lane family, in the order
 * the scheduler would grant them; null for a job that is not in a slot line.
 */
export function queuePosition(job: LoadJobView, jobs: readonly LoadJobView[]): number | null {
  if (job.status !== 'queued' || queuedWithReason(job)) return null
  const family = queueFamily(job.kind)
  const queued = jobs
    .filter((j) => j.status === 'queued' && !queuedWithReason(j) && queueFamily(j.kind) === family)
    .sort(byQueueOrder)
  const i = queued.findIndex((j) => j.id === job.id)
  return i < 0 ? null : i + 1
}

/**
 * The job whose model will set the coordinate base: the lowest-seq live IFC
 * job other than this one. Mirrors the attach lane's anchor rule (types.ts,
 * `seq` is "the anchor rule's key"; scheduler.ts `pickAnchor`), so the name
 * printed is the one the scheduler is actually waiting for. That includes
 * skipping HELD rows: the scheduler passes the anchor on past a model the user
 * paused, and "Waiting for A.ifc" beside an A that is on hold would name a job
 * nothing is waiting for.
 */
export function anchorJobFor(job: LoadJobView, jobs: readonly LoadJobView[]): LoadJobView | null {
  let best: LoadJobView | null = null
  for (const j of jobs) {
    if (j.id === job.id || j.kind !== 'ifc') continue
    if (TERMINAL_STATUSES.has(j.status) || j.status === 'unloading' || j.status === 'held') continue
    if (!best || j.seq < best.seq) best = j
  }
  return best
}

// ── Number formatting ─────────────────────────────────────────────────────────

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

function formatInt(n: number): string {
  return Math.round(n).toLocaleString()
}

/**
 * "12.1 / 48.0 MB" — both sides in the total's unit, so the two numbers can be
 * compared at a glance (mixed "812 KB / 48.0 MB" reads as a bigger number first).
 */
export function formatBytesPair(done: number, total?: number): string {
  if (!total || total <= 0) return formatBytes(Math.max(0, done))
  const i = Math.min(Math.max(0, Math.floor(Math.log(total) / Math.log(1024))), BYTE_UNITS.length - 1)
  const scale = Math.pow(1024, i)
  const d = i === 0 ? 0 : 1
  return `${(Math.max(0, done) / scale).toFixed(d)} / ${(total / scale).toFixed(d)} ${BYTE_UNITS[i]}`
}

const MILLION = 1_000_000

/**
 * "1.2 M / 4.0 M" for point counts. A scan runs to tens of millions of points,
 * and "1,234,567 / 4,012,345" is a number to read, not to glance at — while a
 * reader streaming at a few hundred thousand points a second makes the last
 * digits flicker for nothing. Millions only, both sides in M (like the byte
 * pair, so the two compare at a glance); below a million the digits are short
 * enough to print whole.
 *
 * The done side is FLOORED to the tenth, the total rounded: rounding both
 * printed "4.0 M / 4.0 M" from 3.95 M of a 4,012,345-point file on — a counter
 * reading complete while the row still decodes and says 98 %. In the last
 * tenth of a million the floored count can still meet the rounded total
 * (4,003,120 of 4,012,345: both "4.0 M"); there the digits say what a tenth
 * cannot, rather than a figure that reads finished before the commit.
 */
export function formatCountPair(done: number, total?: number): string {
  const d = Math.max(0, done)
  const hasTotal = total != null && total > 0
  if ((hasTotal ? total : d) < MILLION) return hasTotal ? `${formatInt(d)} / ${formatInt(total)}` : formatInt(d)
  const floorM = (n: number): string => `${(Math.floor(n / (MILLION / 10)) / 10).toFixed(1)} M`
  if (!hasTotal) return floorM(d)
  const doneText = floorM(d)
  const totalText = `${(total / MILLION).toFixed(1)} M`
  if (d < total && doneText === totalText) return `${formatInt(d)} / ${formatInt(total)}`
  return `${doneText} / ${totalText}`
}

export function formatRate(bytesPerSecond: number): string {
  return formatBytes(Math.max(0, bytesPerSecond))
}

/** Live wall clock: "0:07", "12:34", "1:02:03". Tabular and locale-neutral. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * Remaining time, deliberately coarse. An ETA is a forecast; printing it to
 * the second invites the user to watch it be wrong. Seconds round UP to 5 s
 * below a minute, then whole minutes, then hours + minutes.
 */
export function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '<5 s'
  if (ms < 5_000) return '<5 s'
  if (ms < 60_000) return `${Math.min(55, Math.ceil(ms / 5_000) * 5)} s`
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min`
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/** Wall time since the job started (or its final duration once it finished). */
export function jobElapsedMs(job: LoadJobView, now: number): number | null {
  const start = job.metrics.startedAt
  if (start == null) return null
  const end = job.metrics.finishedAt ?? now
  return Math.max(0, end - start)
}

/**
 * Grace after a forecast runs out, before it is withdrawn: a quarter of the
 * forecast, and never less than 5 s (one step of `formatEta`).
 */
function etaOverrunMs(etaMs: number): number {
  return Math.max(5_000, etaMs * 0.25)
}

/**
 * Remaining time right now, or null when the manager cannot predict it
 * honestly. Counts down between snapshots from the last report, so a long
 * phase that reports rarely does not look frozen — and it stops at zero
 * rather than going negative when the forecast was optimistic.
 *
 * Once the silence outlasts the forecast by more than the grace, the forecast
 * is withdrawn (null = "not predictable"), not held at "<5 s left": IfcImporter
 * can sit inside one huge IFC class for minutes, and a countdown parked at its
 * floor for that long is a promise the numbers stopped backing.
 */
export function jobEtaMs(job: LoadJobView, now: number): number | null {
  const { etaMs, etaReliable, lastActivityAt } = job.metrics
  if (!etaReliable || etaMs == null || !Number.isFinite(etaMs)) return null
  const since = lastActivityAt != null ? Math.max(0, now - lastActivityAt) : 0
  if (since > etaMs + etaOverrunMs(etaMs)) return null
  return Math.max(0, etaMs - since)
}

export function shortFingerprint(fp: string | null): string | null {
  if (!fp) return null
  const hash = fp.split(':').pop() ?? fp
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash
}

// ── Phase line ────────────────────────────────────────────────────────────────

/** The real counters of a phase, formatted — or null when it reported none. */
export function formatCounters(phase: PhaseState, t: LoadingT): string | null {
  const { done, total, unit } = phase
  if (done == null && total == null) return null
  if (unit === 'bytes') return formatBytesPair(done ?? 0, total)
  const value = unit === 'points'
    ? formatCountPair(done ?? 0, total)
    : total != null && total > 0 ? `${formatInt(done ?? 0)} / ${formatInt(total)}` : formatInt(done ?? 0)
  if (!unit) return value
  return t(COUNTER_KEYS[unit], { count: Math.round(total ?? done ?? 0), value })
}

function runningLine(job: LoadJobView, t: LoadingT): string {
  const phase = activePhase(job)
  if (!phase) return t(STATUS_KEYS.running)
  const parts: string[] = [t(phaseActiveKey(job.kind, phase.id))]
  const counters = formatCounters(phase, t)
  if (counters) parts.push(counters)
  if (phase.detail) parts.push(phase.detail)
  return parts.join(SEP)
}

function waitingLine(job: LoadJobView, jobs: readonly LoadJobView[], t: LoadingT): string {
  const reason = job.waitReason
  if (!reason) return t(STATUS_KEYS.waiting)
  if (reason === 'anchor') {
    const anchor = anchorJobFor(job, jobs)
    return anchor ? t(WAIT_KEYS.anchor, { name: anchor.displayName }) : t('row.anchorPending')
  }
  return t(WAIT_KEYS[reason])
}

function loadedLine(job: LoadJobView, t: LoadingT): string {
  const parts: string[] = [t(STATUS_KEYS.loaded)]
  const bg = backgroundPhase(job)
  if (bg) {
    parts.push(t(phaseActiveKey(job.kind, bg.id)))
  } else if (job.metrics.objects != null && job.metrics.objects > 0) {
    parts.push(t('row.objects', { count: job.metrics.objects, value: formatInt(job.metrics.objects) }))
  } else if (job.kind === 'pointcloud') {
    // A scan's size is its points, as the decode counted them: "Loaded ·
    // 999,491 points" says what "224 objects" says for a model. (A COPC
    // reports none — what it holds follows the camera.)
    const decode = job.phases.find((p) => p.id === 'decode')
    if (decode?.unit === 'points' && (decode.done ?? 0) > 0) {
      const counted = formatCounters({ ...decode, total: undefined }, t)
      if (counted) parts.push(counted)
    }
  }
  if (job.metrics.fromCache) parts.push(t('row.fromCache'))
  return parts.join(SEP)
}

/**
 * One line that says what a job is doing, with its real numbers:
 *   "Processing geometry · 31 / 48 classes · IFCWALL"
 *   "Downloading · 12.1 / 48.0 MB"
 *   "Queued · #3"                                     (third in its own lane's line)
 *   "Waiting for Architecture.ifc (coordinate base)"  (waiting — or still queued, but held by the anchor)
 *   "Failed · Geometry processing"
 *   "Reading points · 1.2 M / 4.0 M points"           (a scan)
 */
export function describePhaseLine(job: LoadJobView, jobs: readonly LoadJobView[], t: LoadingT): string {
  switch (job.status) {
    case 'queued': {
      if (queuedWithReason(job)) return waitingLine(job, jobs, t)
      const pos = queuePosition(job, jobs)
      return pos != null ? t('row.queuedAt', { position: pos }) : t(STATUS_KEYS.queued)
    }
    case 'held':      return t(STATUS_KEYS.held)
    case 'waiting':   return waitingLine(job, jobs, t)
    case 'running':   return runningLine(job, t)
    case 'unloading': return t('row.unloading')
    case 'loaded':    return loadedLine(job, t)
    case 'failed': {
      const phase = job.error?.phase ?? job.phase
      return phase ? t('row.failed', { phase: t(phaseKey(job.kind, phase)) }) : t(STATUS_KEYS.failed)
    }
    case 'cancelled': return t(STATUS_KEYS.cancelled)
    case 'removed':   return t('row.removed')
  }
}

/**
 * The long stall hint. The IFC one explains the usual cause (one huge class
 * inside IfcImporter); on a scan or a mesh that sentence would be a made-up
 * reason, so every other kind gets the plain one.
 */
export function stalledText(job: LoadJobView, t: LoadingT): string {
  return job.kind === 'ifc' ? t('row.stalled') : t('row.stalledGeneric')
}

// ── Error reason ──────────────────────────────────────────────────────────────

/**
 * Resolves a LoadError `detailKey` ('pointcloud:error.lazTooLarge') to its
 * sentence, or null when no loaded bundle has it. Injected by the component
 * (it owns the namespaces), so this module stays free of i18next's instance.
 */
export type DetailResolver = (key: string) => string | null

export interface ErrorText {
  /** The sentence the user acts on: the domain cause when known, else the code's generic text. */
  reason: string
  /**
   * The code's generic sentence when `reason` is the domain cause — Advanced
   * shows it as a second line, because it is what decided the retry policy —
   * else null (it is already the reason).
   */
  generic: string | null
}

/**
 * Why a job failed, in words. A scan's "That LAZ is too large to decompress in
 * a browser tab — crop or decimate it first" beats the code's generic "this
 * model's schema or size is not supported", which is written for IFC and says
 * nothing a person can do about a point cloud. A detail key the bundles do not
 * know (a runner key nobody translated yet) falls back to the generic text
 * rather than printing the raw key.
 *
 * The generic text follows the job's `kind` (labels.ts `errorKey`): an empty
 * download or a refused link under a .laz has no detail key, and the fallback
 * must not tell it "this file is not a readable IFC model". The same kind-aware
 * sentence is the Advanced second line, so the two views never disagree.
 */
export function errorText(error: LoadError, kind: SourceKind, t: LoadingT, resolveDetail?: DetailResolver): ErrorText {
  const generic = t(errorKey(kind, error.code), { status: error.httpStatus != null ? String(error.httpStatus) : '—' })
  const detail = error.detailKey && resolveDetail ? resolveDetail(error.detailKey) : null
  return detail ? { reason: detail, generic } : { reason: generic, generic: null }
}

// ── Status glyph ──────────────────────────────────────────────────────────────

/**
 * `running` is a ring that fills with the job's fraction; `working` is the
 * same job while its current phase measures nothing (identify, cache lookup,
 * packing, scene setup) — a turning arc, i.e. activity rather than a number.
 */
export type GlyphKind =
  | 'running' | 'working' | 'stalled' | 'unloading' | 'waiting' | 'queued' | 'held'
  | 'loaded' | 'finishing' | 'failed' | 'cancelled' | 'removed'

export function statusGlyphKind(job: LoadJobView): GlyphKind {
  switch (job.status) {
    case 'running':   return job.stalled ? 'stalled' : job.progress.determinate ? 'running' : 'working'
    case 'loaded':    return backgroundPhase(job) ? 'finishing' : 'loaded'
    default:          return job.status
  }
}

// ── Grouping and order ────────────────────────────────────────────────────────

const STATUS_RANK: Record<LoadJobView['status'], number> = {
  running: 0, unloading: 0, waiting: 1, queued: 2, held: 3, failed: 4,
  loaded: 5, cancelled: 6, removed: 7,
}

function byDisplayOrder(a: LoadJobView, b: LoadJobView): number {
  const r = STATUS_RANK[a.status] - STATUS_RANK[b.status]
  if (r !== 0) return r
  // Queued rows read top-down in the order the scheduler will grant them.
  if (a.status === 'queued' || a.status === 'held') return byQueueOrder(a, b)
  return a.seq - b.seq
}

export interface GroupStats {
  /** Members that still count toward the batch (not cancelled or removed). */
  total: number
  loaded: number
  failed: number
  active: number
  /** Size-weighted progress over counted members; loaded members count fully. */
  fraction: number
}

export interface JobGroup {
  /** Stable React key. */
  key: string
  /** null = jobs that were not submitted as part of a multi-file batch. */
  batch: LoadBatchView | null
  jobs: LoadJobView[]
  stats: GroupStats
}

export interface DisplaySections {
  /** Batches with anything in flight or failed, then loose live jobs. */
  live: JobGroup[]
  /** Settled batches and loose finished jobs, newest first. */
  finished: JobGroup[]
}

export function groupStats(members: readonly LoadJobView[]): GroupStats {
  let total = 0; let loaded = 0; let failed = 0; let active = 0
  let weight = 0; let acc = 0
  for (const j of members) {
    if (ACTIVE_STATUSES.has(j.status)) active++
    if (j.status === 'cancelled' || j.status === 'removed') continue
    total++
    if (j.status === 'loaded') loaded++
    if (j.status === 'failed') failed++
    // Unknown sizes (a URL before its headers) weigh as 1 MB, not 0, so they
    // still move the bar instead of vanishing from it.
    const w = j.sizeBytes > 0 ? j.sizeBytes : 1024 * 1024
    weight += w
    acc += w * (j.status === 'loaded' ? 1 : Math.max(0, Math.min(1, j.progress.fraction)))
  }
  return { total, loaded, failed, active, fraction: weight > 0 ? acc / weight : 0 }
}

/**
 * Sections for the Loading Center. A batch stays together while any member is
 * live — the federation reads as one unit ("Hotel Vela 3 / 5") with its loaded
 * members still visible — and moves to "Finished" as a whole once settled.
 * A "batch" of one is shown as a loose row: a header over a single file is
 * ceremony, not information.
 */
export function orderJobsForDisplay(
  jobs: readonly LoadJobView[],
  batches: readonly LoadBatchView[],
): DisplaySections {
  const byBatch = new Map<string, LoadJobView[]>()
  const loose: LoadJobView[] = []
  const batchIds = new Set(batches.map((b) => b.id))
  for (const j of jobs) {
    if (j.batchId && batchIds.has(j.batchId)) {
      const list = byBatch.get(j.batchId)
      if (list) list.push(j)
      else byBatch.set(j.batchId, [j])
    } else {
      loose.push(j)
    }
  }

  const liveBatches: Array<{ group: JobGroup; rank: number; createdAt: number }> = []
  const doneBatches: Array<{ group: JobGroup; newest: number }> = []
  for (const batch of batches) {
    const members = byBatch.get(batch.id)
    if (!members) continue
    if (members.length < 2) { loose.push(...members); continue }
    const sorted = members.slice().sort(byDisplayOrder)
    const group: JobGroup = { key: `batch:${batch.id}`, batch, jobs: sorted, stats: groupStats(sorted) }
    if (sorted.some(isLiveJob)) {
      liveBatches.push({ group, rank: STATUS_RANK[sorted[0].status], createdAt: batch.createdAt })
    } else {
      // Settled: federation order (seq) reads better than status order here.
      group.jobs = members.slice().sort((a, b) => a.seq - b.seq)
      doneBatches.push({ group, newest: Math.max(...members.map((m) => m.seq)) })
    }
  }

  liveBatches.sort((a, b) => a.rank - b.rank || a.createdAt - b.createdAt)
  const live: JobGroup[] = liveBatches.map((b) => b.group)
  const looseLive = loose.filter(isLiveJob).sort(byDisplayOrder)
  if (looseLive.length > 0) live.push({ key: 'loose:live', batch: null, jobs: looseLive, stats: groupStats(looseLive) })

  const looseDone = loose.filter((j) => !isLiveJob(j)).sort((a, b) => b.seq - a.seq)
  const finished = doneBatches.sort((a, b) => b.newest - a.newest).map((e) => e.group)
  if (looseDone.length > 0) finished.push({ key: 'loose:done', batch: null, jobs: looseDone, stats: groupStats(looseDone) })

  return { live, finished }
}

/**
 * The Scene panel's "Loading" list: only what still needs attention (in flight
 * or failed), grouped like the center. A batch keeps its header stats over ALL
 * its members ("2 / 5 loaded") while listing only the unsettled ones — the
 * loaded members are already rows in the model list right below.
 */
export function sceneSectionGroups(
  jobs: readonly LoadJobView[],
  batches: readonly LoadBatchView[],
): JobGroup[] {
  const out: JobGroup[] = []
  for (const g of orderJobsForDisplay(jobs, batches).live) {
    const pending = g.jobs.filter((j) => ACTIVE_STATUSES.has(j.status) || j.status === 'failed')
    if (pending.length > 0) out.push({ ...g, jobs: pending })
  }
  return out
}

/** How many rows the Scene panel section would show (it renders nothing at 0). */
export function countScenePending(jobs: readonly LoadJobView[]): number {
  let n = 0
  for (const j of jobs) if (ACTIVE_STATUSES.has(j.status) || j.status === 'failed') n++
  return n
}

/** Header counter "<loaded> / <total>": cancelled and removed jobs are not part of the target. */
export function headerCounts(jobs: readonly LoadJobView[]): { loaded: number; total: number } {
  let loaded = 0; let total = 0
  for (const j of jobs) {
    if (j.status === 'cancelled' || j.status === 'removed') continue
    total++
    if (j.status === 'loaded') loaded++
  }
  return { loaded, total }
}

export function batchDisplayName(batch: LoadBatchView, memberCount: number, t: LoadingT): string {
  return batch.name.trim() || t('batch.unnamed', { count: memberCount })
}

// ── Summary lines ─────────────────────────────────────────────────────────────

/** "2 loading · 1 queued · 3 loaded · 1 failed" — zero counts are left out. */
export function summaryText(summary: LoadSummary, t: LoadingT): string {
  const parts: string[] = []
  const loading = summary.running + summary.waiting
  if (loading > 0) parts.push(t('center.summary.loading', { count: loading }))
  if (summary.queued > 0) parts.push(t('center.summary.queued', { count: summary.queued }))
  if (summary.held > 0) parts.push(t('center.summary.held', { count: summary.held }))
  if (summary.loaded > 0) parts.push(t('center.summary.loaded', { count: summary.loaded }))
  if (summary.failed > 0) parts.push(t('center.summary.failed', { count: summary.failed }))
  return parts.join(SEP)
}

/** Display name of the only active job, or null when there are zero or several. */
export function singleActiveName(jobs: readonly LoadJobView[]): string | null {
  let found: LoadJobView | null = null
  for (const j of jobs) {
    if (!ACTIVE_STATUSES.has(j.status)) continue
    if (found) return null
    found = j
  }
  return found ? found.displayName : null
}

/**
 * Every active row is a model job (vacuously true when none is). What lets
 * the indicator say "Loading 3 models": two LAZ files decoding, or an IFC
 * beside a scan, are loads but not models — they count as files.
 */
export function activeAreAllModels(jobs: readonly LoadJobView[]): boolean {
  for (const j of jobs) if (ACTIVE_STATUSES.has(j.status) && !isModelJob(j)) return false
  return true
}

/** Failed rows that are model jobs — the part of `summary.failed` that may be called "models". */
export function countFailedModels(jobs: readonly LoadJobView[]): number {
  let n = 0
  for (const j of jobs) if (j.status === 'failed' && isModelJob(j)) n++
  return n
}

/**
 * The live-region sentence for `count` new failures, `modelCount` of them
 * model jobs. "N models failed to load" only when every one of them was a
 * model; a scan, a mesh or a GIS fetch among them makes it "N loads failed".
 * The neutral sentence is never wrong about what failed, so any doubt (the
 * deltas of two counts do not match) falls to it.
 */
export function failureAnnouncement(count: number, modelCount: number, t: LoadingT): string {
  return modelCount === count
    ? t('indicator.announce.failed', { count })
    : t('indicator.announce.failedLoads', { count })
}

export type IndicatorKind = 'hidden' | 'active' | 'queued' | 'finishing' | 'failed' | 'done'

export interface IndicatorInput {
  active: number
  running: number
  waiting: number
  queued: number
  held: number
  finishing: number
  unseenFailures: number
  /** summary.fraction as a display percent. */
  percent: number
  /** summary.measuring: some active job's current phase reports real progress. */
  measuring: boolean
  singleName: string | null
  /**
   * Every active row is a model job (`activeAreAllModels`), so the count may
   * say "models"; otherwise it says "files". Required: a caller that forgot
   * it would count scans as models again.
   */
  activeAllModels: boolean
  /** The calm "all loaded" moment after the queue went idle. */
  showDone: boolean
}

export interface IndicatorModel {
  kind: IndicatorKind
  label: string
  /**
   * null = no percentage to show: queued only, finishing, failed, done — and
   * an active set in which nothing measures right now (the ring turns instead).
   */
  percent: number | null
  failures: number
}

/**
 * What the global indicator says. Precedence: in-flight work, then background
 * finishing, then unseen failures, then the brief "done" moment, else nothing.
 * Failures while work is still running do not take over the label — they ride
 * along as `failures` for a badge, so one bad file does not hide the progress
 * of the other four.
 *
 * While no active job measures anything (a GIS fetch, a header check before
 * the first measured phase) there is no percent at all: a static "0%" beside a
 * fetch that is working reads as frozen, and the number would be made up.
 */
export function indicatorModel(input: IndicatorInput, t: LoadingT): IndicatorModel {
  const failures = input.unseenFailures
  if (input.active > 0) {
    if (input.running + input.waiting === 0) {
      const label = input.queued > 0
        ? t('indicator.queued', { count: input.queued })
        : t('indicator.held', { count: input.held })
      return { kind: 'queued', label, percent: null, failures }
    }
    const label = input.active === 1 && input.singleName
      ? t('indicator.loadingOne', { name: input.singleName })
      : input.activeAllModels
        ? t('indicator.loadingMany', { count: input.active })
        : t('indicator.loadingManyFiles', { count: input.active })
    return { kind: 'active', label, percent: input.measuring ? input.percent : null, failures }
  }
  if (input.finishing > 0) return { kind: 'finishing', label: t('indicator.finishing'), percent: null, failures }
  if (failures > 0) return { kind: 'failed', label: t('indicator.failed', { count: failures }), percent: null, failures }
  if (input.showDone) return { kind: 'done', label: t('indicator.done'), percent: null, failures }
  return { kind: 'hidden', label: '', percent: null, failures }
}

// ── The "all loaded" moment ───────────────────────────────────────────────────

/**
 * A settle is identified by the row AND the time it settled, so the same job
 * failing again after a retry is a new failure, not the old one.
 */
function settleKey(job: LoadJobView): string {
  return `${job.id}@${job.metrics.finishedAt ?? ''}`
}

/** What had already landed or failed when a burst of loading began. */
export interface BurstBaseline {
  /** Model jobs (managed IFC) already loaded. */
  loaded: ReadonlySet<string>
  /** Jobs of any kind already failed. */
  failed: ReadonlySet<string>
}

export function burstBaseline(jobs: readonly LoadJobView[]): BurstBaseline {
  const loaded = new Set<string>()
  const failed = new Set<string>()
  for (const j of jobs) {
    if (j.status === 'loaded' && isModelJob(j)) loaded.add(settleKey(j))
    else if (j.status === 'failed') failed.add(settleKey(j))
  }
  return { loaded, failed }
}

/**
 * Whether the queue going idle may say "All models loaded": at least one
 * MODEL job (managed IFC) landed during the burst, and nothing of any kind
 * failed in it. Decided from the burst itself, not from totals — "3 loaded" in
 * the summary includes models from an hour ago, so a burst that only
 * cancelled a file, only fetched GIS terrain, or only brought in a scan or a
 * glTF (managed rows now, but not models) would otherwise end on a green
 * check that names a load that never happened.
 */
export function burstLoadedModels(baseline: BurstBaseline, jobs: readonly LoadJobView[]): boolean {
  let landed = false
  for (const j of jobs) {
    if (j.status === 'failed' && !baseline.failed.has(settleKey(j))) return false
    if (j.status === 'loaded' && isModelJob(j) && !baseline.loaded.has(settleKey(j))) landed = true
  }
  return landed
}

// ── First-load focus ──────────────────────────────────────────────────────────

export interface FirstLoadFocus {
  mode: 'job' | 'batch'
  /** The job the card leads with: lowest-seq active one, or the newest failure. */
  job: LoadJobView
  batch: LoadBatchView | null
  /** Model members of the batch in submission order (just [job] in 'job' mode). */
  members: LoadJobView[]
}

/**
 * What the empty-scene card is about. Model jobs only: a scan or a glTF is
 * managed too, but it is not "your model" — it has its own panel, and it
 * lands in a scene that stays "empty" of models, so the card would sit over
 * the cloud it announces. A tracked GIS fetch is not managed at all. The same
 * goes for batch members: "Hotel Vela — 2 of 5 models" counts models.
 */
export function pickFirstLoadFocus(
  jobs: readonly LoadJobView[],
  batches: readonly LoadBatchView[],
  includeFailed: boolean,
): FirstLoadFocus | null {
  let primary: LoadJobView | null = null
  for (const j of jobs) {
    if (!isModelJob(j) || !ACTIVE_STATUSES.has(j.status)) continue
    if (!primary || j.seq < primary.seq) primary = j
  }
  if (!primary && includeFailed) {
    for (const j of jobs) {
      if (!isModelJob(j) || j.status !== 'failed') continue
      if (!primary || j.seq > primary.seq) primary = j
    }
  }
  if (!primary) return null
  const batch = primary.batchId ? batches.find((b) => b.id === primary!.batchId) ?? null : null
  if (batch) {
    const members = jobs.filter((j) => j.batchId === batch.id && isModelJob(j)).sort((a, b) => a.seq - b.seq)
    if (members.length >= 2) return { mode: 'batch', job: primary, batch, members }
  }
  return { mode: 'job', job: primary, batch: null, members: [primary] }
}

// ── Phase checklist ───────────────────────────────────────────────────────────

/** Phases a cache hit makes unnecessary — "skipped" means "cache hit" for these. */
const CONVERT_PHASES: ReadonlySet<PhaseId> = new Set<PhaseId>([
  'download', 'geometry', 'properties', 'relations', 'serialize', 'cache-write',
])

export interface ChecklistItem {
  phase: PhaseState
  /** Wall time of a finished phase, when known. */
  durationMs: number | null
  /** Why a skipped phase was skipped, when we know. */
  skipReason: 'cache' | null
}

export function phaseChecklist(job: LoadJobView): ChecklistItem[] {
  return job.phases.map((phase) => {
    const measured = job.metrics.phaseDurations[phase.id]
    const durationMs = phase.status === 'done'
      ? (measured ?? (phase.startedAt != null && phase.endedAt != null ? Math.max(0, phase.endedAt - phase.startedAt) : null))
      : null
    const skipReason = phase.status === 'skipped' && job.metrics.fromCache && CONVERT_PHASES.has(phase.id) ? 'cache' : null
    return { phase, durationMs, skipReason }
  })
}

// ── Session ───────────────────────────────────────────────────────────────────

const CONVERT_TIMING: readonly PhaseId[] = ['geometry', 'properties', 'relations', 'serialize']

/**
 * Mean end-to-end conversion speed in MB/s from the session's calibrated
 * ms-per-MB, or null before any file finished converting (no sample, no number).
 */
export function meanConvertMBps(session: SessionMetrics): number | null {
  let msPerMB = 0
  for (const id of CONVERT_TIMING) {
    const v = session.msPerMB[id]
    if (v != null && (session.msPerMBSamples[id] ?? 0) > 0) msPerMB += v
  }
  return msPerMB > 0 ? 1000 / msPerMB : null
}
