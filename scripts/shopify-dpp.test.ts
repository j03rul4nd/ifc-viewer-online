// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _reset, fill, httpsUrl, init, labelsOf, onViewer, render, score,
// @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-dpp.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-dpp.liquid'), 'utf8')
const js = fs.readFileSync(path.join(EXT, 'assets/ifcvo-dpp.js'), 'utf8')
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const locale = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')
const valueSnippet = fs.readFileSync(path.join(EXT, 'snippets/ifcvo-dpp-value.liquid'), 'utf8')
const jsonld = fs.readFileSync(path.join(EXT, 'snippets/ifcvo-jsonld.liquid'), 'utf8')

/** Mirror of snippets/ifcvo-dpp-value.liquid (Liquid cannot run here): kept honest by the structure test below. */
function liquidValue(value: string, unit: string | null, fallback: string): string {
  const v = value.trim()
  const rest = v.replace(/[0-9.,+\- ]/g, '')
  const u = (unit || '').trim() || fallback
  return !v ? '—' : !rest ? `${v} ${u}` : v
}

const DATA = {
  elementCount: 3,
  sustainability: {
    indicators: [
      { key: 'gwpA1A3', value: 12.5, unit: null, basis: 'perUnit', stage: 'A1-A3', source: 'ifc', pset: 'Pset_EnvironmentalImpactIndicators', property: 'ClimateChangePerUnit', count: 3, varies: false },
      { key: 'water', value: 0.3, unit: 'm³', basis: 'perUnit', stage: null, source: 'pset', pset: 'Acme_EPD', property: 'FW', count: 3, varies: true },
    ],
    declaredUnit: '1 m2',
    epd: { number: 'S-P-0001', programme: null, url: 'javascript:alert(1)', validUntil: null, source: 'pset' },
    materials: ['Concrete'], withData: 3, elements: 3, fromPsets: true, truncated: false,
  },
}

const ROW_KEYS = ['gwp_a1a3', 'gwp', 'energy', 'water', 'declared_unit', 'epd_programme', 'epd_number', 'epd_valid_until', 'epd_url']
const ITEMS = ['dop', 'ce', 'gwp', 'instructions', 'substances', 'identifier', 'manufacturer']

/** The markup Liquid prints: `filled` rows/items come from metafields. */
function mount(filled: Record<string, string> = {}, ready: string[] = [], attrs: Record<string, string> = {}): HTMLElement {
  const a = { 'show-model': 'true', ...attrs }
  const rows = ROW_KEYS.map((k) => `<tr data-key="${k}" data-source="${filled[k] ? 'metafield' : 'none'}"><th scope="row">${k}</th><td>${filled[k] ?? '—'}</td></tr>`).join('')
  const items = ITEMS.map((k) => {
    const ok = ready.includes(k)
    return `<li data-item="${k}" data-state="${ok ? 'ready' : 'missing'}"><span aria-hidden="true">${ok ? '✓' : '○'}</span><span class="ifcvo-sr" data-sr>${ok ? 'ready' : 'missing'}: </span> Item ${k}${ok ? ' — x' : ` <span class="ifcvo-muted">Missing: ${k}</span>`}</li>`
  }).join('')
  document.body.insertAdjacentHTML('beforeend', `<section data-ifcvo-dpp ${Object.entries(a).map(([k, v]) => `data-${k}='${v}'`).join(' ')}>
    <table data-ifcvo-epd><tbody>${rows}</tbody></table><ul data-ifcvo-checklist>${items}</ul>
    <p data-ifcvo-dpp-score></p><div data-ifcvo-live></div></section>`)
  return document.body.lastElementChild as HTMLElement
}

beforeEach(() => { document.body.innerHTML = ''; _reset(); delete (window as unknown as { IFCVO?: unknown }).IFCVO })

