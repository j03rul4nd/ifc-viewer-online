// Capture the newer features (solar, flood, point cloud, city twin, Clip Studio)
// to webm via Playwright + system Chrome, for the README GIFs.
// Usage: APP_URL=http://localhost:3077/ node scripts/gif/features.mjs <scene>
// Then:  node scripts/gif/encode.mjs <scene> <start> <end> out=feature-<scene>.gif
// The dev server needs the feature flags on (VITE_FEATURE_GIS, _POINTCLOUD, _SOLAR, _FLOOD).
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = (process.env.APP_URL || 'http://localhost:3077/').replace(/\/$/, '')
const HEADED = process.env.HEADED === '1'
const scene = process.argv[2] || 'solar'
const W = 1280, H = 720
const OUT = 'scripts/gif/out'
mkdirSync(OUT, { recursive: true })

const log = (...a) => console.log(`[${scene}]`, ...a)

const VELA = '/models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc'
const POBLENOU = '/models/poblenou/BCN-IVO-ZZ-XX-M3-A-0001.ifc'
const URLS = {
  solar: `/?model=${VELA}&analysis=year:passive&lang=en`,
  flood: `/?model=${VELA}&model=/models/hotel-vela/BCN-IVO-ZZ-XX-M3-S-0002.ifc&map=terrain,buildings&flood=extreme,2m&ui=kiosk&lang=en`,
  pointcloud: `/?model=/models/realtime-lidar/IVO-Construction-Progress.ifc&scan=/models/realtime-lidar/construction-progress-snapshot.ply&ui=kiosk&view=iso&turntable=8&lang=en`,
  hero: `/?model=/Ifc2x3_Duplex_Architecture.ifc&lang=en`,
  twin: `/?scene=/scenes/barcelona-placa-catalunya.scene.json&ui=kiosk&turntable=6&lang=en`,
  clips: `/?model=${VELA}&lang=en`,
}

const browser = await chromium.launch({ executablePath: EXE, headless: !HEADED,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] })
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
})
const page = await ctx.newPage()
page.on('pageerror', (e) => log('pageerror', e.message.slice(0, 160)))
await page.addInitScript((flood) => {
  try {
    localStorage.setItem('ifc-locale', 'en')
    // the flood scene replays a finished run: accept the map's providers up front, as capture-flood-shots does
    if (flood) localStorage.setItem('ifc-geo-consent:v1', '1')
  } catch {}
}, scene === 'flood')

const wait = (ms) => page.waitForTimeout(ms)
const clickText = (re, timeout = 8000) =>
  root().getByRole('button', { name: re }).first().click({ timeout }).catch((e) => log('miss', String(re), e.message.slice(0, 80)))

/** Fold the validation drawer so the 3D view gets the frame. */
async function foldDrawer() {
  await page.getByRole('button', { name: /collapse panel/i }).first().click({ timeout: 3000 }).catch(() => {})
}
/** Tilt down a little and orbit — map scenes open top-down. */
async function tilt(dy = 160) {
  const x = W * 0.5, y = H * 0.4
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' })
  for (let i = 1; i <= 40; i++) { await page.mouse.move(x, y + (dy * i) / 40); await wait(25) }
  await page.mouse.up()
}
async function zoomOut(n = 6) {
  await page.mouse.move(W * 0.5, H * 0.4)
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, 400); await wait(120) }
}

async function waitLoaded(maxS = 60) {
  for (let i = 0; i < maxS; i++) {
    await wait(1000)
    const f = page.frames().at(-1)
    const ok = await f.evaluate(() => !!document.querySelector('canvas') &&
      !/Downloading|Geometry processing/i.test(document.body.innerText)).catch(() => false)
    if (ok && i > 4) break
  }
  await wait(1500)
}

/** Slow orbit: drag across the canvas centre. */
async function orbit(dx = 360, steps = 90) {
  const x = W * 0.42, y = H * 0.35
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x + (dx * i) / steps, y + Math.sin(i / steps * Math.PI) * 20); await wait(30) }
  await page.mouse.up()
}

// Embed scenes (embed=1) only drop the app chrome inside an iframe: wrap them in
// a throwaway public/_gif-frame.html page (not committed).
const target = false ? `/_gif-frame.html?src=${encodeURIComponent(URLS[scene])}` : URLS[scene]
const root = () => target === URLS[scene] ? page : page.frameLocator('iframe')
await page.goto(BASE + target, { waitUntil: 'domcontentloaded', timeout: 60000 })
const t0 = Date.now()
const mark = (label) => log(`t=${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`)

