// Captures of the viewer for generate-core-landings.ts: the real app, running
// from a local dev server in Chrome, on the public Duplex sample model.
//
//   node scripts/seo/core-landings/capture.cjs <outDir> [shot,shot…] [baseUrl]
//
// Writes <outDir>/<shot>.png (1600×1000, or 1440×900 for the Mac-sized shots).
// The generator then encodes .jpg/.webp from them (--shots <outDir>).
// Needs a local Chrome (CHROME_PATH): headless Chromium has no usable GPU here.
// The interface is captured in English; alt text and captions are translated.
const { chromium } = require('playwright-core')
const [out, shotsArg, baseArg] = process.argv.slice(2)
const BASE = baseArg || 'http://localhost:5173'
const MODEL = '/Ifc2x3_Duplex_Architecture.ifc'
const panel = '[data-bottom-drawer="validation"]'

const validated = (p) => p.waitForFunction(() => /Re-validate/.test(document.body.innerText) && !/Validating…/.test(document.body.innerText), null, { timeout: 180000 })
const click = async (p, loc, wait = 900) => { await loc.first().click({ timeout: 15000 }); await p.waitForTimeout(wait) }

const loaded = async (p) => { await p.waitForFunction(() => /7,181/.test(document.body.innerText) && !/Loading Ifc2x3/.test(document.body.innerText), null, { timeout: 120000 }); await p.waitForTimeout(6000) }
const hideProperties = (p) => click(p, p.getByRole('button', { name: 'Hide panel' }).last(), 600)

const SHOTS = {
  // Health Score, what to fix first, and the elements failing the first rule picked out in 3D.
  'score-3d': { q: '&validate=1&panel=1&view=iso&fill=0.9', run: async (p) => {
    await validated(p)
    await hideProperties(p)
    await click(p, p.locator('[data-testid="show-3d-chip"]'), 3500)
  } },
  // The issue list, grouped by rule, with the panel maximised.
  'issues': { q: '&validate=1&panel=1&view=iso', run: async (p) => {
    await validated(p)
    await click(p, p.getByRole('button', { name: 'Maximize panel' }))
    await click(p, p.locator(panel).getByText('Expand all'), 1500)
  } },
  // The bounding-box clash rule switched on.
  'clash': { q: '&validate=1&panel=1&view=iso&fill=0.9&rule=RULE_ELEMENT_CLASH', run: async (p) => {
    await validated(p)
    await hideProperties(p)
    await click(p, p.locator('[data-testid="show-3d-chip"]'), 3500)
  } },
  // An IDS file checked against the model.
  'ids': { q: '&validate=0&view=iso&fill=0.9', run: async (p) => {
    await loaded(p)
    await click(p, p.getByRole('button', { name: /^Check/ }))
    await click(p, p.getByText('Check against IDS…'), 1500)
    await click(p, p.getByRole('button', { name: 'Walls fire rating' }), 1200)
    await click(p, p.getByRole('button', { name: 'Run check' }), 3000)
    await p.waitForFunction(() => !/Checking…/.test(document.body.innerText), null, { timeout: 180000 })
    await p.waitForTimeout(2000)
    await click(p, p.getByRole('button', { name: 'View results' }), 3000)
    await click(p, p.getByRole('button', { name: 'Highlight' }), 3000)
  } },
  // The export dialog of a validation run.
  'export': { q: '&validate=1&panel=1&view=iso', run: async (p) => {
    await validated(p)
    await click(p, p.locator(panel).getByRole('button', { name: 'Export' }), 2000)
  } },
  // The built-in validation profiles.
  'profile': { q: '&validate=1&panel=1&view=iso&fill=0.9', run: async (p) => {
    await validated(p)
    await click(p, p.locator(panel).getByText('Select profile…'), 1200)
  } },
  // A MacBook-sized window: the model, the tree and the properties of an element.
  'mac-properties': { vp: [1440, 900], q: '&validate=0&view=iso&fill=0.8', run: async (p) => {
    await loaded(p)
    await click(p, p.getByRole('button', { name: 'Collapse panel' }), 1500)
    await p.mouse.click(700, 520)
    await p.waitForTimeout(2500)
  } },
  // Same window, a section through the building.
  'mac-section': { vp: [1440, 900], q: '&validate=0&view=iso&fill=0.8', run: async (p) => {
    await loaded(p)
    await click(p, p.getByRole('button', { name: 'Collapse panel' }), 1500)
    await click(p, p.getByRole('button', { name: 'Section', exact: true }), 1500)
    await click(p, p.getByRole('button', { name: 'Cut X' }), 3000)
  } },
}

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
  for (const id of (shotsArg && shotsArg !== 'all' ? shotsArg.split(',') : Object.keys(SHOTS))) {
    const s = SHOTS[id]
    const [width, height] = s.vp || [1600, 1000]
    const ctx = await b.newContext({ viewport: { width, height }, locale: 'en' })
    // Keep the capture out of the analytics and skip first-visit notices.
    await ctx.addInitScript(() => { try { localStorage.setItem('i18nextLng', 'en'); localStorage.setItem('ifc.analytics.optout', '1') } catch {} })
    const p = await ctx.newPage()
    try {
      await p.goto(`${BASE}/?model=${MODEL}&lang=en${s.q}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await s.run(p)
      await p.screenshot({ path: `${out}/${id}.png`, type: 'png' })
      console.log('ok', id)
    } catch (e) {
      await p.screenshot({ path: `${out}/${id}-FAILED.png`, type: 'png' }).catch(() => {})
      console.log('FAIL', id, String(e).slice(0, 300))
    }
    await ctx.close()
  }
  await b.close()
})()
