// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS asset without types
import * as share from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-share.js'
// @ts-expect-error plain JS asset without types
import { decodeCamera } from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-variants.js'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const SRC = path.resolve(__dirname, '../integrations/shopify')
const CAM = { position: [1.23456, 2, 3], target: [0, 0.5, -1] }

describe('parseHash', () => {
  it('reads every part of a shared view and an after-sale link', () => {
    const s = share.parseHash('#ifcvo-open=1&ifcvo-v=2.1&ifcvo-cam=1,2,3,4,5,6&ifcvo-sel=m1~42&ifcvo-lvl=3')
    expect(s).toEqual({ open: true, version: '2.1', camera: { position: [1, 2, 3], target: [4, 5, 6] }, selection: { modelId: 'm1', expressId: 42 }, level: 3, view: null, review: false })
    expect(share.wantsViewer(s)).toBe(true)
  })

  it('ignores malformed input', () => {
    const bad = [
      '', '#', '#ifcvo-open=0', '#ifcvo-open=yes', '#ifcvo-cam=1,2,3', '#ifcvo-cam=1,2,3,4,5,NaN', '#ifcvo-cam=1,2,3,4,5,', '#ifcvo-cam=1e20,0,0,0,0,0',
      '#ifcvo-sel=m1~0', '#ifcvo-sel=m1~abc', '#ifcvo-sel=<x>~1', '#ifcvo-sel=m1~99999999999', '#ifcvo-lvl=-1', '#ifcvo-lvl=1.5', '#ifcvo-lvl=10000',
      '#ifcvo-v=%E0%A4%A', '#ifcvo-cam=%E0%A4%A', '#=1&&&', '#ifcvo-open=1'.padEnd(3000, 'x'),
    ]
    for (const h of bad) {
      const s = share.parseHash(h)
      expect(s.camera, h).toBeNull()
      expect(s.selection, h).toBeNull()
      expect(s.level, h).toBeNull()
      expect(s.version, h).toBeNull()
      expect(s.open, h).toBe(false)
    }
    expect(share.parseHash('#ifcvo-open=1&ifcvo-v=%3Cscript%3E').version).toBeNull()
    expect(share.parseHash(null as unknown as string).open).toBe(false)
    expect(share.wantsViewer(share.parseHash('#other=1'))).toBe(false)
  })
})

describe('shareLink', () => {
  it('round-trips camera, selection and storey, keeps the camera format of the variant views', () => {
    const link = share.shareLink('https://shop.example/products/a?variant=5#ifcvo-open=1&ifcvo-v=2&keep=1&ifcvo-cam=9,9,9,9,9,9',
      { camera: CAM, selection: { modelId: 'm-1', expressId: 7 }, level: 2 })
    const url = new URL(link)
    expect(url.searchParams.get('utm_source')).toBe('ifc_share')
    expect(url.searchParams.get('variant')).toBe('5')
    expect(url.hash).toBe('#keep=1&ifcvo-cam=1.235,2,3,0,0.5,-1&ifcvo-sel=m-1~7&ifcvo-lvl=2')
    const back = share.parseHash(url.hash)
    expect(back.camera).toEqual({ position: [1.235, 2, 3], target: [0, 0.5, -1] })
    expect(back.selection).toEqual({ modelId: 'm-1', expressId: 7 })
    expect(back.level).toBe(2)
    expect(back.open).toBe(false)
    expect(decodeCamera(url.hash)).toEqual(back.camera)
    expect(link.length).toBeLessThan(2048)
  })

  it('drops what cannot be encoded and refuses an unreadable camera or a too long link', () => {
    expect(share.shareLink('https://s.example/p', { camera: CAM, selection: { modelId: '', expressId: 3 }, level: -1 })).toBe('https://s.example/p?utm_source=ifc_share#ifcvo-cam=1.235,2,3,0,0.5,-1')
    expect(share.shareLink('https://s.example/p', { camera: { position: [1, 2] } })).toBeNull()
    expect(share.shareLink('not a url', { camera: CAM })).toBeNull()
    expect(share.shareLink('https://s.example/p?q=' + 'x'.repeat(2100), { camera: CAM })).toBeNull()
  })
})

