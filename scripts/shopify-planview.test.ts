// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS asset without types
import * as pv from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-planview.js'
// @ts-expect-error plain JS asset without types
import { protectOptions } from '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo.js'
import { FEATURE_TIERS } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-plan-view.liquid'), 'utf8')
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')
const locales = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const body = block.replace(/\{% schema %\}[\s\S]*$/, '').replace(/\{% comment %\}[\s\S]*?\{% endcomment %\}/g, '')

type Win = { IFCVO?: unknown }

function mount(attrs = ''): HTMLElement {
  document.body.innerHTML = `
  <div data-ifcvo-viewer data-ifcvo-plan="business"><div class="ifcvo-stage"><img src="p.png"></div>
    <div class="ifcvo-downloads"><a class="ifcvo-download" href="m.ifc">IFC</a></div><a class="ifcvo-full" href="#">full</a></div>
  <div data-ifcvo-planview data-ifcvo-plan="business" data-l-all="Todo" ${attrs}>
    <div data-ifcvo-planview-body><div role="tablist" data-ifcvo-planview-tabs></div><div role="tabpanel" data-ifcvo-planview-panel></div></div>
    <p data-ifcvo-planview-status role="status"></p>
  </div>
  <div data-ifcvo-downloads-block><div data-ifcvo-downloads><a download href="m.ifc">IFC</a><button class="ifcvo-make" data-ifcvo-make="glb">GLB</button></div></div>
  <div data-ifcvo-panel="details"><button class="ifcvo-make" data-ifcvo-make="csv">CSV</button></div>`
  return document.querySelector('[data-ifcvo-planview]') as HTMLElement
}

function fakeViewer(rooms?: unknown[]) {
  return {
    on: vi.fn(),
    getSections: vi.fn(async () => ({ planes: [], box: null, active: 0, levels: [{ name: 'Ground', y: 0 }, { name: 'First', y: 3 }] })),
    getProductData: rooms ? vi.fn(async () => ({ rooms })) : vi.fn(async () => ({ elementCount: 3 })),
    removeSection: vi.fn(async () => ({})),
    addSection: vi.fn(async () => ({})),
    frame: vi.fn(async () => ({})),
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => { pv._reset(); document.documentElement.classList.remove('ifcvo-protected'); delete (window as unknown as Win).IFCVO })

describe('ifc-plan-view block (Liquid)', () => {
  it('has a valid schema: unique ids, ≤ 25 settings, section target', () => {
    const ids = schema.settings.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    expect(schema.target).toBe('section')
  })

  it('escapes every output', () => {
    const outs = [...body.matchAll(/\{\{-?\s*([^}]*?)\s*-?\}\}/g)].map((m) => m[1])
    const unsafe = outs.filter((o) => !/\| escape/.test(o)
      && !/^(block\.shopify_attributes|ifcvo_style|s\.accent|s\.radius|'[\w.-]+' \| asset_url.*)$/.test(o))
    expect(unsafe).toEqual([])
  })

  it('gates on the plan server-side and is starter in FEATURE_TIERS (runtime copy in sync)', () => {
    expect(body).toMatch(/if plan == 'free'[\s\S]*request\.design_mode[\s\S]*ifcvo-upsell/)
    expect(FEATURE_TIERS.planview).toBe('starter')
    expect(runtime).toContain('"planview":"starter"')
  })

  it('every label has an English default and a shop override', () => {
    const keys = [...body.matchAll(/'ifcvo\.planview\.(\w+)' \| t/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(8)
    for (const k of keys) {
      expect(locales.ifcvo.planview[k]).toBeTruthy()
      expect(body).toContain(`L.planview_${k}`)
    }
  })

  it('uses an accessible tablist and an honest editor note on preview mode', () => {
    expect(body).toContain('role="tablist"')
    expect(body).toContain('role="tabpanel"')
    expect(block).toMatch(/cannot|can be extracted/)
    expect(body).toMatch(/default: shop\.name/)
  })
})

describe('plan view runtime', () => {
  it('reads storeys and rooms; degrades without rooms', () => {
    expect(pv.levelsOf({ levels: [{ name: ' A ', y: 1 }, { y: 2 }] })).toEqual([{ index: 0, name: 'A', y: 1 }, { index: 1, name: '#2', y: 2 }])
    expect(pv.levelsOf(null)).toEqual([])
    const data = { rooms: [{ name: 'Kitchen', area: 12.34, storey: 'Ground' }, { name: 'Bed', area: 0, level: 'first' }] }
    expect(pv.roomsFor(data, 'ground')).toEqual([{ name: 'Kitchen', area: 12.34 }])
    expect(pv.roomsFor(data, 'First')).toEqual([{ name: 'Bed', area: null }])
    expect(pv.roomsFor({ elementCount: 1 }, 'Ground')).toEqual([])
  })

  it('renders tabs with roving tabindex and aria-selected', async () => {
    const root = mount()
    pv.init()
    const v = fakeViewer([{ name: 'Kitchen', area: 12, storey: 'Ground' }])
    document.dispatchEvent(new CustomEvent('ifcvo:viewer', { detail: { viewer: v } }))
    await flush(); await flush()
    const tabs = [...root.querySelectorAll('[role="tab"]')] as HTMLElement[]
    expect(tabs.map((t) => t.textContent)).toEqual(['Todo', 'Ground', 'First'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1])
    expect(tabs[0].getAttribute('aria-controls')).toBe(root.querySelector('[role="tabpanel"]')!.id)

    // Arrow right selects Ground: cut at storey 0, top view, room table.
    tabs[0].focus()
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush(); await flush()
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1])
    expect(v.addSection).toHaveBeenCalledWith({ level: 0 })
    expect(v.frame).toHaveBeenLastCalledWith({ view: 'top' })
    expect(root.querySelector('[role="tabpanel"] td')!.textContent).toBe('Kitchen')

    // End wraps to the last; Home back to 3D clears the cut.
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await flush(); await flush()
    expect(v.frame).toHaveBeenLastCalledWith({ view: 'iso' })
    expect(pv.nextTab(root, tabs[0], 'ArrowLeft')).toBe(tabs[2])
    expect(pv.nextTab(root, tabs[0], 'x')).toBeNull()
  })

  it('clicking a storey without rooms shows no table', async () => {
    const root = mount()
    pv.init()
    const v = fakeViewer()
    document.dispatchEvent(new CustomEvent('ifcvo:viewer', { detail: { viewer: v } }))
    await flush(); await flush()
    ;(root.querySelectorAll('[role="tab"]')[2] as HTMLElement).click()
    await flush(); await flush()
    expect(v.addSection).toHaveBeenCalledWith({ level: 1 })
    expect(root.querySelector('table')).toBeNull()
    expect(root.querySelector('[role="status"]')!.textContent).toContain('First')
  })

  it('gated out by the runtime: nothing mounts', () => {
    const root = mount()
    ;(window as unknown as Win).IFCVO = { gate: () => false }
    pv.init()
    expect(root.querySelector('[role="tab"], button')).toBeNull()
  })
})

