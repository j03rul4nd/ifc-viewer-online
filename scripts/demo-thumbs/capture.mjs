// Real viewer captures for the demo gallery cards: each demo opened in the app
// itself and photographed, so a card shows what the reader will actually get.
// Output is small and same-origin (public/demo-thumbs), never the Worker.
//
// Usage: start the dev server, then
//   APP_URL=http://localhost:3282/ node scripts/demo-thumbs/capture.mjs [id…]
// Blog captures that already show a demo are resized rather than re-shot: a
// scene needs live feeds and a map, which a headless run cannot photograph well.
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const APP = process.env.APP_URL || 'http://localhost:3282/'
const OUT = 'public/demo-thumbs'
const W = 640, H = 400
const only = new Set(process.argv.slice(2))
mkdirSync(OUT, { recursive: true })

const FROM_BLOG = {
  'scene-barcelona-placa-catalunya': 'barcelona-digital-twin-bicing-800.jpg',
  'scene-helsinki-rautatientori': 'urban-digital-twin-helsinki-live-800.jpg',
  'scene-tokyo-tochomae': 'urban-digital-twin-tokyo-live-800.jpg',
  'scene-tokyo-waseda': 'tokyo-transit-digital-twin-waseda-800.jpg',
  'cras-feup-as-built': 'cras-ifc-tls-point-cloud-real-alignment.jpg',
  'ciutadella-pavilion': 'ifc-3d-map-ciutadella-real-viewer.jpg',
  'warehouse-operations-lidar': 'warehouse-ifc-moving-lidar-real-viewer.jpg',
  'construction-progress-lidar': 'construction-progress-ifc-lidar-real-viewer.jpg',
  'utility-tunnel-lidar': 'utility-tunnel-ifc-lidar-real-viewer.jpg',
}

const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 120_000 })
const { models, clouds } = await page.evaluate(async () => {
  const m = await import('/src/demo-models/models.ts')
  const c = await import('/src/demo-models/catalog.ts')
  return {
    models: m.demoSets().map((s) => ({ id: s.id, urls: s.models.map((x) => x.ifcUrl) })),
    // The gallery's own link, so the capture is exactly what the card opens.
    clouds: c.demoCatalog({ maps: false, clouds: true, twins: false })
      .filter((e) => e.kind === 'cloud').map((e) => ({ id: e.id, query: e.href.split('?')[1] })),
  }
})
const want = (id) => only.size === 0 || only.has(id)

async function resize(id, src) {
  await page.setContent(`<body style="margin:0;background:#111"><img src="${APP}blog/images/${src}" style="width:${W}px;height:${H}px;object-fit:cover;display:block"></body>`)
  await page.waitForFunction(() => document.images[0]?.complete && document.images[0].naturalWidth > 0, null, { timeout: 30_000 })
  writeFileSync(`${OUT}/${id}.jpg`, await page.screenshot({ type: 'jpeg', quality: 74 }))
  console.log('resized', id)
}

async function shoot(id, query) {
  // A fresh context each time: the app restores the last session, so a shared
  // one photographs every earlier demo standing next to this one.
  const own = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const shot = await own.newPage()
  let inflight = 0, last = Date.now()
  shot.on('request', () => { inflight++; last = Date.now() })
  const done = () => { inflight = Math.max(0, inflight - 1); last = Date.now() }
  shot.on('requestfinished', done); shot.on('requestfailed', done)
  try {
    await shot.goto(`${APP}?ui=kiosk&view=iso&${query}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await shot.waitForSelector('canvas', { timeout: 120_000 })
    // Conversion runs in a worker after the download, with no request to watch:
    // the SDK's own settled signal is not reachable from here, so wait it out.
    const started = Date.now()
    let settled = false
    while (!settled && Date.now() - started < 300_000) {
      await shot.waitForTimeout(1000)
      const busy = await shot.evaluate(() => /\d+\s*%|Loading|Cargando|Converting/i.test(document.body.innerText))
      settled = !busy && Date.now() - last > 4000
    }
    // Never keep a picture of the progress overlay as if it were the model.
    if (!settled) throw new Error('did not settle')
    await shot.waitForTimeout(3000)
    writeFileSync(`${OUT}/${id}.jpg`, await shot.screenshot({ type: 'jpeg', quality: 74 }))
    console.log('shot', id, `${Math.round(statSync(`${OUT}/${id}.jpg`).size / 1024)} KB`)
  } catch (e) {
    console.log('FAILED', id, String(e.message).slice(0, 120))
  } finally {
    await own.close()
  }
}

for (const [id, src] of Object.entries(FROM_BLOG)) if (want(id)) await resize(id, src)
for (const m of models) {
  if (!want(m.id) || FROM_BLOG[m.id]) continue
  await shoot(m.id, `model=${m.urls.map(encodeURIComponent).join(',')}`)
}
for (const c of clouds) {
  if (!want(c.id) || FROM_BLOG[c.id]) continue
  await shoot(c.id, c.query)
}
await browser.close()
console.log('missing:', [...models, ...clouds].map((x) => x.id).filter((id) => !existsSync(`${OUT}/${id}.jpg`)).join(' ') || 'none')
