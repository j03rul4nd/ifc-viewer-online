// Build blog post cover images (rendered at 1800×945) for IFC Viewer Online.
//
// Standard articles use a deterministic branded HTML composition. Spatial
// articles use actual viewer / project captures with an honest source badge.
// This pipeline does not use generative AI.
//
// Output: public/blog/covers/<slug>.png
//
// Usage:
//   node scripts/og/build-blog-covers.mjs            # all posts
//   node scripts/og/build-blog-covers.mjs <slug>...  # specific slugs

import { chromium } from 'playwright-core'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const W = 1200, H = 630
const OUT = 'public/blog/covers'
const log = (...a) => console.log('[blog-covers]', ...a)

// ── Category palette ───────────────────────────────────────────────────────────
const CAT_COLORS = {
  'tool-guides':    { color: '#34d399', glow: '16,185,129' },
  'validation':     { color: '#f87171', glow: '239,68,68' },
  'best-practices': { color: '#818cf8', glow: '94,106,210' },
  'ifc-tips':       { color: '#67d7f0', glow: '103,215,240' },
  'standards':      { color: '#c084fc', glow: '192,132,252' },
  'digital-twins':  { color: '#22d3ee', glow: '34,211,238' },
}

// Category badge labels per language
const CAT_LABELS = {
  en: { 'tool-guides': 'TOOL GUIDES', 'validation': 'VALIDATION', 'best-practices': 'BEST PRACTICES', 'ifc-tips': 'IFC TIPS', 'standards': 'STANDARDS', 'digital-twins': 'DIGITAL TWINS' },
  es: { 'tool-guides': 'GUÍAS', 'validation': 'VALIDACIÓN', 'best-practices': 'BUENAS PRÁCTICAS', 'ifc-tips': 'CONSEJOS IFC', 'standards': 'ESTÁNDARES', 'digital-twins': 'GEMELOS DIGITALES' },
  de: { 'tool-guides': 'ANLEITUNGEN', 'validation': 'VALIDIERUNG', 'best-practices': 'BEST PRACTICES', 'ifc-tips': 'IFC-TIPPS', 'standards': 'NORMEN' },
  fr: { 'tool-guides': 'GUIDES OUTILS', 'validation': 'VALIDATION', 'best-practices': 'MEILLEURES PRATIQUES', 'ifc-tips': 'CONSEILS IFC', 'standards': 'NORMES' },
  pt: { 'tool-guides': 'GUIAS', 'validation': 'VALIDAÇÃO', 'best-practices': 'BOAS PRÁTICAS', 'ifc-tips': 'DICAS IFC', 'standards': 'NORMAS' },
  it: { 'tool-guides': 'GUIDE', 'validation': 'VALIDAZIONE', 'best-practices': 'BEST PRACTICE', 'ifc-tips': 'SUGGERIMENTI IFC', 'standards': 'STANDARD' },
  ca: { 'tool-guides': 'GUIES', 'validation': 'VALIDACIÓ', 'best-practices': 'BONES PRÀCTIQUES', 'ifc-tips': 'CONSELLS IFC', 'standards': 'ESTÀNDARDS' },
}

function catLabel(lang, cat) {
  return (CAT_LABELS[lang] || CAT_LABELS.en)[cat] || (CAT_LABELS.en[cat] || cat.toUpperCase())
}

// ── Category SVG icons (96×96 viewport) ───────────────────────────────────────
function catIcon(slug, color) {
  const sw = '1.6'
  const icons = {
    'tool-guides': `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>`,
    'validation': `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>`,
    'best-practices': `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <polyline points="3 18 5 20 9 16"/>
    </svg>`,
    'ifc-tips': `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>`,
    'standards': `<svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>`,
  }
  return icons[slug] || icons['tool-guides']
}

// ── All posts — source of truth is the same data used by the application ─────
const { ALL_BLOG_POSTS } = await import('../../src/lib/blog-posts.ts')
const ALL_POSTS = ALL_BLOG_POSTS.map((post) => ({
  slug: post.slug,
  lang: post.lang ?? 'en',
  title: post.title,
  cat: post.categorySlug,
  translationKey: post.translationKey,
}))

