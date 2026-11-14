// @vitest-environment jsdom
// The revision compare tour, mounted on a stand-in of the workspace anchors
// with a PostHog mock: walking it to the end emits rc_tour_started, one
// rc_tour_step per step and rc_tour_completed; Skip emits rc_tour_dismissed
// with the step it was left on; a step whose anchor is not on screen (phone
// layout) is skipped. Also the demo link helpers.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), init: vi.fn(), opt_out_capturing: vi.fn(), opt_in_capturing: vi.fn(), register: vi.fn() },
}))

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import posthog from 'posthog-js'
import i18n from '../../i18n/config'
import { initAnalytics } from '../../lib/analytics'
import { REVISION_TOUR_STEPS } from '../../lib/workspace-tours/revision-tour'
import { DEMO_FILES, fetchDemoPair, readCompareParams } from '../../lib/compare/demo'
import { RevisionTourHost, startRevisionTour } from './RevisionHelp'
import { useRevisionStore } from './revisionStore'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root
let host: HTMLDivElement
const rect = Element.prototype.getBoundingClientRect

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
  vi.stubGlobal('location', { ...window.location, hostname: 'www.ifcvieweronline.eu' })
  initAnalytics()
  vi.unstubAllGlobals()
  await i18n.loadNamespaces('compare')
  // jsdom has no layout: anchors marked data-hidden measure 0×0 (not on screen).
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const off = (this as HTMLElement).dataset?.hidden === '1'
    return { top: 10, left: 10, width: off ? 0 : 100, height: off ? 0 : 40, right: 110, bottom: 50, x: 10, y: 10, toJSON() {} } as DOMRect
  }
  Element.prototype.scrollIntoView = () => {}
})
afterAll(() => { Element.prototype.getBoundingClientRect = rect; vi.unstubAllEnvs() })

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(posthog.capture).mockClear()
  useRevisionStore.getState().reset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

function mount(hidden: string[] = []): void {
  const anchors = REVISION_TOUR_STEPS.map((s) => createElement('div', { key: s.id, 'data-tour': s.target, 'data-hidden': hidden.includes(s.target!) ? '1' : '0' }, s.id))
  act(() => root.render(createElement('div', null, ...anchors, createElement(RevisionTourHost))))
}

const events = () => vi.mocked(posthog.capture).mock.calls.map((c) => [c[0], c[1]] as const)
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === label)

function start(): void {
  act(() => startRevisionTour())
  act(() => { vi.advanceTimersByTime(600) })
}

describe('revision tour', () => {
  it('has the nine steps in site order, each with its texts in English', () => {
    expect(REVISION_TOUR_STEPS.map((s) => s.id)).toEqual(['local', 'list', 'moved', 'table', 'review', 'filters', 'views', 'export', 'end'])
    for (const s of REVISION_TOUR_STEPS) {
      expect(i18n.getFixedT("en", "compare")(s.title as never)).not.toBe(s.title)
      expect(i18n.getFixedT("en", "compare")(s.body as never)).not.toBe(s.body)
    }
  })

  it('walked to the end emits started, one step per step and completed', () => {
    mount()
    start()
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('Old vs new, nothing uploaded')
    for (let i = 0; i < REVISION_TOUR_STEPS.length - 1; i++) act(() => button('Next')!.click())
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('Try it with your own files')
    act(() => button('Done')!.click())
    const ev = events()
    expect(ev[0]).toEqual(['rc_tour_started', undefined])
    expect(ev.filter(([n]) => n === 'rc_tour_step').map(([, p]) => (p as { step: string }).step)).toEqual(REVISION_TOUR_STEPS.map((s) => s.id))
    expect(ev[ev.length - 1]).toEqual(['rc_tour_completed', undefined])
    expect(useRevisionStore.getState().tour).toBe(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('skips steps without a visible anchor (phone) and reports where it was left', () => {
    mount(['rc-list', 'rc-filters', 'rc-exports', 'rc-table'])
    start()
    expect(document.querySelector('[role="dialog"] p')?.textContent).toMatch(/1 of 5/)
    act(() => button('Next')!.click())
    act(() => button('Skip')!.click())
    const steps = events().filter(([n]) => n === 'rc_tour_step').map(([, p]) => (p as { step: string }).step)
    expect(steps).toEqual(['local', 'moved'])
    expect(events().slice(-1)[0]).toEqual(['rc_tour_dismissed', { step: 'moved' }])
  })

  it('speaks Thai', async () => {
    await act(async () => { await i18n.changeLanguage('th') })
    mount()
    start()
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('ฉบับเก่าเทียบฉบับใหม่ ไม่ต้องอัปโหลด')
    expect(button('ถัดไป')).toBeTruthy()
    await act(async () => { await i18n.changeLanguage('en') })
  })
})

describe('demo link', () => {
  it('reads compare=demo and tour=revision', () => {
    expect(readCompareParams('?compare=demo&tour=revision&ref=test')).toEqual({ open: true, demo: true, tour: true })
    expect(readCompareParams('?compare')).toEqual({ open: true, demo: false, tour: false })
    expect(readCompareParams('?tour=revision')).toEqual({ open: false, demo: false, tour: true })
  })

  it('fetches both sides, A older than B', async () => {
    const urls: string[] = []
    const pair = await fetchDemoPair(async (u) => { urls.push(u); return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) } })
    expect(urls).toHaveLength(DEMO_FILES.length * 2)
    expect(urls.every((u) => u.startsWith('/models/revision-demo/'))).toBe(true)
    expect(pair.a.map((f) => f.name)).toEqual([...DEMO_FILES])
    expect(pair.a[0].lastModified).toBeLessThan(pair.b[0].lastModified)
    await expect(fetchDemoPair(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }))).rejects.toThrow(/404/)
  })
})
