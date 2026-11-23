// T-325 G3: ROI custom pixel (integrations/shopify/app/pixel/ifcvo-roi-pixel.js)
// run in a fake Shopify custom-pixel sandbox, plus the diagnostics "pixel detected" row.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const pixelPath = path.resolve(__dirname, '../integrations/shopify/app/pixel/ifcvo-roi-pixel.js')
const code = fs.readFileSync(pixelPath, 'utf8')
const diagPath = '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-diagnostics.js'

type Handler = (e: unknown) => Promise<void> | void
type Sent = { name: string; params: Record<string, unknown> }

function sandbox() {
  const handlers = new Map<string, Handler[]>()
  const store = new Map<string, string>()
  const cookies: string[] = []
  const sent: Sent[] = []
  const meta: Sent[] = []
  const ctx: Record<string, unknown> = {
    analytics: { subscribe: (n: string, h: Handler) => handlers.set(n, [...(handlers.get(n) || []), h]) },
    browser: {
      sessionStorage: {
        getItem: async (k: string) => store.get(k) ?? null,
        setItem: async (k: string, v: string) => { store.set(k, v) },
      },
      cookie: { set: async (c: string) => { cookies.push(c) } },
    },
    gtag: (_t: string, name: string, params: Record<string, unknown>) => sent.push({ name, params }),
    fbq: (_t: string, name: string, params: Record<string, unknown>) => meta.push({ name, params }),
  }
  vm.createContext(ctx)
  vm.runInContext(code, ctx)
  const emit = async (name: string, event: unknown) => { for (const h of handlers.get(name) || []) await h(event) }
  return { handlers, emit, sent, meta, cookies, store }
}

const cart = {
  data: { cartLine: { quantity: 2, cost: { totalAmount: { amount: 40, currencyCode: 'EUR' } }, merchandise: { id: 'gid://shopify/ProductVariant/2', product: { id: 'gid://shopify/Product/1', title: 'Beam' } } } },
  clientId: 'c-123',
}
const checkout = {
  data: { checkout: { email: 'buyer@example.com', phone: '+34600000000', shippingAddress: { address1: 'Street 1' }, totalPrice: { amount: 80, currencyCode: 'EUR' },
    lineItems: [{ quantity: 1, variant: { id: 'v1', product: { id: 'p1' } } }] } },
}
const PII = /@|buyer|\+34|street|address|email|phone|clientId|c-123/i

describe('ROI pixel in a fake custom-pixel sandbox', () => {
  it('subscribes to ifcvo_* plus add-to-cart and purchase', () => {
    const { handlers } = sandbox()
    for (const n of ['ifcvo_model_viewed', 'ifcvo_model_loaded', 'ifcvo_download', 'ifcvo_quote_click', 'ifcvo_error', 'product_added_to_cart', 'checkout_completed']) {
      expect(handlers.has(n), n).toBe(true)
    }
  })

  it('add_to_cart without opening a model carries ifcvo_opened_model=false', async () => {
    const s = sandbox()
    await s.emit('product_added_to_cart', cart)
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0].name).toBe('add_to_cart')
    expect(s.sent[0].params.ifcvo_opened_model).toBe(false)
    expect(s.sent[0].params.value).toBe(40)
  })

  it('opening a model then adding to cart carries ifcvo_opened_model=true', async () => {
    const s = sandbox()
    await s.emit('ifcvo_model_loaded', { customData: { file: 'beam.ifc', productId: '1' } })
    await s.emit('product_added_to_cart', cart)
    const atc = s.sent.find((e) => e.name === 'add_to_cart')!
    expect(atc.params.ifcvo_opened_model).toBe(true)
    expect(s.sent[0].params.ifcvo_opened_model).toBe(true)
  })

  it('only viewing (scrolling past) does not count as opening', async () => {
    const s = sandbox()
    await s.emit('ifcvo_model_viewed', { customData: { file: 'a.ifc' } })
    await s.emit('product_added_to_cart', cart)
    expect(s.sent.at(-1)!.params.ifcvo_opened_model).toBe(false)
  })

  it('purchase carries the flag and no personal data', async () => {
    const s = sandbox()
    await s.emit('ifcvo_download', { customData: { file: 'a.ifc', email: 'x@y.z' } })
    await s.emit('product_added_to_cart', cart)
    await s.emit('checkout_completed', checkout)
    const buy = s.sent.find((e) => e.name === 'purchase')!
    expect(buy.params.ifcvo_opened_model).toBe(true)
    expect(buy.params.value).toBe(80)
    for (const e of s.sent) expect(JSON.stringify(e.params), e.name).not.toMatch(PII)
  })

  it('leaves the "pixel detected" cookie and forwards nothing to Meta unless enabled', async () => {
    const s = sandbox()
    await s.emit('ifcvo_model_viewed', { customData: {} })
    expect(s.cookies[0]).toMatch(/^_ifcvo_px=\d+;/)
    expect(s.meta).toHaveLength(0)
  })

  it('survives missing gtag and storage errors', async () => {
    const s = sandbox()
    const ctx = { analytics: { subscribe: (n: string, h: Handler) => s.handlers.set(n, [h]) }, browser: { sessionStorage: { getItem: async () => { throw new Error('x') }, setItem: async () => { throw new Error('x') } }, cookie: { set: () => { throw new Error('x') } } } }
    vm.createContext(ctx)
    vm.runInContext(code, ctx)
    await expect(s.emit('ifcvo_model_loaded', { customData: {} })).resolves.toBeUndefined()
    await expect(s.emit('product_added_to_cart', cart)).resolves.toBeUndefined()
  })

  it('is sandbox-safe: no DOM, no network, no window/top access', () => {
    const body = code.replace(/\/\/.*$/gm, '')
    expect(body).not.toMatch(/\b(document|window|top|parent|localStorage|fetch|XMLHttpRequest|sendBeacon|importScripts|eval)\b/)
    expect(body).not.toMatch(/https?:\/\//)
    expect(body).not.toMatch(/ifcvieweronline/i)
  })
})

describe('diagnostics: ROI row', () => {
  it('reports the pixel only after it left its cookie', async () => {
    const m = await import(/* @vite-ignore */ diagPath)
    expect(m.pixelSeenAt('a=1; _ifcvo_px=1000; b=2')).toBe(1000)
    expect(m.pixelSeenAt('x_ifcvo_px=5')).toBe(0)
    const missing = m.roiReport('')
    expect(missing[0].kind).toBe('warn')
    expect(missing[0].text).toMatch(/not detected/)
    const seen = m.roiReport('_ifcvo_px=1000', 1000 + 5 * 60000)
    expect(seen[0].kind).toBe('ok')
    expect(seen[0].text).toMatch(/detected \(last event 5 min ago\)/)
  })
})
