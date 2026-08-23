// Regression tests for the programmatic SEO fix-page generator.
//
// Runs the real generator into a throwaway output dir whose PARENT is the repo
// root, so its internal `path.resolve(distDir, '..', 'src', 'locales')` resolves
// to the real locale files. No localized og-image-*.png are present in the test
// dir, which also exercises the graceful OG-image fallback path.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'fs'
import { generateFixPages, TITLE_BUDGET, type FixPagesResult } from './generate-fix-pages'
import { fixGuideUrl, fixGuideSlug } from '../../src/lib/fix-guide-url'

const SITE = 'https://www.ifcvieweronline.eu'
const OUT = path.join(process.cwd(), '.seo-test-out')
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
  beforeAll(() => { titles = pages().map((f) => ({ f, title: titleOf(f) })) })

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
