// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  IFC_PLAN_HIT, IFC_PLAN_MISS, aggregateProgress, computeEta, createPhaseStates, ifcPlan, legacyPhase,
} from './phases'
import type { PhaseState } from './types'

const MB = 1024 * 1024

function states(entries: Array<Partial<PhaseState> & Pick<PhaseState, 'id' | 'weight'>>): PhaseState[] {
  return entries.map((e) => ({ status: 'pending', fraction: null, ...e }))
}

describe('plans', () => {
  it('miss plan has the documented weights and two background phases', () => {
    const fg = IFC_PLAN_MISS.filter((e) => !e.background)
    expect(fg.map((e) => e.id)).toEqual([
      'identify', 'cache-lookup', 'geometry', 'properties', 'relations', 'serialize',
      'cache-write', 'attach', 'setup', 'read',
    ])
    expect(fg.reduce((s, e) => s + e.weight, 0)).toBe(98)
    expect(IFC_PLAN_MISS.filter((e) => e.background).map((e) => e.id)).toEqual(['stream', 'index'])
  })

  it('hit plan drops conversion and weights the attach', () => {
    const ids = IFC_PLAN_HIT.map((e) => e.id)
    expect(ids).not.toContain('geometry')
    expect(ids).not.toContain('cache-write')
    expect(IFC_PLAN_HIT.find((e) => e.id === 'attach')?.weight).toBe(60)
  })

  it('ifcPlan prepends download for URLs, cached or not', () => {
    expect(ifcPlan({ url: true, cached: false })[0]).toEqual({ id: 'download', weight: 18 })
    expect(ifcPlan({ url: true, cached: true })[0].id).toBe('download')
    expect(ifcPlan({ url: false, cached: false })[0].id).toBe('identify')
    expect(ifcPlan({ url: false, cached: true })).toEqual(IFC_PLAN_HIT.map((e) => ({ ...e })))
  })

  it('ifcPlan returns fresh copies (mutating one never touches the constants)', () => {
    const plan = ifcPlan({ url: false, cached: false })
    plan[0].weight = 999
    expect(IFC_PLAN_MISS[0].weight).toBe(1)
    expect(ifcPlan({ url: false, cached: false })[0].weight).toBe(1)
  })

  it('createPhaseStates starts everything pending with no fraction', () => {
    const s = createPhaseStates(IFC_PLAN_MISS)
    expect(s).toHaveLength(IFC_PLAN_MISS.length)
    expect(s.every((p) => p.status === 'pending' && p.fraction === null)).toBe(true)
    expect(s.find((p) => p.id === 'stream')?.background).toBe(true)
    expect(s.find((p) => p.id === 'geometry')?.background).toBeUndefined()
  })
})

describe('aggregateProgress', () => {
  it('is 0 for an empty plan and for nothing started', () => {
    expect(aggregateProgress([])).toEqual({ fraction: 0, determinate: false })
    expect(aggregateProgress(createPhaseStates(IFC_PLAN_MISS)).fraction).toBe(0)
  })

  it('counts done phases fully and the active one by its real fraction', () => {
    const p = states([
      { id: 'identify', weight: 10, status: 'done' },
      { id: 'geometry', weight: 50, status: 'active', fraction: 0.5 },
      { id: 'attach', weight: 40 },
    ])
    expect(aggregateProgress(p)).toEqual({ fraction: 0.35, determinate: true })
  })

  it('an indeterminate active phase contributes 0 and is not determinate', () => {
    const p = states([
      { id: 'identify', weight: 10, status: 'done' },
      { id: 'serialize', weight: 90, status: 'active' },
    ])
    expect(aggregateProgress(p)).toEqual({ fraction: 0.1, determinate: false })
  })

  it('excludes background phases and removes skipped ones from the denominator', () => {
    const p = states([
      { id: 'identify', weight: 10, status: 'done' },
      { id: 'geometry', weight: 40, status: 'skipped' },
      { id: 'attach', weight: 50, status: 'active', fraction: 0 },
      { id: 'stream', weight: 1000, background: true, status: 'active', fraction: 0.5 },
    ])
    expect(aggregateProgress(p).fraction).toBeCloseTo(10 / 60, 10)
  })

  it('is exactly 1 when every foreground phase is done or skipped', () => {
    const p = states([
      { id: 'identify', weight: 0.1, status: 'done' },
      { id: 'geometry', weight: 0.2, status: 'done' },
      { id: 'attach', weight: 0.7, status: 'skipped' },
      { id: 'stream', weight: 1, background: true },
    ])
    expect(aggregateProgress(p).fraction).toBe(1)
    const allSkipped = states([{ id: 'identify', weight: 1, status: 'skipped' }])
    expect(aggregateProgress(allSkipped).fraction).toBe(1)
  })

  it('clamps out-of-range fractions', () => {
    const p = states([{ id: 'geometry', weight: 1, status: 'active', fraction: 7 }, { id: 'attach', weight: 1 }])
    expect(aggregateProgress(p).fraction).toBe(0.5)
  })
})

