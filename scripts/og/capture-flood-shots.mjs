// Real captures of the rain-flood simulation, for the blog.
//
// Every image is the running viewer on a real GPU (headless Chrome), driven by
// the ?flood= deep link: the IFC on the ICGC relief, the OpenStreetMap
// neighbourhood, the storm run to the end, then a shot rendered at 1600×900
// through the viewer's own shot renderer with the simulation's legend painted
// in. No generative imagery, no retouching.
//
// Needs the dev server (the QA handles __flood / __ifcViewer exist in dev only)
// with VITE_FEATURE_FLOOD on, and accepts the map's provider consent in its own
// throwaway profile (the map's tiles, the ICGC relief and Overpass are asked
// for the Poblenou area, as any visitor's browser would).
//
// Usage:
//   node scripts/og/capture-flood-shots.mjs [--url http://localhost:3210/] [name…]
//
// Output: public/blog/images/<name>.jpg (1600×900) and <name>-800.jpg

import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d }
const BASE = opt('url', 'http://localhost:3210/')
const only = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')))
const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'public/blog/images'
const log = (...a) => console.log('[flood-shots]', ...a)

const TORRE = '/models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc'
const VELA_A = '/models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc'
const VELA_S = '/models/hotel-vela/BCN-IVO-ZZ-XX-M3-S-0002.ifc'
const POBLENOU_A = '/models/poblenou/BCN-IVO-ZZ-XX-M3-A-0001.ifc'
const POBLENOU_S = '/models/poblenou/BCN-IVO-ZZ-XX-M3-S-0001.ifc'

/**
 * A run (models + storm) and the shots taken from it. Poses are relative to
 * the simulated area: `at` = fraction of the grid (0..1 on each axis) the
 * camera looks at, `dist` = fraction of the grid's larger side, azimuth from
 * north clockwise, elevation above the horizon.
 */
