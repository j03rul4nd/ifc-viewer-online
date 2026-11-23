// Captures the listing images from the rendered harness pages (render.mjs) and frames
// each with one headline. Serve integrations/shopify on 127.0.0.1:8731 first:
//   python -m http.server 8731 --bind 127.0.0.1     (from integrations/shopify)
//   PW=<playwright-core index.mjs URL> node shoot.mjs [sceneId…]
const { chromium } = await import(process.env.PW || 'playwright-core')
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..')
const BASE = 'http://127.0.0.1:8731/listing/v3/harness/out/'
const only = process.argv.slice(2)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const INK = '#1f2421', BG = '#efece4', ACCENT = '#2f5d50'
const FONT = "font-family:Georgia,'Times New Roman',serif"

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })

/** Waits for the product viewer, then frames the model through the SDK: a 3/4 elevated view. */
async function frameModel(page, { azimuth = 35, elevation = 28, fill = 0.92, settle = 5000 } = {}) {
  const sel = '.ifcvo-product .ifcvo-stage'
  await page.waitForSelector(`${sel}[data-ifcvo-state="ready"]`, { timeout: 150000 })
  await page.waitForFunction(() => !!window.__viewer, null, { timeout: 30000 })
  await wait(settle)
  await page.evaluate((o) => window.__viewer.frame({ view: 'iso', animate: false, ...o }), { azimuth, elevation, fill }).catch((e) => console.log('frame', e.message))
  await page.mouse.move(2, 2)
  await wait(2500)
}

/** Scrolls so that `sel` sits `offset` px below the top of the phone screen. */
async function scrollTo(page, sel, offset) {
  await page.evaluate(([s, o]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY - o), [sel, offset])
  await wait(1500)
}

/** Selects a curtain wall through the SDK and adds it to the quote list, as a buyer would by clicking it. */
async function pickElement(p) {
  await frameModel(p, { azimuth: 200, elevation: 18 })
  await p.evaluate(async () => {
    const v = window.__viewer
    const hits = await v.findElements({ ifcClass: 'IfcCurtainWall' }).catch(() => [])
    const pick = (hits && hits[0]) || ((await v.findElements({ ifcClass: 'IfcWindow' })) || [])[0]
    if (pick) v.select(pick.expressId, pick.modelId)
  })
  await wait(3000)
  await p.evaluate(() => window.__viewer.frame({ view: 'iso', azimuth: 200, elevation: 18, fill: 0.92, animate: false })).catch(() => {})
  await wait(2000)
  for (const b of await p.getByRole('button', { name: /Add the selected element/ }).all()) { await b.click().catch(() => {}); await wait(800) }
}

const SHOTS = {
  'd1-explore': {
    title: 'Buyers explore the real BIM model, right on the product page',
    alt: 'Product page of a duplex house kit with the interactive 3D IFC model next to a rooms table read from the model',
    run: (p) => frameModel(p, { azimuth: 215, elevation: 25 }),
  },
  'd2-data': {
    title: 'Quantities by type, counted from the model itself',
    alt: 'Structural frame product page with the 3D model and a bill of quantities grouped by type',
    run: (p) => frameModel(p, { azimuth: 40, elevation: 22, settle: 12000 }),
  },
  'd3-quote': {
    title: 'They pick an element and ask for a quote about it',
    alt: 'Hotel block product page: a curtain wall selected in 3D and a quote form that lists the selected element',
    run: async (p) => {
      await pickElement(p)
      await p.evaluate(() => window.scrollTo(0, 0)); await p.mouse.move(2, 2); await wait(1500)
    },
  },
  'd4-downloads': {
    title: 'Files for customers only, and every download becomes a lead',
    alt: 'Downloads block asking guests to create an account for the IFC, GLB and CSV files, and an email-me-this-model form',
    run: (p) => frameModel(p, { azimuth: 145, elevation: 25 }),
  },
  'd5-compare': {
    title: 'Buyers compare two variants side by side in 3D',
    alt: 'Compare variants block showing a tram stop and a bench with lamps side by side in 3D',
    run: async (p) => {
      await wait(4000)
      await p.locator('[data-ifcvo-compare] button').filter({ hasText: /^Compare$/ }).first().click()
      await wait(60000)
      await scrollTo(p, '[data-ifcvo-compare]', 16)
    },
  },
  'd6-planset': {
    title: 'Plan sets, licences and a view in the buyer’s own space',
    alt: 'Plan set block listing the drawings and model included with each licence, and a View in your space button for AR',
    run: (p) => frameModel(p, { azimuth: 310, elevation: 28 }),
  },
  'm1-explore': {
    title: 'The model opens on the phone too', mobile: true,
    alt: 'Phone product page with the 3D model of the duplex house and its rooms below',
    run: (p) => frameModel(p, { azimuth: 215, elevation: 25 }),
  },
  'm2-quote': {
    title: 'Quote requests from the phone', mobile: true,
    alt: 'Phone product page with the 3D hotel block model and the quote request form',
    run: async (p) => { await pickElement(p); await scrollTo(p, '[data-ifcvo-lead]', 40) },
  },
  'm3-downloads': {
    title: 'Downloads that grow your customer list', mobile: true,
    alt: 'Phone product page with gated IFC downloads and the email-me-this-model form',
    run: async (p) => { await frameModel(p, { azimuth: 145, elevation: 25 }); await scrollTo(p, '.info [data-ifcvo-downloads]', 430) },
  },
}

