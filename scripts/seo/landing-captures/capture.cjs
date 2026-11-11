// ─── Captures for the generated landings ──────────────────────────────────────
// Every picture on the tool landings, the demo landings and the twin builder
// pages is the product running in a browser tab. This script opens the app,
// brings it to the state each picture shows (a selected wall with an edit in
// progress, the issues of one rule, a demo with its live layers…), takes the
// capture and writes the files the pages use into public/images/landings/:
//
//   <file>.jpg            indexed by search engines (rights are stamped by the generators)
//   <file>-<w>.webp       half and full width, for srcset
//
//   npm run dev -- --port 3341          (with VITE_FEATURE_GIS=true and VITE_FEATURE_SOLAR=true in .env.local)
//   node scripts/seo/landing-captures/capture.cjs [--base http://localhost:3341]
//        [--only editor-1,agv-warehouse-digital-twin] [--langs en,es] [--raw <dir>] [--cdp http://127.0.0.1:9333]
//
// Then run the generators (generate-tool-landings.mjs, build-demo-landings.ts,
// build-twin-builder-landings.ts) and `npm run seo:chrome`.
//
// It needs a local Chrome (CHROME_PATH): headless Chromium has no usable GPU
// on the machines this has run on. The camera is set through
// window.__ifcViewer, which only the dev server exposes. There is no sharp or
// ffmpeg here: JPEG and WebP are encoded by a canvas in the same browser.
// The demos are simulations with a clock, and the city scenes read live public
// feeds, so two runs never give the same pixels: look at each picture before
// committing it (--raw keeps the PNGs).

const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { chromium } = require('playwright-core')

const ROOT = path.resolve(__dirname, '../../..')
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }
const BASE = arg('base', 'http://localhost:3341').replace(/\/$/, '')
const ONLY = arg('only', '').split(',').filter(Boolean)
const LANGS = arg('langs', 'en,es,de,fr,pt,it,ca,zh,ja,th').split(',')
const RAW = arg('raw', '')
const CDP = arg('cdp', '')

const DUPLEX = '/Ifc2x3_Duplex_Architecture.ifc'
const VELA = '/models/hotel-vela/BCN-IVO-ZZ-XX-M3'
const HOTEL = `${VELA}-A-0002.ifc,${VELA}-S-0002.ifc,${VELA}-M-0002.ifc`
const DRAWER = '[data-bottom-drawer="validation"]'

// ── helpers ──────────────────────────────────────────────────────────────────
const sleep = (page, ms) => page.waitForTimeout(ms)

/** The load card ("Elapsed 0:07") has come and gone, or never came. */
async function settled(page, max = 240000, canvas = true) {
  const t0 = Date.now()
  let seen = false, quiet = 0
  while (Date.now() - t0 < max) {
    const busy = await page.evaluate((canvas) => !document.body || (canvas && !document.querySelector('canvas'))
      || /Elapsed \d|Loading \d+ models|Finishing up|Loading the twin|Opening the map/.test(document.body.innerText), canvas).catch(() => true)
    if (busy) { seen = true; quiet = 0 } else quiet++
    if (quiet >= 4 && (seen || Date.now() - t0 > 30000)) return
    await sleep(page, 700)
  }
  throw new Error('the page never finished loading')
}

/** Open a route with a clean profile: no remembered panels, no analytics. */
async function open(page, url, { width = 1600, height = 1000, scale = 1, demo = false } = {}) {
  await page.setViewportSize({ width, height })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: scale > 1 })
  await page.goto(`${BASE}/favicon.svg`, { waitUntil: 'commit' })
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('ifc.analytics.optout', '1') } catch { /* private mode */ } })
  await page.goto(BASE + url, { waitUntil: 'commit', timeout: 120000 })
  // The demos of /msp-global and the builder draw their own loading states: give them time instead.
  if (demo) await sleep(page, 30000)
  else await settled(page)
}

const cam = (page, p, t) => page.evaluate(([p, t]) => window.__ifcViewer.setCameraLookAt({ x: p[0], y: p[1], z: p[2] }, { x: t[0], y: t[1], z: t[2] }, false), [p, t])

