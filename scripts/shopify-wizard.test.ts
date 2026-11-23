// T-325 G4 + G7: theme-editor setup wizard and poster maker (assets/ifcvo-wizard.js).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const ext = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const read = (p: string): string => fs.readFileSync(path.join(ext, p), 'utf8')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = Record<string, any>
const load = async (): Promise<Mod> => import(/* @vite-ignore */ '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-wizard.js')
const loadDiag = async (): Promise<Mod> => import(/* @vite-ignore */ '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-diagnostics.js')

// Fixture profiles: what the SDK returns for a house IFC and for the BESCOF sample (one product type).
const HOUSE = {
  stats: { elementCount: 640, models: [{ categories: [
    { type: 'IfcWall', count: 120 }, { type: 'IfcSpace', count: 12 }, { type: 'IfcBuildingStorey', count: 2 },
    { type: 'IfcDoor', count: 18 }, { type: 'IfcWindow', count: 24 }, { type: 'IfcSlab', count: 10 },
  ] }] },
  data: {
    elementCount: 640, classes: [], types: new Array(40).fill({}), totals: { length: 0, area: 310, volume: 0, weight: 0 },
    rooms: { totals: { count: 12 }, storeys: [{ name: 'Ground', rooms: [1] }, { name: 'First', rooms: [1] }] },
    classifications: null, takeoff: { steel: [] },
  },
  probe: { schema: 'IFC4', app: 'Archicad 27', mb: 14.2 },
}
const BESCOF = {
  stats: { elementCount: 3, models: [{ categories: [{ type: 'IfcFurniture', count: 3 }] }] },
  data: {
    elementCount: 3, classes: [{ ifcClass: 'IfcFurniture', count: 3 }], types: [{}], totals: { length: 0, area: 0, volume: 0.4, weight: 0 },
    rooms: null, classifications: { classified: 3 }, takeoff: { steel: [] },
  },
  probe: { schema: 'IFC4', app: 'Revit', mb: 1.1 },
}
const STEEL = {
  stats: { elementCount: 500, models: [{ categories: [{ type: 'IfcBeam', count: 200 }, { type: 'IfcColumn', count: 80 }, { type: 'IfcPlate', count: 150 }, { type: 'IfcMechanicalFastener', count: 50 }, { type: 'IfcSlab', count: 20 }] }] },
  data: null,
  probe: { schema: 'IFC2X3', app: 'Tekla Structures', mb: 30 },
}

describe('wizard: profile and rules', () => {
  it('reads the house profile and suggests rooms, plan view and plan set', async () => {
    const m = await load()
    const p = m.profileFrom(HOUSE)
    expect(p).toMatchObject({ schema: 'IFC4', app: 'Archicad 27', spaces: 12, storeys: 2, elements: 640, hasQuantities: true, hasClassification: false })
    expect(p.dominant[0]).toEqual({ ifcClass: 'IFCWALL', count: 120 })
    expect(m.suggest(p).map((s: Mod) => s.handle)).toEqual(['ifc-rooms', 'ifc-plan-view', 'ifc-plan-set', 'ifc-specs'])
  })

  it('BESCOF (single product type) gets specs, classification and AR, not plan blocks', async () => {
    const m = await load()
    const handles = m.suggest(m.profileFrom(BESCOF)).map((s: Mod) => s.handle)
    expect(handles).toEqual(['ifc-specs', 'ifc-classification', 'ifc-ar'])
  })

  it('steel members get the takeoff; profiles also come from getStats alone (SDK without getProductData)', async () => {
    const m = await load()
    const p = m.profileFrom(STEEL)
    expect(p.steelShare).toBeGreaterThan(0.9)
    expect(m.suggest(p).map((s: Mod) => s.handle)).toContain('ifc-takeoff')
    expect(m.suggest(p).map((s: Mod) => s.handle)).not.toContain('ifc-rooms')
  })

  it('every suggested block exists in one of the extensions and has a FEATURE_TIERS key', async () => {
    const m = await load()
    const gen = await import('../integrations/shopify/build-extension.mjs')
    const all = Object.values(gen.EXTENSIONS as Record<string, string[]>).flat()
    for (const [handle, b] of Object.entries(m.BLOCK_LABELS as Record<string, { feature: string }>)) {
      expect(all, handle).toContain(handle)
      expect((gen.FEATURE_TIERS as Record<string, string>)[b.feature], handle).toBeTruthy()
    }
  })
})