const RUNS = [
  {
    // Its stated height matches the ICGC ground: the water runs on the map's
    // own relief, with the city drawn around it.
    id: 'vela',
    models: [VELA_A, VELA_S],
    flood: 'extreme,2m',
    shots: [
      { name: 'flood-simulation-ifc-max-depth', kind: 'shot', view: 'max', at: [0.5, 0.45], dist: 1.05, az: 205, el: 52 },
      { name: 'flood-speed-flow-lines', kind: 'shot', view: 'speed', seek: 'peak', at: [0.5, 0.5], dist: 0.6, az: 230, el: 48 },
    ],
  },
  {
    // Old and culverted rieras under Poblenou (OSM), and the neighbours reached.
    id: 'torre',
    models: [TORRE],
    flood: 'extreme,2m',
    needOsm: true,
    // The Relief view, from high up: reads like a plan — the neighbours'
    // footprints, their outlines where the water reached them, the old course.
    map: 'terrain',
    shots: [
      { name: 'flood-buried-river-neighbours', kind: 'shot', view: 'max', at: [0.5, 0.5], dist: 1.05, az: 180, el: 72 },
    ],
  },
  {
    id: 'torre-ui',
    models: [TORRE],
    flood: 'extreme,2m',
    needOsm: true,
    shots: [
      { name: 'flood-panel-what-it-sees', kind: 'panel', section: 'report' },
    ],
  },
  {
    id: 'poblenou',
    models: [POBLENOU_A, POBLENOU_S],
    flood: 'extreme,1m,closed',
    shots: [
      { name: 'flood-panel-settings', kind: 'panel', section: 'settings' },
      { name: 'flood-affected-elements-validation', kind: 'validation' },
    ],
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFinished(page, timeoutMs = 240_000) {
  await page.waitForFunction(() => {
    const f = globalThis.__flood
    const tl = f?.api?.getTimeline?.()
    return !!tl && tl.finished && !tl.computing
  }, null, { timeout: timeoutMs, polling: 1000 })
}

/** The shot, rendered by the viewer at 1600×900 with the legend painted in. */
async function renderShot(page, s) {
  return page.evaluate(async (s) => {
    const f = globalThis.__flood, v = globalThis.__ifcViewer
    // The store too: the legend's title reads the view from it.
    globalThis.__floodStore?.getState().set({ viewMode: s.view, threshold: 0.05, particles: s.view === 'speed' })
    f.api.setView({ mode: s.view, threshold: 0.05, particles: s.view === 'speed', visible: true })
    if (s.seek === 'peak') {
      // The instant with the most ground under water: the water is moving then.
      const pts = f.api.getTimeline().points
      let best = pts[0]
      for (const q of pts) if (q.area > best.area) best = q
      f.api.seek(best.t)
      await new Promise((r) => setTimeout(r, 2500))
    } else {
      f.api.follow()
    }
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
    // Azimuth from north (−z) clockwise: east is +x.
    const pose = {
      target: { x: c.x, y, z: c.z },
      position: { x: c.x + Math.sin(az) * Math.cos(el) * dist, y: y + Math.sin(el) * dist, z: c.z - Math.cos(az) * Math.cos(el) * dist },
      fovDeg: 40,
    }
    await v.beginShotRender(1600, 900)
    // Two frames: the first one settles tiles and the water texture.
    await v.renderShotFrame(pose)
    await new Promise((r) => setTimeout(r, 1500))
    // The legend comes with the frame (the simulation's capture painter).
    const cv = await v.renderShotFrame(pose)
    const url = cv.toDataURL('image/jpeg', 0.88)
    await v.endShotRender()
    return url
  }, s)
}

function saveJpeg(name, dataUrl) {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
  writeFileSync(`${OUT}/${name}.jpg`, buf)
  return buf
}

/** The 800-wide variant, scaled by the browser. */
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

/** A DOM screenshot of part of the UI, padded, at device scale 1. */
async function uiShot(page, name, locator, maxWidth = Infinity) {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${name}: nothing to capture`)
  const pad = 12
  const buf = await page.screenshot({
    type: 'jpeg', quality: 88,
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(maxWidth, box.width + pad * 2), height: box.height + pad * 2 },
  })
  writeFileSync(`${OUT}/${name}.jpg`, buf)
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({
  executablePath: EXE,
  headless: false,
  args: ['--headless=new', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
})
try {
  for (const run of RUNS) {
    const shots = run.shots.filter((s) => !only.length || only.includes(s.name) || only.includes(run.id))
    if (!shots.length) continue
    const needsTall = shots.some((s) => s.kind === 'panel' || s.kind === 'validation')
    // UI captures at 2× (sharp on high-density screens); canvas shots are rendered at 1600×900 anyway.
    const page = await browser.newPage({ viewport: { width: needsTall ? 1280 : 1600, height: needsTall ? 1500 : 900 }, deviceScaleFactor: needsTall ? 2 : 1, locale: 'en-GB' })
    page.on('pageerror', (e) => log('page error:', e.message))
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ifc-geo-consent:v1', '1')
        localStorage.setItem('ifc-locale', 'en')
      } catch { /* private */ }
    })
    const url = new URL(BASE)
    if (!needsTall) { url.searchParams.set('embed', '1'); url.searchParams.set('ui', 'kiosk') }
    for (const m of run.models) url.searchParams.append('model', m)
    // The City view: the neighbourhood's buildings are drawn, so the water
    // stands against walls the reader can see (the simulation uses them either way).
    url.searchParams.set('map', run.map ?? 'terrain,buildings')
    url.searchParams.set('flood', run.flood)
    url.searchParams.set('lang', 'en')
    for (let attempt = 1; attempt <= 4; attempt++) {
      log(`${run.id}: run ${attempt} — ${url.search}`)
      await page.goto(url.href)
      await waitFinished(page)
      const fallback = await page.evaluate(() => globalThis.__floodStore?.getState().report?.osm?.fallback === true)
      if (!run.needOsm || !fallback) break
      log(`${run.id}: Overpass busy (tiles fallback); retrying in 70 s`)
      await sleep(70_000)
    }
    await sleep(6000) // the affected-element analysis after the run, and the city's meshes
    for (const s of shots) {
      if (s.kind === 'shot') {
        const url = await renderShot(page, s)
        saveJpeg(s.name, url)
        await save800(page, s.name, url)
      } else if (s.kind === 'panel') {
        // The panel's card (ViewportPanel): its header reads "Flood (simulation)".
        const card = page.getByText('Flood (simulation)', { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'glass-md')][1]")
        if (s.section === 'report') await page.getByText('What the simulation sees', { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: 'start' }))
        await sleep(400)
        await uiShot(page, s.name, card)
      } else if (s.kind === 'validation') {
        // The group's own block in the validation panel: title, summary, rows, note.
        const title = page.getByText('Flood: elements reached', { exact: true }).first()
        await title.evaluate((el) => el.scrollIntoView({ block: 'start' }))
        const block = title.locator("xpath=ancestor::div[.//*[contains(text(),'Not part of the validation result')]][1]")
        // The group's text sits on the left: a reading width, not the panel's.
        await uiShot(page, s.name, block, 760)
      }
      log(`saved ${s.name}`)
    }
    await page.close()
  }
} finally {
  await browser.close()
}
