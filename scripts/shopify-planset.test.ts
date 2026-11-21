// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS asset without types
import { _reset, init, onChange, resolve, select, selectedVariant, urlVariant } from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-planset.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-plan-set.liquid'), 'utf8')
const item = fs.readFileSync(path.join(EXT, 'snippets/ifcvo-planset-item.liquid'), 'utf8')
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')
const locales = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const body = block.replace(/\{% schema %\}[\s\S]*$/, '').replace(/\{% comment %\}[\s\S]*?\{% endcomment %\}/g, '')

function mount(selected = '1'): HTMLElement {
  document.body.innerHTML = `
  <form action="/cart/add"><input name="id" value="${selected}"></form>
  <div data-ifcvo-planset data-variant-id="1">
    <div data-ifcvo-planset-body>
      <section class="ifcvo-planset-card" data-variant-id="1"><p class="ifcvo-planset-type">License: Single-build</p></section>
      <section class="ifcvo-planset-card" data-variant-id="2" hidden><p class="ifcvo-planset-type">License: CAD set</p></section>
      <table class="ifcvo-planset-matrix"><thead><tr><td></td><th data-variant-id="1" aria-current="true">A</th><th data-variant-id="2">B</th></tr></thead>
      <tbody><tr><th scope="row">Floor plans</th><td data-variant-id="1">x</td><td data-variant-id="2">x</td></tr></tbody></table>
    </div>
    <p data-ifcvo-planset-status data-label="Selected:"></p>
  </div>`
  return document.querySelector('[data-ifcvo-planset]') as HTMLElement
}

beforeEach(() => { _reset(); delete (window as unknown as { IFCVO?: unknown }).IFCVO })

describe('ifc-plan-set block (Liquid)', () => {
  it('has a valid schema: unique ids, ≤ 25 settings, app block target', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
  })

  it('reads the variant metafields with defaults', () => {
    for (const k of ['license_type', 'license_terms', 'plan_set', 'ifc_model']) expect(body).toContain(`metafields[ns].${k}.value`)
    expect(body).toMatch(/plan_set\.value \| default: default_items/)
    expect(body).toMatch(/default: s\.default_license/)
  })

  it('escapes every output of metafield or merchant text', () => {
    for (const src of [body, item.replace(/\{% comment %\}[\s\S]*?\{% endcomment %\}/g, '')]) {
      const outs = [...src.matchAll(/\{\{-?\s*([^}]*?)\s*-?\}\}/g)].map((m) => m[1])
      const unsafe = outs.filter((o) => !/\| escape|\| json/.test(o)
        && !/^(block\.shopify_attributes|ifcvo_style|s\.accent|s\.radius|p_color|v\.price \| money|'[\w.-]+' \| asset_url.*)$/.test(o))
      expect(unsafe).toEqual([])
    }
  })

  it('renders a semantic license matrix and one card per variant server-side', () => {
    expect(body).toContain('<caption>')
    expect(body).toContain('scope="col"')
    expect(body).toContain('scope="row"')
    expect(body).toMatch(/for v in product\.variants[\s\S]*ifcvo-planset-card/)
    expect(body).toMatch(/unless v\.id == current\.id %\} hidden/)
    expect(body).toContain('tabindex="0"')
  })

  it('format icons are inline SVG, no remote assets', () => {
    expect(item).toContain('<svg')
    expect(item).toContain('aria-hidden="true"')
    expect(block + item).not.toMatch(/src="https?:|href="https?:|<img/)
  })

  it('gates on the plan server-side with the upsell note in design mode', () => {
    expect(body).toMatch(/if plan == 'free'[\s\S]*request\.design_mode[\s\S]*ifcvo-upsell/)
  })

  it('every label has an English default and a shop override', () => {
    for (const m of body.matchAll(/'ifcvo\.planset\.(\w+)' \| t/g)) {
      expect(locales.ifcvo.planset[m[1]]).toBeTruthy()
      expect(body).toContain(`L.planset_${m[1]}`)
    }
  })
})

describe('plan gate', () => {
  it('planset is a starter feature in the table and the runtime copy', () => {
    expect(FEATURE_TIERS.planset).toBe('starter')
    expect(runtime).toContain('"planset":"starter"')
  })
})

