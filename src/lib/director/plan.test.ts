import { describe, expect, it } from 'vitest'
import { planPresentation, pickSpread, combine, federationName, fitPoseToAspect, type ModelFacts, type PlanStrings, type SceneFacts, type Subject } from './plan'
import { BUILT_IN_RECIPES, builtInRecipe, sanitizeRecipe, type Recipe } from './recipe'
import { groupSystems, systemOf } from './systems'
import { pathAt, type CameraPose } from '../capture/shots'

const strings: PlanStrings = {
  stats: (e, s) => `${e} elements · ${s} storeys`,
  score: (n) => `${n}/100`,
  system: (l, n) => `${l} · ${n}`,
  issue: (l, n) => `${l} (${n})`,
  tourStop: (i) => `Stop ${i}`,
  together: 'All together',
}

function box(y0: number, y1: number) {
  return { min: { x: -10, y: y0, z: -10 }, max: { x: 10, y: y1, z: 10 } }
}

function subject(key: string, y0: number, y1: number, extra: Partial<Subject> = {}): Subject {
  return { key, label: key, count: 12, modelId: 'm1', ids: [1, 2, 3], box: box(y0, y1), ...extra }
}

function model(id = 'm1', over: Partial<ModelFacts> = {}): ModelFacts {
  return {
    modelId: id, name: `Model ${id}`,
    bounds: { center: { x: 0, y: 10, z: 0 }, size: { x: 20, y: 20, z: 20 } },
    elementCount: 1200, score: 88,
    storeys: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => subject(`L${i}`, i * 3, i * 3 + 3, { modelId: id })),
    systems: [subject('structure', 0, 20, { modelId: id }), subject('mep', 0, 20, { modelId: id })],
    issues: [subject('issue', 0, 1, { severity: 'error', modelId: id })],
    ...over,
  }
}

const facts = (models: ModelFacts[], extra: Partial<SceneFacts> = {}): SceneFacts => ({ models, tour: [], detail: null, ...extra })
const recipe = (id: string, over: Partial<Recipe> = {}): Recipe => ({ ...builtInRecipe(id)!, ...over })

