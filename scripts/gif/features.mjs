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
  flood: `/?model=/models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc&map=terrain&flood=extreme,2m&lang=en`,
  pointcloud: `/?model=${POBLENOU}&scan=/models/poblenou/poblenou-site-scan.las&lang=en`,
  twin: `/?scene=/scenes/barcelona-placa-catalunya.scene.json&lang=en`,
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
await page.addInitScript(() => { try { localStorage.setItem('ifc-locale', 'en') } catch {} })

const wait = (ms) => page.waitForTimeout(ms)
const clickText = (re, timeout = 8000) =>
  page.getByRole('button', { name: re }).first().click({ timeout }).catch((e) => log('miss', String(re), e.message.slice(0, 80)))

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
    const ok = await page.evaluate(() => !!document.querySelector('canvas') &&
      !/Downloading|Geometry processing/i.test(document.body.innerText))
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

await page.goto(BASE + URLS[scene], { waitUntil: 'domcontentloaded', timeout: 60000 })
const t0 = Date.now()
const mark = (label) => log(`t=${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`)

if (scene === 'solar') {
  await waitLoaded(); await foldDrawer(); mark('loaded')
  await clickText(/load the climate and run/i, 20000); mark('run')
  await wait(25000); mark('done')
  await orbit(300); await wait(3000)
} else if (scene === 'flood') {
  await waitLoaded(); await foldDrawer(); mark('loaded')
  await clickText(/enable map/i, 30000); mark('consent')
  await wait(40000); mark('flooding')
  await orbit(300); await wait(4000)
} else if (scene === 'pointcloud') {
  await waitLoaded(90); await foldDrawer(); mark('loaded')
  await wait(8000)
  await page.mouse.move(W * 0.4, H * 0.4)
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 120); await wait(400) }
  await wait(1500); mark('scan in')
  await orbit(420, 120); await wait(3000)
} else if (scene === 'twin') {
  await clickText(/load map and data/i, 40000); mark('consent')
  await wait(35000); await foldDrawer(); await tilt(); mark('map in')
  await orbit(360, 120); await wait(4000)
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
const vid = readdirSync(OUT).filter((f) => f.endsWith('.webm') && !/^(hero|validate|tree|section|plans|measure|overlay|export|solar|flood|pointcloud|twin|clips)\.webm$/.test(f))
if (vid.length) { rmSync(`${OUT}/${scene}.webm`, { force: true }); renameSync(`${OUT}/${vid[0]}`, `${OUT}/${scene}.webm`) }
log('saved', `${OUT}/${scene}.webm`)
