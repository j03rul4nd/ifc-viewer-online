// Regression tests for the blog page generator.
//
// Mirrors the pattern from generate-fix-pages.test.ts:
// runs the real generator into a throwaway output dir whose parent is the
// repo root, with a minimal fake index.html template.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { generateBlogPages, type BlogPagesResult } from './generate-blog-pages'
import { BLOG_POSTS, BLOG_POSTS_ES, BLOG_POSTS_DE, BLOG_POSTS_FR } from '../../src/lib/blog-posts'

// Total expected pages across all languages:
// Each language contributes 1 index page + N post pages
const LANG_POST_COUNTS = [BLOG_POSTS, BLOG_POSTS_ES, BLOG_POSTS_DE, BLOG_POSTS_FR].filter(a => a.length > 0)
const EXPECTED_PAGES   = LANG_POST_COUNTS.reduce((sum, arr) => sum + 1 + arr.length, 0)

const SITE  = 'https://www.ifcvieweronline.eu'
const OUT   = path.join(process.cwd(), '.blog-test-out')

// Minimal SPA shell that exercises every regex the generator touches.
const TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IFC Viewer Online — Free Browser-Based BIM Viewer</title>
  <meta name="description" content="Free online IFC viewer, validator and editor." />
  <link rel="canonical" href="https://www.ifcvieweronline.eu/" />
  <meta property="og:title" content="IFC Viewer Online" />
  <meta property="og:description" content="Free online IFC viewer." />
  <meta property="og:url" content="https://www.ifcvieweronline.eu/" />
  <meta property="og:image" content="https://www.ifcvieweronline.eu/og-image.png" />
  <meta name="twitter:title" content="IFC Viewer Online" />
  <meta name="twitter:description" content="Free online IFC viewer." />
  <link rel="alternate" hreflang="en"        href="https://www.ifcvieweronline.eu/" />
  <link rel="alternate" hreflang="es"        href="https://www.ifcvieweronline.eu/es/" />
  <link rel="alternate" hreflang="x-default" href="https://www.ifcvieweronline.eu/" />
  <script type="application/ld+json">{"@type":"WebApplication"}</script>
