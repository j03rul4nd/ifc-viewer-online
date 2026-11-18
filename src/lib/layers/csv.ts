// ─── csv ──────────────────────────────────────────────────────────────────────
// Tables as they are actually published — CSV with quotes and accents, ';'
// separated exports, and "records" with no header at all (Barcelona's traffic
// feed: `1#20261008171601#2#3`). Parsed into a table, and — when the table
// carries a place — into GeoJSON:
//
//   lon / lat columns          → points   (lon, lng, longitud, x / lat, latitud, y)
//   a WKT column               → any      (POINT, LINESTRING, POLYGON, MULTI…)
//   a flat coordinate list     → a line   ("2.11,41.38,2.10,41.38", BCN tramos)
//
// A table WITHOUT a place is still useful: it can be JOINED to a layer that
// has one (join.ts) — which is how a live status feed colours a street network.
//
// Pure: no DOM.

export interface Table {
  columns: string[]
  rows: string[][]
}

export interface ParseOptions {
  /** Force a delimiter; default: detected among , ; \t | # */
  delimiter?: string
  /** Whether the first row is a header; default: detected. */
  header?: boolean
  /** Names for headerless tables (missing ones become c1, c2…). */
  columns?: string[]
}

const CANDIDATES = [',', ';', '\t', '|', '#']

/** Split one physical-or-logical line respecting "quoted, fields" with "" escapes. */
function splitRows(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
      continue
    }
    if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row) }
  return rows
}

