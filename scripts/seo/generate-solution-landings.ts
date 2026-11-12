// ─── generate-solution-landings ───────────────────────────────────────────────
// Two pages per buyer × ten languages, written as static pages into public/
// (doc 24 §4, points 2 and 4):
//
//   contractors   /for-contractors/   contractors and developers who RECEIVE models (Reception plan)
//   engineering   /for-engineering/   engineering firms and studios that DELIVER them (Team plan)
//
// Both plans are previews: the pages say so in the first screen, tag every
// step of the flow and send to /pricing/?role=… (talk to us / waitlist).
// Copy in solution-landings/copy-<lang>.ts, facts and sources in pages.ts, the
// look is the core landings' CSS, and the shared header and colour tokens come
// from landing-chrome.ts, applied here so the files on disk are final.
//
// Usage:
//   npx tsx scripts/seo/generate-solution-landings.ts [--rights]
//
// --rights rewrites the .jpg captures in public/images/solutions/ with their
// IPTC rights metadata (run once after encoding new captures).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyChrome } from './landing-chrome'
import { withRights } from './image-metadata'
import { CSS as CORE_CSS } from './generate-core-landings'
import { pricingPath } from '../../src/lib/pricing/pricing-paths'
import { VALIDATOR_SLUG } from '../../src/lib/localized-landings'
import {
  FLOW, HERO, IMAGE_COPYRIGHT, IMAGE_CREDIT, IMAGE_DIR, LANGS, LASTMOD, POSTS, ROLE, SITE, SLUGS, SOLUTIONS, SOURCES, type Shot,
} from './solution-landings/pages'
import type { Lang, PageCopy, Section, Solution, SourceKey } from './solution-landings/types'
import { COPY } from './solution-landings/copy'

export { COPY }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC = join(ROOT, 'public')
const OG_LOCALE: Record<Lang, string> = { en: 'en_US', es: 'es_ES', de: 'de_DE', fr: 'fr_FR', pt: 'pt_PT', it: 'it_IT', ca: 'ca_ES', zh: 'zh_CN', ja: 'ja_JP', th: 'th_TH' }

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const json = (v: unknown) => JSON.stringify(v, null, 2).replace(/</g, '\\u003c')
const pre = (l: Lang) => (l === 'en' ? '' : `/${l}`)
const appPath = (l: Lang) => (l === 'en' ? '/' : `/${l}/`)

export const page = (s: Solution, l: Lang): PageCopy => COPY[l].pages[s]
export const pagePath = (s: Solution, l: Lang): string => `/${SLUGS[s][l]}/`
export const pageUrl = (s: Solution, l: Lang): string => `${SITE}${pagePath(s, l)}`
/** The page's call to action: the plan on /pricing/, opened by ?role=. */
export const ctaHref = (s: Solution, l: Lang): string => `${pricingPath(l)}?role=${ROLE[s]}`
const imgPath = (s: Shot) => `/${IMAGE_DIR}${s.file}.jpg`
export const imgUrl = (s: Shot) => `${SITE}${imgPath(s)}`
export const postPath = (k: keyof typeof POSTS, l: Lang) => `${pre(l)}/blog/${POSTS[k]}/`
/** The post the second link of each hero opens. */
const HERO_POST: Record<Solution, keyof typeof POSTS> = { contractors: 'postReception', engineering: 'postClash' }

/** Where a [text](key) link goes, in the page's language. */
export function linkTarget(key: string, l: Lang, s: Solution): string | null {
  switch (key) {
    case 'viewer': return appPath(l)
    case 'pricing': return ctaHref(s, l)
    case 'contractors': case 'engineering': return pagePath(key, l)
    case 'postReception': case 'postClash': case 'postBatch': return postPath(key, l)
    case 'validator': return l === 'en' ? '/ifc-validator/' : `/${l}/${VALIDATOR_SLUG[l]}/`
    case 'fix': return `${pre(l)}/fix/`
    default: return null
  }
}

const LINK = /\[([^\]]+)\]\(([a-zA-Z]+)\)/g
function rich(t: string, l: Lang, s: Solution): string {
  return esc(t).replace(LINK, (_m, text: string, key: string) => {
    const href = linkTarget(key, l, s)
    if (!href) throw new Error(`unknown link key "${key}" in ${l}: ${t.slice(0, 60)}`)
    return `<a href="${href}">${text}</a>`
  })
}
export const plain = (t: string) => t.replace(LINK, '$1')

