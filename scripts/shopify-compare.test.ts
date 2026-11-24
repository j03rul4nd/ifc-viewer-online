// @vitest-environment jsdom
// T-326 F9 (compare variants), F10 (#ifc-review) and the after-sale #ifcvo-view deep link.
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS asset without types
import * as cmp from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-compare.js'
// @ts-expect-error plain JS asset without types
import * as share from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-share.js'

describe('compare viewers follow the product viewer look', () => {
  it('copies the brand gradient, a preset background and the accent', () => {
    expect(cmp.lookOf({ bg: 'brand', bgTop: '#fbfaf7', bgBottom: '#e9e5db', accent: '2f5d50' }))
      .toEqual({ background: { top: '#fbfaf7', bottom: '#e9e5db' }, accent: '2f5d50' })
    expect(cmp.lookOf({ bg: 'paper' })).toEqual({ background: 'paper' })
    expect(cmp.lookOf({})).toEqual({})
    expect(cmp.lookOf({ ifcvoConfig: '{"grid":false,"finish":"daylight"}' })).toEqual({ grid: false, finish: 'daylight' })
  })

  it('the spec table is never clipped by the panel body scroll box', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo.css'), 'utf8')
    expect(css).toMatch(/\.ifcvo-compare \.ifcvo-body \{ max-height: none; overflow: visible; \}/)
    expect(css).toMatch(/\.ifcvo-compare-split\[hidden\], \.ifcvo-compare-tabs\[hidden\], \.ifcvo-compare-pane\[hidden\] \{ display: none; \}/)
  })
})

const SRC = path.resolve(__dirname, '../integrations/shopify')
const EXT = path.join(SRC, 'app/extensions/ifc-viewer')

const DATA_A = { elementCount: 1200, dimensions: { w: 8, d: 10, h: 6.5 }, totals: { volume: 40, weight: 12000 }, rooms: { totals: { count: 6, area: 92.5 }, bedrooms: 2, bathrooms: 1, storeys: [{}, {}] } }
const DATA_B = { elementCount: 1500, dimensions: { w: 8, d: 12, h: 6.5 }, totals: { volume: 52, weight: 15500 }, rooms: { totals: { count: 8, area: 120 }, bedrooms: 3, bathrooms: 2, storeys: [{}, {}] } }

type Fake = { url: string; disposed: boolean; stage: HTMLElement }
function fakeApi(opts: { allowed?: boolean } = {}) {
  const made: Fake[] = []
  class IfcViewer {
    rec: Fake
    handlers: Record<string, () => void> = {}
    constructor(stage: HTMLElement, o: { model: string }) {
      this.rec = { url: o.model, disposed: false, stage }
      stage.append(document.createElement('canvas'))
      made.push(this.rec)
    }
    on(type: string, cb: () => void) { this.handlers[type] = cb; if (type === 'model-loaded') setTimeout(cb, 0) }
    whenReady() { return Promise.resolve(this) }
    getProductData() { return Promise.resolve(this.rec.url.includes('big') ? DATA_B : DATA_A) }
    dispose() { this.rec.disposed = true }
  }
  return {
    made,
    api: { gate: vi.fn(() => opts.allowed !== false), loadSdk: vi.fn(async () => ({ IfcViewer })) },
  }
}

function page(variants = '"1":"Small","2":"Big"', models = '"1":"https://cdn.example/small.ifc","2":"https://cdn.example/big.ifc"') {
  document.body.innerHTML = `<div data-ifcvo-viewer data-models='${models}'></div>
    <div class="ifcvo-panel" data-ifcvo-compare data-variants='${variants}'><div class="ifcvo-body"></div></div>`
  return document.querySelector('[data-ifcvo-compare]') as HTMLElement
}

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)) }
const win = (narrow: boolean) => Object.assign(Object.create(window), { matchMedia: () => ({ matches: narrow }), addEventListener: () => {}, removeEventListener: () => {} })