describe('ifcvo-planset.js', () => {
  it('reads the selected variant from the cart form', () => {
    mount('2')
    expect(selectedVariant()).toBe('2')
  })

  it('switches the card and the matrix column', () => {
    const root = mount()
    expect(select(root, '2')).toBe(true)
    const cards = root.querySelectorAll<HTMLElement>('.ifcvo-planset-card')
    expect(cards[0].hidden).toBe(true)
    expect(cards[1].hidden).toBe(false)
    expect(root.querySelector('th[data-variant-id="2"]')!.getAttribute('aria-current')).toBe('true')
    expect(root.querySelector('th[data-variant-id="1"]')!.hasAttribute('aria-current')).toBe(false)
    expect(root.querySelector('td[data-variant-id="2"]')!.classList.contains('ifcvo-current')).toBe(true)
    expect(root.querySelector('[data-ifcvo-planset-status]')!.textContent).toBe('Selected: License: CAD set')
  })

  it('ignores unknown variants', () => {
    const root = mount()
    expect(select(root, '99')).toBe(false)
    expect(root.querySelectorAll<HTMLElement>('.ifcvo-planset-card')[0].hidden).toBe(false)
  })

  it('outputs money unescaped (shop format) and never escapes it into literal tags', () => {
    expect(body).toContain('{{ v.price | money }}')
    expect(body).not.toMatch(/money \| escape/)
  })

  it('has a single live region and one license-name source for card and table', () => {
    expect((body.match(/aria-live|role="status"/g) || []).length).toBe(1)
    const sources = [...body.matchAll(/assign vtype = (.*)/g)].map((m) => m[1].trim())
    expect(sources.length).toBe(2)
    expect(sources[0]).toBe(sources[1])
    expect((body.match(/has_only_default_variant/g) || []).length).toBe(2)
  })

  it('reads ?variant= from the URL', () => {
    expect(urlVariant({ search: '?variant=42&x=1' })).toBe('42')
    expect(urlVariant({ search: '' })).toBe(null)
  })

  it('one resolver: hint, then form, then URL; only ids with a card', () => {
    const root = mount('99')
    history.replaceState(null, '', '?variant=2')
    expect(resolve(root)).toBe('2')
    expect(resolve(root, '1')).toBe('1')
    ;(document.querySelector('[name="id"]') as HTMLInputElement).value = '1'
    expect(resolve(root)).toBe('1')
    history.replaceState(null, '', location.pathname)
  })

  it('follows history.replaceState and popstate (?variant=)', () => {
    vi.useFakeTimers()
    const root = mount()
    init()
    history.replaceState(null, '', '?variant=2')
    vi.runAllTimers()
    expect(root.dataset.variantId).toBe('2')
    history.replaceState(null, '', '?variant=1')
    window.dispatchEvent(new PopStateEvent('popstate'))
    vi.runAllTimers()
    expect(root.dataset.variantId).toBe('1')
    history.replaceState(null, '', location.pathname)
    vi.useRealTimers()
  })

  it('re-reads the form after an async update (Dawn-like): debounced second read', () => {
    vi.useFakeTimers()
    const root = mount()
    init()
    const input = document.querySelector('[name="id"]') as HTMLInputElement
    onChange(new Event('change'))
    vi.advanceTimersByTime(60)
    expect(root.dataset.variantId).toBe('1')
    input.value = '2' // fetch resolved later, no new change event
    vi.advanceTimersByTime(400)
    expect(root.dataset.variantId).toBe('2')
    vi.useRealTimers()
  })

  it('observes the form id attribute', async () => {
    vi.useFakeTimers()
    const root = mount()
    init()
    document.querySelector('[name="id"]')!.setAttribute('value', '2')
    await Promise.resolve()
    vi.runAllTimers()
    expect(root.dataset.variantId).toBe('2')
    vi.useRealTimers()
  })

  it('follows variant changes from the form and from variant:change', () => {
    vi.useFakeTimers()
    const root = mount()
    init()
    ;(document.querySelector('[name="id"]') as HTMLInputElement).value = '2'
    onChange(new Event('change'))
    vi.runAllTimers()
    expect(root.dataset.variantId).toBe('2')
    onChange(new CustomEvent('variant:change', { detail: { variant: { id: 1 } } }))
    vi.runAllTimers()
    expect(root.dataset.variantId).toBe('1')
    vi.useRealTimers()
  })

  it('respects IFCVO.gate', () => {
    const gate = vi.fn(() => false)
    ;(window as unknown as { IFCVO: unknown }).IFCVO = { gate }
    const root = mount('2')
    init()
    expect(gate).toHaveBeenCalledWith('planset', root.querySelector('[data-ifcvo-planset-body]'))
    expect(root.dataset.variantId).toBe('1')
  })
})
