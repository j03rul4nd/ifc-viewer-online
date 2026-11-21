// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _reset, init, LABELS, NBS_MANUAL, NBS_CLASSES, config, typeCheck, withTypeCheck, refresh, render, runChecks, safeIdsUrl, summarize, withTimeout,
// @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-compliance.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'
import { NBS_BOS_MANUAL } from '../src/lib/eir/eir-profile-nbs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-compliance.liquid'), 'utf8')
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const locale = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')

const spec = (name: string, status: 'pass' | 'fail' | 'na') => ({ name, status, applicableCount: 1, passedCount: 0, failedCount: 0, failures: [], unsupported: [] })
const NBS = { score: 50, totalSpecs: 4, passedSpecs: 2, failedSpecs: 1, naSpecs: 1, specs: [
  spec('Door: has the IFC common property set Pset_DoorCommon', 'pass'),
  spec('Door: carries a classification code', 'pass'),
  spec('Door: classified with Uniclass 2015', 'fail'),
  spec('Window: carries a classification code', 'na'),
] }
const IDS_OK = { score: 100, totalSpecs: 2, passedSpecs: 2, failedSpecs: 0, naSpecs: 0, specs: [spec('A', 'pass'), spec('B', 'pass')] }

function mount(attrs: Record<string, string> = {}): HTMLElement {
  const a = { 'show-nbs': 'true', 'show-ids': 'true', 'show-score': 'true', 'show-details': 'true', 'show-manual': 'false', 'ids-url': 'https://cdn.example.com/req.ids', timeout: '30', locale: 'en', ...attrs }
  document.body.insertAdjacentHTML('beforeend', `<div data-ifcvo-compliance ${Object.entries(a).map(([k, v]) => `data-${k}='${v}'`).join(' ')}><div data-ifcvo-live></div></div>`)
  return document.body.lastElementChild as HTMLElement
}
const viewer = (over: Record<string, unknown> = {}) => ({
  checkEir: vi.fn().mockResolvedValue(NBS),
  checkIds: vi.fn().mockResolvedValue(IDS_OK),
  validate: vi.fn().mockResolvedValue({ qualityScore: 82.4 }),
  getModels: vi.fn().mockResolvedValue([{ id: 'm' }]),
  findElements: vi.fn().mockResolvedValue([]),
  getElement: vi.fn().mockResolvedValue(null),
  on: vi.fn(),
  ...over,
})

beforeEach(() => {
  document.body.innerHTML = ''
  _reset()
  delete (window as unknown as { IFCVO?: unknown }).IFCVO
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<ids/>') }))
})

describe('ifc-compliance block (Liquid)', () => {
  it('valid schema, unique ids, at most 25 settings', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
    for (const id of ['show_nbs', 'show_ids', 'show_score', 'show_details', 'ids_url', 'timeout']) expect(ids).toContain(id)
  })

  it('escapes every setting and label written into the page', () => {
    for (const m of block.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
      const expr = m[1]
      if (/^s\.(show_\w+|radius|accent)$|^ifcvo_style$|asset_url|^block\.shopify_attributes$|^'ifcvo\.compliance\.\w+' \| t \| json$/.test(expr)) continue
      expect(expr, expr).toMatch(/\| (escape|json \| escape)$/)
    }
  })

  it('IDS URL from the setting, else the metafield; only https', () => {
    expect(block).toContain('product.metafields[ns].ids_url.value')
    expect(block).toMatch(/ids_head == 'https:\/\/'/)
  })

  it('every label key exists in the locale file and in the JS defaults', () => {
    const keys = [...block.matchAll(/"(\w+)":\{\{ 'ifcvo\.compliance\.(\w+)' \| t \| json \}\}/g)]
    expect(keys.length).toBe(Object.keys(LABELS).length)
    for (const [, js, loc] of keys) {
      expect(LABELS).toHaveProperty(js)
      expect(locale.ifcvo.compliance[loc], loc).toBeTruthy()
    }
  })

  it('gated business, in the build table and the runtime copy', () => {
    expect(FEATURE_TIERS.compliance).toBe('business')
    expect(runtime).toContain('"compliance":"business"')
    expect(block).toContain('data-ifcvo-tier="compliance"')
  })

  it('manual clause list matches the profile', () => {
    expect(NBS_MANUAL.length).toBeGreaterThan(0)
    expect(NBS_BOS_MANUAL.length).toBeGreaterThanOrEqual(NBS_MANUAL.length)
  })
})

