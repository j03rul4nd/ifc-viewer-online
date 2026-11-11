// Captures of the split layout, for the foldable article.
//
// The running viewer in headless Chrome with the larger bundled models. The two
// display segments are EMULATED by overriding window.viewport.segments before
// the app starts, the path the real API takes; the captions say so. No retouching.
//
// Usage:
//   node scripts/og/capture-foldable-shots.mjs [--url http://localhost:3297/] [name…]
//
// Output: scripts/og/foldable-raw/<name>.jpg (build-foldable-mockups.mjs frames them)

import { chromium } from 'playwright-core'

const argv = process.argv.slice(2)
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d }
const BASE = opt('url', 'http://localhost:3297/')
const ONLY = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--url')
const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'scripts/og/foldable-raw'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const BOOK = { width: 1114, height: 720, segments: [[0, 0, 540, 720], [574, 0, 540, 720]], tap: [270, 380] }
const VELA = 'models/hotel-vela/BCN-IVO-ZZ-XX-M3-'

const SHOTS = [
  { ...BOOK, name: 'foldable-ifc-viewer-book-posture', models: [`${VELA}A-0002.ifc`] },
  { ...BOOK, name: 'foldable-ifc-viewer-federated-models', models: [`${VELA}A-0002.ifc`, `${VELA}S-0002.ifc`, `${VELA}M-0002.ifc`] },
  { ...BOOK, name: 'foldable-ifc-viewer-validation-second-screen', models: ['models/swfc/SHA-IVO-SWFC-A-0001.ifc'], keepDrawer: true },
  { name: 'foldable-ifc-viewer-tabletop-posture', width: 720, height: 900, segments: [[0, 0, 720, 440], [0, 460, 720, 440]], tap: [360, 230], models: ['models/oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc'] },
  { name: 'foldable-ifc-viewer-flip-format', width: 360, height: 840, segments: [[0, 0, 360, 400], [0, 440, 360, 400]], tap: [180, 210], models: ['models/helsinki/helsinki-central-station.ifc'] },
]

const browser = await chromium.launch({
  executablePath: EXE,
  headless: false,
  args: ['--headless=new', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
})
try {
  for (const shot of SHOTS) {
    if (ONLY.length && !ONLY.includes(shot.name)) continue
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height }, deviceScaleFactor: 2, hasTouch: true, locale: 'en-GB' })
    await page.addInitScript((segments) => {
      window.viewport = { segments: segments.map(([x, y, width, height]) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height })) }
    }, shot.segments)
    const origin = new URL(BASE).origin
    const query = shot.models.map((m) => `model=${encodeURIComponent(`${origin}/${m}`)}`).join('&')
    await page.goto(`${BASE}?${query}&lang=en`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-dual') && document.querySelector('canvas'), null, { timeout: 120_000 })
    const file = shot.models.at(-1).split('/').pop()
    await page.waitForFunction((f) => document.body.innerText.includes(f) && !document.body.innerText.includes('Elapsed'), file, { timeout: 400_000 })
    await sleep(15_000)
    if (!shot.keepDrawer) {
      await page.evaluate(() => { document.querySelectorAll('[aria-label="Collapse panel"]').forEach((b) => b.click()) })
      await sleep(1_500)
    }
    if (shot.tap) {
      await page.mouse.click(shot.tap[0], shot.tap[1])
      await sleep(3_000)
    }
    await page.screenshot({ path: `${OUT}/${shot.name}.jpg`, type: 'jpeg', quality: 88 })
    await page.close()
    console.log('[foldable-shots]', shot.name)
  }
} finally {
  await browser.close()
}