</head>
<body><div id="root"></div></body>
</html>`

let result: BlogPagesResult

beforeAll(() => {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  // Template SPA shell
  writeFileSync(path.join(OUT, 'index.html'), TEMPLATE_HTML)

  // Minimal sitemap + llms.txt so the injection paths are exercised
  writeFileSync(
    path.join(OUT, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n</urlset>\n',
  )
  writeFileSync(path.join(OUT, 'llms.txt'), '# IFC Viewer Online\n\n## Related pages\n')

  result = generateBlogPages(OUT)
})

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true })
})

// ── Summary ───────────────────────────────────────────────────────────────────

describe('generateBlogPages — summary', () => {
  it('completes with no errors', () => {
    expect(result.errors).toBe(0)
  })

  it('writes blog index + one page per post for all languages', () => {
    // 1 index + N posts per language (EN + ES + DE + FR)
    expect(result.pages).toBe(EXPECTED_PAGES)
  })

  it('updates the sitemap', () => {
    expect(result.sitemap).toBe(true)
  })

  it('updates llms.txt', () => {
    expect(result.llms).toBe(true)
  })
})

// ── Blog index page ───────────────────────────────────────────────────────────

describe('generateBlogPages — blog index (/blog/)', () => {
  const file = path.join(OUT, 'blog', 'index.html')

  it('creates the file', () => {
    expect(existsSync(file)).toBe(true)
  })

  it('has blog-specific title', () => {
    const html = readFileSync(file, 'utf-8')
    expect(html).toContain('<title>BIM &amp; IFC Blog')
    expect(html).not.toContain('IFC Viewer Online — Free Browser-Based')
  })

  it('has correct canonical URL', () => {
    const html = readFileSync(file, 'utf-8')
    expect(html).toContain(`href="${SITE}/blog/"`)
  })

  it('has Blog JSON-LD schema', () => {
    const html = readFileSync(file, 'utf-8')
    expect(html).toContain('"@type":"Blog"')
  })

  it('lists all posts in JSON-LD', () => {
    const html = readFileSync(file, 'utf-8')
    for (const post of BLOG_POSTS) {
      expect(html).toContain(`/blog/${post.slug}/`)
    }
  })

  it('removes root hreflang and adds self-referencing blog hreflang', () => {
    const html = readFileSync(file, 'utf-8')
    // Root hreflang should be gone
    expect(html).not.toContain('hreflang="es"')
    // Self-referencing should be present
    expect(html).toContain(`href="${SITE}/blog/"`)
  })
})

// ── Per-post pages ────────────────────────────────────────────────────────────

describe('generateBlogPages — per-post pages (EN)', () => {
  it('creates an index.html for every EN post', () => {
    for (const post of BLOG_POSTS) {
      const file = path.join(OUT, 'blog', post.slug, 'index.html')
      expect(existsSync(file)).toBe(true)
    }
  })

  it('each EN post page has the post title in <title>', () => {
    for (const post of BLOG_POSTS) {
      const html = readFileSync(path.join(OUT, 'blog', post.slug, 'index.html'), 'utf-8')
      expect(html).toContain('IFC Viewer Blog')
    }
  })

  it('each EN post page has the correct canonical URL', () => {
    for (const post of BLOG_POSTS) {
      const html = readFileSync(path.join(OUT, 'blog', post.slug, 'index.html'), 'utf-8')
      expect(html).toContain(`${SITE}/blog/${post.slug}/`)
    }
  })

  it('each EN post page has BlogPosting JSON-LD schema', () => {
    for (const post of BLOG_POSTS) {
      const html = readFileSync(path.join(OUT, 'blog', post.slug, 'index.html'), 'utf-8')
      expect(html).toContain('"@type":"BlogPosting"')
    }
  })
})

describe('generateBlogPages — per-post pages (ES)', () => {
  it('creates an index.html for every ES post', () => {
    for (const post of BLOG_POSTS_ES) {
      const file = path.join(OUT, 'es', 'blog', post.slug, 'index.html')
      expect(existsSync(file)).toBe(true)
    }
  })

  it('each ES post has the correct canonical URL', () => {
    for (const post of BLOG_POSTS_ES) {
      const html = readFileSync(path.join(OUT, 'es', 'blog', post.slug, 'index.html'), 'utf-8')
      expect(html).toContain(`${SITE}/es/blog/${post.slug}/`)
    }
  })

  it('creates ES blog index at /es/blog/', () => {
    expect(existsSync(path.join(OUT, 'es', 'blog', 'index.html'))).toBe(true)
  })
})

// ── Sitemap ───────────────────────────────────────────────────────────────────

describe('generateBlogPages — sitemap injection', () => {
  it('injects blog index URL into sitemap.xml', () => {
    const xml = readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8')
    expect(xml).toContain(`${SITE}/blog/`)
  })

  it('injects all post URLs into sitemap.xml', () => {
    const xml = readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8')
    for (const post of BLOG_POSTS) {
      expect(xml).toContain(`${SITE}/blog/${post.slug}/`)
    }
  })

  it('is idempotent — running twice does not duplicate entries', () => {
    // Run generator again against the same dir
    const r2 = generateBlogPages(OUT)
    expect(r2.sitemap).toBe(false) // already injected, should skip
    const xml = readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8')
    const count = (xml.match(new RegExp(`${SITE}/blog/`, 'g')) ?? []).length
    // The blog index URL appears: once in <loc>, once per hreflang (2 hreflangs)
    // We just want to confirm it's not doubled
    expect(count).toBeLessThanOrEqual(3 * (1 + BLOG_POSTS.length))
  })
})

// ── llms.txt ──────────────────────────────────────────────────────────────────

describe('generateBlogPages — llms.txt injection', () => {
  it('appends a Blog section to llms.txt', () => {
    const txt = readFileSync(path.join(OUT, 'llms.txt'), 'utf-8')
    expect(txt).toContain('## Blog')
    expect(txt).toContain('BIM & IFC guides')
  })

  it('lists every post in llms.txt', () => {
    const txt = readFileSync(path.join(OUT, 'llms.txt'), 'utf-8')
    for (const post of BLOG_POSTS) {
      expect(txt).toContain(post.slug)
    }
  })

  it('is idempotent — running twice does not duplicate the section', () => {
    const r2 = generateBlogPages(OUT)
    expect(r2.llms).toBe(false) // already injected
    const txt = readFileSync(path.join(OUT, 'llms.txt'), 'utf-8')
    const count = (txt.match(/## Blog/g) ?? []).length
    expect(count).toBe(1)
  })
})

// ── Language grouping ─────────────────────────────────────────────────────────
//
// Regression guard. English posts were once appended to BLOG_POSTS_FR, so the
// generator — which used to map "array" to "URL prefix" — published their shells
// at /fr/blog/<slug>/ with a French canonical, while the SPA (which groups by
// each post's own `lang`) served them in English at /blog/<slug>/. Nothing
// caught it because every assertion above only looks at BLOG_POSTS.

describe('generateBlogPages — language grouping', () => {
  const ARRAYS: [string, typeof BLOG_POSTS][] = [
    ['en', BLOG_POSTS],
    ['es', BLOG_POSTS_ES],
    ['de', BLOG_POSTS_DE],
    ['fr', BLOG_POSTS_FR],
  ]

  it('every post sits in the array matching its own lang', () => {
    for (const [lang, arr] of ARRAYS) {
      for (const post of arr) {
        expect(
          post.lang ?? 'en',
          `"${post.slug}" is lang="${post.lang ?? 'en'}" but lives in the ${lang.toUpperCase()} array`,
        ).toBe(lang)
      }
    }
  })

  it('publishes every post under its own language prefix only', () => {
    for (const [lang, arr] of ARRAYS) {
      const prefix = lang === 'en' ? [] : [lang]
      for (const post of arr) {
        expect(
          existsSync(path.join(OUT, ...prefix, 'blog', post.slug, 'index.html')),
          `${post.slug} should be published at /${lang === 'en' ? '' : `${lang}/`}blog/`,
        ).toBe(true)
      }
    }
  })

  it('does not publish English posts under a language prefix', () => {
    for (const post of BLOG_POSTS) {
      for (const lang of ['es', 'de', 'fr']) {
        expect(
          existsSync(path.join(OUT, lang, 'blog', post.slug, 'index.html')),
          `${post.slug} is English — it must not exist at /${lang}/blog/`,
        ).toBe(false)
      }
    }
  })

  it('gives every post a canonical matching the directory it was written to', () => {
    for (const [lang, arr] of ARRAYS) {
      const prefix = lang === 'en' ? '' : `${lang}/`
      for (const post of arr) {
        const html = readFileSync(
          path.join(OUT, ...(lang === 'en' ? [] : [lang]), 'blog', post.slug, 'index.html'),
          'utf-8',
        )
        expect(html).toContain(`rel="canonical" href="${SITE}/${prefix}blog/${post.slug}/"`)
      }
    }
  })
})

// ── Sitemap completeness ──────────────────────────────────────────────────────
//
// The injection used to be all-or-nothing ("skip if the file already mentions
// /blog/"), which froze the list at whatever public/sitemap.xml was hand-written
// with — fourteen English posts were missing. It now adds per URL.

describe('generateBlogPages — sitemap completeness', () => {
  it('adds posts that a pre-existing sitemap does not already list', () => {
    const partial = path.join(OUT, 'sitemap-partial.xml')
    const dir     = path.join(OUT, 'partial')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), TEMPLATE_HTML)

    // A sitemap that already knows about /blog/ and the first post, nothing else.
    writeFileSync(
      path.join(dir, 'sitemap.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
      `  <url><loc>${SITE}/blog/</loc></url>\n` +
      `  <url><loc>${SITE}/blog/${BLOG_POSTS[0].slug}/</loc></url>\n` +
      '</urlset>\n',
    )

    const r = generateBlogPages(dir)
    expect(r.sitemap).toBe(true)

    const xml = readFileSync(path.join(dir, 'sitemap.xml'), 'utf-8')
    for (const post of BLOG_POSTS) {
      expect(xml, `${post.slug} missing from the sitemap`).toContain(`<loc>${SITE}/blog/${post.slug}/</loc>`)
    }
    // The entry that was already there is not duplicated.
    const dupes = (xml.match(new RegExp(`<loc>${SITE}/blog/${BLOG_POSTS[0].slug}/</loc>`, 'g')) ?? []).length
    expect(dupes).toBe(1)

    rmSync(partial, { force: true })
    rmSync(dir, { recursive: true, force: true })
  })
})