function sourceNote(keys: SourceKey[] | undefined, l: Lang): string {
  if (!keys?.length) return ''
  const ui = COPY[l].ui
  const links = keys.map((k) => `<a href="${SOURCES[k].url}" rel="nofollow noopener">${esc(SOURCES[k].label)}</a> (${esc(ui.readOn)} <time datetime="${SOURCES[k].read}">${SOURCES[k].read}</time>)`).join(', ')
  return `\n        <p class="src" data-sources="${keys.join(' ')}">${esc(ui.sources)}: ${links}</p>`
}

function picture(s: Shot, alt: string, cap: string, hero: boolean): string {
  const set = s.webp.map((w) => `/${IMAGE_DIR}${s.file}-${w}.webp ${w}w`).join(', ')
  return `<figure class="shot">
          <a href="${imgPath(s)}"><picture>
            <source type="image/webp" srcset="${set}" sizes="(max-width: 1120px) 100vw, 1072px" />
            <img src="${imgPath(s)}" width="${s.width}" height="${s.height}" alt="${esc(alt)}" ${hero ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'} />
          </picture></a>
          <figcaption>${esc(cap)}</figcaption>
        </figure>`
}

function section(sec: Section, s: Solution, l: Lang): string {
  const ui = COPY[l].ui
  let body = ''
  switch (sec.kind) {
    case 'text':
      body = sec.ps.map((x) => `<p class="prose">${rich(x, l, s)}</p>`).join('\n        ')
      break
    case 'cols':
      body = `<div class="cols">
${sec.cols.map((c) => `          <div class="col"><h3>${esc(c.h)}</h3><ul>
${c.items.map((i) => `            <li>${rich(i, l, s)}</li>`).join('\n')}
          </ul></div>`).join('\n')}
        </div>`
      break
    case 'table':
      body = `<div class="table-wrap"><table class="${sec.head.length > 2 ? 'cmp' : 'facts'}">
          <thead><tr>${sec.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
${sec.rows.map((r) => `            <tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c, i) => `<td data-h="${esc(sec.head[i + 1])}">${rich(c, l, s)}</td>`).join('')}</tr>`).join('\n')}
          </tbody>
        </table></div>${sec.after ? `\n${sec.after.map((a) => `        <p class="after">${rich(a, l, s)}</p>`).join('\n')}` : ''}`
      break
    case 'flow':
      body = `<ol class="flow">
${sec.steps.map((st, i) => `          <li>
            <div class="flow-text"><p class="tag">${esc(ui.preview)}</p><h3>${esc(st.h)}</h3><p>${rich(st.p, l, s)}</p></div>
            ${picture(FLOW[s][i], st.alt, st.cap, false)}
          </li>`).join('\n')}
        </ol>`
      break
  }
  const sub = 'sub' in sec && sec.sub ? `\n        <p class="sub">${rich(sec.sub, l, s)}</p>` : ''
  return `    <section class="section">
      <div class="container">
        <p class="label">${esc(sec.label)}</p>
        <h2>${esc(sec.h2)}</h2>${sub}
        ${body}${'sources' in sec ? sourceNote(sec.sources, l) : ''}
      </div>
    </section>`
}

function hreflang(s: Solution): string {
  return [...LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${pageUrl(s, l)}" />`),
    `  <link rel="alternate" hreflang="x-default" href="${pageUrl(s, 'en')}" />`].join('\n')
}

function imageObject(s: Shot, alt: string, cap: string, l: Lang, primary: boolean): Record<string, unknown> {
  return {
    '@type': 'ImageObject', '@id': `${imgUrl(s)}#image`, contentUrl: imgUrl(s), url: imgUrl(s),
    width: s.width, height: s.height, name: alt, caption: cap, inLanguage: l,
    ...(primary ? { representativeOfPage: true } : {}),
    creator: { '@type': 'Organization', name: 'IFC Viewer Online', url: `${SITE}/` },
    creditText: IMAGE_CREDIT, copyrightNotice: IMAGE_COPYRIGHT,
    license: `${SITE}/terms/`, acquireLicensePage: `${SITE}/terms/`,
  }
}

