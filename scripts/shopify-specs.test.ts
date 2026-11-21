// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COLUMNS, _reset, attach, config, convert, csvCell, init, list, onViewer, parseLabels, refresh, render, tables, toCsv,
// @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-specs.js'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-specs.liquid'), 'utf8')
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])

const DATA = {
  elementCount: 3, truncated: false,
  classes: [{ ifcClass: 'IFCDOOR', count: 2 }, { ifcClass: 'IFCBEAM', count: 1 }],
  types: [
    { ifcClass: 'IFCBEAM', type: 'HEA200', count: 1, length: 6, area: null, volume: 0.02, weight: 255.6, missingWeight: 0, materials: ['S275'], properties: {} },
    { ifcClass: 'IFCDOOR', type: '=D-90', count: 2, length: null, area: 3.78, volume: null, weight: null, missingWeight: 2, materials: ['Oak'], properties: { 'Pset_DoorCommon.FireRating': 'EI30' } },
  ],
  materials: [{ name: 'Oak', count: 2 }, { name: 'S275', count: 1 }],
  totals: { count: 3, length: 6, area: 3.78, volume: 0.02, weight: 255.6 },
  units: { length: 'm', area: 'm2', volume: 'm3', weight: 'kg' },
}

/** The block's root as Liquid would render it, with metafield rows. */
function mount(attrs: Record<string, string> = {}, meta: Record<string, string> = {}): HTMLElement {
  const a = { columns: 'class,type,count,length,area,weight,materials,properties,', groups: 'types,materials,totals,', units: 'metric', csv: 'true', file: 'door-specs.csv', ...attrs }
  const rows = Object.entries(meta).map(([k, v]) => `<tr data-key="${k}"><th>${k}</th><td>${v}</td></tr>`).join('')
  document.body.insertAdjacentHTML('beforeend', `<div data-ifcvo-specs ${Object.entries(a).map(([k, v]) => `data-${k}="${v}"`).join(' ')}>
    <div data-ifcvo-static><table><tbody>${rows}</tbody></table></div><div data-ifcvo-live></div></div>`)
  return document.body.lastElementChild as HTMLElement
}

beforeEach(() => { document.body.innerHTML = ''; _reset(); delete (window as unknown as { IFCVO?: unknown }).IFCVO })

describe('ifc-specs block (Liquid)', () => {
  it('has a valid schema with unique ids, ≤ 25 settings', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
  })
  it('server-renders the metafield table (works without JS) from a configurable namespace', () => {
    expect(block).toMatch(/default: 'bim'/)
    expect(block).toMatch(/for pair in product\.metafields\[specs_ns\]/)
    expect(block).toMatch(/<td>\{\{ pair\[1\]\.value \| escape \}\}<\/td>/)
  })
  it('declares the specs tier and loads its own script next to the runtime', () => {
    expect(block).toMatch(/data-ifcvo-tier="specs"/)
    expect(block).toMatch(/'ifcvo-specs\.js' \| asset_url/)
    expect(block).toMatch(/'ifcvo\.js' \| asset_url/)
  })
  it('escapes every setting written into an attribute', () => {
    for (const m of block.matchAll(/data-[a-z-]+="\{\{ ([^}]+) \}\}"/g)) {
      if (!/s\.csv/.test(m[1])) expect(m[1]).toMatch(/\| escape/)
    }
  })
})

describe('pure helpers', () => {
  it('list keeps known items once, in order', () => {
    expect(list('weight, bogus,class,weight', COLUMNS)).toEqual(['weight', 'class'])
  })
  it('parseLabels reads key=value lines', () => {
    expect(parseLabels('weight=Peso\r\nbad\ncsv = CSV ')).toEqual({ weight: 'Peso', csv: 'CSV' })
  })
  it('converts SI to imperial', () => {
    expect(convert(1, 'length', 'imperial')).toEqual([3.28, 'ft'])
    expect(convert(100, 'weight', 'imperial')).toEqual([220.46, 'lb'])
    expect(convert(null, 'area')).toEqual([null, 'm²'])
  })
  it('builds the configured tables with units in the headers', () => {
    const t = tables(DATA, { columns: ['type', 'count', 'weight'], groups: ['types', 'totals'] })
    expect(t.map((x: { group: string }) => x.group)).toEqual(['types', 'totals'])
    expect(t[0].head).toEqual(['Type', 'Count', 'Weight (kg)'])
    expect(t[0].rows[0]).toEqual(['HEA200', 1, 255.6])
    expect(t[1].head).toEqual(['Count', 'Length (m)', 'Area (m²)', 'Volume (m³)', 'Weight (kg)'])
  })
  it('metafield values override model properties of the same name', () => {
    const t = tables(DATA, { columns: ['properties'], groups: ['types'], overrides: { firerating: 'EI60' } })
    expect(t[0].rows[1]).toEqual(['FireRating: EI60'])
  })
  it('labels override', () => {
    expect(tables(DATA, { columns: ['weight'], groups: ['types'], labels: { weight: 'Peso' } })[0].head).toEqual(['Peso (kg)'])
  })
  it('CSV is RFC 4180, BOM-prefixed and formula-safe', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell('=HYPERLINK(1)')).toBe("'=HYPERLINK(1)")
    expect(csvCell(-3)).toBe('-3')
    const csv = toCsv(tables(DATA, { columns: ['type', 'count'], groups: ['types'] }))
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain("'=D-90,2")
  })
})

