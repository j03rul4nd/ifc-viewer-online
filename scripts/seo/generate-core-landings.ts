// ─── generate-core-landings ───────────────────────────────────────────────────
// Six landing families × ten languages, written as static pages into public/:
//
//   validator    /ifc-validator/                    "ifc model validation", "ifc checker"
//   cloud        /cloud-ifc-validator/              "cloud ifc checking tool", "ifc upload model check"
//   onprem       /on-premise-ifc-validator/         "offline / air-gapped bim validation"
//   solibri      /solibri-alternative/              "solibri alternative", "solibri free"
//   webchecker   /solibri-webchecker-alternative/   "solibri webchecker"
//   mac          /ifc-viewer-mac/                   "ifc viewer mac free"
//
// They used to be 42 hand-edited HTML files. Now the copy lives in
// core-landings/copy-<lang>.ts, the facts (URLs, captures, sources of every
// statement about a competitor) in core-landings/pages.ts, and this file is the
// template. The shared header, "next step" block and colour tokens come from
// landing-chrome.ts, applied here so the files on disk are final.
//
// Usage:
//   npx tsx scripts/seo/generate-core-landings.ts [--shots <dir>] [--langs en,es]
//
// --shots takes the folder written by core-landings/capture.cjs: the captures
// are copied to public/images/landings/ under their descriptive names and the
// .jpg files get their IPTC rights metadata. Without it the committed images
// are kept.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyChrome } from './landing-chrome'
import { withRights } from './image-metadata'
import { pricingPath } from '../../src/lib/pricing/pricing-paths'
import {
  COMPARED_ON, CONTACT_EMAIL, FAMILIES, FAMILY_SHOTS, IMAGE_COPYRIGHT, IMAGE_CREDIT, IMAGE_DIR, KEPT_TITLES, LANGS,
  LASTMOD, SAMPLE_MODEL, SHOTS, SITE, SLUGS, SOURCES, type ShotImage,
} from './core-landings/pages'
import type { Family, FormSection, Lang, LangCopy, PageCopy, Section, SourceKey } from './core-landings/types'
import { copy as en } from './core-landings/copy-en'
import { copy as es } from './core-landings/copy-es'
import { copy as de } from './core-landings/copy-de'
import { copy as fr } from './core-landings/copy-fr'
import { copy as pt } from './core-landings/copy-pt'
import { copy as it } from './core-landings/copy-it'
import { copy as ca } from './core-landings/copy-ca'
import { copy as zh } from './core-landings/copy-zh'
import { copy as ja } from './core-landings/copy-ja'
import { copy as th } from './core-landings/copy-th'

export const COPY: Record<Lang, LangCopy> = { en, es, de, fr, pt, it, ca, zh, ja, th }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC = join(ROOT, 'public')
const OG_LOCALE: Record<Lang, string> = { en: 'en_US', es: 'es_ES', de: 'de_DE', fr: 'fr_FR', pt: 'pt_PT', it: 'it_IT', ca: 'ca_ES', zh: 'zh_CN', ja: 'ja_JP', th: 'th_TH' }
const GITHUB = 'https://github.com/j03rul4nd/ifc-viewer-online'

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const json = (v: unknown) => JSON.stringify(v, null, 2).replace(/</g, '\\u003c')

export const page = (f: Family, l: Lang): PageCopy => COPY[l].pages[f]
export const pageTitle = (f: Family, l: Lang): string => KEPT_TITLES[f][l] ?? page(f, l).title
export const pagePath = (f: Family, l: Lang): string => `/${SLUGS[f][l]}/`
export const pageUrl = (f: Family, l: Lang): string => `${SITE}${pagePath(f, l)}`
const appPath = (l: Lang) => (l === 'en' ? '/' : `/${l}/`)
const imgPath = (s: ShotImage) => `/${IMAGE_DIR}${s.file}.jpg`
export const imgUrl = (s: ShotImage) => `${SITE}${imgPath(s)}`

