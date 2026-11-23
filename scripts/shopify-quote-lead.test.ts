// T-325 G2 (quote / lead form) + T-326 F5 (ask an expert about this element).
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS module without types
import * as gen from '../integrations/shopify/build-extension.mjs'
// @ts-expect-error plain JS asset without types
import { shareShop } from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-i18n.js'
// @ts-expect-error plain JS asset without types
import { bind } from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-events.js'

const src = path.resolve(__dirname, '../integrations/shopify')
const block = fs.readFileSync(path.join(src, 'blocks/ifc-quote.liquid'), 'utf8')
const runtime = fs.readFileSync(path.join(src, 'snippets/ifcvo-runtime.liquid'), 'utf8')
const compiled = fs.readFileSync(gen.blockPath('ifc-quote.liquid'), 'utf8')
const schema = JSON.parse(block.match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/)![1])
const locale = (f: string) => JSON.parse(fs.readFileSync(path.join(src, 'locales', f), 'utf8'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = Record<string, (...a: any[]) => any>
const load = async (): Promise<Mod> => import(/* @vite-ignore */ '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-quote.js')
const flush = () => new Promise((r) => setTimeout(r, 0))

function fakeApi(viewer: unknown = null) {
  const cbs: ((type: string, e?: unknown) => void)[] = []
  return {
    viewer,
    open: vi.fn(async () => viewer),
    subscribe: (_root: Element, cb: (type: string, e?: unknown) => void) => { cbs.push(cb) },
    emit: (type: string, e?: unknown) => cbs.forEach((cb) => cb(type, e)),
  }
}

describe('quote request block (Liquid)', () => {
  it('is a native contact form with the lead fields, working without JavaScript', () => {
    expect(block).toMatch(/\{%- form 'contact'/)
    expect(block).toContain('{{ form.errors | default_errors }}')
    expect(block).toContain('form.posted_successfully?')
    for (const n of ['contact[name]', 'contact[email]', 'contact[Company]', 'contact[Role]', 'contact[Project]', 'contact[Quantity]', 'contact[body]', 'contact[Selection]', 'contact[Tag]']) {
      expect(block, n).toContain(`name="${n}"`)
    }
    // No-JS fallback: the Selection field already names the product and the variant.
    expect(block).toMatch(/assign sel = product\.title[\s\S]*append: v\.title/)
    expect(block).toContain('value="{{ sel | escape }}"')
    for (const r of ['architect', 'contractor', 'owner', 'reseller']) expect(block).toContain(`'ifcvo.lead.role_${r}' | t`)
    expect(block).toContain('value="ifcvo-lead" data-ifcvo-lead-tag')
  })

  it('is a Starter feature: Liquid hides it on Free, IFCVO.gate on the licence', () => {
    expect(gen.FEATURE_TIERS.quote).toBe('starter')
    expect(block).toMatch(/if plan == 'free'[\s\S]*render 'ifcvo-upsell', feature: 'quote'/)
    expect(block).toContain('data-ifcvo-gate="quote"')
    expect(block).toContain("render 'ifcvo-runtime', js: 'ifcvo-quote.js'")
  })

  it('has valid settings and every text in every language', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['role', 'project', 'quantity', 'ask', 'customer', 'tags']) expect(ids).toContain(id)
    expect(schema.settings.find((s: { id?: string }) => s.id === 'tags').default).toBe('ifcvo-lead')
    const keys = [...block.matchAll(/'ifcvo\.lead\.(\w+)' \| (?:append: r \| )?t/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(8)
    for (const f of fs.readdirSync(path.join(src, 'locales')).filter((x) => !x.endsWith('.schema.json'))) {
      const lead = locale(f).ifcvo.lead
      for (const k of [...keys.filter((k) => k !== 'role_'), 'role_architect', 'role_contractor', 'role_owner', 'role_reseller', 'ask', 'asking']) expect(lead[k], `${f} ${k}`).toBeTruthy()
    }
    for (const f of fs.readdirSync(path.join(src, 'locales')).filter((x) => x.endsWith('.schema.json'))) {
      const s = locale(f)
      expect(s.blocks.quote_form.name, f).toBeTruthy()
      for (const k of ['ask_for_the_buyer_s_role', 'show_ask_about_this_element', 'also_create_a_customer_with_these_tags']) expect(s.settings[k], `${f} ${k}`).toBeTruthy()
    }
  })

  it('the compiled block keeps the form and the server texts', () => {
    expect(compiled).toMatch(/{%-?form 'contact',id:'ifcvo-lead'( -)?%}/)
    expect(compiled).toContain("'ifcvo.lead.role_reseller'|t|escape")
  })

  it('the runtime snippet prints the shop labels once, safe inside a script tag', () => {
    expect(runtime).toContain("shop.metafields.ifcvo.labels.value | json | replace: '</', '<\\/'")
  })
})

describe('quote request helpers', () => {
  it('tags: block list, role, expert; cleaned and unique', async () => {
    const m = await load()
    expect(m.leadTags('ifcvo-lead, trade', 'architect')).toBe('ifcvo-lead, trade, role-architect')
    expect(m.leadTags('ifcvo-lead', 'owner', true)).toBe('ifcvo-lead, role-owner, ifc-expert-q')
    expect(m.leadTags('a<b>, a<b>', 'Bad Role!')).toBe('ab')
  })

  it('the expert text has the name, class, GlobalId, facts and the first property sets', async () => {
    const m = await load()
    const t = m.expertText({
      name: 'HEA 200', ifcClass: 'IfcBeam', globalId: '2O2Fr$t4X7Zf8NOew3FLOH', typeName: 'HEA', storey: 'Level 1', tag: 'B12',
      propertySets: [{ name: 'Pset_BeamCommon', properties: [{ name: 'LoadBearing', value: true }, { name: 'FireRating', value: 'R60' }, { name: 'Empty', value: null }] }],
    }, { expressId: 5 })
    expect(t).toContain('Question about: HEA 200 (IfcBeam, GlobalId 2O2Fr$t4X7Zf8NOew3FLOH)')
    expect(t).toContain('Type: HEA; Storey: Level 1; Tag: B12')
    expect(t).toContain('Pset_BeamCommon: LoadBearing=true; FireRating=R60')
    expect(t).not.toContain('Empty')
    expect(m.expertText(null, { expressId: 7, ifcType: 'IFCWALL' })).toContain('IFCWALL (IFCWALL, GlobalId #7)')
  })

  it('the selection lists product, variant, view link and elements, capped', async () => {
    const m = await load()
    const s = m.leadSelection({ product: 'Chair', variant: 'Oak', view: 'https://s.test/p#ifcvo-cam=1', expert: 'Question about: X' },
      [{ guid: 'G1', name: 'Beam', ifcClass: 'IFCBEAM', qty: 2 }])
    expect(s.split('\n')[0]).toBe('Question about: X')
    expect(s).toContain('Product: Chair\nVariant: Oak\nView: https://s.test/p#ifcvo-cam=1')
    expect(s).toContain('- 2 x Beam (IFCBEAM, GlobalId G1)')
    const many = Array.from({ length: 50 }, (_, i) => ({ guid: 'G'.repeat(60) + i, name: 'N'.repeat(40), ifcClass: 'IFCBEAM', qty: 1 }))
    expect(m.leadSelection({ product: 'P' }, many).length).toBeLessThanOrEqual(4000)
  })

  it('creates the customer through the storefront customer form', async () => {
    const m = await load()
    const fetchImpl = vi.fn(async () => ({ ok: true }))
    expect(await m.createCustomer('a@b.test', 'Ana', 'ifcvo-lead, role-owner', fetchImpl)).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { method: string; body: URLSearchParams }]
    expect(url).toBe('/contact')
    expect(init.method).toBe('POST')
    expect(init.body.get('form_type')).toBe('customer')
    expect(init.body.get('contact[email]')).toBe('a@b.test')
    expect(init.body.get('contact[tags]')).toBe('ifcvo-lead, role-owner')
    expect(await m.createCustomer('', 'x', 't', fetchImpl)).toBe(false)
  })
})

describe('quote request form in the page', () => {
  beforeEach(() => { document.body.innerHTML = ''; delete (window as unknown as { Shopify?: unknown }).Shopify })

  const markup = ({ tags = 'ifcvo-lead', ask = 'true' } = {}) => `
    <div data-ifcvo-viewer data-variant-id="7" data-product-id="9" data-model="https://cdn.x/chair.ifc"></div>
    <form action="/cart/add"><input name="id" value="42"></form>
    <div data-ifcvo-lead data-tags="${tags}" data-ask="${ask}">
      <div data-ifcvo-quote-list data-mode="lead" data-product="Chair" data-variants='"42":"Oak"'><div class="ifcvo-quote-body"></div></div>
      <form id="ifcvo-lead" action="/contact" method="post">
        <input type="hidden" name="contact[Selection]" value="Chair / Oak" data-ifcvo-lead-selection>
        <input type="hidden" name="contact[Tag]" value="ifcvo-lead" data-ifcvo-lead-tag>
        <input name="contact[name]" value="Ana"><input name="contact[email]" value="ana@b.test">
        <select name="contact[Role]" data-ifcvo-lead-role><option value="architect" selected>A</option></select>
        <textarea name="contact[body]" data-ifcvo-lead-body></textarea>
      </form>
    </div>`
  const q = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
  const viewer = {
    getCamera: vi.fn(async () => ({ position: [1, 2, 3], target: [0, 0, 0] })),
    getElement: vi.fn(async () => ({ name: 'HEA 200', ifcClass: 'IfcBeam', globalId: 'G5', propertySets: [{ name: 'Pset_BeamCommon', properties: [{ name: 'FireRating', value: 'R60' }] }] })),
  }
  const mount = async (opts?: { tags?: string; ask?: string }) => {
    const m = await load()
    document.body.innerHTML = markup(opts)
    const api = fakeApi(viewer)
    const fetchImpl = vi.fn(async () => ({ ok: true }))
    m.mountQuote(q('[data-ifcvo-quote-list]'), api)
    m.mountLead(q('[data-ifcvo-lead]'), api, fetchImpl)
    return { api, fetchImpl }
  }
  const submit = () => q<HTMLFormElement>('#ifcvo-lead').dispatchEvent(new Event('submit', { cancelable: true }))

  it('the list has no button of its own; picked elements land in the hidden Selection', async () => {
    const { api } = await mount()
    expect(q('.ifcvo-quote-go')).toBeNull()
    api.emit('element-selected', { expressId: 5, modelId: 'm', ifcType: 'IFCBEAM', name: 'HEA 200', globalId: 'G5' })
    q<HTMLButtonElement>('.ifcvo-quote-pick').click()
    const sel = q<HTMLInputElement>('[data-ifcvo-lead-selection]').value
    expect(sel).toContain('Product: Chair\nVariant: Oak')
    expect(sel).toContain('- 1 x HEA 200 (IFCBEAM, GlobalId G5)')
  })

  it('submit publishes ifcvo_quote_submit (no personal data), creates the tagged customer and never blocks the form', async () => {
    const { fetchImpl } = await mount()
    const published: unknown[] = []
    ;(window as unknown as { Shopify: unknown }).Shopify = { analytics: { publish: (n: string, d: unknown) => published.push([n, d]) } }
    bind(q('[data-ifcvo-viewer]'))
    q<HTMLFormElement>('#ifcvo-lead').dispatchEvent(new Event('focusin'))
    await flush(); await flush()
    const ev = new Event('submit', { cancelable: true })
    q<HTMLFormElement>('#ifcvo-lead').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(published).toEqual([['ifcvo_quote_submit', { file: 'chair.ifc', productId: '9', variantId: '7', elements: 0, role: 'architect', kind: 'quote' }]])
    expect(JSON.stringify(published)).not.toContain('ana@b.test')
    expect(q<HTMLInputElement>('[data-ifcvo-lead-selection]').value).toMatch(/View: http[^\n]*#ifcvo-cam=1,2,3,0,0,0/)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: URLSearchParams }]
    expect(init.body.get('contact[tags]')).toBe('ifcvo-lead, role-architect')
  })

  it('no customer is created when the block has no tags', async () => {
    const { fetchImpl } = await mount({ tags: '' })
    submit()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('"Ask about this element" puts the GUID, class, key properties and a view link with the selection in the message', async () => {
    const { api, fetchImpl } = await mount()
    const ask = q<HTMLButtonElement>('.ifcvo-lead-ask')
    expect(ask.textContent).toBe('Ask about this element')
    expect(ask.disabled).toBe(true)
    api.emit('element-selected', { expressId: 5, modelId: 'm', ifcType: 'IFCBEAM', name: 'HEA 200', globalId: 'G5' })
    expect(ask.disabled).toBe(false)
    ask.click()
    await flush(); await flush(); await flush()
    expect(viewer.getElement).toHaveBeenCalledWith('G5', 'm')
    expect(q<HTMLInputElement>('[data-ifcvo-lead-tag]').value).toBe('ifc-expert-q')
    const sel = q<HTMLInputElement>('[data-ifcvo-lead-selection]').value
    expect(sel).toContain('Question about: HEA 200 (IfcBeam, GlobalId G5)')
    expect(sel).toContain('Pset_BeamCommon: FireRating=R60')
    expect(sel).toMatch(/#ifcvo-cam=1,2,3,0,0,0&ifcvo-sel=m~5/)
    expect(document.activeElement).toBe(q('[data-ifcvo-lead-body]'))
    submit()
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: URLSearchParams }]
    expect(init.body.get('contact[tags]')).toBe('ifcvo-lead, role-architect, ifc-expert-q')
  })

  it('no ask button when the block turns it off', async () => {
    await mount({ ask: 'false' })
    expect(q('.ifcvo-lead-ask')).toBeNull()
  })
})

describe('shop labels printed once', () => {
  it('every data-i18n block gets the shop labels and the locale, never overwritten', () => {
    document.body.innerHTML = `<script type="application/json" data-ifcvo-shop-labels>{"es":{"x":"y"}}</script>
      <div id="a" data-i18n="dpp"></div><div id="b" data-i18n="rooms" data-ifcvo-labels="{}" data-locale="fr"></div>`
    shareShop(document, 'es-ES')
    const a = document.getElementById('a')!
    expect(a.dataset.ifcvoLabels).toBe('{"es":{"x":"y"}}')
    expect(a.dataset.locale).toBe('es-ES')
    expect(document.getElementById('b')!.dataset.ifcvoLabels).toBe('{}')
    expect(document.getElementById('b')!.dataset.locale).toBe('fr')
  })

  it('a shop without labels prints null, which is skipped', () => {
    document.body.innerHTML = '<script type="application/json" data-ifcvo-shop-labels>null</script><div id="a" data-i18n="dpp"></div>'
    shareShop(document, 'en')
    expect(document.getElementById('a')!.dataset.ifcvoLabels).toBeUndefined()
  })
})

describe('Flow recipe doc', () => {
  it('documents the contact fields, the tags and the event', () => {
    const doc = fs.readFileSync(path.join(src, 'app/docs/FLOW-QUOTE.md'), 'utf8')
    for (const s of ['ifcvo-lead', 'role-', 'ifc-expert-q', 'ifcvo_quote_submit', 'contact[Selection]', '_ifc_guid', '_ifc_type', '_ifc_qty']) expect(doc, s).toContain(s)
  })
})
