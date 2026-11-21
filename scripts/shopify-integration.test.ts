import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseAppUrlParams } from '../src/lib/url-params'
// @ts-expect-error plain .mjs build script without types
import { SECTIONS, blockPath, toAppBlock, withTiers, FEATURE_TIERS, ALWAYS_FREE, PLANS, DEFAULT_PLAN, assetPath } from '../integrations/shopify/build-extension.mjs'

const dir = path.resolve(__dirname, '../integrations/shopify')

interface Setting { type: string; id: string; default?: unknown; options?: { value: string }[] }
function schemaOf(source: string): { settings: Setting[]; presets?: unknown; target?: string } {
  return JSON.parse(source.match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/)![1])
}

describe('Shopify sections', () => {
  for (const name of SECTIONS as string[]) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')

    it(`${name}: valid schema with unique ids and defaults among the options`, () => {
      const schema = schemaOf(source)
      const ids = schema.settings.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const s of schema.settings) {
        if (s.options) expect(s.options.map((o) => o.value)).toContain(s.default)
      }
      expect(schema.presets).toBeTruthy()
    })

    it(`${name}: the app block is built from the section`, () => {
      const block = fs.readFileSync(blockPath(name), 'utf8')
      // Git may check the files out with CRLF line endings.
      const lf = (t: string) => t.replace(/\r\n/g, '\n')
      expect(lf(block)).toBe(lf(toAppBlock(source)))
      expect(schemaOf(block).target).toBe('section')
      expect(schemaOf(block).presets).toBeUndefined()
    })

    it(`${name}: reads block settings inside an app block`, () => {
      expect(source).toContain('assign s = block.settings')
      expect(source).not.toMatch(/section\.settings\.\w/)
    })
  }

  it('every viewer layout the section offers is a preset the viewer knows', () => {
    const schema = schemaOf(fs.readFileSync(path.join(dir, 'ifc-viewer.liquid'), 'utf8'))
    const ui = schema.settings.find((s) => s.id === 'ui')!
    for (const { value } of ui.options!) {
      expect(parseAppUrlParams(`?ui=${value}`).preset).toBe(value)
    }
  })

  it('the viewer reads the URL the section renders', () => {
    // Rendered from ifc-viewer.liquid with two links (one http, dropped), map,
    // drawings, Health Score off, Spanish and an accent colour.
    const search =
      '?embed=1&model=https%3A%2F%2Fa.com%2Fx+1.ifc%2Chttps%3A%2F%2Fb.com%2Fz.ifc&ui=article&view=iso&validate=0&map=terrain,buildings&drawings=plan&lang=es&accent=2f6f5e'
    const p = parseAppUrlParams(search)
    expect(p.modelUrls).toEqual(['https://a.com/x 1.ifc', 'https://b.com/z.ifc'])
    expect(p.lang).toBe('es')
  })
})

const ext = path.join(dir, 'app/extensions/ifc-viewer')
const runtime = fs.readFileSync(path.join(ext, 'assets/ifcvo.js'), 'utf8')

describe('Shopify product block (app only)', () => {
  const source = fs.readFileSync(path.join(ext, 'blocks/product-ifc-viewer.liquid'), 'utf8')
  const schema = schemaOf(source) as ReturnType<typeof schemaOf> & { enabled_on?: { templates: string[] } }

  it('is a product-template app block with valid settings', () => {
    expect(schema.target).toBe('section')
    expect(schema.enabled_on?.templates).toEqual(['product'])
    const ids = schema.settings.filter((s) => s.id).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of schema.settings) {
      if (s.options) expect(s.options.map((o) => o.value)).toContain(s.default)
    }
  })

  it('offers only viewer layouts the viewer knows', () => {
    for (const { value } of schema.settings.find((s) => s.id === 'ui')!.options!) {
      expect(parseAppUrlParams(`?ui=${value}`).preset).toBe(value)
    }
  })

  it('switches the model when the variant changes', () => {
    expect(source).toContain('variant.metafields[ns][key]')
    expect(runtime).toContain('form[action*="/cart/add"] [name="id"]')
    expect(runtime).toContain('viewer.addFromUrl(url)')
  })

  it('loads the shared runtime and marks itself as the page viewer', () => {
    expect(source).toContain("'ifcvo.js' | asset_url")
    expect(source).toContain('data-ifcvo-viewer')
  })

  it('keeps braces out of Liquid output tags (Shopify rejects them)', () => {
    expect(source).not.toMatch(/\{\{[^}]*'[{}]'/)
  })

  it('creates no iframe until the visitor asks for the viewer', () => {
    expect(source).not.toContain('<iframe')
    expect(schema.settings.find((s) => s.id === 'load')!.default).toBe('click')
  })

  it('publishes customer events for opens and downloads', () => {
    expect(runtime).toContain("track('ifc_viewer_opened'")
    expect(runtime).toContain("track('ifc_model_downloaded'")
  })
})

