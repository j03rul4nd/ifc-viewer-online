// Captures the listing images from the rendered harness pages (render.mjs) and frames
// each with one headline. Serve integrations/shopify on 127.0.0.1:8732 first:
//   node listing/v3/harness/serve.mjs . <local models dir>   (from integrations/shopify)
//   PW=<playwright-core index.mjs URL> node shoot.mjs [sceneId…]
const { chromium } = await import(process.env.PW || 'playwright-core')
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..')
const BASE = 'http://127.0.0.1:8732/listing/v3/harness/out/'
const only = process.argv.slice(2)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const INK = '#1f2421', BG = '#efece4', ACCENT = '#2f5d50'
const FONT = "font-family:Georgia,'Times New Roman',serif"

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--ignore-certificate-errors'] })

// One camera for the whole set: a low 3/4 view from the front-left, model filling ~75 %.
const CAM = { azimuth: 220, elevation: 24, fill: 0.95 }
// Towers: lower, so they rise out of the frame like a photo, not a plan.
const TOWER = { elevation: 12, fill: 0.97 }

/** Waits for the product viewer, turns on the heavier render (ambient occlusion, soft shadows), frames it. */
async function frameModel(page, cam = {}, settle = 5000) {
  const sel = '.ifcvo-product .ifcvo-stage'
  await page.waitForSelector(`${sel}[data-ifcvo-state="ready"]`, { timeout: 150000 })
  await page.waitForFunction(() => !!window.__viewer, null, { timeout: 30000 })
  // Large models: the geometry must be in before the camera moves.
  await page.waitForFunction(() => window.__loaded === true, null, { timeout: 400000 }).catch(() => console.log('no model-loaded event'))
  await wait(settle)
  await page.evaluate(async (o) => {
    await window.__viewer.setRenderQuality('quality').catch(() => {})
    await window.__viewer.frame({ view: 'iso', animate: false, ...o })
  }, { ...CAM, ...cam }).catch((e) => console.log('frame', e.message))
  await page.mouse.move(2, 2)
  await wait(3500)
}

/** Scrolls so that `sel` sits `offset` px below the top of the screen. */
async function scrollTo(page, sel, offset) {
  await page.evaluate(([s, o]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY - o), [sel, offset])
  await wait(1500)
}

/** Selects a rafter through the SDK and adds it to the quote, as a buyer would by clicking it. */
async function pickElement(p, ifcClass = 'IfcCurtainWall') {
  await frameModel(p)
  await p.evaluate(async (cls) => {
    const v = window.__viewer
    const hits = (await v.findElements({ ifcClass: cls }).catch(() => [])) || []
    const pick = hits[Math.floor(hits.length / 2)] || hits[0]
    if (pick) v.select(pick.expressId, pick.modelId)
  }, ifcClass)
  await wait(3000)
  await p.evaluate((o) => window.__viewer.frame({ view: 'iso', animate: false, ...o }), CAM).catch(() => {})
  await wait(2500)
  for (const b of await p.getByRole('button', { name: /Add the selected element/ }).all()) { await b.click().catch(() => {}); await wait(800) }
}

const LOCAL = 'http://127.0.0.1:8732/local-models/4-edificio-wukang-mansion/wukang-mansion_LOD300-reference.ifc'

/** Swaps the placeholder model for a local IFC through the SDK, the way a visitor drops a file. */
async function loadLocal(page, url = LOCAL) {
  await page.waitForSelector('.ifcvo-product .ifcvo-stage[data-ifcvo-state="ready"]', { timeout: 150000 })
  await page.waitForFunction(() => window.__loaded === true, null, { timeout: 150000 }).catch(() => {})
  await page.evaluate(async (u) => {
    const v = window.__viewer
    const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer())
    window.__loaded = false
    v.clear()
    await v.add('wukang-mansion_LOD300-reference.ifc', bytes)
  }, url)
}

