// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _reset, csvCell, groupRows, init, labelsOf, moneyText, onViewer, parsePrices, qtyText, quoteText, render, rowPrice, sendToQuote, sortRows, takeoffCsv, LABELS,
// @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-data/assets/ifcvo-takeoff.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-data')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-takeoff.liquid'), 'utf8')
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const locale = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')

const row = (o: Record<string, unknown>) => ({
  key: 'k', ifcClass: 'IFCBEAM', type: 'HEA200', material: 'S355', profile: 'HEA200', storey: 'L1', count: 1,
  length: null, area: null, volume: null, weight: null, missing: { length: 0, area: 0, volume: 0, weight: 0 }, sources: { length: [], weight: [] }, ...o,
})
const TAKEOFF = {
  rows: [
    row({ key: 'a', count: 2, length: 10, weight: 423, sources: { length: ['qto'], weight: ['qto'] } }),
    row({ key: 'b', storey: 'L2', count: 1, length: 4, weight: 169 }),
    row({ key: 'c', ifcClass: 'IFCSLAB', type: 'Floor 200', material: 'Concrete', profile: null, storey: 'L1', count: 3, area: 60, volume: 12, missing: { length: 3, area: 0, volume: 0, weight: 3 } }),
  ],
  steel: [{ profile: 'HEA200', count: 3, length: 14, kgPerM: 42.3, weight: 592, missingWeight: 0, missingLength: 0, estimated: false }],
  totals: { count: 6, length: 14, area: 60, volume: 12, weight: 592 }, truncated: false,
  units: { length: 'm', area: 'm2', volume: 'm3', weight: 'kg' },
}
const DATA = { elementCount: 6, truncated: false, classes: [], types: [], materials: [], totals: { count: 6 }, takeoff: TAKEOFF }

function mount(attrs: Record<string, string> = {}, inner = ''): HTMLElement {
  const a = { units: 'metric', group: 'type', 'show-steel': 'true', csv: 'true', quote: 'true', currency: 'EUR', ...attrs }
  const div = document.createElement('div')
  div.setAttribute('data-ifcvo-takeoff', '')
  for (const [k, v] of Object.entries(a)) div.setAttribute(`data-${k}`, v)
  div.innerHTML = `${inner}<div data-ifcvo-live></div>`
  document.body.append(div)
  return div
}

beforeEach(() => { document.body.innerHTML = ''; _reset(); delete (window as unknown as { IFCVO?: unknown }).IFCVO })

