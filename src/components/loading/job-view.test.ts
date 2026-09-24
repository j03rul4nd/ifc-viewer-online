// @vitest-environment node
// ─── Loading Center view model tests ──────────────────────────────────────────
// Every sentence the loading UI prints comes out of job-view.ts, so this is
// where the honesty rules are pinned: counters only when reported, an ETA only
// when reliable, no "100%" before commit, and a waiting job that names what it
// waits for. The `t` below resolves against the real EN bundle (plurals
// included), so a renamed key fails here rather than as a raw key on screen.

import { describe, it, expect } from 'vitest'
import enLoading from '../../locales/en/loading.json'
import enPointCloud from '../../locales/en/pointcloud.json'
import type { LoadBatchView, LoadError, LoadJobView, PhaseState } from '../../lib/loading/types'
import { EMPTY_SUMMARY, emptySession } from '../../lib/loading/defaults'
import {
  activeAreAllModels, anchorJobFor, batchDisplayName, burstBaseline, burstLoadedModels, countFailedModels,
  countScenePending, describePhaseLine, sceneSectionGroups,
  displayPercent, errorText, failureAnnouncement, formatBytesPair, formatCountPair, formatCounters, formatElapsed,
  formatEta, groupStats, headerCounts, indicatorModel, isModelJob, jobElapsedMs, jobEtaMs, meanConvertMBps,
  orderJobsForDisplay, phaseChecklist, pickFirstLoadFocus, queuePosition, shortFingerprint, shownPercent,
  singleActiveName, stalledText, statusGlyphKind, summaryText, type DetailResolver, type IndicatorInput, type LoadingT,
} from './job-view'
import { ERROR_KEYS, errorKey, phaseActiveKey, phaseKey } from './labels'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function lookup(key: string): string | undefined {
  const hit = key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], enLoading)
  return typeof hit === 'string' ? hit : undefined
}

/** Stands in for i18next: dotted keys, `_one`/`_other` plurals, {{params}}. */
const t = ((key: string, opts?: Record<string, unknown>) => {
  let hit: string | undefined
  if (opts && typeof opts.count === 'number') hit = lookup(`${key}_${opts.count === 1 ? 'one' : 'other'}`)
  hit ??= lookup(key)
  if (hit == null) return key
  return hit.replace(/\{\{(\w+)\}\}/g, (_, p: string) => String(opts?.[p] ?? `{{${p}}}`))
}) as unknown as LoadingT

let seq = 0
type JobPatch = Omit<Partial<LoadJobView>, 'metrics'> & { metrics?: Partial<LoadJobView['metrics']> }

function job(patch: JobPatch = {}): LoadJobView {
  seq++
  const { metrics, ...rest } = patch
  return {
    id: `j${seq}`, kind: 'ifc', origin: 'upload', managed: true,
    fileName: `Model_${seq}.ifc`, displayName: `Model_${seq}.ifc`, sizeBytes: 10 * 1024 * 1024,
    discipline: null, batchId: null, priority: 2, effectivePriority: 2,
    status: 'queued', waitReason: null, phase: null, phases: [],
    progress: { fraction: 0, determinate: false }, stalled: false, attempts: 1, error: null,
    metrics: { submittedAt: 1000, etaMs: null, etaReliable: false, estimatedPeakBytes: 0, phaseDurations: {}, ...metrics },
    resultId: null, fingerprint: null, duplicateOf: null, requestId: null, sourceUrl: null, seq,
    capabilities: {
      cancel: true, retry: false, hold: true, resume: false, reprioritize: true, reload: false, remove: false, dismiss: false,
      focus: false,
    },
    ...rest,
  }
}

/** A managed scan — a job, not a model. */
function scan(patch: JobPatch = {}): LoadJobView {
  return job({ kind: 'pointcloud', fileName: 'scan.laz', displayName: 'scan.laz', ...patch })
}

function phase(id: PhaseState['id'], patch: Partial<PhaseState> = {}): PhaseState {
  return { id, status: 'pending', weight: 1, fraction: null, ...patch }
}

function batch(id: string, name: string, jobIds: string[], createdAt = 0): LoadBatchView {
  return { id, name, createdAt, jobIds, groupId: null }
}

// ── Phase line ────────────────────────────────────────────────────────────────

