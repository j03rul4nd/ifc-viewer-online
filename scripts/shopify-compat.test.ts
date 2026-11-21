// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_APPS, _reset, fetchHeader, init, normalizeSchema, parseHeader, renderCompat, renderHealth, renderWeight, topCategories, weightBand,
  // @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-compat.js'
import { FEATURE_TIERS, withTiers } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-compat.liquid'), 'utf8')
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')
const locales = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
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
    expect(top.map((c: { label: string }) => c.label)).toEqual(['Missing name', 'Duplicate guid', 'No storey'])
    expect(top[0].count).toBe(4)
  })
})

describe('fetchHeader', () => {
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
      if (/ifcvo_style|asset_url|shopify_attributes|s\.radius|s\.accent|s\.show_health/.test(o)) continue
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
