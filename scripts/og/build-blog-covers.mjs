// Build blog post cover images (1200×630) for IFC Viewer Online.
//
// Each card: branded header + category badge + post title + IFC Viewer URL,
// on a dark background with a category-coloured glow and abstract SVG art.
// No app screenshot needed — pure HTML → PNG via Playwright.
//
// Output: public/blog/covers/<slug>.png
//
// Usage:
//   node scripts/og/build-blog-covers.mjs            # all posts
//   node scripts/og/build-blog-covers.mjs <slug>...  # specific slugs

import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

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
}

// Category badge labels per language
const CAT_LABELS = {
  en: { 'tool-guides': 'TOOL GUIDES', 'validation': 'VALIDATION', 'best-practices': 'BEST PRACTICES', 'ifc-tips': 'IFC TIPS', 'standards': 'STANDARDS' },
  es: { 'tool-guides': 'GUÍAS', 'validation': 'VALIDACIÓN', 'best-practices': 'BUENAS PRÁCTICAS', 'ifc-tips': 'CONSEJOS IFC', 'standards': 'ESTÁNDARES' },
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

// ── All posts (with language for localized category labels) ───────────────────
const ALL_POSTS = [
  // EN
  { slug: 'view-ifc-online-free',               lang: 'en', title: 'View IFC Files in Your Browser — Free, No Installation',                               cat: 'tool-guides' },
  { slug: 'ifc-health-score-guide',             lang: 'en', title: 'What Is a BIM Health Check? The IFC Health Score Explained',                           cat: 'best-practices' },
  { slug: 'duplicate-guids-ifc',                lang: 'en', title: 'Duplicate GUIDs in IFC: The Silent Error That Breaks Everything',                      cat: 'validation' },
  { slug: 'ifc-vs-rvt-vs-nwd',                  lang: 'en', title: 'IFC, RVT, NWD, DWG: Which BIM File Format Should You Deliver?',                       cat: 'ifc-tips' },
  { slug: 'common-ifc-validation-errors',       lang: 'en', title: 'The 7 Most Common IFC Validation Errors (and How to Fix Them)',                        cat: 'validation' },
  { slug: 'ifc-health-score-explained',         lang: 'en', title: 'IFC Health Score: The Single Number Your BIM Team Needs',                             cat: 'best-practices' },
  { slug: 'clean-ifc-export-revit',             lang: 'en', title: 'How to Export Clean IFC Files from Revit: A Step-by-Step Guide',                      cat: 'tool-guides' },
  { slug: 'ifc2x3-vs-ifc4',                     lang: 'en', title: 'IFC2x3 vs IFC4: Should You Upgrade Your Export Schema?',                              cat: 'ifc-tips' },
  { slug: 'iso19650-ifc-checklist',             lang: 'en', title: 'ISO 19650 Compliance for IFC Deliveries: A Practical Checklist',                      cat: 'standards' },
  { slug: 'ifc-guids-changing-every-export',    lang: 'en', title: 'Why IFC GUIDs Change on Every Export (and How to Keep Them Stable)',                  cat: 'validation' },
  { slug: 'ifc-properties-missing-after-export',lang: 'en', title: 'IFC Properties Missing After Export From Revit? The Fix Checklist',                   cat: 'tool-guides' },
  { slug: 'how-to-validate-ifc-file',           lang: 'en', title: 'How to Validate an IFC File Before You Send It (Free, No Upload)',                    cat: 'validation' },
  { slug: 'large-ifc-file-browser-crash',       lang: 'en', title: 'Why Large IFC Files Crash Your Browser (and How to View a 1 GB Model)',               cat: 'tool-guides' },
  { slug: 'revit-ifc-export-breaks',            lang: 'en', title: 'Why Your Revit IFC Export Breaks (and How to Fix Each Cause)',                        cat: 'tool-guides' },
  { slug: 'ifc-quality-guide',                  lang: 'en', title: 'The Complete Guide to IFC Quality: From Export to Delivery',                          cat: 'best-practices' },
  { slug: 'ifc-coordinates-georeferencing',     lang: 'en', title: 'IFC Coordinates Are Wrong: Survey Point, Base Point & Georeferencing Explained',      cat: 'ifc-tips' },
  { slug: 'revit-archicad-ifc-roundtrip',       lang: 'en', title: 'Revit ↔ Archicad via IFC: The Round-Trip Problems Nobody Warns You About',           cat: 'ifc-tips' },
  { slug: 'free-online-ifc-viewers-compared',   lang: 'en', title: 'Free Online IFC Viewers Compared (2026): Privacy, Size Limits & Features',            cat: 'tool-guides' },
  { slug: 'reduce-ifc-file-size',               lang: 'en', title: 'How to Reduce IFC File Size (Without Breaking the Model)',                            cat: 'tool-guides' },
  { slug: 'read-ifc-property-sets-python',      lang: 'en', title: 'Read IFC Property Sets in Python with IfcOpenShell',                                  cat: 'ifc-tips' },
  { slug: 'view-ifc-web-threejs-fragments',     lang: 'en', title: 'How to View IFC in the Browser with three.js, web-ifc & Fragments',                  cat: 'tool-guides' },
  { slug: 'ifc-viewer-confidential-nda-projects',lang:'en', title: 'Can You Use an Online IFC Viewer with Confidential Project Data?',                    cat: 'best-practices' },
  { slug: 'gdpr-bim-ifc-data-guide',            lang: 'en', title: 'GDPR and BIM Data: What Every Project Manager Needs to Know (2026)',                  cat: 'best-practices' },
  { slug: 'bim-tool-it-security-checklist',     lang: 'en', title: 'The BIM Tool IT Security Checklist: 10 Questions Your IT Department Will Ask',        cat: 'best-practices' },
  // ES
  { slug: 'como-exportar-ifc-desde-revit',      lang: 'es', title: 'Cómo exportar un IFC limpio desde Revit: la guía definitiva',                        cat: 'tool-guides' },
  { slug: 'health-score-ifc-que-es',            lang: 'es', title: 'Health Score en IFC: el número que necesita tu proyecto BIM',                        cat: 'best-practices' },
  { slug: 'errores-ifc-mas-comunes',            lang: 'es', title: 'Los 7 errores IFC más comunes (y cómo corregirlos antes de la entrega)',              cat: 'validation' },
  { slug: 'ifc-vs-rvt-que-entregar',            lang: 'es', title: 'IFC vs RVT: ¿qué formato BIM debes entregar en tus proyectos?',                      cat: 'ifc-tips' },
  // DE
  { slug: 'ifc-datei-im-browser-oeffnen',       lang: 'de', title: 'IFC-Dateien im Browser öffnen — kostenlos, ohne Installation',                       cat: 'tool-guides' },
  { slug: 'ifc-validierung-haeufige-fehler',    lang: 'de', title: 'Die 5 häufigsten IFC-Fehler vor der CDE-Lieferung',                                  cat: 'validation' },
  // FR
  { slug: 'ouvrir-fichier-ifc-navigateur',      lang: 'fr', title: 'Ouvrir un fichier IFC dans le navigateur — gratuit, sans installation',              cat: 'tool-guides' },
]

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

// ── Main ───────────────────────────────────────────────────────────────────────
const wanted = process.argv.slice(2)
const posts  = wanted.length
  ? ALL_POSTS.filter(p => wanted.includes(p.slug))
  : ALL_POSTS

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb'],
})

for (const post of posts) {
  const out = `${OUT}/${post.slug}.png`
  try {
    const ctx  = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 })
    const page = await ctx.newPage()
    await page.setContent(coverHtml(post), { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready).catch(() => {})
    await page.waitForTimeout(300)
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } })
    await ctx.close()
    log(`✓  ${post.slug}`)
  } catch (e) {
    log(`✗  ${post.slug}:`, e.message.slice(0, 100))
  }
}

await browser.close()
log(`done (${posts.length} covers → ${OUT}/)`)
