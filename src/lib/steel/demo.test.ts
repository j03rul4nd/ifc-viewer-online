// @vitest-environment jsdom
// The steel demo link: which params it reads, that it loads only the static
// hall, that `tour` is a one-shot, and the tour texts.
import { describe, it, expect, beforeEach } from 'vitest'
import { STEEL_DEMO_FILE, STEEL_DEMO_URL, readSteelDemoParams, stripSteelTourParam } from './demo'
import { parseAppUrlParams } from '../url-params'
import { STEEL_TOUR_STEPS, STEEL_TOUR_UI } from './tour'
import { STEEL_TEXTS } from './i18n'
import { useSteelStore } from '../../stores/steelStore'

describe('steel demo params', () => {
  it('reads steel=demo and tour=steel', () => {
    expect(readSteelDemoParams('?steel=demo&tour=steel&ref=noam')).toEqual({ demo: true, tour: true })
    expect(readSteelDemoParams('?steel=demo')).toEqual({ demo: true, tour: false })
    expect(readSteelDemoParams('?steel=demo&tour=revision')).toEqual({ demo: true, tour: false })
    expect(readSteelDemoParams('?tour=steel')).toEqual({ demo: false, tour: false })
    expect(readSteelDemoParams('?demo=steel')).toEqual({ demo: false, tour: false })
  })

  it('loads the static hall, and only it, as the deep-linked model', () => {
    const p = parseAppUrlParams('?steel=demo&tour=steel&ref=noam')
    expect(p.modelUrls).toEqual([STEEL_DEMO_URL])
    expect(p.fileNames).toEqual([STEEL_DEMO_FILE])
    expect(STEEL_DEMO_URL).toBe('/models/steel-demo/steel-hall.ifc')
    expect(p.ref).toBe('noam')
    expect(p.embed).toBe(false)
    expect(parseAppUrlParams('?steel=demo&model=https://evil.example/x.ifc').modelUrls).toEqual([STEEL_DEMO_URL])
    expect(parseAppUrlParams('?steel=other').modelUrls).toEqual([])
  })

  it('drops tour=steel from the URL and keeps the rest', () => {
    window.history.replaceState(null, '', '/?steel=demo&tour=steel&ref=noam')
    stripSteelTourParam()
    expect(window.location.search).toBe('?steel=demo&ref=noam')
    expect(readSteelDemoParams(window.location.search).tour).toBe(false)
  })
})

describe('steel store demo state', () => {
  beforeEach(() => useSteelStore.setState({ open: false, demo: false, autoRun: false, tour: false }))
  it('startDemo opens, flags the demo, auto-runs once and holds the tour', () => {
    useSteelStore.getState().startDemo(true)
    expect(useSteelStore.getState()).toMatchObject({ open: true, demo: true, autoRun: true, tour: true })
    useSteelStore.getState().consumeAutoRun()
    expect(useSteelStore.getState().autoRun).toBe(false)
  })
})

describe('steel tour', () => {
  it('five steps, the last one is a centred invitation', () => {
    expect(STEEL_TOUR_STEPS.map((s) => s.id)).toEqual(['table', 'row', 'bar', 'export', 'end'])
    expect(STEEL_TOUR_STEPS[STEEL_TOUR_STEPS.length - 1].target).toBeUndefined()
  })
  it('every tour text exists in the 10 languages', () => {
    const keys = [...STEEL_TOUR_STEPS.flatMap((s) => [s.title, s.body]), ...Object.values(STEEL_TOUR_UI), 'tourTitle' as const]
    for (const [lang, d] of Object.entries(STEEL_TEXTS)) for (const k of keys) expect(d[k], `${lang}.${k}`).toBeTruthy()
    for (const d of Object.values(STEEL_TEXTS)) expect(d.tourEndBody).not.toMatch(/Pro/)
  })
})
