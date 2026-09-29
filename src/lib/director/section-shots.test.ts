import { describe, expect, it } from 'vitest'
import { cutPointAt, explodeBands, explodeOffsets, planPresentation, type ModelFacts, type PlanStrings } from './plan'
import { builtInRecipe, type SectionKind } from './recipe'

const box = (y0: number, y1: number) => ({ min: { x: -10, y: y0, z: -5 }, max: { x: 10, y: y1, z: 5 } })
const model: ModelFacts = {
  modelId: 'm1', name: 'Tower', bounds: { center: { x: 0, y: 12, z: 0 }, size: { x: 20, y: 24, z: 10 } },
  elementCount: 1000, score: 91,
  storeys: [0, 1, 2, 3].map((i) => ({ key: `s${i}`, label: `L${i}`, count: 50, modelId: 'm1', ids: [1], box: box(i * 6, i * 6 + 6) })),
  systems: [], issues: [],
}
const strings: PlanStrings = { stats: () => '', score: () => '', system: (l) => l, issue: (l) => l, tourStop: (i) => `${i}`, together: 'all' }
const plan = (sections: SectionKind[], m = model) => {
  const r = { ...builtInRecipe('meeting-demo')!, sections, onBeat: false, maxStoreys: 8 }
  return planPresentation(r, { models: [m], tour: [], detail: null }, strings, null)[0]
}

describe('cutPointAt', () => {
  const pts = [{ x: 0, y: 30, z: 0 }, { x: 0, y: 20, z: 0 }, { x: 0, y: 10, z: 0 }]
  it('starts at the first point and ends at the last', () => {
    expect(cutPointAt(pts, 0, true).y).toBe(30)
    expect(cutPointAt(pts, 1, true).y).toBe(10)
  })
  it('holds each stop when stepped', () => {
    // Segment 1 runs p 0–0.5; after 40 % of it the cut has arrived and waits.
    expect(cutPointAt(pts, 0.25, true).y).toBe(20)
    expect(cutPointAt(pts, 0.45, true).y).toBe(20)
    expect(cutPointAt(pts, 0.25, false).y).toBe(25)
    expect(cutPointAt(pts, 0.1, false).y).toBeCloseTo(28)
  })
})

describe('section shots', () => {
  it('cuts from above the roof down through every storey, at plan height', () => {
    const clip = plan(['sectionCut'])
    const cut = clip.shots[0].scene.cut!
    expect(cut.normal).toEqual({ x: 0, y: -1, z: 0 })
    expect(cut.points[0].y).toBeGreaterThan(24)
    const ys = cut.points.slice(1).map((p) => p.y)
    expect(ys).toEqual([...ys].sort((a, b) => b - a))
    // 1.2 m above each floor.
    expect(ys[ys.length - 1]).toBeCloseTo(1.2)
    expect(clip.shots[0].say).toMatchObject({ kind: 'sectionCut', from: 'L3', to: 'L0' })
  })

  it('needs two storeys to cut', () => {
    const clip = planPresentation({ ...builtInRecipe('meeting-demo')!, sections: ['sectionCut', 'orbit'] },
      { models: [{ ...model, storeys: model.storeys.slice(0, 1) }], tour: [], detail: null }, strings, null)[0]
    expect(clip.shots.some((s) => s.section === 'sectionCut')).toBe(false)
  })

  it('sweeps along the long side, from outside the building into it', () => {
    const cut = plan(['sectionSweep']).shots[0].scene.cut!
    expect(cut.normal).toEqual({ x: -1, y: 0, z: 0 })
    expect(cut.points[0].x).toBeGreaterThan(10)
    expect(cut.points[cut.points.length - 1].x).toBeLessThan(0)
  })
})

describe('exploded view', () => {
  it('bands cover the whole model, contiguous, bottom to top', () => {
    const bands = explodeBands(model.storeys, 3)
    expect(bands).toHaveLength(3)
    expect(bands[0].min).toBe(-Infinity)
    expect(bands[2].max).toBe(Infinity)
    for (let i = 1; i < bands.length; i++) expect(bands[i].min).toBe(bands[i - 1].max)
  })

  it('never makes more bands than storeys', () => {
    expect(explodeBands(model.storeys, 10)).toHaveLength(4)
  })

  it('pulls apart, holds, and fits back together', () => {
    expect(explodeOffsets(3, 5, 0).every((o) => o === 0)).toBe(true)
    expect(explodeOffsets(3, 5, 0.55)).toEqual([0, 5, 10])
    expect(explodeOffsets(3, 5, 1).every((o) => o === 0)).toBe(true)
  })

  it('frames the building at its tallest and says how many storeys', () => {
    const shot = plan(['exploded']).shots[0]
    expect(shot.scene.explode?.bands.length).toBe(4)
    expect(shot.say).toEqual({ kind: 'exploded', storeys: 4 })
  })
})
