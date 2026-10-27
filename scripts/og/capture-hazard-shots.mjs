// Real captures of the rain & slopes study, for the blog.
//
// The running viewer on a real GPU (headless Chrome): no model, the bundled
// example study area (Quebrada Quirio, Chosica — made-up placemarks), the
// map's relief, the flood grid over the area, the hazard sweep, then shots
// rendered at 1600×900 through the viewer's own shot renderer. No generative
// imagery, no retouching.
//
// Needs the dev server (the QA handles __flood / __hazard / __ifcViewer exist
// in dev only) with VITE_FEATURE_FLOOD and VITE_FEATURE_HAZARD on, and accepts
// the map's provider consent in its own throwaway profile (tiles, relief and
// Overpass are asked for the Chosica area, as any visitor's browser would).
//
// Usage:
//   node scripts/og/capture-hazard-shots.mjs [--url http://localhost:3290/]
//
// Output: public/blog/images/<name>.jpg (1600×900) and <name>-800.jpg

import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d }
const BASE = opt('url', 'http://localhost:3290/')
const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'public/blog/images'
const log = (...a) => console.log('[hazard-shots]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Poses relative to the grid: `at` fraction of it, `dist` of its larger side, azimuth from north, elevation. */
const SHOTS = [
  { name: 'rainfall-landslide-hazard-map-kmz-capture', step: 'stormEnd', layer: 'susceptibility', at: [0.5, 0.5], dist: 1.25, az: 200, el: 38 },
  { name: 'hazard-storm-start', step: 0, layer: 'susceptibility', at: [0.5, 0.5], dist: 1.25, az: 200, el: 38 },
  { name: 'hazard-storm-end', step: 'last', layer: 'susceptibility', at: [0.5, 0.5], dist: 1.25, az: 200, el: 38 },
  { name: 'hazard-runoff-gullies', step: 0.55, layer: 'runoff', at: [0.5, 0.5], dist: 1.25, az: 200, el: 38 },
  { name: 'hazard-debris-paths', step: 'last', layer: 'debris', at: [0.5, 0.55], dist: 0.8, az: 200, el: 45 },
]

const click = (page, re) => page.evaluate((src) => {
  const re = new RegExp(src)
  const b = [...document.querySelectorAll('button')].find((x) => re.test((x.textContent || '').trim()))
  if (b && !b.disabled) { b.click(); return true }
  return false
}, re.source)

async function waitFor(page, fn, arg, timeout = 120_000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 500 })
}

async function renderShot(page, s) {
  return page.evaluate(async (s) => {
    const f = globalThis.__flood, h = globalThis.__hazard, v = globalThis.__ifcViewer
    const hs = globalThis.__hazardShot
    const k = s.step === 'last' ? h.stepCount() - 1 : s.step === 'stormEnd' ? hs.stormEnd : s.step > 0 && s.step < 1 ? Math.round((h.stepCount() - 1) * s.step) : s.step
    h.setLayer(s.layer)
    h.setStep(k)
    const p = f.plan()
    const L = (a, b) => {
      const c = Math.cos(p.frame.rotation), sn = Math.sin(p.frame.rotation)
      const x = p.frame.originX + a * c - b * sn
      const n = -p.frame.originZ + a * sn + b * c
      return { x, z: -n }
    }
    const W = p.nx * p.dx, H = p.ny * p.dx
    const c = L(s.at[0] * W, s.at[1] * H)
    const y = f.bedAt(c.x, c.z)
    const dist = Math.max(W, H) * s.dist
    const az = (s.az * Math.PI) / 180, el = (s.el * Math.PI) / 180
    const pose = {
      target: { x: c.x, y, z: c.z },
      position: { x: c.x + Math.sin(az) * Math.cos(el) * dist, y: y + Math.sin(el) * dist, z: c.z - Math.cos(az) * Math.cos(el) * dist },
      fovDeg: 40,
    }
    await v.beginShotRender(1600, 900)
    await v.renderShotFrame(pose)
    await new Promise((r) => setTimeout(r, 1500))
    const cv = await v.renderShotFrame(pose)
    const url = cv.toDataURL('image/jpeg', 0.88)
    await v.endShotRender()
    return url
  }, s)
}

function saveJpeg(name, dataUrl) {
  writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'))
}

