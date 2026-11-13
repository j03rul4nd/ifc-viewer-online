// Visual check + FPS of revision compare for any A/B pair of folders.
//   CHROME=<chrome.exe> node scripts/e2e/revision-shots.mjs <dirA> <dirB> <name> [baseUrl] [outDir]
// Saves <name>-*.png (Changes with each row selected, Blink A and B, phone)
// and prints the rAF frame rate over 3 s in the Changes view.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const [dirA, dirB, name, BASE = 'http://localhost:3361', OUT = 'tmp/rc-shots'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const files = (d) => fs.readdirSync(d).filter((f) => /\.ifc$/i.test(f)).map((f) => path.resolve(d, f))

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: false, args: ['--ignore-gpu-blocklist'] })

async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror:', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text().slice(0, 200), JSON.stringify(m.location())) })
  await page.goto(`${BASE}/?compare`, { timeout: 240_000 })
  await page.locator('[data-testid="rc-input-a"]').waitFor({ state: 'attached', timeout: 240_000 })
  await page.locator('[data-testid="rc-input-a"]').setInputFiles(files(dirA))
  await page.locator('[data-testid="rc-input-b"]').setInputFiles(files(dirB))
  await page.locator('[data-testid="rc-card"]').waitFor({ timeout: 400_000 })
  // Scene loaded = the load centre no longer reports active jobs; poll the canvas count of models.
  for (let i = 0; i < 120; i++) {
    const busy = await page.evaluate(() => /Cargando|Loading/.test(document.body.innerText))
    if (!busy) break
    await page.waitForTimeout(2000)
  }
  await page.waitForTimeout(4000)
  return { ctx, page }
}

const fps = (page) => page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now()
  // Keep the camera moving so the renderer really draws every frame.
  const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
  const r = canvas.getBoundingClientRect()
  let x = r.left + r.width * 0.6
  const tick = () => {
    n++
    x += 2
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: r.top + r.height / 2, buttons: 1, bubbles: true, pointerId: 1 }))
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(Math.round(n / 3))
  }
  canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: r.top + r.height / 2, buttons: 1, bubbles: true, pointerId: 1 }))
  requestAnimationFrame(tick)
}))

const { ctx, page } = await open({ width: 1440, height: 900 })
const rows = await page.locator('[data-testid="rc-row"]').count()
console.log(`${name}: ${rows} rows`)
const labels = await page.locator('[data-testid="rc-row"]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\n/g, ' | ')))
const dupes = labels.filter((l, i) => labels.indexOf(l) !== i)
console.log(`${name}: duplicate row labels: ${dupes.length ? dupes.join(' ;; ') : 'none'}`)
const gids = await page.locator('[data-testid="rc-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gid')))
console.log(`${name}: duplicate GlobalIds: ${gids.length - new Set(gids).size}`)
for (let i = 0; i < Math.min(rows, 5); i++) {
  await page.locator('[data-testid="rc-row"]').nth(i).click()
  await page.waitForTimeout(2500)
  const table = await page.locator('[data-testid="rc-card"]').innerText()
  console.log(`${name}: row ${i}: ${table.replace(/\n/g, ' | ').slice(0, 220)}`)
  await page.screenshot({ path: `${OUT}/${name}-changes-${i}.png` })
}
console.log(`${name}: FPS changes = ${await fps(page)}`)
await page.locator('[data-testid="rc-view-blink"]').click()
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/${name}-blink-b.png` })
console.log(`${name}: FPS blink = ${await fps(page)}`)
await page.keyboard.press(' ')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/${name}-blink-a.png` })
await page.locator('[data-testid="rc-view-curtain"]').click()
await page.waitForTimeout(3000)
console.log(`${name}: FPS curtain = ${await fps(page)}`)
await page.screenshot({ path: `${OUT}/${name}-curtain.png` })
await page.locator('[data-testid="rc-view-split"]').click()
await page.waitForTimeout(3500)
console.log(`${name}: FPS split = ${await fps(page)}`)
await page.screenshot({ path: `${OUT}/${name}-split.png` })
await page.locator('[data-testid="rc-row"]').nth(Math.min(rows - 1, 3)).click()
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/${name}-split-selected.png` })
await page.locator('[data-testid="rc-view-changes"]').click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/${name}-after-split.png` })
// Close: the dialog offers to remove A and B.
await page.locator('[data-testid="rc-header"] button[aria-label]').last().click()
const dlg = await page.locator('[data-testid="rc-close-dialog"]').isVisible().catch(() => false)
console.log(`${name}: close dialog shown = ${dlg}`)
if (dlg) {
  await page.screenshot({ path: `${OUT}/${name}-close.png` })
  await page.locator('[data-testid="rc-close-remove-both"]').click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/${name}-after-close.png` })
}
await ctx.close()

if (process.env.PHONE) {
  const ph = await open({ width: 375, height: 812 }, true)
  await ph.page.screenshot({ path: `${OUT}/${name}-phone.png` })
  const box = await ph.page.locator('[data-testid="rc-frame"]').boundingBox()
  console.log(`${name}: phone Encuadrar = ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'n/a'}`)
  await ph.ctx.close()
}
await browser.close()