describe('preview mode', () => {
  it('watermarks, blocks the context menu, hides downloads and the full-viewer link', () => {
    const root = mount('data-ifcvo-protect="on" data-watermark="Acme Plans" data-watermark-opacity="0.2"')
    pv.init()
    const viewerRoot = document.querySelector('[data-ifcvo-viewer]')!
    expect(viewerRoot.hasAttribute('data-ifcvo-protected')).toBe(true)
    const marks = document.querySelectorAll('[data-ifcvo-watermark]')
    expect(marks.length).toBe(2)
    expect(marks[0].getAttribute('aria-hidden')).toBe('true')
    expect(marks[0].textContent).toContain('Acme Plans')
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    viewerRoot.querySelector('.ifcvo-stage img')!.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(viewerRoot.querySelector('img')!.getAttribute('draggable')).toBe('false')
    expect(root.dataset.ifcvoPlanviewReady).toBe('1')
  })

  it('viewer options drop toolbar, tools, exports and (unless allowed) properties', () => {
    mount('data-ifcvo-protect="on"')
    expect(protectOptions()).toEqual({ ui: 'embed', toolbar: false, tools: [], panels: [] })
    mount('data-ifcvo-protect="properties"')
    expect(protectOptions().panels).toEqual(['properties'])
    mount()
    expect(protectOptions()).toEqual({})
    document.body.innerHTML = '<div data-ifcvo-protect="on" data-ifcvo-plan="free"></div>'
    expect(protectOptions()).toEqual({})
  })

  it('without preview mode nothing is watermarked', () => {
    mount()
    pv.init()
    expect(document.querySelector('[data-ifcvo-watermark]')).toBeNull()
    expect(document.querySelector('[data-ifcvo-protected]')).toBeNull()
  })
})

