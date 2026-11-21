// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _reset, areaText, chipValues, config, footprintText, highlight, init, labelsOf, onViewer, render, schedule,
// @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-rooms.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-rooms.liquid'), 'utf8')
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const locale = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')

const room = (o: Record<string, unknown>) => ({ modelId: 'm', expressId: 1, globalId: null, name: null, longName: null, number: null, label: '', area: null, areaSource: null, netArea: null, grossArea: null, height: null, storey: null, kind: null, ...o })
const DATA = {
  elementCount: 10, truncated: false, classes: [], types: [], materials: [], totals: { count: 10 },
  dimensions: { w: 12, d: 8.5, h: 6, unit: 'm', source: 'bbox' },
  rooms: {
    storeys: [
      { name: 'Ground', elevation: 0, count: 2, area: 40, netArea: 30, grossArea: null, rooms: [
        room({ expressId: 11, number: '001', label: 'Living', area: 30, areaSource: 'net', height: 2.7 }),
        room({ expressId: 12, number: '002', label: 'WC', area: 10, areaSource: 'geometry' }),
      ] },
      { name: 'Level 1', elevation: 3, count: 1, area: 14, netArea: 14, grossArea: null, rooms: [room({ expressId: 21, label: 'Bedroom', area: 14, areaSource: 'net' })] },
    ],
    totals: { count: 3, area: 54, netArea: 44, grossArea: null }, bedrooms: 1, bathrooms: 1, inferred: true, geometryAreas: true, truncated: false,
    units: { area: 'm2', length: 'm' },
  },
}

function mount(attrs: Record<string, string> = {}, chips = ''): HTMLElement {
  const a = { units: 'm2', 'show-table': 'true', 'show-chips': 'true', highlight: 'true', ...attrs }
  document.body.insertAdjacentHTML('beforeend', `<div data-ifcvo-rooms ${Object.entries(a).map(([k, v]) => `data-${k}='${v}'`).join(' ')}>
    <ul data-ifcvo-chips>${chips}</ul><div data-ifcvo-live></div></div>`)
  return document.body.lastElementChild as HTMLElement
}

beforeEach(() => { document.body.innerHTML = ''; _reset(); delete (window as unknown as { IFCVO?: unknown }).IFCVO })

