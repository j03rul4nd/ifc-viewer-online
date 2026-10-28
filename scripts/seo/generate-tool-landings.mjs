// ─── generate-tool-landings ───────────────────────────────────────────────────
// Three tool landings × ten languages, written as static pages into public/
// (the same pattern as the hand-authored landings: public/<slug>/index.html).
//
//   editor          "free ifc editor", "ifc editor online", "ifc file editor"…
//   classification  "ifc classification checking", "bim property set validation"…
//   health          "model health check ifc", "pdf report ifc checking"…
//
// Topics and wording come from Search Console (3 months to 2026-10-24): each
// group had ~1.2–1.6k impressions and no page of its own.
//
// Images are real screenshots of the app (scripts/seo/tool-landings/capture.cjs)
// in the page's language, published under descriptive file names with alt
// text, width/height, ImageObject data and image entries in sitemap.xml — so
// they can rank in Google Images.
//
// Usage:
//   node scripts/seo/generate-tool-landings.mjs [--shots <dir with editor-1-en.jpg…>]
// Without --shots the images already in public/img/ are kept.

import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from './tool-landings/content-a.mjs'
import * as B from './tool-landings/content-b.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC = join(ROOT, 'public')
const SITE = 'https://www.ifcvieweronline.eu'
const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
const CONCEPTS = ['editor', 'classification', 'health']
const SHOT_IDS = { editor: ['editor-1', 'editor-2'], classification: ['class-1', 'class-2'], health: ['health-1', 'health-2'] }
const OG_LOCALE = { en: 'en_US', es: 'es_ES', de: 'de_DE', fr: 'fr_FR', pt: 'pt_PT', it: 'it_IT', ca: 'ca_ES', zh: 'zh_CN', ja: 'ja_JP', th: 'th_TH' }
const SAMPLE = 'https://raw.githubusercontent.com/youshengCode/IfcSampleFiles/main/Ifc4_SampleHouse.ifc'
const IMG_W = 1600, IMG_H = 1000
const LASTMOD = '2026-10-26'
const FIX_LABEL = { en: 'Fix IFC errors', es: 'Corregir errores IFC', de: 'IFC-Fehler beheben', fr: 'Corriger les erreurs IFC', pt: 'Corrigir erros IFC', it: 'Correggere errori IFC', ca: 'Corregir errors IFC', zh: '修复 IFC 错误', ja: 'IFC エラーの修正', th: 'แก้ข้อผิดพลาด IFC' }

const UI = { ...A.UI, ...B.UI }
const page = (c, l) => (A.PAGES[c][l] ?? B.PAGES[c][l])

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const url = (c, l) => `${SITE}/${page(c, l).slug}/`
const imgUrl = (shot) => `${SITE}/img/${shot.file}.jpg`
const json = (v) => JSON.stringify(v, null, 2).replace(/</g, '\\u003c')

function hreflang(c) {
  return [...LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${url(c, l)}" />`),
    `  <link rel="alternate" hreflang="x-default" href="${url(c, 'en')}" />`].join('\n')
}