describe('describePhaseLine', () => {
  it('prints the active phase with its real class counters and the IFC class', () => {
    const j = job({
      status: 'running', phase: 'geometry',
      phases: [
        phase('identify', { status: 'done' }),
        phase('geometry', { status: 'active', fraction: 31 / 48, done: 31, total: 48, unit: 'classes', detail: 'IFCWALL' }),
      ],
    })
    expect(describePhaseLine(j, [j], t)).toBe('Processing geometry · 31 / 48 classes · IFCWALL')
  })

  it('prints download bytes in the unit of the total', () => {
    const j = job({
      status: 'running', phase: 'download',
      phases: [phase('download', { status: 'active', done: 12.1 * 1024 ** 2, total: 48 * 1024 ** 2, unit: 'bytes' })],
    })
    expect(describePhaseLine(j, [j], t)).toBe('Downloading · 12.1 / 48.0 MB')
  })

  it('prints no counters when the phase reported none (activity, not a number)', () => {
    const j = job({ status: 'running', phase: 'serialize', phases: [phase('serialize', { status: 'active' })] })
    expect(describePhaseLine(j, [j], t)).toBe('Packing fragments')
  })

  it('uses the singular for a single class', () => {
    const j = job({ status: 'running', phase: 'relations', phases: [phase('relations', { status: 'active', done: 1, total: 1, unit: 'classes' })] })
    expect(describePhaseLine(j, [j], t)).toBe('Linking relationships · 1 / 1 class')
  })

  it('numbers queued jobs in scheduler order (priority, then submission)', () => {
    const a = job({ status: 'queued', effectivePriority: 2 })
    const b = job({ status: 'queued', effectivePriority: 1 })
    const c = job({ status: 'queued', effectivePriority: 2 })
    const all = [a, b, c]
    expect(describePhaseLine(b, all, t)).toBe('Queued · #1')
    expect(describePhaseLine(a, all, t)).toBe('Queued · #2')
    expect(describePhaseLine(c, all, t)).toBe('Queued · #3')
    expect(queuePosition(job({ status: 'held' }), all)).toBeNull()
  })

  it('numbers a queued job only among its own lane family', () => {
    // Two IFCs queued for conversion are not ahead of a mesh queued for a
    // decode slot: the scheduler grants the two lines independently. Scans
    // and meshes share the decode lane, so they count together.
    const ifcA = job({ status: 'queued' })
    const ifcB = job({ status: 'queued' })
    const cloud = scan({ status: 'queued', waitReason: 'slot' })
    const mesh = job({ kind: 'mesh', status: 'queued', waitReason: 'slot', displayName: 'tree.glb' })
    const all = [ifcA, ifcB, cloud, mesh]
    expect(describePhaseLine(mesh, all, t)).toBe('Queued · #2')
    expect(queuePosition(cloud, all)).toBe(1)
    expect(queuePosition(ifcB, all)).toBe(2)
  })

  it('names the anchor, not a queue place, for a job still queued behind the coordinate base', () => {
    // A job that has done no heavy work yet is `queued` even when what holds
    // it is the anchor rule; "Queued · #1" would hide the reason.
    const arch = job({ status: 'running', displayName: 'A.ifc' })
    const cloud = scan({ status: 'queued', waitReason: 'anchor' })
    const cacheHit = job({ status: 'queued', waitReason: 'anchor', displayName: 'B.ifc' })
    const next = job({ status: 'queued', waitReason: 'slot', displayName: 'C.ifc' })
    const all = [arch, cloud, cacheHit, next]
    expect(describePhaseLine(cloud, all, t)).toBe('Waiting for A.ifc (coordinate base)')
    expect(describePhaseLine(cacheHit, all, t)).toBe('Waiting for A.ifc (coordinate base)')
    // …and they are not in the slot line the plain queued rows are numbered in.
    expect(queuePosition(cloud, all)).toBeNull()
    expect(describePhaseLine(next, all, t)).toBe('Queued · #1')
    // The point budget is a reason too.
    expect(describePhaseLine(scan({ status: 'queued', waitReason: 'budget' }), [], t))
      .toBe('Waiting for the point budget (another scan is still loading)')
  })

  it('names the anchor a waiting job is blocked on', () => {
    const arch = job({ status: 'running', displayName: 'Architecture.ifc' })
    const mep = job({ status: 'waiting', waitReason: 'anchor', displayName: 'MEP.ifc' })
    expect(describePhaseLine(mep, [arch, mep], t)).toBe('Waiting for Architecture.ifc (coordinate base)')
  })

  it('never names a finished job, a point cloud, or itself as the anchor', () => {
    const done = job({ status: 'loaded', displayName: 'Done.ifc' })
    const cloud = job({ status: 'running', kind: 'pointcloud', displayName: 'scan.laz' })
    const me = job({ status: 'waiting', waitReason: 'anchor' })
    expect(anchorJobFor(me, [done, cloud, me])).toBeNull()
    expect(describePhaseLine(me, [done, cloud, me], t)).toBe('Waiting for the first model (coordinate base)')
  })

  it('passes over a held model, as the scheduler does, and names the next one', () => {
    // The user paused A: the attach lane's anchor moves on to B, so "Waiting
    // for A.ifc" would name a job nothing is waiting for.
    const paused = job({ status: 'held', displayName: 'A.ifc' })
    const next = job({ status: 'running', displayName: 'B.ifc' })
    const me = job({ status: 'waiting', waitReason: 'anchor' })
    expect(anchorJobFor(me, [paused, next, me])?.id).toBe(next.id)
    expect(describePhaseLine(me, [paused, next, me], t)).toBe('Waiting for B.ifc (coordinate base)')
    expect(anchorJobFor(me, [paused, me])).toBeNull()
  })

  it('prints every wait reason as a sentence, not an enum value', () => {
    for (const reason of ['slot', 'memory', 'exclusive', 'attach-lane', 'backoff', 'viewer', 'budget'] as const) {
      const line = describePhaseLine(job({ status: 'waiting', waitReason: reason }), [], t)
      expect(line, reason).not.toContain('wait.')
      expect(line.length).toBeGreaterThan(8)
    }
    expect(describePhaseLine(job({ status: 'waiting', waitReason: 'memory' }), [], t)).toBe('Waiting for memory')
    expect(describePhaseLine(job({ status: 'waiting', waitReason: 'viewer' }), [], t)).toBe('Waiting for the 3D viewer')
  })

  it('says a scan held at its header waits for the point budget, and why', () => {
    const line = describePhaseLine(scan({ status: 'waiting', waitReason: 'budget', phase: 'place' }), [], t)
    expect(line).toBe('Waiting for the point budget (another scan is still loading)')
  })

  it('says where a job failed', () => {
    const j = job({
      status: 'failed', phase: 'geometry',
      error: { code: 'parse', message: 'x', phase: 'geometry', autoRetryable: false, userRetryable: true, attempt: 1 },
    })
    expect(describePhaseLine(j, [j], t)).toBe('Failed · Geometry processing')
    expect(describePhaseLine(job({ status: 'failed' }), [], t)).toBe('Failed')
  })

  it('describes a loaded model by its objects and cache origin, or by what it is still finishing', () => {
    const plain = job({ status: 'loaded', metrics: { objects: 12345, fromCache: true } })
    expect(describePhaseLine(plain, [], t)).toBe(`Loaded · ${(12345).toLocaleString()} objects · from cache`)
    const streaming = job({ status: 'loaded', phases: [phase('stream', { status: 'active', background: true })] })
    expect(describePhaseLine(streaming, [], t)).toBe('Loaded · Uploading to the GPU')
  })

  it('speaks a scan\'s own words: the reader, points in millions', () => {
    const reading = scan({
      status: 'running', phase: 'decode',
      phases: [
        phase('identify', { status: 'done' }),
        phase('place', { status: 'done' }),
        phase('decode', { status: 'active', fraction: 0.3, done: 1_234_567, total: 4_012_345, unit: 'points' }),
      ],
    })
    expect(describePhaseLine(reading, [reading], t)).toBe('Reading points · 1.2 M / 4.0 M points')
    const starting = scan({ status: 'running', phase: 'identify', phases: [phase('identify', { status: 'active' })] })
    expect(describePhaseLine(starting, [starting], t)).toBe('Preparing the reader')
    // Placement reads right for a scan with the generic words.
    const placing = scan({ status: 'running', phase: 'place', phases: [phase('place', { status: 'active' })] })
    expect(describePhaseLine(placing, [placing], t)).toBe('Placing in the scene')
    const failed = scan({
      status: 'failed', phase: 'decode',
      error: { code: 'unsupported', message: 'x', phase: 'decode', autoRetryable: false, userRetryable: false, attempt: 1 },
    })
    expect(describePhaseLine(failed, [failed], t)).toBe('Failed · Point reading')
  })

  it('a loaded scan says how many points it holds; a COPC (no count) just says loaded', () => {
    const loaded = scan({
      status: 'loaded',
      phases: [
        phase('identify', { status: 'done' }),
        phase('decode', { status: 'done', fraction: 1, done: 999_491, total: 999_491, unit: 'points' }),
      ],
    })
    expect(describePhaseLine(loaded, [loaded], t)).toBe(`Loaded · ${(999_491).toLocaleString()} points`)
    const big = scan({ status: 'loaded', phases: [phase('decode', { status: 'done', done: 12_345_678, total: 12_345_678, unit: 'points' })] })
    expect(describePhaseLine(big, [big], t)).toBe('Loaded · 12.3 M points')
    const copc = scan({ status: 'loaded', phases: [phase('decode', { status: 'done' })] })
    expect(describePhaseLine(copc, [copc], t)).toBe('Loaded')
  })

  it('keeps the generic phase words for a mesh and for an IFC', () => {
    const mesh = job({ kind: 'mesh', status: 'running', phase: 'decode', phases: [phase('decode', { status: 'active' })] })
    expect(describePhaseLine(mesh, [mesh], t)).toBe('Decoding')
    expect(t(phaseKey('mesh', 'place'))).toBe('Placement')
    expect(t(phaseKey('ifc', 'identify'))).toBe('File check')
    expect(t(phaseActiveKey('ifc', 'identify'))).toBe('Checking the file')
    expect(t(phaseKey('pointcloud', 'identify'))).toBe('Reader setup')
    expect(t(phaseKey('pointcloud', 'download'))).toBe('Download')
  })

  it('names the stall cause only where it is known', () => {
    expect(stalledText(job({ status: 'running', stalled: true }), t)).toContain('Large IFC classes')
    expect(stalledText(scan({ status: 'running', stalled: true }), t)).toBe('No progress for a while. Keep waiting or cancel.')
  })

  it('covers the remaining statuses', () => {
    expect(describePhaseLine(job({ status: 'held' }), [], t)).toBe('On hold')
    expect(describePhaseLine(job({ status: 'cancelled' }), [], t)).toBe('Cancelled')
    expect(describePhaseLine(job({ status: 'unloading' }), [], t)).toBe('Removing from the scene')
    expect(describePhaseLine(job({ status: 'removed' }), [], t)).toBe('Removed from the scene')
    expect(describePhaseLine(job({ status: 'running' }), [], t)).toBe('Loading')
  })
})

