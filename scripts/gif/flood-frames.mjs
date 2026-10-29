// The README's flood GIF, rendered frame by frame through the viewer's own shot
// renderer (like scripts/og/capture-flood-shots.mjs) instead of a screen recording:
// the storm runs to the end, then the timeline is replayed while the camera turns.
//
// Needs the dev server with VITE_FEATURE_GIS and VITE_FEATURE_FLOOD on (the
// __flood / __ifcViewer QA handles exist in dev only).
// Usage: APP_URL=http://localhost:3077/ node scripts/gif/flood-frames.mjs
// Output: scripts/gif/dist/feature-flood.gif
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import gifenc from 'gifenc'
const { GIFEncoder, quantize, applyPalette } = gifenc

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = (process.env.APP_URL || 'http://localhost:3077/').replace(/\/$/, '')
const W = 720, H = 405, FRAMES = 64, FPS = 10
const log = (...a) => console.log('[flood-frames]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const URL_ = `${BASE}/?model=/models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc&model=/models/hotel-vela/BCN-IVO-ZZ-XX-M3-S-0002.ifc` +
  '&map=terrain,buildings&flood=extreme,2m&ui=kiosk&lang=en'

const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'en-GB' })
await page.addInitScript(() => {
  try { localStorage.setItem('ifc-geo-consent:v1', '1'); localStorage.setItem('ifc-locale', 'en') } catch { /* private */ }
})

const finished = () => page.waitForFunction(() => {
  const tl = globalThis.__flood?.api?.getTimeline?.()
  return !!tl && tl.finished && !tl.computing
}, null, { timeout: 240_000, polling: 1000 })

for (let attempt = 1; attempt <= 4; attempt++) {
  log(`run ${attempt}`)
  await page.goto(URL_)
  await finished()
  const fallback = await page.evaluate(() => globalThis.__floodStore?.getState().report?.osm?.fallback === true)
  if (!fallback) break
  log('Overpass busy (no neighbourhood); retrying in 70 s')
  await sleep(70_000)
}
await sleep(6000) // the city's meshes and the affected-element analysis

const gif = GIFEncoder()
await page.evaluate(([w, h]) => globalThis.__ifcViewer.beginShotRender(w, h), [W, H])
for (let i = 0; i < FRAMES; i++) {
  const dataUrl = await page.evaluate(async ([i, N]) => {
    const f = globalThis.__flood, v = globalThis.__ifcViewer
    // First three quarters: the storm instant by instant. Then the maximum depth it left.
    const replay = i < N * 0.75
    const mode = replay ? 'depth' : 'max'
    globalThis.__floodStore?.getState().set({ viewMode: mode, threshold: 0.05, particles: false })
    f.api.setView({ mode, threshold: 0.05, particles: false, visible: true })
    const pts = f.api.getTimeline().points
    if (replay) f.api.seek(pts[Math.round((pts.length - 1) * i / (N * 0.75))].t)
    else f.api.follow()
    const p = f.plan()
    const c0 = Math.cos(p.frame.rotation), s0 = Math.sin(p.frame.rotation)
    const Wm = p.nx * p.dx, Hm = p.ny * p.dx
    const a = 0.5 * Wm, b = 0.5 * Hm
    const cx = p.frame.originX + a * c0 - b * s0, cz = -(-p.frame.originZ + a * s0 + b * c0)
    const y = f.bedAt(cx, cz), dist = Math.max(Wm, Hm) * 1.35
    const az = ((180 + 50 * i / N) * Math.PI) / 180, el = (56 * Math.PI) / 180
    const pose = {
      target: { x: cx, y, z: cz },
      position: { x: cx + Math.sin(az) * Math.cos(el) * dist, y: y + Math.sin(el) * dist, z: cz - Math.cos(az) * Math.cos(el) * dist },
      fovDeg: 40,
    }
    await v.renderShotFrame(pose)
    await new Promise((r) => setTimeout(r, i === 0 ? 2500 : 250))
    return (await v.renderShotFrame(pose)).toDataURL('image/png')
  }, [i, FRAMES])
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
  const data = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length)
  const palette = quantize(data, 160, { format: 'rgba4444' })
  gif.writeFrame(applyPalette(data, palette, 'rgba4444'), png.width, png.height, { palette, delay: Math.round(1000 / FPS) })
  if (i % 8 === 0) log(`frame ${i + 1}/${FRAMES}`)
}
await page.evaluate(() => globalThis.__ifcViewer.endShotRender())
gif.finish()
mkdirSync('scripts/gif/dist', { recursive: true })
writeFileSync('scripts/gif/dist/feature-flood.gif', Buffer.from(gif.bytes()))
log(`OK scripts/gif/dist/feature-flood.gif ${(gif.bytes().length / 1024).toFixed(0)} KB`)
await browser.close()
