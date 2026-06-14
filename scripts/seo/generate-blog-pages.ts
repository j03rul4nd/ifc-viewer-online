// ── Programmatic static shells for blog pages ─────────────────────────────────
//
// Generates one index.html per blog post + one for the blog index at:
//   dist/blog/index.html                  → /blog/
//   dist/blog/<slug>/index.html           → /blog/<slug>/
//
// Each file is a copy of dist/index.html (the full SPA shell) with its
// <title>, description, canonical, Open Graph, Twitter Card, and JSON-LD
// meta tags replaced to match the specific page. This serves two purposes:
//
//   1. GitHub Pages SPA routing — GH Pages serves index.html only from the root.
//      Without these files, visiting /blog/ directly would 404. With them, GitHub
//      Pages finds dist/blog/index.html and serves the correct shell.
//
//   2. SEO — Crawlers and social-share scrapers that don't execute JavaScript
//      still read the <head> section. Each page gets the right title/description
//      and a BlogPosting/Blog JSON-LD schema entry for Google rich snippets.
//
// The SPA reads window.location.pathname on mount and shows the correct route.
// No server-side rendering is needed — Vite's absolute asset URLs (/assets/*.js)
// work correctly from any subdirectory depth.
//
// Invoked from vite.config.ts (closeBundle) after generateRuleFixPages().

import path    from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { BLOG_POSTS, BLOG_POSTS_ES, BLOG_POSTS_DE, BLOG_POSTS_FR, type BlogPost } from '../../src/lib/blog-posts'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')
const OG_IMAGE = `${SITE}/og-image.png`