// ── Glyphs ────────────────────────────────────────────────────────────────────

describe('statusGlyphKind', () => {
  it('maps statuses and the refinements (measuring, stalled, finishing)', () => {
    expect(statusGlyphKind(job({ status: 'running', progress: { fraction: 0.3, determinate: true } }))).toBe('running')
    // A phase that measures nothing shows activity, not a ring parked at a fraction.
    expect(statusGlyphKind(job({ status: 'running', progress: { fraction: 0.3, determinate: false } }))).toBe('working')
    expect(statusGlyphKind(job({ status: 'running', stalled: true }))).toBe('stalled')
    expect(statusGlyphKind(job({ status: 'loaded' }))).toBe('loaded')
    expect(statusGlyphKind(job({ status: 'loaded', phases: [phase('index', { status: 'active', background: true })] }))).toBe('finishing')
    for (const s of ['queued', 'held', 'waiting', 'failed', 'cancelled', 'removed', 'unloading'] as const) {
      expect(statusGlyphKind(job({ status: s }))).toBe(s)
    }
  })
})

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('orderJobsForDisplay', () => {
  it('orders live jobs running → waiting → queued → held → failed and moves the rest to Finished', () => {
    const failed = job({ status: 'failed' })
    const queued = job({ status: 'queued' })
    const loaded = job({ status: 'loaded' })
    const running = job({ status: 'running' })
    const held = job({ status: 'held' })
    const waiting = job({ status: 'waiting' })
    const cancelled = job({ status: 'cancelled' })
    const { live, finished } = orderJobsForDisplay([failed, queued, loaded, running, held, waiting, cancelled], [])
    expect(live).toHaveLength(1)
    expect(live[0].jobs.map((j) => j.status)).toEqual(['running', 'waiting', 'queued', 'held', 'failed'])
    expect(finished).toHaveLength(1)
    // Newest first in Finished.
    expect(finished[0].jobs.map((j) => j.id)).toEqual([cancelled.id, loaded.id])
  })

  it('keeps a live batch together, loaded members included, ahead of loose jobs', () => {
    const loose = job({ status: 'running' })
    const a = job({ status: 'loaded', batchId: 'b1' })
    const b = job({ status: 'running', batchId: 'b1' })
    const c = job({ status: 'queued', batchId: 'b1' })
    const { live, finished } = orderJobsForDisplay([loose, a, b, c], [batch('b1', 'Hotel Vela', [a.id, b.id, c.id])])
    expect(live.map((g) => g.key)).toEqual(['batch:b1', 'loose:live'])
    expect(live[0].jobs.map((j) => j.id)).toEqual([b.id, c.id, a.id])
    expect(live[0].stats).toMatchObject({ total: 3, loaded: 1, active: 2 })
    expect(finished).toHaveLength(0)
  })

  it('moves a settled batch to Finished whole, in submission order', () => {
    const a = job({ status: 'loaded', batchId: 'b1' })
    const b = job({ status: 'cancelled', batchId: 'b1' })
    const { live, finished } = orderJobsForDisplay([b, a], [batch('b1', 'Tower', [a.id, b.id])])
    expect(live).toHaveLength(0)
    expect(finished[0].batch?.name).toBe('Tower')
    expect(finished[0].jobs.map((j) => j.id)).toEqual([a.id, b.id])
  })

  it('shows a one-member batch, or a job whose batch is unknown, as a loose row', () => {
    const solo = job({ status: 'running', batchId: 'b1' })
    const orphan = job({ status: 'running', batchId: 'nope' })
    const { live } = orderJobsForDisplay([solo, orphan], [batch('b1', 'Solo', [solo.id])])
    expect(live).toHaveLength(1)
    expect(live[0].batch).toBeNull()
    expect(live[0].jobs).toHaveLength(2)
  })
})

