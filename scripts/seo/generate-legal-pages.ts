// ── Static shells for legal pages ─────────────────────────────────────────────
//
// Generates dist/privacy/index.html and dist/terms/index.html as copies of
// dist/index.html with <head> fully patched for SEO, OG, and JSON-LD.
//
// Privacy page uses FAQPage JSON-LD with B2B procurement Q&A — answers the
// real questions buyers ask before approving a BIM tool for enterprise use.
//
// Invoked from vite.config.ts (closeBundle) after generateBlogPageShells().

import path from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'

const SITE    = 'https://j03rul4nd.github.io/ifc-viewer-online'
const OG_IMG  = `${SITE}/og-image.png`
const CONTACT = 'joelbenitezdonari@gmail.com'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function jsonEsc(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

interface PageMeta {
  title: string
  description: string
  keywords: string
  canonical: string
  ogImageAlt: string
  jsonLd: Record<string, unknown>
}

function tweakHtml(template: string, meta: PageMeta): string {
  let html = template

  // 1. <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)

  // 2. meta description
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${esc(meta.description)}$2`,
  )

  // 3. keywords
  html = html.replace(
    /(<meta\s+name="keywords"\s+content=")[^"]*(")/,
    `$1${esc(meta.keywords)}$2`,
  )

  // 4. canonical
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    `$1${esc(meta.canonical)}$2`,
  )

  // 5. Open Graph
  html = html.replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/,       `$1${esc(meta.title)}$2`)
  html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/,  `$1${esc(meta.description)}$2`)
  html = html.replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/,          `$1${esc(meta.canonical)}$2`)
  html = html.replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/,        `$1${esc(OG_IMG)}$2`)

  // 6. Twitter Card
  html = html.replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,       `$1${esc(meta.title)}$2`)
  html = html.replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,  `$1${esc(meta.description)}$2`)
  html = html.replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/,        `$1${esc(OG_IMG)}$2`)

  // 7. Remove root hreflang alternates (legal pages are EN-only)
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')

  // 8. Inject: self-referencing hreflang + og:image:alt + twitter:image:alt + JSON-LD
  const hreflang = [
    `<link rel="alternate" hreflang="en"        href="${esc(meta.canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${esc(meta.canonical)}" />`,
  ].join('\n  ')

  const ogAlt     = `<meta property="og:image:alt"      content="${esc(meta.ogImageAlt)}" />`
  const twitterAlt = `<meta name="twitter:image:alt"     content="${esc(meta.ogImageAlt)}" />`
  const jsonLd    = `<script type="application/ld+json">${jsonEsc(JSON.stringify(meta.jsonLd))}</script>`

  html = html.replace('</head>', `  ${hreflang}\n  ${ogAlt}\n  ${twitterAlt}\n  ${jsonLd}\n</head>`)

  return html
}

// ── FAQ content for Privacy page ─────────────────────────────────────────────
// These are the real questions procurement teams and IT departments ask before
// approving a BIM tool. The answers mirror the actual behaviour of the product.

const PRIVACY_FAQ = [
  {
    q: 'Does IFC Viewer Online upload my IFC model files to any server?',
    a: 'No. All IFC parsing, 3D rendering, and validation run inside your browser via WebAssembly. The file content never leaves your device. You can verify this in your browser\'s DevTools Network tab — you will see zero outbound requests carrying IFC data.',
  },
  {
    q: 'Is IFC Viewer Online safe to use with confidential project data and NDA-governed models?',
    a: 'Yes. Because model data never reaches any server, there is no data transfer event that would implicate an NDA or client confidentiality obligation. The tool processes files locally — your browser is the analysis environment, not a cloud service.',
  },
  {
    q: 'Is IFC Viewer Online GDPR compliant?',
    a: 'Yes. Model files are processed client-side only — they never reach any server and therefore fall outside GDPR\'s data processing scope for model content. Analytics use PostHog in memory-only mode (no tracking cookies). Email is collected only with explicit consent. A full Privacy Policy is published at /privacy.',
  },
  {
    q: 'What data does IFC Viewer Online collect?',
    a: 'Anonymous usage events (e.g. "file opened", "validation ran") via PostHog — no model content, no filenames, no property values. Email addresses only if voluntarily submitted. Validation issue summaries only if the user explicitly clicks Share Report.',
  },
  {
    q: 'Do I need a Data Processing Agreement (DPA) to use IFC Viewer Online?',
    a: 'No DPA is required for model data, because IFC files never reach our servers — there is no data processor relationship under GDPR Article 28 for model content. If you subscribe to email updates, email processing via Resend is covered by the Privacy Policy.',
  },
  {
    q: 'Where are IFC Viewer Online\'s servers located?',
    a: 'The application is a static site hosted on GitHub Pages (no model processing server). Analytics run on PostHog (US-hosted). Shared reports run on Cloudflare Workers (global edge). None of these receive IFC model data.',
  },
  {
    q: 'Can we use IFC Viewer Online in a public sector or defence project?',
    a: 'For standard commercial confidentiality and NDA-governed projects, yes — model data never leaves the device. For projects with classified data handling requirements, assess whether the browser environment meets your classification requirements as you would for any browser-based tool.',
  },
  {
    q: 'Is the IFC Viewer Online source code auditable?',
    a: 'Yes. The full source code is MIT-licensed and publicly available on GitHub (github.com/j03rul4nd/ifc-viewer-online). Your security team can audit the codebase and confirm the absence of data exfiltration code.',
  },
]

export interface LegalPagesResult {
  pages: number
  errors: number
}

const LEGAL_PAGES: PageMeta[] = [
  {
    slug: 'privacy',
    title: 'Privacy Policy — IFC Viewer Online | No Uploads · No Tracking Cookies · GDPR Ready',
    description:
      'IFC Viewer Online Privacy Policy. Your IFC model files are processed entirely in your browser — zero uploads to any server, zero tracking cookies. GDPR-compliant analytics (legitimate interest, memory-only mode). Contact: ' + CONTACT,
    keywords:
      'IFC viewer privacy policy, BIM tool GDPR compliance, IFC file security, online IFC viewer NDA safe, BIM data privacy, IFC viewer no upload, GDPR BIM tool, IFC viewer data handling',
    canonical: `${SITE}/privacy`,
    ogImageAlt:
      'IFC Viewer Online Privacy Policy — browser-native IFC processing, zero uploads, GDPR compliant',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      name: 'IFC Viewer Online Privacy Policy — Frequently Asked Questions',
      description:
        'Privacy and data security FAQ for IFC Viewer Online — answering the questions IT departments and procurement teams ask before approving a BIM tool.',
      url: `${SITE}/privacy`,
      publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: SITE },
      mainEntity: PRIVACY_FAQ.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  } as PageMeta & { slug: string },
  {
    slug: 'terms',
    title: 'Terms of Use — IFC Viewer Online | Free Browser-Based IFC Viewer & Validator',
    description:
      'Terms of Use for IFC Viewer Online. Free, browser-native IFC viewer and validator — all model processing is client-side, files never leave your device. Results are informational only. Governed by Spanish law.',
    keywords:
      'IFC viewer terms of use, BIM tool terms of service, online IFC viewer legal, free IFC viewer terms, IFC validator disclaimer',
    canonical: `${SITE}/terms`,
    ogImageAlt:
      'IFC Viewer Online Terms of Use — free browser-based IFC viewer and validator',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Terms of Use — IFC Viewer Online',
      description:
        'Terms of Use for IFC Viewer Online — a free, browser-native IFC viewer and validator. Files never leave the user\'s device. Validation results are informational only.',
      url: `${SITE}/terms`,
      inLanguage: 'en',
      publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: SITE },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'IFC Viewer Online', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Terms of Use', item: `${SITE}/terms` },
        ],
      },
    },
  } as PageMeta & { slug: string },
]

export function generateLegalPages(distDir: string): LegalPagesResult {
  const result: LegalPagesResult = { pages: 0, errors: 0 }

  const indexPath = path.join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    console.warn('[legal-pages] dist/index.html not found — skipping legal page generation.')
    return result
  }
  const template = readFileSync(indexPath, 'utf-8')

  for (const page of LEGAL_PAGES) {
    const { slug, ...meta } = page as PageMeta & { slug: string }
    try {
      const outDir = path.join(distDir, slug)
      mkdirSync(outDir, { recursive: true })
      writeFileSync(path.join(outDir, 'index.html'), tweakHtml(template, meta))
      result.pages++
    } catch (err) {
      console.error(`[legal-pages] Error generating "${slug}":`, err)
      result.errors++
    }
  }

  return result
}
