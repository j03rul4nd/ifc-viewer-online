// Regression tests for the blog page generator.
//
// Mirrors the pattern from generate-fix-pages.test.ts:
// runs the real generator into a throwaway output dir whose parent is the
// repo root, with a minimal fake index.html template.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { generateBlogPages, type BlogPagesResult } from './generate-blog-pages'
import { BLOG_POSTS, BLOG_POSTS_ES, BLOG_POSTS_DE, BLOG_POSTS_FR, type BlogPost } from '../../src/lib/blog-posts'
import { TRANSLATED_POSTS } from '../../src/lib/blog-i18n'
import { topicsFor } from '../../src/lib/blog-topics'

// Total expected pages across all languages:
// each language contributes 1 index page + N post pages + its topic hubs.
const LANG_ARRAYS: Array<readonly [string, BlogPost[]]> = [
  ['en', BLOG_POSTS], ['es', BLOG_POSTS_ES], ['de', BLOG_POSTS_DE], ['fr', BLOG_POSTS_FR],
  ...Object.entries(TRANSLATED_POSTS),
]
const EXPECTED_PAGES = LANG_ARRAYS
  .filter(([, arr]) => arr.length > 0)
  .reduce((sum, [lang, arr]) => sum + 1 + arr.length + topicsFor([...arr], lang).length, 0)

const SITE  = 'https://www.ifcvieweronline.eu'
const OUT   = path.join(process.cwd(), '.blog-test-out')

// Minimal SPA shell that exercises every regex the generator touches.
const TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index, follow" />
  <title>IFC Viewer Online — Free Browser-Based BIM Viewer</title>
  <meta name="description" content="Free online IFC viewer, validator and editor." />
  <link rel="canonical" href="https://www.ifcvieweronline.eu/" />
  <meta property="og:title" content="IFC Viewer Online" />
  <meta property="og:description" content="Free online IFC viewer." />
  <meta property="og:url" content="https://www.ifcvieweronline.eu/" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://www.ifcvieweronline.eu/og-image.png" />
  <meta name="twitter:title" content="IFC Viewer Online" />
  <meta name="twitter:description" content="Free online IFC viewer." />
  <link rel="alternate" hreflang="en"        href="https://www.ifcvieweronline.eu/" />
  <link rel="alternate" hreflang="es"        href="https://www.ifcvieweronline.eu/es/" />
  <link rel="alternate" hreflang="x-default" href="https://www.ifcvieweronline.eu/" />
  <script type="application/ld+json">{"@type":"WebApplication"}</script>
