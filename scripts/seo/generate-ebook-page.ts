// ── Static shells for the /ebook lead-magnet landings ─────────────────────────
//
// One shell per handbook in src/lib/ebook.ts:
//   dist/ebook/index.html                     → the primary book
//   dist/ebook/<route>/index.html             → each further book
//
// Each is a copy of dist/index.html with the <head> patched for that book
// (title, description, canonical, OG card, Book + FAQPage JSON-LD). Same
// mechanism as the legal and blog shells — the SPA reads the pathname on mount
// and renders EbookView with the matching book.
//
// The PDFs and cover images live in public/ebook/ (built by `npm run ebook`), so
// Vite has already copied them into dist/ebook/ when this runs. Writing
// index.html into that folder is safe: the assets have their own filenames.
//
// Invoked from vite.config.ts (closeBundle), after generateLegalPageShells().

import path from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { RULE_COUNT } from '../../src/types'
import { EBOOKS, type EbookMeta } from '../../src/lib/ebook'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')

interface BookSeo {
  title: string
  description: string
  keywords: string
  /** schema.org `about` topics. */
  about: string[]
  faq: { q: string; a: string }[]
}

const SEO: Record<string, (b: EbookMeta) => BookSeo> = {
  'ifc-delivery': (b) => ({
    title: `${b.title} — Free ${b.pages}-Page PDF for BIM Coordinators`,
    description:
      `Free ${b.pages}-page handbook on delivering IFC models that get accepted: all ${RULE_COUNT} validation checks with the fix in Revit, ArchiCAD, Tekla and Allplan, the Health Score formula in full, BEP clauses and a pre-delivery checklist. No account needed.`,
    keywords:
      'IFC delivery handbook, IFC validation checklist, BIM delivery guide, IFC quality checks, BEP quality clauses, ISO 19650 IFC delivery, IFC health score, free BIM ebook, IFC model acceptance criteria',
    about: ['Industry Foundation Classes', 'Building Information Modelling', 'ISO 19650', 'IFC validation'],
    faq: [
      {
        q: `Is ${b.title} really free?`,
        a: `Yes. No card, no account, no trial. It is priced at ${b.retail} because that is what a handbook this size sells for; it is given away because a BIM coordinator who checks their models before delivery is exactly the person the validator is built for.`,
      },
      {
        q: 'What is inside the handbook?',
        a: `Seven chapters and four appendices across ${b.pages} pages: why deliveries get rejected, what ISO 19650 delivery actually requires, the pre-flight check and the Health Score formula, a reference to all ${RULE_COUNT} validation checks with the fix in four authoring tools, the delivery workflow, the evidence pack, and BEP clauses plus acceptance criteria you can copy.`,
      },
      {
        q: 'Which authoring tools does it cover?',
        a: 'The fix for each check is written out for Revit, ArchiCAD, Tekla Structures and Allplan. The underlying cause is described tool-independently, so the reasoning transfers to any IFC exporter.',
      },
      {
        q: 'Do I need to use IFC Viewer Online to apply it?',
        a: 'No. Every check in the reference is a statement about an IFC file, not about a product, and is reproducible in any checker. IFC Viewer Online happens to be free and to run entirely in the browser, which makes it convenient rather than necessary.',
      },
      {
        q: 'What happens to my email address?',
        a: 'It is added to the IFC Viewer Online mailing list so we can send the handbook and, occasionally, new guides. It is never shared or resold, and unsubscribing takes one click. The download itself is not conditional on staying subscribed.',
      },
    ],
  }),

  'bim-information': (b) => ({
    title: `${b.title} — Free ${b.pages}-Page PDF on CDE, ISO 19650 and LOIN`,
    description:
      `Free ${b.pages}-page handbook on BIM information management: how a common data environment actually works, the OIR → AIR → EIR → BEP requirement chain, level of information need instead of LOD numbers, delivery planning, federation, quality gates and asset handover. No account needed.`,
    keywords:
      'BIM information management, common data environment, CDE ISO 19650, level of information need, LOIN, LOD explained, EIR template, BIM execution plan, MIDP TIDP, BIM handover COBie, free BIM ebook',
    about: ['Building Information Modelling', 'Common Data Environment', 'ISO 19650', 'Level of Information Need', 'Asset Information Management'],
    faq: [
      {
        q: `Is ${b.title} really free?`,
        a: `Yes. No card, no account, no trial. It is priced at ${b.retail} because that is what a handbook this size sells for, and given away because the people who run information properly are the people the validator is built for.`,
      },
      {
        q: 'What is inside the handbook?',
        a: `Eleven chapters and four appendices across ${b.pages} pages: what BIM is once the marketing stops, the common data environment and its four states, the OIR → AIR → PIR → EIR → BEP requirement chain, level of information need, delivery planning with TIDP and MIDP, roles and responsibilities, running a CDE day to day, federation and coordination, quality gates, handover from project information model to asset information model, and what to do first.`,
      },
      {
        q: 'Does it replace reading ISO 19650?',
        a: 'No. It explains what the ISO 19650 machinery does in operational terms, which the standard deliberately does not. Where the normative wording matters — and it does when things go legal — buy the standard.',
      },
      {
        q: 'What is the difference between LOD and level of information need?',
        a: 'LOD is a US-origin scheme (AIA and the BIMForum specification) expressing element reliability as a number from 100 to 500, frequently confused with level of detail, which is geometry only. Level of information need is the European framework (EN 17412-1) that ISO 19650 refers to: specify the geometry, data and documentation required by purpose, rather than compressing them into one number. Chapter 4 covers both and gives a specification table to replace the number.',
      },
      {
        q: 'Is the handbook tied to any software?',
        a: 'No. There are no product menus in it. It covers the process — the CDE, the requirement chain, level of information need, delivery planning, federation, quality gates and handover — which is independent of which authoring tool or platform a project uses.',
      },
    ],
  }),
}

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