describe('ifc-takeoff block (Liquid)', () => {
  it('valid schema, ≤ 25 settings, unique ids, units and grouping options', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    expect(new Set(ids).size).toBe(ids.length)
    expect(schema.target).toBe('section')
    expect(schema.settings.find((s: { id: string }) => s.id === 'units').options.map((o: { value: string }) => o.value)).toEqual(['metric', 'imperial'])
    expect(schema.settings.find((s: { id: string }) => s.id === 'group').options.map((o: { value: string }) => o.value)).toEqual(['type', 'material', 'storey'])
  })

  it('escapes every setting and metafield written into the page', () => {
    for (const m of block.matchAll(/="\{\{\s*([^}]*?)\s*\}\}"/g)) {
      if (!/^s\.(show_steel|csv|quote)$|^ifcvo_style$|asset_url$/.test(m[1])) expect(m[1]).toMatch(/\| escape$/)
    }
    for (const m of block.matchAll(/\{\{\s*(c \|[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| escape$/)
    for (const m of block.matchAll(/\{\{\s*('ifcvo\.takeoff\.[a-zA-Z]+' \| t[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| (escape|json)$/)
  })

  it('server-renders bim.boq as a table and reads bim.unit_prices', () => {
    expect(block).toContain('{%- if mf.boq != blank -%}')
    expect(block).toMatch(/<table[^>]*data-ifcvo-boq-static/)
    expect(block).toContain('<th scope="col">')
    expect(block).toContain('mf.unit_prices.value | json | escape')
  })

  it('every label key exists in en.default.json and in LABELS', () => {
    for (const m of block.matchAll(/'ifcvo\.takeoff\.([a-zA-Z]+)'/g)) expect(locale.ifcvo.takeoff[m[1]], m[1]).toBeTruthy()
    expect(Object.keys(locale.ifcvo.takeoff).sort()).toEqual(Object.keys(LABELS).sort())
  })

  it("is gated as 'takeoff', business in the plan table and the runtime copy", () => {
    expect(block).toContain('data-ifcvo-tier="takeoff"')
    expect(FEATURE_TIERS.takeoff).toBe('business')
    expect(runtime).toMatch(/"takeoff":"business"/)
  })
})

describe('pure helpers', () => {
  it('units metric and imperial', () => {
    expect(qtyText(10, 'length')).toBe('10 m')
    expect(qtyText(10, 'length', 'imperial')).toBe('32.8 ft')
    expect(qtyText(1, 'area', 'imperial')).toBe('10.8 ft²')
    expect(qtyText(100, 'weight', 'imperial')).toBe('220 lb')
    expect(qtyText(null, 'weight')).toBeNull()
  })

  it('groups by type, material and storey and sums', () => {
    const t = groupRows(TAKEOFF, 'type')
    expect(t.map((g: { name: string }) => g.name)).toEqual(['Beam · HEA200', 'Slab · Floor 200'])
    expect(t[0]).toMatchObject({ count: 3, length: 14, weight: 592 })
    expect(t[1].missing).toBe(true)
    expect(groupRows(TAKEOFF, 'storey').map((g: { name: string }) => g.name)).toEqual(['L1', 'L2'])
    expect(groupRows(TAKEOFF, 'material').find((g: { name: string }) => g.name === 'Concrete').volume).toBe(12)
  })

  it('sorts by number with unknowns last', () => {
    const g = groupRows(TAKEOFF, 'type')
    expect(sortRows(g, 'weight', 'descending')[0].name).toBe('Beam · HEA200')
    expect(sortRows(g, 'weight', 'ascending')[1].weight).toBeNull()
  })

  it('unit prices: per unit, key order, junk dropped', () => {
    const p = parsePrices('{"HEA200":{"price":2,"per":"kg"},"concrete":{"price":100,"per":"m3"},"bad":"x","neg":-1}')
    expect(Object.keys(p)).toEqual(['hea200', 'concrete'])
    expect(rowPrice(TAKEOFF.rows[0], p)).toBe(846)
    expect(rowPrice(TAKEOFF.rows[2], p)).toBe(1200)
    expect(rowPrice(TAKEOFF.rows[2], parsePrices({ Concrete: { price: 1, per: 'kg' } }))).toBeNull()
    expect(rowPrice(TAKEOFF.rows[2], parsePrices({ IFCSLAB: 5 }))).toBe(15)
    expect(parsePrices('not json')).toEqual({})
    expect(moneyText(12.5, 'USD')).toBe('$12.50')
    expect(moneyText(1, 'EUR', 'not a locale')).toBe('€1.00')
  })

  it('CSV is formula-injection safe and in the chosen units', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    expect(csvCell('-1')).toBe('"\'-1"')
    const lines = groupRows({ rows: [row({ type: '=cmd|calc', profile: null, length: 1 })] }, 'type')
    const csv = takeoffCsv(lines, TAKEOFF.steel, { system: 'imperial' })
    expect(csv).toContain('"Length (ft)"')
    expect(csv).toContain('"3.281"')
    expect(csv).not.toMatch(/(^|,)"=/m)
    expect(csv).toContain('"Steel by profile"')
  })

  it('quote text lists every line', () => {
    const t = quoteText(groupRows(TAKEOFF, 'type'), { product: 'Kit A' })
    expect(t).toContain('Product: Kit A')
    expect(t).toContain('- 3 x Beam · HEA200 (14 m, 592 kg)')
  })
})

describe('DOM', () => {
  it('renders a table with sortable headers (aria-sort) and a steel table', () => {
    const root = mount()
    render(root, DATA)
    const th = [...root.querySelectorAll('table.ifcvo-takeoff thead th')]
    expect(th[0].getAttribute('aria-sort')).toBe('ascending')
    expect(th[1].getAttribute('aria-sort')).toBe('none')
    ;(th[3].querySelector('button') as HTMLButtonElement).click()
    const th2 = [...root.querySelectorAll('table.ifcvo-takeoff thead th')]
    expect(th2[3].getAttribute('aria-sort')).toBe('ascending')
    expect(root.querySelector('tbody th[scope="row"]')!.textContent).toBe('Slab · Floor 200')
    expect(root.querySelector('table.ifcvo-takeoff-steel tbody')!.textContent).toContain('42.3 kg/m')
    expect(root.querySelector('tfoot')!.textContent).toContain('6')
  })

  it('regroups from the select and shows indicative totals only with prices', () => {
    const root = mount({ prices: '{"HEA200":{"price":2,"per":"kg"}}' })
    render(root, DATA)
    expect(root.querySelector('[data-ifcvo-indicative]')!.textContent).toMatch(/€1,184\.00.*not a quote/)
    const sel = root.querySelector('select') as HTMLSelectElement
    sel.value = 'storey'
    sel.dispatchEvent(new Event('change'))
    expect(root.querySelector('table')!.getAttribute('data-group')).toBe('storey')
    const usd = mount({ prices: '{"HEA200":{"price":2,"per":"kg"}}', 'cart-currency': 'USD', locale: 'de' })
    render(usd, DATA)
    const txt = usd.querySelector('[data-ifcvo-indicative]')!.textContent!
    expect(txt).toContain('Indicative, in EUR.')
    expect(txt).toMatch(/1\.184,00\s€/)
    const plain = mount()
    render(plain, DATA)
    expect(plain.querySelector('[data-ifcvo-indicative]')).toBeNull()
  })

  it('hides the server-rendered BOQ once the model table is there', () => {
    const root = mount({}, '<table data-ifcvo-boq-static></table>')
    render(root, DATA)
    expect((root.querySelector('[data-ifcvo-boq-static]') as HTMLElement).hidden).toBe(true)
    const empty = mount({}, '<table data-ifcvo-boq-static></table>')
    render(empty, { ...DATA, takeoff: { ...TAKEOFF, rows: [] } })
    expect((empty.querySelector('[data-ifcvo-boq-static]') as HTMLElement).hidden).toBe(false)
  })

  it('fills the contact form and fires the takeoff event', () => {
    document.body.insertAdjacentHTML('beforeend', '<form action="/contact"><textarea name="contact[body]"></textarea></form>')
    const root = mount({ product: 'Kit' })
    const seen = vi.fn()
    document.addEventListener('ifcvo:takeoff-quote', seen)
    expect(sendToQuote(root, groupRows(TAKEOFF, 'type'), { system: 'metric', product: 'Kit' })).toBe(true)
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toContain('3 x Beam · HEA200')
    expect(seen).toHaveBeenCalledOnce()
    document.querySelector('form')!.remove()
    expect(sendToQuote(root, [], { system: 'metric' })).toBe(false)
  })

  it('label layers: theme, shop, block', () => {
    const root = mount({ labels: '{"title":"translation missing: x","csv":"CSV"}', 'labels-override': 'count=Qty' })
    const l = labelsOf(root)
    expect(l.title).toBe(LABELS.title)
    expect(l.csv).toBe('CSV')
    expect(l.count).toBe('Qty')
  })

  it('gates on the plan and reads the viewer on load', async () => {
    const root = mount()
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: (f: string) => f !== 'takeoff' }
    init()
    expect(root.textContent).toBe('')
    _reset()
    const ok = mount()
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: () => true }
    init()
    expect(ok.textContent).toContain(LABELS.waiting)
    const viewer = { getProductData: vi.fn().mockResolvedValue(DATA) }
    onViewer(new CustomEvent('ifcvo:loaded', { detail: { viewer } }))
    await vi.waitFor(() => expect(ok.querySelector('table.ifcvo-takeoff')).toBeTruthy())
  })
})
