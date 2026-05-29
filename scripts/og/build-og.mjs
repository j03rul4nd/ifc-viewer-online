// Build the Open Graph / social-share image (1200×630) for IFC Viewer Online.
//
// Honors the brand rule "confianza sin hipérbole": the card embeds a REAL
// screenshot of the running app (demo model + live validation), not a mockup.
//
// Pipeline (mirrors scripts/gif/*): system Chrome via playwright-core.
//   1. Open the real app, load the demo model, run validation, screenshot it.
//   2. Render an on-brand 1200×630 HTML card that insets that real screenshot.
//   3. Screenshot the card → public/og-image.png
//
// Usage:
//   node scripts/og/build-og.mjs
// Env:
//   CHROME_EXE  path to chrome.exe   (default: standard Windows install)
//   APP_URL     running dev/preview URL (default: http://localhost:3002/ifc-viewer-online/)
//   OG_OUT      output PNG path      (default: public/og-image.png)

import { chromium } from 'playwright-core'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.APP_URL || 'http://localhost:3002/ifc-viewer-online/'
const OUT = process.env.OG_OUT || 'public/og-image.png'
const SHOT = 'scripts/og/app-shot.png'

const W = 1200, H = 630
const log = (...a) => console.log('[og]', ...a)

mkdirSync('scripts/og', { recursive: true })
mkdirSync(dirname(OUT), { recursive: true })

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'],
})

// ── 1. Capture a real screenshot of the app: demo model + validation ──────────
async function captureApp() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log('pageerror', e.message.slice(0, 140)))
  await page.addInitScript(() => { try { localStorage.setItem('ifc-locale', 'en') } catch {} })

  log('opening app', URL)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)

  log('loading demo model')
  await page.getByRole('button', { name: /demo/i }).first().click({ timeout: 10000 })
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(700)
    const ok = await page.evaluate(() => !!document.querySelector('canvas') && /loaded/i.test(document.body.innerText))
    if (ok && i > 3) break
  }
  await page.waitForTimeout(1500)

  // run validation so the Health Score + issues are visible
  try {
    await page.getByRole('button', { name: /^validate$/i }).first().click({ timeout: 8000 })
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(600)
      const done = await page.evaluate(() => /\d{1,3}\s*\/\s*100|health/i.test(document.body.innerText))
      if (done) break
    }
  } catch (e) { log('validation step skipped:', e.message.slice(0, 80)) }
  await page.waitForTimeout(1200)

  await page.screenshot({ path: SHOT })
  log('app screenshot →', SHOT)
  await ctx.close()
}

// ── 2 + 3. Render the branded card and screenshot it ──────────────────────────
async function buildCard() {
  const shotData = readFileSync(SHOT)
  const shotB64 = `data:image/png;base64,${shotData.toString('base64')}`

  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.setContent(cardHtml(shotB64), { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } })
  log('og image →', OUT, `(${W}×${H})`)
  await ctx.close()
}

function cardHtml(shotB64) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{font-family:'Inter',system-ui,sans-serif;background:#0A0A0C;color:#fff;position:relative}
  .glow{position:absolute;inset:0;background:
    radial-gradient(900px 500px at 78% 18%, rgba(94,106,210,.28), transparent 60%),
    radial-gradient(700px 500px at 12% 95%, rgba(94,106,210,.14), transparent 55%);}
  .grid{position:absolute;inset:0;opacity:.05;background-image:
    linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
    background-size:48px 48px;mask-image:linear-gradient(180deg,#000,transparent 75%)}
  .wrap{position:relative;height:100%;display:grid;grid-template-columns:1fr 1fr;gap:0}
  .left{padding:64px 0 64px 72px;display:flex;flex-direction:column;justify-content:center}
  .brand{display:flex;align-items:center;gap:14px;margin-bottom:30px}
  .logo{width:52px;height:52px;border-radius:13px;background:#5E6AD2;display:flex;align-items:center;justify-content:center;
    box-shadow:0 8px 28px rgba(94,106,210,.5)}
  .brandname{font-size:23px;font-weight:700;letter-spacing:-.01em}
  .brandname span{color:#9aa3ec}
  h1{font-size:55px;line-height:1.04;font-weight:800;letter-spacing:-.025em;margin-bottom:22px}
  h1 .hl{background:linear-gradient(90deg,#8b95f0,#5E6AD2);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{font-size:22px;line-height:1.4;color:#b9bdc9;font-weight:400;max-width:520px;margin-bottom:30px}
  .chips{display:flex;flex-wrap:wrap;gap:11px;margin-bottom:30px}
  .chip{font-size:16px;font-weight:500;color:#d7dae3;background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.10);padding:9px 15px;border-radius:999px}
  .chip b{color:#fff;font-weight:600}
  .url{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600;color:#9aa3ec}
  .dot{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 10px #4ade80}
  .right{position:relative;display:flex;align-items:center;justify-content:center;padding-right:40px}
  .shot{width:560px;height:auto;max-height:480px;object-fit:cover;object-position:left top;
    border-radius:16px;border:1px solid rgba(255,255,255,.12);
    box-shadow:0 30px 80px rgba(0,0,0,.6);transform:perspective(1600px) rotateY(-9deg) rotateX(2deg)}
  .badge{position:absolute;top:78px;right:64px;background:rgba(10,10,12,.82);backdrop-filter:blur(8px);
    border:1px solid rgba(94,106,210,.4);border-radius:14px;padding:14px 18px;text-align:center;
    box-shadow:0 12px 36px rgba(0,0,0,.5)}
  .badge .n{font-size:34px;font-weight:800;color:#4ade80;line-height:1}
  .badge .l{font-size:12px;font-weight:600;color:#b9bdc9;letter-spacing:.06em;text-transform:uppercase;margin-top:5px}
  </style></head><body>
  <div class="glow"></div><div class="grid"></div>
  <div class="wrap">
    <div class="left">
      <div class="brand">
        <div class="logo"><svg width="30" height="30" viewBox="0 0 32 32"><path d="M8 22 L16 8 L24 22 Z M12 22 L16 15 L20 22" stroke="white" stroke-width="1.6" fill="none"/></svg></div>
        <div class="brandname">IFC Viewer <span>Online</span></div>
      </div>
      <h1>View &amp; validate<br>IFC models <span class="hl">in your browser</span></h1>
      <div class="sub">Free BIM viewer, validator &amp; editor. No upload, no install — your models never leave your device.</div>
      <div class="chips">
        <div class="chip"><b>100%</b> private</div>
        <div class="chip"><b>38</b> validation rules</div>
        <div class="chip"><b>Health Score</b> 0–100</div>
      </div>
      <div class="url"><span class="dot"></span>j03rul4nd.github.io/ifc-viewer-online</div>
    </div>
    <div class="right">
      <img class="shot" src="${shotB64}" alt="app"/>
    </div>
  </div>
  </body></html>`
}

await captureApp()
await buildCard()
await browser.close()
log('done')
