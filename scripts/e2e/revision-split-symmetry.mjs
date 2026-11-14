// Split view symmetry check (dev server only: imports the UI store from the page).
//   CHROME=<chrome.exe> node scripts/e2e/revision-split-symmetry.mjs [baseUrl] [outDir]
// F8, the moved wall selected, Split mode; for two window widths and the model
// tree open / closed: screenshot + where the divider and the labels are.
// The pixel symmetry itself is measured by the Python step that follows it
// (centroid of the selected colour in each half, relative to the half's edge).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:3361'
const OUT = process.argv[3] ?? 'tmp/rc-split'
fs.mkdirSync(OUT, { recursive: true })
const F8 = path.resolve('tests/fixtures/revision/F8')
const files = (s) => fs.readdirSync(path.join(F8, s)).map((f) => path.join(F8, s, f))
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: false, args: ['--ignore-gpu-blocklist'] })
const results = []
for (const width of [1440, 1920]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror:', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text().slice(0, 200)) })
  await page.goto(`${BASE}/?compare`, { timeout: 240_000 })
  await page.locator('[data-testid="rc-input-a"]').waitFor({ state: 'attached', timeout: 240_000 })
  await page.locator('[data-testid="rc-input-a"]').setInputFiles(files('a'))
  await page.locator('[data-testid="rc-input-b"]').setInputFiles(files('b'))
  await page.locator('[data-testid="rc-card"]').waitFor({ timeout: 300_000 })
  await page.waitForTimeout(25_000)
  await page.locator('[data-testid="rc-view-split"]').click()
  // The moved wall: shown on both sides (old and new position).
  const moved = page.locator('[data-testid="rc-row"]').filter({ hasText: /Movido|Moved/ }).first()
  await moved.click()
  for (const tree of [false, true]) {
    await page.evaluate(async (on) => { const m = await import('/src/stores/uiStore.ts'); m.useUIStore.getState().setTreeVisible(on) }, tree)
    await page.waitForTimeout(3500)
    const geo = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="rc-split-divider"]')?.getBoundingClientRect()
      const a = document.querySelector('[data-testid="rc-split-a"]')?.getBoundingClientRect()
      const b = document.querySelector('[data-testid="rc-split-b"]')?.getBoundingClientRect()
      const canvases = [...document.querySelectorAll('canvas')].map((c) => c.getBoundingClientRect()).sort((x, y) => y.width * y.height - x.width * x.height)
      return { divider: d?.left, labelA: a?.left, labelB: b?.left, canvasLeft: canvases[0]?.left, canvasRight: canvases[0]?.right }
    })
    const name = `split-${width}-tree-${tree ? 'open' : 'closed'}`
    await page.screenshot({ path: `${OUT}/${name}.png` })
    results.push({ name, width, tree, ...geo })
    console.log(name, JSON.stringify(geo))
  }
  await ctx.close()
}
fs.writeFileSync(`${OUT}/geometry.json`, JSON.stringify(results, null, 2))
await browser.close()