describe('Shopify companion blocks (app only)', () => {
  const companions = ['ifc-explorer.liquid', 'ifc-element-details.liquid', 'ifc-views.liquid', 'ifc-health-score.liquid']
  const panels = runtime.match(/const PANELS = \{ ([^}]+) \}/)![1].split(', ')

  for (const name of companions) {
    const source = fs.readFileSync(path.join(ext, 'blocks', name), 'utf8')
    const schema = schemaOf(source)

    it(`${name}: valid settings, brand controls and a panel the runtime knows`, () => {
      expect(schema.target).toBe('section')
      const ids = schema.settings.filter((s) => s.id).map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const s of schema.settings) {
        if (s.options) expect(s.options.map((o) => o.value)).toContain(s.default)
      }
      expect(ids).toEqual(expect.arrayContaining(['accent', 'radius', 'frame']))
      const panel = source.match(/data-ifcvo-panel="([a-z]+)"/)![1]
      expect(panels).toContain(panel)
      expect(source).toContain("'ifcvo.js' | asset_url")
      expect(source).not.toMatch(/\{\{[^}]*'[{}]'/)
    })
  }

  it('views offer only camera views the SDK accepts', () => {
    const schema = schemaOf(fs.readFileSync(path.join(ext, 'blocks/ifc-views.liquid'), 'utf8'))
    const sdk = fs.readFileSync(path.resolve(__dirname, '../src/sdk/ifc-viewer-sdk.ts'), 'utf8')
    const views = sdk.match(/export type CameraView = ([^\n]+)/)![1].match(/'([a-z]+)'/g)!.map((v) => v.slice(1, -1))
    for (const s of schema.settings.filter((x) => x.id?.startsWith('view_'))) {
      for (const { value } of s.options!) if (value !== 'none') expect(views).toContain(value)
    }
  })

  it('the explorer lists elements, not property sets or types', () => {
    const pattern = new RegExp(runtime.match(/const NOT_ELEMENTS = \/(.+)\/i/)![1], 'i')
    for (const c of ['IFCPROPERTYSINGLEVALUE', 'IFCPROPERTYSET', 'IFCWALLTYPE', 'IFCMATERIALLAYERSETUSAGE', 'IFCELEMENTQUANTITY', 'IFCRELAGGREGATES']) expect(pattern.test(c)).toBe(true)
    for (const c of ['IFCWALL', 'IFCCURTAINWALL', 'IFCSPACE', 'IFCDOOR', 'IFCBUILDINGSTOREY']) expect(pattern.test(c)).toBe(false)
  })
})

