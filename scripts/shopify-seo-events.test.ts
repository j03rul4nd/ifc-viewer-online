// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS asset without types
import { EVENTS, bindAll, fileName, publish, sanitize } from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-events.js'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
/** Readable sources (blocks/, snippets/, full locales/); the extension gets compact copies. */
const SRC = path.resolve(__dirname, '../integrations/shopify')
const read = (p: string) => fs.readFileSync(path.join(EXT, p), 'utf8')

/** Crude Liquid stand-in: loops run once, output tags become JSON strings, tags vanish. */
function fakeRender(src: string): string {
  return src
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
    .replace(/\{%-?\s*liquid[\s\S]*?-?%\}/, '')
    .replace(/\{%-?\s*unless forloop\.first\s*-?%\},\{%-?\s*endunless\s*-?%\}/g, '')
    .replace(/\{%-?\s*if ifcvo_sep != ''\s*-?%\},\{%-?\s*endif\s*-?%\}/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '"x"')
    .replace(/\{%[\s\S]*?%\}/g, '')
}

describe('ifcvo-jsonld snippet', () => {
  const src = read('snippets/ifcvo-jsonld.liquid')
  const blocks = [...fakeRender(src).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))

  it('renders two parseable JSON-LD blocks', () => { expect(blocks).toHaveLength(2) })
  it('describes the model as a 3DModel with required keys', () => {
    const m = blocks[0]
    expect(m['@context']).toBe('https://schema.org')
    expect(m['@type']).toBe('3DModel')
    for (const k of ['@id', 'name', 'encodingFormat', 'contentUrl', 'about']) expect(m).toHaveProperty(k)
    expect(m.encodingFormat).toBe('application/x-step')
    expect(Object.keys(m.about)).toEqual(['@id'])
  })
  it('never prints a second full Product: the spec node only adds properties by @id', () => {
    const p = blocks[1]
    expect(p['@type']).toBe('Product')
    expect(Object.keys(p).sort()).toEqual(['@context', '@id', '@type', 'additionalProperty', 'subjectOf'])
    expect(p.additionalProperty[0]).toEqual({ '@type': 'PropertyValue', name: 'x', value: 'x' })
  })
  it('product augmentation is opt-in and every output value is json-escaped', () => {
    expect(src).toMatch(/if augment and/)
    const outputs = src.replace(/\{%-?\s*comment[\s\S]*?endcomment\s*-?%\}/, '').match(/\{\{[\s\S]*?\}\}/g) || []
    expect(outputs.length).toBeGreaterThan(0)
    for (const o of outputs) expect(o).toMatch(/\|\s*json\s*\}\}$/)
  })
})

describe('ifcvo-noscript snippet', () => {
  const src = read('snippets/ifcvo-noscript.liquid')
  it('wraps everything in noscript with alt text, link and spec table', () => {
    expect(src).toMatch(/<noscript>[\s\S]*<\/noscript>/)
    expect(src).toMatch(/alt="\{\{ ifcvo_alt \| escape \}\}"/)
    expect(src).toMatch(/<table class="ifcvo-specs">/)
    expect(src).toMatch(/download rel="noopener"/)
  })
  it('escapes every output', () => {
    const body = src.replace(/\{%-?\s*comment[\s\S]*?endcomment\s*-?%\}/, '')
    for (const o of body.match(/\{\{[\s\S]*?\}\}/g) || []) expect(o).toMatch(/\|\s*(escape|image_url: width: \d+)\s*\}\}$/)
  })
})

describe('ifcvo-events', () => {
  let calls: Array<[string, unknown]>
  beforeEach(() => {
    calls = []
    ;(window as any).Shopify = { analytics: { publish: (n: string, d: unknown) => calls.push([n, d]) } }
    document.body.innerHTML = ''
  })

  it('fileName strips host, path and query tokens', () => {
    expect(fileName('https://cdn.shopify.com/s/files/1/beam%20A.ifc?v=1&token=secret#x')).toBe('beam A.ifc')
    expect(fileName('')).toBeUndefined()
    expect(fileName(42)).toBeUndefined()
  })
  it('sanitize keeps only whitelisted, short, primitive fields', () => {
    const out = sanitize({ file: 'a.ifc', email: 'a@b.c', customerId: 7, ms: 12, code: 'x'.repeat(500), elements: NaN, productId: { a: 1 } })
    expect(out).toEqual({ file: 'a.ifc', ms: 12, code: 'x'.repeat(120) })
  })
  it('publish only sends known events and survives a missing Shopify object', () => {
    expect(publish('ifcvo_download', { file: 'a.ifc' })).toBe(true)
    expect(publish('page_viewed', {})).toBe(false)
    delete (window as any).Shopify
    expect(publish('ifcvo_download', {})).toBe(false)
    expect(calls).toEqual([['ifcvo_download', { file: 'a.ifc' }]])
    expect(EVENTS).toHaveLength(5)
  })
  it('bindAll wires downloads, quotes, load and error once per root', () => {
    document.body.innerHTML = `<div data-ifcvo-viewer data-model="https://x.test/m.ifc?sig=1" data-product-id="9">
      <a class="ifcvo-download" href="https://x.test/files/m.ifc?sig=abc">d</a>
      <button data-ifcvo-quote>q</button></div>`
    bindAll(document); bindAll(document)
    const root = document.querySelector('[data-ifcvo-viewer]')!
    ;(root.querySelector('a') as HTMLElement).click()
    ;(root.querySelector('button') as HTMLElement).click()
    root.dispatchEvent(new CustomEvent('ifcvo:loaded', { detail: { elements: 120, ms: 900, email: 'leak@x' } }))
    root.dispatchEvent(new CustomEvent('ifcvo:error', { detail: { code: 'timeout' } }))
    expect(calls.map((c) => c[0])).toEqual(['ifcvo_download', 'ifcvo_quote_click', 'ifcvo_model_loaded', 'ifcvo_error'])
    expect(calls[0][1]).toEqual({ file: 'm.ifc', productId: '9' })
    expect(calls[2][1]).toEqual({ file: 'm.ifc', productId: '9', elements: 120, ms: 900 })
    expect(calls[3][1]).toMatchObject({ code: 'timeout' })
    expect(JSON.stringify(calls)).not.toMatch(/sig|leak|https?:/)
  })
  it('model_viewed fires once when half visible', () => {
    let cb: (e: Array<{ isIntersecting: boolean }>) => void = () => {}
    const disconnect = vi.fn()
    ;(window as any).IntersectionObserver = class { constructor(f: typeof cb) { cb = f } observe() {} disconnect() { disconnect() } }
    document.body.innerHTML = '<div data-ifcvo-viewer data-model="https://x.test/v.ifc"></div>'
    bindAll(document)
    cb([{ isIntersecting: true }])
    expect(calls).toEqual([['ifcvo_model_viewed', { file: 'v.ifc' }]])
    expect(disconnect).toHaveBeenCalled()
    delete (window as any).IntersectionObserver
  })
})