// These backgrounds are captures produced by the real repository pipeline,
// never generated images. The LiDAR capture is explicitly a simulated replay.
const REAL_CAPTURE_BY_KEY = {
  'ifc-point-cloud-scan-to-bim': {
    source: 'public/blog/images/scan-to-bim-ifc-point-cloud-alignment.jpg',
    publicCopy: 'cras-ifc-tls-point-cloud-real-alignment.jpg',
    badge: { en: 'REAL IFC + TLS DATA', es: 'DATOS IFC + TLS REALES' },
    shortTitle: 'IFC + POINT CLOUD',
  },
  'real-time-lidar-web-mcap': {
    source: 'docs/images/lidar-replay-demo.png',
    publicCopy: 'ifc-lidar-temporal-replay-real-viewer.png',
    badge: { en: 'ACTUAL VIEWER · SIMULATED REPLAY', es: 'VISOR REAL · REPLAY SIMULADO' },
    shortTitle: 'IFC + LIDAR REPLAY',
  },
  'ifc-video-3d-terrain': {
    source: 'docs/images/video-3d-demo.png',
    publicCopy: 'ifc-video-3d-placement-controls-real-viewer.png',
    badge: { en: 'ACTUAL IFC VIEWER CAPTURE', es: 'CAPTURA REAL DEL VISOR IFC' },
    shortTitle: 'IFC + 3D VIDEO',
  },
  'warehouse-ifc-moving-lidar-digital-twin': {
    source: 'docs/images/warehouse-ifc-moving-lidar-real-viewer.png',
    publicCopy: 'warehouse-ifc-moving-lidar-real-viewer.png',
    badge: { en: 'ACTUAL VIEWER · SIMULATED MOTION', es: 'VISOR REAL · MOVIMIENTO SIMULADO' },
    shortTitle: 'WAREHOUSE IFC + LIDAR',
  },
  'construction-progress-ifc-temporal-point-cloud': {
    source: 'docs/images/construction-progress-ifc-lidar-real-viewer.png',
    publicCopy: 'construction-progress-ifc-lidar-real-viewer.png',
    badge: { en: 'ACTUAL VIEWER · 4D REPLAY', es: 'VISOR REAL · REPLAY 4D' },
    shortTitle: '4D IFC + POINT CLOUD',
  },
  'utility-tunnel-ifc-mobile-lidar-inspection': {
    source: 'docs/images/utility-tunnel-ifc-lidar-real-viewer.png',
    publicCopy: 'utility-tunnel-ifc-lidar-real-viewer.png',
    badge: { en: 'ACTUAL VIEWER · MOBILE LIDAR REPLAY', es: 'VISOR REAL · REPLAY LIDAR MÓVIL' },
    shortTitle: 'TUNNEL IFC + MOBILE LIDAR',
  },
}

