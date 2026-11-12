#!/usr/bin/env node
/**
 * Map names check (WP5) — `node scripts/geo/labels-check.mjs [--port 3342] [--url …] [--site catalunya|carmel|all]`
 *
 * Headed Chrome 1600×900 on the bench scene (see map-bench.mjs), dev-only handles:
 *   1. horizon: in the bench views, the farthest placed name and how many were
 *      dropped as beyond the limit, for factors 2, 3, 4, 6 and none;
 *   2. stability: 10 camera stops in a row (1 s pan, stop); names placed in
 *      the first still frame vs 1 s later — share changed must be ≤ 20 %;
 *   3. model gap: 20 random views around the model; no placed name box may
 *      overlap the screen outline of a model box (checked here, independently
 *      of the placement code, by sampling points of each name box).
 * Writes a JSON next to the bench files.
 */
import { spawn, execSync } from 'node:child_process'
import { writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return acc
}, []))
const SITES = {
  catalunya: { lat: 41.38740, lon: 2.16964, relocate: false },
  carmel: { lat: 41.4172, lon: 2.1556, relocate: true },
}
const SCENE = '/?model=/models/barcelona-catalunya/fonts-bessones.ifc&map=terrain,buildings&validate=0&ui=client'
const W = 1600, H = 900
const port = Number(args.port ?? 3342)
const outDir = args.out ?? 'C:/repo/ifc/docs-planning/mapa-osm/bench'
const siteNames = (args.site && args.site !== 'all') ? String(args.site).split(',') : Object.keys(SITES)
const FACTORS = args['no-horizon'] ? [0] : [1e6, 6, 4, 3, 2]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...m) => console.log(`[labels ${new Date().toISOString().slice(11, 19)}]`, ...m)

async function up(url) { try { return (await fetch(url)).ok } catch { return false } }
async function startServer() {
  if (args.url) return { base: String(args.url).replace(/\/$/, ''), stop: () => {} }
  const base = `http://localhost:${port}`
  if (await up(base)) throw new Error(`port ${port} is busy`)
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {})
  for (let i = 0; i < 120; i++) { if (await up(base)) break; await sleep(1000) }
  if (!(await up(base))) throw new Error('dev server did not start')
  return { base, stop: () => { try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }) } catch { child.kill() } } }
}
async function launch() {
  const FLAGS = [`--window-size=${W + 16},${H + 140}`, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling']
  try { return await chromium.launch({ headless: false, channel: 'chrome', args: FLAGS }) } catch {
    const dir = join(homedir(), 'AppData', 'Local', 'ms-playwright')
    const pick = existsSync(dir) ? readdirSync(dir).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : null
    return chromium.launch({ headless: false, args: FLAGS, executablePath: join(dir, pick, 'chrome-win64', 'chrome.exe') })
  }
}
async function waitReady(page, timeout = 180_000) {
  const t0 = Date.now()
  for (;;) {
    const ok = await page.evaluate(() => {
      const s = globalThis.__geoStore?.getState()
      return !!s && s.buildingsStatus === 'ready' && s.terrainStatus === 'ready' && !!globalThis.__geoSystem
    }).catch(() => false)
    if (ok) return
    if (Date.now() - t0 > timeout) throw new Error('map not ready')
    await sleep(250)
  }
}

const look = (page, pos, target) => page.evaluate(({ pos, target }) => globalThis.__ifcViewer.setCameraLookAt(
  { x: pos[0], y: pos[1], z: pos[2] }, { x: target[0], y: target[1], z: target[2] }, false), { pos, target })
const dbg = (page) => page.evaluate(() => globalThis.__screenLabels.debug())

function views(s, g) {
  const ox = 0.6, oz = 0.8
  const at45 = (d) => ({ pos: [s.x + ox * d * Math.SQRT1_2, g + d * Math.SQRT1_2, s.z + oz * d * Math.SQRT1_2], target: [s.x, g, s.z] })
  return {
    amplia: { pos: [s.x + 900, g + 900, s.z + 1200], target: [s.x, s.y, s.z] },
    baja: { pos: [s.x + 250, g + 160, s.z + 330], target: [s.x - 300, g, s.z - 500] },
    cerca: at45(50), calle: at45(25),
  }
}

/** Independent overlap test: any of 7×5 sample points of the box strictly inside the convex polygon. */
function boxInHull(box, hull) {
  if (hull.length < 3) return false
  let sign = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    const c = (b[0] - a[0]) * (hull[(i + 2) % hull.length][1] - a[1]) - (b[1] - a[1]) * (hull[(i + 2) % hull.length][0] - a[0])
    if (c !== 0) { sign = Math.sign(c); break }
  }
  const inside = (x, y) => hull.every((a, i) => {
    const b = hull[(i + 1) % hull.length]
    return sign * ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) > 0.5
  })
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) {
    if (inside(box[0] + ((box[2] - box[0]) * i) / 6, box[1] + ((box[3] - box[1]) * j) / 4)) return true
  }
  return false
}

