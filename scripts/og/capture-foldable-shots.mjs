// Captures of the split layout, for the foldable article.
//
// The running viewer in headless Chrome with the Duplex sample. The two display
// segments are EMULATED by overriding window.viewport.segments before the app
// starts, the path the real API takes; the captions say so. No retouching.
//
// Usage:
//   node scripts/og/capture-foldable-shots.mjs [--url http://localhost:3297/]
//
// Output: public/blog/images/<name>.jpg and <name>-800.jpg

import { chromium } from 'playwright-core'

const argv = process.argv.slice(2)
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d }
const BASE = opt('url', 'http://localhost:3297/')
const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'public/blog/images'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SHOTS = [
  { name: 'foldable-ifc-viewer-book-posture', width: 1114, height: 720, segments: [[0, 0, 540, 720], [574, 0, 540, 720]] },
  { name: 'foldable-ifc-viewer-tabletop-posture', width: 720, height: 900, segments: [[0, 0, 720, 440], [0, 460, 720, 440]] },
]

const browser = await chromium.launch({
  executablePath: EXE,
  headless: false,
  args: ['--headless=new', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
})
try {
  for (const shot of SHOTS) {
    for (const scale of [2, 800 / shot.width]) {
      const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height }, deviceScaleFactor: scale, hasTouch: true, locale: 'en-GB' })
      await page.addInitScript((segments) => {
        window.viewport = { segments: segments.map(([x, y, width, height]) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height })) }
      }, shot.segments)
      const model = `${new URL(BASE).origin}/Ifc2x3_Duplex_Architecture.ifc`
      await page.goto(`${BASE}?model=${encodeURIComponent(model)}&lang=en`)
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-dual') && document.querySelector('canvas'), null, { timeout: 120_000 })
      // Loaded, not merely started: the progress card is gone and the model is in the tree.
      await page.waitForFunction(() => document.body.innerText.includes('Ifc2x3_Duplex_Architecture.ifc') && !document.body.innerText.includes('Creating the scene') && !document.body.innerText.includes('Elapsed'), null, { timeout: 180_000 })
      await sleep(12_000)
      // Close whatever the first visit opens, leaving the layout itself in the picture.
      await page.evaluate(() => { document.querySelectorAll('[aria-label="Contraer panel"],[aria-label="Collapse panel"]').forEach((b) => b.click()) })
      await sleep(2_000)
      const suffix = scale === 2 ? '' : '-800'
      await page.screenshot({ path: `${OUT}/${shot.name}${suffix}.jpg`, type: 'jpeg', quality: 86 })
      await page.close()
      console.log('[foldable-shots]', shot.name + suffix)
    }
  }
} finally {
  await browser.close()
}
