// ── Static shells for the localized app home pages ────────────────────────────
//
// Problem this solves
// ───────────────────
// Only EN (/) and ES (/es/, then a hand-authored static page in public/es/) had
// a real home page. /de/, /fr/, /pt/, /it/, /ca/, /zh/, /ja/ and /th/ fell
// through the SPA rewrite in vercel.json and were served the ENGLISH shell,
// which declares `<link rel="canonical" href="https://www.ifcvieweronline.eu/">`.
// Google therefore folded every one of them into the root URL — Search Console
// reported /it/ under "Duplicate, Google chose a different canonical than the
// user" on 2026-08-11, and the other seven were queued behind it. Eight of the
// ten advertised languages had no indexable home at all.
//
// How it works
// ────────────
// Same approach as generate-blog-pages.ts: take dist/index.html (the built SPA
// shell, whose Vite asset URLs are absolute and therefore depth-independent) —
// read BEFORE injectLandingContent() appends its English <noscript> block, so
// each shell carries only its own translated copy —
// swap the page-specific head tags, and write dist/<lang>/index.html. The page
// boots the real app — i18n picks the language up from the URL path, which is
// why config.ts lists 'path' first in its detection order. Remove that and these
// shells render English under a `lang="de"` document, which is worse for hreflang
// than not having them.
//
// ES is generated like the rest since 2026-11-10. Until then /es/ was a
// hand-authored static page (public/es/index.html: its own CSS, no app, not one
// picture) kept apart because it was the only language home Google had indexed.
// By November the other eight were indexed too, and the static page had fallen
// behind the home everyone else gets: no captures of the viewer, no comparison,
// a hand-synced hreflang cluster, and every button a link to the English root.
// Its title and description — the ones that earn its clicks — live on in
// src/locales/es/landing.json (`seo`), and every Spanish landing it linked is
// linked from the shell below. Do not bring public/es/index.html back: Vite
// would copy it to dist/es/ and this generator would overwrite it.
//
// What a shell says without running the app
// ─────────────────────────────────────────
// The <noscript> block states the page as text: h1, pictures, the «open an IFC
// file» answers (home-guide.ts, where the language has them), the comparison
// with Solibri and Flinker, features, FAQ, and links to the language's own
// landings and to the other nine homes. Google indexes what the app renders;
// this block is for the crawlers that read only the HTML as served.
//
// The hreflang cluster is emitted identically on all ten home pages. A cluster
// is only valid if every member links to every other member AND to itself; miss
// one and Google discards the lot, which is the usual reason a single language
// survives and the rest vanish.

import path from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { solibriPath, toolLandings, validatorPath } from '../../src/lib/localized-landings'
import { pricingPath } from '../../src/lib/pricing/pricing-paths'
import { HOME_COPY } from '../../src/components/landing/home-copy'
import { HOME_GUIDE, HOME_LANGUAGE_NAMES, guideHref } from '../../src/components/landing/home-guide'
import { COMPARE_ROWS, SHOWCASE_COPY, examplesPath } from '../../src/components/landing/home-showcase'
import { heroPreloads, homePictures, imageObjects, noscriptFigures } from './home-images'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')

/** Every language with a home page, in registry order. Drives the hreflang
 *  cluster on all of them. Mirrors LOCALE_REGISTRY in src/i18n/registry.ts. */
const ALL_LANGS = ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'th', 'ca'] as const

/** Languages whose shell THIS generator writes: everything except EN (which is
 *  dist/index.html itself). */