describe('groupStats', () => {
  it('weights progress by size, counts loaded fully and leaves cancelled out', () => {
    const big = job({ status: 'running', sizeBytes: 300, progress: { fraction: 0.5, determinate: true } })
    const small = job({ status: 'loaded', sizeBytes: 100 })
    const gone = job({ status: 'cancelled', sizeBytes: 10_000 })
    const s = groupStats([big, small, gone])
    expect(s.total).toBe(2)
    expect(s.loaded).toBe(1)
    expect(s.fraction).toBeCloseTo((300 * 0.5 + 100) / 400)
  })
})

describe('sceneSectionGroups', () => {
  it('lists only in-flight and failed jobs, keeping batch stats over every member', () => {
    const a = job({ status: 'loaded', batchId: 'b' })
    const b = job({ status: 'running', batchId: 'b' })
    const c = job({ status: 'failed', batchId: 'b' })
    const unloading = job({ status: 'unloading' })
    const done = job({ status: 'loaded' })
    const all = [a, b, c, unloading, done]
    const groups = sceneSectionGroups(all, [batch('b', 'Hotel Vela', [a.id, b.id, c.id])])
    expect(groups).toHaveLength(1)
    expect(groups[0].jobs.map((j) => j.id)).toEqual([b.id, c.id])
    expect(groups[0].stats).toMatchObject({ total: 3, loaded: 1, failed: 1 })
    expect(countScenePending(all)).toBe(2)
    expect(sceneSectionGroups([done], [])).toEqual([])
  })
})

describe('headerCounts', () => {
  it('counts loaded against jobs that are still meant to land', () => {
    expect(headerCounts([job({ status: 'loaded' }), job({ status: 'running' }), job({ status: 'removed' })]))
      .toEqual({ loaded: 1, total: 2 })
  })
})

// ── Numbers ───────────────────────────────────────────────────────────────────