function render(c, l) {
  const p = page(c, l)
  const ui = UI[l]
  const depth = p.slug.split('/').length
  const root = '../'.repeat(depth)
  const app = l === 'en' ? root : `${root}${l}/`
  const canonical = url(c, l)
  const hero = p.shots[0]
  const others = CONCEPTS.filter((x) => x !== c)
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': canonical, url: canonical, name: p.title, description: p.desc, inLanguage: l,
        isPartOf: { '@id': `${SITE}/` }, primaryImageOfPage: { '@id': imgUrl(hero) } },
      { '@type': 'SoftwareApplication', name: `IFC Viewer Online — ${p.h1}`, url: `${SITE}/`,
        applicationCategory: 'AEC / BIM software', operatingSystem: 'Any (browser-based — Windows, macOS, Linux)',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: p.features.map(([h]) => h), screenshot: p.shots.map((s) => imgUrl(s)) },
      ...p.shots.map((s) => ({ '@type': 'ImageObject', '@id': imgUrl(s), contentUrl: imgUrl(s), url: imgUrl(s),
        name: s.alt, caption: s.cap, width: IMG_W, height: IMG_H, inLanguage: l,
        creator: { '@type': 'Organization', name: 'IFC Viewer Online' },
        copyrightNotice: 'IFC Viewer Online', license: 'https://opensource.org/licenses/MIT',
        acquireLicensePage: `${SITE}/` })),
      { '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: ui.home, item: `${SITE}/${l === 'en' ? '' : l + '/'}` },
        { '@type': 'ListItem', position: 2, name: p.h1, item: canonical },
      ] },
    ],
  }

  return `<!doctype html>
<html lang="${l}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.desc)}" />
  <meta name="keywords" content="${esc(p.keywords)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.desc)}" />
  <meta property="og:site_name" content="IFC Viewer Online" />
  <meta property="og:locale" content="${OG_LOCALE[l]}" />
  <meta property="og:image" content="${imgUrl(hero)}" />
  <meta property="og:image:width" content="${IMG_W}" />
  <meta property="og:image:height" content="${IMG_H}" />
  <meta property="og:image:alt" content="${esc(hero.alt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(p.title)}" />
  <meta name="twitter:description" content="${esc(p.desc)}" />
  <meta name="twitter:image" content="${imgUrl(hero)}" />
${hreflang(c)}
  <link rel="preload" as="image" href="${root}img/${hero.file}.jpg" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="stylesheet" href="/fonts.css" />
  <script type="application/ld+json">
${json(ld)}
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #0A0A0C; color: #E8E8F0; font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Noto Sans', sans-serif; line-height: 1.5; }
    a { color: inherit; text-decoration: none; }
    .container { max-width: 1040px; margin: 0 auto; padding: 0 20px; }
    header { border-bottom: 1px solid rgba(255,255,255,0.06); padding: 16px 0; }
    .header-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .logo { font-size: 14px; font-weight: 600; color: #8B96E9; }
    .nav-cta { font-size: 13px; color: rgba(255,255,255,0.6); padding: 6px 14px; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; white-space: nowrap; }
    .nav-cta:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
    .hero { position: relative; overflow: hidden; padding: 64px 0 40px; text-align: center; }
    .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
    .hero::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(58% 50% at 50% -8%, rgba(94,106,210,0.16), transparent 70%); }
    .hero .container { position: relative; z-index: 1; }
    .badge { display: inline-block; background: rgba(94,106,210,0.1); border: 1px solid rgba(94,106,210,0.25); border-radius: 100px; padding: 5px 14px; font-size: 12px; color: #A3ACF0; margin-bottom: 24px; font-weight: 500; }
    h1 { font-size: clamp(1.9rem, 5vw, 3rem); font-weight: 700; line-height: 1.1; letter-spacing: -0.03em; margin-bottom: 18px; }
    .accent { background: linear-gradient(100deg, #A3ACF0 0%, #6F7BE0 55%, #8B96E9 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: #8B96E9; }
    .lead { font-size: 17px; line-height: 1.65; color: rgba(255,255,255,0.62); max-width: 700px; margin: 0 auto 30px; }
    .cta { display: inline-flex; align-items: center; gap: 8px; background: #5E6AD2; color: #fff; padding: 13px 26px; border-radius: 8px; font-size: 15px; font-weight: 600; }
    .cta:hover { background: #4F5ABF; }
    .note { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 12px; }
    .shot { margin: 40px auto 0; max-width: 1040px; }
    figure { margin: 0; }
    figure img { display: block; width: 100%; height: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 30px 80px -30px rgba(0,0,0,0.8); background: #111; }
    figcaption { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 10px; text-align: center; }
    .section { padding: 56px 0; border-top: 1px solid rgba(255,255,255,0.06); }
    .label { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; color: #8B96E9; text-transform: uppercase; margin-bottom: 10px; }
    h2 { font-size: clamp(1.4rem, 3vw, 1.9rem); font-weight: 700; letter-spacing: -0.02em; margin-bottom: 10px; }
    .sub { font-size: 15px; color: rgba(255,255,255,0.55); margin-bottom: 30px; max-width: 680px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
    .card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 18px 20px; }
    .card h3 { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
    .card p { font-size: 13px; color: rgba(255,255,255,0.55); line-height: 1.6; }
    .faq { border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; overflow: hidden; }
    .faq div { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .faq div:last-child { border-bottom: none; }
    .faq h3 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
    .faq p { font-size: 14px; color: rgba(255,255,255,0.58); line-height: 1.65; }
    .bottom { text-align: center; padding: 56px 0 72px; border-top: 1px solid rgba(255,255,255,0.06); }
    .bottom p { font-size: 14px; color: rgba(255,255,255,0.5); margin: 8px 0 26px; }
    footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 24px 0; text-align: center; }
    .links { display: flex; justify-content: center; gap: 18px; flex-wrap: wrap; margin-bottom: 10px; }
    .links a { font-size: 12px; color: rgba(255,255,255,0.45); }
    .links a:hover { color: #fff; }
    .copy { font-size: 11px; color: rgba(255,255,255,0.3); }
  </style>
</head>
<body>
  <header>
    <div class="container header-inner">
      <a href="${app}" class="logo">IFC Viewer Online</a>
      <a href="${app}" class="nav-cta">${esc(ui.nav)}</a>
    </div>
  </header>
  <main>
    <section class="hero">
      <canvas class="hero-bg" data-dot-grid data-color="94,106,210" aria-hidden="true"></canvas>
      <div class="container">
        <div class="badge">${esc(p.badge)}</div>
        <h1>${esc(p.h1)}<br><span class="accent">${esc(p.h1Accent)}</span></h1>
        <p class="lead">${esc(p.lead)}</p>
        <a href="${app}" class="cta">${esc(p.cta)} →</a>
        <p class="note">${esc(ui.note)}</p>
        <figure class="shot">
          <img src="${root}img/${hero.file}.jpg" width="${IMG_W}" height="${IMG_H}" alt="${esc(hero.alt)}" fetchpriority="high" />
          <figcaption>${esc(hero.cap)}</figcaption>
        </figure>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <p class="label">${esc(ui.featLabel)}</p>
        <h2>${esc(p.featTitle)}</h2>
        <p class="sub">${esc(p.featSub)}</p>
        <div class="grid">
${p.features.map(([h, b]) => `          <div class="card"><h3>${esc(h)}</h3><p>${esc(b)}</p></div>`).join('\n')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <p class="label">${esc(ui.shotsLabel)}</p>
        <figure>
          <img src="${root}img/${p.shots[1].file}.jpg" width="${IMG_W}" height="${IMG_H}" alt="${esc(p.shots[1].alt)}" loading="lazy" decoding="async" />
          <figcaption>${esc(p.shots[1].cap)}</figcaption>
        </figure>
        <div data-live-embed data-app="${app}" data-model="${SAMPLE}" data-validate data-panel data-lang="${l}"
             data-title="${esc(p.h1)}" data-cta="${esc(p.cta)}" style="--le-h:560px;margin-top:32px"></div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <p class="label">${esc(ui.faqLabel)}</p>
        <h2>${esc(ui.faqTitle)}</h2><br/>
        <div class="faq">
${p.faq.map(([q, a]) => `          <div><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('\n')}
        </div>
      </div>
    </section>

    <section class="bottom">
      <div class="container">
        <h2>${esc(p.bottom[0])}</h2>
        <p>${esc(p.bottom[1])}</p>
        <a href="${app}" class="cta">${esc(p.cta)} →</a>
      </div>
    </section>
  </main>
  <footer>
    <div class="container">
      <div class="links">
        <a href="${app}">${esc(ui.home)}</a>