/** Buttons of the validation drawer's title row, left to right. */
async function drawerHeader(page) {
  return page.evaluate((sel) => {
    const d = document.querySelector(sel)
    if (!d) return []
    const top = d.getBoundingClientRect().top
    return [...d.querySelectorAll('button')].map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top - top < 50).sort((a, b) => a.x - b.x).map((r) => [r.x + r.width / 2, r.y + r.height / 2])
  }, DRAWER)
}
/** The drawer's last title button folds it away. */
async function collapseDrawer(page) {
  const h = await drawerHeader(page)
  if (h.length) { await page.mouse.click(...h[h.length - 1]); await sleep(page, 900) }
}
/** Drag the drawer's top edge so the list gets `y` as its top. */
async function resizeDrawer(page, y) {
  const r = await page.evaluate((sel) => { const q = document.querySelector(sel).getBoundingClientRect(); return [q.x + q.width / 2, q.y] }, DRAWER)
  await page.mouse.move(r[0], r[1] + 10); await page.mouse.down()
  await page.mouse.move(r[0], (r[1] + y) / 2, { steps: 6 }); await page.mouse.move(r[0], y + 10, { steps: 6 }); await page.mouse.up()
  await sleep(page, 900)
}
/** `?rule=` opens one group of the issue list: bring its heading to the top. */
async function scrollToOpenGroup(page) {
  await page.evaluate((sel) => {
    const list = document.querySelector(`${sel} .overflow-y-auto`)
    const rows = [...(list?.querySelectorAll('[data-index]') ?? [])].sort((a, b) => +a.dataset.index - +b.dataset.index)
    // Only the focused group is open: its heading is the short row followed by a tall one.
    const head = rows.find((r, i) => rows[i + 1] && r.getBoundingClientRect().height < 40 && rows[i + 1].getBoundingClientRect().height >= 40)
    if (list && head) list.scrollTop += head.getBoundingClientRect().top - list.getBoundingClientRect().top - 6
  }, DRAWER)
  await sleep(page, 900)
}
/** Validation has finished when the drawer lists issues. */
const validated = (page) => page.waitForFunction((sel) => document.querySelectorAll(`${sel} [data-index]`).length > 2, DRAWER, { timeout: 120000, polling: 500 })

/** The editable rows of the properties panel: Name, LongName, Description. */
const field = (page, i) => page.locator('div[class*="group/field"]').nth(i).locator('.cursor-text')

const VIEW = { width: 1600, height: 1000 }
const WIDE = { width: 1600, height: 900 }
const PHONE = { width: 390, height: 844, scale: 2 }

// Duplex house, looking at the long north facade from the street corner.
const DUPLEX_LOW = [[19, 8, 25], [8.5, 2.2, 6]]        // with the drawer open (a short 3D view)
const DUPLEX_TALL = [[20, 5.5, 29], [11, 3, 10]]       // with the drawer folded

// ── tool landings: one capture per language ──────────────────────────────────
// ids are SHOT_IDS of the tool landings: index 0 and 1 of each page's `shots`.
const TOOL = {
  // The exterior wall of level 2, its LongName just changed and the Description being typed.
  'editor-1': { concept: 'editor', index: 0, url: (l) => `/?lang=${l}&ui=full&validate=0&bg=sky&model=${DUPLEX}&select=5498`, run: async (page) => {
    await collapseDrawer(page)
    await cam(page, ...DUPLEX_TALL)
    await field(page, 1).click(); await page.keyboard.type('Exterior wall N-02'); await page.keyboard.press('Enter'); await sleep(page, 500)
    await field(page, 2).click(); await page.keyboard.type('Brick on block, 300 mm'); await sleep(page, 700)
  } },
  // The entrance door, revealed in the spatial tree.
  'editor-2': { concept: 'editor', index: 1, url: (l) => `/?lang=${l}&ui=full&validate=0&bg=sky&model=${DUPLEX}&select=6652`, run: async (page) => {
    await collapseDrawer(page)
    // Frame · Isolate · Reveal in tree · Hide
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); return r.x > 1200 && r.y > 265 && r.y < 310 && r.width > 40 })
      rows.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)[2]?.click()
    })
    await sleep(page, 1500)
    await cam(page, ...DUPLEX_TALL)
    await sleep(page, 800)
  } },
  'class-1': { concept: 'classification', index: 0, url: (l) => `/?lang=${l}&bg=sky&model=${DUPLEX}&rule=RULE_MISSING_CLASSIFICATION`, run: ruleShot },
  'class-2': { concept: 'classification', index: 1, url: (l) => `/?lang=${l}&bg=sky&model=${DUPLEX}&rule=RULE_EMPTY_PROPERTY_VALUE`, run: ruleShot },
  'health-1': { concept: 'health', index: 0, url: (l) => `/?lang=${l}&bg=sky&model=${DUPLEX}`, run: async (page) => {
    await validated(page); await sleep(page, 2500)
    await cam(page, ...DUPLEX_LOW)
  } },
  'health-2': { concept: 'health', index: 1, url: (l) => `/?lang=${l}&bg=sky&model=${DUPLEX}`, run: async (page) => {
    await validated(page); await sleep(page, 2500)
    await cam(page, ...DUPLEX_LOW)
    // Share · Badge · Copy · Export · maximise · fold
    const h = await drawerHeader(page)
    await page.mouse.click(...h[h.length - 3]); await sleep(page, 2500)
  } },
}