// ── HTML template ──────────────────────────────────────────────────────────────
function coverHtml({ slug, lang, title, cat }) {
  const c = CAT_COLORS[cat] || CAT_COLORS['tool-guides']
  const label = catLabel(lang, cat)
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const len = title.length
  const fs  = len <= 38 ? 60 : len <= 52 ? 52 : len <= 68 ? 44 : len <= 84 ? 37 : 31

  return `<!doctype html><html><head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:'Inter',system-ui,sans-serif;background:#0A0A0C;color:#fff;position:relative}
.glow{position:absolute;inset:0;background:
  radial-gradient(780px 650px at 92% 50%, rgba(${c.glow},.17), transparent 62%),
  radial-gradient(380px 350px at 6% 88%,  rgba(${c.glow},.09), transparent 58%)}
.grid{position:absolute;inset:0;opacity:.035;
  background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
  background-size:44px 44px;
  -webkit-mask-image:radial-gradient(ellipse 80% 65% at 30% 50%,#000,transparent 80%);
  mask-image:radial-gradient(ellipse 80% 65% at 30% 50%,#000,transparent 80%)}
.wrap{position:relative;height:100%;display:flex;align-items:center;padding:60px 56px 60px 72px;gap:44px}
.left{flex:1;display:flex;flex-direction:column;min-width:0}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:34px}
.logo{width:36px;height:36px;border-radius:9px;background:#5E6AD2;display:flex;align-items:center;justify-content:center;
  box-shadow:0 5px 16px rgba(94,106,210,.5)}
.brandname{font-size:15.5px;font-weight:700;color:#7a84d8;letter-spacing:-.01em}
.cat{display:inline-flex;align-items:center;font-family:monospace;font-size:9px;font-weight:700;
  letter-spacing:.15em;color:${c.color};
  background:rgba(${c.glow},.10);border:1px solid rgba(${c.glow},.28);
  padding:5px 12px;border-radius:999px;width:fit-content;margin-bottom:20px}
h1{font-size:${fs}px;line-height:1.09;font-weight:800;letter-spacing:-.025em;color:#edeef2;
  max-width:680px;margin-bottom:32px;word-break:break-word}
.url{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:rgba(${c.glow},.85)}
.dot{width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 7px #4ade80;flex-shrink:0}
.right{width:252px;height:252px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.icon-ring{width:230px;height:230px;border-radius:34px;
  background:rgba(${c.glow},.055);border:1px solid rgba(${c.glow},.18);
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 20px 56px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.025) inset,
             0 0 70px rgba(${c.glow},.07)}
</style>
</head><body>
<div class="glow"></div>
<div class="grid"></div>
<div class="wrap">
  <div class="left">
    <div class="brand">
      <div class="logo">
        <svg width="19" height="19" viewBox="0 0 32 32">
          <path d="M8 22 L16 8 L24 22 Z M12 22 L16 15 L20 22" stroke="white" stroke-width="1.9" fill="none"/>
        </svg>
      </div>
      <span class="brandname">IFC Viewer Online</span>
    </div>
    <div class="cat">${esc(label)}</div>
    <h1>${esc(title)}</h1>
    <div class="url"><span class="dot"></span>www.ifcvieweronline.eu</div>
  </div>
  <div class="right">
    <div class="icon-ring">${catIcon(cat, c.color)}</div>
  </div>
</div>
</body></html>`
}

function imageDataUrl(file) {
  const mime = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`
}

function realCoverHtml(post, width, height, overrideTitle) {
  const capture = REAL_CAPTURE_BY_KEY[post.translationKey]
  if (!capture) return coverHtml(post)

  const title = overrideTitle ?? post.title
  const badge = capture.badge[post.lang] ?? capture.badge.en
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const horizontal = width / height > 1.25
  const titleSize = Math.round(horizontal
    ? Math.max(38, Math.min(72, width * 0.048))
    : Math.max(42, Math.min(68, width * 0.055)))
  const pad = Math.round(Math.max(34, width * 0.055))
  const brandSize = Math.round(Math.max(15, width * 0.016))
  const badgeSize = Math.round(Math.max(11, width * 0.011))

  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${width}px;height:${height}px;overflow:hidden}
body{font-family:Inter,Segoe UI,Arial,sans-serif;background:#08090c;color:white;position:relative}
.photo{position:absolute;inset:0;background-image:url('${imageDataUrl(capture.source)}');background-size:cover;background-position:center}
.scrim{position:absolute;inset:0;background:
  linear-gradient(180deg,rgba(5,7,12,.38) 0%,rgba(5,7,12,.02) 34%,rgba(5,7,12,.2) 52%,rgba(5,7,12,.94) 100%),
  linear-gradient(90deg,rgba(5,7,12,.46) 0%,transparent 58%)}
.top{position:absolute;left:${pad}px;right:${pad}px;top:${Math.round(pad*.72)}px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.brand{display:flex;align-items:center;gap:12px;padding:10px 15px;border-radius:13px;background:rgba(8,9,14,.76);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);font-size:${brandSize}px;font-weight:800}
.logo{width:${Math.round(brandSize*1.9)}px;height:${Math.round(brandSize*1.9)}px;border-radius:9px;background:#5e6ad2;display:grid;place-items:center;font-size:${brandSize}px}
.badge{padding:9px 14px;border-radius:999px;background:rgba(8,9,14,.82);border:1px solid rgba(34,211,238,.48);color:#67e8f9;font:800 ${badgeSize}px/1.1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;text-align:center}
.content{position:absolute;left:${pad}px;right:${pad}px;bottom:${Math.round(pad*.78)}px}
h1{max-width:${horizontal ? '94%' : '100%'};font-size:${titleSize}px;line-height:1.04;letter-spacing:-.035em;font-weight:850;text-wrap:balance;text-shadow:0 3px 25px rgba(0,0,0,.9)}
.rule{width:${Math.round(Math.max(80,width*.09))}px;height:5px;border-radius:5px;background:#22d3ee;margin:0 0 ${Math.round(titleSize*.32)}px;box-shadow:0 0 24px rgba(34,211,238,.75)}
.url{margin-top:${Math.round(titleSize*.34)}px;font-size:${Math.round(Math.max(13,titleSize*.27))}px;font-weight:700;color:#d4d7e2;letter-spacing:.02em}
</style></head><body>
<div class="photo"></div><div class="scrim"></div>
<div class="top"><div class="brand"><span class="logo">△</span><span>IFC Viewer Online</span></div><div class="badge">${esc(badge)}</div></div>
<div class="content"><div class="rule"></div><h1>${esc(title)}</h1><div class="url">www.ifcvieweronline.eu · IFC · BIM · WebGL</div></div>
</body></html>`
}

