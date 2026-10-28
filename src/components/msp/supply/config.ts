// ─── A user's own import tracker ─────────────────────────────────────────────
// What a buyer sets to see their own orders instead of the demo's: company,
// warehouse, agent hub, route, costs, suppliers and the orders spreadsheet,
// plus where the agent's updates come from. All of it stays in the browser.

import { DEMO_SETUP, DEFAULT_COSTS, stageFromWord, type ImportsSetup, type OrderRow, type SupplierDef, type AgentUpdateRow, type Mode, type Costs } from './supply'
import { DEFAULT_ROUTE, ORIGIN_PORTS, ORIGIN_AIRPORTS, ORIGIN_RAIL, DEST_PORTS, DEST_AIRPORTS, DEST_RAIL, type LatLng, type RouteChoice } from './geo'

export interface UpdatesFeed {
  enabled: boolean
  /** A JSON list (or an object holding one at listPath) of {po, status, at?, lat?, lng?, note?}. */
  url: string
  everyS: number
  listPath: string
}

export interface ImportsTwinConfig {
  version: 1
  setup: ImportsSetup
  feed: UpdatesFeed
}

export const DEFAULT_UPDATES_FEED: UpdatesFeed = { enabled: false, url: '', everyS: 60, listPath: '' }

export const DEFAULT_IMPORTS_CONFIG: ImportsTwinConfig = {
  version: 1,
  setup: { ...DEMO_SETUP, company: 'My company', live: false },
  feed: DEFAULT_UPDATES_FEED,
}

const num = (v: unknown, d: number) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); return Number.isFinite(n) ? n : d }
const str = (v: unknown, d = '', max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? d : String(v).trim().slice(0, max))
const coord = (x: unknown) => (x === '' || x == null || (typeof x === 'string' && !x.trim()) ? NaN : Number(typeof x === 'string' ? x.replace(',', '.') : x))
const latLng = (v: unknown, d: LatLng): LatLng => {
  if (!Array.isArray(v) || v.length !== 2) return d
  const la = coord(v[0]), lo = coord(v[1])
  return Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? [la, lo] : d
}
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) && Number.isFinite(Date.parse(v.trim().slice(0, 10)))
const date = (v: unknown) => (isDate(v) ? (v as string).trim().slice(0, 10) : undefined)
const modeOf = (v: unknown): Mode => { const s = str(v).toLowerCase(); return /air|avi|flug|aér/.test(s) ? 'air' : /rail|train|tren|bahn/.test(s) ? 'rail' : 'sea' }

export function normaliseOrder(o: Record<string, unknown>): OrderRow | null {
  const po = str(o.po, '', 40)
  const units = Math.round(num(o.units, 0))
  if (!po || units <= 0) return null
  const qcMajor = o.qcMajor === '' || o.qcMajor == null ? undefined : num(o.qcMajor, NaN)
  const qcMinor = o.qcMinor === '' || o.qcMinor == null ? undefined : num(o.qcMinor, NaN)
  return {
    po, supplier: str(o.supplier, '', 80), goods: str(o.goods, 'Goods', 80), hs: str(o.hs, '', 20),
    dutyPct: Math.max(0, Math.min(100, num(o.dutyPct, 0))), units,
    unitPrice: Math.max(0, num(o.unitPrice, 0)), salePrice: Math.max(0, num(o.salePrice, 0)) || Math.max(0.01, num(o.unitPrice, 1) * 2.5),
    kgPerUnit: Math.max(0, num(o.kgPerUnit, 0.5)), cbmPerUnit: Math.max(0, num(o.cbmPerUnit, 0.002)),
    mode: modeOf(o.mode), incoterm: /exw/i.test(str(o.incoterm)) ? 'EXW' : 'FOB',
    container: str(o.container, '', 20) || undefined, viaCape: o.viaCape === true || /^(1|y|yes|true|s[ií])$/i.test(str(o.viaCape)),
    orderDate: date(o.orderDate), promisedDate: date(o.promisedDate), qcDate: date(o.qcDate), shippedDate: date(o.shippedDate),
    arrivedDate: date(o.arrivedDate), clearedDate: date(o.clearedDate), deliveredDate: date(o.deliveredDate),
    qcMajor: Number.isFinite(qcMajor) ? qcMajor : undefined, qcMinor: Number.isFinite(qcMinor) ? qcMinor : undefined,
  }
}

function normaliseSupplier(o: unknown, i: number): SupplierDef | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const name = str(r.name, '', 80)
  if (!name) return null
  const at = latLng(r.at, [NaN, NaN])
  if (!Number.isFinite(at[0])) return null
  const products = Array.isArray(r.products) ? (r.products as Record<string, unknown>[]).filter((p) => p && typeof p.goods === 'string').slice(0, 30).map((p) => ({
    goods: str(p.goods, '', 80), hs: str(p.hs, '', 20), duty: num(p.duty, 0), fob: num(p.fob, 1), kg: num(p.kg, 0.5), cbm: num(p.cbm, 0.002), price: num(p.price, 2),
  })) : undefined
  return { id: str(r.id, '', 40) || `s${i + 1}`, name, city: str(r.city, name.split(' ')[0], 40), at, ...(products?.length ? { products } : {}) }
}