describe('formatting', () => {
  it('formats elapsed as a tabular clock', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(7_400)).toBe('0:07')
    expect(formatElapsed(754_000)).toBe('12:34')
    expect(formatElapsed(3_723_000)).toBe('1:02:03')
    expect(formatElapsed(-5)).toBe('0:00')
  })

  it('formats ETA coarsely, rounding seconds up', () => {
    expect(formatEta(1_200)).toBe('<5 s')
    expect(formatEta(31_000)).toBe('35 s')
    expect(formatEta(59_000)).toBe('55 s')
    expect(formatEta(150_000)).toBe('3 min')
    expect(formatEta(3_900_000)).toBe('1 h 5 min')
    expect(formatEta(7_200_000)).toBe('2 h')
  })

  it('formats byte pairs in one unit', () => {
    expect(formatBytesPair(512, 2048)).toBe('0.5 / 2.0 KB')
    expect(formatBytesPair(900)).toBe('900.0 B')
    expect(formatBytesPair(3, 10)).toBe('3 / 10 B')
  })

  it('formats point counts in millions once they reach a million, both sides in M', () => {
    expect(formatCountPair(1_234_567, 4_012_345)).toBe('1.2 M / 4.0 M')
    expect(formatCountPair(0, 20_000_000)).toBe('0.0 M / 20.0 M')
    expect(formatCountPair(2_500_000)).toBe('2.5 M')
    expect(formatCountPair(812, 950)).toBe(`${(812).toLocaleString()} / ${(950).toLocaleString()}`)
    expect(formatCountPair(-5)).toBe('0')
  })

  it('never lets a point counter read complete before the scan has read every point', () => {
    // Rounding the done side printed "4.0 M / 4.0 M" at 98 %.
    expect(formatCountPair(3_960_000, 4_012_345)).toBe('3.9 M / 4.0 M')
    expect(formatCountPair(19_960_000, 20_000_000)).toBe('19.9 M / 20.0 M')
    expect(formatCountPair(3_960_000)).toBe('3.9 M')
    // In the last tenth the floor meets the rounded total: digits, not "4.0 M / 4.0 M".
    expect(formatCountPair(4_003_120, 4_012_345)).toBe(`${(4_003_120).toLocaleString()} / ${(4_012_345).toLocaleString()}`)
    // Done is done.
    expect(formatCountPair(4_012_345, 4_012_345)).toBe('4.0 M / 4.0 M')
    expect(formatCountPair(20_000_000, 20_000_000)).toBe('20.0 M / 20.0 M')
  })

  it('keeps whole numbers for every other counter unit', () => {
    const p = phase('geometry', { status: 'active', done: 1_500_000, total: 3_000_000, unit: 'entities' })
    expect(formatCounters(p, t)).toBe(`${(1_500_000).toLocaleString()} / ${(3_000_000).toLocaleString()} entities`)
    expect(formatCounters(phase('decode', { status: 'active', done: 1, total: 1, unit: 'points' }), t)).toBe('1 / 1 point')
  })

  it('never shows 100% before the commit', () => {
    expect(displayPercent(0.999, false)).toBe(99)
    expect(displayPercent(0.724, false)).toBe(72)
    expect(displayPercent(0.5, true)).toBe(100)
    expect(displayPercent(Number.NaN, false)).toBe(0)
  })

  it('prints no row percent until something was measured', () => {
    // Header check before any measured phase: activity only, no "0%".
    expect(shownPercent(job({ status: 'running', progress: { fraction: 0, determinate: false } }))).toBeNull()
    // A real 0 from a phase that measures (a download that just began) is a reading.
    expect(shownPercent(job({ status: 'running', progress: { fraction: 0, determinate: true } }))).toBe(0)
    // An unmeasured phase after measured ones keeps the estimate those earned.
    expect(shownPercent(job({ status: 'running', progress: { fraction: 0.62, determinate: false } }))).toBe(62)
    expect(shownPercent(job({ status: 'loaded', progress: { fraction: 1, determinate: false } }))).toBe(100)
  })

  it('shortens fingerprints to their hash', () => {
    expect(shortFingerprint('f1:1234:0123456789abcdef0123')).toBe('0123456789ab…')
    expect(shortFingerprint(null)).toBeNull()
  })
})

describe('elapsed and ETA', () => {
  it('measures from start to finish, or to now while running', () => {
    expect(jobElapsedMs(job({ metrics: { startedAt: 1_000 } }), 4_000)).toBe(3_000)
    expect(jobElapsedMs(job({ metrics: { startedAt: 1_000, finishedAt: 2_500 } }), 9_000)).toBe(1_500)
    expect(jobElapsedMs(job(), 9_000)).toBeNull()
  })

  it('shows an ETA only when reliable, counting down from the last report and never below zero', () => {
    expect(jobEtaMs(job({ metrics: { etaMs: 10_000, etaReliable: false } }), 0)).toBeNull()
    const j = job({ metrics: { etaMs: 10_000, etaReliable: true, lastActivityAt: 1_000 } })
    expect(jobEtaMs(j, 4_000)).toBe(7_000)
    // Just past the forecast, inside the grace (max(5 s, 25 %)): held at zero.
    expect(jobEtaMs(j, 15_000)).toBe(0)
  })

  it('withdraws the forecast once the silence outlasts it, instead of parking at "<5 s left"', () => {
    const j = job({ metrics: { etaMs: 10_000, etaReliable: true, lastActivityAt: 1_000 } })
    expect(jobEtaMs(j, 16_500)).toBeNull()
    expect(jobEtaMs(j, 60_000)).toBeNull()
    // The grace scales with the forecast: a 60 s forecast keeps "<5 s" for 15 s.
    const long = job({ metrics: { etaMs: 60_000, etaReliable: true, lastActivityAt: 0 } })
    expect(jobEtaMs(long, 74_000)).toBe(0)
    expect(jobEtaMs(long, 76_000)).toBeNull()
  })
})