describe('isUpdated', () => {
  it('only when both versions are known and differ', () => {
    expect(share.isUpdated('2.1', '2.2')).toBe(true)
    expect(share.isUpdated('2.1', ' 2.1 ')).toBe(false)
    expect(share.isUpdated('2.1', '')).toBe(false)
    expect(share.isUpdated(null, '2')).toBe(false)
  })
})

describe('applyState', () => {
  it('restores storey, selection and camera, each on its own', async () => {
    const v = { addSection: vi.fn(async () => { throw new Error('no storey') }), select: vi.fn(), lookAt: vi.fn(async () => {}) }
    const ok = await share.applyState(v, share.parseHash('#ifcvo-cam=1,2,3,4,5,6&ifcvo-sel=m~9&ifcvo-lvl=1'))
    expect(ok).toBe(true)
    expect(v.addSection).toHaveBeenCalledWith({ level: 1 })
    expect(v.select).toHaveBeenCalledWith(9, 'm')
    expect(v.lookAt).toHaveBeenCalledWith([1, 2, 3], [4, 5, 6], false)
    expect(await share.applyState(null, {})).toBe(false)
  })
})

type Listener = (type: string, e?: unknown) => void
function page(hash: string, version = '') {
  share._reset()
  document.body.innerHTML = `<div class="ifcvo-product" data-ifcvo-viewer data-locale="en" data-ifcvo-version="${version}" data-product-id="1">
    <div class="ifcvo-stage"></div><p class="ifcvo-status" role="status"></p></div>`
  history.replaceState(null, '', '/products/a' + hash)
  const subs: Listener[] = []
  const viewer = { whenReady: vi.fn(async () => {}), getCamera: vi.fn(async () => CAM), lookAt: vi.fn(async () => {}), select: vi.fn(), addSection: vi.fn(async () => {}) }
  const api = { viewer: null as unknown, open: vi.fn(async () => { api.viewer = viewer; return viewer }), subscribe: (_r: unknown, cb: Listener) => { subs.push(cb) } }
  ;(window as unknown as { IFCVO: unknown }).IFCVO = api
  ;(Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn()
  return { api, viewer, subs, root: document.querySelector('[data-ifcvo-viewer]') as HTMLElement }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('page wiring', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }))) })

  it('#ifcvo-open=1 opens the viewer at once, scrolls to it and flags a newer model', async () => {
    const { api, root } = page('#ifcvo-open=1&ifcvo-v=2.1', '2.2')
    share.init()
    await tick()
    expect(api.open).toHaveBeenCalledTimes(1)
    expect(root.scrollIntoView).toHaveBeenCalled()
    expect(root.querySelector('.ifcvo-updated')?.textContent).toBe('Updated since your purchase')
  })

  it('no note when the version matches, no auto-open without the hash', async () => {
    let p = page('#ifcvo-open=1&ifcvo-v=2.2', '2.2')
    share.init(); await tick()
    expect(p.root.querySelector('.ifcvo-updated')).toBeNull()
    p = page('', '2.2')
    share.init(); await tick()
    expect(p.api.open).not.toHaveBeenCalled()
    p = page('#ifcvo-open=banana', '')
    share.init(); await tick()
    expect(p.api.open).not.toHaveBeenCalled()
  })

  it('a shared link opens the viewer and restores the view on model-loaded', async () => {
    const { api, viewer, subs } = page('#ifcvo-cam=1,2,3,4,5,6&ifcvo-sel=m~9&ifcvo-lvl=0')
    share.init(); await tick()
    expect(api.open).toHaveBeenCalled()
    subs.forEach((cb) => cb('model-loaded'))
    await tick(); await tick()
    expect(viewer.addSection).toHaveBeenCalledWith({ level: 0 })
    expect(viewer.select).toHaveBeenCalledWith(9, 'm')
    expect(viewer.lookAt).toHaveBeenCalledWith([1, 2, 3], [4, 5, 6], false)
  })

  it('the share button is accessible and copies camera, selection and storey (copy fallback, then manual field)', async () => {
    const { subs, root } = page('')
    const publish = vi.fn()
    ;(window as unknown as { Shopify: unknown }).Shopify = { analytics: { publish } }
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    share.init(); await tick()
    const button = root.querySelector('.ifcvo-share-button') as HTMLButtonElement
    expect(button.tagName).toBe('BUTTON')
    expect(button.textContent).toBe('Share this view')
    expect(root.querySelector('.ifcvo-share-status')?.getAttribute('role')).toBe('status')
    subs.forEach((cb) => cb('element-selected', { expressId: 12, modelId: 'mod' }))
    document.dispatchEvent(new CustomEvent('ifcvo:storey', { detail: { index: 1 } }))
    button.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled())
    const link = writeText.mock.calls[0][0] as string
    expect(link).toContain('utm_source=ifc_share')
    expect(link).toContain('#ifcvo-cam=1.235,2,3,0,0.5,-1&ifcvo-sel=mod~12&ifcvo-lvl=1')
    expect(publish).toHaveBeenCalledWith('ifc_view_shared', expect.anything())
    await vi.waitFor(() => expect(root.querySelector('.ifcvo-share-status')?.textContent).toMatch(/copied/))

    writeText.mockRejectedValueOnce(new Error('denied'))
    button.click()
    const field = root.querySelector('.ifcvo-share-link') as HTMLInputElement
    await vi.waitFor(() => expect(field.hidden).toBe(false))
    expect(field.getAttribute('aria-label')).toBe('Copy this link:')
    expect(field.value).toContain('ifcvo-cam=')
  })

  it('uses the Web Share API where available', async () => {
    const { root } = page('')
    const shareFn = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: shareFn, configurable: true })
    share.init(); await tick()
    ;(root.querySelector('.ifcvo-share-button') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(shareFn).toHaveBeenCalled())
    expect((shareFn.mock.calls[0] as unknown as [{ url: string }])[0].url).toContain('ifcvo-cam=')
    delete (navigator as unknown as { share?: unknown }).share
  })
})