/** The delimiter that splits the first lines into the same, largest column count. */
export function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10).join('\n')
  let best = ',', bestScore = 0
  for (const d of CANDIDATES) {
    const counts = splitRows(head, d).map((r) => r.length)
    if (counts.length === 0) continue
    const consistent = counts.every((n) => n === counts[0])
    const score = consistent && counts[0] > 1 ? counts[0] + 100 : Math.min(...counts)
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

const isNum = (s: string): boolean => s.trim() !== '' && Number.isFinite(Number(s.trim().replace(',', '.')))

export function parseTable(text: string, opts: ParseOptions = {}): Table {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const delim = opts.delimiter ?? detectDelimiter(clean)
  const rows = splitRows(clean, delim)
  if (rows.length === 0) return { columns: [], rows: [] }
  // A header is a first row of non-numbers above rows that do have numbers.
  const header = opts.header ?? (rows[0].every((c) => !isNum(c)) && rows.slice(1, 6).some((r) => r.some(isNum)))
  const width = Math.max(...rows.slice(0, 50).map((r) => r.length))
  const columns = header
    ? rows[0].map((c, i) => c.trim() || `c${i + 1}`)
    : Array.from({ length: width }, (_, i) => opts.columns?.[i] ?? `c${i + 1}`)
  return { columns, rows: header ? rows.slice(1) : rows }
}

// ── Geometry ───────────────────────────────────────────────────────────────────

const LON = /^(lon|lng|long|longitude|longitud|x|coord_x|utm_x)$/i
const LAT = /^(lat|latitude|latitud|y|coord_y|utm_y)$/i
const WKT = /^(wkt|geometry|geom|the_geom|geometria|geometrie)$/i

export type GeometrySpec =
  | { kind: 'lonlat'; lon: number; lat: number }
  | { kind: 'wkt'; col: number }
  | { kind: 'coordlist'; col: number }
  | { kind: 'none' }

const pairsOf = (s: string): number[] | null => {
  const n = s.split(/[\s,;]+/).filter(Boolean).map(Number)
  return n.length >= 2 && n.length % 2 === 0 && n.every(Number.isFinite) ? n : null
}

/** Which columns hold the place, judged on the first rows' VALUES as well as the names. */
export function detectGeometry(t: Table): GeometrySpec {
  const sample = t.rows.slice(0, 20)
  const lon = t.columns.findIndex((c) => LON.test(c.trim()))
  const lat = t.columns.findIndex((c) => LAT.test(c.trim()))
  if (lon >= 0 && lat >= 0 && sample.every((r) => isNum(r[lon] ?? '') && isNum(r[lat] ?? ''))) return { kind: 'lonlat', lon, lat }
  const wkt = t.columns.findIndex((c, i) => WKT.test(c.trim()) || sample.some((r) => /^\s*(MULTI)?(POINT|LINESTRING|POLYGON)\s*\(/i.test(r[i] ?? '')))
  if (wkt >= 0) return { kind: 'wkt', col: wkt }
  // A cell that is a run of lon,lat pairs (degrees): the BCN tramos.
  for (let i = 0; i < t.columns.length; i++) {
    if (sample.length && sample.every((r) => {
      const p = pairsOf(r[i] ?? '')
      return p !== null && p.length >= 4 && p.every((v, k) => (k % 2 ? Math.abs(v) <= 90 : Math.abs(v) <= 180))
    })) return { kind: 'coordlist', col: i }
  }
  return { kind: 'none' }
}

/** Minimal WKT → GeoJSON geometry (2D/3D; POINT, LINESTRING, POLYGON and their MULTI forms). */
export function parseWkt(w: string): { type: string; coordinates: unknown } | null {
  const m = /^\s*(MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|POINT|LINESTRING|POLYGON)\s*(Z|M|ZM)?\s*(\(.*\))\s*$/is.exec(w)
  if (!m) return null
  const type = m[1].toUpperCase()
  // Turn "(1 2, 3 4)" nesting into JSON arrays.
  const json = m[3]
    .replace(/(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)(\s+-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)+/gi, (pt) => `[${pt.trim().split(/\s+/).join(',')}]`)
    .replace(/\(/g, '[').replace(/\)/g, ']')
  let coords: unknown
  try { coords = JSON.parse(json) } catch { return null }
  const names: Record<string, string> = {
    POINT: 'Point', LINESTRING: 'LineString', POLYGON: 'Polygon',
    MULTIPOINT: 'MultiPoint', MULTILINESTRING: 'MultiLineString', MULTIPOLYGON: 'MultiPolygon',
  }
  // POINT (1 2) parses as [[1,2]] — unwrap one level.
  if (type === 'POINT') coords = (coords as unknown[])[0]
  if (type === 'MULTIPOINT') coords = (coords as unknown[]).map((c) => (Array.isArray((c as unknown[])[0]) ? (c as unknown[])[0] : c))
  return { type: names[type], coordinates: coords }
}

/** Typed value: numbers as numbers (decimal comma accepted), the rest as text. */
function cellValue(s: string): string | number | null {
  const v = s.trim()
  if (v === '') return null
  if (/^-?\d+([.,]\d+)?$/.test(v) && v.length < 16) return Number(v.replace(',', '.'))
  return v
}

/** A table with a place → GeoJSON FeatureCollection. Null when it has none. */
export function tableToGeoJson(t: Table, spec: GeometrySpec = detectGeometry(t)): { type: 'FeatureCollection'; features: unknown[] } | null {
  if (spec.kind === 'none') return null
  const geomCols = new Set(spec.kind === 'lonlat' ? [spec.lon, spec.lat] : [spec.col])
  const features = t.rows.map((r, i) => {
    let geometry: unknown = null
    if (spec.kind === 'lonlat') geometry = { type: 'Point', coordinates: [Number(r[spec.lon].replace(',', '.')), Number(r[spec.lat].replace(',', '.'))] }
    else if (spec.kind === 'wkt') geometry = parseWkt(r[spec.col] ?? '')
    else {
      const p = pairsOf(r[spec.col] ?? '')
      if (p) {
        const pts: number[][] = []
        for (let k = 0; k < p.length; k += 2) pts.push([p[k], p[k + 1]])
        geometry = pts.length === 1 ? { type: 'Point', coordinates: pts[0] } : { type: 'LineString', coordinates: pts }
      }
    }
    const properties: Record<string, unknown> = {}
    t.columns.forEach((c, k) => { if (!geomCols.has(k)) properties[c] = cellValue(r[k] ?? '') })
    return { type: 'Feature', id: String(properties[t.columns.find((_, k) => !geomCols.has(k)) ?? ''] ?? i), properties, geometry }
  })
  return { type: 'FeatureCollection', features }
}
