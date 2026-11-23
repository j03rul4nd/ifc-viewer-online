import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain .mjs build script without types
import { FEATURE_TIERS, ALWAYS_FREE, PLAN_NAMES, licenseKey, withTiers, assetPath } from '../integrations/shopify/build-extension.mjs'
// @ts-expect-error plain .mjs script without types
import { signToken, rawPublicKey } from '../integrations/shopify/license/sign.mjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Runtime = Record<string, (...a: any[]) => any>
const runtimePath = '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo.js'
const load = async (): Promise<Runtime> => {
  delete (window as unknown as { IFCVO?: unknown }).IFCVO
  vi.resetModules()
  return import(/* @vite-ignore */ runtimePath)
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
const key = rawPublicKey(publicKey)
const shop = 'demo-store.myshopify.com'
const future = Math.floor(Date.now() / 1000) + 86400
const token = (p: Record<string, unknown>, k = privateKey) => signToken({ shop, plan: 'starter', exp: future, ...p }, k)

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
  it('plan names carry the prices and the runtime embeds table, names and public key', () => {
    expect(PLAN_NAMES.starter).toContain('$9')
    expect(PLAN_NAMES.business).toContain('$29')
    const runtime = fs.readFileSync(assetPath('ifcvo.js'), 'utf8').replace(/\r\n/g, '\n')
    expect(runtime).toBe(withTiers(runtime))
    expect(licenseKey()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(runtime).toContain(`const LICENSE_KEY = '${licenseKey()}'`)
  })
  it('the private key is gitignored and never in the repo tree', () => {
    const ignore = fs.readFileSync(path.resolve(__dirname, '../.gitignore'), 'utf8')
    expect(ignore).toContain('integrations/shopify/license/private/')
  })
})

describe('Shopify licence token', () => {
  afterEach(() => { delete (window as unknown as { Shopify?: unknown }).Shopify })

  it('a valid token unlocks its plan for its shop', async () => {
    const r = await load()
    expect(await r.verifyLicense(token({}), shop, { key })).toBe('starter')
    expect(await r.verifyLicense(token({ plan: 'business' }), 'Demo-Store.myshopify.com', { key })).toBe('business')
  })

  it('expired, other shop, tampered or foreign-key tokens fall back to free', async () => {
    const r = await load()
    expect(await r.verifyLicense(token({ exp: Math.floor(Date.now() / 1000) - 1 }), shop, { key })).toBe('free')
    expect(await r.verifyLicense(token({}), 'other.myshopify.com', { key })).toBe('free')
    const [, sig] = token({}).split('.')
    const forged = Buffer.from(JSON.stringify({ shop, plan: 'business', exp: future })).toString('base64url')
    expect(await r.verifyLicense(`${forged}.${sig}`, shop, { key })).toBe('free')
    const other = crypto.generateKeyPairSync('ed25519').privateKey
    expect(await r.verifyLicense(token({}, other), shop, { key })).toBe('free')
    expect(await r.verifyLicense('garbage', shop, { key })).toBe('free')
    expect(await r.verifyLicense('', shop, { key })).toBe('free')
  })

  it('without WebCrypto the shop is free', async () => {
    const r = await load()
    const subtle = vi.spyOn(globalThis, 'crypto', 'get').mockReturnValue(undefined as unknown as Crypto)
    expect(await r.verifyLicense(token({}), shop, { key })).toBe('free')
    subtle.mockRestore()
  })

  it('on the page: gated features stay invisible (space kept) while checking, never shown if the token is bad', async () => {
    document.body.innerHTML = `<div data-ifcvo-viewer data-ifcvo-plan="" data-ifcvo-license="bad.token" data-ifcvo-shop="${shop}"><div class="ifcvo-stage"></div></div>
      <div data-ifcvo-panel="score" data-labels="{}"><div class="ifcvo-body"></div></div><ul><li id="glb" data-ifcvo-gate="files"></li></ul>`
    await load()
    const api = (window as unknown as { IFCVO: { plan: string; license: Promise<string> } }).IFCVO
    const score = document.querySelector('[data-ifcvo-panel="score"]') as HTMLElement
    const glb = document.getElementById('glb')!
    // Before the check settles: not visible, but not removed from layout.
    for (const n of [score, glb]) expect(n.style.visibility).toBe('hidden') // never visible, even if the check already settled
    expect(document.querySelector('[data-ifcvo-viewer]')!.getAttribute('style') || '').not.toContain('hidden')
    expect(await api.license).toBe('free')
    expect(api.plan).toBe('free')
    expect((document.querySelector('[data-ifcvo-panel="score"]') as HTMLElement).hidden).toBe(true)
    expect(document.getElementById('glb')!.hidden).toBe(true)
    expect(glb.style.visibility).toBe('hidden')
  })

  it('a licence that unlocks the feature reveals it only after the check', async () => {
    const r = await load()
    r._resetLicense()
    document.body.innerHTML = `<div data-ifcvo-license="x.y" data-ifcvo-shop="${shop}"></div><li id="f"></li>`
    const subtle = vi.spyOn(globalThis.crypto.subtle, 'verify').mockResolvedValue(true as never)
    vi.spyOn(globalThis.crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey)
    const body = Buffer.from(JSON.stringify({ shop, plan: 'starter', exp: future })).toString('base64url')
    document.querySelector('[data-ifcvo-license]')!.setAttribute('data-ifcvo-license', `${body}.c2ln`)
    const check = r.checkLicense()
    const f = document.getElementById('f')!
    expect(r.gate('files', f)).toBe(true)
    expect(f.style.visibility).toBe('hidden')
    expect(await check).toBe('starter')
    expect(f.style.visibility).toBe('')
    expect(f.hidden).toBe(false)
    vi.restoreAllMocks()
    subtle.mockRestore()
  })

  it('the app metafield wins over the licence, and an empty page is free', async () => {
    document.body.innerHTML = `<div data-ifcvo-viewer data-ifcvo-plan="business" data-ifcvo-license="bad.token" data-ifcvo-shop="${shop}"><div class="ifcvo-stage"></div></div><li id="glb" data-ifcvo-gate="files"></li>`
    await load()
    const api = (window as unknown as { IFCVO: { plan: string; license: Promise<string> } }).IFCVO
    await api.license
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