const GENERATED = ['es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'th', 'ca'] as const

type Lang = (typeof ALL_LANGS)[number]

/** URL path for a language's home. EN lives at the site root. */
function homePath(lang: Lang): string {
  return lang === 'en' ? '/' : `/${lang}/`
}

/** BCP-47 → og:locale. Only the ten registry languages need an entry. */
const OG_LOCALE: Record<Lang, string> = {
  en: 'en_US', es: 'es_ES', fr: 'fr_FR', de: 'de_DE', pt: 'pt_PT',
  it: 'it_IT', zh: 'zh_CN', ja: 'ja_JP', th: 'th_TH', ca: 'ca_ES',
}

/* Localized landing slugs live in ./localized-landings.ts, shared with
 * generate-fix-pages.ts so the two generators cannot start linking different
 * targets for the same language. */

// ── The subset of landing.json this generator reads ───────────────────────────
// Shape-checked at runtime by assertLocale so a half-translated locale fails the
// build instead of shipping a shell with "undefined" in its <title>.
interface LandingLocale {
  hero:            { h1: string; h1Accent: string; subtitle: string; subtitleFull: string }
  featuresSection: { title: string; subtitle: string }
  faqSection:      { title: string }
  /** Link label reused from the page's own header. */
  nav?:            { pricing?: string }
  features:        Array<{ title: string; body: string }>
  faq:             Array<{ q: string; a: string }>
  /** Optional: present in every locale today, but the shell degrades gracefully
   *  to an English label rather than failing the build if a new locale lacks it. */
  fixGuides?:      { title: string }
  /** Copy written for the search result rather than for the page. */
  seo?:            { title?: string; description?: string }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escape < > & in JSON so it is safe inside a <script> tag. */
function jsonEsc(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

function assertLocale(lang: string, t: unknown): asserts t is LandingLocale {
  const l = t as LandingLocale
  const ok =
    l?.hero?.h1 && l.hero.h1Accent && l.hero.subtitle && l.hero.subtitleFull &&
    l.featuresSection?.title && l.featuresSection.subtitle && l.faqSection?.title &&
    Array.isArray(l.features) && l.features.length > 0 &&
    Array.isArray(l.faq) && l.faq.length > 0
  if (!ok) throw new Error(`[lang-shells] src/locales/${lang}/landing.json is missing keys required for the home shell`)
}

// ── Head rewriting ────────────────────────────────────────────────────────────

/** The shared hreflang cluster: all ten homes plus x-default → EN. */
function hreflangCluster(): string {
  const lines = ALL_LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${homePath(l)}" />`,
  )
  lines.push(`<link rel="alternate" hreflang="x-default" href="${SITE}/" />`)
  return lines.join('\n  ')
}

interface ShellMeta {
  lang:        Lang
  title:       string
  description: string
  canonical:   string
}

/**
 * Swap the page-specific head tags on the dist/index.html template. Mirrors
 * tweakHtml in generate-blog-pages.ts; kept separate because the language shells
 * need <html lang>, og:locale and a ten-member hreflang cluster, none of which
 * the blog shells have.
 */
function tweakHead(template: string, meta: ShellMeta, jsonLd: Record<string, unknown>): string {
  let html = template

  // <html lang> — the document's own language declaration. Without this the
  // hreflang cluster contradicts the markup.
  html = html.replace(/<html\s+lang="[^"]*"/, `<html lang="${meta.lang}"`)

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
  html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${esc(meta.canonical)}$2`)

  html = html.replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/,       `$1${esc(meta.title)}$2`)
  html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
  html = html.replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/,         `$1${esc(meta.canonical)}$2`)
  html = html.replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,       `$1${esc(meta.title)}$2`)
  html = html.replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${esc(meta.description)}$2`)

  // og:locale is EN in the template; point it at this shell's language.
  html = html.replace(/(<meta\s+property="og:locale"\s+content=")[^"]*(")/, `$1${OG_LOCALE[meta.lang]}$2`)

  // The share image is the skyline capture; say what it shows in this language.
  const shareAlt = esc(homePictures(meta.lang)[2].alt).replace(/"/g, '&quot;')
  html = html.replace(/(<meta\s+property="og:image:alt"\s+content=")[^"]*(")/, `$1${shareAlt}$2`)
  html = html.replace(/(<meta\s+name="twitter:image:alt"\s+content=")[^"]*(")/, `$1${shareAlt}$2`)

  // Drop the template's own (EN-only) alternates before injecting the full
  // cluster, or the page would advertise two competing sets.
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')

  // Drop the template's hand-written English <noscript> block. noscriptBlock()
  // supplies the translated equivalent; leaving both would serve a German page
  // with an English <h1> ahead of its own.
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>\s*/g, '')

  const ld = `<script type="application/ld+json">${jsonEsc(JSON.stringify(jsonLd))}</script>`
  // The first picture is the page's largest paint: fetch it before the app boots.
  html = html.replace('</head>', `  ${hreflangCluster()}\n  ${heroPreloads()}\n  ${ld}\n</head>`)

  return html
}

/**
 * Translated <noscript> content, mirroring injectLandingContent() in
 * vite.config.ts (which does the same for EN). Gives crawlers that do not run JS
 * real indexable copy instead of an empty shell.
 *
 * The links at the end point at this language's own fix hub and validator
 * landing. They matter beyond no-JS visitors: the app's ~510 links into the fix
 * silo only render after a user opens a model, which a crawler cannot do, so
 * these are among the few crawlable paths from a home page into the silo.
 *
 * There is no translation key for the "JavaScript is required" notice the English
 * block carries, so it is omitted here rather than shipped untranslated.
 */
/** «Open an IFC file», as text. Empty for a language without a guide. */
function guideBlock(lang: Lang): string {
  const g = HOME_GUIDE[lang]
  if (!g) return ''
  const items = g.items.map((i) => {
    const link = i.link ? ` <a href="${SITE}/${guideHref(lang, i.link.to)}">${esc(i.link.text)}</a>` : ''
    return `<article><h3>${esc(i.q)}</h3><p>${esc(i.a)}${link}</p></article>`
  }).join('\n')
  return `<section><h2>${esc(g.title)}</h2><p>${esc(g.intro)}</p>\n${items}</section>`
}

/** The comparison with Solibri and Flinker, as the table the page renders. */
function compareBlock(lang: Lang): string {
  const c = SHOWCASE_COPY[lang].compare
  const rows = COMPARE_ROWS.map((r) =>
    `<tr><th scope="row">${esc(c.rows[r].label)}</th><td>${esc(c.rows[r].us)}</td><td>${esc(c.rows[r].solibri)}</td><td>${esc(c.rows[r].flinker)}</td></tr>`,
  ).join('\n')
  return [
    `<section><h2>${esc(c.title)}</h2><p>${esc(c.sub)}</p>`,
    `<table><thead><tr><td></td><th scope="col">IFC Viewer Online</th><th scope="col">Solibri</th><th scope="col">Flinker</th></tr></thead><tbody>`,
    rows,
    `</tbody></table><p>${esc(c.note)} <a href="${SITE}/${solibriPath(lang)}">${esc(c.more)}</a></p></section>`,
  ].join('\n')
}

/**
 * This language's own landings. Every Spanish landing the hand-authored /es/
 * page linked (validator, editor, classification, health check) is here.
 */
function landingLinks(lang: Lang, t: LandingLocale): string[] {
  const shots = SHOWCASE_COPY[lang].shots
  return [
    `<li><a href="${SITE}/${lang}/fix/">${esc(t.fixGuides?.title ?? 'Fix IFC validation errors')}</a></li>`,
    `<li><a href="${SITE}/${validatorPath(lang)}">${esc(shots.validation.cta)}</a></li>`,
    `<li><a href="${SITE}/${examplesPath(lang)}">${esc(shots.skyline.cta)}</a></li>`,
    ...toolLandings(lang).map((l) => `<li><a href="${SITE}/${l.path}">${esc(l.label)}</a></li>`),
    `<li><a href="${SITE}${pricingPath(lang)}">${esc(t.nav?.pricing ?? 'Pricing')}</a></li>`,
    `<li><a href="${SITE}/${lang}/blog/">Blog</a></li>`,
  ]
}

/** The ten homes, each named in its own language and by the term it is searched with. */
function languageLinks(): string {
  return ALL_LANGS.map((l) =>
    `<li><a href="${SITE}${homePath(l)}" hreflang="${l}" lang="${l}">${esc(HOME_LANGUAGE_NAMES[l])}: ${esc(HOME_COPY[l].kicker)}</a></li>`,
  ).join('')
}

function noscriptBlock(lang: Lang, t: LandingLocale): string {
  const features = t.features.map((f) => `<article><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></article>`).join('\n')
  const faq      = t.faq.map((i) => `<div><h3>${esc(i.q)}</h3><p>${esc(i.a)}</p></div>`).join('\n')

  const links = landingLinks(lang, t)

  return [
    '<noscript>',
    // Same h1 as the rendered page (home-copy.ts): search term, then the result.
    `<h1>${esc(HOME_COPY[lang].kicker)}: ${esc(HOME_COPY[lang].h1)}</h1>`,
    `<p>${esc(t.hero.subtitleFull)}</p>`,
    // The page's pictures, with alt text in this language (home-images.ts).
    noscriptFigures(lang),
    guideBlock(lang),
    compareBlock(lang),
    `<section><h2>${esc(t.featuresSection.title)}</h2><p>${esc(t.featuresSection.subtitle)}</p>${features}</section>`,
    `<section><h2>${esc(t.faqSection.title)}</h2>${faq}</section>`,
    `<ul>${links.join('')}</ul>`,
    `<ul>${languageLinks()}</ul>`,
    '</noscript>',
  ].filter(Boolean).join('\n')
}

/** WebPage + SoftwareApplication + FAQPage, all in the shell's own language. */
function jsonLdFor(lang: Lang, t: LandingLocale, canonical: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type':      'WebPage',
        '@id':        canonical,
        url:          canonical,
        name:         `${t.hero.h1} ${t.hero.h1Accent}`,
        description:  t.hero.subtitleFull,
        isPartOf:     { '@id': `${SITE}/` },
        inLanguage:   lang,
        primaryImageOfPage: { '@id': imageObjects(lang)[0]['@id'] },
        image:        imageObjects(lang),
      },
      {
        '@type':             'SoftwareApplication',
        name:                'IFC Viewer Online',
        url:                 canonical,
        applicationCategory: 'Software AEC / BIM',
        offers:              { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList:         t.features.slice(0, 8).map((f) => f.title),
        inLanguage:          lang,
      },
      {
        '@type': 'FAQPage',
        // The «open an IFC file» answers are questions on the page too.
        mainEntity: [...(HOME_GUIDE[lang]?.items ?? []), ...t.faq].map((i) => ({
          '@type':        'Question',
          name:           i.q,
          acceptedAnswer: { '@type': 'Answer', text: i.a },
        })),
      },
    ],
  }
}

// ── Sitemap ───────────────────────────────────────────────────────────────────

function sitemapEntry(lang: Lang, lastmod: string): string {
  const loc = `${SITE}${homePath(lang)}`
  const alts = ALL_LANGS.map(
    (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${homePath(l)}" />`,
  )
  alts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/" />`)
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>0.9</priority>',
    ...alts,
    '  </url>',
  ].join('\n')
}

// ── Entry point ───────────────────────────────────────────────────────────────

export interface LangShellsResult {
  /** Shells written (one per generated language). */
  shells: number
  /** Shells that failed to render/write (0 = clean). */
  errors: number
  /** Whether sitemap.xml gained any entry this run. */
  sitemap: boolean
  /** How many <url> blocks were appended. */
  sitemapAdded: number
}

/**
 * Write dist/<lang>/index.html for every language in GENERATED, and register
 * every localized home in dist/sitemap.xml.
 */
export function generateLangShells(distDir: string): LangShellsResult {
  const result: LangShellsResult = { shells: 0, errors: 0, sitemap: false, sitemapAdded: 0 }

  const indexPath = path.join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    console.warn('[lang-shells] dist/index.html not found — skipping language shell generation.')
    return result
  }
  const template = readFileSync(indexPath, 'utf-8')
  const today = new Date().toISOString().slice(0, 10)

  for (const lang of GENERATED) {
    try {
      const localeFile = path.resolve(__dirname, '..', '..', 'src', 'locales', lang, 'landing.json')
      const t: unknown = JSON.parse(readFileSync(localeFile, 'utf-8'))
      assertLocale(lang, t)

      const canonical   = `${SITE}${homePath(lang)}`
      // ── WHAT THE LISTING SHOWS vs. WHAT THE PAGE SAYS ────────────────────
      // These used to be the hero copy, reused verbatim. That copy is written
      // to be read on the page, so it is long: measured on the live site, the
      // home descriptions ran 186–288 characters against the ~160 Google
      // renders, and the English root page lost 128 characters of its own
      // pitch off the end of the listing.
      //
      // So a locale can carry `seo.title` / `seo.description`, written to the
      // budget. The hero derivation stays as the fallback, because a locale
      // that has not been given one is better served by long copy than by no
      // copy — and the guard in the test tells us which those are.
      const title       = t.seo?.title ?? `${t.hero.h1} ${t.hero.h1Accent} — ${t.hero.subtitle}`
      const description = t.seo?.description ?? t.hero.subtitleFull

      let html = tweakHead(template, { lang, title, description, canonical }, jsonLdFor(lang, t, canonical))
      html = html.replace('</body>', `${noscriptBlock(lang, t)}\n</body>`)

      const outDir = path.join(distDir, lang)
      mkdirSync(outDir, { recursive: true })
      writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8')
      result.shells++
    } catch (err) {
      result.errors++
      console.warn(`[lang-shells] failed to write /${lang}/: ${(err as Error).message}`)
    }
  }

  // Register every non-EN home. Idempotent per URL (same rule as the blog
  // generator): only append a <loc> that is absent, so hand-maintained entries —
  // the EN and /es/ ones in public/sitemap.xml, which list the same ten-language
  // cluster — stay untouched.
  const sitemapPath = path.join(distDir, 'sitemap.xml')
  if (existsSync(sitemapPath)) {
    const xml = readFileSync(sitemapPath, 'utf-8')
    const missing = ALL_LANGS
      .filter((l) => l !== 'en')
      .filter((l) => !xml.includes(`<loc>${SITE}${homePath(l)}</loc>`))
      .map((l) => sitemapEntry(l, today))

    if (missing.length > 0) {
      writeFileSync(
        sitemapPath,
        xml.replace('</urlset>', `\n  <!-- Localized app home pages -->\n${missing.join('\n\n')}\n\n</urlset>`),
        'utf-8',
      )
      result.sitemap = true
      result.sitemapAdded = missing.length
    }
  }

  return result
}
