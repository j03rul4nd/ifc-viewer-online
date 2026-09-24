import { describe, expect, it } from 'vitest'
import { contrastRatio, LOOK_IDS, LOOKS } from './looks'
import { letterboxBar, gradeFilter } from '../capture/grade'
import { planPresentation, type ModelFacts, type PlanStrings } from './plan'
import { builtInRecipe, BUILT_IN_RECIPES } from './recipe'

const strings: PlanStrings = {
  stats: (e, s) => `${e} elements · ${s} storeys`, score: (n) => `${n}/100`, system: (l) => l,
  issue: (l) => l, tourStop: (i) => `Stop ${i}`, together: 'All',
}
const box = (y0: number, y1: number) => ({ min: { x: -10, y: y0, z: -10 }, max: { x: 10, y: y1, z: 10 } })
const model: ModelFacts = {
  modelId: 'm', name: 'Tower', bounds: { center: { x: 0, y: 10, z: 0 }, size: { x: 20, y: 20, z: 20 } },
  elementCount: 900, score: 90,
  storeys: [0, 1, 2, 3].map((i) => ({ key: `s${i}`, label: `L${i}`, count: 10, modelId: 'm', ids: [i], box: box(i * 5, i * 5 + 5) })),
  systems: [{ key: 'structure', label: 'Structure', count: 40, modelId: 'm', ids: [1], box: box(0, 20) }],
  issues: [],
}

describe('looks', () => {
  it('every look reads: ink on its end card, and the title face is a real one', () => {
    for (const id of LOOK_IDS) {
      const l = LOOKS[id]
      expect(contrastRatio(l.type.ink, l.card.base), `${id} ink on card`).toBeGreaterThanOrEqual(4.5)
      expect(['sans', 'serif', 'mono']).toContain(l.type.titleFamily)
    }
  })

  it('the backdrop and the building are told apart', () => {
    for (const id of LOOK_IDS) {
      const l = LOOKS[id]
      if (!l.palette || !l.background) continue
      expect(contrastRatio(l.palette.envelope, l.background.bottom), id).toBeGreaterThan(1.08)
    }
  })

  it('every art-directed look lights its scene, the native one leaves it alone', () => {
    expect(LOOKS.native.light).toBeNull()
    for (const id of LOOK_IDS.filter((x) => x !== 'native')) {
      const l = LOOKS[id].light!
      expect(l, id).not.toBeNull()
      expect(l.elevation).toBeGreaterThan(0)
      expect(l.keyIntensity).toBeGreaterThan(l.fillIntensity)
    }
  })

  it('grade: filter string and cinema bars only on landscape', () => {
    const g = LOOKS['plum-noir'].grade!
    expect(gradeFilter(g)).toContain('contrast(1.14)')
    expect(letterboxBar(g, 1920, 1080)).toBeGreaterThan(100)
    expect(letterboxBar(g, 1080, 1920)).toBe(0)
    expect(gradeFilter(undefined)).toBe('none')
  })

  it('a look styles every caption and carries its grade', () => {
    const [clip] = planPresentation(builtInRecipe('editorial-clay')!, { models: [model], tour: [], detail: null }, strings, null)
    expect(clip.look.id).toBe('cloud-dancer')
    expect(clip.grade).toBeDefined()
    const title = clip.texts[0]
    expect(title.font).toBe('serif')
    expect(title.color).toBe(LOOKS['cloud-dancer'].type.ink)
    const [native] = planPresentation(builtInRecipe('meeting-demo')!, { models: [model], tour: [], detail: null }, strings, null)
    expect(native.texts.every((t) => t.font === undefined && t.color === undefined)).toBe(true)
    expect(native.grade).toBeUndefined()
  })

  it('every art-directed template plans', () => {
    for (const r of BUILT_IN_RECIPES.filter((x) => x.look && x.look !== 'native')) {
      const [clip] = planPresentation(r, { models: [model], tour: [], detail: null }, strings, { beatSec: 0.5 })
      expect(clip.shots.length, r.id).toBeGreaterThan(1)
    }
  })
})
