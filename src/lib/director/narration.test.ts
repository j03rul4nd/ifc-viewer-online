import { describe, expect, it } from 'vitest'
import { MIN_CUE_SEC, subtitleCues, wrapChunks } from './narration'
import { planPresentation, type ModelFacts, type PlanStrings } from './plan'
import type { NarrationFact } from './narration'
import { builtInRecipe } from './recipe'

describe('subtitleCues', () => {
  it('fills the window without gaps and keeps lines short', () => {
    const cues = subtitleCues('Level 3, storey 4 of 18: 412 elements across the whole floor plate.', 2, 6, 30)
    expect(cues[0].startSec).toBe(2)
    expect(cues[cues.length - 1].endSec).toBe(6)
    for (let i = 1; i < cues.length; i++) expect(cues[i].startSec).toBe(cues[i - 1].endSec)
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(30)
  })

  it('drops later sentences when there is not time to read them, never the first', () => {
    const cues = subtitleCues('First sentence here. A second, much longer sentence that cannot be read in time.', 0, 1.5, 44)
    expect(cues.map((c) => c.text).join(' ')).toBe('First sentence here.')
  })

  it('never makes cues shorter than the minimum', () => {
    const cues = subtitleCues('one two three four five six seven eight nine ten eleven twelve', 0, 2.2, 8)
    for (const c of cues) expect(c.endSec - c.startSec).toBeGreaterThanOrEqual(MIN_CUE_SEC - 1e-6)
  })

  it('wraps text without spaces (CJK) by characters', () => {
    expect(wrapChunks('一二三四五六七八九十一二三四五', 6).every((c) => c.length <= 6)).toBe(true)
  })

  it('does not break a number with a thousands dot', () => {
    expect(subtitleCues('Torre: 19.203 elementos en 18 plantas.', 0, 4, 44)[0].text).toBe('Torre: 19.203 elementos en 18 plantas.')
  })

  it('balances two lines instead of leaving a word alone', () => {
    const [a, b] = wrapChunks('Torre Poblenou: 19.241 elementos en 18 plantas.', 44)
    expect(Math.abs(a.length - b.length)).toBeLessThan(12)
  })

  it('says nothing in a window too short to read', () => {
    expect(subtitleCues('Hello.', 0, 0.5, 30)).toEqual([])
  })
})

const box = (y0: number, y1: number) => ({ min: { x: -10, y: y0, z: -10 }, max: { x: 10, y: y1, z: 10 } })
const model: ModelFacts = {
  modelId: 'm1', name: 'Tower', bounds: { center: { x: 0, y: 12, z: 0 }, size: { x: 20, y: 24, z: 16 } },
  elementCount: 1000, score: 91,
  storeys: [0, 1, 2, 3].map((i) => ({ key: `s${i}`, label: `L${i}`, count: 50, modelId: 'm1', ids: [1], box: box(i * 6, i * 6 + 6) })),
  systems: [{ key: 'structure', label: 'Structure', count: 250, modelId: 'm1', ids: [1], box: box(0, 24) }],
  issues: [],
}
const strings: PlanStrings = {
  stats: (e, s) => `${e} · ${s}`, score: (n) => `${n}`, system: (l) => l, issue: (l) => l, tourStop: (i) => `${i}`, together: 'all',
  narrate: (f) => { seen.push(f); return `say ${f.kind}.` },
}
const seen: NarrationFact[] = []

describe('narration in the plan', () => {
  it('states only facts from the model, and replaces the shot labels', () => {
    const base = builtInRecipe('meeting-demo')!
    const r = { ...base, onBeat: false, captions: { ...base.captions, narration: true, cta: '' } }
    const [clip] = planPresentation(r, { models: [model], tour: [], detail: null }, strings, null)
    expect(clip.texts.some((t) => t.text.startsWith('say '))).toBe(true)
    const said = seen
    const system = said.find((f) => f.kind === 'system')
    if (system) expect(system).toMatchObject({ elements: 250, percent: 25 })
    for (const f of said) if (f.kind === 'storey') expect(f.total).toBe(4)
    // No lower-third labels alongside the narration.
    expect(clip.texts.some((t) => t.style === 'lowerThird')).toBe(false)
  })

  it('is off unless the recipe asks for it', () => {
    const [clip] = planPresentation(builtInRecipe('meeting-demo')!, { models: [model], tour: [], detail: null }, strings, null)
    expect(clip.texts.some((t) => t.text.startsWith('say '))).toBe(false)
  })
})
