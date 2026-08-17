// ── Static shells for the localized app home pages ────────────────────────────
//
// Problem this solves
// ───────────────────
// Only EN (/) and ES (/es/, a hand-authored static page in public/es/) ever had
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
// ES is deliberately NOT generated here. public/es/index.html is a hand-authored
// static landing (its own CSS, no SPA mount) that is currently the only language
// home Google has indexed, so it keeps its own file; Vite copies it to dist/es/
// before this generator runs and we leave it alone. Its <head> is maintained by
// hand — see the hreflang cluster note below.
//
// The hreflang cluster is emitted identically on all ten home pages. A cluster
// is only valid if every member links to every other member AND to itself; miss
// one and Google discards the lot, which is the usual reason a single language
// survives and the rest vanish.

import path from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { validatorPath } from './localized-landings'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')

/** Every language with a home page, in registry order. Drives the hreflang
 *  cluster on all of them. Mirrors LOCALE_REGISTRY in src/i18n/registry.ts. */
const ALL_LANGS = ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'th', 'ca'] as const

/** Languages whose shell THIS generator writes: everything except EN (which is
 *  dist/index.html itself) and ES (hand-authored, see the header note). */
const GENERATED = ['fr', 'de', 'pt', 'it', 'zh', 'ja', 'th', 'ca'] as const

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
  features:        Array<{ title: string; body: string }>
  faq:             Array<{ q: string; a: string }>
  /** Optional: present in every locale today, but the shell degrades gracefully
   *  to an English label rather than failing the build if a new locale lacks it. */
  fixGuides?:      { title: string }
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

  // Drop the template's own (EN-only) alternates before injecting the full
  // cluster, or the page would advertise two competing sets.
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')

  // Drop the template's hand-written English <noscript> block. noscriptBlock()
  // supplies the translated equivalent; leaving both would serve a German page
  // with an English <h1> ahead of its own.
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>\s*/g, '')

  const ld = `<script type="application/ld+json">${jsonEsc(JSON.stringify(jsonLd))}</script>`
  html = html.replace('</head>', `  ${hreflangCluster()}\n  ${ld}\n</head>`)

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
function noscriptBlock(lang: Lang, t: LandingLocale): string {
  const features = t.features.map((f) => `<article><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></article>`).join('\n')
  const faq      = t.faq.map((i) => `<div><h3>${esc(i.q)}</h3><p>${esc(i.a)}</p></div>`).join('\n')

  const links = [
    `<li><a href="${SITE}/${lang}/fix/">${esc(t.fixGuides?.title ?? 'Fix IFC validation errors')}</a></li>`,
    `<li><a href="${SITE}/${validatorPath(lang)}">${esc(t.hero.subtitle)}</a></li>`,
  ]

  return [
    '<noscript>',
    `<h1>${esc(t.hero.h1)} ${esc(t.hero.h1Accent)}</h1>`,
    `<p>${esc(t.hero.subtitleFull)}</p>`,
    `<section><h2>${esc(t.featuresSection.title)}</h2><p>${esc(t.featuresSection.subtitle)}</p>${features}</section>`,
    `<section><h2>${esc(t.faqSection.title)}</h2>${faq}</section>`,
    `<ul>${links.join('')}</ul>`,
    '</noscript>',
  ].join('\n')
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
        mainEntity: t.faq.map((i) => ({
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
 * every localized home (ES included) in dist/sitemap.xml.
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
      const title       = `${t.hero.h1} ${t.hero.h1Accent} — ${t.hero.subtitle}`
      const description = t.hero.subtitleFull

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
  // including the existing /es/ one in public/sitemap.xml — stay untouched.
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
