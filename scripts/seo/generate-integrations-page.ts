// ── Public integrations page ×10 ─────────────────────────────────────────────
//
//   npx tsx scripts/seo/generate-integrations-page.ts
//
// Writes public/integrations/index.html and public/<lang>/<slug>/index.html
// (slugs in src/lib/integrations/integrations-paths.ts) and the pages' block in
// public/sitemap.xml. Plain HTML, the pricing page's tokens and stylesheet, one
// tiny script for the theme switch: it must read fine with JavaScript off.

import path from 'path'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { INTEGRATIONS_LANGS, integrationsPath, type IntegrationsLang } from '../../src/lib/integrations/integrations-paths'
import { pricingPath } from '../../src/lib/pricing/pricing-paths'
import { PAGE_INTEGRATIONS, PAGE_ORDER, type PageIntegrationId } from './integrations/integrations-data'
import { COPY, type IntegrationsCopy } from './integrations/integrations-i18n'
import { CSS as PRICING_CSS, esc } from './generate-pricing-pages'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..')
const SITE = 'https://www.ifcvieweronline.eu'

const LANG_NAME: Record<IntegrationsLang, string> = {
  en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português', it: 'Italiano', ca: 'Català', zh: '中文', ja: '日本語', th: 'ไทย',
}

const jsonEsc = (s: string): string => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
const abs = (href: string): string => (href.startsWith('/') ? SITE + href : href)
const isExternal = (href: string): boolean => /^https?:\/\//.test(href)
const home = (lang: IntegrationsLang): string => (lang === 'en' ? '/' : `/${lang}/`)

// ── Structured data ───────────────────────────────────────────────────────────

export function structuredData(lang: IntegrationsLang): object {
  const c = COPY[lang]
  const url = SITE + integrationsPath(lang)
  const apps = PAGE_ORDER.map((id) => {
    const d = PAGE_INTEGRATIONS[id]
    const it = c.items[id]
    return {
      '@type': 'SoftwareApplication',
      '@id': `${url}#${id}`,
      name: id === 'wordpress' ? 'Bimo IFC Viewer' : `IFC Viewer Online: ${it.name}`,
      description: it.what,
      applicationCategory: d.category,
      operatingSystem: d.os,
      url: abs(d.href),
      inLanguage: lang,
      publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: `${SITE}/` },
      ...(d.free ? { offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } } : {}),
    }
  })
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url, url, name: c.meta.title, description: c.meta.description, inLanguage: lang, isPartOf: { '@id': `${SITE}/` } },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: c.crumbHome, item: SITE + home(lang) },
          { '@type': 'ListItem', position: 2, name: c.h1, item: url },
        ],
      },
      ...apps,
    ],
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function link(href: string, label: string, cls: string, cta: string): string {
  const ext = isExternal(href) ? ' target="_blank" rel="noopener"' : ''
  return `<a class="${cls}" href="${esc(href)}"${ext} data-cta="${cta}">${esc(label)}</a>`
}

function section(c: IntegrationsCopy, id: PageIntegrationId): string {
  const d = PAGE_INTEGRATIONS[id]
  const it = c.items[id]
  const badge = `<span class="badge b-${d.status}">${esc(c.status[d.status])}</span>${d.free ? ` <span class="badge b-free">${esc(c.free)}</span>` : ''}`
  return `
    <section class="sec wrap integ" id="${id}" aria-labelledby="${id}-h">
      <div class="integ-head"><h2 id="${id}-h">${esc(it.name)}</h2><p class="badges">${badge}</p></div>
      <dl class="rows">
        <div class="row"><dt>${esc(c.labels.what)}</dt><dd><p>${esc(it.what)}</p></dd></div>
        <div class="row"><dt>${esc(c.labels.who)}</dt><dd><p>${esc(it.who)}</p></dd></div>
        <div class="row"><dt>${esc(c.labels.steps)}</dt><dd><ol class="steps">${it.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></dd></div>
        <div class="row"><dt>${esc(c.labels.limits)}</dt><dd><p>${esc(it.limits)}</p></dd></div>
      </dl>
      <p class="cta">${link(d.href, it.cta, 'btn btn-main', id)}</p>
    </section>`
}

const EXTRA_CSS = `
.crumbs{font-size:var(--t-s);color:var(--text-3);margin-bottom:14px}
.crumbs a{color:var(--text-2);text-decoration:none}
.toc{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:22px;font-size:var(--t-s)}
.toc a{color:var(--text-2)}
.integ-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 16px}
.badges{display:flex;gap:6px}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;border:1px solid var(--line);color:var(--text-2)}
.b-available{color:var(--accent-text);border-color:var(--accent-text)}
.b-review{color:var(--warn);border-color:var(--warn)}
.steps{padding-left:20px;color:var(--text-2)}
.steps li{margin-bottom:6px}
.cta{margin-top:18px}
.soon li{color:var(--text-2);margin:0 0 8px 20px}
`

// ── Page ──────────────────────────────────────────────────────────────────────