const viewerBlock = fs.readFileSync(path.join(EXT, 'blocks/product-ifc-viewer.liquid'), 'utf8')
const dlBlock = fs.readFileSync(path.join(EXT, 'blocks/ifc-downloads.liquid'), 'utf8')
const quote = fs.readFileSync(path.join(EXT, 'assets/ifcvo-quote.js'), 'utf8')

describe('preview mode across the product page', () => {
  it('removes every download: viewer links, IFC downloads block, GLB/CSV buttons', () => {
    mount('data-ifcvo-protect="on"')
    pv.init()
    expect(document.documentElement.classList.contains('ifcvo-protected')).toBe(true)
    expect(document.querySelectorAll('[data-ifcvo-downloads], [data-ifcvo-downloads-block], .ifcvo-make, a[download]').length).toBe(0)
  })

  it('keeps downloads without preview mode', () => {
    mount()
    pv.init()
    expect(document.querySelectorAll('.ifcvo-make').length).toBe(2)
  })

  it('server-side: product and downloads blocks drop links (and the noscript link) when a protected plan view is in the section', () => {
    for (const src of [viewerBlock, dlBlock]) {
      expect(src).toMatch(/for b in section\.blocks[\s\S]*if pv_ok and b\.type contains '\/blocks\/ifc-plan-view\/' and b\.settings\.protect/)
      expect(src).toMatch(/if pv_plan == 'free'
\s*assign pv_ok = false/)
      expect(src).toMatch(/unless ifcvo_protected -%\}\{%- render 'ifcvo-downloads'/)
    }
    expect(viewerBlock).toMatch(/if ifcvo_protected -%\}\{%- assign ns_model = ''[\s\S]*render 'ifcvo-noscript', product: product, model: ns_model/)
  })

  it('GLB/CSV makers refuse in preview mode and the help says the URL stays reachable', () => {
    expect(quote).toMatch(/querySelector\('\[data-ifcvo-protect\]'\)\) return/)
    expect(block).toMatch(/URL stays reachable/)
  })
})

describe('rooms schedule and listener lifecycle', () => {
  const schedule = { rooms: { storeys: [
    { name: 'Ground', rooms: [{ label: 'Kitchen', name: '01', area: 12.5 }, { label: 'Hall', area: null }] },
    { name: 'First', rooms: [] },
  ], totals: { count: 2 } } }

  it('reads the SDK 1.19 room schedule by storey', () => {
    expect(pv.roomsFor(schedule, 'ground')).toEqual([{ name: 'Kitchen', area: 12.5 }, { name: 'Hall', area: null }])
    expect(pv.roomsFor(schedule, 'First')).toEqual([])
    expect(pv.roomsFor({ rooms: null }, 'Ground')).toEqual([])
  })

  it('renders the schedule rooms with a total in the storey tab', async () => {
    const root = mount()
    pv.init()
    const v = fakeViewer()
    v.getProductData = vi.fn(async () => schedule as never)
    document.dispatchEvent(new CustomEvent('ifcvo:viewer', { detail: { viewer: v } }))
    await flush(); await flush()
    ;(root.querySelectorAll('[role="tab"]')[1] as HTMLElement).click()
    await flush()
    const cells = [...root.querySelectorAll('[role="tabpanel"] tbody td')].map((t) => t.textContent)
    expect(cells[0]).toBe('Kitchen')
    expect(cells[1]).toMatch(/12[.,]5 m²/)
    expect(cells[2]).toBe('Hall')
    expect(root.querySelector('[role="tabpanel"] tfoot td')!.textContent).toMatch(/12[.,]5 m²/)
  })

  it('removes the model-loaded listener on a new viewer and on destroy', () => {
    mount()
    pv.init()
    const offA = vi.fn(); const offB = vi.fn()
    const a = { ...fakeViewer(), on: vi.fn(() => offA) }
    const b = { ...fakeViewer(), on: vi.fn(() => offB) }
    pv.attach(a)
    pv.attach(b)
    expect(offA).toHaveBeenCalledTimes(1)
    pv.destroy(document.body)
    expect(offB).toHaveBeenCalledTimes(1)
    // A stale model-loaded from the old viewer reads nothing.
    const fn = (a.on.mock.calls[0] as unknown[])[1] as () => void
    fn()
    expect(a.getSections).not.toHaveBeenCalled()
  })
})
