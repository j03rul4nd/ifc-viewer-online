// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_APPS, RULE_LABELS, authoringApp, decodeStep, stripComments, _reset, ruleLabel, fetchHeader, init, normalizeSchema, parseHeader, renderCompat, renderHealth, renderWeight, topCategories, weightBand,
  // @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-compat.js'
import { FEATURE_TIERS, I18N_GROUPS, withTiers } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
/** Readable sources (blocks/, snippets/, full locales/); the extension gets compact copies. */
const SRC = path.resolve(__dirname, '../integrations/shopify')
const block = fs.readFileSync(path.join(SRC, 'blocks/ifc-compat.liquid'), 'utf8')
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')
const locales = JSON.parse(fs.readFileSync(path.join(SRC, 'locales/en.default.json'), 'utf8'))
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const body = block.replace(/\{% schema %\}[\s\S]*$/, '').replace(/\{% comment %\}[\s\S]*?\{% endcomment %\}/g, '')

const IFC4 = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');
FILE_NAME('door.ifc','2024-03-01T10:00:00',('Jo'),('Acme'),'ODA SDAI 23.3','Autodesk Revit 2024 (ENU)','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('x',$,'FILE_SCHEMA((''IFC2X3''))',$,$,$,$,$,$);`

describe('parseHeader', () => {
  it('reads IFC4 schema, MVD and authoring app', () => {
    const h = parseHeader(IFC4)
    expect(h).toMatchObject({ schema: 'IFC4', mvd: ['ReferenceView_V1.2'], app: 'Autodesk Revit 2024 (ENU)', preprocessor: 'ODA SDAI 23.3' })
  })
  it('reads IFC2x3 with several view definitions and options', () => {
    const h = parseHeader(`ISO-10303-21;HEADER;FILE_DESCRIPTION(('ViewDefinition [CoordinationView, QuantityTakeOffAddOnView]','Option [Drawing]'),'2;1');
FILE_NAME('a.ifc','t',(''),(''),'IFC Engine','ARCHICAD-64 26.0.0 INT FULL',$);FILE_SCHEMA(('IFC2X3'));ENDSEC;`)
    expect(h.schema).toBe('IFC2x3')
    expect(h.mvd).toEqual(['CoordinationView', 'QuantityTakeOffAddOnView'])
    expect(h.app).toBe('ARCHICAD-64 26.0.0 INT FULL')
  })
  it('normalises IFC4X3_ADD2 and keeps the raw value', () => {
    const h = parseHeader(`HEADER;FILE_SCHEMA(('IFC4X3_ADD2'));ENDSEC;`)
    expect(h.schema).toBe('IFC4x3')
    expect(h.schemaRaw).toBe('IFC4X3_ADD2')
  })
  it('tolerates odd whitespace, lower case and escaped quotes', () => {
    const h = parseHeader(`header;\r\n  file_description ( ( 'ViewDefinition[DesignTransferView]' ) , '2;1' ) ;\n\tfile_name ( 'O''Brien.ifc' , 't' , ( 'a' ) , ( 'b' ) , 'pp' ,\n  'Tekla Structures 2023 SP2' , '' ) ;\n file_schema (\n ( 'ifc4' ) ) ;\nendsec;`)
    expect(h).toMatchObject({ schema: 'IFC4', mvd: ['DesignTransferView'], app: 'Tekla Structures 2023 SP2' })
  })
  it('missing fields stay empty, garbage does not throw', () => {
    expect(parseHeader('HEADER;ENDSEC;')).toEqual({ schema: '', schemaRaw: '', mvd: [], app: '', preprocessor: '' })
    expect(parseHeader(`FILE_NAME('a',$,$,$,$,$,$);FILE_SCHEMA(());`)).toMatchObject({ schema: '', app: '' })
    expect(() => parseHeader(`FILE_NAME('unterminated`)).not.toThrow()
    expect(parseHeader(undefined as unknown as string).schema).toBe('')
  })
  it('ignores schema-like strings in the DATA section', () => {
    expect(parseHeader(IFC4.replace("FILE_SCHEMA(('IFC4'));", '')).schema).toBe('')
  })
  it('normalizeSchema variants', () => {
    expect(normalizeSchema('IFC2X3_TC1')).toBe('IFC2x3')
    expect(normalizeSchema('IFC4X1')).toBe('IFC4')
    expect(normalizeSchema('IFC4X3')).toBe('IFC4x3')
    expect(normalizeSchema('IFC5')).toBe('IFC5')
  })
})

const ROOT = path.resolve(__dirname, '..')
function head4k(p: string): string {
  const fd = fs.openSync(path.join(ROOT, p), 'r')
  const b = Buffer.alloc(4096)
  const n = fs.readSync(fd, b, 0, 4096, 0)
  fs.closeSync(fd)
  return b.subarray(0, n).toString('utf8')
}

describe('real file headers', () => {
  it('Duplex (Revit 2011): app from preprocessor, not the build stamp', () => {
    expect(parseHeader(head4k('public/Ifc2x3_Duplex_Architecture.ifc'))).toMatchObject({ schema: 'IFC2x3', mvd: ['CoordinationView'], app: 'Autodesk Revit Architecture 2011' })
  })
  it('cras (Revit exporter 23.x): Revit 2023', () => {
    expect(parseHeader(head4k('public/models/cras/model.ifc'))).toMatchObject({ schema: 'IFC2x3', mvd: ['CoordinationView_V2.0'], app: 'Autodesk Revit 2023' })
  })
  it('oriental-pearl / swfc: \\X2\\ decoded', () => {
    for (const p of ['public/models/oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc', 'public/models/swfc/SHA-IVO-SWFC-A-0001.ifc']) {
      const h = parseHeader(head4k(p))
      expect(h.schema).toBe('IFC4')
      expect(h.mvd).toEqual(['DesignTransferView'])
      expect(h.app).toBe('IfcOpenShell API / Blender — reference reconstruction')
    }
  })
})

describe('STEP strings and comments', () => {
  it('decodes X2, X4, X, S, P and backslash escapes', () => {
    expect(decodeStep('Ma\\X2\\00DF\\X0\\stab')).toBe('Maßstab')
    expect(decodeStep('\\X2\\4E0A6D77\\X0\\')).toBe('上海')
    expect(decodeStep('\\X4\\0001F600\\X0\\')).toBe('\u{1F600}')
    expect(decodeStep('Caf\\X\\E9')).toBe('Café')
    expect(decodeStep('\\PA\\\\S\\i')).toBe('é')
    expect(decodeStep('a\\\\b')).toBe('a\\b')
  })
  it("'' quotes and encodings inside FILE_NAME", () => {
    const h = parseHeader("FILE_NAME('a','t',(''),(''),'pp','Studio d''Arch\\X\\E9 v2','');FILE_SCHEMA(('IFC4'));ENDSEC;")
    expect(h.app).toBe("Studio d'Arché v2")
  })
  it('strips comments, but not inside strings', () => {
    const h = parseHeader("/* exported */ FILE_DESCRIPTION(/* c */('ViewDefinition [ReferenceView]'),'2;1');\nFILE_NAME('a','t',(''),(''),'x','App /* 1 */ 2024','');/* FILE_SCHEMA(('IFC2X3')); */FILE_SCHEMA(('IFC4X3_ADD2'));ENDSEC;")
    expect(h).toMatchObject({ schema: 'IFC4x3', mvd: ['ReferenceView'], app: 'App /* 1 */ 2024' })
    expect(stripComments('a/* x */b')).toBe('a b')
  })
  it('authoringApp fallbacks', () => {
    expect(authoringApp('ARCHICAD-64 26.0.0', 'IFC Engine')).toBe('ARCHICAD-64 26.0.0')
    expect(authoringApp('', 'Tekla Structures 2023')).toBe('Tekla Structures 2023')
    expect(authoringApp('20100326_1700', '')).toBe('20100326_1700')
  })
})

describe('weight and health helpers', () => {
  it('bands by size and element count', () => {
    expect(weightBand(0, 0)).toBeNull()
    expect(weightBand(5, 1000)).toBe('light')
    expect(weightBand(30, 0)).toBe('medium')
    expect(weightBand(5, 20000)).toBe('medium')
    expect(weightBand(150, 10)).toBe('heavy')
    expect(weightBand(0, 60000)).toBe('heavy')
  })
  it('top 3 issue categories by count', () => {
    const issues = [
      ...Array(4).fill({ ruleId: 'missing-name', severity: 'warning' }),
      ...Array(2).fill({ ruleId: 'duplicate_guid', severity: 'error' }),
      ...Array(2).fill({ ruleId: 'no-storey', severity: 'warning' }),
      { ruleId: 'other', severity: 'info' }, { severity: 'error' },
    ]
    const top = topCategories(issues)
    expect(top.map((c: { label: string }) => c.label)).toEqual(['Missing name', 'Duplicate GUIDs', 'No storey'])
    expect(top[0].count).toBe(4)
  })
})

describe('fetchHeader', () => {
  it('fetches the next 12 KB once when ENDSEC is not in the first 4 KB', async () => {
    const big = "ISO-10303-21;\nHEADER;\n/*" + 'x'.repeat(5000) + "*/\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;" + 'y'.repeat(30000)
    const f = vi.fn(async (_u: string, o: RequestInit) => {
      const [a, b] = /bytes=(\d+)-(\d+)/.exec((o.headers as Record<string, string>).Range)!.slice(1).map(Number)
      return new Response(big.slice(a, b + 1), { status: 206 })
    })
    const text = await fetchHeader('https://x/a.ifc', { fetchImpl: f })
    expect(f).toHaveBeenCalledTimes(2)
    expect((f.mock.calls[1][1].headers as Record<string, string>).Range).toBe('bytes=4096-16383')
    expect(text!.length).toBeLessThanOrEqual(16384)
    expect(parseHeader(text).schema).toBe('IFC4')
  })
  it('a host that ignores Range: at most 16 KB of the 200 body, one request', async () => {
    const f = vi.fn(async () => new Response('ISO-10303-21;' + 'z'.repeat(100000), { status: 200 }))
    const text = await fetchHeader('https://x/a.ifc', { fetchImpl: f })
    expect(f).toHaveBeenCalledTimes(1)
    expect(text!.length).toBeLessThanOrEqual(16384)
  })
  it('sends a 4 KB Range and returns STEP text', async () => {
    const f = vi.fn(async () => new Response(IFC4, { status: 206 }))
    expect(await fetchHeader('https://cdn.example/a.ifc', { fetchImpl: f })).toContain('FILE_SCHEMA')
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ Range: 'bytes=0-4095' })
  })
  it('fails quietly: CORS error, 404, non-STEP, non-http', async () => {
    expect(await fetchHeader('https://x/a.ifc', { fetchImpl: async () => { throw new TypeError('cors') } })).toBeNull()
    expect(await fetchHeader('https://x/a.ifc', { fetchImpl: async () => new Response('no', { status: 404 }) })).toBeNull()
    expect(await fetchHeader('https://x/a.ifczip', { fetchImpl: async () => new Response('PK\u0003\u0004') })).toBeNull()
    expect(await fetchHeader('blob:abc')).toBeNull()
  })
})

