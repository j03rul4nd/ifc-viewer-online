/**
 * Pure CSV logic for the Shopify bulk import builder (/shopify/bulk/).
 * Takes a Shopify product export plus a mapping (CSV or a folder listing) and
 * returns the same export with metafield columns filled, ready for
 * Admin → Products → Import ("Overwrite products with matching handles").
 * No DOM, no network.
 */

export type Table = { header: string[]; rows: string[][] }

/** RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF/CR, UTF-8 BOM. */
export function parseCsv(text: string): Table {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { quoted = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r' || c === '\n') {
      row.push(field); field = ''
      out.push(row); row = []
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1
      continue
    }
    field += c; i++
  }
  if (field !== '' || row.length) { row.push(field); out.push(row) }
  const rows = out.filter((r) => !(r.length === 1 && r[0] === ''))
  const header = rows.shift() ?? []
  return { header, rows }
}

function cell(v: string): string {
  return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toCsv(t: Table): string {
  return [t.header, ...t.rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** One mapping entry: key is a SKU or a handle. */
export type MappingEntry = {
  key: string
  modelUrl: string
  posterUrl?: string
  files?: string[]
  /** New version label (`ifcvo.version`); also sets `ifcvo.updated_at`. */
  version?: string
  /** What changed (`ifcvo.release_notes`). */
  releaseNotes?: string
}

const splitList = (v: string): string[] =>
  v.split(/[;|\n]/).map((s) => s.trim()).filter(Boolean)

/**
 * Mapping CSV: `SKU,model_url[,poster_url,files,version,release_notes]`, header optional.
 * Files split by `;` or `|`.
 */
export function parseMapping(text: string): MappingEntry[] {
  const t = parseCsv(text)
  const all = [t.header, ...t.rows]
  const first = (t.header[1] ?? '').trim()
  const hasHeader = t.header.length > 0 && !/^https?:\/\//i.test(first)
  const rows = hasHeader ? t.rows : all
  const entries: MappingEntry[] = []
  for (const r of rows) {
    const key = (r[0] ?? '').trim()
    const modelUrl = (r[1] ?? '').trim()
    if (!key || !modelUrl) continue
    const e: MappingEntry = { key, modelUrl }
    const poster = (r[2] ?? '').trim()
    if (poster) e.posterUrl = poster
    const files = splitList(r[3] ?? '')
    if (files.length) e.files = files
    const version = (r[4] ?? '').trim()
    if (version) e.version = version
    const notes = (r[5] ?? '').trim()
    if (notes) e.releaseNotes = notes
    entries.push(e)
  }
  return entries
}

/** Normalises a SKU/handle/filename stem for comparison. */
export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const stem = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? name
  return base.replace(/\.[^.]+$/, '')
}

/**
 * Folder listing → mapping. Model files (.ifc/.ifczip/.frag) become `modelUrl`
 * as `baseUrl + filename`; images with the same stem become posters. The key is
 * the file stem; matching against SKUs happens in buildImport (fuzzy or exact).
 */
export function mappingFromFilenames(names: string[], baseUrl: string): MappingEntry[] {
  const base = baseUrl && !baseUrl.endsWith('/') ? baseUrl + '/' : baseUrl
  const url = (n: string) => base + encodeURIComponent(n.split(/[\\/]/).pop() ?? n)
  const posters = new Map<string, string>()
  for (const n of names) if (/\.(png|jpe?g|webp)$/i.test(n)) posters.set(norm(stem(n)), url(n))
  const out: MappingEntry[] = []
  for (const n of names) {
    if (!/\.(ifc|ifczip|frag)$/i.test(n)) continue
    const e: MappingEntry = { key: stem(n), modelUrl: url(n) }
    const p = posters.get(norm(stem(n)))
    if (p) e.posterUrl = p
    out.push(e)
  }
  return out
}

export const COLUMNS = {
  model: { key: 'custom.ifc_model', type: 'url' },
  poster: { key: 'custom.ifc_poster', type: 'url' },
  files: { key: 'custom.bim_files', type: 'list.url' },
  version: { key: 'ifcvo.version', type: 'single_line_text_field' },
  updatedAt: { key: 'ifcvo.updated_at', type: 'date' },
  releaseNotes: { key: 'ifcvo.release_notes', type: 'multi_line_text_field' },
} as const

/** Today as YYYY-MM-DD on the local calendar. */
export function localDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Finds an existing metafield column (old or new export format) or appends one. */
function ensureColumn(header: string[], key: string, type: string): number {
  const idx = header.findIndex(
    (h) => h.startsWith(`Metafield: ${key} [`) || h.includes(`(product.metafields.${key})`),
  )
  if (idx >= 0) return idx
  header.push(`Metafield: ${key} [${type}]`)
  return header.length - 1
}

export type ImportResult = {
  table: Table
  matched: { handle: string; key: string; by: 'sku' | 'handle' | 'fuzzy' }[]
  /** Mapping entries that matched no product. */
  unmatchedEntries: MappingEntry[]
  /** Product handles that got no model. */
  unmatchedProducts: string[]
  /** Fuzzy keys that matched more than one product (not applied). */
  ambiguous: { key: string; handles: string[] }[]
}

export function buildImport(
  exportCsv: Table,
  mapping: MappingEntry[],
  /** releaseDate: `ifcvo.updated_at` for rows with a version (default: today). */
  opts: { fuzzy?: boolean; releaseDate?: string } = {},
): ImportResult {
  const header = [...exportCsv.header]
  const hIdx = header.indexOf('Handle')
  if (hIdx < 0) throw new Error('The product CSV has no "Handle" column. Export it from Admin → Products → Export.')
  const skuIdx = header.indexOf('Variant SKU')
  const cMod = ensureColumn(header, COLUMNS.model.key, COLUMNS.model.type)
  const cPos = ensureColumn(header, COLUMNS.poster.key, COLUMNS.poster.type)
  const cFil = ensureColumn(header, COLUMNS.files.key, COLUMNS.files.type)
  // Release columns only when the mapping uses them, so plain imports stay unchanged.
  const hasRelease = mapping.some((e) => e.version || e.releaseNotes)
  const cVer = hasRelease ? ensureColumn(header, COLUMNS.version.key, COLUMNS.version.type) : -1
  const cDay = hasRelease ? ensureColumn(header, COLUMNS.updatedAt.key, COLUMNS.updatedAt.type) : -1
  const cNot = hasRelease ? ensureColumn(header, COLUMNS.releaseNotes.key, COLUMNS.releaseNotes.type) : -1
  const releaseDate = opts.releaseDate ?? localDay()
  const rows = exportCsv.rows.map((r) => {
    const c = r.slice()
    while (c.length < header.length) c.push('')
    return c
  })

  // First row of each handle carries product-level metafields.
  const firstRow = new Map<string, number>()
  const bySku = new Map<string, string>()
  const byHandle = new Map<string, string>()
  const normIndex: { n: string; handle: string }[] = []
  rows.forEach((r, i) => {
    const h = r[hIdx].trim()
    if (!h) return
    if (!firstRow.has(h)) {
      firstRow.set(h, i)
      byHandle.set(h.toLowerCase(), h)
      normIndex.push({ n: norm(h), handle: h })
    }
    const sku = skuIdx >= 0 ? r[skuIdx].trim() : ''
    if (sku) {
      bySku.set(sku.toLowerCase(), h)
      normIndex.push({ n: norm(sku), handle: h })
    }
  })

  const matched: ImportResult['matched'] = []
  const unmatchedEntries: MappingEntry[] = []
  const ambiguous: ImportResult['ambiguous'] = []
  const done = new Set<string>()
  for (const e of mapping) {
    const k = e.key.trim().toLowerCase()
    let handle = bySku.get(k)
    let by: 'sku' | 'handle' | 'fuzzy' = 'sku'
    if (!handle) { handle = byHandle.get(k); by = 'handle' }
    if (!handle && opts.fuzzy) {
      const nk = norm(e.key)
      if (nk) {
        const exact = new Set(normIndex.filter((x) => x.n === nk).map((x) => x.handle))
        let cands = exact
        if (!cands.size) {
          // Longest SKU/handle contained in the filename stem (or vice versa) wins.
          let best = 0
          cands = new Set()
          for (const x of normIndex) {
            if (x.n.length < 3) continue
            if (nk.includes(x.n) || x.n.includes(nk)) {
              const len = Math.min(x.n.length, nk.length)
              if (len > best) { best = len; cands = new Set([x.handle]) }
              else if (len === best) cands.add(x.handle)
            }
          }
        }
        if (cands.size === 1) { handle = [...cands][0]; by = 'fuzzy' }
        else if (cands.size > 1) { ambiguous.push({ key: e.key, handles: [...cands] }); continue }
      }
    }
    if (!handle) { unmatchedEntries.push(e); continue }
    const r = rows[firstRow.get(handle)!]
    r[cMod] = e.modelUrl
    if (e.posterUrl) r[cPos] = e.posterUrl
    if (e.files?.length) r[cFil] = e.files.join('; ')
    if (e.version) { r[cVer] = e.version; r[cDay] = releaseDate }
    if (e.releaseNotes) r[cNot] = e.releaseNotes
    matched.push({ handle, key: e.key, by })
    done.add(handle)
  }
  const unmatchedProducts = [...firstRow.keys()].filter(
    (h) => !done.has(h) && !rows[firstRow.get(h)!][cMod],
  )
  return { table: { header, rows }, matched, unmatchedEntries, unmatchedProducts, ambiguous }
}
