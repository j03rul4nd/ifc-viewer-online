// T-322e: element quote list (cart line properties / contact form) and
// downloads (IFC, browser-made GLB and CSV, extra files, gated by customer).
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ext = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const read = (p: string): string => fs.readFileSync(path.join(ext, p), 'utf8')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = Record<string, (...a: any[]) => any>
const modPath = '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-quote.js'
const load = async (): Promise<Mod> => import(/* @vite-ignore */ modPath)

interface Setting { type: string; id?: string; default?: unknown; options?: { value: string }[] }
const schemaOf = (src: string): { settings: Setting[] } => JSON.parse(src.match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/)![1])

/** Every `attr="{{ ... }}"` output must be escaped. */
function unescapedAttrs(src: string): string[] {
  return [...src.matchAll(/="\{\{([^}]*)\}\}"/g)].map((m) => m[1]).filter((x) => !/\|\s*(escape|asset_url)\b/.test(x))
}

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

describe('quote helpers', () => {
  it('clamps quantities to whole numbers from 1 to 9999', async () => {
    const m = await load()
    expect(m.clampQty('3')).toBe(3)
    expect(m.clampQty('2.7')).toBe(2)
    expect(m.clampQty('0')).toBe(1)
    expect(m.clampQty('abc')).toBe(1)
    expect(m.clampQty(1e9)).toBe(9999)
  })

  it('adds one more of an element already in the list, by GlobalId', async () => {
    const m = await load()
    let items = m.addItem([], { guid: 'G1', expressId: 1, name: 'Beam', ifcClass: 'IFCBEAM' })
    items = m.addItem(items, { guid: 'G1', expressId: 1, name: 'Beam', ifcClass: 'IFCBEAM' })
    items = m.addItem(items, { guid: '', expressId: 7, name: '', ifcClass: 'IFCPLATE' })
    expect(items).toHaveLength(2)
    expect(items[0].qty).toBe(2)
  })

  it('builds /cart/add.js lines on the variant with the GlobalId as a hidden property', async () => {
    const m = await load()
    const body = m.cartItems('42', [{ guid: 'G1', expressId: 1, name: 'Beam', ifcClass: 'IFCBEAM', qty: 3 }, { guid: '', expressId: 9, name: '', ifcClass: 'IFCPLATE', qty: 1 }])
    expect(body.items[0]).toEqual({ id: 42, quantity: 3, properties: { _ifc_guid: 'G1', Element: 'Beam', 'IFC class': 'IFCBEAM' } })
    expect(body.items[1].properties._ifc_guid).toBe('#9')
    expect(body.items[1].properties.Element).toBe('IFCPLATE')
  })

  it('writes a contact body with product, variant and one line per element', async () => {
    const m = await load()
    const text = m.quoteBody({ product: 'Chair', variant: 'Oak', url: 'https://s.com/p', intro: 'Quote please' }, [{ guid: 'G1', name: 'Leg', ifcClass: 'IFCMEMBER', qty: 4 }])
    expect(text).toContain('Quote please')
    expect(text).toContain('Product: Chair')
    expect(text).toContain('Variant: Oak')
    expect(text).toContain('- 4 x Leg (IFCMEMBER, GlobalId G1)')
  })

  it('CSV quotes cells, neutralises formulas and skips non-elements', async () => {
    const m = await load()
    expect(m.csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    const csv = m.elementsCsv([
      { name: 'Wall 1', globalId: 'G1', ifcClass: 'IFCWALL', typeName: 'W200', modelId: 'm' },
      { name: 'Pset', globalId: 'G2', ifcClass: 'IFCPROPERTYSET' },
      { name: 'WT', globalId: 'G3', ifcClass: 'IFCWALLTYPE' },
    ])
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('"Name","GlobalId","IFC class","Type","Model"')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('"Wall 1","G1","IFCWALL","W200","m"')
  })
})

describe('quote list in the page', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  const markup = (mode: string, extra = '') => `
    <div data-ifcvo-viewer data-variant-id="7" data-model="https://cdn.x/chair.ifc"></div>
    <form action="/cart/add"><input name="id" value="42"></form>
    ${extra}
    <div data-ifcvo-quote-list data-mode="${mode}" data-product="Chair" data-empty="Nothing yet"><div class="ifcvo-quote-body"></div></div>`
  const q = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
  const select = (api: ReturnType<typeof fakeApi>) => api.emit('element-selected', { expressId: 5, modelId: 'm', ifcType: 'IFCBEAM', name: 'HEA 200', globalId: 'G5' })

  it('starts empty: a message, the add button and the action disabled', async () => {
    const m = await load()
    document.body.innerHTML = markup('cart')
    m.mountQuote(q('[data-ifcvo-quote-list]'), fakeApi())
    expect(q('.ifcvo-quote-list').textContent).toContain('Nothing yet')
    expect(q<HTMLButtonElement>('.ifcvo-quote-pick').disabled).toBe(true)
    expect(q<HTMLButtonElement>('.ifcvo-quote-go').disabled).toBe(true)
  })

  it('adds the selected element and posts it to the cart on the current variant', async () => {
    const m = await load()
    document.body.innerHTML = markup('cart')
    const api = fakeApi()
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    const quotes = vi.fn()
    q('[data-ifcvo-viewer]').addEventListener('ifcvo:quote', quotes)
    m.mountQuote(q('[data-ifcvo-quote-list]'), api, fetchImpl)
    select(api)
    const pick = q<HTMLButtonElement>('.ifcvo-quote-pick')
    expect(pick.disabled).toBe(false)
    expect(pick.textContent).toContain('HEA 200')
    pick.click()
    const qty = q<HTMLInputElement>('.ifcvo-qty')
    expect(qty.getAttribute('aria-label')).toContain('HEA 200')
    qty.value = '6'
    qty.dispatchEvent(new Event('change'))
    q<HTMLButtonElement>('.ifcvo-quote-go').click()
    await flush(); await flush()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe('/cart/add.js')
    expect(JSON.parse(init.body)).toEqual({ items: [{ id: 42, quantity: 6, properties: { _ifc_guid: 'G5', Element: 'HEA 200', 'IFC class': 'IFCBEAM' } }] })
    expect(q('.ifcvo-quote-status').textContent).toContain('1')
    expect(q('.ifcvo-quote-list').textContent).toContain('Nothing yet')
    expect(quotes).toHaveBeenCalled()
  })

  it('shows the cart error and keeps the list', async () => {
    const m = await load()
    document.body.innerHTML = markup('cart')
    const api = fakeApi()
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({ description: 'Sold out' }) }))
    m.mountQuote(q('[data-ifcvo-quote-list]'), api, fetchImpl)
    select(api)
    q<HTMLButtonElement>('.ifcvo-quote-pick').click()
    q<HTMLButtonElement>('.ifcvo-quote-go').click()
    await flush(); await flush()
    const status = q('.ifcvo-quote-status')
    expect(status.textContent).toContain('Sold out')
    expect(status.classList.contains('ifcvo-error')).toBe(true)
    expect(document.querySelectorAll('.ifcvo-quote-row')).toHaveLength(1)
  })

  it('removes a row with its own button', async () => {
    const m = await load()
    document.body.innerHTML = markup('cart')
    const api = fakeApi()
    m.mountQuote(q('[data-ifcvo-quote-list]'), api)
    select(api)
    q<HTMLButtonElement>('.ifcvo-quote-pick').click()
    q<HTMLButtonElement>('.ifcvo-quote-row .ifcvo-chip').click()
    expect(document.querySelectorAll('.ifcvo-quote-row')).toHaveLength(0)
    expect(q<HTMLButtonElement>('.ifcvo-quote-go').disabled).toBe(true)
  })

  it('fills the theme contact form body instead, when set to contact', async () => {
    const m = await load()
    document.body.innerHTML = markup('contact', '<form action="/contact#c"><textarea name="contact[body]"></textarea></form>')
    const api = fakeApi()
    const fetchImpl = vi.fn()
    m.mountQuote(q('[data-ifcvo-quote-list]'), api, fetchImpl)
    select(api)
    q<HTMLButtonElement>('.ifcvo-quote-pick').click()
    q<HTMLButtonElement>('.ifcvo-quote-go').click()
    await flush()
    const body = q<HTMLTextAreaElement>('textarea')
    expect(body.value).toContain('Product: Chair')
    expect(body.value).toContain('GlobalId G5')
    expect(document.activeElement).toBe(body)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('says so when there is no contact form', async () => {
    const m = await load()
    document.body.innerHTML = markup('contact')
    const api = fakeApi()
    m.mountQuote(q('[data-ifcvo-quote-list]'), api)
    select(api)
    q<HTMLButtonElement>('.ifcvo-quote-pick').click()
    q<HTMLButtonElement>('.ifcvo-quote-go').click()
    await flush()
    expect(q('.ifcvo-quote-status').classList.contains('ifcvo-error')).toBe(true)
  })

  it('every control is a native button or input (keyboard reachable)', async () => {
    const m = await load()
    document.body.innerHTML = markup('cart')
    const api = fakeApi()
    m.mountQuote(q('[data-ifcvo-quote-list]'), api)
    select(api)
    q<HTMLButtonElement>('.ifcvo-quote-pick').click()
    for (const c of document.querySelectorAll('[data-ifcvo-quote-list] .ifcvo-btn, [data-ifcvo-quote-list] .ifcvo-chip, [data-ifcvo-quote-list] .ifcvo-qty')) {
      expect(['BUTTON', 'INPUT']).toContain(c.tagName)
    }
    expect(q('.ifcvo-quote-status').getAttribute('aria-live')).toBe('polite')
  })
})

