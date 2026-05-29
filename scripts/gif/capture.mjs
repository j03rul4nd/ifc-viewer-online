// Capture real-app flows to webm via Playwright + system Chrome.
// Usage: node scripts/gif/capture.mjs <scene>
// Scenes: hero | validate | tree | section | plans | measure
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.APP_URL || 'http://localhost:3002/ifc-viewer-online/'
const scene = process.argv[2] || 'hero'
const W = 1280, H = 720
const OUT = 'scripts/gif/out'
mkdirSync(OUT, { recursive: true })

const log = (...a) => console.log(`[${scene}]`, ...a)

const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] })
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
})
const page = await ctx.newPage()
page.on('pageerror', (e) => log('pageerror', e.message.slice(0, 160)))

await page.addInitScript(() => { try { localStorage.setItem('ifc-locale', 'en') } catch {} })

// ── shared helpers ────────────────────────────────────────────────────────────
async function gotoLanding() {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
}
async function loadDemo() {
  await page.getByRole('button', { name: /demo/i }).first().click({ timeout: 10000 })
  // wait for canvas + "Loaded" status
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(700)
    const ok = await page.evaluate(() => !!document.querySelector('canvas') &&
      /loaded/i.test(document.body.innerText))
    if (ok && i > 3) break
  }
  await page.waitForTimeout(1500)
}
async function selectProfile(re) {
  await page.getByText(/select profile/i).first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
  const opt = page.getByText(re).first()
  await opt.click({ timeout: 8000 })
  await page.waitForTimeout(600)
}
async function runValidation() {
  await page.getByRole('button', { name: /^validate$/i }).first().click({ timeout: 8000 })
  // wait for issues to appear / health score
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(600)
    const done = await page.evaluate(() => /\d{1,3}\s*\/\s*100|health/i.test(document.body.innerText) ||
      document.querySelectorAll('[data-issue],[class*=issue i]').length > 3)
    if (done) break
  }
}
const click = (name) => page.getByRole('button', { name }).first().click({ timeout: 8000 })

// ── scenes ────────────────────────────────────────────────────────────────────
try {
  if (scene === 'hero' || scene === 'validate') {
    await gotoLanding()
    await loadDemo()
    await page.waitForTimeout(800)
    await selectProfile(/quality review/i)
    await page.waitForTimeout(700)
    await runValidation()
    await page.waitForTimeout(2500)
    // click first issue group to expand
    const firstIssue = page.locator('[data-issue], button:has-text("GUID"), button:has-text("name")').first()
    await firstIssue.click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(2500)
  } else if (scene === 'tree') {
    await gotoLanding(); await loadDemo()
    await page.waitForTimeout(800)
    // Expand the whole spatial tree
    await page.getByRole('button', { name: /expand all/i }).first().click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(1500)
    // Click a few leaf element rows (clickable DIV rows) to drive selection + 3D highlight + properties
    const rows = page.locator('[data-testid="tree"] div.h-\\[30px\\]')
    const n = await rows.count(); log('tree rows', n)
    const picks = [Math.min(6, n - 1), Math.min(10, n - 1), Math.min(15, n - 1)].filter((v, i, a) => v > 0 && a.indexOf(v) === i)
    for (const idx of picks) {
      await rows.nth(idx).click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(1600)
    }
    await page.waitForTimeout(1200)
  } else if (scene === 'section') {
    await gotoLanding(); await loadDemo()
    await page.waitForTimeout(600)
    await click(/^section$/i); await page.waitForTimeout(700)
    await page.getByRole('button', { name: /add clip plane/i }).first().click({ timeout: 5000 }).catch((e) => log('clip fail', e.message.slice(0, 80)))
    await page.waitForTimeout(1200)
    // place the plane by clicking a model face on the canvas (centered on the building)
    const box = await page.locator('canvas').first().boundingBox()
    if (box) {
      const x = box.x + box.width * 0.5, y = box.y + box.height * 0.42
      await page.mouse.move(x, y); await page.waitForTimeout(300)
      await page.mouse.click(x, y); log('clicked face', Math.round(x), Math.round(y))
    }
    await page.waitForTimeout(4500)
  } else if (scene === 'plans') {
    await gotoLanding(); await loadDemo()
    await page.waitForTimeout(600)
    await click(/^plans$/i); await page.waitForTimeout(700)
    await page.getByRole('button', { name: /detect storeys/i }).first().click({ timeout: 5000 }).catch((e) => log('detect fail', e.message.slice(0, 80)))
    await page.waitForTimeout(2500)
    await click(/^plans$/i).catch(() => {})  // reopen popover
    await page.waitForTimeout(600)
    // Click the first real storey entry inside the floating popover (exclude toolbar/validation buttons)
    const picked = await page.evaluate(() => {
      const skip = /^(open|reset|isolate|tree|scene|validate|overlay|measure|section|plans|export|home|issues|bcf|history|all|e|w|i|rule|storey|class|detect storeys|select profile|customize profile)/i
      const btns = [...document.querySelectorAll('button')].filter((b) => {
        const t = (b.textContent || '').trim(); const r = b.getBoundingClientRect()
        return t && t.length < 40 && !skip.test(t) && r.width > 40 && r.top < window.innerHeight * 0.6
      })
      if (btns[0]) { btns[0].click(); return btns[0].textContent.trim() }
      return null
    })
    log('storey picked:', picked)
    await page.waitForTimeout(4000)
  } else if (scene === 'overlay') {
    await gotoLanding(); await loadDemo()
    await page.waitForTimeout(700)
    await selectProfile(/coordination/i)
    await runValidation()
    await page.waitForTimeout(1800)
    await page.getByRole('button', { name: /overlay/i }).first().click({ timeout: 6000 }).catch((e) => log('overlay fail', e.message.slice(0, 80)))
    await page.waitForTimeout(5000)
  } else if (scene === 'export') {
    await gotoLanding(); await loadDemo()
    await page.waitForTimeout(700)
    await selectProfile(/quality review/i)
    await runValidation()
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: /^export$/i }).first().click({ timeout: 6000 }).catch((e) => log('export fail', e.message.slice(0, 80)))
    await page.waitForTimeout(3500)
  } else if (scene === 'measure') {
    await gotoLanding(); await loadDemo()
    await click(/measure/i); await page.waitForTimeout(3000)
  } else {
    throw new Error('unknown scene ' + scene)
  }
} catch (e) {
  log('FLOW ERROR', e.message.slice(0, 200))
}

const videoPath = await page.video().path()
await ctx.close()   // finalizes the webm
await browser.close()

// rename to scene.webm
const dest = `${OUT}/${scene}.webm`
try { rmSync(dest, { force: true }) } catch {}
renameSync(videoPath, dest)
log('SAVED', dest)
