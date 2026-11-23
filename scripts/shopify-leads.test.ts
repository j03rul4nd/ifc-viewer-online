// T-325 G5 (gated downloads that create leads), T-326 F1 (email me this model)
// and F7 (viewer-intent segments). No server: native Shopify forms, cart attributes.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS module without types
import * as gen from '../integrations/shopify/build-extension.mjs'
// @ts-expect-error plain JS asset without types
import { countOpen, viewsAttribute, consented, onOpen, WARM_AT } from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-leads.js'

const src = path.resolve(__dirname, '../integrations/shopify')
const read = (f: string) => fs.readFileSync(path.join(src, f), 'utf8')
const capture = read('blocks/ifc-capture.liquid')
const downloadsBlock = read('blocks/ifc-downloads.liquid')
const snippet = read('snippets/ifcvo-downloads.liquid')
const leadsJs = read('app/extensions/ifc-viewer/assets/ifcvo-leads.js')
const schemaOf = (t: string) => JSON.parse(t.match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/)![1])

function memStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const win = (consent: boolean) => ({ Shopify: { routes: { root: '/' }, customerPrivacy: { marketingAllowed: () => consent } } })

describe('G5: gated downloads', () => {
  it('offers everyone, customers, tag and buyers, default everyone', () => {
    const gate = schemaOf(downloadsBlock).settings.find((s: { id: string }) => s.id === 'gate')
    expect(gate.options.map((o: { value: string }) => o.value)).toEqual(['none', 'customer', 'tag', 'buyer'])
    expect(gate.default).toBe('none')
  })
  it('sends guests to register and back to the product (Liquid only, works without JS)', () => {
    expect(snippet).toContain('routes.account_register_url')
    expect(snippet).toContain('return_url={{ product.url | url_encode | escape }}')
    expect(snippet).toContain("'ifcvo.leads.register'")
  })
  it('tag gate tells logged-in customers without the tag; buyers go to their account', () => {
    expect(snippet).toContain("'ifcvo.leads.trade'")
    expect(snippet).toMatch(/dl_gate == 'buyer'[\s\S]*routes\.account_url/)
  })
  it('the gate is a Starter feature: an explicit free plan shows the downloads to everyone', () => {
    expect(downloadsBlock).toMatch(/if pv_plan == 'free'\s+assign dl_gate = 'none'/)
    expect(downloadsBlock).toContain('gate: dl_gate')
    expect(gen.FEATURE_TIERS.gateddownloads).toBe('starter')
  })
  it('download events say whether the list was gated', async () => {
    const q = await import(/* @vite-ignore */ '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-quote.js')
    document.body.innerHTML = '<div data-ifcvo-viewer></div><div data-ifcvo-downloads data-gate="customer"><a download href="https://cdn.shopify.com/m.ifc" data-file="m.ifc">x</a></div>'
    const got: unknown[] = []
    document.querySelector('[data-ifcvo-viewer]')!.addEventListener('ifcvo:download', (e) => got.push((e as CustomEvent).detail))
    q.onDownloadClick({ target: document.querySelector('a') })
    expect(got).toEqual([{ file: 'm.ifc', gated: true }])
  })
})

describe('F1: email me this model', () => {
  it('is the native customer form with both tags, working without JavaScript', () => {
    expect(capture).toMatch(/\{%- form 'customer'/)
    expect(capture).toContain('name="contact[tags]" value="ifc-spec-request,ifc-interest:{{ product.handle | escape }}"')
    expect(capture).toContain('name="contact[email]"')
    expect(capture).toContain('form.posted_successfully?')
  })
  it('marketing consent is the visitor\'s unchecked box (hidden false before it)', () => {
    const i = capture.indexOf('name="contact[accepts_marketing]" value="false"')
    const j = capture.indexOf('type="checkbox" name="contact[accepts_marketing]" value="true"')
    expect(i).toBeGreaterThan(0)
    expect(j).toBeGreaterThan(i)
    expect(capture).not.toMatch(/accepts_marketing[^>]*checked/)
  })
  it('is Starter, with an editor-only note on the free plan', () => {
    expect(gen.FEATURE_TIERS.capture).toBe('starter')
    expect(capture).toMatch(/plan == 'free'[\s\S]*render 'ifcvo-upsell', feature: 'capture'/)
  })
  it('never calls a non-Shopify host', () => {
    expect(leadsJs).not.toMatch(/https?:\/\//)
  })
})

describe('F7: warm viewers', () => {
  it('is Business and off by default', () => {
    expect(gen.FEATURE_TIERS.intent).toBe('business')
    expect(schemaOf(capture).settings.find((s: { id: string }) => s.id === 'intent').default).toBe(false)
  })
  it('counts opens per product', () => {
    const st = memStorage()
    expect(countOpen(st, 'a')).toBe(1)
    expect(countOpen(st, 'a')).toBe(2)
    expect(countOpen(st, 'b')).toBe(1)
    expect(viewsAttribute(st)).toBe('a:2,b:1')
  })
  it('without consent nothing is written', async () => {
    const st = memStorage()
    const fetchFn = vi.fn(async () => ({}))
    for (let i = 0; i < 5; i++) await onOpen({ handle: 'a', email: 'x@y.z', storage: st, win: win(false), fetchFn })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(consented({})).toBe(false)
  })
  it('tags a logged-in customer once, on the third open, through the native customer form', async () => {
    const st = memStorage()
    const fetchFn = vi.fn(async () => ({}))
    const res: string[] = []
    for (let i = 0; i < WARM_AT + 2; i++) res.push(await onOpen({ handle: 'chair', email: 'x@y.z', storage: st, win: win(true), fetchFn }))
    expect(res).toEqual(['', '', 'tag', '', ''])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { body: URLSearchParams }]
    expect(url).toBe('/contact')
    expect(init.body.get('form_type')).toBe('customer')
    expect(init.body.get('contact[tags]')).toBe('ifc-warm:chair')
    expect(init.body.has('contact[accepts_marketing]')).toBe(false)
  })
  it('writes the _ifc_views cart attribute for guests', async () => {
    const st = memStorage()
    const fetchFn = vi.fn(async () => ({}))
    for (let i = 0; i < WARM_AT; i++) await onOpen({ handle: 'chair', email: '', storage: st, win: win(true), fetchFn })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe('/cart/update.js')
    expect(JSON.parse(init.body)).toEqual({ attributes: { _ifc_views: 'chair:3' } })
  })
})

describe('locales', () => {
  it('every storefront locale has the ifcvo.leads texts', () => {
    const keys = Object.keys(JSON.parse(read('locales/en.default.json')).ifcvo.leads).sort()
    for (const f of fs.readdirSync(path.join(src, 'locales')).filter((x) => x.endsWith('.json') && !x.includes('schema'))) {
      expect(Object.keys(JSON.parse(read('locales/' + f)).ifcvo.leads).sort(), f).toEqual(keys)
    }
  })
})

describe('F7 consent', () => {
  it('writes nothing to storage without marketing consent', async () => {
    const mod = await import('../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-leads.js')
    const data: Record<string, string> = {}
    const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v } }
    const win = { Shopify: { customerPrivacy: { marketingAllowed: () => false } } }
    for (let i = 0; i < 4; i++) await mod.onOpen({ handle: 'h', email: '', storage, win, fetchFn: async () => ({}) })
    expect(Object.keys(data)).toHaveLength(0)
  })
})
