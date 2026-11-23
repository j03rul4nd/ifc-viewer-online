// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS asset without types
import * as vv from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-variants.js'
// @ts-expect-error plain JS asset without types
import * as shared from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-variant.js'
// @ts-expect-error plain JS asset without types
import * as planset from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-planset.js'
import * as plansShared from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-variant.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
/** Readable sources (blocks/, snippets/, full locales/); the extension gets compact copies. */
const SRC = path.resolve(__dirname, '../integrations/shopify')
const block = fs.readFileSync(path.join(SRC, 'blocks/ifc-variant-views.liquid'), 'utf8')
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')
const locales = JSON.parse(fs.readFileSync(path.join(SRC, 'locales/en.default.json'), 'utf8'))
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const body = block.replace(/\{% schema %\}[\s\S]*$/, '').replace(/\{% comment %\}[\s\S]*?\{% endcomment %\}/g, '')

const GUID = '3vB2YO$MX4xv5uCqZZG05x'
type Listener = (type: string, e?: unknown) => void

function fakeViewer() {
  return {
    whenReady: vi.fn(async () => {}),
    setView: vi.fn(),
    lookAt: vi.fn(async () => {}),
    openScene: vi.fn(async () => {}),
    showAll: vi.fn(),
    isolate: vi.fn(),
    select: vi.fn(),
    hideElements: vi.fn(),
    showElements: vi.fn(),
    findElements: vi.fn(async (_q: { ifcClass?: string[]; globalId?: string[] }) => [] as { expressId: number; modelId: string; ifcClass: string }[]),
    getCamera: vi.fn(async () => ({ position: [1.23456, 2, 3], target: [0, 0, 0], direction: [0, 0, 1], fovDeg: 50 })),
    screenshot: vi.fn(async () => 'data:image/png;base64,AAAA'),
  }
}

let subs: Listener[] = []
function setApi(viewer: unknown, plan = 'business') {
  subs = []
  ;(window as unknown as { IFCVO: unknown }).IFCVO = {
    viewer,
    open: vi.fn(async () => viewer),
    subscribe: (_root: unknown, cb: Listener) => { subs.push(cb) },
    unsubscribe: (cb: Listener) => { subs = subs.filter((x) => x !== cb) },
    gate: (f: string) => plan !== 'free' || FEATURE_TIERS[f as keyof typeof FEATURE_TIERS] === 'free',
  }
}

const MAP = { '11': { view: 'top', highlight: null }, '22': { view: { position: [5, 5, 5], target: [0, 1, 0] }, highlight: 'IfcBeam' } }

function mount(map: object = MAP, current = '11'): HTMLElement {
  document.body.innerHTML = `
  <form action="/cart/add"><input name="id" value="${current}"></form>
  <div data-ifcvo-variants data-views='${JSON.stringify(map)}' data-current="${current}" data-filename="chair"
    data-l-copied="Copied" data-l-copy-manual="Copy this" data-l-saved="Saved" data-l-error="Err">
    <div data-ifcvo-variants-body><button data-ifcvo-copy-view>Copy</button><button data-ifcvo-save-image>Image</button></div>
    <input data-ifcvo-view-link hidden><p data-ifcvo-variants-status role="status"></p>
  </div>`
  return document.querySelector('[data-ifcvo-variants]') as HTMLElement
}

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)) }

beforeEach(() => { vv._reset(); history.replaceState(null, '', '/products/chair') })

describe('parsing', () => {
  it('reads presets, cameras and scenes; rejects junk', () => {
    expect(vv.parseView('top')).toEqual({ kind: 'preset', view: 'top' })
    expect(vv.parseView('{"view":"ISO"}')).toEqual({ kind: 'preset', view: 'iso' })
    expect(vv.parseView({ position: { x: 1, y: 2, z: 3 }, target: [0, 0, 0] })).toEqual({ kind: 'camera', position: [1, 2, 3], target: [0, 0, 0] })
    expect(vv.parseView({ scene: 'https://x/s.scene.json' })).toEqual({ kind: 'scene', url: 'https://x/s.scene.json' })
    expect(vv.parseView({ scene: 'javascript:alert(1)' })).toBeNull()
    expect(vv.parseView('sideways')).toBeNull()
    expect(vv.parseView({ position: [1, 'a', 3], target: [0, 0, 0] })).toBeNull()
  })

  it('reads highlights as classes and GlobalIds', () => {
    expect(vv.parseHighlight('IfcBeam, IfcColumn')).toEqual({ classes: ['IfcBeam', 'IfcColumn'], guids: [], mode: 'isolate' })
    expect(vv.parseHighlight([GUID])).toEqual({ classes: [], guids: [GUID], mode: 'isolate' })
    expect(vv.parseHighlight({ guids: [GUID, 'bad'], mode: 'select' })).toEqual({ classes: [], guids: [GUID], mode: 'select' })
    expect(vv.parseHighlight('<script>')).toBeNull()
  })

  it('drops unreadable map entries', () => {
    expect(Object.keys(vv.readMap(JSON.stringify({ ...MAP, abc: { view: 'top' }, '33': { view: 'nope' } })))).toEqual(['11', '22'])
    expect(vv.readMap('not json')).toEqual({})
  })

  it('round-trips the camera through the URL hash and keeps other hash parts', () => {
    const link = vv.viewLink('https://s/p?variant=2#reviews', { position: [1.23456, 2, 3], target: [0, 0, 0] })
    expect(link).toBe('https://s/p?variant=2#reviews&ifcvo-cam=1.235,2,3,0,0,0')
    expect(vv.decodeCamera(new URL(link!).hash)).toEqual({ position: [1.235, 2, 3], target: [0, 0, 0] })
    expect(vv.decodeCamera('#ifcvo-cam=1,2')).toBeNull()
  })
})