describe('planPresentation', () => {
  it('lands near the target length and every shot is within the pace', () => {
    const r = recipe('meeting-demo', { onBeat: false })
    const [clip] = planPresentation(r, facts([model()]), strings, null)
    expect(Math.abs(clip.durationSec - r.targetSec)).toBeLessThan(r.targetSec * 0.25)
    for (const s of clip.shots) expect(s.shot.durationSec).toBeGreaterThanOrEqual(3.5 - 1e-6)
  })

  it('cuts land on the beat when the recipe is on beat', () => {
    const r = recipe('reel')
    const beat = 0.5
    const [clip] = planPresentation(r, facts([model()]), strings, { beatSec: beat })
    let at = 0
    for (let i = 0; i < clip.shots.length - 1; i++) {
      at += clip.shots[i].shot.durationSec - clip.transitionSec
      expect(Math.abs(at / beat - Math.round(at / beat))).toBeLessThan(1e-3)
    }
  })

  it('on the beat, stays within a beat of the target', () => {
    for (const r of BUILT_IN_RECIPES) {
      if (r.music === 'none') continue
      const [clip] = planPresentation({ ...r, onBeat: true }, facts([model()]), strings, { beatSec: 0.625 })
      expect(clip.durationSec).toBeLessThanOrEqual(r.targetSec + 0.625)
    }
  })

  it('drops storeys first when there is not enough time, keeping hero and closing', () => {
    const r = recipe('meeting-demo', { targetSec: 20, maxStoreys: 8 })
    const [clip] = planPresentation(r, facts([model()]), strings, null)
    expect(clip.shots[0].section).toBe('hero')
    expect(clip.shots[clip.shots.length - 1].section).toBe('closing')
    expect(clip.shots.filter((s) => s.section === 'storeys').length).toBeLessThan(8)
  })

  it('isolates storeys and systems, and only highlights issues', () => {
    const r = recipe('coordination-review')
    const [clip] = planPresentation(r, facts([model()]), strings, null)
    const issue = clip.shots.find((s) => s.section === 'issues')!
    expect(issue.scene.isolate).toBeUndefined()
    expect(issue.scene.highlight?.[0].severity).toBe('error')
    expect(clip.shots.find((s) => s.section === 'systems')!.scene.isolate?.length).toBe(1)
  })

  it('skips sections the model has nothing for — never fakes them', () => {
    const r = recipe('client-walkthrough')
    const [clip] = planPresentation(r, facts([model('m1', { storeys: [] })]), strings, null)
    expect(clip.shots.some((s) => s.section === 'tour' || s.section === 'storeys')).toBe(false)
  })

  it('flies through the recorded tour stops', () => {
    const pose = (x: number): CameraPose => ({ position: { x, y: 5, z: 20 }, target: { x: 0, y: 5, z: 0 }, fovDeg: 45 })
    const r = recipe('client-walkthrough')
    const [clip] = planPresentation(r, facts([model()], { tour: [{ pose: pose(0), caption: 'Lobby' }, { pose: pose(15) }] }), strings, null)
    const tour = clip.shots.filter((s) => s.section === 'tour')
    expect(tour).toHaveLength(2)
    expect(tour[0].shot.type).toBe('path')
    expect(tour[1].shot.keyframes?.[0]).toEqual(pose(0))
  })

  it('pulls tour stops back for a narrower output, never closer', () => {
    const pose: CameraPose = { position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 45 }
    expect(fitPoseToAspect(pose, 16 / 9, 16 / 9)).toEqual(pose)
    expect(fitPoseToAspect(pose, 16 / 9, 2)).toEqual(pose)
    const reel = fitPoseToAspect(pose, 16 / 9, 9 / 16)
    expect(reel.position.z).toBeGreaterThan(10)
    expect(reel.position.z).toBeLessThanOrEqual(22 + 1e-9)
    expect(reel.target).toEqual(pose.target)
  })

  it('applies the caption look', () => {
    const bold = planPresentation(recipe('meeting-demo', { captions: { ...recipe('meeting-demo').captions, look: 'bold' } }), facts([model()]), strings, null)[0]
    expect(bold.texts.every((t) => t.anim === 'pop')).toBe(true)
    expect(bold.texts.some((t) => t.style === 'badge')).toBe(true)
    const minimal = planPresentation(recipe('meeting-demo', { captions: { ...recipe('meeting-demo').captions, look: 'minimal' } }), facts([model()]), strings, null)[0]
    expect(minimal.texts.some((t) => t.text.includes('elements'))).toBe(false)
  })

  it('never prints a score below 70', () => {
    const [low] = planPresentation(recipe('meeting-demo'), facts([model('m1', { score: 55 })]), strings, null)
    expect(low.texts.some((t) => t.text.includes('/100'))).toBe(false)
    const [high] = planPresentation(recipe('meeting-demo'), facts([model('m1', { score: 91 })]), strings, null)
    expect(high.texts.some((t) => t.text.includes('91/100'))).toBe(true)
  })

  it('keeps text out of the bottom of vertical formats', () => {
    const [clip] = planPresentation(recipe('tiktok'), facts([model()]), strings, null)
    expect(clip.texts.every((t) => !t.anchor.startsWith('bottom'))).toBe(true)
  })

  it('never stacks two texts on the same anchor at the same time', () => {
    for (const r of BUILT_IN_RECIPES) {
      const [clip] = planPresentation(r, facts([model()]), strings, { beatSec: 0.5 })
      for (const a of clip.texts) for (const b of clip.texts) {
        if (a === b || a.anchor !== b.anchor) continue
        expect(a.endSec <= b.startSec || b.endSec <= a.startSec).toBe(true)
      }
    }
  })

  it('makes one clip per model in separate mode, one in combined', () => {
    const models = [model('a'), model('b'), model('c')]
    expect(planPresentation(recipe('reel', { multiModel: 'separate' }), facts(models), strings, null)).toHaveLength(3)
    const [combined] = planPresentation(recipe('reel', { multiModel: 'combined' }), facts(models), strings, null)
    expect(combined.title).toBe('Model')
  })

  it('sequence mode shows each model alone, then all together', () => {
    const models = [model('a'), model('b')]
    const [clip] = planPresentation(recipe('meeting-demo', { multiModel: 'sequence', sections: ['hero', 'closing'] }), facts(models), strings, null)
    expect(clip.shots.map((s) => s.scene.visibleModels?.join(',') ?? 'all')).toEqual(['a', 'b', 'all', 'all'])
    expect(clip.shots[2].caption).toBe('All together')
  })

  it('uses the title template', () => {
    const [clip] = planPresentation(recipe('reel', { captions: { ...recipe('reel').captions, title: 'Proyecto {name}' } }), facts([model()]), strings, null)
    expect(clip.title).toBe('Proyecto Model m1')
  })

  it('returns nothing without a usable model', () => {
    expect(planPresentation(recipe('reel'), facts([]), strings, null)).toEqual([])
  })

  it('every built-in recipe plans a clip', () => {
    for (const r of BUILT_IN_RECIPES) {
      const clips = planPresentation(r, facts([model()]), strings, { beatSec: 0.5 })
      expect(clips[0].shots.length).toBeGreaterThan(1)
    }
  })
})

