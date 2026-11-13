// E2E for the guided demo link (T6 acceptance). Needs the dev server:
//   npm run dev -- --port 3366
//   CHROME=<path to chrome.exe> node scripts/e2e/revision-demo.mjs [baseUrl] [outDir]
// Opens /?compare=demo&tour=revision&ref=test with no click and checks the
// change list and tour step 1 are on screen, walks the tour to the end and
// reads the events from a PostHog page mock (`window.__phMock`, dev only),
// checks no event carries a file name or GlobalId, repeats with PostHog's
// hosts blocked, and saves desktop + phone shots of three steps.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:3366'
const OUT = process.argv[3] ?? 'tmp/rc-demo-e2e'
const LINK = `${BASE}/?compare=demo&tour=revision&ref=test`
fs.mkdirSync(OUT, { recursive: true })
const F8 = path.resolve('tests/fixtures/revision/F8')
const expected = JSON.parse(fs.readFileSync(path.join(F8, 'expected.json'), 'utf8'))
const FORBIDDEN = [
  ...fs.readdirSync(path.join(F8, 'a')),
  ...expected.changes.flatMap((c) => [c.globalIdA, c.globalIdB]).filter(Boolean),
]

const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? ` — ${info}` : ''}`) }

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  headless: !!process.env.HEADLESS,
  args: ['--ignore-gpu-blocklist', '--window-position=0,0'],
})

async function open(ctx, { blockPosthog = false } = {}) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror:', e.message))
  await page.addInitScript(() => { window.__phMock = [] })
  if (blockPosthog) await page.route(/posthog/i, (r) => r.abort())
  await page.goto(LINK, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  return page
}

const title = (page) => page.locator('[role="dialog"][aria-modal="true"] h2').last().textContent({ timeout: 5000 }).catch(() => '')
const next = (page) => page.locator('[role="dialog"][aria-modal="true"] button').last().click()

async function walk(page, shots, prefix) {
  const seen = []
  for (let i = 0; i < 12; i++) {
    const h = (await title(page))?.trim()
    if (!h) break
    seen.push(h)
    if (shots.includes(seen.length)) await page.screenshot({ path: `${OUT}/${prefix}-step${seen.length}.png` })
    await next(page)
    await page.waitForTimeout(450)
  }
  return seen
}

// ── Desktop ──────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  const page = await open(ctx)
  const t0 = Date.now()
  await page.locator('[data-testid="rc-row"]').first().waitFor({ timeout: 300_000 })
  await page.locator('[role="dialog"][aria-modal="true"] h2').first().waitFor({ timeout: 30_000 })
  const rows = await page.locator('[data-testid="rc-row"]').count()
  ok('demo link shows the change list with no click', rows === 5, `${rows} rows in ${Date.now() - t0} ms`)
  ok('tour step 1 shows with no click', (await title(page))?.includes('nothing uploaded'), await title(page))
  ok('tour param dropped from the URL', !page.url().includes('tour='), page.url())
  await page.waitForTimeout(2500) // 3D lands after the list
  const seen = await walk(page, [1, 3, 7], 'desktop')
  ok('tour walks to the end', seen.length >= 8 && seen.at(-1)?.includes('own files'), seen.join(' | '))
  const ev = await page.evaluate(() => window.__phMock)
  const names = ev.map((e) => e[0])
  ok('rc_opened {source: demo, ref: test}', ev.some(([n, p]) => n === 'rc_opened' && p.source === 'demo' && p.ref === 'test'), JSON.stringify(ev.find((e) => e[0] === 'rc_opened')))
  ok('rc_diff_completed with buckets', ev.some(([n, p]) => n === 'rc_diff_completed' && p.changes_bucket === '1-10'), JSON.stringify(ev.find((e) => e[0] === 'rc_diff_completed')))
  ok('rc_tour_started → steps → rc_tour_completed', names.includes('rc_tour_started') && names.at(-1) === 'rc_tour_completed', names.filter((n) => n.startsWith('rc_')).join(','))
  const blob = JSON.stringify(ev)
  ok('no event carries a file name or GlobalId', FORBIDDEN.every((s) => !blob.includes(s)) && !/\.ifc/i.test(blob))

  // Help → replay the tour.
  await page.locator('[data-testid="rc-help"]').click()
  await page.screenshot({ path: `${OUT}/desktop-help.png` })
  await page.locator('[data-testid="rc-help-tour"]').click()
  await page.locator('[role="dialog"][aria-modal="true"] h2').first().waitFor({ timeout: 5000 })
  ok('Help → replay starts the tour again', (await title(page))?.includes('nothing uploaded'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const ev2 = await page.evaluate(() => window.__phMock.map((e) => e[0]))
  ok('rc_help_clicked + rc_tour_dismissed', ev2.includes('rc_help_clicked') && ev2.at(-1) === 'rc_tour_dismissed', ev2.slice(-4).join(','))
  // Help → feedback opens the existing request form, with no call option.
  await page.locator('[data-testid="rc-help"]').click()
  await page.locator('[data-testid="rc-help-feedback"]').click()
  await page.waitForTimeout(1500)
  const txt = await page.evaluate(() => document.body.innerText)
  ok('feedback form opens without any call', !/call|llamada/i.test(txt.split('\n').filter((l) => /book|call/i.test(l)).join(' ')), '')
  await page.screenshot({ path: `${OUT}/desktop-feedback.png` })
  await ctx.close()
}

// ── PostHog blocked ──────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })
  const page = await open(ctx, { blockPosthog: true })
  await page.locator('[data-testid="rc-row"]').first().waitFor({ timeout: 300_000 })
  await page.locator('[role="dialog"][aria-modal="true"] h2').first().waitFor({ timeout: 30_000 })
  ok('with PostHog blocked the demo and tour still work', (await page.locator('[data-testid="rc-row"]').count()) === 5 && (await title(page))?.includes('nothing uploaded'))
  await ctx.close()
}

// ── Demo without tour: a one-line offer, no tour ─────────────────────────────
{
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/?compare=demo`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await page.locator('[data-testid="rc-row"]').first().waitFor({ timeout: 300_000 })
  await page.waitForTimeout(1500)
  const offer = await page.locator('[data-testid="rc-tour-offer"]').count()
  const dialogs = await page.locator('[role="dialog"][aria-modal="true"] h2').count()
  ok('?compare=demo alone offers the tour and does not start it', offer === 1 && dialogs === 0, `offer=${offer} tour=${dialogs}`)
  await page.screenshot({ path: `${OUT}/desktop-offer.png` })
  await ctx.close()
}

// ── Phone ────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await open(ctx)
  await page.locator('[data-testid="rc-card"]').first().waitFor({ timeout: 300_000 })
  await page.locator('[role="dialog"][aria-modal="true"] h2').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(2000)
  const seen = await walk(page, [1, 2, 4], 'phone')
  ok('phone: tour runs, steps without an anchor skipped', seen.length >= 4 && seen.at(-1)?.includes('own files'), seen.join(' | '))
  const names = await page.evaluate(() => window.__phMock.map((e) => e[0]))
  ok('phone: rc_tour_completed', names.includes('rc_tour_completed'), names.filter((n) => n.startsWith('rc_')).join(','))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
