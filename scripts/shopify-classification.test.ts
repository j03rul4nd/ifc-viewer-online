// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _reset, init, labelsOf, merge, onViewer, parseMetafield, render, serverRows,
// @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-classification.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-classification.liquid'), 'utf8')
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const locale = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')

const DATA = {
  elementCount: 4,
  classifications: {
    systems: [
      { system: 'Uniclass 2015', edition: '2015', count: 3, entries: [
        { system: 'Uniclass 2015', code: 'Ss_25_10_30', title: 'Brick walling systems', count: 2, source: 'ifc' },
        { system: 'Uniclass 2015', code: 'Pr_30_59_24', title: 'Doorsets', count: 1, source: 'ifc' },
      ] },
      { system: 'UniFormat', edition: null, count: 1, entries: [{ system: 'UniFormat', code: 'C1020', title: 'Interior Doors', count: 1, source: 'pset' }] },
    ],
    classified: 3, elements: 4, fromPsets: true, truncated: false,
  },
}

function mount(attrs: Record<string, string> = {}, rows = ''): HTMLElement {
  const a = { 'show-model': 'true', 'show-counts': 'false', ...attrs }
  document.body.insertAdjacentHTML('beforeend', `<div data-ifcvo-classification ${Object.entries(a).map(([k, v]) => `data-${k}='${v}'`).join(' ')}>
    <div data-ifcvo-cls-tables><table><tbody>${rows}</tbody></table></div><div data-ifcvo-live></div></div>`)
  return document.body.lastElementChild as HTMLElement
}
const mfRow = (system: string, code: string, title: string) => `<tr data-source="metafield" data-system="${system}" data-code="${code}"><td><code>${code}</code></td><td>${title}</td></tr>`

beforeEach(() => { document.body.innerHTML = ''; _reset(); delete (window as unknown as { IFCVO?: unknown }).IFCVO })