function mount(extra = '') {
  document.body.innerHTML = `<section data-ifcvo-compat data-size-mb="12" ${extra}><div data-ifcvo-compat-body>
    <div data-ifcvo-compat-header></div><div data-ifcvo-compat-apps></div><div data-ifcvo-compat-weight></div><div data-ifcvo-compat-health></div></div></section>`
  return document.querySelector('[data-ifcvo-compat]') as HTMLElement
}

beforeEach(() => { _reset(); delete (window as unknown as { IFCVO?: unknown }).IFCVO })

describe('rendering', () => {
  it('typical apps when the merchant lists none, labelled typical', () => {
    const root = mount()
    renderCompat(root, parseHeader(IFC4))
    expect(root.textContent).toContain('ReferenceView_V1.2')
    expect(root.textContent).toContain(DEFAULT_APPS.IFC4[0])
    expect(root.textContent).toMatch(/typical/)
  })
  it('the merchant list wins', () => {
    const root = mount()
    const apps = root.querySelector('[data-ifcvo-compat-apps]') as HTMLElement
    apps.dataset.merchant = '1'; apps.innerHTML = '<li>Revit 2022 tested</li>'
    renderCompat(root, parseHeader(IFC4))
    expect(apps.textContent).toBe('Revit 2022 tested')
  })
  it('weight meter and health badge are accessible; text is never HTML', () => {
    const root = mount()
    renderWeight(root, { sizeMb: 12, elements: 800 })
    expect(root.querySelector('meter')!.getAttribute('aria-label')).toBe('File weight: Light')
    renderHealth(root, 82.4, [{ label: '<img src=x onerror=alert(1)>', count: 2 }])
    expect(root.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Health Score: 82 / 100')
    expect(root.querySelector('img')).toBeNull()
  })
  it('gated off on the free plan; on starter it mounts', () => {
    const gate = vi.fn(() => false)
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate }
    mount(); init()
    expect(gate).toHaveBeenCalledWith('compat', expect.anything())
  })
  it('health events from the viewer render score + categories, hide setting respected', async () => {
    let cb: (t: string, e: unknown) => void = () => {}
    const viewer = { getIssues: vi.fn(async () => ({ qualityScore: 70, total: 1, issues: [{ ruleId: 'missing-name', severity: 'warning' }] })) }
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: () => true, subscribe: (_r: unknown, f: typeof cb) => { cb = f }, viewer }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const root = mount()
    init()
    cb('model-loaded', { elementCount: 60000 })
    expect(root.textContent).toContain('Heavy')
    cb('validation-completed', { qualityScore: 70 })
    await vi.waitFor(() => expect(root.textContent).toContain('Missing name (1)'))
    vi.unstubAllGlobals()
  })
})