describe('applying to the viewer', () => {
  it('isolates classes + GUIDs without scanning the whole model, cached per variant', async () => {
    const v = fakeViewer()
    v.findElements.mockImplementation(async (q: { ifcClass?: string[]; globalId?: string[] }) => {
      if (q.globalId) return [{ expressId: 1, modelId: 'm', ifcClass: 'IFCPLATE' }]
      if (q.ifcClass?.includes('IfcBeam')) return [{ expressId: 5, modelId: 'm', ifcClass: 'IFCBEAM' }, { expressId: 6, modelId: 'm', ifcClass: 'IFCCOLUMN' }]
      if (q.ifcClass?.includes('IFCPLATE')) return [{ expressId: 1, modelId: 'm', ifcClass: 'IFCPLATE' }, { expressId: 2, modelId: 'm', ifcClass: 'IFCPLATE' }]
      return []
    })
    const h = { classes: ['IfcBeam', 'IfcColumn'], guids: [GUID], mode: 'isolate' }
    await vv.applyHighlight(v, h, '22')
    expect(v.findElements.mock.calls.every(([q]) => q && (q.ifcClass || q.globalId))).toBe(true)
    expect(v.isolate).toHaveBeenCalledWith('IfcBeam', { frame: false })
    expect(v.showElements).toHaveBeenCalledWith([6, 1], 'm')
    expect(v.hideElements).toHaveBeenCalledWith([2], 'm')
    const calls = v.findElements.mock.calls.length
    await vv.applyHighlight(v, h, '22')
    expect(v.findElements.mock.calls.length).toBe(calls)
  })

  it('a malformed hash is ignored and the variant view still applies', async () => {
    expect(vv.decodeCamera('#ifcvo-cam=%E0')).toBeNull()
    history.replaceState(null, '', '/products/chair#ifcvo-cam=%E0')
    const v = fakeViewer()
    setApi(v)
    mount()
    vv.init()
    await flush()
    expect(v.setView).toHaveBeenCalledWith('top')
    expect(v.lookAt).not.toHaveBeenCalled()
  })

  it('destroy() removes its viewer listener', () => {
    const v = fakeViewer()
    setApi(v)
    const root = mount()
    vv.init()
    expect(subs).toHaveLength(1)
    vv.destroy(document.body)
    expect(subs).toHaveLength(0)
    expect(root.isConnected).toBe(true)
  })

  it('applies the current variant on model ready and the new one on change', async () => {
    const v = fakeViewer()
    setApi(v)
    const root = mount()
    vv.init()
    await flush()
    expect(v.setView).toHaveBeenCalledWith('top')
    ;(document.querySelector('[name="id"]') as HTMLInputElement).value = '22'
    document.dispatchEvent(new CustomEvent('variant:change', { detail: { variant: { id: 22 } } }))
    await new Promise((r) => setTimeout(r, 80))
    await flush()
    expect(v.isolate).toHaveBeenCalledWith('IfcBeam', { frame: false })
    expect(v.lookAt).toHaveBeenCalledWith([5, 5, 5], [0, 1, 0], true)
    // A new model (variant with another file) reapplies the view.
    v.setView.mockClear()
    ;(document.querySelector('[name="id"]') as HTMLInputElement).value = '11'
    root.dataset.current = '11'
    subs.forEach((cb) => cb('model-loaded'))
    await flush()
    expect(v.setView).toHaveBeenCalledWith('top')
  })

  it('a shared link restores its camera over the variant view', async () => {
    history.replaceState(null, '', '/products/chair#ifcvo-cam=9,8,7,1,2,3')
    const v = fakeViewer()
    setApi(v)
    mount()
    vv.init()
    await flush()
    expect(v.lookAt).toHaveBeenLastCalledWith([9, 8, 7], [1, 2, 3], false)
  })

  it('copies a link with the camera and saves a PNG', async () => {
    const v = fakeViewer()
    setApi(v)
    const root = mount()
    const write = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    vv.init()
    ;(root.querySelector('[data-ifcvo-copy-view]') as HTMLButtonElement).click()
    await flush()
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/#ifcvo-cam=1\.235,2,3,0,0,0$/))
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Copied')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    ;(root.querySelector('[data-ifcvo-save-image]') as HTMLButtonElement).click()
    await flush()
    expect(v.screenshot).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Saved')
    click.mockRestore()
  })

  it('falls back to a visible field when the clipboard is refused', async () => {
    const v = fakeViewer()
    setApi(v)
    const root = mount()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('no') } }, configurable: true })
    vv.init()
    ;(root.querySelector('[data-ifcvo-copy-view]') as HTMLButtonElement).click()
    await flush()
    const field = root.querySelector('[data-ifcvo-view-link]') as HTMLInputElement
    expect(field.hidden).toBe(false)
    expect(field.value).toMatch(/ifcvo-cam=/)
  })

  it('does nothing on the free plan', async () => {
    const v = fakeViewer()
    setApi(v, 'free')
    mount()
    vv.init()
    await flush()
    expect(v.setView).not.toHaveBeenCalled()
  })
})

