// Regression tests for the programmatic SEO fix-page generator.
//
// Runs the real generator into a throwaway output dir whose PARENT is the repo
// root, so its internal `path.resolve(distDir, '..', 'src', 'locales')` resolves
// to the real locale files. No localized og-image-*.png are present in the test
// dir, which also exercises the graceful OG-image fallback path.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'fs'
import { generateFixPages, HUB_IMAGE, TITLE_BUDGET, UIS, type FixPagesResult } from './generate-fix-pages'
import { fixGuideUrl, fixGuideSlug } from '../../src/lib/fix-guide-url'
import { pricingPath } from '../../src/lib/pricing/pricing-paths'
import { toolLandings, validatorPath } from '../../src/lib/localized-landings'
import { BLOG_POSTS } from '../../src/lib/blog-posts'

const SITE = 'https://www.ifcvieweronline.eu'
const ROOT = process.cwd()
const OUT = path.join(ROOT, '.seo-test-out')
const LANGS = ['', 'es/', 'de/', 'fr/', 'pt/', 'it/', 'ca/', 'zh/', 'ja/', 'th/'] as const

/** The languages we ask Google to index — the ones INDEXED_LANGS in the
 *  generator lists. The other four are still generated and still linked from
 *  the language switcher; they are just kept out of the sitemap and out of the
 *  hreflang clusters, and carry `noindex, follow`. */
const INDEXED = ['', 'es/', 'de/', 'fr/', 'pt/', 'it/'] as const
const NOINDEX = ['ca/', 'zh/', 'ja/', 'th/'] as const

let result: FixPagesResult

beforeAll(() => {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  // Minimal sitemap so the injection path is exercised.
  writeFileSync(
    path.join(OUT, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n</urlset>\n',
  )
  // Minimal llms.txt so the AI-discoverability injection path is exercised.
  writeFileSync(path.join(OUT, 'llms.txt'), '# IFC Viewer Online\n\n## Related pages\n')
  result = generateFixPages(OUT)
})

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true })
})

describe('generateFixPages — summary', () => {
  it('completes with no errors across all languages', () => {
    expect(result.errors).toBe(0)
    expect(result.langs).toBe(10)
    expect(result.hubs).toBe(10)
    expect(result.sitemap).toBe(true)
    expect(result.llms).toBe(true)
  })

  it('writes the same number of rule pages per language', () => {
    expect(result.pages).toBeGreaterThan(300) // 10 langs × ~36 rules
    expect(result.pages % result.langs).toBe(0)
  })

  it('writes category silo pages, evenly across languages', () => {
    expect(result.categories).toBeGreaterThan(0)
    expect(result.categories % result.langs).toBe(0)
    // 8 categories × 10 languages
    expect(result.categories).toBe(80)
  })
})

