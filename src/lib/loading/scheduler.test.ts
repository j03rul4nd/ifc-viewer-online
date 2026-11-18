// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  compareCandidates, decideAttach, decideConvert, decideNetwork, decideSlots, effectivePriority, orderCandidates,
  pickAnchor, type ConvertCandidate, type LaneCandidate,
} from './scheduler'
import type { Priority } from './types'

const MB = 1024 * 1024
const NOW = 1_000_000

function cand(jobId: string, seq: number, over: Partial<ConvertCandidate> = {}): ConvertCandidate {
  return { jobId, seq, priority: 2, enqueuedAt: NOW, peakBytes: 100 * MB, exclusive: false, held: false, ...over }
}

function convert(over: Partial<Parameters<typeof decideConvert>[0]>) {
  return decideConvert({
    holders: [], candidates: [], maxConcurrent: 2, budgetBytes: 2000 * MB, pressure: 'normal', now: NOW, ...over,
  })
}

describe('effectivePriority / ordering', () => {
  it('lifts one level per 45 s waited, floored at critical', () => {
    expect(effectivePriority(3, 0)).toBe(3)
    expect(effectivePriority(3, 44_999)).toBe(3)
    expect(effectivePriority(3, 45_000)).toBe(2)
    expect(effectivePriority(3, 100_000)).toBe(1)
    expect(effectivePriority(2, 10 * 60_000)).toBe(0)
    expect(effectivePriority(0, 10 * 60_000)).toBe(0)
    expect(effectivePriority(4, 90_000, 30_000)).toBe(1)
    expect(effectivePriority(2, -5)).toBe(2)
  })

  it('orders by effective priority then seq', () => {
    const a = { seq: 5, effectivePriority: 1 as Priority }
    const b = { seq: 2, effectivePriority: 2 as Priority }
    const c = { seq: 1, effectivePriority: 1 as Priority }
    expect([a, b, c].sort(compareCandidates)).toEqual([c, a, b])
  })

  it('orderCandidates drops held jobs and applies aging', () => {
    const list: LaneCandidate[] = [
      { jobId: 'late-normal', seq: 3, priority: 2, enqueuedAt: NOW, held: false },
      { jobId: 'old-low', seq: 2, priority: 3, enqueuedAt: NOW - 100_000, held: false },
      { jobId: 'held-high', seq: 1, priority: 1, enqueuedAt: NOW, held: true },
    ]
    const out = orderCandidates(list, NOW)
    expect(out.map((c) => c.jobId)).toEqual(['old-low', 'late-normal'])
    expect(out[0].effectivePriority).toBe(1)
  })
})