async function renderImage(browser, html, out, width, height, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale })
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(80)
  const jpeg = /\.jpe?g$/i.test(out)
  await page.screenshot({
    path: out,
    type: jpeg ? 'jpeg' : 'png',
    quality: jpeg ? 88 : undefined,
    clip: { x: 0, y: 0, width, height },
  })
  await ctx.close()
}

// ── Main ───────────────────────────────────────────────────────────────────────
const wanted = process.argv.slice(2)
const posts  = wanted.length
  ? ALL_POSTS.filter(p => wanted.includes(p.slug))
  : ALL_POSTS

mkdirSync(OUT, { recursive: true })
mkdirSync('public/blog/images', { recursive: true })

for (const capture of Object.values(REAL_CAPTURE_BY_KEY)) {
  copyFileSync(capture.source, `public/blog/images/${capture.publicCopy}`)
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'],
})

for (const post of posts) {
  const out = `${OUT}/${post.slug}.png`
  try {
    const real = REAL_CAPTURE_BY_KEY[post.translationKey]
    await renderImage(browser, real ? realCoverHtml(post, W, H) : coverHtml(post), out, W, H, 1.5)
    if (real) {
      for (const [width, height] of [[1600, 900], [1200, 900], [1200, 1200], [800, 450]]) {
        const variant = `public/blog/images/${post.slug}-${width}x${height}.jpg`
        await renderImage(browser, realCoverHtml(post, width, height), variant, width, height)
      }
    }
    log(`✓  ${post.slug}`)
  } catch (e) {
    log(`✗  ${post.slug}:`, e.message.slice(0, 100))
  }
}

// Keep the previously published shared URLs alive, but replace their former
// conceptual artwork with covers made from the actual captures above.
const LEGACY_BASE_BY_KEY = {
  'ifc-point-cloud-scan-to-bim': 'ifc-point-cloud-scan-to-bim',
  'real-time-lidar-web-mcap': 'real-time-lidar-digital-twin',
  'ifc-video-3d-terrain': 'ifc-video-3d-terrain',
}
for (const [translationKey, legacyBase] of Object.entries(LEGACY_BASE_BY_KEY)) {
  const capture = REAL_CAPTURE_BY_KEY[translationKey]
  const post = ALL_POSTS.find((candidate) => candidate.translationKey === translationKey)
  if (!post || !capture) continue
  for (const [width, height] of [[1600, 900], [1200, 900], [1200, 1200], [800, 450]]) {
    await renderImage(
      browser,
      realCoverHtml(post, width, height, capture.shortTitle),
      `public/blog/images/${legacyBase}-${width}x${height}.jpg`,
      width,
      height,
    )
  }
}

await browser.close()
log(`done (${posts.length} covers → ${OUT}/)`)
