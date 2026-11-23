// T-322g: theme-editor setup check (assets/ifcvo-diagnostics.js + snippets/ifcvo-diag.liquid)
// and the locale-driven quote / downloads texts.
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ext = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
/** Readable sources (blocks/, snippets/, full locales/); the extension gets compact copies. */
const src = path.resolve(__dirname, '../integrations/shopify')
const read = (p: string): string => fs.readFileSync(path.join(/^(blocks|snippets|locales)\//.test(p) ? src : ext, p), 'utf8')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = Record<string, any>
const diagPath = '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-diagnostics.js'
const quotePath = '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-quote.js'
const load = async (p: string): Promise<Mod> => import(/* @vite-ignore */ p)

const res = (status: number, headers: Record<string, string> = {}, body = '') => ({
  status, ok: status >= 200 && status < 300, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, text: async () => body,
})
const IFC_HEAD = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_SCHEMA(('IFC4'));\nENDSEC;"

describe('diagnostics: pure helpers', () => {
  it('reads the IFC schema and STEP signature', async () => {
    const m = await load(diagPath)
    expect(m.parseSchema(IFC_HEAD)).toBe('IFC4')
    expect(m.parseSchema("FILE_SCHEMA(('IFC2X3'));")).toBe('IFC2X3')
    expect(m.parseSchema('nothing')).toBe('')
    expect(m.isStep(IFC_HEAD)).toBe(true)
    expect(m.isStep('<html>')).toBe(false)
  })

  it('SDK version and 1.19 support', async () => {
    const m = await load(diagPath)
    expect(m.sdkVersion('https://www.ifcvieweronline.eu/sdk/1.18.0/ifc-viewer.es.js')).toBe('1.18.0')
    expect(m.atLeast('1.19.0', '1.19.0')).toBe(true)
    expect(m.atLeast('1.18.9', '1.19.0')).toBe(false)
    expect(m.atLeast('2.0.0', '1.19.0')).toBe(true)
    const old = m.sdkReport('https://x/sdk/1.18.0/a.js', null)
    expect(old[0].kind).toBe('warn')
    expect(old[0].text).toMatch(/1\.19/)
    const fresh = m.sdkReport('https://x/sdk/1.19.0/a.js', { getProductData: () => 0 })
    expect(fresh[0].kind).toBe('ok')
    expect(fresh[1].text).toBe('getProductData: yes · exportModel: no')
  })

  it('plan ranks: free < starter < business; unknown plan = business', async () => {
    const m = await load(diagPath)
    expect(m.allowedOn('starter', 'free')).toBe(false)
    expect(m.allowedOn('starter', 'starter')).toBe(true)
    expect(m.allowedOn('business', 'starter')).toBe(false)
    expect(m.allowedOn('business', '')).toBe(true)
  })

  it('model probe: reachable, size, schema', async () => {
    const m = await load(diagPath)
    const f = vi.fn(async (_u: string, o: { method?: string }) => (o.method === 'HEAD' ? res(200, { 'content-length': String(150 * 1048576) }) : res(206, {}, IFC_HEAD)))
    const p = await m.checkModel('https://cdn.shopify.com/m.ifc', f)
    expect(p).toMatchObject({ ok: true, cors: true, mb: 150, schema: 'IFC4', step: true })
    const lines = m.modelReport(p).map((l: { text: string }) => l.text).join('\n')
    expect(lines).toMatch(/Reachable \(200\)/)
    expect(lines).toMatch(/Size: 150 MB/)
    expect(lines).toMatch(/Over 100 MB/)
    expect(lines).toMatch(/IFC schema: IFC4/)
  })

  it('model probe: CORS failure, HTTP error, not https, missing', async () => {
    const m = await load(diagPath)
    const cors = await m.checkModel('https://other.example/m.ifc', async () => { throw new TypeError('Failed to fetch') })
    expect(cors.cors).toBe(false)
    expect(m.modelReport(cors)[0].text).toMatch(/Access-Control-Allow-Origin/)
    const notFound = await m.checkModel('https://x/m.ifc', async () => res(404))
    expect(m.modelReport(notFound).map((l: { text: string }) => l.text).join()).toMatch(/HTTP 404/)
    expect(m.modelReport(await m.checkModel('http://x/m.ifc'))[0].text).toMatch(/https/)
    expect(m.modelReport(null, { ns: 'custom', key: 'ifc_model' })[0].text).toMatch(/custom\.ifc_model/)
  })

  it('block report: present, missing with hint, gated by plan', async () => {
    const m = await load(diagPath)
    const r = m.blockReport({ feature: 'takeoff', ns: 'bim', present: ['boq'], missing: ['unit_prices'] },
      { plan: 'starter', tiers: { takeoff: 'business' } })
    expect(r.allowed).toBe(false)
    const text = r.lines.map((l: { text: string }) => l.text).join('\n')
    expect(text).toMatch(/Needs the business plan/)
    expect(text).toMatch(/Found: bim\.boq/)
    expect(text).toMatch(/Missing: bim\.unit_prices/)
    expect(text).toMatch(/METAFIELDS\.md/)
    const free = m.blockReport({ feature: 'explorer', ns: '', present: [], missing: [] }, { plan: 'free', tiers: { explorer: 'free' } })
    expect(free.allowed).toBe(true)
    expect(free.lines.map((l: { text: string }) => l.text).join()).toMatch(/Needs no metafields/)
  })
})

describe('diagnostics: panel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).Shopify = undefined
  })

  const page = () => {
    document.body.innerHTML = `
      <div data-ifcvo-viewer data-model="https://cdn.shopify.com/m.ifc" data-ifcvo-plan="free"></div>
      <script type="application/json" data-ifcvo-diag>{"feature":"viewer","block":"product-ifc-viewer","ns":"custom","present":["ifc_model"],"missing":["ifc_poster"],"any":true,"model":"https://cdn.shopify.com/m.ifc","product":true}</script>
      <script type="application/json" data-ifcvo-diag>{"feature":"rooms","block":"ifc-rooms","ns":"bim","present":[],"missing":["area"],"any":false,"model":"","product":true}</script>
      <script type="application/json" data-ifcvo-diag>{"feature":"takeoff","block":"ifc-takeoff","ns":"bim","present":[],"missing":[],"any":false,"model":"","product":true}</script>`
  }
  const api = { FEATURE_TIERS: { viewer: 'free', rooms: 'free', takeoff: 'business' }, sdk: 'https://x/sdk/1.18.0/a.js', viewer: null }
  const fetchImpl = async (_u: string, o: { method?: string }) => (o.method === 'HEAD' ? res(200, { 'content-length': '2097152' }) : res(206, {}, IFC_HEAD))

  it('never draws for buyers (not in the theme editor)', async () => {
    const m = await load(diagPath)
    page()
    expect(await m.render(document, { api, fetchImpl })).toBeNull()
    expect(document.querySelector('[data-ifcvo-diag-panel]')).toBeNull()
  })

  it('in the theme editor: one section per block, plan gating and the model probe', async () => {
    const m = await load(diagPath)
    page()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).Shopify = { designMode: true }
    const panel = await m.render(document, { api, fetchImpl })
    expect(panel).not.toBeNull()
    const text = panel.textContent
    expect(text).toMatch(/Plan: free/)
    expect(text).toMatch(/Reachable \(200\)/)
    expect(text).toMatch(/Size: 2 MB/)
    expect(text).toMatch(/IFC schema: IFC4/)
    expect(text).toMatch(/Missing: custom\.ifc_poster/)
    expect(text).toMatch(/Missing: bim\.area/)
    expect(panel.querySelector('[data-feature="takeoff"]').textContent).toMatch(/Needs the business plan/)
    expect(text).toMatch(/1\.19/)
    // Re-render replaces, never duplicates.
    await m.render(document, { api, fetchImpl })
    expect(document.querySelectorAll('[data-ifcvo-diag-panel]').length).toBe(1)
  })
})

