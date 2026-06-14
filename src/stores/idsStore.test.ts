// ─── idsStore tests ───────────────────────────────────────────────────────────
// Per-model results + run lifecycle (P1-3), following the transition table in
// docs/IDS_IMPLEMENTATION_PLAN.md §5.2 and the race rules in §5.3.

import { describe, it, expect, beforeEach } from 'vitest'
import { useIdsStore, selectIdsResultForModel } from './idsStore'
import type { IdsDocument, IdsResult } from '../lib/ids/ids-types'

const DOC: IdsDocument = { title: 'T', specifications: [{ name: 's', applicability: [], requirements: [] }] }

function result(score: number): IdsResult {
  return {
    totalSpecs: 1, passedSpecs: 1, failedSpecs: 0, naSpecs: 0, score,
    specs: [{ name: 's', status: 'pass', applicableCount: 1, passedCount: 1, failedCount: 0, failures: [], unsupported: [] }],
  }
}

const meta = (idsFileName = 'a.ids') => ({ at: Date.now(), idsFileName, durationMs: 10 })

beforeEach(() => {
  useIdsStore.getState().reset()
})

describe('idsStore per-model results', () => {
  it('keys results by the model captured at startRun', () => {
    const s = useIdsStore.getState()
    s.setLoaded('a.ids', DOC)
    s.startRun('m1')
    s.setResultForModel('m1', result(80), meta())
    useIdsStore.getState().startRun('m2')
    useIdsStore.getState().setResultForModel('m2', result(60), meta())

    const st = useIdsStore.getState()
    expect(st.resultsByModel['m1']?.score).toBe(80)
    expect(st.resultsByModel['m2']?.score).toBe(60)
    expect(st.status).toBe('done')
    expect(st.runningModelId).toBeNull()
  })

  it('snapshots the prior result into previousResultByModel on re-run', () => {
    const s = useIdsStore.getState()
    s.setLoaded('a.ids', DOC)
    s.startRun('m1')
    s.setResultForModel('m1', result(50), meta())
    useIdsStore.getState().startRun('m1')
    useIdsStore.getState().setResultForModel('m1', result(90), meta())

    const st = useIdsStore.getState()
    expect(st.resultsByModel['m1']?.score).toBe(90)
    expect(st.previousResultByModel['m1']?.score).toBe(50)
  })

  it('ignores results for a model that is not the one in flight (§5.3)', () => {
    const s = useIdsStore.getState()
    s.startRun('m1')
    s.setResultForModel('m2', result(10), meta()) // stale/foreign → dropped
    expect(useIdsStore.getState().resultsByModel['m2']).toBeUndefined()
    expect(useIdsStore.getState().status).toBe('running')
  })

  it('ignores results when no run is in flight (late worker after cancel)', () => {
    const s = useIdsStore.getState()
    s.startRun('m1')
    s.requestCancel()
    s.finishCancel()
    s.setResultForModel('m1', result(10), meta())
    expect(useIdsStore.getState().resultsByModel['m1']).toBeUndefined()
    expect(useIdsStore.getState().status).toBe('idle')
  })

  it('clearForModel drops results/meta and resets an in-flight run for that model', () => {
    const s = useIdsStore.getState()
    s.startRun('m1')
    s.setResultForModel('m1', result(70), meta())
    useIdsStore.getState().startRun('m1')
    useIdsStore.getState().clearForModel('m1')

    const st = useIdsStore.getState()
    expect(st.resultsByModel['m1']).toBeUndefined()
    expect(st.previousResultByModel['m1']).toBeUndefined()
    expect(st.runMetaByModel['m1']).toBeUndefined()
    expect(st.status).toBe('idle')
    expect(st.runningModelId).toBeNull()
  })

  it('clearForModel leaves other models and an unrelated in-flight run untouched', () => {
    const s = useIdsStore.getState()
    s.startRun('m1')
    s.setResultForModel('m1', result(70), meta())
    useIdsStore.getState().startRun('m2')
    useIdsStore.getState().clearForModel('m1')

    const st = useIdsStore.getState()
    expect(st.resultsByModel['m1']).toBeUndefined()
    expect(st.status).toBe('running')
    expect(st.runningModelId).toBe('m2')
  })
})

