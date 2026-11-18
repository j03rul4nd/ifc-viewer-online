// §5 synthetic validation: the phase-2 acceptance and kill-criterion tests.
import { describe, expect, it } from 'vitest'
import { asBuiltTransferables, runAsBuilt } from './pipeline'
import { boxGeometry, fakeCapture, syntheticScene, translated } from './synthetic-scene'

const TOL = 0.025
const scene = syntheticScene()
const base = { elements: scene, toleranceM: TOL, alignmentRmseM: 0.005 }
const flagged = (r: ReturnType<typeof runAsBuilt>) =>
  r.elements.filter((e) => e.state !== 'conforming').map((e) => [e.id, e.state])

describe('as-built pipeline on a synthetic scene', { timeout: 30_000 }, () => {
  it('perfect capture scores 100 with nothing flagged and full coverage', () => {
    const r = runAsBuilt({ ...base, cloud: fakeCapture(scene) })
    expect(flagged(r)).toEqual([])
    expect(r.unmodelled).toEqual([])
    expect(r.score).toBe(100)
    expect(r.coverage.observedFraction).toBe(1)
  })

  it('KILL CRITERION: a column moved 100 mm is flagged deviated, and only it', () => {
    const real = scene.map((g) => (g.id === 12 ? translated(g, 0.1, 0, 0) : g))
    const r = runAsBuilt({ ...base, cloud: fakeCapture(real) })
    expect(flagged(r)).toEqual([[12, 'deviated']])
    const col = r.elements.find((e) => e.id === 12)!
    expect(col.deviationP95!).toBeGreaterThan(2 * TOL)
    expect(r.score!).toBeLessThan(100)
    expect(r.contributions[0]).toMatchObject({ ruleId: 'AB_POSITION_DEVIATION', severity: 'error', count: 1 })
  })

  it('a column moved 40 mm (the §5 scene) is still caught', () => {
    const real = scene.map((g) => (g.id === 13 ? translated(g, 0, 0.04, 0) : g))
    const r = runAsBuilt({ ...base, cloud: fakeCapture(real) })
    expect(flagged(r)).toEqual([[13, 'deviated']])
  })

  it('an unbuilt column is missing when cameras exist; unobserved without them', () => {
    const cloud = fakeCapture(scene.filter((g) => g.id !== 14))
    const noCams = runAsBuilt({ ...base, cloud })
    expect(flagged(noCams)).toEqual([[14, 'unobserved']])
    expect(noCams.coverage.observed).toBe(7)

    // A camera looking down at column 14 sees the floor (depth 5) past its top (depth 2).
    const w = 64, frame = (tx: number) => ({
      width: w, height: w, depth: new Float32Array(w * w).fill(5), fx: 40, fy: 40, cx: 32, cy: 32,
      // camera at z=5 looking down -z: cam x = x - tx, cam y = -(y - 4.35), cam z = 5 - z
      w2c: [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, -tx, 4.35, 5, 1],
    })
    const withCams = runAsBuilt({ ...base, cloud, frames: [frame(4.35), frame(4.3)] })
    expect(withCams.elements.find((e) => e.id === 14)!.state).toBe('missing')
    expect(withCams.contributions.some((c) => c.ruleId === 'AB_ELEMENT_MISSING')).toBe(true)
  })

  it('reports an unmodelled object as a cluster', () => {
    const extra = boxGeometry(99, 'X', [3, 3, 0], [3.4, 3.4, 1])
    const r = runAsBuilt({ ...base, cloud: fakeCapture([...scene, extra]) })
    expect(flagged(r)).toEqual([])
    expect(r.unmodelled.length).toBe(1)
    expect(r.counts.unmodelled).toBe(1)
  })

  it('refuses to score when tolerance does not clear alignment', () => {
    const r = runAsBuilt({ ...base, alignmentRmseM: 0.02, cloud: fakeCapture(scene) })
    expect(r.score).toBeNull()
    expect(r.inconclusiveReason).toBe('tolerance-below-alignment')
  })

  it('lists every buffer as a transferable', () => {
    const cloud = fakeCapture(scene.slice(0, 2), 100)
    expect(asBuiltTransferables({ ...base, cloud })).toHaveLength(2 + scene.length * 2)
  })
})