describe('ifc-rooms block (Liquid)', () => {
  it('valid schema, unique ids, m²/ft² setting', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(schema.target).toBe('section')
    expect(schema.settings.find((s: { id: string }) => s.id === 'units').options.map((o: { value: string }) => o.value)).toEqual(['m2', 'ft2'])
  })

  it('escapes every setting and metafield written into the page', () => {
    for (const m of block.matchAll(/="\{\{\s*([^}]*?)\s*\}\}"/g)) {
      if (!/^s\.(show_table|show_chips|highlight)$|^ifcvo_style$|asset_url$/.test(m[1])) expect(m[1]).toMatch(/\| escape/)
    }
    for (const m of block.matchAll(/\{\{\s*(mf\.[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| escape$/)
    for (const m of block.matchAll(/\{\{\s*('ifcvo\.rooms\.[a-z]+' \| t[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| (escape|json)$/)
  })

  it('server-renders chips from bim.area / bedrooms / bathrooms / storeys', () => {
    for (const k of ['area', 'bedrooms', 'bathrooms', 'storeys']) {
      expect(block).toContain(`{%- if mf.${k} != blank -%}`)
      expect(block).toMatch(new RegExp(`data-key="${k}" data-source="metafield"`))
    }
  })

  it('every label key used exists in en.default.json', () => {
    for (const m of block.matchAll(/'ifcvo\.rooms\.([a-z]+)'/g)) expect(locale.ifcvo.rooms[m[1]], m[1]).toBeTruthy()
  })

  it("is gated as 'rooms', free in the plan table and the runtime copy", () => {
    expect(block).toContain('data-ifcvo-tier="rooms"')
    expect(FEATURE_TIERS.rooms).toBe('free')
    expect(runtime).toMatch(/"rooms":"free"/)
  })
})

describe('pure helpers', () => {
  it('areas in m² and ft²', () => {
    expect(areaText(54)).toBe('54 m²')
    expect(areaText(100, 'ft2')).toBe('1,076 ft²')
    expect(areaText(null)).toBeNull()
  })

  it('chips from the model; zero counts are hidden', () => {
    expect(chipValues(DATA)).toEqual({ area: '54 m²', storeys: '2', bedrooms: '1', bathrooms: '1', footprint: '12 m × 8.5 m' })
    expect(chipValues({ ...DATA, rooms: { ...DATA.rooms, bedrooms: 0 } }).bedrooms).toBeNull()
    expect(chipValues({ dimensions: null, rooms: null })).toEqual({ area: null, storeys: null, bedrooms: null, bathrooms: null, footprint: null })
    expect(footprintText({ w: 10, d: null })).toBeNull()
  })

  it('schedule rows per storey with refs and geometry flag', () => {
    const s = schedule(DATA.rooms)
    expect(s.map((g: { storey: string; total: string }) => [g.storey, g.total])).toEqual([['Ground', '40 m²'], ['Level 1', '14 m²']])
    expect(s[0].rows[1]).toMatchObject({ label: 'WC', geometry: true, ref: { expressId: 12, modelId: 'm' } })
  })

  it('labels: defaults ← locale ← shop labels ← textarea; "translation missing" ignored', () => {
    const r = mount({ labels: JSON.stringify({ title: 'Stanze', room: 'translation missing: x' }), 'ifcvo-labels': JSON.stringify({ es: { room: 'Estancia' } }), locale: 'es', 'labels-override': 'total=Suma' })
    const l = labelsOf(r)
    expect(l).toMatchObject({ title: 'Stanze', room: 'Estancia', total: 'Suma', area: 'Total area' })
    expect(config(r).unit).toBe('m2')
  })
})

describe('render', () => {
  it('metafield chips win; the model fills the rest in order', () => {
    const r = mount({}, '<li data-key="bedrooms" data-source="metafield"><strong>4</strong></li>')
    render(r, DATA, null)
    const chips = [...r.querySelectorAll('[data-ifcvo-chips] li')] as HTMLElement[]
    expect(chips.map((c) => c.dataset.key)).toEqual(['area', 'storeys', 'bedrooms', 'bathrooms', 'footprint'])
    expect(r.querySelector('[data-key="bedrooms"]')!.textContent).toBe('4')
  })

  it('tables grouped by storey with totals, ft², ≈ for geometry areas, inferred note', () => {
    const r = mount({ units: 'ft2' })
    render(r, DATA, null)
    const tables = r.querySelectorAll('table')
    expect(tables).toHaveLength(2)
    expect(tables[0].querySelector('caption')!.textContent).toBe('Ground')
    expect(tables[0].querySelector('tfoot')!.textContent).toContain('431 ft²')
    expect(tables[0].querySelectorAll('tbody tr')[1].textContent).toContain('≈ 108 ft²')
    expect(r.textContent).toContain('counted from the room names')
  })

  it('clicking a room selects and frames it when the viewer can', () => {
    const viewer = { select: vi.fn(), frame: vi.fn(() => Promise.resolve()) }
    const r = mount()
    render(r, DATA, viewer)
    ;(r.querySelector('tbody .ifcvo-row') as HTMLButtonElement).click()
    expect(viewer.select).toHaveBeenCalledWith(11, 'm')
    expect(viewer.frame).toHaveBeenCalledWith({ elementId: 11, modelId: 'm' })
    expect(highlight({}, { expressId: 1 })).toBe(false)
    const plain = mount({ highlight: 'false' })
    render(plain, DATA, viewer)
    expect(plain.querySelector('tbody .ifcvo-row')).toBeNull()
  })

  it('shows truncated and unknown-unit notes', () => {
    const r = mount()
    render(r, { ...DATA, rooms: { ...DATA.rooms, truncated: true, unknownUnits: true } }, null)
    expect(r.querySelector('[data-ifcvo-truncated]')!.textContent).toContain('only the first rooms')
    expect(r.querySelector('[data-ifcvo-units]')).not.toBeNull()
    const plain = mount()
    render(plain, DATA, null)
    expect(plain.querySelector('[data-ifcvo-truncated]')).toBeNull()
  })

  it('a model without spaces says so', () => {
    const r = mount()
    render(r, { ...DATA, rooms: null }, null)
    expect(r.textContent).toContain('no rooms')
  })

  it('escapes model text (no HTML injection)', () => {
    const r = mount()
    render(r, { ...DATA, rooms: { ...DATA.rooms, storeys: [{ ...DATA.rooms.storeys[1], name: '<img src=x onerror=alert(1)>' }] } }, null)
    expect(r.querySelector('img')).toBeNull()
  })
})

describe('lifecycle', () => {
  it('reads the viewer announced by ifcvo:viewer and respects the gate', async () => {
    const r = mount()
    const viewer = { getProductData: vi.fn(async () => DATA), on: vi.fn() }
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: (f: string) => f === 'rooms' }
    init()
    onViewer(new CustomEvent('ifcvo:viewer', { detail: { viewer } }))
    await vi.waitFor(() => expect(r.querySelectorAll('table')).toHaveLength(2))
    expect(viewer.on).toHaveBeenCalledWith('model-loaded', expect.any(Function))
  })

  it('a gated-off block is not mounted', () => {
    const r = mount()
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: () => false }
    init()
    expect(r.querySelector('[data-ifcvo-live]')!.textContent).toBe('')
  })
})
