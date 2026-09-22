// ─── Blog table analysis ─────────────────────────────────────────────────────
// Pure helpers behind the responsive <SmartTable>. No DOM, no React — the
// decisions a table makes about itself live here so they can be tested.
//
// A table does not get one responsive pattern. It gets the one that fits its
// SHAPE, because a 3-column glossary and a 10-column feature matrix fail on a
// phone for different reasons:
//
//   'stack'   few columns of prose → each row becomes a card, every field shown.
//   'records' many columns of prose → each row becomes a card, the first two
//             fields shown, the rest behind a per-row disclosure.
//   'matrix'  a grid of short verdicts (✓ / ✗ / Partial…) → keep the grid, but
//             let the reader focus ONE column at a time next to the row names.
//
// On a wide container every kind renders as a real <table>; the kind only
// governs what happens when the table no longer fits.

export type TableKind = 'stack' | 'records' | 'matrix'
export type CellTone = 'yes' | 'no' | 'partial' | null

export interface TableShape {
  kind: TableKind
  /** Offer header sorting (enough rows for order to matter). */
  sortable: boolean
  /** Offer a row filter (enough rows that scanning is slower than typing). */
  searchable: boolean
  /** Minimum inline size (px) the table needs before it must switch layout. */
  minWidth: number
}

const SORT_MIN_ROWS = 6
const SEARCH_MIN_ROWS = 8

/** Leading glyphs/words that carry a verdict. Order matters: longest first. */
const TONE_PREFIXES: Array<[RegExp, Exclude<CellTone, null>]> = [
  // Words like "None" or "Full" are deliberately absent: "Install: None" is
  // good news, and colouring it red would state the opposite of the cell.
  [/^(?:✅|✓|✔️?|(?:yes|sí|ja|oui)(?=[\s,.:;—–-]|$))/i, 'yes'],
  [/^(?:❌|✗|✘|(?:no|nein|non)(?=[\s,.:;—–-]|$))/i, 'no'],
  [/^(?:⚠️?|(?:partial|parcial|teilweise|partiel|limited)(?=[\s,.:;—–-]|$))/i, 'partial'],
]

export interface ParsedCell {
  tone: CellTone
  /** Text with the verdict glyph removed (words like "Yes" are kept). */
  text: string
}

/**
 * Split a cell into a verdict tone and its remaining text. Only GLYPHS are
 * stripped — a word such as "Partial" stays visible, because the pill colour
 * must never be the only carrier of meaning.
 */
export function parseCell(raw: string): ParsedCell {
  const value = raw.trim()
  for (const [re, tone] of TONE_PREFIXES) {
    const m = value.match(re)
    if (!m) continue
    const isGlyph = !/^[a-zà-ÿ]/i.test(m[0])
    const text = isGlyph ? value.slice(m[0].length).replace(/^[\s:—–-]+/, '') : value
    return { tone, text }
  }
  return { tone: null, text: value }
}

/** Accessible word for a tone, used when a cell was nothing but a glyph. */
export function toneLabel(tone: Exclude<CellTone, null>): string {
  return tone === 'yes' ? 'Yes' : tone === 'no' ? 'No' : 'Partial'
}

function isShortVerdict(cell: string): boolean {
  return parseCell(cell).tone !== null && cell.length <= 28
}

export function analyzeTable(headers: string[], rows: string[][], rowHeaders = true): TableShape {
  const cols = headers.length
  const dataCells = rows.flatMap((r) => (rowHeaders ? r.slice(1) : r))
  const verdictShare = dataCells.length
    ? dataCells.filter(isShortVerdict).length / dataCells.length
    : 0

  // Longest cell per column drives the width estimate: ~7px per character,
  // clamped, plus cell padding. Crude, but only the ORDER of magnitude matters.
  const minWidth = headers.reduce((sum, h, ci) => {
    const longest = Math.max(h.length, ...rows.map((r) => (r[ci] ?? '').length))
    return sum + Math.min(Math.max(longest * 7, 80), 220) + 28
  }, 0)

  let kind: TableKind
  if (cols >= 4 && rowHeaders && verdictShare >= 0.4) kind = 'matrix'
  else if (cols <= 3) kind = 'stack'
  else kind = 'records'

  return {
    kind,
    sortable: rows.length >= SORT_MIN_ROWS,
    searchable: rows.length >= SEARCH_MIN_ROWS,
    minWidth,
  }
}

/** Sort key: verdicts rank yes > partial > no, numbers numerically, else text. */
export function sortValue(cell: string): number | string {
  const { tone, text } = parseCell(cell)
  if (tone) return tone === 'yes' ? 2 : tone === 'partial' ? 1 : 0
  const n = Number.parseFloat(text.replace(/[^\d.,-]/g, '').replace(',', '.'))
  return /^\s*[€$£]?\s*[\d.,]+/.test(text) && Number.isFinite(n) ? n : text.toLowerCase()
}

export function compareCells(a: string, b: string): number {
  const va = sortValue(a)
  const vb = sortValue(b)
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb))
}

export function filterRows(rows: string[][], query: string): string[][] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => r.some((c) => c.toLowerCase().includes(q)))
}