const SHOTS = {
  'd1-explore': {
    title: 'Buyers explore the real BIM model on the product page',
    alt: 'Product page of the Wukang Mansion IFC model in an interactive 3D viewer, next to the rooms and areas read from the model',
    run: async (p) => { await loadLocal(p); await frameModel(p, { azimuth: 220, elevation: 30, fill: 1 }, 10000) },
  },
  'd2-data': {
    title: 'Quantities and steel by profile, read from the model',
    alt: 'Steel portal frame hall product page with the 3D model and a bill of quantities with steel by profile',
    run: (p) => frameModel(p, {}, 12000),
  },
  'd3-quote': {
    title: 'They pick a part in 3D and ask about it',
    alt: 'Hotel block product page: a curtain wall selected in 3D and a quote form that lists the selected element',
    run: async (p) => { await pickElement(p, 'IfcCurtainWall'); await p.evaluate(() => window.scrollTo(0, 0)); await p.mouse.move(2, 2); await wait(1500) },
  },
  'd4-downloads': {
    title: 'Files for customers only, and every download becomes a lead',
    alt: 'Shanghai Tower model with a downloads block asking guests to create an account, and an email-me-this-model form',
    run: (p) => frameModel(p, TOWER),
  },
  'd5-compare': {
    title: 'Buyers compare two variants side by side',
    alt: 'Compare variants block with an office tower and a hotel side by side in 3D',
    run: async (p) => {
      await wait(4000)
      await p.locator('[data-ifcvo-compare] button').filter({ hasText: /^Compare$/ }).first().click()
      await p.waitForFunction(() => window.__cmp.length >= 2, null, { timeout: 90000 })
      await p.waitForSelector('.ifcvo-compare-table table', { timeout: 300000 }).then(() => console.log('compare: table in')).catch(() => console.log('compare: no spec table'))
      await wait(5000)
      // Same camera for both, so the two models compare at a glance.
      const frameBoth = (o) => p.evaluate(async (o) => { for (const v of window.__cmp.slice(-2)) { await v.setRenderQuality('quality').catch(() => {}); await v.frame({ view: 'iso', animate: false, ...o }).catch((e) => console.warn('frame', String(e))) } }, o)
      await frameBoth({ ...CAM, elevation: 20, fill: 0.9 })
      await wait(3000)
      await frameBoth({ ...CAM, elevation: 20, fill: 0.9 })
      await wait(3000)
      // Stages and the spec table in one view.
      await scrollTo(p, '[data-ifcvo-compare]', 8)
      console.log('compare table rows:', await p.evaluate(() => document.querySelectorAll('.ifcvo-compare-table tr').length))
    },
  },
  'd6-planset': {
    title: 'Plan sets, licences and a view in the buyer’s own space',
    alt: 'Oriental Pearl Tower model with a plan set block listing drawings and model per licence, and a View in your space button',
    run: (p) => frameModel(p, TOWER),
  },
  'm1-explore': {
    title: 'The model opens on the phone too', mobile: true,
    alt: 'Phone product page with the 3D model of the Wukang Mansion and its rooms below',
    run: async (p) => { await loadLocal(p); await frameModel(p, { azimuth: 220, elevation: 30, fill: 1 }, 10000) },
  },
  'm2-quote': {
    title: 'Quote requests from the phone', mobile: true,
    alt: 'Phone product page of the hotel block with a selected curtain wall in the quote request form',
    run: async (p) => { await pickElement(p, 'IfcCurtainWall'); await scrollTo(p, '[data-ifcvo-lead]', 40) },
  },
  'm3-downloads': {
    title: 'Downloads that grow your customer list', mobile: true,
    alt: 'Phone product page of the World Financial Center model with gated downloads and the email-me-this-model form',
    run: async (p) => { await frameModel(p, TOWER); await scrollTo(p, '.info [data-ifcvo-downloads]', 640) },
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
  await fp.setContent(`<body style="margin:0;width:1600px;height:900px;background:${BG};overflow:hidden;display:grid;grid-template-columns:560px 1fr">
  <div style="display:flex;flex-direction:column;justify-content:center;gap:28px;padding:0 0 0 88px">
    <div style="width:44px;height:4px;background:${ACCENT}"></div>
    <h1 style="margin:0;${FONT};font-weight:500;font-size:60px;line-height:1.08;color:${INK}">The BIM model, on the product page.</h1>
    <p style="margin:0;font:400 24px/1.5 'Segoe UI',system-ui,sans-serif;color:#5f645f">Buyers explore it in 3D before they ask for a quote.</p>
  </div>
  <div style="display:flex;align-items:center;padding:64px 64px 64px 0"><div style="width:100%;height:772px;overflow:hidden;border-radius:12px;box-shadow:0 0 0 1px #d8d3c7"><img src="${stage}" style="width:100%;height:100%;object-fit:cover;transform:scale(1.32);transform-origin:56% 40%"></div></div></body>`, { waitUntil: 'load' })
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
