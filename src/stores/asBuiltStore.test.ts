import { describe, it, expect, beforeEach } from 'vitest'
import { useAsBuiltStore, type PairDraft } from './asBuiltStore'
import type { Vec3 } from '../lib/asbuilt/rigid-fit'

const MODEL: Vec3[] = [[0, 0, 0], [10, 0, 0], [0, 8, 0], [0, 0, 3], [10, 8, 3]]
const NOISE: Vec3[] = [[0.01, 0, 0], [0, -0.012, 0], [0, 0, 0.015], [-0.01, 0.01, 0], [0, 0, -0.01]]
const pair = (i: number, noisy = false): PairDraft => {
  const m = MODEL[i]
  const n = noisy ? NOISE[i] : [0, 0, 0]
  return { model: m, cloud: [m[0] - 5 + n[0], m[1] + 2 + n[1], m[2] + 1 + n[2]] }
}

describe('asBuiltStore', () => {
  beforeEach(() => useAsBuiltStore.getState().reset())

  it('has the documented defaults', () => {
    const s = useAsBuiltStore.getState()
    expect(s).toMatchObject({ declaredMm: 25, precisionMm: 5, phase: 'idle', mode: '4dof', pairs: [], fit: null })
  })

  it('fewer than 3 complete pairs gives no fit and no error', () => {
    const s = useAsBuiltStore.getState()
    s.addPair(pair(0)); s.addPair(pair(1)); s.addPair({ model: MODEL[2] })
    const st = useAsBuiltStore.getState()
    expect(st.pairs).toHaveLength(3)
    expect(st.fit).toBeNull()
    expect(st.fitError).toBeNull()
    expect(st.gate).toBeNull()
  })

  it('adding a third pair fits; removing one drops the fit again', () => {
    const s = useAsBuiltStore.getState()
    s.addPair(pair(0)); s.addPair(pair(1)); s.addPair(pair(2))
    const fit = useAsBuiltStore.getState().fit
    expect(fit).not.toBeNull()
    expect(fit!.translation[0]).toBeCloseTo(5, 6)
    expect(fit!.fitRmseM).toBeLessThan(1e-9)
    useAsBuiltStore.getState().removePair(1)
    expect(useAsBuiltStore.getState().fit).toBeNull()
  })

  it('gate needs 4 pairs, then reflects declaredMm vs alignmentRmseM', () => {
    const s = useAsBuiltStore.getState()
    for (let i = 0; i < 3; i++) s.addPair(pair(i, true))
    expect(useAsBuiltStore.getState().gate).toEqual({ ok: false, reason: 'too-few-pairs-to-score' })
    for (let i = 3; i < 5; i++) useAsBuiltStore.getState().addPair(pair(i, true))
    const rmse = useAsBuiltStore.getState().fit!.alignmentRmseM
    expect(rmse).toBeGreaterThan(0.001)
    useAsBuiltStore.getState().setDeclaredMm(1)
    expect(useAsBuiltStore.getState().gate).toEqual({ ok: false, reason: 'alignment-too-coarse' })
    useAsBuiltStore.getState().setDeclaredMm(Math.ceil(rmse * 2000) + 1)
    expect(useAsBuiltStore.getState().gate).toEqual({ ok: true })
  })

  it('switching cloud clears the pairs', () => {
    const s = useAsBuiltStore.getState()
    s.setCloudId('a'); s.addPair(pair(0))
    useAsBuiltStore.getState().setCloudId('b')
    expect(useAsBuiltStore.getState().pairs).toEqual([])
  })
})
