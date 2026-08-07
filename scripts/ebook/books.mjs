// ─── Book registry for the ebook build ────────────────────────────────────────
//
// One entry per free handbook. `content` is the prose module; `needsRules` says
// whether the book uses the generated blocks that read the shipping validator
// (the 44-check reference, the score weights, the check index).
//
// The web-facing facts for the same books — routes, page counts, download
// filenames — live in src/lib/ebook.ts, which the landing and the SEO shells
// import. build-ebook.mjs cross-checks the page counts against that file.

export const BOOKS = [
  {
    id:         'ifc-delivery',
    content:    './content.mjs',
    needsRules: true,
    pdf:        'ifc-delivery-handbook.pdf',
    cover:      'handbook-cover.png',
    og:         'og-handbook.png',
  },
  {
    id:         'bim-information',
    content:    './content-bim.mjs',
    needsRules: false,
    pdf:        'bim-information-handbook.pdf',
    cover:      'bim-handbook-cover.png',
    og:         'og-bim-handbook.png',
  },
]
