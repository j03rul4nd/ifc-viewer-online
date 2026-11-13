#!/usr/bin/env node
/**
 * Map 3D bench — `npm run bench:map [-- --site catalunya|carmel|all] [--port 3341]
 *   [--url http://localhost:3341] [--views amplia,baja,cerca,calle] [--out dir] [--quick]`
 *
 * Headed Chrome (a hidden or headless page throttles requestAnimationFrame and no
 * FPS from it is real), 1600×900, DPR 1. Starts this worktree's dev server unless
 * `--url` is given, opens the test scene, accepts the map consent, waits for the
 * relief and the OSM district, moves to the site with the dev-only `__geoRelocate`
 * (same path as the manual placement editor) and measures every fixed view with
 * the city cells (`autoDetail`) on and off:
 *   fps over 5 s at rest (reported, not judged: vsync caps it at 60) and the
 *   median of 3 back-and-forth 120 m/s pans (±120 m) of 8 s each after one
 *   uncounted warm-up over the same ground (the repeatable number),
 *   time until `getCityStats().cells === wanted`, triangles and draw calls, JS heap,
 *   city-cell bytes, device px per texel of the relief and of the flat map, and
 *   requests per host (Playwright sees the workers' fetches too).
 * The flat map is measured in `balanced` (held through `__basemapQuality.hold`).
 *
 * Output: `<out>/<date>-<commit>-<site>.json` (default out: C:/repo/ifc/docs-planning/mapa-osm/bench)
 * and a table on the console. Dev handles only exist in the dev build.
 *
 * `npm run bench:map -- --compare a.json b.json` checks two runs of the same
 * commit pair by pair: pan median within 10 %, or within 3 fps when the mean of
 * the two is under 30 fps. Exit code 1 if any pair fails.
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
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
const QUICK = !!args.quick
const REST_MS = QUICK ? 2000 : 5000
const PAN_MS = QUICK ? 3000 : 8000
const PANS = QUICK ? 1 : 3
const PAN_SPEED = 120 // m/s
// Back and forth over ±PAN_AMP m around the pose: the ground is loaded by the
// warm-up pan, so the measured pans time drawing, not downloading.
const PAN_AMP = 120 // m
const SETTLE_MS = QUICK ? 4000 : 8000
const CELLS_TIMEOUT_MS = 90_000
const port = Number(args.port ?? 3341)
const outDir = args.out ?? 'C:/repo/ifc/docs-planning/mapa-osm/bench'
const siteNames = (args.site && args.site !== 'all') ? String(args.site).split(',') : Object.keys(SITES)
const viewNames = args.views ? String(args.views).split(',') : ['amplia', 'baja', 'cerca', 'calle']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...m) => console.log(`[bench ${new Date().toISOString().slice(11, 19)}]`, ...m)

// ── dev server ─────────────────────────────────────────────────────────────────
async function up(url) {
  try { return (await fetch(url)).ok } catch { return false }
}
async function startServer() {
  if (args.url) return { base: String(args.url).replace(/\/$/, ''), stop: () => {} }
  const base = `http://localhost:${port}`
  if (await up(base)) {
    // Another worktree's server would be filed under this commit.
    if (!args.reuse) throw new Error(`port ${port} is busy; pass --reuse if it serves this worktree, or --port`)
    log(`reusing server on ${base}`); return { base, stop: () => {} }
  }
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', () => {}); child.stderr.on('data', (d) => { if (/error/i.test(String(d))) process.stderr.write(d) })
  for (let i = 0; i < 120; i++) { if (await up(base)) break; await sleep(1000) }
  if (!(await up(base))) throw new Error('dev server did not start')
  log(`dev server on ${base}`)
  return { base, stop: () => { try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }) } catch { child.kill() } } }
}

// ── browser ────────────────────────────────────────────────────────────────────
const FLAGS = [
  `--window-size=${W + 16},${H + 140}`,
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--enable-precise-memory-info',
  // gc() in the page: the heap is read after a forced collection (median of 3), not as one noisy sample.
  '--js-flags=--expose-gc',
]
async function launch() {
  try {
    return await chromium.launch({ headless: false, channel: 'chrome', args: FLAGS })
  } catch {
    // No Chrome installed: the newest Playwright Chromium on this machine.
    const dir = join(homedir(), 'AppData', 'Local', 'ms-playwright')
    const pick = existsSync(dir) ? readdirSync(dir).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : null
    if (!pick) throw new Error('no Chrome or Playwright Chromium found')
    return chromium.launch({ headless: false, args: FLAGS, executablePath: join(dir, pick, 'chrome-win64', 'chrome.exe') })
  }
}

async function waitFor(page, fn, arg, timeout, what) {
  const t0 = Date.now()
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null)
    if (v) return Date.now() - t0
    if (Date.now() - t0 > timeout) throw new Error(`timeout: ${what}`)
    await sleep(250)
  }
}
const statusOf = (page) => page.evaluate(() => {
  const s = globalThis.__geoStore?.getState()
  return s ? { buildings: s.buildingsStatus, terrain: s.terrainStatus } : null
})
async function waitReady(page, timeout = 180_000) {
  const ms = await waitFor(page, () => {
    const s = globalThis.__geoStore?.getState()
    if (!s) return false
    if (s.buildingsStatus === 'error' || s.terrainStatus === 'error') return 'error'
    return s.buildingsStatus === 'ready' && s.terrainStatus === 'ready' && !!globalThis.__geoSystem
  }, null, timeout, 'buildings+terrain ready')
  const st = await statusOf(page)
  if (st.buildings !== 'ready' || st.terrain !== 'ready') throw new Error(`map failed: ${JSON.stringify(st)}`)
  return ms
}

// ── views ──────────────────────────────────────────────────────────────────────
function viewPose(name, s, g) {
  const ox = 0.6, oz = 0.8 // the horizontal direction of the two fixed views (900:1200)
  const at45 = (d) => ({ pos: [s.x + ox * d * Math.SQRT1_2, g + d * Math.SQRT1_2, s.z + oz * d * Math.SQRT1_2], target: [s.x, g, s.z] })
  switch (name) {
    case 'amplia': return { pos: [s.x + 900, g + 900, s.z + 1200], target: [s.x, s.y, s.z] }
    case 'baja': return { pos: [s.x + 250, g + 160, s.z + 330], target: [s.x - 300, g, s.z - 500] }
    case 'cerca': return at45(50)
    case 'calle': return at45(25)
    default: throw new Error(`unknown view ${name}`)
  }
}

/** rAF deltas inside the page; also optionally drives a pan. */
function frameSampler({ ms, pan, pose, speed, amp }) {
  return new Promise((resolve) => {
    const v = globalThis.__ifcViewer
    const dts = []
    let last = performance.now()
    const t0 = last
    const dir = [-0.6, -0.8] // pan away from the camera, along the view's ground direction
    const step = (now) => {
      dts.push(now - last); last = now
      const t = (now - t0) / 1000
      if (pan) {
        // Triangle wave 0 → +amp → −amp → 0 at constant speed.
        const x = ((speed * t) / amp) % 4
        const d = amp * (x < 1 ? x : x < 3 ? 2 - x : x - 4)
        v.setCameraLookAt(
          { x: pose.pos[0] + dir[0] * d, y: pose.pos[1], z: pose.pos[2] + dir[1] * d },
          { x: pose.target[0] + dir[0] * d, y: pose.target[1], z: pose.target[2] + dir[1] * d }, false)
      }
      if (now - t0 < ms) requestAnimationFrame(step)
      else {
        dts.shift()
        const sorted = [...dts].sort((a, b) => a - b)
        const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
        resolve({ visibility: document.visibilityState, focus: document.hasFocus(), frames: dts.length, fpsMean: 1000 * dts.length / dts.reduce((x, y) => x + y, 0), fpsMedian: 1000 / q(0.5), fpsP5: 1000 / q(0.95), worstMs: sorted[sorted.length - 1] })
      }
    }
    requestAnimationFrame(step)
  })
}