if (scene === 'solar') {
  await waitLoaded(); await foldDrawer(); mark('loaded')
  await clickText(/load the climate and run/i, 20000); mark('run')
  await wait(25000); mark('done')
  await orbit(300); await wait(3000)
} else if (scene === 'flood') {
  // Let the storm run to the end, then replay its timeline from a fixed, slowly
  // turning pose (same pose maths as scripts/og/capture-flood-shots.mjs).
  const finished = () => page.waitForFunction(() => {
    const tl = globalThis.__flood?.api?.getTimeline?.()
    return !!tl && tl.finished && !tl.computing
  }, null, { timeout: 240000, polling: 1000 })
  await finished()
  // Overpass is sometimes busy: without the neighbourhood the water has no walls to stand against
  for (let attempt = 2; attempt <= 4; attempt++) {
    const fallback = await page.evaluate(() => globalThis.__floodStore?.getState().report?.osm?.fallback === true)
    if (!fallback) break
    log('Overpass busy, retrying in 60 s'); await wait(60000)
    await page.reload(); await finished()
  }
  mark('finished'); await wait(6000)
  await page.evaluate(async () => {
    const f = globalThis.__flood, v = globalThis.__ifcViewer
    globalThis.__floodStore?.getState().set({ viewMode: 'max', threshold: 0.05, particles: false })
    f.api.setView({ mode: 'max', threshold: 0.05, particles: false, visible: true })
    f.api.follow()
    const p = f.plan()
    const c0 = Math.cos(p.frame.rotation), s0 = Math.sin(p.frame.rotation)
    const Wm = p.nx * p.dx, Hm = p.ny * p.dx
    const a = 0.5 * Wm, b = 0.45 * Hm
    const cx = p.frame.originX + a * c0 - b * s0, cz = -(-p.frame.originZ + a * s0 + b * c0)
    const y = f.bedAt(cx, cz), dist = Math.max(Wm, Hm) * 0.95, el = (52 * Math.PI) / 180
    const pts = f.api.getTimeline().points
    const N = 140
    for (let i = 0; i <= N; i++) {
      const az = ((175 + 60 * i / N) * Math.PI) / 180
      v.setCameraLookAt({ x: cx + Math.sin(az) * Math.cos(el) * dist, y: y + Math.sin(el) * dist, z: cz - Math.cos(az) * Math.cos(el) * dist }, { x: cx, y, z: cz }, false)
      await new Promise((r) => setTimeout(r, 110))
    }
  })
  mark('replayed'); await wait(2000)
} else if (scene === 'pointcloud') {
  // turntable=8 orbits slowly by itself once the model and scan are in
  await waitLoaded(90); mark('loaded')
  await wait(22000); mark('turning')
} else if (scene === 'twin') {
  await clickText(/load map and data/i, 40000); mark('consent')
  await wait(35000); await foldDrawer(); await tilt(); mark('map in')
  await orbit(360, 120); await wait(4000)
} else if (scene === 'hero') {
  await waitLoaded(); mark('loaded')
  // close the properties panel (the rail's first button) so the model gets the frame
  await page.mouse.click(1245, 123); await wait(800)
  await wait(5000); mark('score')
  await page.getByRole('button', { name: /show in 3d/i }).first().click({ timeout: 8000 }).catch((e) => log('miss 3d', e.message.slice(0, 80)))
  await wait(3500); mark('focused')
  await orbit(220); await wait(1500)
  await page.getByRole('button', { name: /show in 3d/i }).nth(1).click({ timeout: 8000 }).catch(() => {})
  await wait(3500); mark('second')
} else if (scene === 'clips') {
  await waitLoaded(); mark('loaded')
  await clickText(/^capture/i); await wait(800)
  await page.getByText(/^Clip Studio$/).first().click({ timeout: 8000 }).catch((e) => log('miss studio', e.message.slice(0, 80)))
  mark('studio'); await wait(2000)
  await clickText(/generate presentation/i); await wait(45000); mark('generated')
  await page.keyboard.press('Space'); mark('play')
  await wait(15000)
}
mark('end')

await ctx.close(); await browser.close()
const vid = readdirSync(OUT).filter((f) => f.endsWith('.webm') && !/^(hero|validate|tree|section|plans|measure|overlay|export|solar|flood|pointcloud|twin|clips|hero)\.webm$/.test(f))
if (vid.length) { rmSync(`${OUT}/${scene}.webm`, { force: true }); renameSync(`${OUT}/${vid[0]}`, `${OUT}/${scene}.webm`) }
log('saved', `${OUT}/${scene}.webm`)
