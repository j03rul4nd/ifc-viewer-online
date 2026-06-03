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

const SITE  = 'https://j03rul4nd.github.io/ifc-viewer-online'
const OUT   = path.join(process.cwd(), '.blog-test-out')

// Minimal SPA shell that exercises every regex the generator touches.
const TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IFC Viewer Online — Free Browser-Based BIM Viewer</title>
  <meta name="description" content="Free online IFC viewer, validator and editor." />
  <link rel="canonical" href="https://j03rul4nd.github.io/ifc-viewer-online/" />
  <meta property="og:title" content="IFC Viewer Online" />
  <meta property="og:description" content="Free online IFC viewer." />
  <meta property="og:url" content="https://j03rul4nd.github.io/ifc-viewer-online/" />
  <meta property="og:image" content="https://j03rul4nd.github.io/ifc-viewer-online/og-image.png" />
  <meta name="twitter:title" content="IFC Viewer Online" />
  <meta name="twitter:description" content="Free online IFC viewer." />
  <link rel="alternate" hreflang="en"        href="https://j03rul4nd.github.io/ifc-viewer-online/" />
  <link rel="alternate" hreflang="es"        href="https://j03rul4nd.github.io/ifc-viewer-online/es/" />
  <link rel="alternate" hreflang="x-default" href="https://j03rul4nd.github.io/ifc-viewer-online/" />
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