export function normaliseImportsConfig(raw: unknown): ImportsTwinConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ImportsTwinConfig>
  const s = (r.setup ?? {}) as Partial<ImportsSetup>
  const D = DEFAULT_IMPORTS_CONFIG.setup
  const route = { ...DEFAULT_ROUTE } as RouteChoice
  const pickId = (k: keyof RouteChoice, table: Record<string, unknown>) => { const v = (s.route as Partial<RouteChoice> | undefined)?.[k]; if (typeof v === 'string' && v in table) route[k] = v }
  pickId('originPort', ORIGIN_PORTS); pickId('originAirport', ORIGIN_AIRPORTS); pickId('originRail', ORIGIN_RAIL)
  pickId('destPort', DEST_PORTS); pickId('destAirport', DEST_AIRPORTS); pickId('destRail', DEST_RAIL)
  const costs = { ...DEFAULT_COSTS } as Costs
  for (const k of Object.keys(costs) as (keyof Costs)[]) costs[k] = Math.max(0, num((s.costs as Partial<Costs> | undefined)?.[k], DEFAULT_COSTS[k]))
  const suppliers = Array.isArray(s.suppliers) ? s.suppliers.map(normaliseSupplier).filter((x): x is SupplierDef => !!x).slice(0, 50) : []
  const orders = Array.isArray(s.orders) ? s.orders.map((o) => normaliseOrder(o as unknown as Record<string, unknown>)).filter((x): x is OrderRow => !!x).slice(0, 300) : []
  const f = (r.feed ?? {}) as Partial<UpdatesFeed>
  return {
    version: 1,
    setup: {
      company: str(s.company, D.company, 80) || D.company,
      warehouse: { name: str(s.warehouse?.name, D.warehouse.name, 60) || D.warehouse.name, at: latLng(s.warehouse?.at, D.warehouse.at) },
      hub: { name: str(s.hub?.name, D.hub.name, 80) || D.hub.name, at: latLng(s.hub?.at, D.hub.at) },
      agent: str(s.agent, D.agent, 60) || D.agent,
      route, costs,
      suppliers: suppliers.length ? suppliers : D.suppliers,
      orders,
      live: s.live === true,
    },
    feed: {
      enabled: f.enabled === true, url: typeof f.url === 'string' && /^https?:\/\//.test(f.url) ? f.url.slice(0, 500) : '',
      everyS: Math.min(3600, Math.max(10, num(f.everyS, 60))), listPath: str(f.listPath, '', 60),
    },
  }
}

// ── Spreadsheets ─────────────────────────────────────────────────────────────