describe('decideConvert', () => {
  it('fills slots in priority order and blocks the rest with `slot`', () => {
    const d = convert({ candidates: [cand('a', 1), cand('b', 2, { priority: 1 }), cand('c', 3)] })
    expect(d.grant).toEqual(['b', 'a'])
    expect(d.blocked).toEqual({ c: 'slot' })
  })

  it('counts holders against the slots', () => {
    const d = convert({ holders: [{ jobId: 'h', peakBytes: 100 * MB, exclusive: false }], candidates: [cand('a', 1), cand('b', 2)] })
    expect(d.grant).toEqual(['a'])
    expect(d.blocked).toEqual({ b: 'slot' })
  })

  it('never grants held candidates and gives them no reason', () => {
    const d = convert({ candidates: [cand('a', 1, { held: true }), cand('b', 2)] })
    expect(d.grant).toEqual(['b'])
    expect(d.blocked).toEqual({})
  })

  it('an exclusive holder blocks everything', () => {
    const d = convert({ holders: [{ jobId: 'h', peakBytes: 1, exclusive: true }], candidates: [cand('a', 1), cand('b', 2)] })
    expect(d.grant).toEqual([])
    expect(d.blocked).toEqual({ a: 'exclusive', b: 'exclusive' })
  })

  it('an exclusive candidate runs only on an empty lane, and then alone', () => {
    const alone = convert({ maxConcurrent: 3, candidates: [cand('big', 1, { exclusive: true }), cand('s', 2)] })
    expect(alone.grant).toEqual(['big'])
    expect(alone.blocked).toEqual({ s: 'exclusive' })

    const busy = convert({
      maxConcurrent: 3,
      holders: [{ jobId: 'h', peakBytes: 100 * MB, exclusive: false }],
      candidates: [cand('big', 1, { exclusive: true }), cand('s', 2)],
    })
    expect(busy.blocked.big).toBe('exclusive')
    expect(busy.grant).toEqual(['s'])

    const afterSmall = convert({ maxConcurrent: 3, candidates: [cand('s', 1), cand('big', 2, { exclusive: true })] })
    expect(afterSmall.grant).toEqual(['s'])
    expect(afterSmall.blocked).toEqual({ big: 'exclusive' })
  })

  it('admits by summed peak and always lets one job run on an empty lane', () => {
    const d = convert({
      maxConcurrent: 3, budgetBytes: 1000 * MB,
      candidates: [cand('a', 1, { peakBytes: 600 * MB }), cand('b', 2, { peakBytes: 600 * MB }), cand('c', 3, { peakBytes: 300 * MB })],
    })
    expect(d.grant).toEqual(['a', 'c'])
    expect(d.blocked).toEqual({ b: 'memory' })

    const huge = convert({ budgetBytes: 1000 * MB, candidates: [cand('huge', 1, { peakBytes: 5000 * MB })] })
    expect(huge.grant).toEqual(['huge'])
  })

  it('reserves the lane for a memory-blocked head after 30 s', () => {
    const holders = [{ jobId: 'h', peakBytes: 600 * MB, exclusive: false }]
    const early = convert({
      maxConcurrent: 3, budgetBytes: 1000 * MB, holders,
      candidates: [cand('head', 1, { peakBytes: 600 * MB, enqueuedAt: NOW - 10_000 }), cand('small', 2, { peakBytes: 200 * MB })],
    })
    expect(early.grant).toEqual(['small'])
    expect(early.blocked).toEqual({ head: 'memory' })

    const late = convert({
      maxConcurrent: 3, budgetBytes: 1000 * MB, holders,
      candidates: [cand('head', 1, { peakBytes: 600 * MB, enqueuedAt: NOW - 30_000 }), cand('small', 2, { peakBytes: 200 * MB })],
    })
    expect(late.grant).toEqual([])
    expect(late.blocked).toEqual({ head: 'memory', small: 'slot' })
  })

  it('reserves for a long-waiting exclusive candidate too', () => {
    const d = convert({
      maxConcurrent: 3,
      holders: [{ jobId: 'h', peakBytes: 100 * MB, exclusive: false }],
      candidates: [cand('big', 1, { exclusive: true, enqueuedAt: NOW - 31_000 }), cand('s', 2)],
    })
    expect(d.grant).toEqual([])
    expect(d.blocked).toEqual({ big: 'exclusive', s: 'slot' })
  })

  it('elevated pressure runs one at a time; critical only when idle', () => {
    const cands = [cand('a', 1), cand('b', 2)]
    expect(convert({ maxConcurrent: 3, pressure: 'elevated', candidates: cands }).grant).toEqual(['a'])
    expect(convert({ maxConcurrent: 3, pressure: 'critical', candidates: cands }).grant).toEqual(['a'])
    const busy = convert({
      maxConcurrent: 3, pressure: 'critical', candidates: cands,
      holders: [{ jobId: 'h', peakBytes: 1, exclusive: false }],
    })
    expect(busy.grant).toEqual([])
    expect(busy.blocked).toEqual({ a: 'memory', b: 'memory' })
  })

  it('aging lets an old low-priority job overtake a fresh normal one', () => {
    const d = convert({
      maxConcurrent: 1,
      candidates: [cand('fresh', 1, { priority: 2 }), cand('old', 2, { priority: 3, enqueuedAt: NOW - 100_000 })],
    })
    expect(d.grant).toEqual(['old'])
  })
})

