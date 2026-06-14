// Build localized Open Graph / social-share images (1200×630) for IFC Viewer Online.
//
// One card PER language. Each card combines:
//   • Translated marketing copy (headline, subtitle, value chips).
//   • A REAL screenshot of the app running IN THAT LANGUAGE (demo model + live
//     validation), so e.g. a Thai share preview shows the actual Thai UI.
// This honors the brand rule "confianza sin hipérbole" — no mockups — and turns
// the social preview into a localized differentiator.
//
// Pipeline (mirrors scripts/gif/*): system Chrome via playwright-core.
//   For each locale:
//     1. Set localStorage ifc-locale, open the app, load demo, run validation.
//     2. Screenshot the running app  → scripts/og/app-shot-<code>.png
//     3. Render an on-brand 1200×630 HTML card insetting that screenshot,
//        with the correct font for CJK/Thai → public/og-image-<code>.png
//   Finally copy the EN card to public/og-image.png (the default referenced
//   by the root index.html).
//
// Usage:
//   node scripts/og/build-og.mjs            # all locales
//   node scripts/og/build-og.mjs zh ja th   # only the given locales
// Env:
//   CHROME_EXE  path to chrome.exe   (default: standard Windows install)
//   APP_URL     running dev/preview URL (default: http://localhost:3002/ifc-viewer-online/)

import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, copyFileSync, existsSync } from 'node:fs'

// Read the localized button labels straight from the app's i18n JSON so the
// captures work in every UI language without hardcoding fragile regexes.
// The "Launch" / "Open viewer" CTAs both call onLaunch, which loads the default
// demo model into the viewer — that's the one-click path the OG capture needs.
function localeStrings(code) {
  const read = (ns) => JSON.parse(readFileSync(`src/locales/${code}/${ns}.json`, 'utf8'))
  let launch = '', openViewer = '', validate = ''
  try { const a = read('landing').actions; launch = a.launch || ''; openViewer = a.openViewer || '' } catch {}
  try { validate = read('toolbar').validate } catch {}
  return { launch, openViewer, validate }
}

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.APP_URL || 'http://localhost:3002/ifc-viewer-online/'
const W = 1200, H = 630
const DIR = 'scripts/og'
const PUB = 'public'