describe('generateFixPages — EN rule page', () => {
  const file = path.join(OUT, 'fix', 'missing-type', 'index.html')

  it('exists and declares the right lang + canonical', () => {
    const html = readFileSync(file, 'utf8')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain(`rel="canonical" href="${SITE}/fix/missing-type/"`)
  })

  it('carries the full SEO + browser head', () => {
    const html = readFileSync(file, 'utf8')
    expect(html).toContain('name="theme-color"')
    expect(html).toContain('rel="icon"')
    expect(html).toContain('property="og:image:alt"')
    expect(html).toContain('viewport-fit=cover')
  })

  it('emits reciprocal hreflang for every indexed language + x-default', () => {
    const html = readFileSync(file, 'utf8')
    for (const l of ['en', 'es', 'de', 'fr', 'pt', 'it']) {
      expect(html).toContain(`hreflang="${l}"`)
    }
    expect(html).toContain('hreflang="x-default"')
  })

  it('leaves the noindex languages out of the hreflang cluster', () => {
    // A cluster that names a page Google will not index is discarded whole, so
    // the noindex set has to be absent here, not merely marked.
    const html = readFileSync(file, 'utf8')
    for (const l of ['ca', 'zh', 'ja', 'th']) {
      expect(html, l).not.toContain(`hreflang="${l}"`)
    }
  })

  it('marks indexed languages index,follow and the rest noindex,follow', () => {
    for (const lp of INDEXED) {
      const html = readFileSync(path.join(OUT, lp, 'fix', 'missing-type', 'index.html'), 'utf8')
      expect(html, lp).toContain('name="robots" content="index, follow"')
    }
    for (const lp of NOINDEX) {
      const html = readFileSync(path.join(OUT, lp, 'fix', 'missing-type', 'index.html'), 'utf8')
      expect(html, lp).toContain('name="robots" content="noindex, follow"')
    }
  })

  it('does not repeat the authoring-tool fixes in the visible step cards', () => {
    // The per-tool fixes are the page's only genuinely unique paragraphs. They
    // used to be printed twice — once in the causes table, once clipped to 150
    // chars in the numbered steps — which is exactly what a duplicate-content
    // check picks up on 420 templated pages. The JSON-LD HowTo still carries
    // the full sequence; the visible cards are workflow-only.
    const html = readFileSync(file, 'utf8')
    const body = html.slice(html.indexOf('<body'))
    expect(body).toContain('<td>')          // the causes table is still there
    expect(body).not.toContain('Fix in Revit')
    expect(html).toContain('"name": "Fix in Revit"') // …but JSON-LD keeps it
  })

  it('falls back to the generic OG image when no localized image is present', () => {
    const html = readFileSync(file, 'utf8')
    expect(html).toContain(`content="${SITE}/og-image.png"`)
    expect(html).not.toContain('og-image-en.png')
  })

  it('includes a visible language switcher with the current language active', () => {
    const html = readFileSync(file, 'utf8')
    expect(html).toContain('class="lang-switch"')
    expect((html.match(/class="lang-link/g) ?? []).length).toBe(10)
    expect(html).toMatch(/lang-active"[^>]*aria-current="true">EN/)
    // relative links to the same rule in other languages
    expect(html).toContain('href="../../es/fix/missing-type/"')
    expect(html).toContain('href="../../de/fix/missing-type/"')
  })

  it('contains valid JSON-LD with WebPage + BreadcrumbList + HowTo', () => {
    const html = readFileSync(file, 'utf8')
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(m).toBeTruthy()
    const json = JSON.parse(m![1]) as { '@graph': { '@type': string }[] }
    const types = json['@graph'].map((g) => g['@type'])
    expect(types).toEqual(['WebPage', 'BreadcrumbList', 'HowTo'])
  })
})

describe('generateFixPages — localization', () => {
  it('emits a localized ES page at the /es/ prefix', () => {
    const html = readFileSync(path.join(OUT, 'es', 'fix', 'missing-type', 'index.html'), 'utf8')
    expect(html).toContain('<html lang="es">')
    expect(html).toContain(`rel="canonical" href="${SITE}/es/fix/missing-type/"`)
  })

  it('writes a hub per language', () => {
    for (const lp of LANGS) {
      expect(existsSync(path.join(OUT, lp, 'fix', 'index.html'))).toBe(true)
    }
  })
})

describe('generateFixPages — category pages', () => {
  const file = path.join(OUT, 'fix', 'category', 'spatial', 'index.html')

  it('exists with the right canonical + lang + category-scoped hreflang', () => {
    const html = readFileSync(file, 'utf8')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain(`rel="canonical" href="${SITE}/fix/category/spatial/"`)
    // hreflang alternates point at the category path, not the rule path
    expect(html).toContain(`hreflang="es" href="${SITE}/es/fix/category/spatial/"`)
    expect(html).toContain('hreflang="x-default"')
  })

  it('links back to the hub and across to its rule pages', () => {
    const html = readFileSync(file, 'utf8')
    expect(html).toContain('href="../../"') // up to the hub
    expect(html).toContain('href="../../spatial-hierarchy/') // a spatial rule
  })

  it('carries CollectionPage + BreadcrumbList + ItemList JSON-LD', () => {
    const html = readFileSync(file, 'utf8')
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(m).toBeTruthy()
    const json = JSON.parse(m![1]) as { '@graph': { '@type': string }[] }
    const types = json['@graph'].map((g) => g['@type'])
    expect(types).toEqual(['CollectionPage', 'BreadcrumbList', 'ItemList'])
  })

  it('writes a localized category page under the /es/ prefix', () => {
    const html = readFileSync(path.join(OUT, 'es', 'fix', 'category', 'spatial', 'index.html'), 'utf8')
    expect(html).toContain('<html lang="es">')
    expect(html).toContain(`rel="canonical" href="${SITE}/es/fix/category/spatial/"`)
  })

  it('is reachable from the hub (heading links to the category)', () => {
    const hub = readFileSync(path.join(OUT, 'fix', 'index.html'), 'utf8')
    expect(hub).toContain('href="./category/spatial/"')
  })

  it('sends hub readers on to the checker guide, the plans and (classification) the checker', () => {
    // Every link must land on a page that is published: the pillar post (not
    // a retired one), the localized pricing page, the classification landing.
    const published = new Set([
      ...LANGS.map((lp) => `/${lp}blog/ifc-model-checker/`),
      ...LANGS.map((lp) => pricingPath(lp.replace('/', '') || 'en')),
      ...LANGS.flatMap((lp) => toolLandings(lp.replace('/', '') || 'en').map((t) => `/${t.path}`)),
    ])
    expect(BLOG_POSTS.some((p) => p.slug === 'ifc-model-checker')).toBe(true)
    for (const lp of LANGS) {
      for (const [page, n] of [[`${lp}fix/`, 2], [`${lp}fix/category/classification/`, 3]] as const) {
        const html = readFileSync(path.join(OUT, page, 'index.html'), 'utf8')
        const block = html.match(/<p class="hub-next">(.*?)<\/p>/)?.[1] ?? ''
        const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1], `https://x/${page}`).pathname)
        expect(hrefs, page).toHaveLength(n)
        for (const h of hrefs) expect(published.has(h), `${page} → ${h}`).toBe(true)
      }
    }
  })
})

describe('generateFixPages — the hub is the reference of the errors, not the tool page', () => {
  // Search Console 2026-11-10: the hub was shown for "ifc model validation"
  // (768 impressions, position 67). The validator landing owns that query.
  it('links the validator landing and the checker comparison with the query as anchor', () => {
    expect(BLOG_POSTS.some((p) => p.slug === 'best-ifc-model-checkers-2026')).toBe(true)
    for (const lp of LANGS) {
      const lang = (lp.replace('/', '') || 'en') as keyof typeof UIS
      const html = readFileSync(path.join(OUT, `${lp}fix/`, 'index.html'), 'utf8')
      const block = html.match(/<p class="hub-next hub-owners">(.*?)<\/p>/)?.[1] ?? ''
      const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1], `https://x/${lp}fix/`).pathname)
      expect(hrefs, lp).toEqual([`/${validatorPath(lang)}`, `/${lp}blog/best-ifc-model-checkers-2026/`])
      expect(existsSync(path.join(ROOT, 'public', validatorPath(lang), 'index.html')), lp).toBe(true)
      expect(block).toContain(UIS[lang].hubValidate)
    }
  })

  it('has a table of every category and a capture with its own alt text per language', () => {
    expect(existsSync(path.join(ROOT, 'public', HUB_IMAGE.src))).toBe(true)
    expect(existsSync(path.join(ROOT, 'public', HUB_IMAGE.small))).toBe(true)
    const alts = new Set<string>()
    for (const lp of LANGS) {
      const lang = (lp.replace('/', '') || 'en') as keyof typeof UIS
      const html = readFileSync(path.join(OUT, `${lp}fix/`, 'index.html'), 'utf8')
      const table = html.match(/<table class="causes-table hub-table">[\s\S]*?<\/table>/)?.[0] ?? ''
      expect((table.match(/<tr><th scope="row">/g) ?? []).length, lp).toBeGreaterThanOrEqual(6)
      expect(table).toContain('href="./category/spatial/"')
      const img = html.match(/<img src="[^"]*ifc-validation-errors-by-rule\.jpg"[^>]*>/)?.[0] ?? ''
      expect(img, lp).toContain('width="1600"')
      expect(html).toMatch(/"representativeOfPage":\s*true/)
      alts.add(UIS[lang].hubImgAlt)
      expect(UIS[lang].hubImgAlt.length, lp).toBeGreaterThan(40)
    }
    expect(alts.size).toBe(LANGS.length)
  })
})