describe('computeEta', () => {
  const base = (over: Partial<Parameters<typeof computeEta>[0]>) => computeEta({
    phases: [], sizeBytes: 100 * MB, msPerMB: {}, now: 10_000, activePhaseStartedAt: 0, activeFraction: null, ...over,
  })

  it('no active phase or no fraction → no ETA', () => {
    expect(base({ phases: states([{ id: 'geometry', weight: 1 }]) })).toEqual({ etaMs: null, reliable: false })
    expect(base({ phases: states([{ id: 'geometry', weight: 1, status: 'active' }]), activeFraction: null }))
      .toEqual({ etaMs: null, reliable: false })
  })

  it('download: no whole-job ETA while a later phase is uncalibrated', () => {
    // The first URL load of a session: half downloaded in 10 s is a real rate,
    // but "10 s left" beside the whole-job bar, followed by an unmeasured
    // geometry parse of minutes, is not the job's time left.
    const phases = states([
      { id: 'download', weight: 18, status: 'active', fraction: 0.5 },
      { id: 'geometry', weight: 46 },
      { id: 'attach', weight: 12 },
    ])
    expect(base({ phases, activeFraction: 0.5 })).toEqual({ etaMs: null, reliable: false })
    expect(base({ phases, activeFraction: 0.5, msPerMB: { geometry: 100 } })).toEqual({ etaMs: null, reliable: false })
    expect(base({ phases, activeFraction: 0.5, msPerMB: { geometry: 100, attach: 10 } }))
      .toEqual({ etaMs: 10_000 + 110 * 100, reliable: true })
  })

  it('download: needs past 5 % and 1 s even when calibrated', () => {
    const phases = states([
      { id: 'download', weight: 18, status: 'active', fraction: 0.5 },
      { id: 'geometry', weight: 46 },
    ])
    const msPerMB = { geometry: 100 }
    expect(base({ phases, activeFraction: 0.04, msPerMB })).toEqual({ etaMs: null, reliable: false })
    expect(base({ phases, activeFraction: 0.5, msPerMB, now: 900 })).toEqual({ etaMs: null, reliable: false })
  })

  it('download: the only phase left needs no calibration', () => {
    const phases = states([
      { id: 'download', weight: 18, status: 'active', fraction: 0.5 },
      { id: 'geometry', weight: 46, status: 'skipped' },
      { id: 'stream', weight: 1, background: true },
    ])
    expect(base({ phases, activeFraction: 0.5 })).toEqual({ etaMs: 10_000, reliable: true })
  })

  it('download: adds calibrated remaining phases', () => {
    const phases = states([
      { id: 'download', weight: 18, status: 'active', fraction: 0.5 },
      { id: 'geometry', weight: 46 },
      { id: 'stream', weight: 1, background: true },
    ])
    const eta = base({ phases, activeFraction: 0.5, msPerMB: { geometry: 100 } })
    expect(eta).toEqual({ etaMs: 10_000 + 100 * 100, reliable: true })
  })

  it('other phases need ≥ 15 %, ≥ 3 s and every remaining phase calibrated', () => {
    const phases = states([
      { id: 'identify', weight: 1, status: 'done' },
      { id: 'geometry', weight: 46, status: 'active', fraction: 0.25 },
      { id: 'properties', weight: 14 },
      { id: 'attach', weight: 12 },
    ])
    const msPerMB = { properties: 10, attach: 5 }
    // 25 % in 10 s → 30 s left in geometry, + (10 + 5) ms/MB × 100 MB.
    expect(base({ phases, activeFraction: 0.25, msPerMB })).toEqual({ etaMs: 30_000 + 1500, reliable: true })
    expect(base({ phases, activeFraction: 0.1, msPerMB }).etaMs).toBeNull()
    expect(base({ phases, activeFraction: 0.25, msPerMB, now: 2000 }).etaMs).toBeNull()
    expect(base({ phases, activeFraction: 0.25, msPerMB: { properties: 10 } }).etaMs).toBeNull()
  })

  it('skipped remaining phases need no calibration; never negative', () => {
    const phases = states([
      { id: 'geometry', weight: 46, status: 'active', fraction: 1 },
      { id: 'properties', weight: 14, status: 'skipped' },
    ])
    expect(base({ phases, activeFraction: 1 })).toEqual({ etaMs: 0, reliable: true })
    expect(base({ phases, activeFraction: 1, now: -5 }).etaMs).toBeNull()
  })
})

describe('legacyPhase', () => {
  it('maps to the four SDK values', () => {
    expect(legacyPhase('download', 'running')).toBe('reading')
    expect(legacyPhase('identify', 'running')).toBe('reading')
    expect(legacyPhase('cache-lookup', 'queued')).toBe('reading')
    expect(legacyPhase('read', 'running')).toBe('reading')
    expect(legacyPhase('geometry', 'running')).toBe('parsing')
    expect(legacyPhase('properties', 'waiting')).toBe('parsing')
    expect(legacyPhase('relations', 'running')).toBe('parsing')
    expect(legacyPhase('serialize', 'running')).toBe('parsing')
    expect(legacyPhase('cache-write', 'running')).toBe('uploading')
    expect(legacyPhase('attach', 'running')).toBe('uploading')
    expect(legacyPhase('setup', 'running')).toBe('uploading')
    expect(legacyPhase('stream', 'running')).toBe('uploading')
    expect(legacyPhase('index', 'running')).toBe('uploading')
    expect(legacyPhase(null, 'queued')).toBe('reading')
  })

  it('is done once loaded or terminal, whatever the phase', () => {
    expect(legacyPhase('stream', 'loaded')).toBe('done')
    expect(legacyPhase('geometry', 'failed')).toBe('done')
    expect(legacyPhase('attach', 'cancelled')).toBe('done')
    expect(legacyPhase(null, 'removed')).toBe('done')
  })
})