export interface EbookPageResult {
  /** Number of shells written. */
  pages: number
  errors: number
}

function renderShell(template: string, book: EbookMeta, seo: BookSeo): string {
  const canonical = `${SITE}/ebook/${book.route ? `${book.route}/` : ''}`
  const ogImage   = `${SITE}/${book.ogFile}`
  const ogAlt     = `${book.title} — free ${book.pages}-page PDF`

  let html = template

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.title)}</title>`)
  html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(seo.description)}$2`)
  html = html.replace(/(<meta\s+name="keywords"\s+content=")[^"]*(")/,    `$1${esc(seo.keywords)}$2`)
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/,       `$1${esc(canonical)}$2`)

  html = html.replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/,       `$1${esc(seo.title)}$2`)
  html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(seo.description)}$2`)
  html = html.replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/,         `$1${esc(canonical)}$2`)
  html = html.replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/,       `$1${esc(ogImage)}$2`)
  html = html.replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,       `$1${esc(seo.title)}$2`)
  html = html.replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${esc(seo.description)}$2`)
  html = html.replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/,       `$1${esc(ogImage)}$2`)
  // Replace (never duplicate) the root shell's og:type.
  html = html.replace(/(<meta\s+property="og:type"\s+content=")[^"]*(")/,        '$1book$2')

  // The handbooks are English-only — drop the root hreflang set, self-reference.
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')

  const bookLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    alternateName: book.subtitle,
    bookFormat: 'https://schema.org/EBook',
    numberOfPages: book.pages,
    inLanguage: 'en',
    url: canonical,
    image: ogImage,
    description: seo.description,
    author:    { '@type': 'Person', name: 'Joel Benitez', url: 'https://github.com/j03rul4nd' },
    publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: SITE },
    about: seo.about,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: canonical,
    },
  }

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: seo.faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }

  const injected = [
    `<link rel="alternate" hreflang="en"        href="${esc(canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${esc(canonical)}" />`,
    `<meta property="og:image:alt"  content="${esc(ogAlt)}" />`,
    `<meta name="twitter:image:alt" content="${esc(ogAlt)}" />`,
    `<script type="application/ld+json">${jsonEsc(JSON.stringify(bookLd))}</script>`,
    `<script type="application/ld+json">${jsonEsc(JSON.stringify(faqLd))}</script>`,
  ].join('\n  ')

  return html.replace('</head>', `  ${injected}\n</head>`)
}

export function generateEbookPage(distDir: string): EbookPageResult {
  const result: EbookPageResult = { pages: 0, errors: 0 }

  const indexPath = path.join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    console.warn('[ebook-page] dist/index.html not found — skipping ebook shells.')
    return result
  }
  const template = readFileSync(indexPath, 'utf-8')

  for (const book of EBOOKS) {
    // A landing is only worth shipping if its download exists.
    if (!existsSync(path.join(distDir, ...book.pdfFile.split('/')))) {
      console.warn(`[ebook-page] dist/${book.pdfFile} missing — run \`npm run ebook\`. "${book.id}" skipped.`)
      continue
    }

    const seo = SEO[book.id]?.(book)
    if (!seo) {
      console.error(`[ebook-page] no SEO copy for book "${book.id}" — add it to scripts/seo/generate-ebook-page.ts.`)
      result.errors++
      continue
    }

    try {
      const outDir = path.join(distDir, 'ebook', ...(book.route ? [book.route] : []))
      mkdirSync(outDir, { recursive: true })
      writeFileSync(path.join(outDir, 'index.html'), renderShell(template, book, seo))
      result.pages++
    } catch (err) {
      console.error(`[ebook-page] Error generating the shell for "${book.id}":`, err)
      result.errors++
    }
  }

  return result
}