async function save800(page, name, dataUrl) {
  const small = await page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 800; c.height = Math.round((img.height / img.width) * 800)
    const x = c.getContext('2d')
    x.imageSmoothingQuality = 'high'
    x.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.84)
  }, dataUrl)
  saveJpeg(`${name}-800`, small)
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({
  executablePath: EXE,
  headless: false,
  args: ['--headless=new', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, locale: 'en-GB' })
  page.on('pageerror', (e) => log('page error:', e.message))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ifc-geo-consent:v1', '1')
      localStorage.setItem('ifc-locale', 'en')
    } catch { /* private */ }
  })
  await page.goto(new URL('?lang=en', BASE).href, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  // The landing → the viewer, then stop the demo model: the study needs none.
  await waitFor(page, () => [...document.querySelectorAll('button')].some((b) => /Open viewer/i.test(b.textContent || '')))
  await click(page, /Open viewer/i)
  for (let k = 0; k < 200; k++) { if (await click(page, /^Cancel$/)) break; await sleep(50) }
  await sleep(1500)
  await page.evaluate(async () => {
    const fs = (await import('/src/features/flood/store.ts')).useFloodStore
    fs.getState().set({ cellM: 5, marginM: 60 })
    fs.getState().setPanelOpen(true)
  })
  await waitFor(page, () => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').startsWith('Try the example')))
  await click(page, /^Try the example/)
  await sleep(1500)
  log('example loaded; map on')
  await page.evaluate(async () => { (await import('/src/stores/geoStore.ts')).useGeoStore.getState().setPanelOpen(true) })
  await sleep(1000)
  await click(page, /^Terrain/)
  await sleep(300)
  await click(page, /^Show on map/)
  await waitFor(page, async () => (await import('/src/stores/geoStore.ts')).useGeoStore.getState().mapMode === 'on')
  // The relief must be in before the grid reads it, or the slopes come out flat.
  await waitFor(page, async () => (await import('/src/stores/geoStore.ts')).useGeoStore.getState().terrainStatus === 'ready', null, 120_000)
  await page.evaluate(async () => { (await import('/src/stores/geoStore.ts')).useGeoStore.getState().setPanelOpen(false) })
  await sleep(6000)
  await page.evaluate(async () => { (await import('/src/features/flood/store.ts')).useFloodStore.getState().setPanelOpen(true) })
  await sleep(1500)
  await click(page, /^Build the grid/)
  await waitFor(page, async () => !!(await import('/src/features/flood/store.ts')).useFloodStore.getState().report, null, 180_000)
  log('grid built; computing')
  await sleep(1000)
  // The button is enabled once the section has seen the new grid: retry until it starts.
  for (let k = 0; k < 40; k++) {
    await click(page, /^Compute$/)
    await sleep(500)
    const started = await page.evaluate(() => /Rain step \d+ of|Recompute/.test(document.body.innerText))
    if (started) break
  }
  await waitFor(page, () => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Recompute'), null, 180_000)
  const facts = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' '))
    const t = document.body.innerText
    return { rows, dry: (t.match(/[\d.,]+ ha fail[^\n]*/) || [''])[0], grid: (t.match(/Hazard grid\n[^\n]*/) || [''])[0], steps: globalThis.__hazard.stepCount() }
  })
  log('facts', JSON.stringify(facts, null, 1))
  // The storm's last step, before the ladder beyond it (rain.ts): the panel opens there.
  const stormEnd = await page.evaluate(() => {
    const t = document.body.innerText
    return t.includes('beyond this storm') ? null : 0
  })
  await page.evaluate(async (stormEnd) => {
    const fs = (await import('/src/features/flood/store.ts')).useFloodStore
    fs.getState().setPanelOpen(false)
    const u = (await import('/src/stores/uiStore.ts')).useUIStore.getState()
    u.setValidationPanelOpen(false)
    u.setSidebarExpanded(false)
    globalThis.__hazardShot = { stormEnd: stormEnd ?? 11 }
  }, stormEnd)
  await sleep(2000)
  for (const s of SHOTS) {
    const url = await renderShot(page, s)
    saveJpeg(s.name, url)
    await save800(page, s.name, url)
    log(`saved ${s.name}`)
  }
} finally {
  await browser.close()
}