async function runSite(browser, base, siteName) {
  const site = SITES[siteName]
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(base + SCENE, { waitUntil: 'domcontentloaded', timeout: 240_000 })
  await page.bringToFront()
  await page.getByRole('button', { name: /^(Activar mapa|Enable map)$/ }).first().click({ timeout: 240_000 })
  await waitReady(page)
  if (site.relocate) { await page.evaluate(({ lat, lon }) => globalThis.__geoRelocate(lat, lon), site); await waitReady(page) }
  await page.evaluate(() => globalThis.__geoStore.getState().setAutoDetail(false))
  const { s, g } = await page.evaluate((site) => {
    const geo = globalThis.__geoSystem
    const s = geo.sceneOfLatLon(site.lat, site.lon)
    return { s: { x: s.x, y: s.y, z: s.z }, g: geo.groundHeightAt(s.x, s.z) ?? s.y }
  }, site)
  const V = views(s, g)

  // 1. Horizon, per factor.
  const horizon = []
  for (const [name, p] of Object.entries(V)) {
    await look(page, p.pos, p.target); await sleep(5000)
    for (const f of FACTORS) {
      await page.evaluate((f) => globalThis.__screenLabels.setHorizonFactor(f), f)
      await sleep(1200)
      const d = await dbg(page)
      const far = [...d.placedBoxes].sort((a, b) => b.distM - a.distM).slice(0, 4)
        .map((x) => `${x.key.split('|')[1]}@${(x.distM / 1000).toFixed(1)}km`)
      horizon.push({ view: name, factor: f === 1e6 ? 'none' : f, placed: d.placed.length, beyond: d.beyondHorizon, horizonKm: +(d.horizonM / 1000).toFixed(2), farthest: far })
      log(siteName, name, 'factor', f === 1e6 ? 'none' : f, 'placed', d.placed.length, 'beyond', d.beyondHorizon, far.join(', '))
    }
    await page.evaluate(() => globalThis.__screenLabels.setHorizonFactor(0)) // back to the default
  }

  // 2. Stability: 10 stops from the baja/amplia poses, with and without hysteresis.
  const stops = []
  for (const bonus of [-1, 0]) {
    await page.evaluate((b) => globalThis.__screenLabels.setKeepBonus(b), bonus)
    for (let k = 0; k < 10; k++) {
      const p = k % 2 ? V.amplia : V.baja
      const ang = (k * 37 * Math.PI) / 180
      const dx = Math.cos(ang) * 150, dz = Math.sin(ang) * 150
      for (let t = 0; t <= 20; t++) {
        const a = t / 20
        await look(page, [p.pos[0] + dx * a, p.pos[1], p.pos[2] + dz * a], [p.target[0] + dx * a, p.target[1], p.target[2] + dz * a])
        await sleep(50)
      }
      const stoppedAt = await page.evaluate(() => performance.now())
      // The first placement after the stop (220 ms of stillness), then 1 s later.
      let first = null, firstAt = 0
      const t0 = Date.now()
      while (Date.now() - t0 < 3000) {
        const d = await dbg(page)
        if (d.placedAt > stoppedAt) { first = d.placed; firstAt = d.placedAt; break }
        await sleep(15)
      }
      await sleep(1000)
      const dl = await dbg(page)
      const A = new Set(first ?? []), B = new Set(dl.placed)
      const changed = [...A].filter((x) => !B.has(x)).length + [...B].filter((x) => !A.has(x)).length
      const share = changed / Math.max(1, Math.max(A.size, B.size))
      stops.push({ hysteresis: bonus !== 0, stop: k, first: A.size, later: B.size, changed, share: +share.toFixed(3), gapMs: Math.round(dl.placedAt - firstAt) })
      log(siteName, bonus ? 'hyst' : 'none', 'stop', k, A.size, '→', B.size, 'changed', changed, `${(100 * share).toFixed(0)} %`)
    }
  }
  await page.evaluate(() => globalThis.__screenLabels.setKeepBonus(-1))

  // 3. Model gap: 20 random views.
  let rng = 12345
  const rnd = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const gap = []
  for (let k = 0; k < 20; k++) {
    const dist = 80 + rnd() * 1400, az = rnd() * Math.PI * 2, el = (15 + rnd() * 60) * Math.PI / 180
    const tx = s.x + (rnd() - 0.5) * 200, tz = s.z + (rnd() - 0.5) * 200
    const pos = [tx + Math.cos(az) * Math.cos(el) * dist, g + Math.sin(el) * dist, tz + Math.sin(az) * Math.cos(el) * dist]
    await look(page, pos, [tx, g, tz]); await sleep(1500)
    const d = await dbg(page)
    const hits = d.placedBoxes.filter((b) => d.blocked.some((h) => boxInHull(b.box, h))).map((b) => b.key.split('|')[1])
    gap.push({ view: k, placed: d.placed.length, modelOutlines: d.blocked.length, overlaps: hits })
    log(siteName, 'random', k, 'placed', d.placed.length, 'outlines', d.blocked.length, 'overlaps', hits.length)
  }
  await ctx.close()
  return { site: siteName, horizon, stops, gap }
}

const commit = execSync('git rev-parse --short=8 HEAD', { cwd: ROOT }).toString().trim()
const server = await startServer()
const browser = await launch()
try {
  const out = []
  for (const n of siteNames) out.push(await runSite(browser, server.base, n))
  const file = join(outDir, `${new Date().toISOString().slice(0, 10)}-${commit}-labels.json`)
  writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), commit, viewport: [W, H], results: out }, null, 2))
  log('wrote', file)
} finally { await browser.close(); server.stop() }
