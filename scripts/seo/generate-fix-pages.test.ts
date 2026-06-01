// Regression tests for the programmatic SEO fix-page generator.
//
// Runs the real generator into a throwaway output dir whose PARENT is the repo
// root, so its internal `path.resolve(distDir, '..', 'src', 'locales')` resolves
// to the real locale files. No localized og-image-*.png are present in the test
// dir, which also exercises the graceful OG-image fallback path.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { generateFixPages, type FixPagesResult } from './generate-fix-pages'

const SITE = 'https://j03rul4nd.github.io/ifc-viewer-online'
const OUT = path.join(process.cwd(), '.seo-test-out')
const LANGS = ['', 'es/', 'de/', 'fr/', 'pt/', 'it/', 'ca/', 'zh/', 'ja/', 'th/'] as const

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

  it('emits reciprocal hreflang for every language + x-default', () => {
    const html = readFileSync(file, 'utf8')
    for (const l of ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']) {
      expect(html).toContain(`hreflang="${l}"`)
    }
    expect(html).toContain('hreflang="x-default"')
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
  it('injects every per-language URL into the sitemap and keeps it well-formed', () => {
    const xml = readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8')
    for (const lp of LANGS) {
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
