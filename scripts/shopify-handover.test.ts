import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module without types
import * as f from '../integrations/shopify/app/ui-shared/ifcvo-files.js'

const APP = path.join(__dirname, '../integrations/shopify/app')
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

describe('access scopes (D-326w)', () => {
  it('requests no Admin API write scope and ships no admin action', () => {
    expect(fs.readFileSync(path.join(APP, 'shopify.app.toml'), 'utf8')).toMatch(/scopes = "customer_read_orders,unauthenticated_read_product_listings"/)
    expect(fs.existsSync(path.join(APP, 'extensions/ifc-admin-releases'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).workspaces).toEqual(['extensions/ifc-order-files', 'extensions/ifc-my-models'])
  })
})