const CSS = `${CORE_CSS}
    .flow { list-style: none; display: grid; gap: 48px; }
    .flow li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 24px 40px; align-items: start; }
    .flow .shot { margin: 0; }
    .flow h3 { font-size: 18px; font-weight: 650; margin-bottom: 8px; }
    .flow p { font-size: 15px; color: var(--lc-text-2); }
    .tag { display: inline-block; font-size: 13px; font-weight: 600; color: var(--lc-text-2); border: 1px solid var(--lc-line); border-radius: 6px; padding: 1px 8px; margin-bottom: 10px; }
    .preview-note { border: 1px solid var(--lc-line); border-radius: 10px; background: var(--lc-panel); padding: 14px 18px; color: var(--lc-text-2); }
    @media (max-width: 860px) { .flow li { grid-template-columns: 1fr; } }
`

/** The page as the template writes it, before the shared chrome. */
export function renderRaw(s: Solution, l: Lang): string {
  const p = page(s, l), ui = COPY[l].ui
  const canonical = pageUrl(s, l)
  const hero = HERO[s]
  const app = appPath(l)
  const other = SOLUTIONS.find((x) => x !== s)!
  const posts = (Object.keys(POSTS) as (keyof typeof POSTS)[])
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': canonical, url: canonical, name: p.title, description: p.desc, inLanguage: l,
        isPartOf: { '@id': `${SITE}/` }, primaryImageOfPage: { '@id': `${imgUrl(hero)}#image` }, dateModified: LASTMOD },
      imageObject(hero, p.hero.alt, p.hero.cap, l, true),
      { '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(a) } })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: ui.home, item: `${SITE}${app}` },
        { '@type': 'ListItem', position: 2, name: p.nav, item: canonical },
      ] },
    ],
  }
  const heroSet = hero.webp.map((w) => `/${IMAGE_DIR}${hero.file}-${w}.webp ${w}w`).join(', ')

  return `<!doctype html>
<html lang="${l}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.desc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.desc)}" />
  <meta property="og:site_name" content="IFC Viewer Online" />
  <meta property="og:locale" content="${OG_LOCALE[l]}" />
  <meta property="og:image" content="${imgUrl(hero)}" />
  <meta property="og:image:width" content="${hero.width}" />
  <meta property="og:image:height" content="${hero.height}" />
  <meta property="og:image:alt" content="${esc(p.hero.alt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(p.title)}" />
  <meta name="twitter:description" content="${esc(p.desc)}" />
  <meta name="twitter:image" content="${imgUrl(hero)}" />
${hreflang(s)}
  <link rel="preload" as="image" type="image/webp" imagesrcset="${heroSet}" imagesizes="(max-width: 1120px) 100vw, 1072px" fetchpriority="high" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="stylesheet" href="/fonts.css" />
  <script type="application/ld+json">
${json(ld)}
  </script>
  <style>${CSS}  </style>
</head>
<body>
  <header>
    <div class="container"><a href="${app}" class="nav-cta">IFC Viewer Online</a></div>
  </header>
  <main>
    <section class="hero">
      <div class="container">
        <p class="badge">${esc(p.kicker)}</p>
        <h1>${esc(p.h1[0])} <span>${esc(p.h1[1])}</span></h1>
        <p class="lead">${rich(p.lead, l, s)}</p>
        <div class="go">
          <a href="${ctaHref(s, l)}" class="btn" data-cta="solution_${s}">${esc(p.cta)}</a>
          <a href="${postPath(HERO_POST[s], l)}" class="alt">${esc(p.cta2)}</a>
        </div>
        <p class="note preview-note">${esc(p.note)}</p>
        ${picture(hero, p.hero.alt, p.hero.cap, true)}
      </div>
    </section>

${p.sections.map((x) => section(x, s, l)).join('\n\n')}

    <section class="section">
      <div class="container">
        <p class="label">${esc(ui.faqLabel)}</p>
        <h2>${esc(ui.faqTitle)}</h2>
        <div class="faq">
${p.faq.map(([q, a]) => `          <div><h3>${esc(q)}</h3><p>${rich(a, l, s)}</p></div>`).join('\n')}
        </div>${sourceNote(p.faqSources, l)}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <p class="label">${esc(ui.related)}</p>
        <ul class="related">
          <li><a href="${pagePath(other, l)}">${esc(page(other, l).nav)}</a></li>
${posts.map((k) => `          <li><a href="${postPath(k, l)}">${esc(ui[k])}</a></li>`).join('\n')}
          <li><a href="${pricingPath(l)}">${esc(ui.pricing)}</a></li>
        </ul>
      </div>
    </section>

    <section class="bottom">
      <div class="container">
        <h2>${esc(p.bottom[0])}</h2>
        <p>${esc(p.bottom[1])}</p>
        <a href="${ctaHref(s, l)}" class="btn" data-cta="solution_${s}_bottom">${esc(p.cta)}</a>
      </div>
    </section>
  </main>
  <footer>
    <div class="container">
      <div class="links">
        <a href="${app}">${esc(ui.home)}</a>
${SOLUTIONS.map((x) => `        <a href="${pagePath(x, l)}">${esc(page(x, l).nav)}</a>`).join('\n')}
        <a href="${pricingPath(l)}">${esc(ui.pricing)}</a>
      </div>
      <p class="copy">IFC Viewer Online © 2026 · MIT</p>
    </div>
  </footer>
</body>
</html>
`
}