describe('wizard: links and values', () => {
  it('deep link adds the app block on the product template with the app API key', async () => {
    const m = await load()
    const toml = fs.readFileSync(path.resolve(__dirname, '../integrations/shopify/app/shopify.app.toml'), 'utf8')
    expect(m.API_KEY).toBe(toml.match(/client_id = "([^"]+)"/)![1])
    expect(m.deepLink('shop.myshopify.com', 'ifc-rooms')).toBe(
      `https://shop.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=${m.API_KEY}/ifc-rooms&target=mainSection`)
  })

  it('metafield values to paste include the size when known', async () => {
    const m = await load()
    expect(m.metafieldValues({ url: 'https://x/a.ifc', ns: 'custom', key: 'ifc_model', mb: 3.2 })).toEqual([
      { ns: 'custom', key: 'ifc_model', value: 'https://x/a.ifc' }, { ns: 'custom', key: 'ifc_size_mb', value: '3.2' }])
  })

  it('reads the authoring tool from the IFC header', async () => {
    const d = await loadDiag()
    const head = "ISO-10303-21;HEADER;FILE_NAME('a.ifc','2024-01-01T00:00:00',('Joe'),('Org, Inc'),'IFC Exporter 1.0','Autodesk Revit 2024 (ENU)','');FILE_SCHEMA(('IFC4'));"
    expect(d.parseAuthoring(head)).toBe('Autodesk Revit 2024 (ENU)')
    expect(d.parseAuthoring("FILE_NAME('a','b',(''),(''),'x','$','');")).toBe('')
    expect(d.parseAuthoring('nothing')).toBe('')
  })
})

describe('poster (G7)', () => {
  it('crops to the block aspect ratio at 1200 px', async () => {
    const m = await load()
    expect(m.aspectOf('16/9')).toBeCloseTo(16 / 9)
    expect(m.aspectOf('1/1')).toBe(1)
    expect(m.aspectOf('height')).toBeCloseTo(4 / 3)
    expect(m.posterSize(16 / 9)).toEqual({ w: 1200, h: 675 })
    expect(m.posterSize(1)).toEqual({ w: 1200, h: 1200 })
    expect(m.cropBox(1600, 900, 1)).toEqual({ sx: 350, sy: 0, sw: 900, sh: 900 })
    expect(m.cropBox(900, 1600, 16 / 9)).toEqual({ sx: 0, sy: 547, sw: 900, sh: 506 })
  })

  it('encodes WebP, lowering quality until it fits 200 KB', async () => {
    const m = await load()
    const sizes: number[] = []
    const fakeCanvas = {
      width: 0, height: 0,
      getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' }),
      toBlob: (cb: (b: unknown) => void, type: string, q: number) => {
        const size = Math.round(400 * 1024 * q) // 0.85 → 348 KB … 0.4 → 164 KB
        sizes.push(size)
        cb({ type, size })
      },
    }
    class FakeImage { naturalWidth = 1600; naturalHeight = 900; onload: (() => void) | null = null; set src(_v: string) { setTimeout(() => this.onload && this.onload(), 0) } }
    const doc = { createElement: () => fakeCanvas, defaultView: { Image: FakeImage } }
    const out = await m.encodePoster('data:image/png;base64,x', { aspect: 16 / 9, doc })
    expect(out.type).toBe('image/webp')
    expect(out.blob.size).toBeLessThanOrEqual(200 * 1024)
    expect(out.over).toBe(false)
    expect([out.w, out.h]).toEqual([1200, 675])
    expect(sizes.length).toBeGreaterThan(1)
  })
})