describe('idsStore run lifecycle', () => {
  it('startRun is a no-op while running or cancelling (double-click guard)', () => {
    const s = useIdsStore.getState()
    s.startRun('m1')
    s.startRun('m2')
    expect(useIdsStore.getState().runningModelId).toBe('m1')
    useIdsStore.getState().requestCancel()
    useIdsStore.getState().startRun('m2')
    expect(useIdsStore.getState().runningModelId).toBe('m1')
    expect(useIdsStore.getState().status).toBe('cancelling')
  })

  it('progress updates only while running/cancelling', () => {
    const s = useIdsStore.getState()
    s.setProgress(50, 'gather')
    expect(useIdsStore.getState().progress).toBe(0)
    s.startRun('m1')
    useIdsStore.getState().setProgress(42, 'gather')
    expect(useIdsStore.getState().progress).toBe(42)
    expect(useIdsStore.getState().progressPhase).toBe('gather')
  })

  it('requestCancel only transitions out of running; finishCancel keeps doc + results', () => {
    const s = useIdsStore.getState()
    s.requestCancel()
    expect(useIdsStore.getState().status).toBe('idle')
    s.setLoaded('a.ids', DOC)
    s.startRun('m1')
    s.setResultForModel('m1', result(70), meta())
    useIdsStore.getState().startRun('m1')
    useIdsStore.getState().requestCancel()
    expect(useIdsStore.getState().status).toBe('cancelling')
    useIdsStore.getState().finishCancel()

    const st = useIdsStore.getState()
    expect(st.status).toBe('idle')
    expect(st.doc).not.toBeNull()
    expect(st.resultsByModel['m1']?.score).toBe(70) // previous result untouched
  })

  it('setError ends the run with a typed error', () => {
    const s = useIdsStore.getState()
    s.startRun('m1')
    s.setError('model-open', 'corrupt')
    const st = useIdsStore.getState()
    expect(st.status).toBe('error')
    expect(st.error).toEqual({ code: 'model-open', message: 'corrupt' })
    expect(st.runningModelId).toBeNull()
  })

  it('setLoaded keeps per-model results and an in-flight run status (§5.2)', () => {
    const s = useIdsStore.getState()
    s.setLoaded('a.ids', DOC)
    s.startRun('m1')
    s.setResultForModel('m1', result(70), meta('a.ids'))
    useIdsStore.getState().setLoaded('b.ids', DOC)
    expect(useIdsStore.getState().resultsByModel['m1']?.score).toBe(70)
    expect(useIdsStore.getState().status).toBe('idle')

    useIdsStore.getState().startRun('m1')
    useIdsStore.getState().setLoaded('c.ids', DOC)
    expect(useIdsStore.getState().status).toBe('running') // in-flight run preserved
    expect(useIdsStore.getState().fileName).toBe('c.ids')
  })

  it('reset clears everything (navigate-to-landing)', () => {
    const s = useIdsStore.getState()
    s.setLoaded('a.ids', DOC)
    s.startRun('m1')
    s.setResultForModel('m1', result(70), meta())
    useIdsStore.getState().setMultiRun({ done: 1, total: 3 })
    useIdsStore.getState().reset()
    const st = useIdsStore.getState()
    expect(st.doc).toBeNull()
    expect(st.fileName).toBeNull()
    expect(st.resultsByModel).toEqual({})
    expect(st.status).toBe('idle')
    expect(st.multiRun).toBeNull()
  })

  it('multiRun tracks federated progress and clears (P7-2)', () => {
    const s = useIdsStore.getState()
    expect(s.multiRun).toBeNull()
    s.setMultiRun({ done: 0, total: 3 })
    expect(useIdsStore.getState().multiRun).toEqual({ done: 0, total: 3 })
    // a per-model run still lands in resultsByModel during the batch
    useIdsStore.getState().startRun('m2')
    useIdsStore.getState().setResultForModel('m2', result(80), meta())
    useIdsStore.getState().setMultiRun({ done: 1, total: 3 })
    expect(useIdsStore.getState().multiRun?.done).toBe(1)
    expect(useIdsStore.getState().resultsByModel['m2']?.score).toBe(80)
    useIdsStore.getState().setMultiRun(null)
    expect(useIdsStore.getState().multiRun).toBeNull()
  })
})

describe('idsStore selectors', () => {
  it('selectIdsResultForModel returns stable refs (no fresh objects per call)', () => {
    const s = useIdsStore.getState()
    s.startRun('m1')
    s.setResultForModel('m1', result(70), meta())
    const st = useIdsStore.getState()
    const a = selectIdsResultForModel('m1')(st)
    const b = selectIdsResultForModel('m1')(st)
    expect(a).toBe(b) // same reference — safe for useStore subscriptions
    expect(selectIdsResultForModel('missing')(st)).toBeNull()
    expect(selectIdsResultForModel(null)(st)).toBeNull()
  })
})