describe('compare: pure parts', () => {
  it('lists variants that have an https model and needs two different models', () => {
    const o = cmp.variantOptions('"1":"Small","2":"Big","3":"Other"', '"1":"https://a/x.ifc","2":"https://a/y.ifc","3":"http://bad"')
    expect(o).toEqual([{ id: '1', title: 'Small', url: 'https://a/x.ifc' }, { id: '2', title: 'Big', url: 'https://a/y.ifc' }])
    expect(cmp.canCompare(o)).toBe(true)
    expect(cmp.canCompare(cmp.variantOptions('"1":"S","2":"B"', '"1":"https://a/x.ifc","2":"https://a/x.ifc"'))).toBe(false)
    expect(cmp.variantOptions('broken', '"1":')).toEqual([])
  })

  it('reads key specs and diffs them B − A, leaving out unknown rows', () => {
    const rows = cmp.diffSpecs(cmp.keySpecs(DATA_A), cmp.keySpecs(DATA_B), { locale: 'en' })
    const by = Object.fromEntries(rows.map((r: { key: string }) => [r.key, r]))
    expect(by.area).toMatchObject({ a: '92.5 m²', b: '120 m²', delta: '+27.5 m²', same: false })
    expect(by.bedrooms).toMatchObject({ a: '2', b: '3', delta: '+1' })
    expect(by.storeys).toMatchObject({ delta: 'Same', same: true })
    expect(by.size).toMatchObject({ a: '8 × 10 × 6.5 m', b: '8 × 12 × 6.5 m', delta: '' })
    const none = cmp.diffSpecs(cmp.keySpecs({ elementCount: 10 }), cmp.keySpecs({ elementCount: 7 }))
    expect(none.map((r: { key: string }) => r.key)).toEqual(['elements'])
    expect(none[0].delta).toBe('−3')
  })
})

describe('compare: block', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('desktop: loads both models side by side, shows the diff, and closing frees both viewers', async () => {
    const root = page()
    const { api, made } = fakeApi()
    cmp.mount(root, { api, win: win(false) })
    ;(root.querySelector('.ifcvo-btn') as HTMLButtonElement).click()
    await flush()
    expect(made.map((m) => m.url)).toEqual(['https://cdn.example/small.ifc', 'https://cdn.example/big.ifc'])
    expect(root.querySelectorAll('.ifcvo-compare-table tbody tr').length).toBeGreaterThan(5)
    expect(root.querySelector('.ifcvo-compare-tabs')!.hasAttribute('hidden')).toBe(true)
    ;(root.querySelector('.ifcvo-compare-close') as HTMLButtonElement).click()
    expect(made.every((m) => m.disposed)).toBe(true)
    expect(made.every((m) => m.stage.childElementCount === 0)).toBe(true)
    expect(root.querySelector('.ifcvo-compare-table')!.childElementCount).toBe(0)
  })

  it('mobile: tabs, only one live model at a time, specs of both kept', async () => {
    const root = page()
    const { api, made } = fakeApi()
    cmp.mount(root, { api, win: win(true) })
    ;(root.querySelector('.ifcvo-btn') as HTMLButtonElement).click()
    await flush()
    const live = () => made.filter((m) => !m.disposed)
    expect(live().length).toBe(1)
    expect(live()[0].url).toContain('small')
    const tabs = [...root.querySelectorAll('[role="tab"]')] as HTMLButtonElement[]
    expect(root.querySelector('.ifcvo-compare-tabs')!.hasAttribute('hidden')).toBe(false)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(root.querySelectorAll('.ifcvo-compare-table tbody tr').length).toBeGreaterThan(5)
    tabs[1].click()
    await flush()
    expect(live().length).toBe(1)
    expect(live()[0].url).toContain('big')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    const panes = [...root.querySelectorAll('[role="tabpanel"]')] as HTMLElement[]
    expect(panes[0].hidden).toBe(true)
    expect(panes[1].hidden).toBe(false)
  })

  it('stays hidden without two models, and is gated by plan', () => {
    const { api } = fakeApi()
    const one = page('"1":"Only"', '"1":"https://cdn.example/a.ifc"')
    expect(cmp.mount(one, { api, win: win(false) })).toBeNull()
    expect(one.hidden).toBe(true)
    const gated = fakeApi({ allowed: false })
    const root = page()
    expect(cmp.mount(root, { api: gated.api, win: win(false) })).toBeNull()
    expect(gated.api.gate).toHaveBeenCalledWith('compare', root)
  })

  it('Liquid: tiny block, product-only, texts from assets, no render inside a tag', () => {
    const src = fs.readFileSync(path.join(SRC, 'blocks/ifc-compare.liquid'), 'utf8')
    expect(src).toContain('data-i18n="compare"')
    expect(src).toContain("render 'ifcvo-runtime', js: 'ifcvo-compare.js'")
    const built = fs.readFileSync(path.join(EXT, 'blocks/ifc-compare.liquid'), 'utf8')
    expect(Buffer.byteLength(built)).toBeLessThan(1600)
    const en = JSON.parse(fs.readFileSync(path.join(EXT, 'assets/ifcvo-i18n-es.json'), 'utf8'))
    expect(en.compare.title).toBe('Comparar variantes')
  })
})