// ── Summary + indicator ───────────────────────────────────────────────────────

describe('summaryText', () => {
  it('lists only non-zero counts', () => {
    const s = { ...EMPTY_SUMMARY, running: 1, waiting: 1, queued: 1, loaded: 3, failed: 1 }
    expect(summaryText(s, t)).toBe('2 loading · 1 queued · 3 loaded · 1 failed')
    expect(summaryText({ ...EMPTY_SUMMARY }, t)).toBe('')
  })
})

describe('indicatorModel', () => {
  const base: IndicatorInput = {
    active: 0, running: 0, waiting: 0, queued: 0, held: 0, finishing: 0,
    unseenFailures: 0, percent: 0, measuring: true, singleName: null, activeAllModels: true, showDone: false,
  }

  it('names a single job and counts several', () => {
    expect(indicatorModel({ ...base, active: 1, running: 1, percent: 72, singleName: 'Hotel.ifc' }, t))
      .toMatchObject({ kind: 'active', label: 'Loading Hotel.ifc', percent: 72 })
    expect(indicatorModel({ ...base, active: 3, running: 2, queued: 1, percent: 68 }, t))
      .toMatchObject({ kind: 'active', label: 'Loading 3 models', percent: 68 })
  })

  it('counts files, not models, when a scan, a mesh or a GIS fetch is among the active rows', () => {
    expect(indicatorModel({ ...base, active: 2, running: 2, percent: 30, activeAllModels: false }, t))
      .toMatchObject({ kind: 'active', label: 'Loading 2 files', percent: 30 })
    const model = job({ status: 'running' })
    const cloud = scan({ status: 'running' })
    const terrain = job({ kind: 'gis', managed: false, status: 'running' })
    expect(activeAreAllModels([model, job({ status: 'queued' }), scan({ status: 'loaded' })])).toBe(true)
    expect(activeAreAllModels([model, cloud])).toBe(false)
    expect(activeAreAllModels([model, terrain])).toBe(false)
    expect(activeAreAllModels([cloud, job({ kind: 'mesh', status: 'waiting' })])).toBe(false)
    expect(activeAreAllModels([])).toBe(true)
  })

  it('announces failed models as models and anything else as loads', () => {
    expect(failureAnnouncement(1, 1, t)).toBe('1 model failed to load')
    expect(failureAnnouncement(2, 2, t)).toBe('2 models failed to load')
    // A scan failing — or a scan among the failures — is not "a model".
    expect(failureAnnouncement(1, 0, t)).toBe('1 load failed')
    expect(failureAnnouncement(3, 2, t)).toBe('3 loads failed')
    const failed = (patch: JobPatch): LoadJobView => job({ ...patch, status: 'failed' })
    expect(countFailedModels([failed({}), failed({ kind: 'pointcloud' }), failed({ kind: 'mesh' }), job({ status: 'loaded' })]))
      .toBe(1)
  })

  it('prints no percent while nothing active measures anything', () => {
    // A GIS terrain fetch, or an IFC still in its header check: the label
    // stays, the number goes (the ring turns instead).
    expect(indicatorModel({ ...base, active: 1, running: 1, percent: 0, measuring: false, singleName: 'Site terrain' }, t))
      .toMatchObject({ kind: 'active', label: 'Loading Site terrain', percent: null })
  })

  it('says "queued" when nothing is running yet', () => {
    expect(indicatorModel({ ...base, active: 3, queued: 3 }, t)).toMatchObject({ kind: 'queued', label: '3 queued', percent: null })
    expect(indicatorModel({ ...base, active: 1, held: 1 }, t)).toMatchObject({ kind: 'queued', label: '1 on hold' })
  })

  it('keeps progress in front and carries failures as a badge while work runs', () => {
    const m = indicatorModel({ ...base, active: 1, running: 1, unseenFailures: 1, singleName: 'A.ifc', percent: 10 }, t)
    expect(m.kind).toBe('active')
    expect(m.failures).toBe(1)
  })

  it('then finishing, then failures, then the done moment, then nothing', () => {
    expect(indicatorModel({ ...base, finishing: 2 }, t).kind).toBe('finishing')
    expect(indicatorModel({ ...base, unseenFailures: 2 }, t)).toMatchObject({ kind: 'failed', label: '2 failed' })
    expect(indicatorModel({ ...base, showDone: true }, t)).toMatchObject({ kind: 'done', label: 'All models loaded' })
    expect(indicatorModel(base, t).kind).toBe('hidden')
  })

  it('finds the single active name only when exactly one job is active', () => {
    const a = job({ status: 'running', displayName: 'A.ifc' })
    expect(singleActiveName([a, job({ status: 'loaded' })])).toBe('A.ifc')
    expect(singleActiveName([a, job({ status: 'queued' })])).toBeNull()
    expect(singleActiveName([])).toBeNull()
  })
})