describe('browser-made downloads', () => {
  const box = `<div data-ifcvo-viewer data-model="https://cdn.x/chair.ifc?v=1"></div>
    <div data-ifcvo-downloads><button data-ifcvo-make="glb"></button><button data-ifcvo-make="csv"></button><p class="ifcvo-make-status"></p></div>`
  const q = <T extends HTMLElement>(s: string) => document.querySelector(s) as T

  beforeEach(() => {
    document.body.innerHTML = box
    ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:x')
    ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn()
  })

  it('makes a CSV from findElements after the model loads, and reports the download', async () => {
    const m = await load()
    const viewer = { findElements: vi.fn(async () => [{ name: 'W', globalId: 'G', ifcClass: 'IFCWALL' }]) }
    const api = fakeApi(viewer)
    const saved = vi.fn()
    q('[data-ifcvo-viewer]').addEventListener('ifcvo:download', (e) => saved((e as CustomEvent).detail.file))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    m.mountDownloads(q('[data-ifcvo-downloads]'), api)
    q<HTMLButtonElement>('[data-ifcvo-make="csv"]').click()
    await flush()
    expect(viewer.findElements).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(saved).toHaveBeenCalledWith('chair-elements.csv')
    click.mockRestore()
  })

  it('opens the viewer first when it is closed', async () => {
    const m = await load()
    const viewer = { findElements: vi.fn(async () => []) }
    const api = fakeApi(null)
    api.open = vi.fn(async () => viewer)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    m.mountDownloads(q('[data-ifcvo-downloads]'), api)
    q<HTMLButtonElement>('[data-ifcvo-make="csv"]').click()
    await flush()
    expect(api.open).toHaveBeenCalled()
    expect(viewer.findElements).not.toHaveBeenCalled()
    api.emit('model-loaded', {})
    await flush(); await flush()
    expect(viewer.findElements).toHaveBeenCalled()
  })

  it('makes a GLB through exportModel, or says the viewer is too old', async () => {
    const m = await load()
    const bytes = new ArrayBuffer(4)
    const viewer: Record<string, unknown> = { exportModel: vi.fn(async () => ({ bytes, mimeType: 'model/gltf-binary', sizeBytes: 4, fileName: 'chair.glb' })) }
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    m.mountDownloads(q('[data-ifcvo-downloads]'), fakeApi(viewer))
    q<HTMLButtonElement>('[data-ifcvo-make="glb"]').click()
    await flush(); await flush()
    expect(viewer.exportModel).toHaveBeenCalledWith({ format: 'glb' })
    expect(q('.ifcvo-make-status').classList.contains('ifcvo-error')).toBe(false)

    document.body.innerHTML = box
    m.mountDownloads(q('[data-ifcvo-downloads]'), fakeApi({}))
    q<HTMLButtonElement>('[data-ifcvo-make="glb"]').click()
    await flush(); await flush()
    expect(q('.ifcvo-make-status').textContent).toContain('newer viewer')
    expect(q<HTMLButtonElement>('[data-ifcvo-make="glb"]').disabled).toBe(false)
  })
})

