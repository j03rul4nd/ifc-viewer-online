// Real captures of the viewer and the model checker, for the comparison posts,
// the checker pillar and the /fix/ hub.
//
// Every image is the running app in headless Chrome at 1600×900, driven
// through its own interface: a sample IFC opened by URL, validation run,
// an issue stepped to, the export dialog, an IDS sample checked. Nothing is
// drawn or retouched.
//
// Needs the dev server (the __ifcViewer handle exists in dev only).
//
// Usage:
//   node scripts/og/capture-checker-shots.mjs [--url http://localhost:3327/] [--out public/blog/images] [name…]
//
// Output: <out>/<name>.jpg (1600×900) and <name>-800.jpg; heroes are
// <name>-1600x900.jpg and <name>-800x450.jpg

import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d }
const BASE = opt('url', 'http://localhost:3327/')
const OUT = opt('out', 'public/blog/images')
const only = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')))
const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const log = (...a) => console.log('[checker-shots]', ...a)
const wants = (name) => only.length === 0 || only.includes(name)

const DUPLEX = '/Ifc2x3_Duplex_Architecture.ifc'
const POBLENOU = ['A', 'S', 'M'].map((d) => `/models/poblenou/BCN-IVO-ZZ-XX-M3-${d}-0001.ifc`)

mkdirSync(OUT, { recursive: true })

async function save(page, name) {
  const buf = await page.screenshot({ type: 'jpeg', quality: 86 })
  writeFileSync(`${OUT}/${name}.jpg`, buf)
  // The 800-wide variant, scaled by the browser.
  const small = await page.evaluate(async (dataUrl) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 800; c.height = Math.round((img.height / img.width) * 800)
    const g = c.getContext('2d')
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.84)
  }, `data:image/jpeg;base64,${buf.toString('base64')}`)
  // A hero is `<name>-1600x900` and its cut `<name>-800x450` (src/lib/blog-hero.ts).
  const smallName = name.endsWith('-1600x900') ? name.replace(/-1600x900$/, '-800x450') : `${name}-800`
  writeFileSync(`${OUT}/${smallName}.jpg`, Buffer.from(small.split(',')[1], 'base64'))
  log('saved', name)
}

const iso = (page, fill = 0.8) => page.evaluate((f) => { globalThis.__ifcViewer.setCameraPreset('iso', { fill: f, animate: false }) }, fill)

/** Open models by URL and wait until the checker has scored them. */
async function open(page, models) {
  await page.goto(`${BASE}?lang=en&model=${models.join(',')}&view=iso`, { waitUntil: 'commit', timeout: 180_000 })
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.waitForFunction(() => /Re-validate/.test(document.body.innerText), null, { timeout: 120_000, polling: 1000 })
      break
    } catch {
      // A stalled run offers "Retry".
      await page.getByRole('button', { name: 'Retry' }).first().click({ timeout: 3000 }).catch(() => {})
    }
  }
  await page.waitForTimeout(1500)
  // The early-access notice is not part of the tool.
  await page.getByRole('button', { name: 'Dismiss' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.waitForTimeout(500)
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: false,
  args: ['--headless=new', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
})

/** Run one of the IDS samples of the dialog and wait for its result. */
async function runIdsSample(page, sample) {
  const done = () => page.waitForFunction(() => /\d+ Validated/.test(document.querySelector('[role=dialog]')?.innerText ?? '') && !/Checking|re-run with the current file/i.test(document.querySelector('[role=dialog]')?.innerText ?? ''), null, { timeout: 90_000, polling: 1000 })
  await page.getByText(sample, { exact: true }).click({ noWaitAfter: true, timeout: 60_000 }).catch(() => {})
  for (let attempt = 0; attempt < 4; attempt++) {
    try { await done(); return } catch {
      log('ids: no result yet —', (await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText.replace(/\s+/g, ' ').slice(0, 160) ?? 'no dialog')))
      await page.getByRole('button', { name: /^(Run check|Re-run check)$/ }).click({ noWaitAfter: true, timeout: 5000 }).catch(() => {})
    }
  }
  throw new Error(`IDS sample "${sample}" never finished`)
}

const DUPLEX_SHOTS = [
  'ifc-model-checker-open-ifc-file-health-score', 'ifc-model-checker-health-score-issue-in-3d', 'ifc-model-checker-spaces-missing-floor-area-1600x900', 'ifc-model-checker-missing-material-selected-1600x900',
  'ifc-validation-errors-by-rule', 'ifc-validation-errors-how-to-fix-per-tool', 'ifc-validation-errors-list-fix-guide', 'ifc-validation-report-export-formats',
]
const FEDERATED_SHOTS = ['ifc-viewer-online-federated-models-properties-1600x900', 'ifc-viewer-online-model-tree-quantities']