/** The issues of one rule: the list on its group, the model above. */
async function ruleShot(page) {
  await validated(page); await sleep(page, 3000)
  await resizeDrawer(page, 500)
  await scrollToOpenGroup(page)
  await cam(page, ...DUPLEX_LOW)
}

// ── shared pictures: one capture for every language ──────────────────────────
const viewer = (q) => `/?lang=en&ui=full&validate=0&bg=sky&${q}`
/** A model on its own: the tree beside it, the empty panels put away, the model fitted to the view. */
async function gallery(page, view) {
  await collapseDrawer(page)
  const hide = page.getByRole('button', { name: 'Hide panel' })
  if (await hide.count()) { await hide.first().click(); await sleep(page, 700) }
  if (Array.isArray(view)) await cam(page, ...view)
  else await fit(page, view)
  await sleep(page, 2500)
}
/** Look at every loaded model from a three-quarter angle, `k` half-diagonals away. */
async function fit(page, k = 1.6, dir = [0.62, 0.34, 0.71]) {
  await page.evaluate(([k, dir]) => {
    const v = window.__ifcViewer
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (const id of v.getLoadedModelIds()) {
      const b = v.getModelBounds(id)
      for (const [i, a] of ['x', 'y', 'z'].entries()) { lo[i] = Math.min(lo[i], b.center[a] - b.size[a] / 2); hi[i] = Math.max(hi[i], b.center[a] + b.size[a] / 2) }
    }
    const c = lo.map((x, i) => (x + hi[i]) / 2), r = Math.hypot(...hi.map((x, i) => x - lo[i])) / 2
    const n = Math.hypot(...dir)
    v.setCameraLookAt({ x: c[0] + (dir[0] / n) * r * k, y: c[1] + (dir[1] / n) * r * k, z: c[2] + (dir[2] / n) * r * k }, { x: c[0], y: c[1], z: c[2] }, false)
  }, [k, dir])
}
const SHARED = {
  'ifc-viewer-hotel-model': { ...WIDE, url: viewer(`model=${HOTEL}`), run: (page) => gallery(page, 1.5) },
  'ifc-viewer-duplex-house': { ...WIDE, url: viewer(`model=${DUPLEX}`), run: (page) => gallery(page, [[19, 6, 29], [8, 2.8, 8.5]]) },
  'ifc-viewer-japanese-temple': { ...WIDE, url: viewer('model=/JapaneseTemple.ifc'), run: (page) => gallery(page, 1.7) },
  'ifc-solar-facade-analysis': { ...WIDE, url: `/?lang=en&model=${VELA}-A-0002.ifc&analysis=year:passive&validate=0&ui=full`, run: async (page) => {
    // The climate is only fetched after a click.
    const load = page.getByRole('button', { name: 'Load the climate and run' })
    // Asked once per site: a cached climate runs without the question.
    if (await load.count()) await load.click()
    await sleep(page, 75000)
    await gallery(page, 1.5)
  } },
  'ifc-viewer-hotel-in-city': { ...WIDE, url: `/?lang=en&model=${HOTEL}&map=terrain,buildings,showcase&look=daylight&validate=0&ui=full`, run: async (page) => {
    await mapShot(page)
    await gallery(page, [[150, 110, 210], [-30, 35, 0]])
    await sleep(page, 8000)
  } },
  'city-digital-twin-barcelona': { ...WIDE, url: '/?lang=en&scene=/scenes/barcelona-placa-catalunya.scene.json', run: sceneShot },
  'city-digital-twin-helsinki-transit': { ...WIDE, url: '/?lang=en&scene=/scenes/helsinki-rautatientori.scene.json', run: sceneShot },
  'agv-warehouse-digital-twin': { ...WIDE, demo: true, url: '/msp-global/?open=agv', run: async () => {} },
  'agv-warehouse-digital-twin-phone': { ...PHONE, demo: true, url: '/msp-global/?open=agv', run: async () => {} },
  'china-import-tracker-map': { ...WIDE, demo: true, url: '/msp-global/?open=imports', run: async () => {} },
  'china-import-tracker-phone': { ...PHONE, demo: true, url: '/msp-global/?open=imports', run: async () => {} },
  // One order: its stages from purchase order to door…
  'china-import-order-timeline': { ...WIDE, demo: true, url: '/msp-global/?open=imports', run: async (page) => {
    await page.getByText('Port congestion').first().click(); await sleep(page, 2500)
  } },
  // …and what it costs landed.
  'china-import-order-landed-cost': { ...WIDE, demo: true, url: '/msp-global/?open=imports', run: async (page) => {
    await page.getByText('Port congestion').first().click(); await sleep(page, 1500)
    await page.getByRole('button', { name: 'Costs', exact: true }).click(); await sleep(page, 2000)
  } },
  'office-it-digital-twin-ifc': { ...WIDE, demo: true, url: '/msp-global/?open=itops', run: async (page) => { await sleep(page, 25000) } },
  'office-it-digital-twin-phone': { ...PHONE, demo: true, url: '/msp-global/?open=itops', run: async (page) => { await sleep(page, 25000) } },
  'digital-twin-builder-agv-warehouse': { ...WIDE, demo: true, url: '/twin-builder/?kind=agv', run: async () => {} },
  'digital-twin-builder-import-tracker': { ...WIDE, demo: true, url: '/twin-builder/?kind=imports', run: async () => {} },
}