/** Where a [text](key) link goes, in the page's language. */
export function linkTarget(key: string, l: Lang): string | null {
  if ((FAMILIES as string[]).includes(key)) return pagePath(key as Family, l)
  switch (key) {
    case 'viewer': return appPath(l)
    case 'sample': return `${appPath(l)}?model=${SAMPLE_MODEL}`
    case 'pricing': return pricingPath(l)
    case 'github': return GITHUB
    case 'fix': return `${l === 'en' ? '' : `/${l}`}/fix/`
    case 'blogSolibri': return `${l === 'en' ? '' : `/${l}`}/blog/solibri-alternative/`
    default: return null
  }
}

const LINK = /\[([^\]]+)\]\(([a-zA-Z]+)\)/g
/** Escaped text with its [text](key) links rendered. */
function rich(s: string, l: Lang): string {
  return esc(s).replace(LINK, (_m, text: string, key: string) => {
    const href = linkTarget(key, l)
    if (!href) throw new Error(`unknown link key "${key}" in ${l}: ${s.slice(0, 60)}`)
    return `<a href="${href}"${href.startsWith('http') ? ' rel="noopener"' : ''}>${text}</a>`
  })
}
/** The same text without markup, for JSON-LD. */
export const plain = (s: string) => s.replace(LINK, '$1')

function sourceNote(keys: SourceKey[] | undefined, l: Lang): string {
  if (!keys?.length) return ''
  const ui = COPY[l].ui
  const links = keys.map((k) => `<a href="${SOURCES[k].url}" rel="nofollow noopener">${SOURCES[k].label}</a>`).join(', ')
  return `\n        <p class="src" data-vendors="${[...new Set(keys.map((k) => SOURCES[k].vendor))].join(' ')}">${esc(ui.sources)}: ${links} · ${esc(ui.readOn)} <time datetime="${COMPARED_ON}">${COMPARED_ON}</time></p>`
}

function picture(s: ShotImage, alt: string, cap: string, hero: boolean): string {
  const set = s.webp.map((w) => `/${IMAGE_DIR}${s.file}-${w}.webp ${w}w`).join(', ')
  return `<figure class="shot">
          <a href="${imgPath(s)}"><picture>
            <source type="image/webp" srcset="${set}" sizes="(max-width: 1120px) 100vw, 1072px" />
            <img src="${imgPath(s)}" width="${s.width}" height="${s.height}" alt="${esc(alt)}" ${hero ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'} />
          </picture></a>
          <figcaption>${esc(cap)}</figcaption>
        </figure>`
}

function head(label: string, h2: string, sub: string | undefined, l: Lang): string {
  return `<p class="label">${esc(label)}</p>
        <h2>${esc(h2)}</h2>${sub ? `\n        <p class="sub">${rich(sub, l)}</p>` : ''}`
}

function form(s: FormSection): string {
  const select = (name: string, label: string, options: string[]) =>
    `<label>${esc(label)}<select name="${name}">${options.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`
  return `<form class="form" id="pilot-form" data-subject="${esc(s.subject)}" data-to="${CONTACT_EMAIL}">
          <div class="form-row">
            <label>${esc(s.org)}<input name="org" required autocomplete="organization" /></label>
            ${select('sector', s.sector, s.sectors)}
          </div>
          <div class="form-row">
            ${select('deploy', s.deploy, s.deploys)}
            ${select('hw', s.hw, s.hws)}
          </div>
          <label>${esc(s.need)}<textarea name="need" rows="4"></textarea></label>
          <button type="submit" class="btn">${esc(s.submit)}</button>
          <p class="form-note">${esc(s.direct)} <a href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(s.subject)}">${CONTACT_EMAIL}</a></p>
        </form>`
}