describe('helpers', () => {
  it('pickSpread keeps the first and last storey', () => {
    expect(pickSpread([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([1, 5, 9])
  })

  it('names a federation by its shared prefix', () => {
    expect(federationName(['Hospital ARQ', 'Hospital EST', 'Hospital MEP'])).toBe('Hospital')
    expect(federationName(['BCN IVO M3 A 0001', 'BCN IVO M3 S 0001'])).toBe('BCN IVO M3')
    expect(federationName(['Tower', 'Podium'])).toBe('Tower + Podium')
  })

  it('combine unions the boxes', () => {
    const a = model('a', { bounds: { center: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 } } })
    const b = model('b', { bounds: { center: { x: 10, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 } } })
    const c = combine([a, b])
    expect(c.bounds.center.x).toBe(5)
    expect(c.bounds.size.x).toBe(12)
  })

  it('sanitizeRecipe clamps and filters hostile input', () => {
    const r = sanitizeRecipe({ targetSec: 9999, sections: ['hero', 'nope'], music: 'metal', format: 'reel', captions: { title: 5 } })
    expect(r.targetSec).toBe(180)
    expect(r.sections).toEqual(['hero'])
    expect(r.music).toBe('corporate')
    expect(r.format).toBe('reel')
    expect(r.captions.title).toBe('')
    expect(sanitizeRecipe(null).sections.length).toBeGreaterThan(0)
  })

  it('groups classes into systems', () => {
    expect(systemOf('IfcBeam')).toBe('structure')
    expect(systemOf('IFCPIPESEGMENT')).toBe('mep')
    const g = groupSystems([
      { id: 'IFCWALL', elementIds: [1, 2, 3, 4, 5, 6] },
      { id: 'IFCCOLUMN', elementIds: [7, 8, 9, 10, 11] },
      { id: 'IFCFURNITURE', elementIds: [12] },
    ])
    expect(g.map((x) => x.key)).toEqual(['structure', 'envelope'])
  })

  it('pathAt passes through every keyframe', () => {
    const k = (x: number): CameraPose => ({ position: { x, y: 0, z: 0 }, target: { x, y: 0, z: -5 }, fovDeg: 45 })
    const keys = [k(0), k(10), k(20)]
    expect(pathAt(keys, 0).position.x).toBeCloseTo(0)
    expect(pathAt(keys, 0.5).position.x).toBeCloseTo(10)
    expect(pathAt(keys, 1).position.x).toBeCloseTo(20)
  })
})