describe('ifc-classification block (Liquid)', () => {
  it('valid schema, unique ids, at most 25 settings', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
  })

  it('escapes every setting, metafield part and label written into the page', () => {
    for (const m of block.matchAll(/="\{\{\s*([^}]*?)\s*\}\}"/g)) {
      if (!/^s\.(show_model|show_counts)$|^ifcvo_style$|asset_url$/.test(m[1])) expect(m[1]).toMatch(/\| escape/)
    }
    for (const m of block.matchAll(/\{\{\s*((?:parts|sys|lsys|ns)\b[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| escape$/)
    for (const m of block.matchAll(/\{\{\s*('ifcvo\.classification\.[a-z]+' \| t[^}]*?)\s*\}\}/g)) expect(m[1]).toMatch(/\| (escape|json)$/)
  })

  it('server-renders bim.classification grouped by system, list or multi-line', () => {
    expect(block).toMatch(/product\.metafields\[ns\]\.classification/)
    expect(block).toMatch(/mf\.type contains 'list\.'/)
    expect(block).toMatch(/<caption>\{\{ sys \| escape \}\}<\/caption>/)
    expect(block).toMatch(/<th scope="col">/)
    expect(block).toMatch(/aria-live="polite"/)
  })

  it('every label key used exists in the locale file and in the JS defaults', () => {
    const keys = [...block.matchAll(/'ifcvo\.classification\.([a-z]+)' \| t/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(5)
    for (const k of keys) {
      expect(locale.ifcvo.classification[k], k).toBeTruthy()
      expect(labelsOf(mount())[k], k).toBeTruthy()
    }
  })

  it('gated starter, in the build table and the runtime copy', () => {
    expect(FEATURE_TIERS.classification).toBe('starter')
    expect(runtime).toContain('"classification":"starter"')
    expect(block).toContain('data-ifcvo-tier="classification"')
  })
})

describe('metafield and merge', () => {
  it('parses System|Code|Title, drops incomplete lines, keeps pipes in titles', () => {
    expect(parseMetafield('Uniclass 2015|Ss_25_10_30|Brick walling\nOmniClass|\n|x|y\nNBS|A|B|C')).toEqual([
      { system: 'Uniclass 2015', code: 'Ss_25_10_30', title: 'Brick walling', count: null, source: 'metafield' },
      { system: 'NBS', code: 'A', title: 'B|C', count: null, source: 'metafield' },
    ])
    expect(parseMetafield(['MasterFormat|08 14 16'])[0]).toMatchObject({ code: '08 14 16', title: null })
  })

  it('metafield wins over the model for the same code; model adds the rest', () => {
    const groups = merge(parseMetafield('Uniclass 2015|Ss_25_10_30|Merchant title\nCCI|ABC|x'), DATA.classifications)
    expect(groups.map((g: { system: string }) => g.system)).toEqual(['Uniclass 2015', 'CCI', 'UniFormat'])
    expect(groups[0].rows.map((r: { code: string; title: string; source: string }) => [r.code, r.title, r.source])).toEqual([
      ['Ss_25_10_30', 'Merchant title', 'metafield'], ['Pr_30_59_24', 'Doorsets', 'ifc'],
    ])
  })
})

describe('render', () => {
  it('keeps server rows first, adds model rows, flags tool parameters and coverage', () => {
    const root = mount({}, mfRow('Uniclass 2015', 'Ss_25_10_30', 'Merchant'))
    expect(serverRows(root)).toHaveLength(1)
    render(root, DATA)
    const tables = root.querySelectorAll('table[data-system]')
    expect([...tables].map((t) => t.querySelector('caption')!.textContent)).toEqual(['Uniclass 2015', 'UniFormat'])
    expect(tables[0].querySelector('tbody tr')!.getAttribute('data-source')).toBe('metafield')
    expect(tables[0].textContent).toContain('Merchant')
    expect(tables[1].textContent).toContain('C1020 *')
    expect(root.querySelector('[data-ifcvo-pset]')).not.toBeNull()
    expect(root.querySelector('[data-ifcvo-coverage]')!.textContent).toBe('3 of 4 elements are classified.')
    expect(root.querySelectorAll('th[scope="col"]')).toHaveLength(4)
  })

  it('counts column on demand; text is never parsed as HTML', () => {
    const evil = { elementCount: 1, classifications: { ...DATA.classifications, fromPsets: false, systems: [{ system: '<img src=x onerror=1>', edition: null, count: 1, entries: [{ system: 'x', code: '<b>c</b>', title: '<script>', count: 1, source: 'ifc' }] }] } }
    const root = mount({ 'show-counts': 'true' })
    render(root, evil)
    expect(root.querySelector('img,b,script')).toBeNull()
    expect(root.querySelector('tbody tr')!.children).toHaveLength(3)
  })

  it('no codes anywhere → none message', () => {
    const root = mount()
    render(root, { elementCount: 2, classifications: null })
    expect(root.querySelector('[data-ifcvo-live]')!.textContent).toBe(labelsOf(root).none)
  })
})

describe('viewer wiring', () => {
  it('fills on ifcvo:viewer and stays hidden when the plan gate says no', async () => {
    const root = mount()
    init()
    const viewer = { getProductData: vi.fn().mockResolvedValue(DATA), on: vi.fn() }
    onViewer(new CustomEvent('ifcvo:viewer', { detail: { viewer } }))
    await vi.waitFor(() => expect(root.querySelectorAll('table[data-system]').length).toBe(2))
    expect(viewer.getProductData).toHaveBeenCalledTimes(1)

    document.body.innerHTML = ''; _reset()
    const gated = mount()
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate: vi.fn().mockReturnValue(false) }
    init()
    const v2 = { getProductData: vi.fn().mockResolvedValue(DATA), on: vi.fn() }
    onViewer(new CustomEvent('ifcvo:viewer', { detail: { viewer: v2 } }))
    await Promise.resolve()
    expect(v2.getProductData).not.toHaveBeenCalled()
    expect(gated.querySelector('table[data-system]')).toBeNull()
  })
})

describe('verifier fixes', () => {
  const jsonld = fs.readFileSync(path.join(EXT, 'snippets/ifcvo-jsonld.liquid'), 'utf8')
  const sysSnippet = fs.readFileSync(path.join(EXT, 'snippets/ifcvo-cls-system.liquid'), 'utf8')

  it('metafield system names use the model normaliser, so codes dedupe', () => {
    expect(parseMetafield('Uniclass|Ss_25_10_30|x')[0].system).toBe('Uniclass 2015')
    expect(parseMetafield('omniclass table 23|23-17|y')[0].system).toBe('OmniClass')
    const groups = merge(parseMetafield('uniclass|Ss_25_10_30|Merchant'), DATA.classifications)
    expect(groups[0].system).toBe('Uniclass 2015')
    expect(groups[0].rows.filter((r: { code: string }) => r.code === 'Ss_25_10_30')).toHaveLength(1)
    expect(block).toContain("render 'ifcvo-cls-system', name: parts[0]")
    for (const k of ['uniclass', 'omniclass', 'masterformat', 'uniformat']) expect(sysSnippet).toContain(`contains '${k}'`)
  })

  it('codes with a guessed system show "(inferred)"', () => {
    const data = { elementCount: 1, classifications: { ...DATA.classifications, systems: [{ system: 'Uniclass 2015', edition: null, count: 1, entries: [{ system: 'Uniclass 2015', code: 'Pr_1', title: null, count: 1, source: 'ifc', systemGuessed: true }] }] } }
    const root = mount()
    render(root, data)
    expect(root.querySelector('[data-ifcvo-inferred]')!.textContent).toBe(' (inferred)')
    expect(locale.ifcvo.classification.inferred).toBe('(inferred)')
  })

  it('Liquid keeps titles containing "|"', () => {
    expect(block).toContain("assign ltitle = parts | slice: 2, 99 | join: '|'")
    expect(block).toContain('{{ ltitle | strip | escape }}')
  })

  it('JSON-LD joins list metafields with ", "', () => {
    expect(jsonld).toMatch(/if pair\[1\]\.type contains 'list\.'.*\| join: ', '/)
    expect(jsonld).toContain('{{ ifcvo_pv | json }}')
  })
})
