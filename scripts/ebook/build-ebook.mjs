// ─── Build the free handbooks (lead-magnet ebooks) ────────────────────────────
//
//   npm run ebook                      # every book in scripts/ebook/books.mjs
//   npm run ebook -- bim-information   # just one, by id
//
// Renders each prose module into a print-designed A4 PDF plus a cover image and
// an Open Graph card in public/ebook/, which the /ebook landings hand over after
// an email is captured.
//
// Why a script and not hand-authored PDFs: the IFC book's check reference, its
// score-weight table and its check index are generated from the SHIPPING
// validator sources (rule table, category labels, default severities, and the
// D-22 remediation corpus). Add rule #45 and re-running this updates the book.
// A handbook that drifts away from the tool it documents is worse than none.
//
// Pipeline (mirrors scripts/og/*: system Chrome via playwright-core):
//   1. Import the rule data straight from src/ (TypeScript, via ts-hook.mjs).
//   2. Render HTML → scripts/ebook/.out/<id>.html
//   3. Pagination pass: for each chapter, hide it and everything after it, print,
//      count pages. That yields REAL page numbers for the contents page —
//      Chromium does not support CSS paged-media counters, so this is the only
//      way to get them without a PDF library.
//   4. Re-render with the numbers filled in, write the PDF, shoot cover + OG card.
//
// Env:
//   CHROME_EXE  path to chrome.exe (default: standard Windows install)

import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { BOOKS } from './books.mjs'
import { renderBook, renderOgCard } from './render.mjs'

const ROOT    = path.resolve(import.meta.dirname, '../..')
const OUT_DIR = path.join(ROOT, 'scripts/ebook/.out')
const PDF_DIR = path.join(ROOT, 'public/ebook')
const EXE     = process.env.CHROME_EXE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const only     = process.argv.slice(2).filter(a => !a.startsWith('-'))
const selected = only.length ? BOOKS.filter(b => only.includes(b.id)) : BOOKS

if (selected.length === 0) {
  console.error(`[ebook] no book matches ${only.join(', ')} — known ids: ${BOOKS.map(b => b.id).join(', ')}`)
  process.exit(1)
}

// ── Rule data, straight from the validator sources ────────────────────────────

const types     = await import(pathToFileURL(path.join(ROOT, 'src/types/index.ts')).href)
const validator = await import(pathToFileURL(path.join(ROOT, 'src/lib/validator.ts')).href)
const remedFile = await import(pathToFileURL(path.join(ROOT, 'src/i18n/rule-remediation.ts')).href)
const facts     = await import(pathToFileURL(path.join(ROOT, 'src/lib/ebook.ts')).href)

const remediation = remedFile.RULE_REMEDIATION.en ?? {}

const RULES = Object.values(types.RULE_METADATA).map(m => ({
  id:          m.id,
  label:       types.getRuleLabel(m.id, 'en'),
  desc:        types.getRuleDescription(m.id, 'en'),
  category:    m.category,
  standard:    m.standard,
  severity:    m.defaultSeverity,
  autoFixable: m.autoFixable,
  remediation: remediation[m.id] ?? null,
}))

if (RULES.length !== types.RULE_COUNT) {
  throw new Error(
    `[ebook] RULE_METADATA has ${RULES.length} entries but RULE_COUNT is ${types.RULE_COUNT}. ` +
    'The books quote the count in prose — fix the mismatch before publishing.',
  )
}

const missingFix = RULES.filter(r => !r.remediation?.summary).map(r => r.id)
if (missingFix.length) {
  console.warn(`[ebook] ${missingFix.length} rule(s) have no EN remediation text: ${missingFix.join(', ')}`)
}

// `{{n}}` in any chapter title or block text expands to the real check count, so
// prose like "The 44-check reference" cannot drift from DEFAULT_RULES.
function expand(value) {
  if (typeof value === 'string') return value.replaceAll('{{n}}', String(RULES.length))
  if (Array.isArray(value)) return value.map(expand)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v)]))
  }
  return value
}

// ── Chrome ────────────────────────────────────────────────────────────────────

