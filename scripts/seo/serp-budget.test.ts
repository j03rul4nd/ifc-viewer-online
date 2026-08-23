// ─── what a search listing actually shows ─────────────────────────────────────
// Google renders roughly 60 characters of a <title> and 160 of a description,
// and drops the rest. A listing whose headline is chopped mid-word gets the
// impression and not the click, which is the shape of the problem this came
// from: impressions climbing, nobody selecting.
//
// Measured across all 417 URLs in the live sitemap before any of this changed:
//
//   /fix/ rule pages   279 of 306 titles over 60, median 77, worst 104
//   home (10 langs)    descriptions 186–288, because they reused the hero copy
//   root /             title 69, description 288 — 128 characters never shown
//
// The rule-fix side is guarded in generate-fix-pages.test.ts. This covers the
// home pages, which are the highest-value listings on the site.
//
// The check is on the SOURCE rather than on built output: it has to fail while
// someone is editing copy, not after a deploy.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** What Google renders. Characters are the usual proxy for its pixel budget. */
const TITLE_BUDGET = 60
const DESC_BUDGET = 160

const root = resolve(__dirname, '../..')
const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'] as const

interface Landing {
  hero: { h1: string; h1Accent: string; subtitle: string; subtitleFull: string }
  seo?: { title?: string; description?: string }
}

function landing(lang: string): Landing {
  return JSON.parse(readFileSync(resolve(root, `src/locales/${lang}/landing.json`), 'utf8'))
}

/** The same derivation generate-lang-shells.ts uses, fallback included. */
function shellMeta(lang: string): { title: string; description: string } {
  const t = landing(lang)
  return {
    title: t.seo?.title ?? `${t.hero.h1} ${t.hero.h1Accent} — ${t.hero.subtitle}`,
    description: t.seo?.description ?? t.hero.subtitleFull,
  }
}

/**
 * The two hand-authored home pages.
 *
 * EN is the root template the generator copies; ES is deliberately excluded
 * from generation and maintained by hand. Neither is reached by the locale
 * change, so both are checked directly — and each is tied to its locale's
 * `seo` block so the two copies of one pitch cannot drift apart.
 */
const HAND_AUTHORED = [
  { lang: 'en', file: 'index.html' },
  { lang: 'es', file: 'public/es/index.html' },
] as const

const grabFrom = (html: string, re: RegExp): string => (html.match(re) || [])[1] ?? ''

describe('home page search listings', () => {
  it('is reading real copy, so the checks below are not vacuous', () => {
    // A locale file that moved, or a renamed key, would otherwise turn every
    // assertion here into a comparison of two empty strings.
    for (const lang of LANGS) {
      const m = shellMeta(lang)
      expect(m.title.length, `${lang} title`).toBeGreaterThan(10)
      expect(m.description.length, `${lang} description`).toBeGreaterThan(30)
    }
  })

  it('keeps every language’s title inside what Google renders', () => {
    const over = LANGS
      .map((lang) => ({ lang, len: shellMeta(lang).title.length }))
      .filter((x) => x.len > TITLE_BUDGET)
      .map((x) => `${x.lang} ${x.len}`)
    expect(over, 'home titles Google will truncate').toEqual([])
  })

  it('keeps every language’s description inside what Google renders', () => {
    // These were the hero copy verbatim — written to be read on the page, so
    // 186–288 characters. A locale with no `seo.description` still falls back
    // to that copy, and this is what says so.
    const over = LANGS
      .map((lang) => ({ lang, len: shellMeta(lang).description.length }))
      .filter((x) => x.len > DESC_BUDGET)
      .map((x) => `${x.lang} ${x.len}`)
    expect(over, 'home descriptions Google will cut off').toEqual([])
  })
})

describe.each(HAND_AUTHORED)('the hand-authored $lang home', ({ lang, file }) => {
  const html = readFileSync(resolve(root, file), 'utf8')
  const title = grabFrom(html, /<title>([^<]*)<\/title>/)
  const description = grabFrom(html, /<meta\s+name="description"\s+content="([^"]*)"/)

  it('has a title and description at all', () => {
    expect(title.length).toBeGreaterThan(10)
    expect(description.length).toBeGreaterThan(30)
  })

  it('stays inside both budgets', () => {
    expect(title.length, `${file} title is ${title.length}`).toBeLessThanOrEqual(TITLE_BUDGET)
    expect(description.length, `${file} description is ${description.length}`)
      .toBeLessThanOrEqual(DESC_BUDGET)
  })

  it('says the same thing as its locale', () => {
    // One pitch per language, even when it lives in two files.
    expect(description).toBe(landing(lang).seo?.description)
  })

  it('leaves the social tags alone, since they are not budget-bound', () => {
    // og: and twitter: surfaces render far more than a search result does.
    // Compressing them to 160 would throw away detail for no gain, so this
    // states that the long forms are deliberate rather than overlooked.
    const og = grabFrom(html, /<meta\s+property="og:description"\s+content="([^"]*)"/)
    expect(og.length).toBeGreaterThan(DESC_BUDGET - 40)
  })
})

// ─── the hand-authored landing pages ──────────────────────────────────────────
// 43 static files under public/, one per marketing page per language. Measured
// before this changed: 20 titles over 60 (worst 71) and 34 descriptions over
// 160, median 235 — so roughly a third of every landing's pitch was written
// for a listing that never showed it.
//
// Every page is discovered rather than listed, so a landing added tomorrow is
// covered without anyone remembering to add it here. That is the whole point:
// the previous versions of this problem all came from a second list drifting.

/** Directories under public/ that are generated or are not landing pages. */
const NOT_LANDINGS = new Set(['blog', 'fix', 'sdk', 'embed', 'fonts', 'models'])

interface Landed { url: string; file: string; title: string; description: string }

function landingPages(): Landed[] {
  const out: Landed[] = []
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (NOT_LANDINGS.has(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, `${rel}${e.name}/`)
      else if (e.name === 'index.html') {
        const html = readFileSync(p, 'utf8')
        out.push({
          url: `/${rel}`,
          file: p,
          title: grabFrom(html, /<title>([^<]*)<\/title>/),
          description: grabFrom(html, /<meta\s+name="description"\s+content="([^"]*)"/),
        })
      }
    }
  }
  walk(resolve(root, 'public'), '')
  return out
}

describe('landing page search listings', () => {
  const pages = landingPages()

  it('finds the landing pages at all', () => {
    // A moved directory or a renamed skip-list entry would otherwise make every
    // assertion below pass over an empty array.
    expect(pages.length).toBeGreaterThan(30)
    expect(pages.every((p) => p.title.length > 5 && p.description.length > 20)).toBe(true)
  })

  it('keeps every title inside what Google renders', () => {
    const over = pages
      .filter((p) => p.title.length > TITLE_BUDGET)
      .map((p) => `${p.url} ${p.title.length}`)
    expect(over, 'landing titles Google will truncate').toEqual([])
  })

  it('keeps every description inside what Google renders', () => {
    const over = pages
      .filter((p) => p.description.length > DESC_BUDGET)
      .map((p) => `${p.url} ${p.description.length}`)
    expect(over, 'landing descriptions Google will cut off').toEqual([])
  })

  it('does not spend the budget on a title so short it says nothing', () => {
    // The opposite failure, and the easy way to satisfy a budget check: trim
    // everything to three words and lose the keywords that earn the ranking.
    const thin = pages.filter((p) => p.title.length < 20).map((p) => p.url)
    expect(thin, 'landing titles too short to carry a keyword').toEqual([])
  })
})