describe('header fetch failures end in a final state', () => {
  const waitingRoot = () => {
    document.body.innerHTML = `<section data-ifcvo-compat data-model="https://cdn.example/a.ifc" data-unavailable="Not available"><div data-ifcvo-compat-body>
      <div data-ifcvo-compat-header><p>Reading the file header…</p></div><div data-ifcvo-compat-apps data-merchant="1"><li>Revit 2023</li></div></div></section>`
    return document.querySelector('[data-ifcvo-compat]') as HTMLElement
  }
  const cases: Array<[string, () => Promise<Response>]> = [
    ['CORS', async () => { throw new TypeError('Failed to fetch') }],
    ['404', async () => new Response('nope', { status: 404 })],
    ['non-STEP', async () => new Response('PK zip')],
    ['empty header', async () => new Response('ISO-10303-21;HEADER;ENDSEC;')],
  ]
  for (const [name, impl] of cases) {
    it(name, async () => {
      vi.stubGlobal('fetch', vi.fn((_u: string, o?: RequestInit) => (o && o.method === 'HEAD' ? Promise.reject(new Error('x')) : impl())))
      const root = waitingRoot(); init()
      const box = root.querySelector('[data-ifcvo-compat-header]') as HTMLElement
      await vi.waitFor(() => expect(box.dataset.state).toBe('unavailable'))
      expect(root.textContent).not.toContain('Reading the file header')
      expect(box.textContent).toBe('Not available')
      expect(root.textContent).toContain('Revit 2023')
      vi.unstubAllGlobals()
    })
  }
  it('timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_u: string, o?: RequestInit) => new Promise((_, rej) => o?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))))
    const root = waitingRoot(); init()
    await vi.advanceTimersByTimeAsync(4100)
    vi.useRealTimers()
    await vi.waitFor(() => expect((root.querySelector('[data-ifcvo-compat-header]') as HTMLElement).dataset.state).toBe('unavailable'))
    vi.unstubAllGlobals()
  })
})