${others.map((o) => `        <a href="${root}${page(o, l).slug}/">${esc(page(o, l).h1)}</a>`).join('\n')}
        <a href="${root}${l === 'en' ? '' : l + '/'}fix/">${esc(FIX_LABEL[l])}</a>
        <a href="https://github.com/j03rul4nd/ifc-viewer-online" rel="noopener noreferrer">GitHub</a>
      </div>
      <p class="copy">IFC Viewer Online © 2026 · Free · Open source · MIT</p>
    </div>
  </footer>
  <script defer src="${root}seo/dot-grid.js"></script>
  <script defer src="${root}seo/live-embed.js"></script>
</body>
</html>
`
}

// ── sitemap.xml / llms.txt: one marked block each, replaced on every run ──────
function replaceBlock(text, start, end, body) {
  const block = `${start}\n${body}\n${end}`
  const i = text.indexOf(start), j = text.indexOf(end)
  if (i >= 0 && j > i) return text.slice(0, i) + block + text.slice(j + end.length)
  return null
}

function sitemapBlock() {
  return CONCEPTS.flatMap((c) => LANGS.map((l) => {
    const p = page(c, l)
    return `  <url>
    <loc>${url(c, l)}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.85</priority>
${LANGS.map((x) => `    <xhtml:link rel="alternate" hreflang="${x}" href="${url(c, x)}" />`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${url(c, 'en')}" />
${p.shots.map((s) => `    <image:image><image:loc>${imgUrl(s)}</image:loc></image:image>`).join('\n')}
  </url>`
  })).join('\n')
}

function main() {
  const shotsIdx = process.argv.indexOf('--shots')
  const shotsDir = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null
  mkdirSync(join(PUBLIC, 'img'), { recursive: true })

  let written = 0, images = 0
  const missing = []
  for (const c of CONCEPTS) for (const l of LANGS) {
    const p = page(c, l)
    if (!p) throw new Error(`no copy for ${c}/${l}`)
    p.shots.forEach((s, i) => {
      const dest = join(PUBLIC, 'img', `${s.file}.jpg`)
      const src = shotsDir && join(shotsDir, `${SHOT_IDS[c][i]}-${l}.jpg`)
      if (src && existsSync(src)) { copyFileSync(src, dest); images++ }
      else if (!existsSync(dest)) missing.push(`${s.file}.jpg`)
    })
    const out = join(PUBLIC, p.slug, 'index.html')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, render(c, l))
    written++
  }

  const smPath = join(PUBLIC, 'sitemap.xml')
  let sm = readFileSync(smPath, 'utf8')
  const S0 = '  <!-- tool-landings:start (scripts/seo/generate-tool-landings.mjs) -->', S1 = '  <!-- tool-landings:end -->'
  sm = replaceBlock(sm, S0, S1, sitemapBlock()) ?? sm.replace('</urlset>', `${S0}\n${sitemapBlock()}\n${S1}\n</urlset>`)
  writeFileSync(smPath, sm)

  const llPath = join(PUBLIC, 'llms.txt')
  let ll = readFileSync(llPath, 'utf8')
  const L0 = '<!-- tool-landings:start -->', L1 = '<!-- tool-landings:end -->'
  const lines = CONCEPTS.map((c) => `- ${page(c, 'en').h1} (EN, + 9 languages): ${url(c, 'en')}`).join('\n')
  ll = replaceBlock(ll, L0, L1, lines) ?? ll.replace(/## Related pages\r?\n/, (m) => `${m}\n${L0}\n${lines}\n${L1}\n`)
  writeFileSync(llPath, ll)

  console.log(`${written} pages, ${images} images copied`)
  if (missing.length) { console.error(`MISSING images (${missing.length}): ${missing.join(', ')}`); process.exitCode = 1 }
}

main()