describe('Liquid: downloads snippet and blocks', () => {
  const snippet = read('snippets/ifcvo-downloads.liquid')
  const details = read('blocks/ifc-element-details.liquid')
  const downloads = read('blocks/ifc-downloads.liquid')
  const product = read('blocks/product-ifc-viewer.liquid')

  it('escapes every Liquid output in attributes', () => {
    for (const src of [snippet, details, downloads, product]) expect(unescapedAttrs(src)).toEqual([])
  })

  it('gates on the customer object and is honest that it only hides links', () => {
    expect(snippet).toContain("dl_gate == 'customer' and customer == nil")
    expect(snippet).toContain('customer.tags contains dl_tag')
    expect(snippet).toContain('routes.account_login_url')
    expect(snippet).toMatch(/not protected/)
    expect(schemaOf(downloads).settings.find((s) => s.id === 'gate')!.default).toBe('none')
  })

  it('offers IFC, browser-made GLB and CSV, and the extra files', () => {
    expect(snippet).toContain('class="ifcvo-download"')
    expect(snippet).toContain('data-ifcvo-make="glb"')
    expect(snippet).toContain('data-ifcvo-make="csv"')
    expect(snippet).toContain('{%- for f in files -%}')
  })

  it('product block renders the snippet without new settings (25 max)', () => {
    expect(product).toContain("render 'ifcvo-downloads'")
    expect(product).toContain('shop_cfg.downloadsGate')
    expect(schemaOf(product).settings.length).toBeLessThanOrEqual(25)
  })

  it('new settings live on the element details and downloads blocks, unique and valid', () => {
    for (const src of [details, downloads]) {
      const s = schemaOf(src).settings
      const ids = s.filter((x) => x.id).map((x) => x.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(s.length).toBeLessThanOrEqual(25)
      for (const x of s) if (x.options) expect(x.options.map((o) => o.value)).toContain(x.default)
    }
    expect(schemaOf(details).settings.find((s) => s.id === 'quote')!.default).toBe('off')
    expect(details).toContain("'ifcvo-quote.js' | asset_url")
  })

  it('companion events reach ifcvo-events.js on the viewer root', () => {
    const events = read('assets/ifcvo-events.js')
    expect(events).toContain("'ifcvo:download'")
    expect(events).toContain("'ifcvo:quote'")
  })
})