function section(s: Section, f: Family, l: Lang): string {
  const p = page(f, l)
  const id = s.kind === 'form' ? ' id="pilot"' : ''
  let body = ''
  switch (s.kind) {
    case 'cols':
      body = `<div class="cols">
${s.cols.map((c) => `          <div class="col"><h3>${esc(c.h)}</h3><ul>
${c.items.map((i) => `            <li>${rich(i, l)}</li>`).join('\n')}
          </ul></div>`).join('\n')}
        </div>`
      break
    case 'table':
      body = `<div class="table-wrap"><table class="${s.head.length > 2 ? 'cmp' : 'facts'}">
          <thead><tr>${s.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
${s.rows.map((r) => `            <tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c, i) => `<td data-h="${esc(s.head[i + 1])}">${rich(c, l)}</td>`).join('')}</tr>`).join('\n')}
          </tbody>
        </table></div>${s.after ? `\n${s.after.map((a) => `        <p class="after">${rich(a, l)}</p>`).join('\n')}` : ''}`
      break
    case 'text':
      body = s.ps.map((x) => `<p class="prose">${rich(x, l)}</p>`).join('\n        ')
      break
    case 'steps':
      body = `<ol class="steps">
${s.steps.map(([h, b]) => `          <li><h3>${esc(h)}</h3><p>${rich(b, l)}</p></li>`).join('\n')}
        </ol>`
      break
    case 'shot': {
      const shot = SHOTS[FAMILY_SHOTS[f][1]]
      const embed = f === 'onprem' ? '' : `
        <div data-live-embed data-app="${appPath(l)}" data-model="${SAMPLE_MODEL}" data-validate data-panel data-lang="${l}"
             data-title="${esc(p.h1[0])}" data-cta="${esc(COPY[l].ui.embedCta)}" data-sub="${esc(COPY[l].ui.embedSub)}" style="--le-h:560px;margin-top:32px"></div>`
      body = `${picture(shot, p.shots[1].alt, p.shots[1].cap, false)}${embed}`
      break
    }
    case 'form':
      body = form(s)
      break
  }
  const sources = 'sources' in s ? sourceNote(s.sources, l) : ''
  return `    <section class="section"${id}>
      <div class="container">
        ${head(s.label, s.h2, 'sub' in s ? s.sub : undefined, l)}
        ${body}${sources}
      </div>
    </section>`
}

function hreflang(f: Family): string {
  return [...LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${pageUrl(f, l)}" />`),
    `  <link rel="alternate" hreflang="x-default" href="${pageUrl(f, 'en')}" />`].join('\n')
}

export function imageObject(s: ShotImage, alt: string, cap: string, l: Lang, primary: boolean): Record<string, unknown> {
  return {
    '@type': 'ImageObject', '@id': `${imgUrl(s)}#image`, contentUrl: imgUrl(s), url: imgUrl(s),
    width: s.width, height: s.height, name: alt, caption: cap, inLanguage: l,
    ...(primary ? { representativeOfPage: true } : {}),
    creator: { '@type': 'Organization', name: 'IFC Viewer Online', url: `${SITE}/` },
    creditText: IMAGE_CREDIT, copyrightNotice: IMAGE_COPYRIGHT,
    license: `${SITE}/terms/`, acquireLicensePage: `${SITE}/terms/`,
  }
}