</head>
<body><noscript><main><h1>IFC Viewer Online — Free Browser-Based BIM Viewer</h1></main></noscript><div id="root"></div></body>
</html>`

let result: BlogPagesResult

// With the zh/ja/th packs a run writes ~250 pages; the tests that run the
// generator again, or read every translated page, need more than the default
// 5 s when the suite shares the machine with the rest of the tests.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

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
    // 1 index + N posts + topic hubs per language (EN + ES + DE + FR)
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

  it('has FAQPage schema backed by visible FAQ content', () => {
    const html = readFileSync(file, 'utf-8')
    expect(html).toContain('"@type":"FAQPage"')
    expect(html).toContain('Where should I start if I only need to open an IFC file?')
    expect(html).toContain('<summary>Where should I start if I only need to open an IFC file?</summary>')
  })

  it('lists all posts in JSON-LD', () => {
    const html = readFileSync(file, 'utf-8')
    for (const post of BLOG_POSTS) {
      expect(html).toContain(`/blog/${post.slug}/`)
    }
  })

  it('exposes every article cover and link in the static fallback', () => {
    const html = readFileSync(file, 'utf-8')
    for (const post of BLOG_POSTS) {
      expect(html).toContain(`/blog/covers/${post.slug}.png`)
      expect(html).toContain(`/blog/${post.slug}/`)
    }
    expect(html).not.toContain('Free Browser-Based BIM Viewer</h1>')
  })

  it('links every topic hub and lists the library in the static fallback', () => {
    const html = readFileSync(file, 'utf-8')
    expect(html).toContain('Explore by topic')
    for (const topic of topicsFor(BLOG_POSTS, 'en')) {
      expect(html).toContain(`href="${SITE}/blog/topic/${topic.slug}/"`)
    }
    expect(html).toContain('All IFC guides')
    expect(html).toContain('Newest articles appear first.')
  })

  it("drops the home page's structured data and keeps only the blog's", () => {
    const html = readFileSync(file, 'utf-8')
    expect(html).not.toContain('"WebApplication"')
    expect(html).toContain('"@type":"Blog"')
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

  it('each EN post page carries its listing title in <title>', () => {
    // Was asserting `post.title`. A post may now carry a `seoTitle` — the title
    // written for a search result, because Google renders about 60 characters
    // and 25 of these articles have editorial titles past that. The article
    // keeps its own title on the page; only the listing gets the shorter one.
    for (const post of BLOG_POSTS) {
      const html = readFileSync(path.join(OUT, 'blog', post.slug, 'index.html'), 'utf-8')
      const listing = post.seoTitle ?? post.title
      expect(html, post.slug).toContain(`<title>${listing.replace(/&/g, '&amp;')}`)
    }
  })

  it('never puts a longer title in the listing than on the article', () => {
    // The override exists to shorten. A seoTitle longer than the title would
    // mean someone used it for something else.
    for (const post of BLOG_POSTS) {
      if (!post.seoTitle) continue
      expect(post.seoTitle.length, post.slug).toBeLessThanOrEqual(post.title.length)
    }
  })

  it('each post publishes an indexable, article-specific static fallback and cover', () => {
    for (const post of BLOG_POSTS) {
      const html = readFileSync(path.join(OUT, 'blog', post.slug, 'index.html'), 'utf-8')
      expect(html).toContain('content="index, follow, max-image-preview:large, max-snippet:-1"')
      expect(html).toContain('property="og:type" content="article"')
      expect(html).toContain(`<h1>${post.title.replace(/&/g, '&amp;')}</h1>`)
      expect(html).toContain(`/blog/covers/${post.slug}.png`)
      expect(html).not.toContain('Free Browser-Based BIM Viewer</h1>')
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

  it('uses the spatial article hero in OG and Article image metadata', () => {
    const html = readFileSync(
      path.join(OUT, 'blog', 'ifc-point-cloud-browser-scan-to-bim', 'index.html'),
      'utf-8',
    )
    expect(html).toContain('blog/covers/ifc-point-cloud-browser-scan-to-bim.png')
    expect(html).toContain('blog/images/ifc-point-cloud-browser-scan-to-bim-1600x900.jpg')
    expect(html).toContain('"@type":"ImageObject"')
    expect(html).toContain('real CRAS Labs TLS point cloud')
  })

  it('uses the clean Ciutadella product capture as the primary map-article image', () => {
    const en = readFileSync(
      path.join(OUT, 'blog', 'view-ifc-on-3d-map-online', 'index.html'),
      'utf-8',
    )
    const es = readFileSync(
      path.join(OUT, 'es', 'blog', 'ver-ifc-mapa-3d-online', 'index.html'),
      'utf-8',
    )
    const cleanCapture = `${SITE}/blog/images/ifc-3d-map-ciutadella-real-viewer.jpg`

    expect(en).toContain(`<meta property="og:image" content="${cleanCapture}"`)
    expect(es).toContain(`<meta property="og:image" content="${cleanCapture}"`)
    expect(en.indexOf(cleanCapture)).toBeLessThan(en.indexOf(`${SITE}/blog/covers/view-ifc-on-3d-map-online.png`))
    expect(es.indexOf(cleanCapture)).toBeLessThan(es.indexOf(`${SITE}/blog/covers/ver-ifc-mapa-3d-online.png`))
  })

  it('links translated spatial articles with hreflang', () => {
    const html = readFileSync(
      path.join(OUT, 'blog', 'real-time-lidar-web-digital-twin-mcap', 'index.html'),
      'utf-8',
    )
    expect(html).toContain('hreflang="en"')
    expect(html).toContain('hreflang="es"')
    expect(html).toContain('/es/blog/lidar-tiempo-real-web-gemelo-digital-mcap/')
  })

  it('adds VideoObject metadata to the IFC + video article', () => {
    const html = readFileSync(
      path.join(OUT, 'blog', 'ifc-video-3d-terrain-construction-progress', 'index.html'),
      'utf-8',
    )
    expect(html).toContain('"@type":"VideoObject"')
    expect(html).toContain('/models/video-demo/operations-pavilion-progress.mp4')
    expect(html).toContain('PT8S')
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
      expect(xml).toContain(`${SITE}/blog/covers/${post.slug}.png`)
    }
  })

  it('declares image/video namespaces and lists spatial media', () => {
    const xml = readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8')
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
    expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"')
    expect(xml).toContain('<image:loc>https://www.ifcvieweronline.eu/blog/covers/real-time-lidar-web-digital-twin-mcap.png</image:loc>')
    expect(xml).toContain('<image:loc>https://www.ifcvieweronline.eu/blog/images/real-time-lidar-web-digital-twin-mcap-1600x900.jpg</image:loc>')
    expect(xml).toContain('<video:content_loc>https://www.ifcvieweronline.eu/models/video-demo/operations-pavilion-progress.mp4</video:content_loc>')
  })

  it('is idempotent — running twice does not duplicate entries', () => {
    // Run generator again against the same dir
    const r2 = generateBlogPages(OUT)
    expect(r2.sitemap).toBe(false) // already injected, should skip
    const xml = readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8')
    const indexLocs = (xml.match(new RegExp(`<loc>${SITE}/blog/</loc>`, 'g')) ?? []).length
    expect(indexLocs).toBe(1)
    for (const post of BLOG_POSTS) {
      const postLocs = (xml.match(new RegExp(`<loc>${SITE}/blog/${post.slug}/</loc>`, 'g')) ?? []).length
      expect(postLocs, `${post.slug} should have one sitemap <loc>`).toBe(1)
    }
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
  const ARRAYS = LANG_ARRAYS

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
    expect(xml).toContain(`${SITE}/blog/covers/${BLOG_POSTS[0].slug}.png`)

    rmSync(partial, { force: true })
    rmSync(dir, { recursive: true, force: true })
  })
})

// ── Topic hubs ────────────────────────────────────────────────────────────────

describe('generateBlogPages — topic hubs', () => {
  const topics = topicsFor(BLOG_POSTS, 'en')

  it('writes a page per English topic, and only for topics with enough guides', () => {
    expect(topics.length).toBeGreaterThan(0)
    for (const topic of topics) {
      expect(existsSync(path.join(OUT, 'blog', 'topic', topic.slug, 'index.html'))).toBe(true)
      expect(topic.posts.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives each hub its own title, canonical, crawlable list and structured data', () => {
    const topic = topics[0]
    const html = readFileSync(path.join(OUT, 'blog', 'topic', topic.slug, 'index.html'), 'utf-8')
    expect(html).toContain(`<title>${topic.copy.title} | IFC Viewer Blog</title>`)
    expect(html).toContain(`<link rel="canonical" href="${SITE}/blog/topic/${topic.slug}/"`)
    expect(html).toContain('"@type":"CollectionPage"')
    expect(html).toContain('"@type":"BreadcrumbList"')
    for (const post of topic.posts) expect(html).toContain(`href="${SITE}/blog/${post.slug}/"`)
  })

  it('adds the hubs to the sitemap', () => {
    const xml = readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8')
    for (const topic of topics) expect(xml).toContain(`<loc>${SITE}/blog/topic/${topic.slug}/</loc>`)
  })
})

describe('generateBlogPages — article structured data', () => {
  const post = BLOG_POSTS.find((p) => p.slug === 'how-to-validate-ifc-file')!
  const html = () => readFileSync(path.join(OUT, 'blog', post.slug, 'index.html'), 'utf-8')

  it('names the organisation as publisher, with its logo', () => {
    expect(html()).toMatch(/"publisher":\{"@type":"Organization"[^}]*"name":"IFC Viewer Online"/)
    expect(html()).toContain('/brand/logo.svg')
  })

  it('gives dates a time and timezone, and images a url (Rich Results test)', () => {
    expect(html()).toContain(`"datePublished":"${post.date}T00:00:00+00:00"`)
    expect(html()).toMatch(/"@type":"ImageObject","url":"https:\/\//)
  })

  it('carries a breadcrumb up to its topic hub', () => {
    expect(html()).toContain('"@type":"BreadcrumbList"')
    expect(html()).toContain(`${SITE}/blog/topic/${post.categorySlug}/`)
  })
})

// ── Chinese, Japanese and Thai ────────────────────────────────────────────────
//
// These packs are translations of the English library under the same slugs, so
// the checks are about the pairing: each translation is published under its own
// prefix, declares its language, and sits in one hreflang cluster with the
// English original and its siblings.

describe('generateBlogPages — translated packs (zh, ja, th)', () => {
  const langs = Object.keys(TRANSLATED_POSTS)
  const page = (...parts: string[]) => readFileSync(path.join(OUT, ...parts, 'index.html'), 'utf-8')

  it('publishes an index and a page per post under each prefix, in that language', () => {
    for (const lang of langs) {
      expect(page(lang, 'blog'), `/${lang}/blog/`).toContain(`<html lang="${lang}"`)
      for (const post of TRANSLATED_POSTS[lang]) {
        const html = page(lang, 'blog', post.slug)
        expect(html, `${lang}/${post.slug}`).toContain(`<html lang="${lang}"`)
        expect(html).toContain(`rel="canonical" href="${SITE}/${lang}/blog/${post.slug}/"`)
        expect(html).toContain(`"inLanguage":"${lang}"`)
      }
    }
  })

  it('links every translation to its English original and back, with x-default on English', () => {
    const slug = 'how-to-validate-ifc-file'
    const clusterOf = (html: string) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`)
    const expected = [
      `en ${SITE}/blog/${slug}/`,
      ...langs.filter((l) => TRANSLATED_POSTS[l].some((p) => p.slug === slug)).map((l) => `${l} ${SITE}/${l}/blog/${slug}/`),
      `x-default ${SITE}/blog/${slug}/`,
    ].sort()
    expect(clusterOf(page('blog', slug)).sort()).toEqual(expected)
    for (const lang of langs) {
      if (TRANSLATED_POSTS[lang].some((p) => p.slug === slug)) expect(clusterOf(page(lang, 'blog', slug)).sort(), lang).toEqual(expected)
    }
  })

  it('keeps the page chrome of the static fallback in the article language', () => {
    const html = page('ja', 'blog', 'how-to-validate-ifc-file')
    expect(html).toContain('BIM・IFCブログに戻る')
    expect(html).not.toContain('Back to the BIM &amp; IFC blog')
  })

  it('gives each translated topic hub its own title', () => {
    for (const lang of langs) {
      for (const topic of topicsFor(TRANSLATED_POSTS[lang], lang)) {
        expect(page(lang, 'blog', 'topic', topic.slug)).toContain(`<title>${topic.copy.title} | IFC Viewer Blog</title>`)
      }
    }
  })
})