describe('burstLoadedModels', () => {
  const loadedAt = (patch: JobPatch, finishedAt: number): LoadJobView =>
    job({ ...patch, status: 'loaded', metrics: { finishedAt } })

  it('is true when a managed model landed during the burst and nothing failed', () => {
    const earlier = loadedAt({}, 100)
    const base = burstBaseline([earlier])
    expect(burstLoadedModels(base, [earlier, loadedAt({}, 200)])).toBe(true)
  })

  it('is false for a burst that only cancelled, even with older models loaded', () => {
    const earlier = loadedAt({}, 100)
    const b = job({ status: 'queued' })
    const base = burstBaseline([earlier, b])
    expect(burstLoadedModels(base, [earlier, { ...b, status: 'cancelled' }])).toBe(false)
  })

  it('is false for tracked-only bursts (GIS terrain, point clouds are not your models)', () => {
    const base = burstBaseline([])
    expect(burstLoadedModels(base, [loadedAt({ managed: false, kind: 'gis' }, 200)])).toBe(false)
  })

  it('is false for a burst that only brought in managed scans or meshes', () => {
    // Managed jobs now (real phases, cancel, retry) — but not models.
    const base = burstBaseline([])
    expect(burstLoadedModels(base, [
      loadedAt({ kind: 'pointcloud' }, 200), loadedAt({ kind: 'mesh' }, 210),
    ])).toBe(false)
    // A model landing alongside them is what earns the check.
    expect(burstLoadedModels(base, [loadedAt({ kind: 'pointcloud' }, 200), loadedAt({}, 220)])).toBe(true)
  })

  it('is false when a scan failed in the burst, even though a model landed', () => {
    const base = burstBaseline([])
    const failedScan = scan({ status: 'failed', metrics: { finishedAt: 230 } })
    expect(burstLoadedModels(base, [loadedAt({}, 220), failedScan])).toBe(false)
  })

  it('is false when anything failed during the burst, and counts a failed retry as a new failure', () => {
    const base = burstBaseline([])
    const failed = job({ status: 'failed', metrics: { finishedAt: 210 } })
    expect(burstLoadedModels(base, [loadedAt({}, 200), failed])).toBe(false)
    // An old failure does not spoil a later burst…
    const baseWithOld = burstBaseline([failed])
    expect(burstLoadedModels(baseWithOld, [failed, loadedAt({}, 300)])).toBe(true)
    // …but the same row failing again after a retry (new settle time) does.
    expect(burstLoadedModels(baseWithOld, [{ ...failed, metrics: { ...failed.metrics, finishedAt: 320 } }, loadedAt({}, 300)])).toBe(false)
  })
})

// ── First load ────────────────────────────────────────────────────────────────

describe('pickFirstLoadFocus', () => {
  it('leads with the lowest-seq active managed job', () => {
    const cloud = job({ status: 'running', managed: false })
    const first = job({ status: 'running' })
    const second = job({ status: 'queued' })
    const f = pickFirstLoadFocus([cloud, second, first], [], false)
    expect(f?.mode).toBe('job')
    expect(f?.job.id).toBe(first.id)
  })

  it('switches to batch mode when the primary belongs to a real batch', () => {
    const a = job({ status: 'running', batchId: 'b' })
    const b = job({ status: 'queued', batchId: 'b' })
    const f = pickFirstLoadFocus([b, a], [batch('b', 'Hotel Vela', [a.id, b.id])], false)
    expect(f?.mode).toBe('batch')
    expect(f?.members.map((m) => m.id)).toEqual([a.id, b.id])
  })

  it('falls back to the newest failure only when asked', () => {
    const old = job({ status: 'failed' })
    const recent = job({ status: 'failed' })
    expect(pickFirstLoadFocus([old, recent], [], false)).toBeNull()
    expect(pickFirstLoadFocus([old, recent], [], true)?.job.id).toBe(recent.id)
  })

  it('is about models only: a managed scan or mesh never leads the card', () => {
    const cloud = scan({ status: 'running' })
    const mesh = job({ kind: 'mesh', status: 'queued' })
    expect(pickFirstLoadFocus([cloud, mesh], [], false)).toBeNull()
    expect(pickFirstLoadFocus([scan({ status: 'failed' })], [], true)).toBeNull()
    const model = job({ status: 'queued' })
    expect(pickFirstLoadFocus([cloud, mesh, model], [], false)?.job.id).toBe(model.id)
  })

  it('counts only the models of a mixed batch', () => {
    const a = job({ status: 'running', batchId: 'b' })
    const cloud = scan({ status: 'queued', batchId: 'b' })
    const c = job({ status: 'queued', batchId: 'b' })
    const f = pickFirstLoadFocus([a, cloud, c], [batch('b', 'Site', [a.id, cloud.id, c.id])], false)
    expect(f?.mode).toBe('batch')
    expect(f?.members.map((m) => m.id)).toEqual([a.id, c.id])
    // One model and a scan is not a federation: the card leads with the model alone.
    const solo = pickFirstLoadFocus([a, cloud], [batch('b', 'Site', [a.id, cloud.id])], false)
    expect(solo?.mode).toBe('job')
  })
})

describe('isModelJob', () => {
  it('is managed IFC and nothing else', () => {
    expect(isModelJob(job())).toBe(true)
    expect(isModelJob(scan())).toBe(false)
    expect(isModelJob(job({ kind: 'mesh' }))).toBe(false)
    expect(isModelJob(job({ kind: 'gis', managed: false }))).toBe(false)
    expect(isModelJob(job({ managed: false }))).toBe(false)
  })
})

// ── Error reason ──────────────────────────────────────────────────────────────

