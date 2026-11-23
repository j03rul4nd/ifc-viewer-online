import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module without types
import * as f from '../integrations/shopify/app/ui-shared/ifcvo-files.js'

const APP = path.join(__dirname, '../integrations/shopify/app')
const LANGS = ['en.default', 'es', 'fr', 'de', 'it', 'pt-BR', 'ca']
const mf = (key: string, extra: Record<string, unknown>) => ({ namespace: 'ifcvo', key, type: 'x', value: '', updatedAt: null, reference: null, references: null, ...extra })

const product = {
  id: 'gid://shopify/Product/1',
  title: 'Cabin',
  handle: 'cabin',
  onlineStoreUrl: 'https://shop.example/products/cabin',
  metafields: [
    mf('model', { reference: { url: 'https://cdn.shopify.com/cabin.ifc' } }),
    mf('version', { value: '3' }),
    mf('updated_at', { value: '2026-06-10' }),
    mf('release_notes', { value: 'Fixed stair riser height.' }),
    mf('handover', { references: { nodes: [{ url: 'https://cdn.shopify.com/as-built.ifc' }, { url: 'https://cdn.shopify.com/manual.pdf' }] } }),
    mf('assembly_views', { value: JSON.stringify([{ title: 'Base frame', view: 'v1', note: 'Level first' }, { title: '' }, 'Walls', { title: 'Roof', view: 'v 3' }]) }),
    mf('warranty_months', { value: '24' }),
  ],
}