describe('ifc-dpp block (Liquid)', () => {
  it('valid schema, unique ids, at most 25 settings', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
  })

  it('escapes every metafield value, setting and label written into the page', () => {
    for (const m of block.matchAll(/="\{\{\s*([^}]*?)\s*\}\}"/g)) {
      if (!/^s\.show_model$|^ifcvo_style$|asset_url$|^ready$/.test(m[1])) expect(m[1]).toMatch(/\| escape/)
    }
    for (const m of block.matchAll(/\{\{\s*((?:v|ce|langs|soc|gtin|contact|unit|gwp_a|gwp_t|ns|epd_url|dop_url)\b[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| escape$/)
    for (const m of block.matchAll(/\{\{\s*('ifcvo\.dpp\.[a-z_0-9]+' \| t[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| (escape|json)$/)
  })

  it('links only when they start with https://', () => {
    expect(block).toMatch(/assign h = epd_url \| slice: 0, 8 \| downcase\s+if h != 'https:\/\/'\s+assign epd_url = ''/)
    expect(block).toMatch(/assign h = dop_url \| slice: 0, 8 \| downcase\s+if h != 'https:\/\/'\s+assign dop_url = ''/)
    expect(block).toMatch(/rel="noopener nofollow"/)
  })

  it('server-renders the metafields, GTIN falls back to the variant barcode, score server-side', () => {
    for (const k of ['epd_url', 'epd_number', 'gwp_a1a3', 'declared_unit', 'dop_url', 'ce_marking', 'instructions_languages', 'substances_of_concern', 'gtin', 'manufacturer_contact']) {
      expect(block).toContain(`m.${k}.`)
    }
    expect(block).toMatch(/selected_or_first_available_variant\.barcode/)
    for (const k of ITEMS) expect(block).toContain(`data-item="${k}"`)
    expect(block).toMatch(/'ifcvo\.dpp\.score' \| t: ready: ready, total: 7/)
    expect(block).toContain('data-ifcvo-tier="dpp"')
  })

  it('never claims compliance; disclaimer present and says delegated acts are still being adopted', () => {
    const copy = JSON.stringify(locale.ifcvo.dpp) + block + js
    expect(copy).not.toMatch(/\b(is|are|fully) (compliant|certified)\b|\bcompliant\b|\bcertified\b/i)
    expect(locale.ifcvo.dpp.disclaimer).toMatch(/not legal advice/)
    expect(locale.ifcvo.dpp.disclaimer).toMatch(/2024\/3110/)
    expect(locale.ifcvo.dpp.disclaimer).toMatch(/still being adopted/)
    expect(block).toContain("'ifcvo.dpp.disclaimer' | t | escape")
  })

  it('every label key used exists in the locale file; JS defaults are locale keys', () => {
    for (const m of block.matchAll(/'ifcvo\.dpp\.([a-z_0-9]+)'/g)) expect(locale.ifcvo.dpp[m[1]], m[1]).toBeTruthy()
    for (const k of Object.keys(labelsOf(mount()))) expect(locale.ifcvo.dpp[k], k).toBeTruthy()
  })

  it('gated business, in the build table and the runtime copy', () => {
    expect(FEATURE_TIERS.dpp).toBe('business')
    expect(runtime).toContain('"dpp":"business"')
  })
})

describe('plan gate, units, JSON-LD', () => {
  it('whole panel is server-gated to business; editor sees the upsell note', () => {
    expect(block).toMatch(/assign plan = app\.metafields\.ifcvo\.plan\.value \| default: 'business'/)
    const gate = block.indexOf("{%- if plan != 'business' -%}")
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(block.indexOf('<section'))
    expect(block).toMatch(/request\.design_mode -%\}\s*<p class="ifcvo-upsell" data-ifcvo-upsell="dpp"/)
    expect(block.indexOf('{%- else -%}', gate)).toBeLessThan(block.indexOf('<section'))
    expect(block.lastIndexOf('{%- endif -%}')).toBeGreaterThan(block.indexOf("'ifcvo-dpp.js' | asset_url"))
  })

  it('units: companion metafields, default only for bare numbers, value with unit as given', () => {
    expect(block).toContain("render 'ifcvo-dpp-value', value: gwp_a, unit: m.gwp_unit.value, fallback: 'kg CO₂e'")
    expect(block).toContain("unit: m.energy_unit.value, fallback: 'MJ'")
    expect(block).toContain("unit: m.water_unit.value, fallback: 'm³'")
    for (const c of '0123456789.,-+ ') expect(valueSnippet).toContain(`remove: '${c}'`)
    expect(valueSnippet).toMatch(/elsif ifcvo_rest == blank -%\}\{\{ ifcvo_v \| escape \}\} \{\{ ifcvo_u \| escape \}\}/)
    expect(liquidValue('12.5', null, 'kg CO₂e')).toBe('12.5 kg CO₂e')
    expect(liquidValue('12,5', 'kg CO2e/m2', 'kg CO₂e')).toBe('12,5 kg CO2e/m2')
    expect(liquidValue('12.5 kg CO2e per m2', 'ignored', 'kg CO₂e')).toBe('12.5 kg CO2e per m2')
    expect(liquidValue('', null, 'MJ')).toBe('—')
  })

  it('JSON-LD drops URL-like bim.* values unless https://', () => {
    expect(jsonld).toMatch(/ifcvo_k_end == '_url' or ifcvo_k_end5 == '_link'/)
    expect(jsonld).toMatch(/ifcvo_pvl contains 'javascript:'/)
    expect(jsonld).toMatch(/if ifcvo_urlish and ifcvo_head != 'https:\/\/' -%\}\{%- continue -%\}/)
    expect(jsonld).not.toMatch(/unless forloop\.first/)
  })
})

describe('ifcvo-dpp.js', () => {
  it('fill handles {x} and Liquid {{ x }}; httpsUrl rejects non-https', () => {
    expect(fill('{{ ready }} of {total}', { ready: 2, total: 7 })).toBe('2 of 7')
    expect(httpsUrl('https://a.example/x')).toBe('https://a.example/x')
    expect(httpsUrl('http://a.example')).toBeNull()
    expect(httpsUrl('javascript:alert(1)')).toBeNull()
  })

  it('score: x of y and plain-language missing list', () => {
    const root = mount({}, ['dop', 'ce'])
    expect(score(root)).toEqual({ ready: 2, total: 7, missing: ['gwp', 'instructions', 'substances', 'identifier', 'manufacturer'] })
    const text = root.querySelector('[data-ifcvo-dpp-score]')!.textContent!
    expect(text).toMatch(/^2 of 7 items ready/)
    expect(text).toContain('Still missing: item gwp; item instructions')
  })

  it('model fills gaps only, flagged by source; metafield wins; unsafe EPD link dropped', () => {
    const root = mount({ gwp_a1a3: '9.9 kg CO₂e' })
    const filled = render(root, DATA)
    expect(root.querySelector('tr[data-key="gwp_a1a3"] td')!.textContent).toBe('9.9 kg CO₂e')
    expect(filled).toEqual(expect.arrayContaining(['water', 'declared_unit', 'epd_number', 'check:gwp']))
    expect(filled).not.toContain('gwp_a1a3')
    expect(filled).not.toContain('epd_url')
    const water = root.querySelector('tr[data-key="water"]') as HTMLElement
    expect(water.dataset.source).toBe('model-pset')
    expect(water.textContent).toMatch(/0\.3 m³ — varies between elements \(manufacturer parameter in the model\)/)
    expect(root.querySelector('a')).toBeNull()
  })

  it('GWP from the model ticks the checklist item and updates the score', () => {
    const root = mount()
    render(root, DATA)
    const li = root.querySelector('li[data-item="gwp"]') as HTMLElement
    expect(li.dataset.state).toBe('ready')
    expect(li.textContent).toContain('ready: ')
    expect(li.textContent).toContain('(from the 3D model)')
    expect(root.querySelector('[data-ifcvo-dpp-score]')!.textContent).toMatch(/^1 of 7/)
    // Row filled with the GWP default unit
    expect(root.querySelector('tr[data-key="gwp_a1a3"] td')!.textContent).toMatch(/^12\.5 kg CO₂e \(from the 3D model\)/)
  })

  it('text from the model is never parsed as HTML', () => {
    const root = mount()
    render(root, { elementCount: 1, sustainability: { ...DATA.sustainability, declaredUnit: '<img src=x onerror=alert(1)>' } })
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('tr[data-key="declared_unit"] td')!.textContent).toContain('<img')
  })

  it('show_model off leaves the server copy alone', () => {
    const root = mount({}, [], { 'show-model': 'false' })
    expect(render(root, DATA)).toEqual([])
  })

  it('fills on ifcvo:viewer and stays model-free when the plan gate says no', async () => {
    const root = mount()
    const viewer = { getProductData: vi.fn(async () => DATA), on: vi.fn() }
    init()
    onViewer(new CustomEvent('ifcvo:viewer', { detail: { viewer } }))
    await vi.waitFor(() => expect((root.querySelector('li[data-item="gwp"]') as HTMLElement).dataset.state).toBe('ready'))
    document.body.innerHTML = ''; _reset()
    const locked = mount()
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: () => false }
    init()
    const v2 = { getProductData: vi.fn(async () => DATA), on: vi.fn() }
    onViewer(new CustomEvent('ifcvo:viewer', { detail: { viewer: v2 } }))
    await Promise.resolve()
    expect(v2.getProductData).not.toHaveBeenCalled()
    expect((locked.querySelector('li[data-item="gwp"]') as HTMLElement).dataset.state).toBe('missing')
    expect(locked.querySelector('[data-ifcvo-dpp-score]')!.textContent).toMatch(/^0 of 7/)
  })
})