describe('errorText', () => {
  const failure = (patch: Partial<LoadError> = {}): LoadError => ({
    code: 'unsupported', message: 'pointcloud error.lazTooLarge', phase: 'decode',
    autoRetryable: false, userRetryable: false, attempt: 1, ...patch,
  })
  /** The real EN pointcloud bundle, namespaced like the adapters' keys. */
  const resolve: DetailResolver = (key) => {
    const [ns, rest] = key.split(':')
    if (ns !== 'pointcloud' || !rest) return null
    const hit = rest.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], enPointCloud)
    return typeof hit === 'string' ? hit : null
  }

  it('leads with the domain cause and keeps the kind-neutral generic sentence for Advanced', () => {
    const r = errorText(failure({ detailKey: 'pointcloud:error.lazTooLarge' }), 'pointcloud', t, resolve)
    expect(r.reason).toBe(enPointCloud.error.lazTooLarge)
    expect(r.generic).toBe(enLoading.errorGeneric.unsupported)
  })

  it('falls back to the kind-neutral sentence for an unknown key, or without a resolver', () => {
    expect(errorText(failure({ detailKey: 'pointcloud:error.brandNew' }), 'pointcloud', t, resolve))
      .toEqual({ reason: enLoading.errorGeneric.unsupported, generic: null })
    expect(errorText(failure({ detailKey: 'pointcloud:error.lazTooLarge' }), 'pointcloud', t))
      .toEqual({ reason: enLoading.errorGeneric.unsupported, generic: null })
  })

  it('never tells a scan or a mesh without a detail key that it is not an IFC model', () => {
    // An empty download under a .laz, a mesh key nobody translated: no detail
    // key resolves, and the fallback must not speak of IFC, a model or a schema.
    const empty = failure({ code: 'invalid-file', phase: 'download', message: 'The downloaded model is empty.' })
    expect(errorText(empty, 'pointcloud', t, resolve).reason).toBe(enLoading.errorGeneric['invalid-file'])
    const odd = failure({ code: 'parse', detailKey: 'mesh:error.brandNew', message: 'mesh error.brandNew' })
    expect(errorText(odd, 'mesh', t, resolve).reason).toBe(enLoading.errorGeneric.parse)
    for (const code of Object.keys(ERROR_KEYS) as Array<keyof typeof ERROR_KEYS>) {
      for (const kind of ['pointcloud', 'mesh', 'gis'] as const) {
        const { reason } = errorText(failure({ code, httpStatus: 500 }), kind, t)
        expect(reason, `${kind}:${code}`).not.toMatch(/\bIFC\b|\bmodels?\b|schema/i)
      }
    }
  })

  it('keeps the IFC wording for a model, and one sentence for codes that read right for any file', () => {
    expect(errorText(failure({ code: 'invalid-file' }), 'ifc', t).reason).toBe(enLoading.error['invalid-file'])
    expect(errorText(failure({ code: 'parse' }), 'ifc', t, resolve).reason).toBe(enLoading.error.parse)
    expect(errorText(failure({ code: 'network' }), 'pointcloud', t).reason).toBe(enLoading.error.network)
    expect(errorKey('mesh', 'timeout')).toBe('error.timeout')
    expect(errorKey('mesh', 'scene')).toBe('errorGeneric.scene')
    expect(errorKey('ifc', 'scene')).toBe('error.scene')
  })

  it('is the generic sentence, with its HTTP status, when there is no detail', () => {
    expect(errorText(failure({ code: 'http', httpStatus: 404, phase: 'download' }), 'pointcloud', t, resolve).reason)
      .toBe('The server refused the file (HTTP 404). Check the link and retry.')
    expect(errorText(failure({ code: 'http', httpStatus: 404, phase: 'download' }), 'ifc', t).reason)
      .toBe('The server refused the file (HTTP 404). Check the link and retry.')
  })
})

describe('phaseChecklist', () => {
  it('reports durations for done phases and "cache hit" for convert phases a hit skipped', () => {
    const j = job({
      status: 'running',
      metrics: { fromCache: true, phaseDurations: { identify: 12 } },
      phases: [
        phase('identify', { status: 'done' }),
        phase('cache-lookup', { status: 'done', startedAt: 100, endedAt: 160 }),
        phase('geometry', { status: 'skipped' }),
        phase('attach', { status: 'active' }),
        phase('stream', { status: 'pending', background: true }),
      ],
    })
    const items = phaseChecklist(j)
    expect(items.map((i) => i.durationMs)).toEqual([12, 60, null, null, null])
    expect(items[2].skipReason).toBe('cache')
    expect(items[4].phase.background).toBe(true)
  })
})

describe('batchDisplayName', () => {
  it('falls back to a count when the batch has no name', () => {
    expect(batchDisplayName(batch('b', '  ', []), 4, t)).toBe('4 models')
    expect(batchDisplayName(batch('b', 'Hotel Vela', []), 4, t)).toBe('Hotel Vela')
  })
})

describe('meanConvertMBps', () => {
  it('is null without samples and inverts the summed ms/MB otherwise', () => {
    expect(meanConvertMBps(emptySession())).toBeNull()
    const s = { ...emptySession(), msPerMB: { geometry: 150, properties: 50 }, msPerMBSamples: { geometry: 2, properties: 2 } }
    expect(meanConvertMBps(s)).toBeCloseTo(5)
  })
})