describe('ifcvo-compliance.js', () => {
  it('safeIdsUrl keeps https only', () => {
    expect(safeIdsUrl('https://a.example/x.ids')).toBe('https://a.example/x.ids')
    expect(safeIdsUrl('http://a.example/x.ids')).toBeNull()
    expect(safeIdsUrl('javascript:alert(1)')).toBeNull()
    expect(safeIdsUrl('/x.ids')).toBeNull()
    expect(config(mount({ 'ids-url': 'http://x' })).idsUrl).toBeNull()
  })

  it('IfcTypeObject clause: counted outside IDS and added to the NBS score as its own line', async () => {
    const v = viewer({
      findElements: vi.fn().mockResolvedValue([{ expressId: 1, modelId: 'm' }, { expressId: 2, modelId: 'm' }]),
      getElement: vi.fn().mockImplementation((id: number) => Promise.resolve(id === 1 ? { typeId: 9 } : { typeId: null })),
    })
    expect(await typeCheck(v)).toEqual({ typed: 1, total: 2 })
    expect(v.findElements).toHaveBeenCalledWith({ ifcClass: NBS_CLASSES, limit: 200 })
    const root = mount({ 'ids-url': '', 'show-score': 'false' })
    const res = await runChecks(v, config(root))
    expect(res.nbs.value).toMatchObject({ total: 4, passed: 2, failed: 2 })
    render(root, res)
    expect(root.querySelector('[data-badge="nbs"]')!.textContent).toBe('NBS object standard: 2/4 checks')
    expect(root.querySelector('[data-ifcvo-typecheck]')!.textContent).toBe('Type object (IfcTypeObject): 1/2 product elements (checked outside IDS)')
    expect(root.querySelector('details')!.textContent).toContain('1 product elements have no type object')
    expect(withTypeCheck(summarize(NBS), { typed: 3, total: 3 })).toMatchObject({ total: 4, passed: 3, failed: 1 })
    expect(withTypeCheck(summarize(NBS), null).typeCheck).toBeUndefined()
  })

  it('summarize ignores n/a specs', () => {
    expect(summarize(NBS)).toEqual({ total: 3, passed: 2, failed: 1, failures: ['Door: classified with Uniclass 2015'] })
    expect(summarize(null).total).toBe(0)
  })

  it('timeout caps a hung check', async () => {
    vi.useFakeTimers()
    const p = withTimeout(new Promise(() => {}), 1000)
    vi.advanceTimersByTime(1001)
    await expect(p).rejects.toThrow('timeout')
    vi.useRealTimers()
  })

  it('runs the built-in NBS profile, the IDS file and the Health Score, in that order', async () => {
    const v = viewer()
    const root = mount()
    const res = await runChecks(v, config(root))
    expect(v.checkEir).toHaveBeenCalledWith('builtin-nbs-bos')
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/req.ids', expect.objectContaining({ credentials: 'omit' }))
    expect(v.checkIds).toHaveBeenCalledWith('<ids/>')
    expect(res.score).toEqual({ ok: true, value: 82 })
  })

  it('renders badges, failed list in plain text, and the honest note', () => {
    const root = mount()
    render(root, { nbs: { ok: true, value: summarize(NBS) }, ids: { ok: true, value: summarize(IDS_OK) }, score: { ok: true, value: 82 } }, new Date('2026-11-21T12:00:00Z'))
    const badges = [...root.querySelectorAll('[data-badge]')].map((b) => [(b as HTMLElement).dataset.badge, (b as HTMLElement).dataset.state, b.textContent])
    expect(badges).toEqual([
      ['nbs', 'fail', 'NBS object standard: 2/3 checks'],
      ['ids', 'pass', 'IDS: pass (2/2)'],
      ['score', 'pass', 'Health Score: 82/100'],
    ])
    expect(root.querySelector('details summary')!.textContent).toBe('What did not pass (1)')
    expect(root.querySelector('details li')!.textContent).toBe('Door: classified with Uniclass 2015')
    expect(root.querySelector('[data-ifcvo-note]')!.textContent).toMatch(/2026.*not a certification/)
  })

  it('failure names are text, never HTML', () => {
    const root = mount()
    render(root, { nbs: { ok: true, value: { total: 1, passed: 0, failed: 1, failures: ['<img src=x onerror=alert(1)>'] } } })
    expect(root.querySelector('img')).toBeNull()
  })

  it('merchant chooses badges; a failed check does not hide the others', () => {
    const root = mount({ 'show-score': 'false', 'show-ids': 'false', 'show-manual': 'true' })
    render(root, { nbs: { ok: false }, score: { ok: true, value: 90 } })
    const b = [...root.querySelectorAll('[data-badge]')] as HTMLElement[]
    expect(b.map((x) => x.dataset.badge)).toEqual(['nbs'])
    expect(b[0].dataset.state).toBe('error')
    expect(root.querySelectorAll('.ifcvo-manual li').length).toBe(NBS_MANUAL.length)
  })

  it('no IDS URL → no IDS badge and no fetch', async () => {
    const v = viewer()
    const root = mount({ 'ids-url': '' })
    const res = await runChecks(v, config(root))
    expect(res.ids).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('waits for a loaded model, and stays off when the plan gate says no', async () => {
    const gated = mount()
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: vi.fn().mockReturnValue(false) }
    init()
    expect(gated.querySelector('[data-ifcvo-live]')!.textContent).toBe('')
    _reset(); document.body.innerHTML = ''
    const v = viewer()
    const root = mount()
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: () => true, viewer: v }
    init()
    expect(root.querySelector('[data-ifcvo-live]')!.textContent).toBe(LABELS.waiting)
    await vi.waitFor(() => expect(root.querySelector('[data-badge="nbs"]')).not.toBeNull())
    expect(v.on).toHaveBeenCalledWith('model-loaded', expect.any(Function))
  })

  it('a viewer without a model is not checked at init', async () => {
    const v = viewer({ getModels: vi.fn().mockResolvedValue([]) })
    mount()
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: () => true, viewer: v }
    init()
    await new Promise((r) => setTimeout(r, 120))
    expect(v.checkEir).not.toHaveBeenCalled()
    await refresh(v)
    expect(v.checkEir).toHaveBeenCalledTimes(1)
  })
})