// Map lang → { prefix in URL, posts array, blog title, blog description }
const LANG_CONFIG: Record<string, {
  prefix: string
  posts: BlogPost[]
  blogTitle: string
  blogDesc: string
}> = {
  en: {
    prefix: '',
    posts: BLOG_POSTS,
    blogTitle: 'BIM & IFC Blog — Practical Guides for BIM Coordinators | IFC Viewer',
    blogDesc: 'Practical guides for BIM coordinators: how to fix IFC validation errors, improve IFC Health Scores, and deliver clean models to the CDE.',
  },
  es: {
    prefix: 'es/',
    posts: BLOG_POSTS_ES,
    blogTitle: 'Blog BIM e IFC — Guías prácticas para coordinadores BIM | IFC Viewer',
    blogDesc: 'Guías prácticas para coordinadores BIM: cómo corregir errores de validación IFC, mejorar el Health Score y entregar modelos limpios al ECD.',
  },
  de: {
    prefix: 'de/',
    posts: BLOG_POSTS_DE,
    blogTitle: 'BIM & IFC Blog — Praxisanleitungen für BIM-Koordinatoren | IFC Viewer',
    blogDesc: 'Praxisanleitungen für BIM-Koordinatoren: IFC-Validierungsfehler beheben, Health Scores verbessern und saubere Modelle ans CDE liefern.',
  },
  fr: {
    prefix: 'fr/',
    posts: BLOG_POSTS_FR,
    blogTitle: 'Blog BIM & IFC — Guides pratiques pour coordinateurs BIM | IFC Viewer',
    blogDesc: 'Guides pratiques pour coordinateurs BIM : corriger les erreurs de validation IFC, améliorer le Health Score et livrer des modèles propres à la GED.',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** HTML-escape a string for use inside attribute values or text content. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Escape < > & in JSON so they're safe inside <script> tags. */
function jsonEsc(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

// ── Meta replacement ──────────────────────────────────────────────────────────

interface PageMeta {
  title: string
  description: string
  canonical: string
  jsonLd: Record<string, unknown>
}

/**
 * Take the dist/index.html template and swap out all page-specific head tags.
 * All Vite asset URLs in the template are absolute (prefixed with the build
 * base), so the resulting HTML works correctly at any URL depth.
 */
function tweakHtml(template: string, meta: PageMeta): string {
  let html = template

  // 1. <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)

  // 2. meta description
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${esc(meta.description)}$2`,
  )

  // 3. canonical link
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    `$1${esc(meta.canonical)}$2`,
  )

  // 4. Open Graph
  html = html.replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/,       `$1${esc(meta.title)}$2`)
  html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/,  `$1${esc(meta.description)}$2`)
  html = html.replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/,          `$1${esc(meta.canonical)}$2`)

  // 5. Twitter Card
  html = html.replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,       `$1${esc(meta.title)}$2`)
  html = html.replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,  `$1${esc(meta.description)}$2`)

  // 6. Remove the root hreflang alternates (they'd point to the wrong URL).
  //    Blog pages are English-only; we replace with self-referencing hreflang.
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')

  // 7. Inject blog-specific hreflang + og:image:alt + twitter:image:alt + JSON-LD
  const hreflang = [
    `<link rel="alternate" hreflang="en"        href="${esc(meta.canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${esc(meta.canonical)}" />`,
  ].join('\n  ')

  // og:image:alt derived from title — improves accessibility and social-share clarity
  const ogAlt      = `<meta property="og:image:alt"  content="${esc(meta.title)}" />`
  const twitterAlt = `<meta name="twitter:image:alt" content="${esc(meta.title)}" />`

  const jsonLd = `<script type="application/ld+json">${jsonEsc(JSON.stringify(meta.jsonLd))}</script>`

  html = html.replace('</head>', `  ${hreflang}\n  ${ogAlt}\n  ${twitterAlt}\n  ${jsonLd}\n</head>`)

  return html
}

// ── Sitemap entries ───────────────────────────────────────────────────────────

function sitemapBlogEntry(urlPath: string, lastmod: string, priority: number, changefreq: string): string {
  const loc = `${SITE}${urlPath}`
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority.toFixed(2)}</priority>`,
    `    <xhtml:link rel="alternate" hreflang="en"        href="${loc}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />`,
    '  </url>',
  ].join('\n')
}

// ── llms.txt section ──────────────────────────────────────────────────────────

function llmsBlogSection(posts: BlogPost[]): string {
  const lines = [
    '',
    '## Blog — BIM & IFC guides',
    '',
    'Practical articles for BIM coordinators on IFC validation, model quality, and delivery.',
    `Blog index: ${SITE}/blog/`,
    '',
  ]
  for (const p of posts) {
    lines.push(`- [${p.title}](${SITE}/blog/${p.slug}/) — ${p.category}, ${p.readTimeMin} min`)
  }
  lines.push('')
  return lines.join('\n')
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface BlogPagesResult {
  /** Number of HTML pages written (blog index + one per post). */
  pages: number
  /** Number of errors encountered (0 = clean). */
  errors: number
  /** Whether the sitemap was updated this run. */
  sitemap: boolean
  /** Whether llms.txt was updated this run. */
  llms: boolean
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateBlogPages(distDir: string): BlogPagesResult {
  const result: BlogPagesResult = { pages: 0, errors: 0, sitemap: false, llms: false }

  // ── Read template ──────────────────────────────────────────────────────────
  const indexPath = path.join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    console.warn('[blog-pages] dist/index.html not found — skipping blog page generation.')
    return result
  }
  const template = readFileSync(indexPath, 'utf-8')
  const today    = new Date().toISOString().slice(0, 10)

  // ── Generate pages for each language ──────────────────────────────────────
  for (const [lang, cfg] of Object.entries(LANG_CONFIG)) {
    if (cfg.posts.length === 0) continue

    const urlBase = `${SITE}/${cfg.prefix}blog/`

    // Blog index page
    try {
      const outDir = path.join(distDir, ...cfg.prefix.split('/').filter(Boolean), 'blog')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(
        path.join(outDir, 'index.html'),
        tweakHtml(template, {
          title: cfg.blogTitle,
          description: cfg.blogDesc,
          canonical: urlBase,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: `IFC Viewer Blog${lang !== 'en' ? ` (${lang.toUpperCase()})` : ''}`,
            url: urlBase,
            description: cfg.blogDesc,
            inLanguage: lang,
            publisher: { '@type': 'Person', name: 'Joel Benitez', url: 'https://github.com/j03rul4nd' },
            blogPost: cfg.posts.map(p => ({
              '@type': 'BlogPosting',
              headline: p.title,
              description: p.excerpt,
              datePublished: p.date,
              url: `${SITE}/${cfg.prefix}blog/${p.slug}/`,
            })),
          },
        }),
      )
      result.pages++
    } catch (err) {
      console.error(`[blog-pages][${lang}] Error generating blog index:`, err)
      result.errors++
    }

    // Per-post pages
    for (const post of cfg.posts) {
      try {
        const canonical = `${SITE}/${cfg.prefix}blog/${post.slug}/`
        const outDir = path.join(distDir, ...cfg.prefix.split('/').filter(Boolean), 'blog', post.slug)
        mkdirSync(outDir, { recursive: true })
        writeFileSync(
          path.join(outDir, 'index.html'),
          tweakHtml(template, {
            title: `${post.title} | IFC Viewer Blog`,
            description: post.excerpt,
            canonical,
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'BlogPosting',
              headline: post.title,
              description: post.excerpt,
              datePublished: post.date,
              inLanguage: lang,
              author:    { '@type': 'Organization', name: post.author },
              publisher: { '@type': 'Person', name: 'Joel Benitez', url: 'https://github.com/j03rul4nd' },
              url: canonical,
              mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
              image: OG_IMAGE,
              keywords: [post.category, 'IFC', 'BIM'].join(', '),
              timeRequired: `PT${post.readTimeMin}M`,
              articleSection: post.category,
            },
          }),
        )
        result.pages++
      } catch (err) {
        console.error(`[blog-pages][${lang}] Error generating post "${post.slug}":`, err)
        result.errors++
      }
    }
  }

  // ── Sitemap injection (idempotent — all languages) ─────────────────────────
  const sitemapPath = path.join(distDir, 'sitemap.xml')
  if (existsSync(sitemapPath)) {
    const xml = readFileSync(sitemapPath, 'utf-8')
    if (!xml.includes(`${SITE}/blog/`)) {
      const allEntries: string[] = []
      for (const [, cfg] of Object.entries(LANG_CONFIG)) {
        if (cfg.posts.length === 0) continue
        allEntries.push(sitemapBlogEntry(`/${cfg.prefix}blog/`, today, 0.85, 'weekly'))
        cfg.posts.forEach(p =>
          allEntries.push(sitemapBlogEntry(`/${cfg.prefix}blog/${p.slug}/`, p.date, 0.75, 'monthly')),
        )
      }
      writeFileSync(
        sitemapPath,
        xml.replace('</urlset>', `\n  <!-- Blog (EN + ES + DE + FR) -->\n${allEntries.join('\n\n')}\n\n</urlset>`),
      )
      result.sitemap = true
    }
  } else {
    console.warn('[blog-pages] dist/sitemap.xml not found — blog URLs not added to sitemap.')
  }

  // ── llms.txt injection (idempotent) ────────────────────────────────────────
  const llmsPath = path.join(distDir, 'llms.txt')
  if (existsSync(llmsPath)) {
    const txt = readFileSync(llmsPath, 'utf-8')
    if (!txt.includes('## Blog')) {
      writeFileSync(llmsPath, `${txt.trimEnd()}\n${llmsBlogSection(BLOG_POSTS)}`)
      result.llms = true
    }
  }

  return result
}