export const CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: var(--lc-canvas); color: var(--lc-text); font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Noto Sans', sans-serif; line-height: 1.55; }
    a { color: inherit; }
    main a { color: var(--lc-accent-text); text-underline-offset: 3px; }
    .container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
    .hero { padding: 56px 0 24px; }
    .badge { font-size: 14px; color: var(--lc-text-2); margin-bottom: 18px; }
    h1 { font-size: clamp(2rem, 4.6vw, 3.1rem); font-weight: 700; line-height: 1.08; letter-spacing: -0.03em; margin-bottom: 20px; max-width: 18ch; }
    h1 span { display: block; color: var(--lc-text-2); font-weight: 600; font-size: 0.62em; line-height: 1.25; letter-spacing: -0.015em; margin-top: 10px; }
    .lead { font-size: 18px; line-height: 1.6; color: var(--lc-text-2); max-width: 640px; margin-bottom: 28px; }
    .go { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
    .btn { display: inline-flex; align-items: center; min-height: 48px; background: var(--lc-accent); color: var(--lc-on-accent); padding: 0 24px; border: 0; border-radius: 8px; font: inherit; font-size: 16px; font-weight: 600; text-decoration: none; cursor: pointer; }
    .btn:hover { filter: brightness(1.1); }
    main a.btn { color: var(--lc-on-accent); }
    .alt { font-size: 15px; }
    .note { font-size: 14px; color: var(--lc-text-3); margin-top: 14px; max-width: 640px; }
    .shot { margin: 40px 0 0; }
    .shot img { display: block; width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--lc-line); background: var(--lc-panel); }
    figcaption { font-size: 14px; color: var(--lc-text-3); margin-top: 10px; max-width: 760px; }
    .section { padding: 56px 0; border-top: 1px solid var(--lc-line); }
    .hero + .section { margin-top: 40px; }
    .label { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; color: var(--lc-accent-text); text-transform: uppercase; margin-bottom: 10px; }
    h2 { font-size: clamp(1.45rem, 3vw, 1.9rem); font-weight: 700; line-height: 1.2; letter-spacing: -0.02em; margin-bottom: 12px; max-width: 26ch; }
    .sub { font-size: 16px; color: var(--lc-text-2); margin-bottom: 28px; max-width: 720px; }
    h2 + .cols, h2 + .table-wrap, h2 + .prose, h2 + .steps, h2 + .shot, h2 + .form, h2 + .faq { margin-top: 28px; }
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .col { background: var(--lc-panel); border: 1px solid var(--lc-line); border-radius: 10px; padding: 22px 24px; }
    .col h3 { font-size: 16px; font-weight: 650; margin-bottom: 12px; }
    .col ul { list-style: none; display: grid; gap: 10px; }
    .col li { font-size: 15px; color: var(--lc-text-2); padding-left: 16px; position: relative; }
    .col li::before { content: ''; position: absolute; left: 0; top: 0.62em; width: 6px; height: 1px; background: var(--lc-text-3); }
    .table-wrap { border: 1px solid var(--lc-line); border-radius: 10px; overflow: hidden; background: var(--lc-panel); }
    table { width: 100%; border-collapse: collapse; font-size: 15px; }
    thead th { text-align: left; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--lc-text-3); padding: 12px 18px; border-bottom: 1px solid var(--lc-line); }
    tbody th { text-align: left; font-weight: 600; color: var(--lc-text); padding: 14px 18px; vertical-align: top; width: 18%; min-width: 150px; }
    td { padding: 14px 18px; vertical-align: top; color: var(--lc-text-2); }
    tbody tr + tr th, tbody tr + tr td { border-top: 1px solid var(--lc-line); }
    table.cmp td:last-child { color: var(--lc-text); }
    .after, .prose { font-size: 16px; color: var(--lc-text-2); max-width: 720px; }
    .after { margin-top: 18px; }
    .prose + .prose { margin-top: 14px; }
    .src { font-size: 13px; color: var(--lc-text-3); margin-top: 18px; max-width: 720px; }
    main .src a { color: var(--lc-text-2); }
    .steps { list-style: none; counter-reset: step; display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; }
    .steps li { counter-increment: step; border-top: 2px solid var(--lc-line); padding-top: 14px; }
    .steps li::before { content: counter(step); font-size: 13px; font-weight: 600; color: var(--lc-accent-text); }
    .steps h3 { font-size: 16px; font-weight: 650; margin: 4px 0 6px; }
    .steps p { font-size: 15px; color: var(--lc-text-2); }
    .faq { border: 1px solid var(--lc-line); border-radius: 10px; background: var(--lc-panel); }
    .faq div { padding: 20px 24px; }
    .faq div + div { border-top: 1px solid var(--lc-line); }
    .faq h3 { font-size: 16px; font-weight: 650; margin-bottom: 6px; }
    .faq p { font-size: 15px; color: var(--lc-text-2); max-width: 760px; }
    .form { display: grid; gap: 16px; max-width: 720px; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    .form label { display: grid; gap: 6px; font-size: 14px; color: var(--lc-text-2); }
    .form input, .form select, .form textarea { font: inherit; font-size: 16px; color: var(--lc-text); background: var(--lc-panel); border: 1px solid var(--lc-line); border-radius: 8px; padding: 10px 12px; min-height: 44px; width: 100%; }
    .form .btn { justify-self: start; }
    .form-note { font-size: 14px; color: var(--lc-text-3); }
    .related { display: flex; flex-wrap: wrap; gap: 10px 22px; list-style: none; font-size: 15px; }
    .bottom { padding: 56px 0 64px; border-top: 1px solid var(--lc-line); }
    .bottom p { font-size: 16px; color: var(--lc-text-2); margin-bottom: 24px; }
    footer { border-top: 1px solid var(--lc-line); padding: 24px 0; }
    .links { display: flex; gap: 8px 20px; flex-wrap: wrap; margin-bottom: 10px; }
    .links a { font-size: 14px; text-decoration: none; }
    .copy { font-size: 13px; }
    main a:focus-visible, .btn:focus-visible, .form :focus-visible { outline: 2px solid var(--lc-accent-text); outline-offset: 2px; border-radius: 4px; }
    @media (max-width: 700px) {
      .container { padding: 0 16px; }
      .hero { padding-top: 36px; }
      .section { padding: 44px 0; }
      table.cmp thead { display: none; }
      table.cmp tr, table.cmp th, table.cmp td { display: block; width: auto; }
      table.cmp tbody th { padding-bottom: 4px; }
      table.cmp td { padding-top: 4px; padding-bottom: 10px; }
      table.cmp tbody tr + tr td { border-top: 0; }
      table.cmp td::before { content: attr(data-h); display: block; font-size: 13px; font-weight: 600; color: var(--lc-text-3); margin-bottom: 2px; }
      table.facts tbody th { width: 34%; min-width: 0; }
      table.facts thead { display: none; }
    }
    @media (prefers-reduced-motion: no-preference) { .btn { transition: filter 0.15s; } }
`

const FORM_JS = `<script>
  (function () {
    var form = document.getElementById('pilot-form'); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var lines = [];
      form.querySelectorAll('label').forEach(function (l) {
        var field = l.querySelector('input,select,textarea');
        if (field) lines.push(l.firstChild.textContent.trim() + ': ' + field.value);
      });
      location.href = 'mailto:' + form.dataset.to + '?subject=' + encodeURIComponent(form.dataset.subject + ' — ' + form.elements.org.value) + '&body=' + encodeURIComponent(lines.join('\\n'));
    });
  })();
  </script>`

/** The page as the template writes it, before the shared chrome. */
export function renderRaw(f: Family, l: Lang): string {
  const p = page(f, l), ui = COPY[l].ui
  const title = pageTitle(f, l)
  const canonical = pageUrl(f, l)
  const [heroId, secondId] = FAMILY_SHOTS[f]
  const hero = SHOTS[heroId], second = SHOTS[secondId]
  const app = appPath(l)
  const primaryHref = f === 'onprem' ? '#pilot' : app
  const related = FAMILIES.filter((x) => x !== f)
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': canonical, url: canonical, name: title, description: p.desc, inLanguage: l,
        isPartOf: { '@id': `${SITE}/` }, primaryImageOfPage: { '@id': `${imgUrl(hero)}#image` }, dateModified: LASTMOD },
      { '@type': 'SoftwareApplication', name: 'IFC Viewer Online', url: `${SITE}/`,
        applicationCategory: 'AEC / BIM software', operatingSystem: 'Any (web browser)',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, screenshot: [imgUrl(hero), imgUrl(second)] },
      imageObject(hero, p.shots[0].alt, p.shots[0].cap, l, true),
      imageObject(second, p.shots[1].alt, p.shots[1].cap, l, false),
      { '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(a) } })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: ui.home, item: `${SITE}${app}` },
        { '@type': 'ListItem', position: 2, name: p.nav, item: canonical },
      ] },
    ],
  }
  // A page without a "shot" section (on-premise) shows its second capture under its second section.
  const hasShot = p.sections.some((s) => s.kind === 'shot')
  const sections = p.sections.map((s, i) => {
    const html = section(s, f, l)
    if (hasShot || i !== 1) return html
    return html.replace(/\n      <\/div>\n    <\/section>$/, `\n        ${picture(second, p.shots[1].alt, p.shots[1].cap, false)}\n      </div>\n    </section>`)
  }).join('\n\n')
  const heroSet = hero.webp.map((w) => `/${IMAGE_DIR}${hero.file}-${w}.webp ${w}w`).join(', ')

  return `<!doctype html>
<html lang="${l}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(p.desc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(p.desc)}" />
  <meta property="og:site_name" content="IFC Viewer Online" />
  <meta property="og:locale" content="${OG_LOCALE[l]}" />
  <meta property="og:image" content="${imgUrl(hero)}" />
  <meta property="og:image:width" content="${hero.width}" />
  <meta property="og:image:height" content="${hero.height}" />
  <meta property="og:image:alt" content="${esc(p.shots[0].alt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(p.desc)}" />
  <meta name="twitter:image" content="${imgUrl(hero)}" />
${hreflang(f)}
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
        <p class="lead">${rich(p.lead, l)}</p>
        <div class="go">
          <a href="${primaryHref}" class="btn">${esc(p.cta)}</a>${p.cta2 ? `\n          <a href="${linkTarget('sample', l)}" class="alt">${esc(p.cta2)}</a>` : ''}
        </div>
        <p class="note">${esc(p.note)}</p>${sourceNote(p.heroSources, l)}
        ${picture(hero, p.shots[0].alt, p.shots[0].cap, true)}
      </div>
    </section>

${sections}

    <section class="section">
      <div class="container">
        <p class="label">${esc(ui.faqLabel)}</p>
        <h2>${esc(ui.faqTitle)}</h2>
        <div class="faq">
${p.faq.map(([q, a]) => `          <div><h3>${esc(q)}</h3><p>${rich(a, l)}</p></div>`).join('\n')}
        </div>${sourceNote(p.faqSources, l)}
      </div>
    </section>

    <section class="section">
      <div class="container">
        <p class="label">${esc(ui.related)}</p>
        <ul class="related">
${related.map((x) => `          <li><a href="${pagePath(x, l)}">${esc(page(x, l).nav)}</a></li>`).join('\n')}
          <li><a href="${linkTarget('blogSolibri', l)}">${esc(ui.blogSolibri)}</a></li>
          <li><a href="${linkTarget('fix', l)}">${esc(ui.fix)}</a></li>
          <li><a href="${pricingPath(l)}">${esc(ui.pricing)}</a></li>
        </ul>
      </div>
    </section>

    <section class="bottom">
      <div class="container">
        <h2>${esc(p.bottom[0])}</h2>
        <p>${esc(p.bottom[1])}</p>
        <a href="${f === 'onprem' ? app : primaryHref}" class="btn">${esc(f === 'onprem' ? page('validator', l).cta : p.cta)}</a>
      </div>
    </section>
  </main>
  <footer>
    <div class="container">
      <div class="links">
        <a href="${app}">${esc(ui.home)}</a>
${related.map((x) => `        <a href="${pagePath(x, l)}">${esc(page(x, l).nav)}</a>`).join('\n')}
        <a href="${GITHUB}" rel="noopener noreferrer">GitHub</a>
      </div>
      <p class="copy">IFC Viewer Online © 2026 · MIT</p>
    </div>
  </footer>
  ${f === 'onprem' ? FORM_JS : '<script defer src="/seo/live-embed.js"></script>'}
</body>
</html>
`
}