describe('F4 plan updated', () => {
  it('release notes reach the card; badge only for orders before the release', () => {
    const items = [
      { productId: product.id, variantId: '', orderName: '#1', orderDate: '2026-06-09' },
      { productId: product.id, variantId: 'gid://shopify/ProductVariant/2', orderName: '#2', orderDate: '2026-06-10' },
      { productId: product.id, variantId: 'gid://shopify/ProductVariant/3', orderName: '#3', orderDate: '2026-07-01' },
    ]
    const cards = f.modelCards(items, { nodes: [product] })
    expect(cards.map((c: { updatedSincePurchase: boolean }) => c.updatedSincePurchase)).toEqual([true, false, false])
    expect(cards[0].releaseNotes).toBe('Fixed stair riser height.')
  })

  it('releaseInputs builds version + date + notes metafields and rejects bad input', () => {
    const out = f.releaseInputs('gid://shopify/Product/1', { version: ' 3.1 ', date: '2026-11-23', notes: 'New roof' })
    expect(out).toEqual([
      { ownerId: 'gid://shopify/Product/1', namespace: 'ifcvo', key: 'version', type: 'single_line_text_field', value: '3.1' },
      { ownerId: 'gid://shopify/Product/1', namespace: 'ifcvo', key: 'updated_at', type: 'date', value: '2026-11-23' },
      { ownerId: 'gid://shopify/Product/1', namespace: 'ifcvo', key: 'release_notes', type: 'multi_line_text_field', value: 'New roof' },
    ])
    const ok = { version: '1', date: '2026-01-01', notes: 'x' }
    expect(() => f.releaseInputs('gid://shopify/Order/1', ok)).toThrow('owner')
    expect(() => f.releaseInputs('gid://shopify/Product/1', { ...ok, version: '' })).toThrow('version')
    expect(() => f.releaseInputs('gid://shopify/Product/1', { ...ok, date: '2026-02-30' })).toThrow('date')
    expect(() => f.releaseInputs('gid://shopify/Product/1', { ...ok, date: '23/11/2026' })).toThrow('date')
    expect(() => f.releaseInputs('gid://shopify/Product/1', { ...ok, notes: ' ' })).toThrow('notes')
    expect(f.RELEASE_MUTATION).toMatch(/metafieldsSet\(metafields:\$m\)/)
  })

  it('localDay uses the local calendar', () => {
    expect(f.localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('F8 handover', () => {
  const card = () => f.modelCards([{ productId: product.id, variantId: 'gid://shopify/ProductVariant/7', orderName: '#1', orderDate: '2026-01-31' }], { nodes: [product] })[0]

  it('reads handover files, ordered steps and warranty months', () => {
    const c = card()
    expect(c.handover.map((x: { name: string; kind: string }) => x.name + ':' + x.kind)).toEqual(['as-built.ifc:IFC', 'manual.pdf:PDF'])
    expect(c.steps).toEqual([
      { title: 'Base frame', view: 'v1', note: 'Level first' },
      { title: 'Walls', view: '', note: '' },
      { title: 'Roof', view: 'v 3', note: '' },
    ])
    expect(c.warrantyMonths).toBe(24)
  })

  it('steps accept {steps:[...]}, plain lines, and ignore junk', () => {
    expect(f.assemblySteps(mf('assembly_views', { value: '{"steps":["A","B"]}' })).map((s: { title: string }) => s.title)).toEqual(['A', 'B'])
    expect(f.assemblySteps(mf('assembly_views', { value: 'One\nTwo' })).length).toBe(2)
    expect(f.assemblySteps(mf('assembly_views', { value: '42' }))).toEqual([])
    expect(f.assemblySteps(null)).toEqual([])
    expect(f.assemblySteps(mf('assembly_views', { value: JSON.stringify(Array.from({ length: 80 }, (_, i) => 's' + i)) })).length).toBe(f.MAX_STEPS)
  })

  it('warranty date = order date + months on the calendar, timezone-safe', () => {
    expect(f.addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(f.addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(f.addMonths('2026-11-15', 24)).toBe('2028-11-15')
    expect(f.addMonths('2026-12-31', 1)).toBe('2027-01-31')
    expect(f.addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(f.addMonths('bad', 1)).toBe('')
    expect(f.warrantyUntil(card())).toBe('2028-01-31')
    expect(f.warrantyUntil({ warrantyMonths: 0, orderDate: '2026-01-01' })).toBe('')
    expect(f.warrantyMonthsOf(mf('warranty_months', { value: '1.5' }))).toBe(0)
    expect(f.warrantyMonthsOf(mf('warranty_months', { value: '-3' }))).toBe(0)
  })

  it('each step opens the viewer at its saved view', () => {
    const c = card()
    expect(f.stepUrl(c, '', c.steps[2], 'ifc_handover')).toBe('https://shop.example/products/cabin?utm_source=ifc_handover#ifcvo-open=1&ifcvo-v=3&ifcvo-view=v%203')
    expect(f.stepUrl(c, '', c.steps[1], 'ifc_handover')).not.toContain('ifcvo-view')
  })
})

describe('admin release extension', () => {
  const dir = path.join(APP, 'extensions/ifc-admin-releases')
  it('is an admin product action and the app has write_products', () => {
    const toml = fs.readFileSync(path.join(dir, 'shopify.extension.toml'), 'utf8')
    expect(toml).toMatch(/type = "ui_extension"/)
    expect(toml).toContain('target = "admin.product-details.action.render"')
    expect(fs.readFileSync(path.join(APP, 'shopify.app.toml'), 'utf8')).toMatch(/scopes = "[^"]*write_products/)
    expect(JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).workspaces).toContain('extensions/ifc-admin-releases')
  })

  it('has the same translation keys in 7 languages', () => {
    const flat = (o: Record<string, unknown>, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v as Record<string, unknown>, p + k + '.') : [p + k]))
    const read = (l: string) => JSON.parse(fs.readFileSync(path.join(dir, 'locales', l + '.json'), 'utf8'))
    const en = flat(read('en.default')).sort()
    for (const l of LANGS) expect(flat(read(l)).sort(), l).toEqual(en)
    for (const k of ['owner', 'version', 'date', 'notes', 'save']) expect(en).toContain('error.' + k)
  })
})
