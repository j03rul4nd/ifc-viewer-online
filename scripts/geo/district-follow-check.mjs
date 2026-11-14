#!/usr/bin/env node
/**
 * WP3 check — the full-detail district follows the camera.
 * `node scripts/geo/district-follow-check.mjs --url http://localhost:3411`
 *
 * Headed Chrome, 1600×900 (as the map bench). Opens the test scene at Plaça de
 * Catalunya with an EMPTY profile (so the anchor's own query counts too), then:
 *   1. flies to the Sagrada Família, stops at 300 m: time until the block is
 *      drawn, and Overpass/OSM requests for it;
 *   2. flies back and returns: requests (expected 0);
 *   3. reloads the page (same profile, IndexedDB kept) and repeats 1: requests (expected 0);
 *   4. five jumps in a row to new places: every Overpass/OSM request time, and
 *      the smallest gap between two;
 *   then `getDistrictStats().doubled` (buildings drawn twice at the seams) and
 *   the model's height before and after.
 * Prints a JSON summary; writes it to --out when given.
 */
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return acc
}, []))
const BASE = String(args.url ?? 'http://localhost:3411').replace(/\/$/, '')
const SCENE = '/?model=/models/barcelona-catalunya/fonts-bessones.ifc&map=terrain,buildings&validate=0&ui=client'
const W = 1600, H = 900
const OSM_HOSTS = /overpass|maps\.mail\.ru|api\.openstreetmap\.org/
const SAGRADA = { lat: 41.4036, lon: 2.1744 }
const CATALUNYA = { lat: 41.38740, lon: 2.16964 }
const JUMPS = [
  { lat: 41.3984, lon: 2.1600 }, // Gràcia
  { lat: 41.3800, lon: 2.1900 }, // Barceloneta
  { lat: 41.4100, lon: 2.1900 }, // Clot
  { lat: 41.3760, lon: 2.1480 }, // Sants
  { lat: 41.4030, lon: 2.1450 }, // Sant Gervasi
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...m) => console.log(`[wp3 ${new Date().toISOString().slice(11, 19)}]`, ...m)

const FLAGS = [`--window-size=${W + 16},${H + 140}`, '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--disable-background-timer-throttling']

const requests = [] // { t, url }
async function open(profile) {
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false, channel: 'chrome', args: FLAGS, viewport: { width: W, height: H }, deviceScaleFactor: 1,
  })
  ctx.on('request', (r) => { if (OSM_HOSTS.test(r.url())) requests.push({ t: Date.now(), url: r.url().slice(0, 90) }) })
  const page = ctx.pages()[0] ?? await ctx.newPage()
  await page.goto(BASE + SCENE, { waitUntil: 'domcontentloaded', timeout: 240_000 })
  await page.bringToFront()
  const consent = page.getByRole('button', { name: /^(Activar mapa|Enable map)$/ })
  if (await consent.first().isVisible({ timeout: 60_000 }).catch(() => false)) await consent.first().click()
  for (let i = 0; i < 720; i++) {
    const ok = await page.evaluate(() => {
      const s = globalThis.__geoStore?.getState()
      return s && s.buildingsStatus === 'ready' && s.terrainStatus === 'ready' && !!globalThis.__geoSystem
    }).catch(() => false)
    if (ok) break
    await sleep(250)
  }
  await page.evaluate(() => globalThis.__geoStore.getState().setAutoDetail(true))
  return { ctx, page }
}

