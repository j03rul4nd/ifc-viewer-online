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
import { ALL_BLOG_POSTS, type BlogPost } from '../../src/lib/blog-posts'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')
const OG_IMAGE = `${SITE}/og-image.png`

// Map lang → { prefix in URL, blog title, blog description }.
//
// The post LIST is not part of this table on purpose. Posts are grouped by their
// own `lang` field (see postsFor below), never by which exported array they
// happen to sit in — English posts were once appended to BLOG_POSTS_FR, which
// silently published their shells at /fr/blog/<slug>/ with a French canonical
// while the SPA served them in English. Grouping by the post's own language
// makes that class of mistake impossible to repeat.
const LANG_CONFIG: Record<string, {
  prefix: string
  blogTitle: string
  blogDesc: string
}> = {
  en: {
    prefix: '',
    blogTitle: 'BIM & IFC Blog — Practical Guides for BIM Coordinators | IFC Viewer',
    blogDesc: 'Practical guides for BIM coordinators: how to fix IFC validation errors, improve IFC Health Scores, and deliver clean models to the CDE.',
  },
  es: {
    prefix: 'es/',
    blogTitle: 'Blog BIM e IFC — Guías prácticas para coordinadores BIM | IFC Viewer',
    blogDesc: 'Guías prácticas para coordinadores BIM: cómo corregir errores de validación IFC, mejorar el Health Score y entregar modelos limpios al ECD.',
  },
  de: {
    prefix: 'de/',
    blogTitle: 'BIM & IFC Blog — Praxisanleitungen für BIM-Koordinatoren | IFC Viewer',
    blogDesc: 'Praxisanleitungen für BIM-Koordinatoren: IFC-Validierungsfehler beheben, Health Scores verbessern und saubere Modelle ans CDE liefern.',
  },
  fr: {
    prefix: 'fr/',
    blogTitle: 'Blog BIM & IFC — Guides pratiques pour coordinateurs BIM | IFC Viewer',
    blogDesc: 'Guides pratiques pour coordinateurs BIM : corriger les erreurs de validation IFC, améliorer le Health Score et livrer des modèles propres à la GED.',
  },
}

/**
 * Posts belonging to a language, by their own `lang` field (default 'en') —
 * the same rule `getBlogPostsByLang` applies at runtime, so the static shells
 * and the SPA can never disagree about which URL a post lives at.
 */
export function postsFor(lang: string): BlogPost[] {
  return ALL_BLOG_POSTS.filter(p => (p.lang ?? 'en') === lang)
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
  image?: string
  imageAlt?: string
  alternates?: Array<{ lang: string; href: string }>
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

  const preferredImage = meta.image ?? OG_IMAGE
  html = html.replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, `$1${esc(preferredImage)}$2`)
  if (/<meta\s+name="twitter:image"/.test(html)) {
    html = html.replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, `$1${esc(preferredImage)}$2`)
  } else {
    html = html.replace('</head>', `  <meta name="twitter:image" content="${esc(preferredImage)}" />\n</head>`)
  }

  // 6. Remove the root hreflang alternates (they'd point to the wrong URL).
  //    Blog pages are English-only; we replace with self-referencing hreflang.
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')

  // 7. Inject blog-specific hreflang + og:image:alt + twitter:image:alt + JSON-LD
  const alternates = meta.alternates?.length
    ? meta.alternates
    : [{ lang: 'en', href: meta.canonical }, { lang: 'x-default', href: meta.canonical }]
  const hreflang = alternates
    .map((alternate) => `<link rel="alternate" hreflang="${esc(alternate.lang)}" href="${esc(alternate.href)}" />`)
    .join('\n  ')

  // og:image:alt derived from title — improves accessibility and social-share clarity
  const imageAlt   = meta.imageAlt ?? meta.title
  const ogAlt      = `<meta property="og:image:alt"  content="${esc(imageAlt)}" />`
  const twitterAlt = `<meta name="twitter:image:alt" content="${esc(imageAlt)}" />`

  const jsonLd = `<script type="application/ld+json">${jsonEsc(JSON.stringify(meta.jsonLd))}</script>`

  html = html.replace('</head>', `  ${hreflang}\n  ${ogAlt}\n  ${twitterAlt}\n  ${jsonLd}\n</head>`)

  return html
}

// ── Sitemap entries ───────────────────────────────────────────────────────────

interface SearchImage {
  url: string
  caption: string
  credit?: string
  license?: string
}

function mediaUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src
  return `${SITE}/${src.replace(/^\//, '')}`
}

