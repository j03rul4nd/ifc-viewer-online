import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain .mjs build script without types
import { FEATURE_TIERS, ALWAYS_FREE, PLAN_NAMES, withTiers, assetPath } from '../integrations/shopify/build-extension.mjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Runtime = Record<string, (...a: any[]) => any>
const runtimePath = '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo.js'
const load = async (): Promise<Runtime> => {
  delete (window as unknown as { IFCVO?: unknown }).IFCVO
  vi.resetModules()
  return import(/* @vite-ignore */ runtimePath)
}


describe('Shopify plan table (T-325 G1, approved 2026-11-23)', () => {
  const expected: Record<string, string> = {
    viewer: 'free', download: 'free', specs: 'free', rooms: 'free', explorer: 'free', views: 'free',
    files: 'starter', details: 'starter', quote: 'starter', gateddownloads: 'starter', capture: 'starter', score: 'starter', quantities: 'starter',
    tour: 'starter', planset: 'starter', compat: 'starter', planview: 'starter', ar: 'starter', classification: 'starter', variantviews: 'starter',
    compare: 'starter', review: 'starter',
    takeoff: 'business', dpp: 'business', sunlot: 'business', compliance: 'business', roi: 'business', bulk: 'business', intent: 'business',
  }
  it('each feature sits in the approved tier', () => {
    expect(FEATURE_TIERS).toEqual(expected)
  })
  it('loading, the IFC download, specs and rooms are always free', () => {
    for (const f of ALWAYS_FREE as string[]) expect(FEATURE_TIERS[f]).toBe('free')
    expect(ALWAYS_FREE).toEqual(expect.arrayContaining(['viewer', 'download']))
  })
  it('plan names carry the prices and the runtime embeds table and names', () => {
    expect(PLAN_NAMES.starter).toContain('$9')
    expect(PLAN_NAMES.business).toContain('$29')
    const runtime = fs.readFileSync(assetPath('ifcvo.js'), 'utf8').replace(/\r\n/g, '\n')
    expect(runtime).toBe(withTiers(runtime))
    expect(runtime).not.toMatch(/LICENSE_KEY|verifyLicense|data-ifcvo-license/)
  })
  it('no off-platform licence keys remain (App Store billing rule, D-327)', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../integrations/shopify/license'))).toBe(false)
    const snippet = fs.readFileSync(path.resolve(__dirname, '../integrations/shopify/snippets/ifcvo-runtime.liquid'), 'utf8')
    expect(snippet).toContain('data-ifcvo-plan="{{ app.metafields.ifcvo.plan.value | escape }}"')
    expect(snippet).not.toContain('ifcvo.license')
  })
})

describe('Shopify plan on the page (app metafield)', () => {
  afterEach(() => { delete (window as unknown as { Shopify?: unknown }).Shopify })

  it('each plan unlocks its tier and nothing above it', async () => {
    for (const [plan, files, takeoff] of [['free', true, true], ['starter', false, true], ['business', false, false]] as const) {
      document.body.innerHTML = `<i hidden data-ifcvo-plan="${plan}"></i><li id="f" data-ifcvo-gate="files"></li><li id="t"></li>`
      const r = await load()
      expect(r.gate('files', document.getElementById('f'))).toBe(!files)
      expect(document.getElementById('f')!.hidden).toBe(files)
      expect(r.gate('takeoff', document.getElementById('t'))).toBe(!takeoff)
      expect(r.gate('viewer', document.getElementById('t'), 'free')).toBe(true)
    }
  })

  it('an unknown or forged plan value is free', async () => {
    document.body.innerHTML = '<i hidden data-ifcvo-plan="enterprise"></i><li id="f"></li>'
    const r = await load()
    expect((window as unknown as { IFCVO: { plan: string } }).IFCVO.plan).toBe('free')
    expect(r.gate('files', document.getElementById('f'))).toBe(false)
  })

  it('the app metafield sets the plan, and an empty page is free', async () => {
    document.body.innerHTML = `<div data-ifcvo-viewer data-ifcvo-plan="business"><div class="ifcvo-stage"></div></div><li id="glb" data-ifcvo-gate="files"></li>`
    await load()
    const api = (window as unknown as { IFCVO: { plan: string } }).IFCVO
    expect(api.plan).toBe('business')
    expect(document.getElementById('glb')!.hidden).toBe(false)
    document.body.innerHTML = '<li id="q" data-ifcvo-gate="quote"></li>'
    await load()
    expect((window as unknown as { IFCVO: { plan: string } }).IFCVO.plan).toBe('free')
    expect(document.getElementById('q')!.hidden).toBe(true)
  })

  it('the editor note names the plan with its price and links to the listing', async () => {
    const r = await load()
    ;(window as unknown as { Shopify: { designMode: boolean } }).Shopify = { designMode: true }
    document.body.innerHTML = '<div id="t"></div>'
    r.gate('takeoff', document.getElementById('t'), 'free')
    const note = document.querySelector('[data-ifcvo-upsell="takeoff"]')!
    expect(note.textContent).toContain('Business ($29/month)')
    expect(note.querySelector('a')!.getAttribute('href')).toMatch(/^https:\/\//)
  })
})