/** Fly in 2 s to 300 m (45°) above a place, then stay still. */
async function flyTo(page, at, d = 300) {
  await page.evaluate(async ({ at, d }) => {
    const geo = globalThis.__geoSystem, v = globalThis.__ifcViewer
    const s = geo.sceneOfLatLon(at.lat, at.lon)
    const g = geo.groundHeightAt(s.x, s.z) ?? 0
    const vp = v.getCameraViewpoint()
    const p0 = vp.position, t0 = vp.target
    const k = d * Math.SQRT1_2
    const p1 = { x: s.x + 0.6 * k, y: g + k, z: s.z + 0.8 * k }, t1 = { x: s.x, y: g, z: s.z }
    for (let i = 1; i <= 40; i++) {
      const f = i / 40, lerp = (a, b) => a + (b - a) * f
      v.setCameraLookAt({ x: lerp(p0.x, p1.x), y: lerp(p0.y, p1.y), z: lerp(p0.z, p1.z) },
        { x: lerp(t0.x, t1.x), y: lerp(t0.y, t1.y), z: lerp(t0.z, t1.z) }, false)
      await new Promise((r) => setTimeout(r, 50))
    }
  }, { at, d })
}
const stats = (page) => page.evaluate(() => globalThis.__geoSystem.getDistrictStats())
const phase = (page) => page.evaluate(() => globalThis.__geoStore.getState().sceneReport?.phase ?? null)
// The model's world box bottom (the geo anchor's ground Y as a stand-in when the viewer has no such handle).
const modelY = (page) => page.evaluate(() => {
  const v = globalThis.__ifcViewer
  const b = v?.getActiveModelBounds?.() ?? (v?.getModelBounds && v?.getActiveModelId ? v.getModelBounds(v.getActiveModelId()) : null)
  if (b) return +(b.center.y - b.size.y / 2).toFixed(4)
  const a = globalThis.__geoSystem?.getAnchor?.()
  return a ? JSON.stringify(a) : null
})

async function waitBlock(page, before, timeout = 60_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const s = await stats(page)
    if (s.fetches > before && !s.inFlight && (await phase(page)) === 'ready') return Date.now() - t0
    await sleep(250)
  }
  return null
}

const out = {}
const profile = mkdtempSync(join(tmpdir(), 'wp3-'))
let { ctx, page } = await open(profile)
out.loadRequests = requests.length
const y0 = await modelY(page)
log('anchor ready, requests', requests.length)

// 1. Catalunya → Sagrada Família
let n0 = requests.length, f0 = (await stats(page)).fetches
await flyTo(page, SAGRADA)
const stopAt = Date.now()
const ms = await waitBlock(page, f0)
out.first = { ms: ms === null ? null : ms + 0, sinceStopMs: Date.now() - stopAt, requests: requests.length - n0, stats: await stats(page) }
log('first', out.first)

// 2. back and return
await flyTo(page, CATALUNYA); await sleep(4000)
n0 = requests.length
await flyTo(page, SAGRADA); await sleep(5000)
out.returnSameSession = { requests: requests.length - n0, stats: await stats(page) }
log('return', out.returnSameSession)

// 3. reload: the IndexedDB cache answers
await ctx.close()
;({ ctx, page } = await open(profile))
n0 = requests.length; f0 = (await stats(page)).fetches
await flyTo(page, SAGRADA)
const ms3 = await waitBlock(page, f0)
out.afterReload = { ms: ms3, requests: requests.length - n0, stats: await stats(page) }
log('reload', out.afterReload)

// 4. five jumps, 4 s apart
const jumpStart = requests.length
for (const j of JUMPS) { await flyTo(page, j); await sleep(4000) }
await sleep(25_000)
const jr = requests.slice(jumpStart)
const gaps = jr.slice(1).map((r, i) => r.t - jr[i].t)
out.jumps = { requests: jr.length, minGapMs: gaps.length ? Math.min(...gaps) : null, times: jr.map((r) => r.t - jr[0]?.t), stats: await stats(page) }
log('jumps', out.jumps)

out.doubled = (await stats(page)).doubled
out.modelY = { before: y0, after: await modelY(page) }
out.allRequests = requests.map((r) => r.url)
console.log(JSON.stringify(out, null, 2))
if (args.out) writeFileSync(String(args.out), JSON.stringify(out, null, 2))
await ctx.close()