describe('decideNetwork', () => {
  it('grants up to max in order', () => {
    const c = (jobId: string, seq: number): LaneCandidate => ({ jobId, seq, priority: 2, enqueuedAt: NOW, held: false })
    const d = decideNetwork({ holders: [{ jobId: 'h' }], candidates: [c('a', 1), c('b', 2), c('c', 3)], max: 2, now: NOW })
    expect(d.grant).toEqual(['a'])
    expect(d.blocked).toEqual({ b: 'slot', c: 'slot' })
  })

  it('grants nothing while conversion is backed up, free slots or not', () => {
    const c = (jobId: string, seq: number): LaneCandidate => ({ jobId, seq, priority: 2, enqueuedAt: NOW, held: false })
    const d = decideNetwork({ holders: [], candidates: [c('a', 1), c('b', 2)], max: 2, now: NOW, backlogged: true })
    expect(d).toEqual({ grant: [], blocked: { a: 'slot', b: 'slot' } })
    // Held candidates get no reason either way (their status says it).
    const held = decideNetwork({
      holders: [], candidates: [{ ...c('h', 1), held: true }], max: 2, now: NOW, backlogged: true,
    })
    expect(held).toEqual({ grant: [], blocked: {} })
  })
})

describe('decideSlots (decode lane)', () => {
  const c = (jobId: string, seq: number, over: Partial<LaneCandidate> = {}): LaneCandidate =>
    ({ jobId, seq, priority: 2, enqueuedAt: NOW, held: false, ...over })

  it('fills the free slots in priority order; the rest wait for a slot', () => {
    const d = decideSlots({ holders: [], candidates: [c('a', 1), c('b', 2, { priority: 1 }), c('c', 3)], max: 2, now: NOW })
    expect(d).toEqual({ grant: ['b', 'a'], blocked: { c: 'slot' } })
  })

  it('counts holders against the slots, and always has at least one', () => {
    expect(decideSlots({ holders: [{ jobId: 'h' }], candidates: [c('a', 1), c('b', 2)], max: 2, now: NOW }))
      .toEqual({ grant: ['a'], blocked: { b: 'slot' } })
    expect(decideSlots({ holders: [], candidates: [c('a', 1), c('b', 2)], max: 0, now: NOW }))
      .toEqual({ grant: ['a'], blocked: { b: 'slot' } })
    expect(decideSlots({ holders: [{ jobId: 'h1' }, { jobId: 'h2' }], candidates: [c('a', 1)], max: 2, now: NOW }))
      .toEqual({ grant: [], blocked: { a: 'slot' } })
  })

  it('ages: a low-priority decode that waited long enough goes before newer normal work', () => {
    const oldLow = (waitedMs: number) => c('old-low', 1, { priority: 3, enqueuedAt: NOW - waitedMs })
    const newNormal = c('new-normal', 2)
    // Fresh: priority decides.
    expect(decideSlots({ holders: [], candidates: [newNormal, oldLow(0)], max: 1, now: NOW }))
      .toEqual({ grant: ['new-normal'], blocked: { 'old-low': 'slot' } })
    // 46 s later it has climbed to normal, and it was there first.
    expect(decideSlots({ holders: [], candidates: [newNormal, oldLow(46_000)], max: 1, now: NOW }))
      .toEqual({ grant: ['old-low'], blocked: { 'new-normal': 'slot' } })
    // Without a clock (no `now`), no aging.
    expect(decideSlots({ holders: [], candidates: [newNormal, oldLow(46_000)], max: 1 }).grant).toEqual(['new-normal'])
  })

  it('never grants a held candidate and gives it no reason', () => {
    const d = decideSlots({ holders: [], candidates: [c('held', 1, { held: true }), c('b', 2)], max: 2, now: NOW })
    expect(d).toEqual({ grant: ['b'], blocked: {} })
  })

  it('has no anchor rule and no memory admission: nothing but slots', () => {
    // Whatever a candidate would weigh on the convert lane, here it is a slot.
    const d = decideSlots({ holders: [], candidates: [c('a', 1), c('b', 2), c('c', 3)], max: 3, now: NOW })
    expect(d.grant).toEqual(['a', 'b', 'c'])
  })
})