/** One headline band over the real page capture. Same type, colour and spacing in every image. */
const frame = (shot, title, mobile) => mobile
  ? `<body style="margin:0;width:900px;height:1600px;background:${BG};overflow:hidden">
  <div style="height:250px;display:flex;flex-direction:column;justify-content:center;padding:0 64px;gap:18px">
  <div style="width:44px;height:4px;background:${ACCENT}"></div>
  <h1 style="margin:0;${FONT};font-weight:500;font-size:52px;line-height:1.12;color:${INK}">${title}</h1></div>
  <img src="${shot}" style="display:block;width:780px;margin:0 auto;border-radius:28px 28px 0 0;box-shadow:0 0 0 1px #d8d3c7"></body>`
  : `<body style="margin:0;width:1600px;height:900px;background:${BG};overflow:hidden">
  <div style="height:120px;display:flex;align-items:center;gap:26px;padding:0 64px">
  <div style="width:44px;height:4px;background:${ACCENT};flex:none"></div>
  <h1 style="margin:0;${FONT};font-weight:500;font-size:44px;color:${INK};white-space:nowrap">${title}</h1></div>
  <img src="${shot}" style="display:block;width:1504px;margin:0 auto;border-radius:12px 12px 0 0;box-shadow:0 0 0 1px #d8d3c7"></body>`

/** Feature image: one focal point (the model), one line, the same palette as the screenshots. */
async function feature(stage) {
  const fp = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await fp.setContent(`<body style="margin:0;width:1600px;height:900px;background:${BG};overflow:hidden;display:grid;grid-template-columns:600px 1fr">
  <div style="display:flex;flex-direction:column;justify-content:center;gap:28px;padding:0 0 0 88px">
    <div style="width:44px;height:4px;background:${ACCENT}"></div>
    <h1 style="margin:0;${FONT};font-weight:500;font-size:64px;line-height:1.08;color:${INK}">The BIM model, on the product page.</h1>
    <p style="margin:0;font:400 24px/1.5 'Segoe UI',system-ui,sans-serif;color:#5f645f">Buyers explore it in 3D before they ask for a quote.</p>
  </div>
  <div style="display:flex;align-items:center;padding:72px 72px 72px 0"><img src="${stage}" style="width:100%;height:756px;object-fit:cover;border-radius:12px;box-shadow:0 0 0 1px #d8d3c7"></div></body>`, { waitUntil: 'load' })
  await fp.screenshot({ path: join(out, 'feature-1600x900.png') })
  await fp.close()
  console.log('saved feature-1600x900.png')
}

for (const [id, s] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(id)) continue
  // Desktop: 1504×780 CSS px at 1x (fills the frame below the headline).
  // Phone: 390×1040 CSS px at 2x → 780×2080, cropped by the frame at 1350 px.
  const ctx = await browser.newContext(s.mobile
    ? { viewport: { width: 390, height: 1040 }, deviceScaleFactor: 2, isMobile: true, hasTouch: false, locale: 'en-US' }
    : { viewport: { width: 1504, height: 780 }, deviceScaleFactor: 1.5, locale: 'en-US' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(id, 'pageerror', e.message.slice(0, 160)))
  await page.goto(BASE + id + '.html')
  try { await s.run(page) } catch (e) { console.log(id, 'step failed:', e.message.split('\n')[0]) }
  const shot = 'data:image/png;base64,' + (await page.screenshot()).toString('base64')
  // The feature image reuses the first scene's live model, at 1.5x for a sharp crop.
  if (id === 'd1-explore') await feature('data:image/png;base64,' + (await page.locator('.ifcvo-product .ifcvo-stage').screenshot()).toString('base64'))
  await ctx.close()
  const fp = await browser.newPage({ viewport: s.mobile ? { width: 900, height: 1600 } : { width: 1600, height: 900 } })
  await fp.setContent(frame(shot, s.title, s.mobile), { waitUntil: 'load' })
  const name = (s.mobile ? 'mobile-' : 'desktop-') + id.slice(1) + '.png'
  await fp.screenshot({ path: join(out, name) })
  await fp.close()
  console.log('saved', name, '|', s.alt)
}
await browser.close()
export const ALT = Object.fromEntries(Object.entries(SHOTS).map(([k, v]) => [k, { title: v.title, alt: v.alt }]))
