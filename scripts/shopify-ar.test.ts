// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import qrcode from 'qrcode-generator'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  labelsOf, mount, plan, platform, qrMatrix, safeUrl, sceneViewerUrl, sizeCheck, LABELS,
// @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-ar.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-ar.liquid'), 'utf8')
const js = fs.readFileSync(path.join(EXT, 'assets/ifcvo-ar.js'), 'utf8')
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const locale = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')

function ref(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  // The reference maps one char to one byte: hand it the UTF-8 bytes as chars.
  qr.addData(String.fromCharCode(...new TextEncoder().encode(text)), 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

function mountBlock(attrs: Record<string, string> = {}): HTMLElement {
  const a = { generate: 'true', 'limit-mb': '50', page: 'https://shop.example/products/cabin', title: 'Cabin', ...attrs }
  document.body.insertAdjacentHTML('beforeend', `<div data-ifcvo-ar ${Object.entries(a).map(([k, v]) => `data-${k}='${v}'`).join(' ')}><div data-ifcvo-ar-body></div></div>`)
  return document.body.lastElementChild as HTMLElement
}

beforeEach(() => { document.body.innerHTML = '' })

describe('ifc-ar block (Liquid)', () => {
  it('valid schema, ≤ 25 settings, unique ids, product template', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
    expect(schema.enabled_on.templates).toEqual(['product'])
  })

  it('escapes every value written into attributes and text', () => {
    for (const m of block.matchAll(/="\{\{\s*([^}]*?)\s*\}\}"/g)) {
      if (!/^s\.generate$|asset_url$/.test(m[1])) expect(m[1], m[1]).toMatch(/\| escape$/)
    }
    for (const m of block.matchAll(/\{\{\s*('ifcvo\.ar\.[a-z_]+' \| t[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| (escape|json)$/)
  })

  it('reads merchant metafields first, then Shopify 3D model media', () => {
    expect(block).toContain('product.metafields[ns].ar_glb')
    expect(block).toContain('product.metafields[ns].ar_usdz')
    expect(block).toMatch(/m\.media_type == 'model'/)
    expect(block.indexOf('ar_glb.value')).toBeLessThan(block.indexOf('product.media'))
  })

  it('every label key exists in en.default.json and in the JS defaults', () => {
    for (const m of block.matchAll(/'ifcvo\.ar\.([a-z_]+)'/g)) {
      expect(locale.ifcvo.ar[m[1]], m[1]).toBeTruthy()
      expect(LABELS[m[1]], m[1]).toBeTruthy()
    }
  })

  it("is gated as 'ar', starter in the plan table and the runtime copy", () => {
    expect(block).toContain('data-ifcvo-tier="ar"')
    expect(FEATURE_TIERS.ar).toBe('starter')
    expect(runtime).toMatch(/"ar":"starter"/)
  })

  it('loads no remote script or QR service', () => {
    expect(block).not.toMatch(/<script[^>]+src="https?:/)
    expect(js).not.toMatch(/import\s*\(?\s*['"]https?:/)
    expect(js).not.toMatch(/model-viewer|chart\.googleapis|api\.qrserver/)
  })
})

describe('device and source choice', () => {
  it('detects iOS (incl. iPadOS), Android, desktop', () => {
    expect(platform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
    expect(platform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios')
    expect(platform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop')
    expect(platform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android')
  })

  it('iOS: merchant USDZ, else made from the IFC', () => {
    expect(plan('ios', { usdz: 'https://cdn/x.usdz' }, true)).toEqual({ kind: 'quicklook', href: 'https://cdn/x.usdz' })
    expect(plan('ios', {}, true)).toEqual({ kind: 'quicklook-make' })
    expect(plan('ios', {}, false)).toEqual({ kind: 'none' })
    expect(plan('ios', { usdz: 'https://cdn/x.usdz' }, true, { quickLook: false })).toEqual({ kind: 'none' })
  })

  it('Android: Scene Viewer only with a hosted GLB; made-only → hosted hint', () => {
    const p = plan('android', { glb: 'https://cdn/x.glb' }, true, { title: 'Cabin', page: 'https://shop/p' })
    expect(p.kind).toBe('sceneviewer')
    expect(p.href).toMatch(/^intent:\/\/arvr\.google\.com\/scene-viewer\/1\.2\?file=https%3A%2F%2Fcdn%2Fx\.glb&mode=ar_preferred&title=Cabin#Intent;/)
    expect(p.href).toContain('S.browser_fallback_url=https%3A%2F%2Fshop%2Fp;end;')
    expect(plan('android', {}, true)).toEqual({ kind: 'hosted' })
    expect(plan('android', { glb: 'blob:https://shop/1' }, true)).toEqual({ kind: 'hosted' })
  })

  it('desktop: QR when there is anything to show', () => {
    expect(plan('desktop', {}, true).kind).toBe('qr')
    expect(plan('desktop', {}, false).kind).toBe('none')
  })

  it('only https URLs pass; protocol-relative CDN links upgrade', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('http://x/a.glb')).toBe('')
    expect(safeUrl('//cdn.shopify.com/a.glb')).toBe('https://cdn.shopify.com/a.glb')
  })

  it('refuses made models over the limit on phones only', () => {
    expect(sizeCheck(60 * 1024 * 1024, 50, LABELS, 'ios')).toBe('This model is too large for AR on a phone (60 MB).')
    expect(sizeCheck(40 * 1024 * 1024, 50, LABELS, 'ios')).toBeNull()
    expect(sizeCheck(60 * 1024 * 1024, 50, LABELS, 'desktop')).toBeNull()
  })

  it('scene viewer URL without fallback', () => {
    expect(sceneViewerUrl('https://a/b.glb', '', '')).toMatch(/action=android\.intent\.action\.VIEW;end;$/)
  })
})

describe('QR encoder', () => {
  const samples = ['https://shop.example/products/cabin', 'A', 'https://ifc-demo-store.myshopify.com/products/modular-cabin-36-m2-with-terrace?variant=45123456789012', 'https://x.example/' + 'é'.repeat(60)]
  it('matches a reference encoder module for module (same mask)', () => {
    for (const t of samples) {
      const want = ref(t)
      const mine = Array.from({ length: 8 }, (_, m) => qrMatrix(t, m) as boolean[][])
      expect(mine[0].length, t).toBe(want.length)
      expect(mine.some((m) => JSON.stringify(m) === JSON.stringify(want)), t).toBe(true)
    }
  })
  it('version 10+ (16-bit length, version info) and oversize input', () => {
    const t = 'https://shop.example/' + 'a'.repeat(200)
    const want = ref(t)
    expect(want.length).toBeGreaterThanOrEqual(57)
    expect(Array.from({ length: 8 }, (_, m) => JSON.stringify(qrMatrix(t, m))).includes(JSON.stringify(want))).toBe(true)
    expect(qrMatrix('x'.repeat(2000))).toBeNull()
  })
})

describe('mount', () => {
  it('desktop shows a QR of the page with a caption', () => {
    const r = mountBlock()
    document.body.insertAdjacentHTML('beforeend', '<div data-ifcvo-viewer></div>')
    mount(r, null, { device: 'desktop' })
    expect(r.querySelector('svg[role="img"]')!.getAttribute('aria-label')).toBe(LABELS.scan)
    expect(r.querySelector('figcaption')!.textContent).toBe(LABELS.scan)
  })

  it('gated off: nothing mounted', () => {
    const r = mountBlock()
    mount(r, { gate: () => false }, { device: 'desktop' })
    expect(r.querySelector('svg')).toBeNull()
  })

  it('Android with only a made model says AR needs a hosted file', () => {
    const r = mountBlock()
    document.body.insertAdjacentHTML('beforeend', '<div data-ifcvo-viewer></div>')
    mount(r, null, { device: 'android' })
    expect(r.textContent).toContain('hosted by the shop')
  })

  it('Android with a merchant GLB navigates to Scene Viewer', () => {
    const r = mountBlock({ glb: 'https://cdn.shopify.com/a.glb' })
    const navigate = vi.fn()
    mount(r, null, { device: 'android', navigate })
    ;(r.querySelector('button') as HTMLButtonElement).click()
    expect(navigate.mock.calls[0][0]).toMatch(/^intent:\/\/arvr\.google\.com/)
  })

  it('iOS makes a USDZ from the IFC and opens Quick Look with <a rel="ar"><img>', async () => {
    const r = mountBlock({ 'max-triangles': '1000' })
    document.body.insertAdjacentHTML('beforeend', '<div data-ifcvo-viewer></div>')
    const bytes = new ArrayBuffer(16)
    const viewer = { exportModel: vi.fn(async () => ({ bytes, sizeBytes: 16, mimeType: 'model/vnd.usdz+zip' })) }
    ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:https://shop/1'
    const clicks: HTMLAnchorElement[] = []
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this) })
    mount(r, { gate: () => true, viewer, open: async () => viewer }, { device: 'ios', quickLook: true })
    const btn = r.querySelector('button') as HTMLButtonElement
    expect(btn.textContent).toBe(LABELS.button)
    btn.click()
    await vi.waitFor(() => expect(clicks).toHaveLength(1))
    expect(viewer.exportModel).toHaveBeenCalledWith({ format: 'usdz', ar: true, maxTriangles: 1000 })
    expect(clicks[0].getAttribute('rel')).toBe('ar')
    expect(clicks[0].getAttribute('href')).toBe('blob:https://shop/1')
    expect(clicks[0].firstElementChild!.tagName).toBe('IMG')
    spy.mockRestore()
  })

  it('iOS refuses a made model over the size limit', async () => {
    const r = mountBlock({ 'limit-mb': '10' })
    document.body.insertAdjacentHTML('beforeend', '<div data-ifcvo-viewer></div>')
    const viewer = { exportModel: vi.fn(async () => ({ bytes: new ArrayBuffer(1), sizeBytes: 20 * 1024 * 1024 })) }
    mount(r, { gate: () => true, viewer }, { device: 'ios', quickLook: true })
    ;(r.querySelector('button') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(r.querySelector('[role="status"]')!.textContent).toBe('This model is too large for AR on a phone (20 MB).'))
  })

  it('labels: locale ← shop ifcvo.labels.ar ← textarea', () => {
    const r = mountBlock({ labels: JSON.stringify({ button: 'Ver en tu espacio' }), 'ifcvo-labels': JSON.stringify({ de: { ar: { scan: 'Scannen' } } }), locale: 'de', 'labels-override': 'error=Fehler' })
    expect(labelsOf(r)).toMatchObject({ button: 'Ver en tu espacio', scan: 'Scannen', error: 'Fehler' })
  })
})

beforeEach(() => { delete (window as unknown as { IFCVO?: unknown }).IFCVO })