describe('runtime (jsdom)', () => {
  it('config reads the data attributes and the metafield rows', () => {
    const r = mount({ properties: 'FireRating\nPset_DoorCommon.IsExternal' }, { fire_rating: 'EI60' })
    const c = config(r)
    expect(c.groups).toEqual(['types', 'materials', 'totals'])
    expect(c.properties).toEqual(['FireRating', 'Pset_DoorCommon.IsExternal'])
    expect(c.overrides).toEqual({ firerating: 'EI60' })
  })

  it('render draws light-DOM tables and a CSV button that downloads', () => {
    const r = mount()
    render(r, DATA)
    expect(r.querySelectorAll('[data-ifcvo-live] table')).toHaveLength(3)
    expect(r.querySelector('[data-ifcvo-static] table')).not.toBeNull()
    const create = vi.fn(() => 'blob:x'); const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const clicks: string[] = []
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download) }
    ;(r.querySelector('[data-ifcvo-csv]') as HTMLButtonElement).click()
    expect(create).toHaveBeenCalledOnce()
    expect(clicks).toEqual(['door-specs.csv'])
  })

  it('hides the CSV button when disabled', () => {
    const r = mount({ csv: 'false' })
    render(r, DATA)
    expect(r.querySelector('[data-ifcvo-csv]')).toBeNull()
  })

  it('respects IFCVO.gate: a gated block is not mounted', async () => {
    const gate = vi.fn(() => false)
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate }
    const r = mount()
    init()
    expect(gate).toHaveBeenCalledWith('specs', r.querySelector('[data-ifcvo-live]'))
    const viewer = { getProductData: vi.fn(async () => DATA) }
    attach(viewer)
    await refresh(viewer)
    expect(viewer.getProductData).not.toHaveBeenCalled()
  })

  it('fills every block when the runtime announces a viewer, and once per model-loaded', async () => {
    const a = mount(); const b = mount()
    init()
    expect(a.textContent).toMatch(/Open the 3D model/)
    const handlers: Array<() => void> = []
    const viewer = { getProductData: vi.fn(async () => DATA), on: (_: string, cb: () => void) => handlers.push(cb) }
    onViewer(new CustomEvent('ifcvo:viewer', { detail: { viewer } }))
    await vi.waitFor(() => expect(b.querySelectorAll('[data-ifcvo-live] table').length).toBe(3))
    expect(viewer.getProductData).toHaveBeenCalledOnce()
    onViewer(new CustomEvent('ifcvo:loaded', { detail: { viewer } }))
    expect(viewer.getProductData).toHaveBeenCalledOnce()
    handlers.forEach((h) => h())
    await vi.waitFor(() => expect(viewer.getProductData).toHaveBeenCalledTimes(2))
  })

  it('falls back to class counts on an SDK without getProductData', async () => {
    const r = mount({ groups: 'classes,' })
    init()
    const viewer = { findElements: vi.fn(async () => [{ ifcClass: 'IFCDOOR' }, { ifcClass: 'IFCDOOR' }]) }
    attach(viewer)
    await refresh(viewer)
    expect(r.querySelector('[data-group="classes"] tbody')!.textContent).toBe('Door2')
  })

  it('shows an error state when the read fails', async () => {
    const r = mount()
    init()
    const viewer = { getProductData: vi.fn(async () => { throw new Error('x') }) }
    attach(viewer)
    await refresh(viewer)
    expect(r.textContent).toMatch(/could not be read/)
  })
})