// ── Per-locale copy + font ─────────────────────────────────────────────────────
// title   : main headline (plain)         accent : highlighted tail phrase
// noto    : extra Google font for non-Latin scripts (Latin locales omit it)
const LOCALES = {
  en: {
    title: 'View & validate IFC models', accent: 'in your browser',
    sub: 'Free BIM viewer, validator & editor. Your models never leave your device.',
    chips: ['100% private', '38 validation rules', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — view and validate IFC models in the browser',
  },
  es: {
    title: 'Visualiza y valida modelos IFC', accent: 'en tu navegador',
    sub: 'Visor, validador y editor BIM gratis. Tus modelos nunca salen de tu dispositivo.',
    chips: ['100% privado', '38 reglas de validación', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — visualiza y valida modelos IFC en el navegador',
  },
  fr: {
    title: 'Visualisez et validez vos modèles IFC', accent: 'dans votre navigateur',
    sub: 'Visionneuse, validateur et éditeur BIM gratuits. Vos modèles ne quittent jamais votre appareil.',
    chips: ['100% privé', '38 règles de validation', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — visualisez et validez vos modèles IFC dans le navigateur',
  },
  de: {
    title: 'IFC-Modelle ansehen und prüfen', accent: 'im Browser',
    sub: 'Kostenloser BIM-Viewer, Validator & Editor. Ihre Modelle verlassen nie Ihr Gerät.',
    chips: ['100% privat', '38 Prüfregeln', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — IFC-Modelle im Browser ansehen und prüfen',
  },
  pt: {
    title: 'Visualize e valide modelos IFC', accent: 'no seu navegador',
    sub: 'Visualizador, validador e editor BIM grátis. Seus modelos nunca saem do seu dispositivo.',
    chips: ['100% privado', '38 regras de validação', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — visualize e valide modelos IFC no navegador',
  },
  it: {
    title: 'Visualizza e valida modelli IFC', accent: 'nel tuo browser',
    sub: 'Visualizzatore, validatore ed editor BIM gratuiti. I tuoi modelli non lasciano mai il dispositivo.',
    chips: ['100% privato', '38 regole di validazione', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — visualizza e valida modelli IFC nel browser',
  },
  ca: {
    title: 'Visualitza i valida models IFC', accent: 'al teu navegador',
    sub: 'Visor, validador i editor BIM gratuït. Els teus models mai surten del dispositiu.',
    chips: ['100% privat', '38 regles de validació', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — visualitza i valida models IFC al navegador',
  },
  zh: {
    title: '查看并校验 IFC 模型', accent: '就在浏览器中',
    sub: '免费的 BIM 查看器、校验器和编辑器。您的模型绝不离开本地设备。',
    chips: ['100% 私密', '38 条校验规则', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — 在浏览器中查看并校验 IFC 模型',
    noto: 'Noto+Sans+SC', notoFamily: 'Noto Sans SC',
  },
  ja: {
    title: 'IFCモデルを表示・検証', accent: 'ブラウザだけで',
    sub: '無料のBIMビューア・検証・編集ツール。モデルが端末から外に出ることはありません。',
    chips: ['100% プライベート', '38の検証ルール', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — ブラウザでIFCモデルを表示・検証',
    noto: 'Noto+Sans+JP', notoFamily: 'Noto Sans JP',
  },
  th: {
    title: 'ดูและตรวจสอบโมเดล IFC', accent: 'ในเบราว์เซอร์ของคุณ',
    sub: 'โปรแกรมดู ตรวจสอบ และแก้ไข BIM ฟรี โมเดลของคุณไม่ออกจากอุปกรณ์เลย',
    chips: ['ส่วนตัว 100%', 'กฎตรวจสอบ 38 ข้อ', 'Health Score 0–100'],
    alt: 'IFC Viewer Online — ดูและตรวจสอบโมเดล IFC ในเบราว์เซอร์',
    noto: 'Noto+Sans+Thai', notoFamily: 'Noto Sans Thai',
  },
}

const wanted = process.argv.slice(2).filter((a) => LOCALES[a])
const codes = wanted.length ? wanted : Object.keys(LOCALES)
const log = (...a) => console.log('[og]', ...a)

mkdirSync(DIR, { recursive: true })

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'],
})

// ── 1+2. Capture a real screenshot of the app running in `code` ───────────────
async function captureApp(code) {
  const shot = `${DIR}/app-shot-${code}.png`
  // Re-render only the branded card (e.g. to update the URL / branding) by
  // reusing the previously captured app screenshot — no running app needed.
  //   REUSE_APP_SHOT=1 npm run og
  if (process.env.REUSE_APP_SHOT && existsSync(shot)) {
    log(code, 'reusing existing app shot (REUSE_APP_SHOT)')
    return shot
  }
  const { launch, openViewer, validate } = localeStrings(code)
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log(code, 'pageerror', e.message.slice(0, 120)))
  await page.addInitScript((loc) => { try { localStorage.setItem('ifc-locale', loc) } catch {} }, code)

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)

  // Click the CTA that loads the default demo model (onLaunch). Try the
  // localized "Launch" then "Open viewer" labels; fall back to a broad regex.
  const candidates = [launch, openViewer].filter(Boolean)
  let clicked = false
  for (const name of candidates) {
    try {
      await page.getByRole('button', { name, exact: true }).first().click({ timeout: 8000 })
      clicked = true
      break
    } catch { /* try next label */ }
  }
  if (!clicked) {
    await page.getByRole('button', { name: /launch|viewer|demo/i }).first().click({ timeout: 10000 })
  }
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(700)
    const ok = await page.evaluate(() => !!document.querySelector('canvas') &&
      !/^\s*$/.test(document.body.innerText))
    if (ok && i > 4) break
  }
  await page.waitForTimeout(1500)

  // run validation so the Health Score is visible regardless of UI language
  try {
    const valBtn = validate
      ? page.getByRole('button', { name: validate, exact: true })
      : page.getByRole('button', { name: /validate/i })
    await valBtn.first().click({ timeout: 8000 })
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(600)
      const done = await page.evaluate(() => /\d{1,3}\s*\/\s*100|health/i.test(document.body.innerText))
      if (done) break
    }
  } catch (e) { log(code, 'validation step skipped:', e.message.slice(0, 70)) }
  await page.waitForTimeout(1000)

  await page.screenshot({ path: shot })
  await ctx.close()
  log(code, 'app screenshot →', shot)
  return shot
}

// ── 3. Render the branded card and screenshot it ──────────────────────────────
async function buildCard(code, shotPath) {
  const out = `${PUB}/og-image-${code}.png`
  const shotB64 = `data:image/png;base64,${readFileSync(shotPath).toString('base64')}`
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.setContent(cardHtml(code, shotB64), { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(500)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } })
  await ctx.close()
  log(code, 'og image →', out, `(${W}×${H})`)
  return out
}

function cardHtml(code, shotB64) {
  const L = LOCALES[code]
  const fonts = ['Inter:wght@400;500;600;700;800', L.noto && `${L.noto}:wght@400;500;700;800`]
    .filter(Boolean).map((f) => `family=${f}`).join('&')
  const family = L.notoFamily ? `'${L.notoFamily}','Inter',system-ui,sans-serif` : `'Inter',system-ui,sans-serif`
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const chips = L.chips.map((c) => `<div class="chip">${esc(c)}</div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${fonts}&display=swap" rel="stylesheet">
  <style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{font-family:${family};background:#0A0A0C;color:#fff;position:relative}
  .glow{position:absolute;inset:0;background:
    radial-gradient(900px 500px at 78% 18%, rgba(94,106,210,.28), transparent 60%),
    radial-gradient(700px 500px at 12% 95%, rgba(94,106,210,.14), transparent 55%);}
  .grid{position:absolute;inset:0;opacity:.05;background-image:
    linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
    background-size:48px 48px;mask-image:linear-gradient(180deg,#000,transparent 75%)}
  .wrap{position:relative;height:100%;display:grid;grid-template-columns:1fr 1fr;gap:0}
  .left{padding:60px 0 60px 72px;display:flex;flex-direction:column;justify-content:center}
  .brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
  .logo{width:52px;height:52px;border-radius:13px;background:#5E6AD2;display:flex;align-items:center;justify-content:center;
    box-shadow:0 8px 28px rgba(94,106,210,.5)}
  .brandname{font-size:23px;font-weight:700;letter-spacing:-.01em}
  .brandname span{color:#9aa3ec}
  h1{font-size:50px;line-height:1.08;font-weight:800;letter-spacing:-.02em;margin-bottom:20px;max-width:540px}
  h1 .hl{background:linear-gradient(90deg,#8b95f0,#5E6AD2);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{font-size:21px;line-height:1.45;color:#b9bdc9;font-weight:400;max-width:520px;margin-bottom:28px}
  .chips{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:28px}
  .chip{font-size:16px;font-weight:600;color:#e7e9f0;background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.10);padding:9px 15px;border-radius:999px}
  .url{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600;color:#9aa3ec}
  .dot{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 10px #4ade80}
  .right{position:relative;display:flex;align-items:center;justify-content:center;padding-right:40px}
  .shot{width:560px;height:auto;max-height:480px;object-fit:cover;object-position:left top;
    border-radius:16px;border:1px solid rgba(255,255,255,.12);
    box-shadow:0 30px 80px rgba(0,0,0,.6);transform:perspective(1600px) rotateY(-9deg) rotateX(2deg)}
  </style></head><body>
  <div class="glow"></div><div class="grid"></div>
  <div class="wrap">
    <div class="left">
      <div class="brand">
        <div class="logo"><svg width="30" height="30" viewBox="0 0 32 32"><path d="M8 22 L16 8 L24 22 Z M12 22 L16 15 L20 22" stroke="white" stroke-width="1.6" fill="none"/></svg></div>
        <div class="brandname">IFC Viewer <span>Online</span></div>
      </div>
      <h1>${esc(L.title)} <span class="hl">${esc(L.accent)}</span></h1>
      <div class="sub">${esc(L.sub)}</div>
      <div class="chips">${chips}</div>
      <div class="url"><span class="dot"></span>www.ifcvieweronline.eu</div>
    </div>
    <div class="right"><img class="shot" src="${shotB64}" alt="app"/></div>
  </div>
  </body></html>`
}

for (const code of codes) {
  try {
    const shot = await captureApp(code)
    await buildCard(code, shot)
  } catch (e) {
    log(code, 'FAILED:', e.message.slice(0, 140))
  }
}

// default og-image.png = English card (referenced by root index.html)
if (codes.includes('en')) {
  copyFileSync(`${PUB}/og-image-en.png`, `${PUB}/og-image.png`)
  log('copied og-image-en.png → og-image.png (default)')
}

await browser.close()
log('done:', codes.join(', '))