/** The page as it is written to public/: template + shared header, next step and tokens. */
export function render(f: Family, l: Lang): string {
  return applyChrome(renderRaw(f, l))
}

// ── sitemap.xml / llms.txt ────────────────────────────────────────────────────
export const SITEMAP_START = '  <!-- core-landings:start (scripts/seo/generate-core-landings.ts) -->'
export const SITEMAP_END = '  <!-- core-landings:end -->'

export function sitemapBlock(): string {
  return FAMILIES.flatMap((f) => LANGS.map((l) => `  <url>
    <loc>${pageUrl(f, l)}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${l === 'en' ? '0.9' : '0.8'}</priority>
${LANGS.map((x) => `    <xhtml:link rel="alternate" hreflang="${x}" href="${pageUrl(f, x)}" />`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(f, 'en')}" />
${FAMILY_SHOTS[f].map((id) => `    <image:image><image:loc>${imgUrl(SHOTS[id])}</image:loc></image:image>`).join('\n')}
  </url>`)).join('\n')
}

/** The sitemap with these pages stated once, in the marked block. */
export function updateSitemap(xml: string): string {
  const mine = new Set(FAMILIES.flatMap((f) => LANGS.map((l) => pageUrl(f, l))))
  const a = xml.indexOf(SITEMAP_START), b = xml.indexOf(SITEMAP_END)
  let out = a >= 0 && b > a ? xml.slice(0, a).replace(/[ \t]*$/, '') + xml.slice(b + SITEMAP_END.length).replace(/^\r?\n/, '') : xml
  // The hand-written entries these pages had before the generator.
  out = out.replace(/[ \t]*(?:<!--[^>]*-->\s*)?<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>\r?\n/g, (m, loc: string) => (mine.has(loc.trim()) ? '' : m))
  if (!out.includes('xmlns:image=')) out = out.replace('<urlset ', '<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" ')
  return out.replace('</urlset>', `${SITEMAP_START}\n${sitemapBlock()}\n${SITEMAP_END}\n</urlset>`)
}