describe('generateFixPages — sitemap + skips', () => {
  it('injects every indexed-language URL into the sitemap and keeps it well-formed', () => {
    const xml = readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8')
    for (const lp of NOINDEX) {
      expect(xml, lp).not.toContain(`<loc>${SITE}/${lp}fix/missing-type/</loc>`)
    }
    for (const lp of INDEXED) {
      expect(xml).toContain(`<loc>${SITE}/${lp}fix/missing-type/</loc>`)
      expect(xml).toContain(`<loc>${SITE}/${lp}fix/</loc>`) // hub
      expect(xml).toContain(`<loc>${SITE}/${lp}fix/category/spatial/</loc>`) // category
    }
    expect(xml.trim().endsWith('</urlset>')).toBe(true)
  })

  it('does not generate pages for GUID rules (covered by the dedicated tool page)', () => {
    expect(existsSync(path.join(OUT, 'fix', 'duplicate-guid'))).toBe(false)
    expect(existsSync(path.join(OUT, 'fix', 'invalid-guid-format'))).toBe(false)
  })

  it('injects the "how to fix" section into llms.txt for AI discoverability', () => {
    const txt = readFileSync(path.join(OUT, 'llms.txt'), 'utf8')
    expect(txt).toContain('## How to fix IFC validation errors')
    expect(txt).toContain(`- All checks (hub): ${SITE}/fix/`)
    expect(txt).toContain(`${SITE}/fix/missing-type/`)
    // does not double-inject on a second run
    const r2 = generateFixPages(OUT)
    expect(r2.llms).toBe(false)
    const txt2 = readFileSync(path.join(OUT, 'llms.txt'), 'utf8')
    expect(txt2.match(/## How to fix IFC validation errors/g)).toHaveLength(1)
  })
})

// ── The app must link where the generator publishes ───────────────────────────
//
// The generator decides which guide pages exist; the ValidationPanel renders the
// links to them. Those two lived as separate word-for-word copies of the same
// routing rule — in the desktop panel, in the mobile panel, and here — so a
// change in one published links to pages nobody generated. The rule now lives in
// src/lib/fix-guide-url.ts and this asserts nobody has re-copied it.

describe('the app links where these pages actually are', () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
  const PANELS = {
    desktop: 'src/components/ValidationPanel.tsx',
    mobile: 'src/components/mobile/ValidationPanelMobile.tsx',
  }

  it('has no private copy of fixGuideUrl left in either panel', () => {
    for (const [name, file] of Object.entries(PANELS)) {
      const src = read(file)
      expect(src, `${name} redefines fixGuideUrl`).not.toMatch(/function\s+fixGuideUrl/)
      expect(src, `${name} does not import it`).toMatch(/import\s*\{[^}]*fixGuideUrl[^}]*\}\s*from\s*'[^']*lib\/fix-guide-url'/)
    }
  })

  it('generates a page at exactly the path the panel links to', () => {
    // The check that actually matters: resolve a link the way the app does, and
    // find that file on disk in every language.
    for (const lang of LANGS) {
      const url = fixGuideUrl('RULE_MISSING_TYPE', lang === '' ? 'en' : lang.slice(0, 2), '/')
      expect(url, lang).toBe(`/${lang}fix/missing-type/`)
      expect(existsSync(path.join(OUT, url.slice(1), 'index.html')), url).toBe(true)
    }
  })

  it('links the GUID rules to the hand-authored page, which it does not generate', () => {
    for (const ruleId of ['RULE_DUPLICATE_GUID', 'RULE_INVALID_GUID_FORMAT']) {
      expect(fixGuideUrl(ruleId, 'es', '/')).toBe('/tools/fix-duplicate-guids/')
      expect(existsSync(path.join(OUT, 'fix', fixGuideSlug(ruleId)))).toBe(false)
    }
  })
})