function postImages(post: BlogPost): SearchImage[] {
  const images: SearchImage[] = []
  const seen = new Set<string>()
  const add = (image: SearchImage): void => {
    if (seen.has(image.url)) return
    seen.add(image.url)
    images.push(image)
  }

  for (const variant of post.heroImageVariants ?? []) {
    add({ url: mediaUrl(variant.src), caption: post.heroAlt ?? post.title, credit: 'IFC Viewer Online' })
  }
  if (post.heroImage && (post.heroImage.includes('/') || /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(post.heroImage))) {
    add({ url: mediaUrl(post.heroImage), caption: post.heroAlt ?? post.title, credit: 'IFC Viewer Online' })
  }
  for (const block of post.content) {
    if (block.type !== 'image') continue
    add({
      url: mediaUrl(block.src),
      caption: block.caption ?? block.alt,
      credit: block.credit,
      license: block.license,
    })
  }
  return images
}

function articleImageJsonLd(post: BlogPost): Array<Record<string, unknown> | string> {
  const images = postImages(post)
  if (images.length === 0) return [OG_IMAGE]
  return images.map((image) => ({
    '@type': 'ImageObject',
    contentUrl: image.url,
    caption: image.caption,
    ...(image.credit ? {
      creditText: image.credit,
      creator: { '@type': 'Organization', name: image.credit },
      copyrightNotice: image.credit,
    } : {}),
    ...(image.license ? { license: image.license } : {}),
  }))
}

function postAlternates(post: BlogPost): Array<{ lang: string; href: string }> {
  const translations = post.translationKey
    ? ALL_BLOG_POSTS.filter((candidate) => candidate.translationKey === post.translationKey)
    : [post]
  const alternates = translations.map((candidate) => {
    const lang = candidate.lang ?? 'en'
    const prefix = LANG_CONFIG[lang]?.prefix ?? ''
    return { lang, href: `${SITE}/${prefix}blog/${candidate.slug}/` }
  })
  const fallback = alternates.find((alternate) => alternate.lang === 'en') ?? alternates[0]
  if (fallback) alternates.push({ lang: 'x-default', href: fallback.href })
  return alternates
}

function sitemapBlogEntry(
  urlPath: string,
  lastmod: string,
  priority: number,
  changefreq: string,
  images: SearchImage[] = [],
  videos: BlogPost['videos'] = [],
): string {
  const loc = `${SITE}${urlPath}`
  const lines = [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority.toFixed(2)}</priority>`,
    `    <xhtml:link rel="alternate" hreflang="en"        href="${loc}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />`,
  ]
  for (const image of images) {
    lines.push(
      '    <image:image>',
      `      <image:loc>${esc(image.url)}</image:loc>`,
      `      <image:caption>${esc(image.caption)}</image:caption>`,
      '    </image:image>',
    )
  }
  for (const video of videos ?? []) {
    lines.push(
      '    <video:video>',
      `      <video:thumbnail_loc>${esc(mediaUrl(video.thumbnailUrl))}</video:thumbnail_loc>`,
      `      <video:title>${esc(video.name)}</video:title>`,
      `      <video:description>${esc(video.description)}</video:description>`,
      `      <video:content_loc>${esc(mediaUrl(video.contentUrl))}</video:content_loc>`,
      '    </video:video>',
    )
  }
  lines.push('  </url>')
  return lines.join('\n')
}

// ── llms.txt section ──────────────────────────────────────────────────────────

/** A markdown section listing the given English posts. Callers pass only the
 *  posts that are not already in llms.txt, so the heading says "more". */