async function heapAfterGc() {
  if (typeof globalThis.gc !== 'function' || !performance.memory) return null
  const xs = []
  for (let i = 0; i < 3; i++) {
    globalThis.gc()
    await new Promise((r) => setTimeout(r, 300))
    xs.push(performance.memory.usedJSHeapSize / 1048576)
  }
  xs.sort((a, b) => a - b)
  return +xs[1].toFixed(1)
}

function sampleScene({ H, lat }) {
  const geo = globalThis.__geoSystem, v = globalThis.__ifcViewer
  const C = 40075016.686 * Math.cos(lat * Math.PI / 180)
  const vp = v.getCameraViewpoint()
  const dx = vp.position.x - vp.target.x, dy = vp.position.y - vp.target.y, dz = vp.position.z - vp.target.z
  const dist = Math.hypot(dx, dy, dz)
  const mPerPx = (dist * 2 * Math.tan((vp.fovDeg * Math.PI / 180) / 2)) / (H * devicePixelRatio)
  const pxPerTexel = (texelM) => texelM / mPerPx
  // Relief: the sharpest painted detail square, else the base patch texture.
  const terrain = globalThis.__geoTerrain?.()
  const dbg = terrain?.detailDebug?.()
  const zs = (dbg?.slots ?? []).filter((s) => s && s.opacity > 0.5).map((s) => Number(String(s.key).split('/')[0]))
  const reliefZ = zs.length ? Math.max(...zs) : null
  // No detail square → the base patch: 3×3 tiles at `terrain.zoom` in one 3 072 px texture.
  const reliefTexelM = reliefZ !== null ? C / (512 * 2 ** reliefZ)
    : (terrain?.zoom ? (3 * C / 2 ** terrain.zoom) / 3072 : null)
  // Flat map: deepest visible tile (512 px vector tiles) — the one nearest the
  // camera, set against the target distance: a conservative (low) px/texel.
  const tiles = globalThis.__basemapTiles
  let mapZ = null
  for (const t of tiles?.visibleTiles ?? []) {
    const d = t.__depth ?? t.internal?.depth ?? t.__level
    if (typeof d === 'number' && (mapZ === null || d > mapZ)) mapZ = d
  }
  const mapTexelM = mapZ !== null ? C / (512 * 2 ** mapZ) : null
  const rs = v.getRenderStats?.()
  const city = geo.getCityStats?.()
  return {
    cameraDistM: Math.round(dist),
    triangles: rs?.triangles ?? null, calls: rs?.calls ?? null,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    city: city ? { cells: city.cells, wanted: city.wanted, buildings: city.buildings, triangles: city.triangles, bytesMB: +(city.bytes / 1048576).toFixed(1) } : null,
    relief: { zoom: reliefZ, texelM: reliefTexelM && +reliefTexelM.toFixed(3), pxPerTexel: reliefTexelM && +pxPerTexel(reliefTexelM).toFixed(2), detail: dbg ? { painted: dbg.painted, lastPaintMs: dbg.lastPaintMs, wanted: dbg.wanted?.length } : null },
    flatMap: { quality: globalThis.__basemapQuality?.get?.() ?? null, errorTarget: tiles?.errorTarget ?? null, maxDepth: mapZ, texelM: mapTexelM && +mapTexelM.toFixed(3), pxPerTexel: mapTexelM && +pxPerTexel(mapTexelM).toFixed(2), visibleTiles: tiles?.visibleTiles?.size ?? null },
  }
}