/** Header words people use, in English and Spanish, mapped to OrderRow keys. */
const ORDER_HEADERS: [RegExp, keyof OrderRow][] = [
  [/^(po|po ?(no|number|#)|order|pedido|orden)$/i, 'po'], [/supplier|vendor|proveedor|factory|f[aá]brica/i, 'supplier'],
  [/goods|product|item|descri|producto|art[ií]culo/i, 'goods'], [/^hs|hs ?code|taric|c[oó]digo ?hs/i, 'hs'],
  [/duty|arancel/i, 'dutyPct'], [/units|qty|quantity|cantidad|unidades/i, 'units'],
  [/unit ?(price|cost|fob)|fob|precio ?(unit|compra)|coste/i, 'unitPrice'], [/sale|sell|retail|pvp|venta/i, 'salePrice'],
  [/kg|weight|peso/i, 'kgPerUnit'], [/cbm|m3|m³|volume|volumen/i, 'cbmPerUnit'], [/mode|transport|modo|v[ií]a/i, 'mode'],
  [/incoterm/i, 'incoterm'], [/container|contenedor/i, 'container'], [/cape|cabo/i, 'viaCape'],
  [/order ?date|po ?date|fecha ?pedido/i, 'orderDate'], [/promis|due|comprometid|prometid/i, 'promisedDate'],
  [/qc ?date|inspection|inspecci/i, 'qcDate'], [/ship|sail|etd|departure|salida|embarque/i, 'shippedDate'],
  [/arriv|eta ?port|ata|llegada/i, 'arrivedDate'], [/clear|despach|aduana/i, 'clearedDate'], [/deliver|entreg|received|recibid/i, 'deliveredDate'],
  [/major|mayor/i, 'qcMajor'], [/minor|menor/i, 'qcMinor'],
]

export const ORDER_COLUMNS: (keyof OrderRow)[] = ['po', 'supplier', 'goods', 'hs', 'dutyPct', 'units', 'unitPrice', 'salePrice', 'kgPerUnit', 'cbmPerUnit', 'mode', 'incoterm', 'container', 'orderDate', 'promisedDate', 'qcDate', 'shippedDate', 'arrivedDate', 'clearedDate', 'deliveredDate', 'qcMajor', 'qcMinor']

/** Orders from a spreadsheet with a header row. Unknown columns are ignored. */
export function ordersFromCsv(rows: string[][]): { orders: OrderRow[]; skipped: number; columns: string[] } {
  if (rows.length < 2) return { orders: [], skipped: 0, columns: [] }
  const head = rows[0]
  const map: (keyof OrderRow | null)[] = head.map((h) => {
    const k = h.trim()
    const exact = ORDER_COLUMNS.find((c) => c.toLowerCase() === k.toLowerCase())
    if (exact) return exact
    return ORDER_HEADERS.find(([re]) => re.test(k))?.[1] ?? null
  })
  const orders: OrderRow[] = []
  let skipped = 0
  for (const r of rows.slice(1)) {
    if (r.every((c) => !c.trim())) continue
    const o: Record<string, unknown> = {}
    map.forEach((k, i) => { if (k && o[k] === undefined) o[k] = r[i] })
    const row = normaliseOrder(o)
    if (row) orders.push(row); else skipped++
  }
  return { orders, skipped, columns: map.filter((k): k is keyof OrderRow => !!k) }
}

/** "name,city,lat,lng" (+ optional id). */
export function suppliersFromCsv(rows: string[][]): SupplierDef[] {
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const hasHead = head.some((h) => /name|lat|city|nombre/.test(h))
  const col = (re: RegExp, d: number) => { const i = hasHead ? head.findIndex((h) => re.test(h)) : -1; return i >= 0 ? i : d }
  const ni = col(/name|nombre|supplier|proveedor/, 0), ci = col(/city|ciudad/, 1), la = col(/^lat/, 2), lo = col(/^(lng|lon)/, 3), ii = col(/^id$/, -1)
  return (hasHead ? rows.slice(1) : rows)
    .map((r, i) => normaliseSupplier({ id: ii >= 0 ? r[ii] : undefined, name: r[ni], city: r[ci], at: [r[la], r[lo]] }, i))
    .filter((s): s is SupplierDef => !!s)
}

/** Agent updates from a spreadsheet: po, status, date, lat, lng, note. */
export function updatesFromCsv(rows: string[][]): AgentUpdateRow[] {
  if (rows.length < 2) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (re: RegExp) => head.findIndex((h) => re.test(h))
  const pi = col(/^(po|order|pedido)/), si = col(/status|stage|estado|event/), di = col(/date|fecha|at$|time/), la = col(/^lat/), lo = col(/^(lng|lon)/), ni = col(/note|comment|nota|detail/)
  if (pi < 0 || si < 0) return []
  return rows.slice(1).map((r) => ({
    po: str(r[pi]), status: str(r[si]), at: di >= 0 && isDate(r[di]) ? r[di].trim() : undefined,
    lat: la >= 0 && r[la] !== '' ? num(r[la], NaN) : undefined, lng: lo >= 0 && r[lo] !== '' ? num(r[lo], NaN) : undefined,
    note: ni >= 0 ? str(r[ni], '', 160) || undefined : undefined,
  })).filter((u) => u.po && stageFromWord(u.status))
}

/** Agent updates from a JSON response. */
export function updatesFromJson(json: unknown, listPath = ''): AgentUpdateRow[] {
  let list: unknown = json
  for (const k of listPath ? listPath.split('.') : []) list = list && typeof list === 'object' ? (list as Record<string, unknown>)[k] : undefined
  if (!Array.isArray(list)) return []
  return list.slice(0, 500).map((o) => {
    const r = (o ?? {}) as Record<string, unknown>
    return {
      po: str(r.po ?? r.order ?? r.order_id), status: str(r.status ?? r.stage ?? r.event),
      at: isDate(r.at ?? r.date) ? String(r.at ?? r.date) : undefined,
      lat: num((r.position as Record<string, unknown> | undefined)?.lat ?? r.lat, NaN), lng: num((r.position as Record<string, unknown> | undefined)?.lng ?? r.lng ?? r.lon, NaN),
      note: str(r.note ?? r.message, '', 160) || undefined,
    }
  }).map((u) => ({ ...u, lat: Number.isFinite(u.lat) ? u.lat : undefined, lng: Number.isFinite(u.lng) ? u.lng : undefined }))
    .filter((u) => u.po && stageFromWord(u.status))
}

/** A template a buyer can fill in, with two example rows. */
export function ordersTemplateCsv(): string {
  return [
    ORDER_COLUMNS.join(','),
    'PO-0001,Ningbo Weave Textiles,Cotton towels,6302 60,12,4000,2.30,9.90,0.45,0.0015,sea,FOB,MSCU1234567,2026-09-02,2026-10-28,2026-09-20,2026-09-25,,,,2,4',
    'PO-0002,Dongguan Brightway Lighting,LED panels 60x60,9405 11,4.7,600,9.80,29,2.6,0.012,air,EXW,,2026-10-05,2026-10-25,2026-10-15,,,,,0,3',
  ].join('\n')
}