function llmsBlogSection(posts: BlogPost[]): string {
  const lines = [
    '',
    '## Blog — more BIM & IFC guides',
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
  /** How many blog URLs were added to the sitemap this run. */
  sitemapAdded?: number
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
    const posts = postsFor(lang)
    if (posts.length === 0) continue

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
          alternates: [
            { lang, href: urlBase },
            { lang: 'x-default', href: lang === 'en' ? urlBase : `${SITE}/blog/` },
          ],
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: `IFC Viewer Blog${lang !== 'en' ? ` (${lang.toUpperCase()})` : ''}`,
            url: urlBase,
            description: cfg.blogDesc,
            inLanguage: lang,
            publisher: { '@type': 'Person', name: 'Joel Benitez', url: 'https://github.com/j03rul4nd' },
            blogPost: posts.map(p => ({
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
    for (const post of posts) {
      try {
        const canonical = `${SITE}/${cfg.prefix}blog/${post.slug}/`
        const images = postImages(post)
        const primaryImage = images[0]?.url ?? OG_IMAGE
        const outDir = path.join(distDir, ...cfg.prefix.split('/').filter(Boolean), 'blog', post.slug)
        mkdirSync(outDir, { recursive: true })
        writeFileSync(
          path.join(outDir, 'index.html'),
          tweakHtml(template, {
            title: `${post.title} | IFC Viewer Blog`,
            description: post.excerpt,
            canonical,
            image: primaryImage,
            imageAlt: post.heroAlt ?? post.title,
            alternates: postAlternates(post),
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'BlogPosting',
              headline: post.title,
              description: post.excerpt,
              datePublished: post.date,
              dateModified: post.dateModified ?? post.date,
              inLanguage: lang,
              author:    { '@type': 'Organization', name: post.author },
              publisher: { '@type': 'Person', name: 'Joel Benitez', url: 'https://github.com/j03rul4nd' },
              url: canonical,
              mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
              image: articleImageJsonLd(post),
              keywords: [
                ...(post.keywords ?? []),
                post.category,
                'IFC',
                'BIM',
              ].join(', '),
              timeRequired: `PT${post.readTimeMin}M`,
              articleSection: post.category,
            },
          }),
        )
        // Inject FAQPage schema as a second JSON-LD block when the post has FAQs
        if (post.faqs && post.faqs.length > 0) {
          const faqLd = {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: post.faqs.map(f => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }
          const faqScript = `<script type="application/ld+json">${jsonEsc(JSON.stringify(faqLd))}</script>`
          const outFilePath = path.join(outDir, 'index.html')
          const existing = readFileSync(outFilePath, 'utf-8')
          writeFileSync(outFilePath, existing.replace('</head>', `  ${faqScript}\n</head>`))
        }
        if (post.videos && post.videos.length > 0) {
          const videoScripts = post.videos.map((video) => {
            const videoLd = {
              '@context': 'https://schema.org',
              '@type': 'VideoObject',
              name: video.name,
              description: video.description,
              thumbnailUrl: mediaUrl(video.thumbnailUrl),
              contentUrl: mediaUrl(video.contentUrl),
              uploadDate: video.uploadDate,
              duration: video.duration,
              embedUrl: canonical,
            }
            return `<script type="application/ld+json">${jsonEsc(JSON.stringify(videoLd))}</script>`
          }).join('\n  ')
          const outFilePath = path.join(outDir, 'index.html')
          const existing = readFileSync(outFilePath, 'utf-8')
          writeFileSync(outFilePath, existing.replace('</head>', `  ${videoScripts}\n</head>`))
        }
        result.pages++
      } catch (err) {
        console.error(`[blog-pages][${lang}] Error generating post "${post.slug}":`, err)
        result.errors++
      }
    }
  }

  // ── Sitemap injection ──────────────────────────────────────────────────────
  //
  // Idempotent PER URL, not per section. The previous "skip everything if the
  // file already mentions /blog/" guard meant that once public/sitemap.xml had
  // been hand-written with the blog in it, every post added afterwards was
  // silently left out — fourteen English posts were missing when this was
  // found. Adding only the locs that are absent keeps hand-maintained entries
  // untouched and makes a new post self-registering.
  const sitemapPath = path.join(distDir, 'sitemap.xml')
  if (existsSync(sitemapPath)) {
    const originalXml = readFileSync(sitemapPath, 'utf-8')
    let xml = originalXml
    if (!xml.includes('xmlns:image=')) {
      xml = xml.replace(/<urlset\b/, '<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
    }
    if (!xml.includes('xmlns:video=')) {
      xml = xml.replace(/<urlset\b/, '<urlset xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"')
    }
    const missing: string[] = []

    const addIfMissing = (
      urlPath: string,
      lastmod: string,
      priority: number,
      changefreq: string,
      post?: BlogPost,
    ): void => {
      if (xml.includes(`<loc>${SITE}${urlPath}</loc>`)) return
      missing.push(sitemapBlogEntry(
        urlPath,
        lastmod,
        priority,
        changefreq,
        post ? postImages(post) : [],
        post?.videos,
      ))
    }

    for (const [lang, cfg] of Object.entries(LANG_CONFIG)) {
      const posts = postsFor(lang)
      if (posts.length === 0) continue
      addIfMissing(`/${cfg.prefix}blog/`, today, 0.85, 'weekly')
      posts.forEach(p => addIfMissing(`/${cfg.prefix}blog/${p.slug}/`, p.dateModified ?? p.date, 0.75, 'monthly', p))
    }

    if (missing.length > 0) {
      xml = xml.replace('</urlset>', `\n  <!-- Blog (EN + ES + DE + FR) -->\n${missing.join('\n\n')}\n\n</urlset>`)
    }
    if (xml !== originalXml) {
      writeFileSync(
        sitemapPath,
        xml,
      )
      result.sitemap = true
      result.sitemapAdded = missing.length
    }
  } else {
    console.warn('[blog-pages] dist/sitemap.xml not found — blog URLs not added to sitemap.')
  }

  // ── llms.txt injection ─────────────────────────────────────────────────────
  //
  // Same trap as the sitemap: a "does the file already have a ## Blog section?"
  // guard froze the list at whatever was hand-written. Append only the English
  // posts whose URL is absent, so new posts register themselves.
  const llmsPath = path.join(distDir, 'llms.txt')
  if (existsSync(llmsPath)) {
    const txt     = readFileSync(llmsPath, 'utf-8')
    const missing = postsFor('en').filter(p => !txt.includes(`${SITE}/blog/${p.slug}/`))
    if (missing.length > 0) {
      writeFileSync(llmsPath, `${txt.trimEnd()}\n${llmsBlogSection(missing)}`)
      result.llms = true
    }
  }

  return result
}