if (!existsSync(EXE)) {
  console.error(`[ebook] Chrome not found at ${EXE} — set CHROME_EXE to your chrome.exe path.`)
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(PDF_DIR, { recursive: true })

/** Page count of a PDF buffer — Chromium emits one /Type /Page object per page. */
function pageCount(buf) {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

const PDF_OPTS = {
  format:              'A4',
  printBackground:     true,
  displayHeaderFooter: true,
  // Side margins are 0 so panels can bleed; horizontal padding is CSS.
  // @page :first { margin:0 } makes the cover full-bleed.
  margin:         { top: '18mm', bottom: '16mm', left: '0', right: '0' },
  headerTemplate: '<div></div>',
  // Chrome paints the footer band at a fixed offset from the paper edge on EVERY
  // page — CSS cannot suppress it on the cover. So it is a bare folio: a small
  // grey numeral reads as a printer's mark over the cover art, where a running
  // title would read as a mistake.
  footerTemplate:
    '<div style="width:100%;font-family:Segoe UI,Helvetica,sans-serif;font-size:7.5pt;color:#A8AFC0;' +
    'padding:0 32mm;text-align:right;"><span class="pageNumber"></span></div>',
}

const browser = await chromium.launch({ executablePath: EXE, headless: true })
const page    = await browser.newPage()

// ── Per book ──────────────────────────────────────────────────────────────────

let failures = 0

for (const spec of selected) {
  const module   = await import(new URL(spec.content, import.meta.url).href)
  const BOOK     = expand(module.BOOK)
  const CHAPTERS = expand(module.CHAPTERS)

  const context = {
    book:           BOOK,
    chapters:       CHAPTERS,
    rules:          spec.needsRules ? RULES : [],
    weights:        validator.__scoreWeights,
    categoryLabels: types.VALIDATION_CATEGORY_LABELS,
    generatedOn:    new Date().toISOString().slice(0, 10),
    fontsHref:      '../../../public/fonts',
  }

  const htmlPath = path.join(OUT_DIR, `${spec.id}.html`)
  const htmlUrl  = pathToFileURL(htmlPath).href

  /** Write the HTML, load it, print it, return the PDF buffer. */
  const print = async (html) => {
    writeFileSync(htmlPath, html, 'utf-8')
    await page.goto(htmlUrl, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    return page.pdf(PDF_OPTS)
  }

  console.log(`\n[ebook] ${BOOK.title} — ${CHAPTERS.length} chapters${spec.needsRules ? ` · ${RULES.length} checks` : ''}`)
  console.log('[ebook] measuring page numbers…')

  const pageNumbers = {}
  let previous = 0
  for (const chapter of CHAPTERS) {
    // Hide this chapter and every section after it, then count what is left.
    // Chapters force a page break, so the next one starts on lastPage + 1.
    const truncate = `<style>#ch-${chapter.id}, #ch-${chapter.id} ~ * { display:none !important }</style>`
    const html     = renderBook({ ...context, pageNumbers: {} }).replace('</head>', `${truncate}</head>`)
    const start    = pageCount(await print(html)) + 1

    // Monotonicity guard: a chapter can never start before the previous one.
    pageNumbers[chapter.id] = start > previous ? start : previous + 1
    previous = pageNumbers[chapter.id]
    console.log(`[ebook]   p.${String(pageNumbers[chapter.id]).padStart(3)}  ${chapter.kicker} — ${chapter.title}`)
  }

  const pdf    = await print(renderBook({ ...context, pageNumbers }))
  const pdfOut = path.join(PDF_DIR, spec.pdf)
  writeFileSync(pdfOut, pdf)
  const pages = pageCount(pdf)
  console.log(`[ebook] wrote ${path.relative(ROOT, pdfOut)} — ${pages} pages, ${Math.round(pdf.length / 1024)} KB`)

  // Cover image for the landing — the real cover, not a mock-up.
  const coverOut = path.join(PDF_DIR, spec.cover)
  const shot = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.5 })
  await shot.goto(htmlUrl, { waitUntil: 'load' })
  await shot.evaluate(() => document.fonts.ready)
  await (await shot.$('.cover')).screenshot({ path: coverOut })
  await shot.close()

  // Open Graph card (1200×630) for shares.
  const ogHtml = path.join(OUT_DIR, `${spec.id}-og.html`)
  const ogOut  = path.join(PDF_DIR, spec.og)
  writeFileSync(ogHtml, renderOgCard({
    book:      BOOK,
    pages,
    coverHref: pathToFileURL(coverOut).href,
    fontsHref: context.fontsHref,
  }), 'utf-8')
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await og.goto(pathToFileURL(ogHtml).href, { waitUntil: 'load' })
  await og.evaluate(() => document.fonts.ready)
  await og.screenshot({ path: ogOut })
  await og.close()
  console.log(`[ebook] wrote ${path.relative(ROOT, coverOut)} + ${path.relative(ROOT, ogOut)}`)

  // The landings and their structured data quote the page count from
  // src/lib/ebook.ts. Fail loudly rather than shipping a wrong promise.
  const meta = facts.ebookById(spec.id)
  if (!meta) {
    console.error(`[ebook] src/lib/ebook.ts has no entry with id "${spec.id}".`)
    failures++
  } else if (meta.pages !== pages) {
    console.error(
      `[ebook] src/lib/ebook.ts says ${spec.id} is ${meta.pages} pages but the PDF has ${pages}. ` +
      'Update the registry — the landing and its structured data quote it.',
    )
    failures++
  }
}

await browser.close()
if (failures > 0) process.exitCode = 1