describe('deep links: #ifcvo-view and #ifc-review', () => {
  it('parses the after-sale view id and the review flag', () => {
    const s = share.parseHash('#ifcvo-open=1&ifcvo-v=2&ifcvo-view=step-1')
    expect(s).toMatchObject({ open: true, version: '2', view: 'step-1', review: false })
    expect(share.parseHash('#ifc-review')).toMatchObject({ review: true, open: false })
    expect(share.wantsViewer(share.parseHash('#ifc-review'))).toBe(true)
    expect(share.parseHash('#ifcvo-view=%3Cscript%3E').view).toBeNull()
    expect(share.parseHash('#ifcvo-view=' + 'a'.repeat(101)).view).toBeNull()
  })

  it('resolves saved views from ifcvo.views, presets and six numbers', () => {
    const views = { base: { position: [1, 2, 3], target: [0, 0, 0] }, top: 'front', hero: 'iso', cam: '1,2,3,4,5,6' }
    expect(share.resolveView('base', views)).toEqual({ camera: { position: [1, 2, 3], target: [0, 0, 0] } })
    expect(share.resolveView('top', views)).toEqual({ preset: 'front' })
    expect(share.resolveView('cam', views)).toEqual({ camera: { position: [1, 2, 3], target: [4, 5, 6] } })
    expect(share.resolveView('left', {})).toEqual({ preset: 'left' })
    expect(share.resolveView('9,8,7,0,0,0', null)).toEqual({ camera: { position: [9, 8, 7], target: [0, 0, 0] } })
    expect(share.resolveView('unknown', views)).toBeNull()
    expect(share.resolveView('__proto__', views)).toBeNull()
  })

  it('applies the saved view, or the hero view for a review link', async () => {
    const v = { setView: vi.fn(async () => {}), lookAt: vi.fn(async () => {}) }
    await share.applyState(v, share.parseHash('#ifcvo-open=1&ifcvo-view=base'), { base: { position: [1, 2, 3], target: [0, 0, 0] } })
    expect(v.lookAt).toHaveBeenCalledWith([1, 2, 3], [0, 0, 0], false)
    await share.applyState(v, share.parseHash('#ifc-review'), { hero: 'top' })
    expect(v.setView).toHaveBeenCalledWith('top')
    v.setView.mockClear()
    expect(await share.applyState(v, share.parseHash('#ifc-review'), {})).toBe(false)
    expect(v.setView).not.toHaveBeenCalled()
  })

  it('reads the views map the product viewer prints', () => {
    const el = document.createElement('div')
    el.dataset.ifcvoViews = JSON.stringify({ hero: 'iso' })
    expect(share.viewsOf(el)).toEqual({ hero: 'iso' })
    el.dataset.ifcvoViews = 'null'
    expect(share.viewsOf(el)).toEqual({})
    const src = fs.readFileSync(path.join(SRC, 'blocks/product-ifc-viewer.liquid'), 'utf8')
    expect(src).toContain('data-ifcvo-views="{{ current.metafields.ifcvo.views.value | default: product.metafields.ifcvo.views.value | json | escape }}"')
  })

  it('a review link is ignored on Free, honoured on Starter', () => {
    for (const [plan, opens] of [['free', 0], ['starter', 1]] as const) {
      document.body.innerHTML = '<div data-ifcvo-viewer><div class="ifcvo-stage"></div></div>'
      history.replaceState(null, '', '#ifc-review')
      const open = vi.fn(async () => null)
      ;(window as unknown as { IFCVO: unknown }).IFCVO = {
        plan, viewer: null, open, subscribe: () => {},
        allowed: (f: string, p: string) => !(f === 'review' && p === 'free'),
      }
      Element.prototype.scrollIntoView = () => {}
      share.init(document)
      expect(open).toHaveBeenCalledTimes(opens)
    }
    history.replaceState(null, '', '#')
  })
})