const LLMS_START = '<!-- core-landings:start -->', LLMS_END = '<!-- core-landings:end -->'
export function updateLlms(text: string): string {
  const lines = FAMILIES.map((f) => `- ${page(f, 'en').nav} (EN, + 9 languages): ${pageUrl(f, 'en')}`).join('\n')
  const block = `${LLMS_START}\n${lines}\n${LLMS_END}`
  const a = text.indexOf(LLMS_START), b = text.indexOf(LLMS_END)
  if (a >= 0 && b > a) return text.slice(0, a) + block + text.slice(b + LLMS_END.length)
  return text.replace(/## Related pages\r?\n/, (m) => `${m}\n${block}\n`)
}

// ── images ────────────────────────────────────────────────────────────────────
function publishShots(dir: string): number {
  const out = join(PUBLIC, IMAGE_DIR)
  mkdirSync(out, { recursive: true })
  let n = 0
  for (const [id, s] of Object.entries(SHOTS)) {
    const jpg = join(dir, `${s.capture}.jpg`)
    if (!existsSync(jpg)) throw new Error(`missing capture ${jpg}`)
    // English description in the file itself; each page gives the alt in its own language.
    const f = FAMILIES.find((x) => FAMILY_SHOTS[x].includes(id as keyof typeof SHOTS))!
    const alt = page(f, 'en').shots[FAMILY_SHOTS[f].indexOf(id as keyof typeof SHOTS)].alt
    writeFileSync(join(out, `${s.file}.jpg`), withRights(readFileSync(jpg), {
      creator: 'IFC Viewer Online', credit: IMAGE_CREDIT, copyright: IMAGE_COPYRIGHT,
      webStatement: `${SITE}/terms/`, licensorUrl: `${SITE}/terms/`, description: alt, sourceType: 'screenCapture',
    }))
    for (const w of s.webp) copyFileSync(join(dir, `${s.capture}-${w}.webp`), join(out, `${s.file}-${w}.webp`))
    n++
  }
  return n
}

function main(): void {
  const i = process.argv.indexOf('--shots')
  const images = i > 0 ? publishShots(resolve(process.argv[i + 1])) : 0
  // --langs en,es writes only those languages (while a translation is in progress).
  const j = process.argv.indexOf('--langs')
  const only = j > 0 ? process.argv[j + 1].split(',') : null
  let pages = 0
  for (const f of FAMILIES) for (const l of LANGS) {
    if (only && !only.includes(l)) continue
    const out = join(PUBLIC, SLUGS[f][l], 'index.html')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, render(f, l))
    pages++
  }
  const sm = join(PUBLIC, 'sitemap.xml')
  writeFileSync(sm, updateSitemap(readFileSync(sm, 'utf8')))
  const ll = join(PUBLIC, 'llms.txt')
  writeFileSync(ll, updateLlms(readFileSync(ll, 'utf8')))
  console.log(`core-landings: ${pages} pages, ${images} images published`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