describe('design mode only', () => {
  it('the product block renders the wizard inside request.design_mode only', () => {
    const liquid = read('blocks/product-ifc-viewer.liquid')
    const i = liquid.indexOf("'ifcvo-wizard.js' | asset_url")
    expect(i).toBeGreaterThan(0)
    const before = liquid.slice(0, i)
    expect(before.lastIndexOf('{%- if request.design_mode -%}')).toBeGreaterThan(before.lastIndexOf('{%- endif -%}'))
    expect(liquid).toContain('data-ifcvo-wizard>')
  })

  it('mount draws nothing outside the theme editor', async () => {
    const m = await load()
    document.body.innerHTML = '<script type="application/json" data-ifcvo-wizard>{"ns":"custom","key":"ifc_model","model":""}</script><div id="b"></div>'
    const body = document.getElementById('b')!
    expect(m.mount(body, { win: { Shopify: { designMode: false } } })).toBeNull()
    expect(m.mount(body, { win: {} })).toBeNull()
    const section = m.mount(body, { win: { Shopify: { designMode: true, shop: 's.myshopify.com' }, localStorage: window.localStorage, navigator, URL }, api: { FEATURE_TIERS: {} } })
    expect(section).not.toBeNull()
    expect(body.querySelector('details')!.open).toBe(true) // no model yet → opened
  })

  it('the private viewer is disposed when mount rebuilds and when the wizard closes', async () => {
    const m = await load()
    document.body.innerHTML = '<script type="application/json" data-ifcvo-wizard>{"ns":"custom","key":"ifc_model","model":"https://x/a.ifc"}</script><div id="b"></div>'
    const body = document.getElementById('b')!
    const disposed: number[] = []
    let n = 0
    class FakeViewer {
      id = ++n
      constructor(stage: HTMLElement) { stage.append(document.createElement('iframe')) }
      whenReady() { return Promise.resolve() }
      getStats() { return Promise.resolve({ elementCount: 1, models: [{ categories: [{ type: 'IfcFurniture', count: 1 }] }] }) }
      dispose() { disposed.push(this.id) }
    }
    const res = { status: 200, ok: true, headers: { get: () => null }, text: async () => "ISO-10303-21;FILE_SCHEMA(('IFC4'));" }
    const win = { Shopify: { designMode: true }, localStorage: window.localStorage, navigator, URL }
    const api = { FEATURE_TIERS: {}, loadSdk: async () => ({ IfcViewer: FakeViewer }) }
    const opts = { win, api, fetchImpl: async () => res }
    const read = async () => {
      const btn = [...body.querySelectorAll('button')].find((b) => b.textContent === m.WIZARD_LABELS.read)!
      btn.click()
      await vi.waitFor(() => expect(body.querySelector('[data-step="suggest"]')!.textContent).not.toBe(''))
    }
    m.mount(body, opts)
    await read()
    expect(body.querySelector('[data-ifcvo-wizard-stage] iframe')).not.toBeNull()
    m.mount(body, opts) // panel rebuilt
    expect(disposed).toEqual([1])
    await read()
    const details = body.querySelector('details')!
    details.open = false
    details.dispatchEvent(new Event('toggle'))
    expect(disposed).toEqual([1, 2])
    expect(m.release()).toBe(false)
  })

  it('the wizard JSON cannot close its script tag', () => {
    const liquid = read('blocks/product-ifc-viewer.liquid')
    const tag = liquid.slice(liquid.indexOf('data-ifcvo-wizard>'), liquid.indexOf('</script>', liquid.indexOf('data-ifcvo-wizard>')))
    const outs = tag.match(/\{\{[^}]*\}\}/g)!
    expect(outs.length).toBe(7)
    for (const o of outs) expect(o).toContain("| json | replace: '</', '<\\/'")
  })
})