/** A scene document with its live layers: the map and the markers, without the issue list or a survey over them. */
async function sceneShot(page) {
  await mapShot(page)
  await collapseDrawer(page)
  const survey = page.getByText('What would help you most?')
  if (await survey.count()) { await survey.locator('xpath=ancestor::div[.//button][1]').locator('button').first().click().catch(() => {}); await sleep(page, 600) }
  await sleep(page, 8000)
}

/** Scenes on the map: accept the map notice, then give tiles, buildings and feeds time to arrive. */
async function mapShot(page) {
  const accept = page.getByRole('button', { name: /^(Enable map|Load map and data)$/ })
  await accept.first().waitFor({ timeout: 60000 })
  await accept.first().click()
  await sleep(page, 180000)
}

// ── encoding ─────────────────────────────────────────────────────────────────
/** PNG → { jpg, webp: { [width]: Buffer } }, by a canvas in the browser. */
async function encode(enc, png, widths) {
  const out = await enc.evaluate(async ({ b64, widths }) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const draw = (w, type, q) => {
      const c = document.createElement('canvas')
      c.width = w; c.height = Math.round((bmp.height * w) / bmp.width)
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height)
      return c.toDataURL(type, q).split(',')[1]
    }
    return { jpg: draw(bmp.width, 'image/jpeg', 0.86), webp: Object.fromEntries(widths.map((w) => [w, draw(w, 'image/webp', 0.82)])) }
  }, { b64: png.toString('base64'), widths })
  return { jpg: Buffer.from(out.jpg, 'base64'), webp: Object.fromEntries(Object.entries(out.webp).map(([w, b]) => [w, Buffer.from(b, 'base64')])) }
}

async function main() {
  const pics = await import(pathToFileURL(path.join(ROOT, 'scripts/seo/landing-pictures.mjs')).href)
  const A = await import(pathToFileURL(path.join(ROOT, 'scripts/seo/tool-landings/content-a.mjs')).href)
  const B = await import(pathToFileURL(path.join(ROOT, 'scripts/seo/tool-landings/content-b.mjs')).href)
  const toolFile = (concept, lang, index) => (A.PAGES[concept][lang] ?? B.PAGES[concept][lang]).shots[index].file

  const jobs = []
  for (const [id, r] of Object.entries(TOOL)) for (const lang of LANGS) jobs.push({ id, key: `${id}-${lang}`, file: toolFile(r.concept, lang, r.index), url: r.url(lang), run: r.run, ...VIEW })
  for (const [id, r] of Object.entries(SHARED)) jobs.push({ id, key: id, file: id, ...r })
  const todo = jobs.filter((j) => !ONLY.length || ONLY.includes(j.id) || ONLY.includes(j.key))

  const browser = CDP ? await chromium.connectOverCDP(CDP) : await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  })
  const ctx = CDP ? browser.contexts()[0] : await browser.newContext()
  const page = await ctx.newPage()
  const enc = await ctx.newPage()
  const outDir = path.join(ROOT, 'public', pics.DIR)
  fs.mkdirSync(outDir, { recursive: true })
  if (RAW) fs.mkdirSync(RAW, { recursive: true })

  let failed = 0
  for (const j of todo) {
    try {
      await open(page, j.url, j)
      await j.run(page)
      // Straight from the browser, rasterised at the job's scale: a phone screen is kept at 2×.
      const cdp = await page.context().newCDPSession(page)
      const clip = { x: 0, y: 0, width: j.width, height: j.height, scale: j.scale ?? 1 }
      const png = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', clip })).data, 'base64')
      await cdp.detach()
      if (RAW) fs.writeFileSync(path.join(RAW, `${j.key}.png`), png)
      const px = j.width * (j.scale ?? 1)
      const { jpg, webp } = await encode(enc, png, pics.webpWidths(px))
      fs.writeFileSync(path.join(outDir, `${j.file}.jpg`), jpg)
      for (const [w, buf] of Object.entries(webp)) fs.writeFileSync(path.join(outDir, `${j.file}-${w}.webp`), buf)
      console.log('ok  ', j.key, '→', `${j.file}.jpg`)
    } catch (e) { failed++; console.log('FAIL', j.key, String(e).slice(0, 300)) }
  }
  await page.close(); await enc.close()
  await browser.close()
  if (failed) process.exitCode = 1
}

main()
