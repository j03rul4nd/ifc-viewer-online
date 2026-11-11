import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SECTIONS, sectionFromPath } from '../registry'
import { DEFAULTS, STEPS, clampStep, endDemo, estimate, isDemo, readDemo, saveStep, stepUrl } from './flow'
import { DEMO_LOCALES } from './locales'
import { UI_TEXTS, dxFor } from './DemoGuide'
import { isPricingPreview } from '../../../lib/pricing/pricing-preview'

const params = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join()
const keys = [...new Set([...STEPS.flatMap((s) => [s.title, s.guide, s.look]), ...UI_TEXTS])].sort()

function mem() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('demo flow', () => {
  it('tells the whole story in order, on screens that exist', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['drop', 'naming', 'rules', 'clashes', 'issues', 'resolve', 'mail', 'value'])
    for (const s of STEPS) {
      const id = sectionFromPath(`/workspace/${s.path}`)
      expect(SECTIONS.some((x) => x.id === id), s.path).toBe(true)
      expect(s.path.startsWith(id)).toBe(true)
    }
  })
  it('opens from the link, keeps the step in the tab, and ends', () => {
    const st = mem()
    expect(readDemo('?demo=reception-flow&step=3', st)).toBe(2)
    expect(readDemo('', st)).toBe(2)
    saveStep(5, st)
    expect(readDemo('?x=1', st)).toBe(5)
    expect(readDemo('?demo=off', st)).toBeNull()
    expect(readDemo('', st)).toBeNull()
    saveStep(1, st); endDemo(st)
    expect(readDemo('', st)).toBeNull()
  })
  it('clamps bad steps and builds shareable links', () => {
    expect(clampStep(-4)).toBe(0)
    expect(clampStep(99)).toBe(STEPS.length - 1)
    expect(clampStep(NaN)).toBe(0)
    expect(readDemo('?demo=reception-flow&step=abc', mem())).toBe(0)
    expect(stepUrl('https://x.eu/', 6)).toBe('https://x.eu/workspace/mail?demo=reception-flow&step=7')
    expect(isDemo('?demo=reception-flow')).toBe(true)
  })
  it('the demo link opens the preview gate', () => {
    expect(isPricingPreview('?demo=reception-flow')).toBe(true)
  })
  it('savings are an estimate from visible assumptions', () => {
    expect(estimate(DEFAULTS)).toEqual({ hours: 22, eur: 990 })
    expect(estimate({ ...DEFAULTS, deliveriesPerMonth: 0, clashMeetingsPerMonth: 0, clientUpdatesPerMonth: 0 })).toEqual({ hours: 0, eur: 0 })
  })
})

describe('demo strings', () => {
  for (const [lng, dict] of Object.entries(DEMO_LOCALES)) {
    it(`${lng} is complete`, () => {
      expect(Object.keys(dict).sort()).toEqual(keys)
      for (const k of keys) expect(params(dict[k]), `${lng}: ${k}`).toBe(params(k))
    })
  }
  it('falls back to English', () => expect(dxFor('xx')('Next')).toBe('Next'))
})

describe('guide', () => {
  it('renders nothing outside the demo', async () => {
    const { default: DemoGuide } = await import('./DemoGuide')
    expect(renderToStaticMarkup(createElement(DemoGuide))).toBe('')
  })
})
