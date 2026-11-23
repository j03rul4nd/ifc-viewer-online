import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseAppUrlParams } from '../src/lib/url-params'
// @ts-expect-error plain .mjs build script without types
import { SECTIONS, blockPath, compiledLiquid, toAppBlock, withTiers, FEATURE_TIERS, ALWAYS_FREE, PLANS, DEFAULT_PLAN, assetPath } from '../integrations/shopify/build-extension.mjs'

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
      expect(lf(block)).toBe(compiledLiquid().blocks[name])
      expect(toAppBlock(source)).toContain('"target": "section"')
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
  const source = fs.readFileSync(path.join(dir, 'blocks/product-ifc-viewer.liquid'), 'utf8')
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
    expect(source).toContain("render 'ifcvo-runtime'")
    expect(source).toContain('data-ifcvo-viewer')
  })

  it('keeps braces out of Liquid output tags (Shopify rejects them)', () => {
    expect(source).not.toMatch(/\{\{[^}]*'[{}]'/)
  })

  it('creates no iframe until the visitor asks for the viewer', () => {
    expect(source).not.toContain('<iframe')
    expect(schema.settings.find((s) => s.id === 'load')!.default).toBe('click')
  })

  it('wires the SEO and customer-events snippets (T-322f)', () => {
    expect(source).toContain("render 'ifcvo-noscript', product: product, model: ns_model, specs_ns: specs_ns, download_label: s.download_label")
    expect(source).toContain("render 'ifcvo-jsonld', product: product, model: current_model, specs_ns: specs_ns, augment: true")
    expect(source).toContain("'ifcvo-events.js' | asset_url")
    expect(source).toContain('data-product-id="{{ product.id | escape }}"')
    expect(source).toContain('data-variant-id="{{ current.id | escape }}"')
    expect(source).toContain('data-block-id="{{ block.id | escape }}"')
    // The noscript fallback sits inside the viewer root.
    expect(source.indexOf("render 'ifcvo-noscript'")).toBeLessThan(source.indexOf("render 'ifcvo-runtime'"))
  })

  it('leaves opens, loads, errors and downloads to ifcvo-events.js (no double counting)', () => {
    for (const name of ['ifc_viewer_opened', 'ifc_model_downloaded', 'ifc_viewer_error']) expect(runtime).not.toContain(`track('${name}'`)
    expect(runtime).toContain("'ifcvo:loaded'")
    expect(runtime).toContain("'ifcvo:error'")
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
      expect(source).toContain("render 'ifcvo-runtime'")
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
    expect(DEFAULT_PLAN).toBe('free')
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
    const source = fs.readFileSync(path.join(dir, 'blocks/product-ifc-viewer.liquid'), 'utf8')
    expect(source).toContain('data-ifcvo-plan="{{ app.metafields.ifcvo.plan.value | escape }}"')
    expect(source).toContain('shop.metafields.ifcvo.config.value | json')
    // Plan (app metafield, D-327), shop and labels: printed once per page by the runtime snippet (T-325 G8).
    const runtime = fs.readFileSync(path.join(dir, 'snippets/ifcvo-runtime.liquid'), 'utf8')
    expect(runtime).toContain('data-ifcvo-plan="{{ app.metafields.ifcvo.plan.value | escape }}" data-ifcvo-shop="{{ shop.permanent_domain | escape }}"')
    expect(runtime).toContain('shop.metafields.ifcvo.labels.value | json')
    expect(source).toContain("render 'ifcvo-runtime'")
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

  it('gate(): no plan means free; a lower plan hides the block, with a note only in the editor', async () => {
    const r = await load()
    document.body.innerHTML = '<div id="x"></div>'
    const x = document.getElementById('x')!
    expect(r.normalizePlan('weird')).toBe('free')
    expect(r.gate('tour', x, 'starter')).toBe(true)
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
    const block = '<div data-ifcvo-viewer data-ifcvo-plan="starter" data-model="https://a.com/x.ifc"><div class="ifcvo-stage"></div></div><div data-ifcvo-panel="details"><div class="ifcvo-body"></div></div>'
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

describe('Shopify product facade and states', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Runtime = Record<string, (...a: any[]) => any>
  const runtimePath = '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo.js'
  const load = async (): Promise<Runtime> => {
    delete (window as unknown as { IFCVO?: unknown }).IFCVO
    vi.resetModules()
    return import(/* @vite-ignore */ runtimePath)
  }
  const block = fs.readFileSync(path.join(dir, 'blocks/product-ifc-viewer.liquid'), 'utf8')
  const facade = fs.readFileSync(path.join(dir, 'snippets/ifcvo-facade.liquid'), 'utf8')
  const locale = JSON.parse(fs.readFileSync(path.join(ext, 'locales/en.default.json'), 'utf8'))
  const schema = schemaOf(block)

  const markup = (extra = '') => `<div data-ifcvo-viewer data-model="https://a.com/x.ifc" data-size-mb="10" ${extra}>
    <div class="ifcvo-stage" data-ifcvo-state="idle" data-msg-loading="Loading" data-msg-error="Failed" data-msg-offline="Offline" data-msg-large="Too large" data-msg-webgl="No 3D" data-msg-ready="Ready">
      <div class="ifcvo-facade"><button class="ifcvo-open"></button><button class="ifcvo-retry" hidden></button><a class="ifcvo-full" hidden></a></div>
    </div><p class="ifcvo-status"></p></div>`

  /** A fake SDK whose viewers become ready (or never do) as told, by attempt number. */
  const fakeSdk = (ready: (n: number) => Promise<void>) => {
    let n = 0
    const made: { disposed: boolean; handlers: Record<string, (e: unknown) => void> }[] = []
    class IfcViewer {
      disposed = false
      handlers: Record<string, (e: unknown) => void> = {}
      private p: Promise<void>
      constructor(stage: HTMLElement) { stage.append(document.createElement('iframe')); this.p = ready(++n); made.push(this) }
      on(t: string, cb: (e: unknown) => void) { this.handlers[t] = cb }
      whenReady() { return this.p }
      dispose() { this.disposed = true }
    }
    return { sdk: async () => ({ IfcViewer }), made, count: () => n }
  }

  const gl = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const q = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
  const rootState = () => q('[data-ifcvo-viewer]').dataset.ifcvoState

  it('keeps 25 settings at most, and blocks already placed keep their fixed height', () => {
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    expect(schema.settings.find((s) => s.id === 'aspect')!.default).toBe('height')
    expect(schema.settings.find((s) => s.id === 'height')).toBeDefined()
    expect(schema.settings.find((s) => s.id === 'load')!.options!.map((o) => o.value)).toEqual(['click', 'visible', 'idle'])
  })

  it('renders a fixed-size poster facade with a poster chain and no iframe', () => {
    expect(block).toContain("render 'ifcvo-facade'")
    expect(facade).toContain('aspect-ratio:')
    expect(facade).toMatch(/product\.metafields\[ns\]\.ifc_poster[\s\S]*product\.featured_media[\s\S]*<svg/)
    expect(facade).toContain('fetchpriority="low"')
    expect(facade).toContain('role="status"')
    expect(facade).not.toContain('<iframe')
    expect(facade).not.toMatch(/\{\{[^}]*'[{}]'/)
  })

  it('every facade text exists in the default locale', () => {
    const keys = [...facade.matchAll(/'ifcvo\.facade\.([a-z_]+)' \| t/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(5)
    for (const k of keys) expect(locale.ifcvo.facade[k]).toBeTruthy()
  })

  it('probe: no WebGL2, and phones above the size cap, do not load here', async () => {
    const r = await load()
    expect(r.probe({ webgl2: false, sizeMb: 1 })).toEqual({ ok: false, reason: 'webgl' })
    expect(r.probe({ webgl2: true, mobile: true, sizeMb: 200 })).toEqual({ ok: false, reason: 'large' })
    expect(r.probe({ webgl2: true, mobile: false, sizeMb: 200, deviceMemory: 8 })).toEqual({ ok: true })
    expect(r.probe({ webgl2: true, mobile: false, sizeMb: 50, deviceMemory: 2 })).toEqual({ ok: false, reason: 'large' })
    expect(r.probe({ webgl2: true, mobile: true, sizeMb: 50, capMb: 80 })).toEqual({ ok: true })
  })

  it('no iframe until click; then loading to ready, status announced', async () => {
    document.body.innerHTML = markup()
    gl.mockReturnValue({} as never)
    const r = await load()
    r._setSdk(fakeSdk(() => Promise.resolve()).sdk, 0)
    expect(document.querySelectorAll('iframe').length).toBe(0)
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(rootState()).toBe('ready'))
    expect(q('.ifcvo-status').textContent).toBe('Ready')
    expect(q('.ifcvo-facade').hidden).toBe(true)
    expect(q<HTMLIFrameElement>('iframe').title).toBeTruthy()
    expect(r._state().viewer).toBeTruthy()
  })

  it('hands the viewer to other modules: ifcvo:viewer event, IFCVO.viewer, ifcvo:loaded on the root', async () => {
    document.body.innerHTML = markup()
    gl.mockReturnValue({} as never)
    const r = await load()
    const fake = fakeSdk(() => Promise.resolve())
    r._setSdk(fake.sdk, 0)
    const got = vi.fn()
    document.addEventListener('ifcvo:viewer', (e) => got((e as CustomEvent).detail), { once: true })
    const loaded = vi.fn()
    q('[data-ifcvo-viewer]').addEventListener('ifcvo:loaded', (e) => loaded((e as CustomEvent).detail))
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(got).toHaveBeenCalled())
    const { viewer, root } = got.mock.calls[0][0]
    expect(root).toBe(q('[data-ifcvo-viewer]'))
    expect(viewer).toBe(r._state().viewer)
    const api = (window as unknown as { IFCVO: { viewer: unknown } }).IFCVO
    expect(api.viewer).toBe(viewer)
    fake.made[0].handlers['model-loaded']({ elementCount: 12 })
    expect(loaded.mock.calls[0][0].elements).toBe(12)
  })

  it('timeout: one retry, then error with Retry and Open full viewer; Retry recovers', async () => {
    document.body.innerHTML = markup(`data-ifcvo-config='{"timeout":0.01}'`)
    gl.mockReturnValue({} as never)
    const r = await load()
    const f = fakeSdk((n) => (n <= 2 ? new Promise(() => {}) : Promise.resolve()))
    r._setSdk(f.sdk, 0)
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(rootState()).toBe('error'))
    expect(f.count()).toBe(2)
    expect(f.made.every((v) => v.disposed)).toBe(true)
    expect(q('.ifcvo-retry').hidden).toBe(false)
    expect(q('.ifcvo-full').hidden).toBe(false)
    expect(q('.ifcvo-status').textContent).toContain('Failed')
    q<HTMLButtonElement>('.ifcvo-retry').click()
    await vi.waitFor(() => expect(rootState()).toBe('ready'))
  })

  it('too large on a phone: full viewer link, no viewer created', async () => {
    document.body.innerHTML = markup().replace('data-size-mb="10"', 'data-size-mb="200"')
    gl.mockReturnValue({} as never)
    const mm = vi.fn().mockReturnValue({ matches: true })
    const prev = window.matchMedia
    window.matchMedia = mm as unknown as typeof window.matchMedia
    const r = await load()
    const f = fakeSdk(() => Promise.resolve())
    r._setSdk(f.sdk, 0)
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(rootState()).toBe('large'))
    expect(f.count()).toBe(0)
    expect(q('.ifcvo-full').hidden).toBe(false)
    expect(q('.ifcvo-open').hidden).toBe(true)
    window.matchMedia = prev
  })

  it('no WebGL2: full viewer link instead of a broken viewer', async () => {
    document.body.innerHTML = markup()
    gl.mockReturnValue(null)
    const r = await load()
    r._setSdk(fakeSdk(() => Promise.resolve()).sdk, 0)
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(rootState()).toBe('webgl'))
    expect(q('.ifcvo-status').textContent).toBe('No 3D')
  })

  it('offline: waits, and offers the button again when back online', async () => {
    document.body.innerHTML = markup()
    gl.mockReturnValue({} as never)
    const r = await load()
    r._setSdk(fakeSdk(() => Promise.resolve()).sdk, 0)
    const on = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(rootState()).toBe('offline'))
    expect(q('.ifcvo-status').textContent).toBe('Offline')
    on.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    expect(rootState()).toBe('idle')
    expect(q('.ifcvo-open').hidden).toBe(false)
    on.mockRestore()
    await flush()
  })

  it('escapes the poster URL in its attribute', () => {
    expect(facade).toContain('src="{{ poster_src | escape }}"')
    expect(facade).not.toMatch(/="\{\{ (?!'ifcvo)[a-z_]+ \}\}"/)
  })

  it('a model error ends the attempt at once with Retry, and does not auto-retry', async () => {
    document.body.innerHTML = markup(`data-ifcvo-config='{"timeout":5}'`)
    gl.mockReturnValue({} as never)
    const r = await load()
    const f = fakeSdk(() => new Promise(() => {}))
    r._setSdk(f.sdk, 0)
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(f.count()).toBe(1))
    f.made[0].handlers['model-error']({ message: 'bad file' })
    await vi.waitFor(() => expect(rootState()).toBe('error'))
    expect(q('.ifcvo-status').textContent).toBe('Failed: bad file')
    expect(q('.ifcvo-retry').hidden).toBe(false)
    await new Promise((res) => setTimeout(res, 30))
    expect(f.count()).toBe(1)
    expect(rootState()).toBe('error')
  })

  it('looks the size up once per block, not on every retry; skips it when the metafield has it', async () => {
    document.body.innerHTML = markup(`data-ifcvo-config='{"timeout":0.01}'`).replace('data-size-mb="10"', '')
    gl.mockReturnValue({} as never)
    const fetchMock = vi.fn().mockResolvedValue({ headers: { get: () => '1048576' } })
    vi.stubGlobal('fetch', fetchMock)
    const r = await load()
    r._setSdk(fakeSdk(() => new Promise(() => {})).sdk, 0)
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(rootState()).toBe('error'))
    q<HTMLButtonElement>('.ifcvo-retry').click()
    await vi.waitFor(() => expect(rootState()).toBe('loading'))
    await vi.waitFor(() => expect(rootState()).toBe('error'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    document.body.innerHTML = markup()
    fetchMock.mockClear()
    const r2 = await load()
    r2._setSdk(fakeSdk(() => Promise.resolve()).sdk, 0)
    q<HTMLButtonElement>('.ifcvo-open').click()
    await vi.waitFor(() => expect(rootState()).toBe('ready'))
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('shop labels override the facade texts', async () => {
    document.body.innerHTML = markup(`data-locale="es" data-ifcvo-labels='{"es":{"offline":"Sin conexión"}}'`)
    const r = await load()
    r.setState(q('[data-ifcvo-viewer]'), 'offline')
    expect(q('.ifcvo-status').textContent).toBe('Sin conexión')
  })
})