describe('shared resolver', () => {
  it('planset re-exports the shared readers', () => {
    // Each extension ships its own copy of ifcvo-variant.js; planset uses the one beside it.
    expect(planset.selectedVariant).toBe(plansShared.selectedVariant)
    expect(planset.urlVariant).toBe(plansShared.urlVariant)
    expect(shared.urlVariant({ search: '?variant=7' })).toBe('7')
  })

  it('patches history once for every block, idempotently', () => {
    const patched = history.pushState
    const a = vi.fn()
    const b = vi.fn()
    const offA = shared.onUrlChange(a)
    const offB = shared.onUrlChange(b)
    expect(history.pushState).toBe(patched)
    history.pushState(null, '', '?variant=9')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA(); offB()
    history.replaceState(null, '', location.pathname)
    expect(a).toHaveBeenCalledTimes(1)
    expect((window as unknown as { __ifcvoUrlSubs: Set<unknown> }).__ifcvoUrlSubs).toBeInstanceOf(Set)
  })
})

describe('ifc-variant-views block (Liquid)', () => {
  it('has a valid schema: unique ids, ≤ 25 settings, section target', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
  })

  it('escapes every output', () => {
    const outs = [...body.matchAll(/\{\{-?\s*([^}]*?)\s*-?\}\}/g)].map((m) => m[1])
    const unsafe = outs.filter((o) => !/\| escape/.test(o)
      && !/^(block\.shopify_attributes|ifcvo_style|s\.accent|s\.radius|'[\w.-]+' \| asset_url.*)$/.test(o))
    expect(unsafe).toEqual([])
  })

  it('is a starter feature, in the runtime table, with labels', () => {
    expect(FEATURE_TIERS.variantviews).toBe('starter')
    expect(runtime).toContain('"variantviews":"starter"')
    for (const k of ['copy', 'image', 'copied', 'manual', 'saved', 'error', 'link']) expect(locales.ifcvo.variantviews[k]).toBeTruthy()
    for (const m of body.matchAll(/'ifcvo\.variantviews\.(\w+)' \| t/g)) expect(locales.ifcvo.variantviews[m[1]]).toBeTruthy()
  })

  it('status texts: data-l-*, then shop labels, then the theme language, else English', () => {
    expect(body).toContain('data-i18n="variantviews"')
    const root = document.createElement('div')
    expect(vv.statusText(root, 'lSaved')).toBe('Image saved.')
    root.dataset.labels = JSON.stringify({ saved: 'Imagen guardada.' })
    expect(vv.statusText(root, 'lSaved')).toBe('Imagen guardada.')
    root.dataset.locale = 'es'
    root.dataset.ifcvoLabels = JSON.stringify({ es: { variantviews_saved: 'Guardada' } })
    expect(vv.statusText(root, 'lSaved')).toBe('Guardada')
    root.dataset.lSaved = 'OK'
    expect(vv.statusText(root, 'lSaved')).toBe('OK')
  })

  it('buttons are real buttons and the status is announced', () => {
    expect(body).toMatch(/<button type="button"[^>]*data-ifcvo-copy-view/)
    expect(body).toMatch(/role="status"/)
    expect(body).toMatch(/aria-label="\{\{ l_link \| escape \}\}"/)
  })
})