/** Select an element of the nth ranked issue and frame the whole model. */
async function selectIssue(page, nth, steps) {
  await page.locator('[data-testid="show-3d-chip"]').nth(nth).click()
  await page.waitForTimeout(1500)
  for (let i = 0; i < steps; i++) { await page.mouse.click(1132, 75); await page.waitForTimeout(600) }
  await page.waitForTimeout(2000)
  await iso(page)
  await page.waitForTimeout(2000)
}

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, locale: 'en-GB' })

  // ── The checker, on the buildingSMART duplex sample ────────────────────────
  if (DUPLEX_SHOTS.some(wants)) {
    await open(page, [DUPLEX])
    // What the checker shows as soon as the file is open: the score and what to fix first.
    if (wants('ifc-model-checker-open-ifc-file-health-score')) await save(page, 'ifc-model-checker-open-ifc-file-health-score')

    // An element of the first ranked issue: selected in 3D, properties open.
    await selectIssue(page, 0, 3)
    if (wants('ifc-model-checker-health-score-issue-in-3d')) await save(page, 'ifc-model-checker-health-score-issue-in-3d')
    // And of the second one (spaces with no floor area).
    await selectIssue(page, 1, 2)
    if (wants('ifc-model-checker-spaces-missing-floor-area-1600x900')) await save(page, 'ifc-model-checker-spaces-missing-floor-area-1600x900')
    // And of the third (elements with no material).
    await selectIssue(page, 2, 2)
    if (wants('ifc-model-checker-missing-material-selected-1600x900')) await save(page, 'ifc-model-checker-missing-material-selected-1600x900')

    // The issue list: every failing rule, then two of them open with their fix.
    await page.getByRole('button', { name: 'Maximize panel' }).click()
    await page.waitForTimeout(1200)
    if (wants('ifc-validation-errors-by-rule')) await save(page, 'ifc-validation-errors-by-rule')
    // Rule rows of the maximized list: the first at y 618, the second at y 648.
    await page.mouse.click(420, 618)
    await page.waitForTimeout(1200)
    if (wants('ifc-validation-errors-how-to-fix-per-tool')) await save(page, 'ifc-validation-errors-how-to-fix-per-tool')
    await page.mouse.click(420, 618)
    await page.waitForTimeout(800)
    await page.mouse.click(450, 648)
    await page.waitForTimeout(1200)
    if (wants('ifc-validation-errors-list-fix-guide')) await save(page, 'ifc-validation-errors-list-fix-guide')
    await page.getByRole('button', { name: 'Restore panel' }).click()
    await page.waitForTimeout(800)

    // Export formats.
    await page.getByRole('button', { name: 'Export' }).last().click()
    await page.waitForTimeout(1800)
    if (wants('ifc-validation-report-export-formats')) await save(page, 'ifc-validation-report-export-formats')
    await page.keyboard.press('Escape')
  }

  // ── IDS: a sample this model passes, and one it fails ─────────────────────
  // Each on a freshly opened model: a second run in the same dialog is not reliable.
  for (const [name, sample] of [['ifc-ids-check-sample-result', 'Doors named & rated'], ['ifc-ids-check-walls-fire-rating-result', 'Walls fire rating']]) {
    if (!wants(name)) continue
    await open(page, [DUPLEX])
    await page.getByRole('button', { name: 'Check' }).first().click()
    await page.waitForTimeout(800)
    await page.getByText('Check against IDS…').click()
    await page.waitForTimeout(1500)
    await runIdsSample(page, sample)
    await page.waitForTimeout(800)
    await save(page, name)
  }

  // ── Three discipline models of one building ────────────────────────────────
  if (FEDERATED_SHOTS.some(wants)) {
    await open(page, POBLENOU)
    await page.waitForTimeout(3000)
    for (let i = 0; i < 3; i++) {
      if (await page.getByRole('button', { name: 'Collapse panel' }).isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Collapse panel' }).click({ timeout: 5000 }).catch(() => {})
      }
      await page.waitForTimeout(1500)
      if (!(await page.getByText('Re-validate').first().isVisible().catch(() => false))) break
    }
    await iso(page, 0.75)
    await page.waitForTimeout(2500)
    // Pick whatever is in the middle of the view.
    await page.mouse.click(780, 430)
    await page.waitForTimeout(2000)
    // The properties panel may be folded away on a fresh profile.
    if (!(await page.getByText('IFC ATTRIBUTES').first().isVisible().catch(() => false))) {
      await page.mouse.click(1567, 121) // the Properties button of the right rail
      await page.waitForTimeout(1500)
    }
    if (wants('ifc-viewer-online-federated-models-properties-1600x900')) await save(page, 'ifc-viewer-online-federated-models-properties-1600x900')
    // Another element, with its quantity set open.
    await page.mouse.click(900, 560)
    await page.waitForTimeout(2500)
    await page.getByText(/^Qto_/).first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1500)
    if (wants('ifc-viewer-online-model-tree-quantities')) await save(page, 'ifc-viewer-online-model-tree-quantities')
  }
} finally {
  await browser.close()
}