// ─── title budget ─────────────────────────────────────────────────────────────
// Google renders about 60 characters of a <title> and drops the rest.
//
// Measured on the live site before this was fixed: 279 of 306 fix pages were
// over 60, median 77, worst 104 — a French page whose boilerplate tail alone
// ("— validateur IFC en ligne gratuit") was 56 characters. Every one of those
// listings showed a chopped headline, which is the shape of the complaint that
// started this: impressions climbing, nobody clicking.
//
// The tail is optional now, so a page with a short rule name keeps the hook and
// a page with a long one spends every character on the words the searcher typed.
// This keeps it that way when a rule with a long name is added.

describe('search-result titles', () => {
  // Read once, in beforeAll rather than at collection time: the pages do not
  // exist until the suite's own beforeAll has generated them.
  //
  // Walking 510 directories and reading 510 files inside EVERY assertion put
  // each of these over the default timeout under full-suite CPU contention —
  // and only under contention, which is the most misleading way for a test to
  // fail. The work is identical for all three, so it belongs outside them.
  let titles: { f: string; title: string }[] = []
  // An explicit timeout, because this hook does real work: it walks 510
  // directories and reads 510 files. On an idle machine that is under a second;
  // sharing twelve cores with the rest of the suite it has come in over the
  // 5s default, which fails the whole describe with no assertion to point at.
  // The work is necessary and already done once rather than per assertion, so
  // the honest fix is to tell the runner how long it takes.
  beforeAll(() => { titles = pages().map((f) => ({ f, title: titleOf(f) })) }, 30_000)

  it('never exceeds the budget Google renders', () => {
    const over = titles
      .filter((p) => p.title.length > TITLE_BUDGET)
      .map((p) => `${p.title.length} ${p.f}: ${p.title}`)
    expect(over, 'titles Google will truncate').toEqual([])
  })

  it('is reading real titles, so the check above is not vacuous', () => {
    expect(titles.length).toBeGreaterThan(300)
    expect(titles.every((p) => p.title.length > 10)).toBe(true)
  })

  it('keeps the hook when there is room for it', () => {
    // Dropping the tail everywhere would also pass the budget check, and would
    // throw away the words that earn the click. Short rule names must keep it.
    const withTail = titles.filter((p) => p.title.includes(' — '))
    expect(withTail.length).toBeGreaterThan(titles.length / 2)
  })
})