async function measureView(page, site, name, autoDetail, hosts) {
  const before = { ...hosts }
  // The hold is lost if the geo-system is recreated (provider change): re-apply per view.
  await page.evaluate(() => globalThis.__basemapQuality?.hold('balanced'))
  const pose = await page.evaluate(({ site, name }) => {
    const geo = globalThis.__geoSystem
    const s = geo.sceneOfLatLon(site.lat, site.lon)
    const g = geo.groundHeightAt(s.x, s.z) ?? s.y
    return { s: { x: s.x, y: s.y, z: s.z }, g }
  }, { site, name })
  const p = viewPose(name, pose.s, pose.g)
  await page.evaluate(({ p }) => globalThis.__ifcViewer.setCameraLookAt(
    { x: p.pos[0], y: p.pos[1], z: p.pos[2] }, { x: p.target[0], y: p.target[1], z: p.target[2] }, false), { p })
  let cellsMs = null
  if (autoDetail) {
    try {
      await sleep(600) // let the manager plan the new view
      // Ready = cells === wanted with nothing in flight, held for 1 s: a single
      // true poll could still be the previous view's state before the replan.
      const t0 = Date.now()
      let since = null
      for (;;) {
        const ok = await page.evaluate(() => {
          const c = globalThis.__geoSystem.getCityStats?.()
          return !!(c && c.wanted > 0 && c.cells === c.wanted && c.inFlight === 0)
        }).catch(() => false)
        const now = Date.now()
        if (!ok) since = null
        else if (since === null) since = now
        else if (now - since >= 1000) { cellsMs = 600 + (since - t0); break }
        if (now - t0 > CELLS_TIMEOUT_MS) throw new Error('timeout')
        await sleep(250)
      }
    } catch { cellsMs = 'timeout' }
  }
  await page.bringToFront()
  await sleep(SETTLE_MS)
  const rest = await page.evaluate(frameSampler, { ms: REST_MS, pan: false })
  const scene = await page.evaluate(sampleScene, { H, lat: site.lat })
  scene.heapRawMB = scene.heapMB
  scene.heapMB = await page.evaluate(heapAfterGc)
  const toPose = () => page.evaluate(({ p }) => globalThis.__ifcViewer.setCameraLookAt(
    { x: p.pos[0], y: p.pos[1], z: p.pos[2] }, { x: p.target[0], y: p.target[1], z: p.target[2] }, false), { p })
  // Warm-up pan over the same ground, not counted.
  await toPose(); await sleep(500)
  await page.evaluate(frameSampler, { ms: PAN_MS, pan: true, pose: p, speed: PAN_SPEED, amp: PAN_AMP })
  const pans = []
  for (let i = 0; i < PANS; i++) {
    // Each pan starts from the pose (same ground ahead every time).
    await toPose(); await sleep(1500)
    pans.push(await page.evaluate(frameSampler, { ms: PAN_MS, pan: true, pose: p, speed: PAN_SPEED, amp: PAN_AMP }))
  }
  await toPose()
  const means = pans.map((x) => x.fpsMean).sort((a, b) => a - b)
  const pan = { fpsMedianOfMeans: means[Math.floor(means.length / 2)], means: pans.map((x) => +x.fpsMean.toFixed(2)), seconds: PAN_MS / 1000, runs: pans }
  const requests = Object.fromEntries(Object.entries(hosts).map(([h, n]) => [h, n - (before[h] ?? 0)]).filter(([, n]) => n > 0))
  return { view: name, autoDetail, cellsReadyMs: cellsMs, rest, pan, ...scene, requests }
}