export function renderIntegrationsPage(lang: IntegrationsLang): string {
  const c = COPY[lang]
  const url = SITE + integrationsPath(lang)
  const alternates = [...INTEGRATIONS_LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${SITE}${integrationsPath(l)}" />`),
    `  <link rel="alternate" hreflang="x-default" href="${SITE}${integrationsPath('en')}" />`].join('\n')
  const blog = lang === 'en' ? '/blog/' : `/${lang}/blog/`
  const toc = PAGE_ORDER.map((id) => `<a href="#${id}">${esc(c.items[id].name)}</a>`).join('')
  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(c.meta.title)}</title>
  <meta name="description" content="${esc(c.meta.description)}" />
  <meta name="robots" content="index, follow" />
  <meta name="color-scheme" content="dark light" />
  <link rel="canonical" href="${url}" />
${alternates}
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(c.meta.title)}" />
  <meta property="og:description" content="${esc(c.meta.description)}" />
  <meta property="og:site_name" content="IFC Viewer Online" />
  <meta property="og:image" content="${SITE}/og-image${lang === 'en' ? '' : `-${lang}`}.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/fonts.css" />
  <script>try{var t=localStorage.getItem('lp-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
  <script type="application/ld+json">${jsonEsc(JSON.stringify(structuredData(lang)))}</script>
  <style>${PRICING_CSS}${EXTRA_CSS}</style>
</head>
<body>
  <header class="top">
    <div class="wrap bar">
      <a href="${home(lang)}" class="logo">IFC Viewer Online</a>
      <nav aria-label="Main">
        <a href="${pricingPath(lang)}" class="hide-s">${esc(c.nav.pricing)}</a>
        <a href="/sdk/" class="hide-s">SDK</a>
        <a href="${blog}" class="hide-s">${esc(c.nav.blog)}</a>
        <button type="button" class="theme" id="theme" aria-label="${esc(c.nav.theme)}" title="${esc(c.nav.theme)}"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg></button>
        <a href="${home(lang)}" class="btn btn-quiet">${esc(c.nav.open)}</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="hero wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="${home(lang)}">${esc(c.crumbHome)}</a> / <span aria-current="page">${esc(c.h1)}</span></nav>
      <h1>${esc(c.h1)}</h1>
      <p class="lead">${esc(c.lead)}</p>
      <nav class="toc" aria-label="${esc(c.onPage)}">${toc}</nav>
    </section>
${PAGE_ORDER.map((id) => section(c, id)).join('\n')}
    <section class="sec wrap" id="soon" aria-labelledby="soon-h">
      <div class="integ-head"><h2 id="soon-h">${esc(c.soon.h2)}</h2><p class="badges"><span class="badge">${esc(c.status.soon)}</span></p></div>
      <ul class="soon">
        <li>${esc(c.soon.folders)}</li>
        <li>${esc(c.soon.ci)}</li>
      </ul>
      <p class="sub">${esc(c.soon.ask)} <a href="${home(lang)}">${esc(c.nav.open)}</a></p>
    </section>
  </main>

  <footer class="wrap foot">
    <nav aria-label="Languages" class="langs">${INTEGRATIONS_LANGS.map((l) => l === lang
      ? `<span aria-current="page">${LANG_NAME[l]}</span>`
      : `<a href="${integrationsPath(l)}" hreflang="${l}" lang="${l}">${LANG_NAME[l]}</a>`).join('')}</nav>
    <p><a href="${home(lang)}">IFC Viewer Online</a><a href="${pricingPath(lang)}">${esc(c.nav.pricing)}</a><a href="/sdk/">SDK</a><a href="/privacy">${esc(c.foot.privacy)}</a><a href="/terms">${esc(c.foot.terms)}</a></p>
  </footer>
  <script>document.getElementById('theme').addEventListener('click',function(){var cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');var next=cur==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('lp-theme',next)}catch(e){}})</script>
</body>
</html>
`
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function sitemapBlock(lastmod: string): string {
  return INTEGRATIONS_LANGS.map((l) => [
    '  <url>',
    `    <loc>${SITE}${integrationsPath(l)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    '    <changefreq>monthly</changefreq>',
    '    <priority>0.7</priority>',
    ...INTEGRATIONS_LANGS.map((a) => `    <xhtml:link rel="alternate" hreflang="${a}" href="${SITE}${integrationsPath(a)}" />`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${integrationsPath('en')}" />`,
    '  </url>',
  ].join('\n')).join('\n')
}

function main(): void {
  for (const l of INTEGRATIONS_LANGS) {
    const dir = path.join(ROOT, 'public', integrationsPath(l))
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), renderIntegrationsPage(l))
  }
  const sm = path.join(ROOT, 'public/sitemap.xml')
  let xml = readFileSync(sm, 'utf-8')
  const block = `  <!-- integrations:start (scripts/seo/generate-integrations-page.ts) -->\n${sitemapBlock(new Date().toISOString().slice(0, 10))}\n  <!-- integrations:end -->\n`
  const re = /  <!-- integrations:start[\s\S]*?<!-- integrations:end -->\n/
  xml = re.test(xml) ? xml.replace(re, block) : xml.replace('</urlset>', `${block}</urlset>`)
  writeFileSync(sm, xml)
  console.log(`integrations: ${INTEGRATIONS_LANGS.length} pages written`)
}

if (process.argv[1] && /generate-integrations-page\.ts$/.test(process.argv[1])) main()