describe('Shopify config and plan gate', () => {
  const tiers = FEATURE_TIERS as Record<string, string>
  const css = fs.readFileSync(path.join(ext, 'assets/ifcvo.css'), 'utf8')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Runtime = Record<string, (...a: any[]) => any>
  const runtimePath = '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo.js'
  /** A fresh copy of the runtime, so module state does not leak between tests. */
  const load = async (): Promise<Runtime> => {
    delete (window as unknown as { IFCVO?: unknown }).IFCVO
    vi.resetModules()
    return import(/* @vite-ignore */ runtimePath)
  }
  const win = window as unknown as { Shopify?: { designMode: boolean } }

  it('the runtime carries the current plan table (run build-extension.mjs)', () => {
    const lf = (t: string) => t.replace(/\r\n/g, '\n')
    expect(lf(runtime)).toBe(lf(withTiers(runtime)))
    expect(fs.existsSync(assetPath('ifcvo.js'))).toBe(true)
  })

  it('every feature has a known tier, every panel a feature, and loading stays free', () => {
    for (const t of Object.values(tiers)) expect(PLANS).toContain(t)
    expect(DEFAULT_PLAN).toBe('business')
    for (const f of ALWAYS_FREE as string[]) expect(tiers[f]).toBe('free')
    const panels = runtime.match(/const PANELS = \{ ([^}]+) \}/)![1].split(', ')
    for (const p of panels) expect(tiers[p]).toBeDefined()
  })

  it('the stylesheet only styles its own classes and documents its custom properties', () => {
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g)!
    for (const group of selectors) for (const sel of group.split(',')) expect(sel.trim()).toMatch(/^\.ifcvo/)
    for (const v of ['--ifcvo-accent', '--ifcvo-radius', '--ifcvo-bg-1', '--ifcvo-bg-2', '--ifcvo-font', '--ifcvo-gap']) expect(css).toContain(v)
  })

  it('the product block hands the plan, shop config and labels to the runtime', () => {
    const source = fs.readFileSync(path.join(ext, 'blocks/product-ifc-viewer.liquid'), 'utf8')
    expect(source).toContain("app.metafields.ifcvo.plan.value | default: 'business'")
    expect(source).toContain('shop.metafields.ifcvo.config.value | json')
    expect(source).toContain('shop.metafields.ifcvo.labels.value | json')
  })

  it('config precedence: block over shop JSON over defaults; empty values do not count', async () => {
    const r = await load()
    expect(r.mergeConfig({ ui: 'product', validate: true }, { ui: 'article', lang: 'es' }, { ui: 'kiosk', lang: '' }))
      .toEqual({ ui: 'kiosk', lang: 'es', validate: true })
    expect(r.readJson('not json')).toBeNull()
    expect(r.readJson('null')).toBeNull()
    const root = document.createElement('div')
    root.dataset.ifcvoConfig = '{"view":"top","lang":"de"}'
    root.dataset.view = 'iso'
    root.dataset.validate = '0'
    expect(r.viewerConfig(root)).toMatchObject({ view: 'iso', lang: 'de', validate: false })
  })

  it('label overrides and locale fallback', async () => {
    const r = await load()
    expect(r.parseLabels('# c\nopen = Ver en 3D\n\nbad\n=x\ndownload=Descargar')).toEqual({ open: 'Ver en 3D', download: 'Descargar' })
    expect(r.labelsFor({ en: { a: 'A', b: 'B' }, es: { a: 'Á' }, 'es-mx': { b: 'Bé' } }, 'es-MX')).toEqual({ a: 'Á', b: 'Bé' })
  })

  it('gate(): the default plan allows all; a lower plan hides the block, with a note only in the editor', async () => {
    const r = await load()
    document.body.innerHTML = '<div id="x"></div>'
    const x = document.getElementById('x')!
    expect(r.normalizePlan('weird')).toBe('business')
    expect(r.gate('tour', x)).toBe(true)
    expect(r.allowed('tour', 'free')).toBe(false)
    expect(r.allowed('viewer', 'free')).toBe(true)
    expect(r.allowed('unknown-feature', 'free')).toBe(true)
    expect(r.gate('tour', x, 'free')).toBe(false)
    expect(x.hidden).toBe(true)
    expect(document.querySelector('[data-ifcvo-upsell]')).toBeNull()
    win.Shopify = { designMode: true }
    const y = document.createElement('div')
    document.body.append(y)
    r.gate('tour', y, 'free')
    r.gate('tour', y, 'free')
    expect(document.querySelectorAll('[data-ifcvo-upsell="tour"]').length).toBe(1)
    delete win.Shopify
  })

  it('reads the plan from the app metafield the block renders', async () => {
    document.body.innerHTML = '<div data-ifcvo-viewer data-ifcvo-plan="free"><div class="ifcvo-stage"></div></div><div data-ifcvo-panel="views"><button data-tour></button></div>'
    await load()
    expect((window as unknown as { IFCVO: { plan: string } }).IFCVO.plan).toBe('free')
    expect((document.querySelector('[data-tour]') as HTMLElement).hidden).toBe(true)
  })

  it('re-running init or reloading a section never mounts twice, and unload frees listeners', async () => {
    const block = '<div data-ifcvo-viewer data-model="https://a.com/x.ifc"><div class="ifcvo-stage"></div></div><div data-ifcvo-panel="details"><div class="ifcvo-body"></div></div>'
    document.body.innerHTML = `<section id="s1">${block}</section>`
    const r = await load()
    expect(r._state().listeners).toBe(1)
    r.init()
    r.init()
    expect(r._state().listeners).toBe(1)
    const s1 = document.getElementById('s1')!
    s1.dispatchEvent(new Event('shopify:section:unload', { bubbles: true }))
    s1.remove()
    expect(r._state().listeners).toBe(0)
    document.body.innerHTML = `<section id="s2">${block}</section>`
    r.init()
    expect(r._state().listeners).toBe(1)
    expect(document.querySelectorAll('iframe').length).toBe(0)
  })
})