/** Every generated page, as a path relative to the output root. */
function pages(): string[] {
  const out: string[] = []
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}${e.name}/`)
      else if (e.name === 'index.html') out.push(rel)
    }
  }
  walk(OUT, '')
  return out
}

function titleOf(rel: string): string {
  const html = readFileSync(path.join(OUT, rel, 'index.html'), 'utf8')
  return (html.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] ?? ''
}

describe('fix pages follow the colour system (docs/COLOR_SYSTEM.md)', () => {
  const html = () => readFileSync(path.join(OUT, 'fix', 'missing-type', 'index.html'), 'utf8')
  const css = () => html().match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const tokens = (block: string) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

  it('has a light theme and no white-alpha or stray hex colours', () => {
    expect(css()).toContain('@media (prefers-color-scheme: light)')
    expect(css()).not.toMatch(/rgba\(255,\s*255,\s*255/)
    const outsideTokens = css().replace(/:root\s*\{[^}]*\}/g, '').replace(/\.cta-primary[^}]*\}/, '')
    expect(outsideTokens.match(/#[0-9a-f]{3,6}\b/gi) ?? []).toEqual([])
  })

  it('keeps every text token readable on the canvas in both themes (WCAG AA)', () => {
    const [dark, light] = css().split('@media (prefers-color-scheme: light)')
    for (const t of [tokens(dark), { ...tokens(dark), ...tokens(light) }]) {
      for (const k of ['text', 'text-2', 'text-3', 'accent-text', 'warn', 'danger']) {
        expect(ratio(t[k], t.bg), `${k} on ${t.bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('has no filler label above each heading, and one h1', () => {
    expect(html()).not.toContain('class="section-label"')
    expect(html().match(/<h1[\s>]/g)).toHaveLength(1)
  })
})