export function render(s: Solution, l: Lang): string {
  return applyChrome(renderRaw(s, l))
}

// ── sitemap.xml / llms.txt ────────────────────────────────────────────────────
export const SITEMAP_START = '  <!-- solution-landings:start (scripts/seo/generate-solution-landings.ts) -->'
export const SITEMAP_END = '  <!-- solution-landings:end -->'

export function sitemapBlock(): string {
  return SOLUTIONS.flatMap((s) => LANGS.map((l) => `  <url>
    <loc>${pageUrl(s, l)}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${l === 'en' ? '0.9' : '0.8'}</priority>
${LANGS.map((x) => `    <xhtml:link rel="alternate" hreflang="${x}" href="${pageUrl(s, x)}" />`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(s, 'en')}" />
${[HERO[s], ...FLOW[s]].map((i) => `    <image:image><image:loc>${imgUrl(i)}</image:loc></image:image>`).join('\n')}
  </url>`)).join('\n')
}

export function updateSitemap(xml: string): string {
  const x = xml.replace(/\r\n/g, '\n')
  const a = x.indexOf(SITEMAP_START), b = x.indexOf(SITEMAP_END)
  const out = a >= 0 && b > a ? x.slice(0, a).replace(/[ \t]*$/, '') + x.slice(b + SITEMAP_END.length).replace(/^\n/, '') : x
  // Before the core landings' block, which that generator always moves to the end.
  const block = `${SITEMAP_START}\n${sitemapBlock()}\n${SITEMAP_END}\n`
  const core = out.indexOf('  <!-- core-landings:start')
  return core >= 0 ? out.slice(0, core) + block + out.slice(core) : out.replace('</urlset>', `${block}</urlset>`)
}

const LLMS_START = '<!-- solution-landings:start -->', LLMS_END = '<!-- solution-landings:end -->'
export function updateLlms(text: string): string {
  const lines = SOLUTIONS.map((s) => `- ${page(s, 'en').nav} (EN, + 9 languages; plan in preview): ${pageUrl(s, 'en')}`).join('\n')
  const block = `${LLMS_START}\n${lines}\n${LLMS_END}`
  const a = text.indexOf(LLMS_START), b = text.indexOf(LLMS_END)
  if (a >= 0 && b > a) return text.slice(0, a) + block + text.slice(b + LLMS_END.length)
  return text.replace(/## Related pages\r?\n/, (m) => `${m}\n${block}\n`)
}

function writeRights(): number {
  const dir = join(PUBLIC, IMAGE_DIR)
  let n = 0
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jpg'))) {
    const p = join(dir, f)
    writeFileSync(p, withRights(readFileSync(p), {
      creator: 'IFC Viewer Online', credit: IMAGE_CREDIT, copyright: IMAGE_COPYRIGHT,
      webStatement: `${SITE}/terms/`, licensorUrl: `${SITE}/terms/`,
      description: `IFC Viewer Online workspace preview with sample data: ${f.replace(/\.jpg$/, '').replace(/-/g, ' ')}`, sourceType: 'screenCapture',
    }))
    n++
  }
  return n
}

function main(): void {
  const images = process.argv.includes('--rights') ? writeRights() : 0
  let pages = 0
  for (const s of SOLUTIONS) for (const l of LANGS) {
    const out = join(PUBLIC, SLUGS[s][l], 'index.html')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, render(s, l))
    pages++
  }
  const sm = join(PUBLIC, 'sitemap.xml')
  writeFileSync(sm, updateSitemap(readFileSync(sm, 'utf8')))
  const ll = join(PUBLIC, 'llms.txt')
  writeFileSync(ll, updateLlms(readFileSync(ll, 'utf8')))
  console.log(`solution-landings: ${pages} pages, ${images} images tagged`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