describe('translations', () => {
  it('loads the store language from ifcvo-i18n-<lang>.json, none for English', async () => {
    const es = JSON.parse(fs.readFileSync(path.join(EXT, 'assets/ifcvo-i18n-es.json'), 'utf8'))
    const fetchMock = vi.fn(async (_u: URL) => ({ ok: true, json: async () => es }))
    vi.stubGlobal('fetch', fetchMock)
    const { root } = page('')
    root.dataset.locale = 'es-ES'
    share.init(); await tick(); await tick()
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/ifcvo-i18n-es\.json$/)
    await vi.waitFor(() => expect(root.querySelector('.ifcvo-share-button')?.textContent).toBe(es.share.share))
    vi.unstubAllGlobals()
  })
})

describe('shipping', () => {
  it('the runtime loads the share module, planview reports the storey, texts exist in every language', () => {
    expect(fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')).toContain("import('./ifcvo-share.js')")
    expect(fs.readFileSync(path.join(EXT, 'assets/ifcvo-planview.js'), 'utf8')).toContain("'ifcvo:storey'")
    for (const f of fs.readdirSync(path.join(EXT, 'assets')).filter((x) => /^ifcvo-i18n-.*\.json$/.test(x))) {
      const j = JSON.parse(fs.readFileSync(path.join(EXT, 'assets', f), 'utf8'))
      expect(Object.keys(j.share).sort(), f).toEqual(['copied', 'error', 'manual', 'share', 'shared', 'updated'])
    }
    expect(fs.readFileSync(path.join(SRC, 'blocks/product-ifc-viewer.liquid'), 'utf8')).toContain('data-ifcvo-version=')
  })
})
