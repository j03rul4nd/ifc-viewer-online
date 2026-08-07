/**
 * The free handbooks (/ebook) — one registry so every surface quotes the same
 * facts: the React landing (EbookView), the static SEO shells
 * (scripts/seo/generate-ebook-page.ts) and the blog CTA card.
 *
 * The PDFs are built by `npm run ebook`, which fails loudly when a `pages`
 * value here no longer matches the document it just rendered.
 *
 * Kept free of `import.meta` so Node (the shell generator, run from
 * vite.config.ts) can import it too.
 */

export interface EbookMeta {
  /** Stable id — also the key used by scripts/ebook/books.mjs. */
  id: string
  /** Path segment under /ebook/. Empty string = the primary landing at /ebook/. */
  route: string
  title: string
  subtitle: string
  /** One line for cards and meta descriptions. */
  blurb: string
  /** Page count of the rendered PDF. Verified by the build script. */
  pages: number
  /** Sticker price used to frame the giveaway. Never actually sold at this price. */
  retail: string
  /** Site-root-relative paths (no leading slash). */
  pdfFile: string
  coverFile: string
  ogFile: string
  /** Filename the browser saves the download as. */
  filename: string
  /** `source` sent to the subscribe worker, so leads are attributable per book. */
  subscribeSource: string
}

export const EBOOKS: EbookMeta[] = [
  {
    id:       'ifc-delivery',
    route:    '',
    title:    'The IFC Delivery Handbook',
    subtitle: 'How to check, prove and hand over IFC models that get accepted the first time',
    blurb:    'The file-level book: every validation check with the fix in four authoring tools, the Health Score formula in full, and the clauses that make quality contractual.',
    pages:    64,
    retail:   '€19.99',
    pdfFile:   'ebook/ifc-delivery-handbook.pdf',
    coverFile: 'ebook/handbook-cover.png',
    ogFile:    'ebook/og-handbook.png',
    filename:  'the-ifc-delivery-handbook.pdf',
    subscribeSource: 'ebook_landing',
  },
  {
    id:       'bim-information',
    route:    'bim-information-management',
    title:    'The BIM Information Handbook',
    subtitle: 'Common data environments, information requirements and level of information need — the delivery chain explained by what it does',
    blurb:    'The process-level book: how a CDE actually works, how the OIR → AIR → EIR → BEP chain fits together, and how to specify level of information need without arguing about LOD numbers.',
    pages:    48,
    retail:   '€19.99',
    pdfFile:   'ebook/bim-information-handbook.pdf',
    coverFile: 'ebook/bim-handbook-cover.png',
    ogFile:    'ebook/og-bim-handbook.png',
    filename:  'the-bim-information-handbook.pdf',
    subscribeSource: 'ebook_bim_landing',
  },
]

export function ebookById(id: string): EbookMeta | undefined {
  return EBOOKS.find(b => b.id === id)
}

/** Resolve an /ebook[/<route>] path segment to a book. Unknown routes → undefined. */
export function ebookByRoute(route: string): EbookMeta | undefined {
  const clean = route.replace(/^\/+|\/+$/g, '')
  return EBOOKS.find(b => b.route === clean)
}

// ── Convenience for the primary book ─────────────────────────────────────────

export const PRIMARY_EBOOK = EBOOKS[0]