describe('diagnostics: Liquid wiring', () => {
  it('the diag snippet and script are behind request.design_mode', () => {
    const s = read('snippets/ifcvo-diag.liquid')
    const body = s.replace(/\{% comment %\}[\s\S]*?\{% endcomment %\}/, '')
    expect(body.trim().startsWith('{%- if request.design_mode -%}')).toBe(true)
    expect(body.trim().endsWith('{%- endif -%}')).toBe(true)
    expect(body).toMatch(/ifcvo-diagnostics\.js/)
  })

  it('every metafield-reading block reports to the panel', () => {
    for (const b of ['product-ifc-viewer', 'ifc-rooms', 'ifc-takeoff', 'ifc-dpp', 'ifc-ar', 'ifc-compat', 'ifc-compliance', 'ifc-classification', 'ifc-plan-set', 'ifc-downloads', 'ifc-specs']) {
      const file = [path.join(src, 'blocks', b + '.liquid')].find((f) => fs.existsSync(f))!
      expect(fs.readFileSync(file, 'utf8'), b).toMatch(/render 'ifcvo-diag', feature: '\w+'/)
    }
  })
})

describe('quote and downloads texts from locales', () => {
  it('resolveLabels: defaults ← locale ← shop prefix ← settings; skips blanks and missing translations', async () => {
    const m = await load(quotePath)
    const L = m.resolveLabels(m.QUOTE_LABELS, {
      locale: { cart: 'Añadir al carrito', remove: 'translation missing: es.ifcvo.quote.remove', bogus: 'x' },
      shop: { 'quote.contact': 'Pedir precio', contact: 'ignored', 'downloads.made': 'no' },
      prefix: 'quote',
      settings: { pick: '', empty: 'Nada aún' },
    })
    expect(L.cart).toBe('Añadir al carrito')
    expect(L.remove).toBe('Remove')
    expect(L.contact).toBe('Pedir precio')
    expect(L.pick).toBe('Add the selected element')
    expect(L.empty).toBe('Nada aún')
    expect('bogus' in L).toBe(false)
  })

  it('quoteBody uses the translated line labels', async () => {
    const m = await load(quotePath)
    const body = m.quoteBody({ product: 'Silla', variant: 'Roble', url: 'https://s/p' }, [{ name: '', ifcClass: '', guid: 'g', qty: 2 }],
      { ...m.QUOTE_LABELS, product: 'Producto', variant: 'Variante', page: 'Página', element: 'Elemento' })
    expect(body).toContain('Producto: Silla')
    expect(body).toContain('Variante: Roble')
    expect(body).toContain('Página: https://s/p')
    expect(body).toContain('- 2 x Elemento (IFC, GlobalId g)')
  })

  it('every QUOTE_LABELS / DOWNLOAD_LABELS default matches en.default.json', async () => {
    const m = await load(quotePath)
    const en = JSON.parse(read('locales/en.default.json')).ifcvo
    for (const [k, v] of Object.entries(m.QUOTE_LABELS)) expect(en.quote[k], k).toBe(v)
    const map: Record<string, string> = { making: 'making', made: 'made', makeError: 'make_error', noViewer: 'no_viewer', noGlb: 'no_glb' }
    for (const [k, v] of Object.entries(m.DOWNLOAD_LABELS)) expect(en.downloads[map[k]], k).toBe(v)
  })

  it('the element details and downloads markup pass the locale texts', () => {
    expect(read('blocks/ifc-element-details.liquid')).toContain('data-i18n="quote"')
    const dl = read('snippets/ifcvo-downloads.liquid')
    expect(dl).toContain('data-i18n="downloads"')
    expect(dl).not.toMatch(/default: 'Download BIM model/)
  })
})