describe('pickAnchor', () => {
  it('is the first-submitted live IFC job', () => {
    expect(pickAnchor([
      { id: 'pc', seq: 1, kind: 'pointcloud', status: 'running' },
      { id: 'done', seq: 2, kind: 'ifc', status: 'loaded' },
      { id: 'failed', seq: 3, kind: 'ifc', status: 'failed' },
      { id: 'b', seq: 6, kind: 'ifc', status: 'running' },
      { id: 'a', seq: 5, kind: 'ifc', status: 'queued' },
    ])).toBe('a')
  })

  it('passes over held jobs and returns null when none is live', () => {
    expect(pickAnchor([
      { id: 'held', seq: 1, kind: 'ifc', status: 'held' },
      { id: 'next', seq: 2, kind: 'ifc', status: 'waiting' },
    ])).toBe('next')
    expect(pickAnchor([{ id: 'x', seq: 1, kind: 'ifc', status: 'cancelled' }])).toBeNull()
    expect(pickAnchor([])).toBeNull()
  })
})

describe('decideAttach', () => {
  const c = (jobId: string, seq: number, over: Partial<LaneCandidate> = {}): LaneCandidate =>
    ({ jobId, seq, priority: 2, enqueuedAt: NOW, held: false, ...over })

  it('one at a time: a holder blocks everyone with attach-lane', () => {
    const d = decideAttach({ holder: 'h', candidates: [c('a', 1)], sceneHasModels: true, anchorJobId: null })
    expect(d).toEqual({ grant: null, blocked: { a: 'attach-lane' } })
  })

  it('empty scene: only the anchor may attach', () => {
    const waitAnchor = decideAttach({ holder: null, candidates: [c('b', 2)], sceneHasModels: false, anchorJobId: 'a' })
    expect(waitAnchor).toEqual({ grant: null, blocked: { b: 'anchor' } })
    const anchorHere = decideAttach({ holder: null, candidates: [c('b', 2), c('a', 1)], sceneHasModels: false, anchorJobId: 'a' })
    expect(anchorHere).toEqual({ grant: 'a', blocked: { b: 'anchor' } })
  })

  it('scene with models: best candidate first', () => {
    const d = decideAttach({
      holder: null, candidates: [c('b', 2), c('a', 1, { priority: 3 })], sceneHasModels: true, anchorJobId: 'a',
    })
    expect(d).toEqual({ grant: 'b', blocked: { a: 'attach-lane' } })
  })
})

describe('decideConvert — anchor reservation (empty scene)', () => {
  it('grants only the anchor while it is reserved, whatever the free slots', () => {
    const d = decideConvert({
      holders: [], candidates: [cand('B', 2), cand('C', 3), cand('A', 1)],
      maxConcurrent: 3, budgetBytes: 10_000 * MB, pressure: 'normal', now: NOW, reserveForAnchor: 'A',
    })
    expect(d.grant).toEqual(['A'])
    expect(d.blocked).toEqual({ B: 'anchor', C: 'anchor' })
  })

  it('grants nothing while the anchor has not reached the lane yet', () => {
    const d = decideConvert({
      holders: [], candidates: [cand('B', 2)],
      maxConcurrent: 3, budgetBytes: 10_000 * MB, pressure: 'normal', now: NOW, reserveForAnchor: 'A',
    })
    expect(d.grant).toEqual([])
    expect(d.blocked).toEqual({ B: 'anchor' })
  })

  it('the anchor still obeys exclusivity', () => {
    const d = decideConvert({
      holders: [{ jobId: 'X', peakBytes: 1, exclusive: true }], candidates: [cand('A', 1)],
      maxConcurrent: 3, budgetBytes: 10_000 * MB, pressure: 'normal', now: NOW, reserveForAnchor: 'A',
    })
    expect(d.grant).toEqual([])
  })
})