async function runSite(browser, base, siteName, commit) {
  const site = SITES[siteName]
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const hosts = {}
  ctx.on('request', (r) => { try { const h = new URL(r.url()).host; hosts[h] = (hosts[h] ?? 0) + 1 } catch {} })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log('pageerror:', e.message.slice(0, 160)))
  const t0 = Date.now()
  await page.goto(base + SCENE, { waitUntil: 'domcontentloaded', timeout: 240_000 })
  await page.bringToFront()
  const consent = page.getByRole('button', { name: /^(Activar mapa|Enable map)$/ })
  await consent.first().click({ timeout: 240_000 })
  const firstReadyMs = await waitReady(page)
  log(`${siteName}: map ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  let relocateMs = null
  if (site.relocate) {
    const t1 = Date.now()
    await page.evaluate(({ lat, lon }) => globalThis.__geoRelocate(lat, lon), site)
    await waitReady(page)
    relocateMs = Date.now() - t1
    const at = await page.evaluate(() => globalThis.__geoStore.getState().placement)
    log(`${siteName}: relocated to ${at.lat.toFixed(5)},${at.lon.toFixed(5)} in ${(relocateMs / 1000).toFixed(1)} s`)
  }
  const loadRequests = { ...hosts }
  await page.evaluate(() => globalThis.__basemapQuality?.hold('balanced'))
  const results = []
  for (const autoDetail of [true, false]) {
    await page.evaluate((v) => globalThis.__geoStore.getState().setAutoDetail(v), autoDetail)
    await sleep(1500)
    for (const v of viewNames) {
      const r = await measureView(page, site, v, autoDetail, hosts)
      results.push(r)
      log(`${siteName} ${v.padEnd(6)} auto=${autoDetail ? 'on ' : 'off'} rest ${r.rest.fpsMean.toFixed(1)}~${r.rest.fpsMedian.toFixed(1)}/${r.rest.fpsP5.toFixed(1)} pan ${r.pan.fpsMedianOfMeans.toFixed(1)} [${r.pan.means.join(' ')}] fps  ${(r.triangles / 1e6).toFixed(2)} M tris ${r.calls} calls`)
    }
  }
  const env = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return { ua: navigator.userAgent, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null }
  })
  await ctx.close()
  return { date: new Date().toISOString(), commit, site: siteName, lat: site.lat, lon: site.lon, viewport: [W, H], env, firstReadyMs, relocateMs, flatMapMode: 'balanced (held)', quick: QUICK, pxPerTexelAt: 'camera-target distance', dirty, panRule: `median of ${PANS} back-and-forth pans (±${PAN_AMP} m) × ${PAN_MS / 1000} s at ${PAN_SPEED} m/s after 1 warm-up`, loadRequests, requestsByHost: hosts, results }
}

function table(run) {
  const rows = run.results.map((r) => ({
    view: r.view, auto: r.autoDetail ? 'on' : 'off',
    'rest mean': r.rest.fpsMean.toFixed(1), 'rest med': r.rest.fpsMedian.toFixed(1), 'rest p5': r.rest.fpsP5.toFixed(1),
    'pan med-of-3': r.pan.fpsMedianOfMeans.toFixed(1), 'pan means': r.pan.means.join(' '),
    'cells s': r.cellsReadyMs == null ? '-' : typeof r.cellsReadyMs === 'string' ? r.cellsReadyMs : (r.cellsReadyMs / 1000).toFixed(1),
    'M tris': r.triangles == null ? '-' : (r.triangles / 1e6).toFixed(2), calls: r.calls,
    'heap MB': r.heapMB, 'city MB': r.city?.bytesMB ?? '-',
    'relief px/tx': r.relief.pxPerTexel ?? '-', 'map px/tx': r.flatMap.pxPerTexel ?? '-',
  }))
  console.log(`\n${run.site} @ ${run.commit}`)
  console.table(rows)
  console.log('requests by host:', run.requestsByHost)
}

// ── compare two runs ──────────────────────────────────────────────────────────
function compare(fa, fb) {
  const a = JSON.parse(readFileSync(fa, 'utf8')), b = JSON.parse(readFileSync(fb, 'utf8'))
  const panOf = (r) => r.pan.fpsMedianOfMeans ?? r.pan.fpsMean
  if (a.commit !== b.commit) console.log(`WARNING: different commits ${a.commit} / ${b.commit}`)
  if (a.dirty || b.dirty) console.log('WARNING: a run was taken on a dirty tree')
  const rows = []; let fails = 0
  for (const ra of a.results) {
    const rb = b.results.find((x) => x.view === ra.view && x.autoDetail === ra.autoDetail)
    if (!rb) continue
    const x = panOf(ra), y = panOf(rb), mean = (x + y) / 2, abs = Math.abs(x - y), rel = abs / mean
    const ok = rel < 0.10 || (mean < 30 && abs < 3)
    if (!ok) fails++
    rows.push({ view: ra.view, auto: ra.autoDetail ? 'on' : 'off', 'pan A': x.toFixed(1), 'pan B': y.toFixed(1), 'Δ fps': abs.toFixed(2), 'Δ %': (100 * rel).toFixed(1), ok: ok ? 'yes' : 'NO', 'rest A': ra.rest.fpsMean.toFixed(1), 'rest B': rb.rest.fpsMean.toFixed(1) })
  }
  console.log(`
${a.site}: ${a.commit} vs ${b.commit} — ${rows.length - fails}/${rows.length} pairs pass`)
  console.table(rows)
  return fails
}
if (args.compare) {
  const files = process.argv.slice(process.argv.indexOf('--compare') + 1).filter((x) => !x.startsWith('--'))
  if (files.length !== 2) throw new Error('--compare a.json b.json')
  process.exit(compare(files[0], files[1]) ? 1 : 0)
}

const commit = execSync('git rev-parse --short=8 HEAD', { cwd: ROOT }).toString().trim()
// Tracked changes would be filed under a commit that does not hold them.
const dirty = execSync('git status --porcelain --untracked-files=no', { cwd: ROOT }).toString().trim() !== ''
if (dirty && !args.dirty) throw new Error('working tree has uncommitted changes; commit them or pass --dirty')
const server = await startServer()
let browser = null
try {
  browser = await launch()
  mkdirSync(outDir, { recursive: true })
  for (const name of siteNames) {
    if (!SITES[name]) throw new Error(`unknown site ${name}`)
    const run = await runSite(browser, server.base, name, commit)
    const file = join(outDir, `${run.date.slice(0, 10)}-${commit}-${name}${args.tag ? `-${args.tag}` : ''}.json`)
    writeFileSync(file, JSON.stringify(run, null, 2))
    table(run)
    log(`saved ${file}`)
  }
} finally {
  await browser?.close()
  server.stop()
}
