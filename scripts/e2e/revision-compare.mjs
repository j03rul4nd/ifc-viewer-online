// E2E for revision compare (T3 acceptance). Needs the dev server running:
//   npm run dev -- --port 3361
//   CHROME=<path to chrome.exe> node scripts/e2e/revision-compare.mjs [baseUrl] [outDir]
// Drops the F8 pair (3 files per side), checks the list shows with no other
// click, walks every change with J/K, marks one reviewed, reloads and checks
// the state survived, measures frame time, and saves desktop + phone shots.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:3361'
const OUT = process.argv[3] ?? 'tmp/rc-e2e'
const F8 = path.resolve('tests/fixtures/revision/F8')
const filesOf = (side) => fs.readdirSync(path.join(F8, side)).map((f) => path.join(F8, side, f))
fs.mkdirSync(OUT, { recursive: true })

const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? ` — ${info}` : ''}`) }

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  // Headed by default: software WebGL (headless swiftshader) loses the context
  // with two revisions loaded. HEADLESS=1 for CI with a GPU.
  headless: !!process.env.HEADLESS,
  args: ['--ignore-gpu-blocklist', '--window-position=0,0'],
})

async function drop(page) {
  await page.goto(`${BASE}/?compare`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await page.locator('[data-testid="rc-input-a"]').waitFor({ state: 'attached', timeout: 180_000 })
  await page.locator('[data-testid="rc-input-a"]').setInputFiles(filesOf('a'))
  await page.locator('[data-testid="rc-input-b"]').setInputFiles(filesOf('b'))
  try { await page.locator('[data-testid="rc-row"]').first().waitFor({ timeout: 300_000 }) }
  catch (e) { await page.screenshot({ path: `${OUT}/fail-drop.png` }); console.log(await page.evaluate(() => document.body.innerText.slice(0, 600))); throw e }
}

// ── Desktop ──────────────────────────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror:', e.message, (e.stack ?? '').split(String.fromCharCode(10)).slice(1, 6).join(' | ')))
await drop(page)
const n = await page.locator('[data-testid="rc-row"]').count()
ok('list visible after dropping both sides, no extra click', n > 0, `${n} rows`)
ok('F8 has the 5 seeded changes', n === 5, `${n}`)
await page.waitForTimeout(2500)

// J through every change and back with K.
const seen = new Set()
for (let i = 0; i < n; i++) {
  seen.add(await page.locator('[data-testid="rc-row"][aria-current="true"]').getAttribute('data-gid'))
  await page.keyboard.press('j')
  await page.waitForTimeout(150)
}
ok('J visits every change', seen.size === n, `${seen.size}/${n}`)
await page.keyboard.press('k')
const pos = await page.locator('[data-testid="rc-position"]').innerText()
ok('K steps back', pos.trim() === `${n} / ${n}`, pos)

// Frame time of a click.
// The scene loads after the list: retry the click until the model is there.
let frameMs = -1
for (let i = 0; i < 60 && frameMs < 0; i++) {
  await page.locator('[data-testid="rc-row"]').nth(i % 2).click()
  await page.waitForTimeout(2000)
  frameMs = await page.evaluate(() => window.__rcFrameMs ?? -1)
}
ok('click frames the element in < 300 ms', frameMs >= 0 && frameMs < 300, `${frameMs.toFixed(1)} ms`)

// Review + reload.
const gid = await page.locator('[data-testid="rc-row"][aria-current="true"]').getAttribute('data-gid')
await page.keyboard.press('r')
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/desktop-changes.png` })
for (const v of ['curtain']) {
  await page.locator(`[data-testid="rc-view-${v}"]`).click()
  await page.waitForTimeout(3500)
  const fps = await page.locator('[data-testid="rc-fps"]').innerText().catch(() => '—')
  ok(`${v} view at 30 FPS or more`, parseInt(fps, 10) >= 30, fps)
  await page.mouse.move(720, 450); await page.mouse.down(); await page.mouse.move(900, 450, { steps: 8 }); await page.mouse.up()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/desktop-${v}.png` })
}
await page.locator('[data-testid="rc-view-changes"]').click()
await page.waitForTimeout(500)
await drop(page)
await page.waitForTimeout(600)
const kept = await page.locator(`[data-testid="rc-row"][data-gid="${gid}"]`).innerText()
ok('review state survives a reload', kept.includes('✓'), gid)
await ctx.close()

// ── Phone ────────────────────────────────────────────────────────────────────
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const p2 = await phone.newPage()
await p2.goto(`${BASE}/?compare`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
await p2.locator('[data-testid="rc-input-a"]').waitFor({ state: 'attached', timeout: 180_000 })
await p2.screenshot({ path: `${OUT}/phone-drop.png` })
await p2.locator('[data-testid="rc-input-a"]').setInputFiles(filesOf('a'))
await p2.locator('[data-testid="rc-input-b"]').setInputFiles(filesOf('b'))
await p2.locator('[data-testid="rc-card"]').waitFor({ timeout: 240_000 })
await p2.waitForTimeout(3000)
ok('phone shows the change card', true)
await p2.screenshot({ path: `${OUT}/phone-card.png` })
await phone.close()

await browser.close()
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
process.exit(results.every((r) => r.pass) ? 0 : 1)