describe('rule labels', () => {
  it('maps known ruleIds, translated map wins, unknown ids humanised', () => {
    expect(ruleLabel('RULE_DUPLICATE_GUID')).toBe(RULE_LABELS.duplicate_guid)
    expect(ruleLabel('RULE_EMPTY_NAME', { empty_name: 'Nombres vacíos' })).toBe('Nombres vacíos')
    expect(ruleLabel('RULE_SOMETHING_NEW')).toBe('Something new')
  })
  it('every mapped rule has a locale key', () => {
    for (const k of Object.keys(RULE_LABELS)) expect(locales.ifcvo.compat.rules[k], k).toBeTruthy()
    expect(I18N_GROUPS.compat_rules).toBe('ifcvo.compat.rules.')
    expect(block).toContain('data-i18n-rule-labels="compat_rules"')
  })
})

describe('block, plan and locales', () => {
  it('schema ≤ 25 settings, unique ids, section target', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
  })
  it('every Liquid output is escaped (except style/asset/attributes)', () => {
    const outs = body.match(/\{\{[^}]*\}\}/g) || []
    for (const o of outs) {
      if (/| json|ifcvo_style|asset_url|shopify_attributes|s\.radius|s\.accent|s\.show_health/.test(o)) continue
      expect(o, o).toMatch(/\|\s*escape/)
    }
  })
  it('compat is a starter feature and the runtime copy is in sync', () => {
    expect(FEATURE_TIERS.compat).toBe('starter')
    expect(withTiers(runtime)).toBe(runtime)
  })
  it('locale keys used by the block exist', () => {
    for (const m of body.matchAll(/'ifcvo\.compat\.(\w+)' \| t/g)) expect(locales.ifcvo.compat[m[1]]).toBeTruthy()
  })
})
