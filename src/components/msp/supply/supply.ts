// ─── Import tracker ──────────────────────────────────────────────────────────
// A buyer sources from suppliers in China through a sourcing agent. Each
// purchase order lives through production, the agent's QC inspection (AQL),
// consolidation into a container, the main leg by sea, air or rail, customs
// and the last mile — with its documents, payments and landed cost. The map
// and the panels (ImportTracker.tsx) only read what this returns.
//
// Two ways to run it, both entirely in the browser:
//   · simulate — the demo: a seeded story that loops, one second of screen
//     time is SIM_HOURS_PER_S hours. With a user's own suppliers and orders it
//     tells their story the same way.
//   · live — a user's real orders with their real dates. The clock is now,
//     nothing loops, and a stage only starts when its date says so (from the
//     orders file or from the agent's updates, applyUpdates()).
//
// configureSupply() sets who, where and how much; with no arguments it is the
// demo exactly. Hour 0 is 1 October 2026 in the demo, the first order in live.

import { lanesFor, terminals, shortName, DEFAULT_ROUTE, type RouteChoice, type Lanes, type LatLng } from './geo'

export type Mode = 'sea' | 'air' | 'rail'
export type { LatLng } from './geo'

export interface Place { id: string; name: string; at: LatLng; kind: 'supplier' | 'hub' | 'port' | 'airport' | 'rail' | 'warehouse' }

export const SIM_HOURS_PER_S = 6
const DEMO_T0 = Date.UTC(2026, 9, 1)

export type Stage = 'production' | 'qc' | 'toOrigin' | 'mainLeg' | 'customs' | 'lastMile' | 'delivered'
export const STAGES: Stage[] = ['production', 'qc', 'toOrigin', 'mainLeg', 'customs', 'lastMile', 'delivered']

export const STAGE_LABEL: Record<Stage, string> = {
  production: 'In production', qc: 'QC at agent', toOrigin: 'To port of loading', mainLeg: 'In transit',
  customs: 'Customs', lastMile: 'Last mile', delivered: 'Delivered',
}

// ── Setup ────────────────────────────────────────────────────────────────────

export interface Product { goods: string; hs: string; duty: number; fob: number; kg: number; cbm: number; price: number }
export interface SupplierDef { id: string; name: string; city: string; at: LatLng; products?: Product[] }

/** One purchase order as a buyer keeps it in a spreadsheet. Dates are YYYY-MM-DD. */
export interface OrderRow {
  po: string
  supplier: string           // supplier id or name
  goods: string
  hs: string
  dutyPct: number
  units: number
  unitPrice: number          // FOB per unit
  salePrice: number          // what one unit sells for
  kgPerUnit: number
  cbmPerUnit: number
  mode: Mode
  incoterm: 'FOB' | 'EXW'
  container?: string
  viaCape?: boolean
  orderDate?: string
  promisedDate?: string
  /** Actual dates, when they happened (live mode). */
  qcDate?: string
  shippedDate?: string
  arrivedDate?: string
  clearedDate?: string
  deliveredDate?: string
  qcMajor?: number
  qcMinor?: number
}

export interface Costs {
  depositPct: number; agentPct: number; insurancePct: number; vatPct: number
  broker: number; exwHandling: number; lastMileSea: number; lastMileAir: number
  seaPerCbm: number; seaCapePerCbm: number; seaFixed: number
  airPerKg: number; railPerCbm: number; railFixed: number
}

export interface ImportsSetup {
  company: string
  warehouse: { name: string; at: LatLng }
  hub: { name: string; at: LatLng }
  agent: string
  route: RouteChoice
  costs: Costs
  suppliers: SupplierDef[]
  /** Empty: the demo's eight generated orders from the suppliers' products. */
  orders: OrderRow[]
  live: boolean
}

export const DEFAULT_COSTS: Costs = {
  depositPct: 30, agentPct: 5, insurancePct: 0.3, vatPct: 21, broker: 95, exwHandling: 240, lastMileSea: 420, lastMileAir: 180,
  seaPerCbm: 92, seaCapePerCbm: 118, seaFixed: 380, airPerKg: 4.8, railPerCbm: 140, railFixed: 450,
}

export const DEMO_SETUP: ImportsSetup = {
  company: 'Your company',
  warehouse: { name: 'Zaragoza', at: [41.65, -0.88] },
  hub: { name: 'Sourcing agent hub · Shenzhen (QC + consolidation)', at: [22.63, 114.03] },
  agent: 'Sourcing agent',
  route: DEFAULT_ROUTE,
  costs: DEFAULT_COSTS,
  suppliers: [
    { id: 'brightway', name: 'Dongguan Brightway Lighting', city: 'Dongguan', at: [23.02, 113.75], products: [
      { goods: 'LED panels 60×60', hs: '9405 11', duty: 4.7, fob: 9.8, kg: 2.6, cbm: 0.012, price: 29 },
      { goods: 'Track spotlights', hs: '9405 11', duty: 4.7, fob: 6.4, kg: 0.7, cbm: 0.004, price: 22 },
      { goods: 'Smart bulbs E27', hs: '8539 52', duty: 2.7, fob: 2.1, kg: 0.12, cbm: 0.0008, price: 8.9 },
    ] },
    { id: 'homestyle', name: 'Yiwu Homestyle Trading', city: 'Yiwu', at: [29.31, 120.08], products: [
      { goods: 'Ceramic mugs', hs: '6912 00', duty: 9.0, fob: 0.9, kg: 0.38, cbm: 0.0012, price: 4.5 },
      { goods: 'Storage boxes', hs: '3924 90', duty: 6.5, fob: 1.6, kg: 0.5, cbm: 0.006, price: 7.9 },
      { goods: 'Kitchen textiles', hs: '6302 60', duty: 12.0, fob: 1.2, kg: 0.15, cbm: 0.0007, price: 5.5 },
    ] },
    { id: 'weave', name: 'Ningbo Weave Textiles', city: 'Ningbo', at: [29.87, 121.55], products: [
      { goods: 'Cotton towels', hs: '6302 60', duty: 12.0, fob: 2.3, kg: 0.45, cbm: 0.0015, price: 9.9 },
      { goods: 'Bed linen sets', hs: '6302 31', duty: 12.0, fob: 6.9, kg: 1.4, cbm: 0.004, price: 24 },
      { goods: 'Workwear jackets', hs: '6203 33', duty: 12.0, fob: 11.5, kg: 0.9, cbm: 0.005, price: 39 },
    ] },
  ],
  orders: [],
  live: false,
}

let SETUP: ImportsSetup = DEMO_SETUP
let TERM = terminals(DEFAULT_ROUTE)
export let LANES: Lanes = lanesFor(DEFAULT_ROUTE)
export let PLACES: Record<string, Place> = {}
export let SUPPLIER_NAMES: Record<string, string> = {}

/** Use a setup; anything missing keeps the demo's. Call before createTracker(). */
export function configureSupply(setup: Partial<ImportsSetup> = {}): ImportsSetup {
  SETUP = {
    ...DEMO_SETUP, ...setup,
    route: { ...DEFAULT_ROUTE, ...(setup.route ?? {}) },
    costs: { ...DEFAULT_COSTS, ...(setup.costs ?? {}) },
    suppliers: setup.suppliers?.length ? setup.suppliers : DEMO_SETUP.suppliers,
    orders: setup.orders ?? [],
  }
  TERM = terminals(SETUP.route)
  LANES = lanesFor(SETUP.route)
  PLACES = {}
  for (const s of SETUP.suppliers) PLACES[`sup:${s.id}`] = { id: `sup:${s.id}`, name: `${s.city} · ${s.name.replace(new RegExp(`^${s.city}\\s+`), '')}`, at: s.at, kind: 'supplier' }
  PLACES.hub = { id: 'hub', name: SETUP.hub.name, at: SETUP.hub.at, kind: 'hub' }
  PLACES.originPort = { id: 'originPort', name: TERM.originPort.name, at: TERM.originPort.at, kind: 'port' }
  PLACES.originAirport = { id: 'originAirport', name: TERM.originAirport.name, at: TERM.originAirport.at, kind: 'airport' }
  PLACES.originRail = { id: 'originRail', name: TERM.originRail.name, at: TERM.originRail.at, kind: 'rail' }
  PLACES.destPort = { id: 'destPort', name: TERM.destPort.name, at: TERM.destPort.at, kind: 'port' }
  PLACES.destAirport = { id: 'destAirport', name: TERM.destAirport.name, at: TERM.destAirport.at, kind: 'airport' }
  PLACES.destRail = { id: 'destRail', name: TERM.destRail.name, at: TERM.destRail.at, kind: 'rail' }
  PLACES.warehouse = { id: 'warehouse', name: `Your warehouse · ${SETUP.warehouse.name}`, at: SETUP.warehouse.at, kind: 'warehouse' }
  SUPPLIER_NAMES = Object.fromEntries(SETUP.suppliers.map((s) => [s.id, s.name]))
  return SETUP
}

export const currentSetup = (): ImportsSetup => SETUP

// ── Orders ───────────────────────────────────────────────────────────────────

export interface Qc {
  aql: string; lot: number; sample: number; acceptMajor: number
  firstMajor: number; firstMinor: number; firstPass: boolean
  finalMajor: number; finalMinor: number
  inspector: string
}

export interface Shipment {
  id: string
  supplierId: string
  supplier: string
  goods: string
  hs: string
  dutyPct: number
  units: number
  unitFobEur: number
  kgPerUnit: number
  cbmPerUnit: number
  mode: Mode
  viaCape: boolean
  incoterm: 'FOB' | 'EXW'
  container?: string
  plan: { stage: Stage; startH: number; durH: number }[]
  startH: number
  delayH: number
  qc: Qc
  docs: { name: string; done: boolean }[]
  route: LatLng[]
  promisedH: number          // what the supplier/agent promised at order time
  priceEur: number           // what the buyer sells one unit for
  /** Live mode: when each stage really started (tracker hours), and the row it came from. */
  actual?: Partial<Record<Stage, number>>
  row?: OrderRow
  /** Where the agent last said it was; wins over the route until the next stage. */
  pos?: LatLng
}

export interface TrackEvent { h: number; level: 'info' | 'ok' | 'warn' | 'alert'; text: string; po?: string }

export interface Tracker {
  h: number; shipments: Shipment[]; events: TrackEvent[]; incidents: Set<string>
  /** Live: real dates, no loop, no invented incidents. */
  live: boolean
  /** Epoch ms of hour 0. */
  t0: number
}

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const INSPECTORS = ['L. Chen (agent QC)', 'W. Zhao (agent QC)', 'M. Liu (agent QC)']

function sampleFor(lot: number): { sample: number; accept: number } {
  // ISO 2859-1, general level II, AQL 2.5 (major)
  if (lot <= 500) return { sample: 50, accept: 3 }
  if (lot <= 1200) return { sample: 80, accept: 5 }
  if (lot <= 3200) return { sample: 125, accept: 7 }
  if (lot <= 10000) return { sample: 200, accept: 10 }
  return { sample: 315, accept: 14 }
}

function pathFor(mode: Mode, sup: SupplierDef, cape: boolean): LatLng[] {
  const s = sup.at, hub = SETUP.hub.at, wh = SETUP.warehouse.at
  if (mode === 'sea') return [s, hub, ...(cape ? LANES.cape : LANES.sea), wh]
  if (mode === 'air') return [s, hub, ...LANES.air, wh]
  return [s, hub, ...LANES.rail, wh]
}

/** Typical hours each stage takes, used for the simulation and to estimate the stages still to come. */
function typicalH(stage: Stage, mode: Mode, cape: boolean): number {
  switch (stage) {
    case 'production': return 24 * 7
    case 'qc': return 24
    case 'toOrigin': return mode === 'rail' ? 30 : 12
    case 'mainLeg': return mode === 'sea' ? 24 * (cape ? 40 : 30) : mode === 'rail' ? 24 * 18 : 30
    case 'customs': return mode === 'air' ? 14 : 36
    case 'lastMile': return 14
    default: return 0
  }
}

function planFor(mode: Mode, rng: () => number, cape: boolean, qcRework: boolean): Shipment['plan'] {
  const steps: [Stage, number][] = [
    ['production', 72 + rng() * 96],
    ['qc', (qcRework ? 72 : 20) + rng() * 12],
    ['toOrigin', mode === 'rail' ? 30 : 12],
    ['mainLeg', mode === 'sea' ? 24 * (cape ? 40 : 30) : mode === 'rail' ? 24 * 18 : 30],
    ['customs', mode === 'air' ? 14 : 36],
    ['lastMile', 10 + rng() * 8],
  ]
  let t = 0
  return steps.map(([stage, durH]) => { const p = { stage, startH: t, durH }; t += durH; return p })
}

const planEnd = (plan: Shipment['plan']) => plan[plan.length - 1].startH + plan[plan.length - 1].durH

export function totalH(s: Shipment): number { return planEnd(s.plan) + s.delayH }

const docsFor = (mode: Mode) => [
  { name: 'Proforma invoice + deposit', done: true },
  { name: 'QC report (AQL) + photos', done: false },
  { name: 'Commercial invoice', done: false }, { name: 'Packing list', done: false },
  { name: mode === 'sea' ? 'Bill of lading' : mode === 'air' ? 'Air waybill' : 'CIM consignment note', done: false },
  { name: 'Certificate of origin', done: false },
  { name: 'Customs declaration', done: false },
  { name: 'Proof of delivery', done: false },
]

function findSupplier(key: string): SupplierDef {
  const k = key.trim().toLowerCase()
  return SETUP.suppliers.find((s) => s.id.toLowerCase() === k || s.name.toLowerCase() === k)
    ?? SETUP.suppliers.find((s) => s.name.toLowerCase().includes(k) || k.includes(s.city.toLowerCase()))
    ?? SETUP.suppliers[0]
}

const dateH = (d: string | undefined, t0: number): number | undefined => {
  if (!d) return undefined
  const ms = Date.parse(d.length <= 10 ? `${d}T12:00:00Z` : d)
  return Number.isFinite(ms) ? (ms - t0) / 3600_000 : undefined
}

export function createTracker(seed = 21): Tracker {
  if (SETUP.orders.length) return SETUP.live ? liveTracker() : simulatedFromOrders(seed)
  const rng = seeded(seed)
  const modes: Mode[] = ['sea', 'sea', 'air', 'rail', 'sea', 'air', 'sea', 'rail']
  // Demo orders are drawn from the suppliers' catalogues; suppliers without one use the demo's.
  const own = SETUP.suppliers.filter((s) => s.products?.length)
  const sups = own.length ? own : DEMO_SETUP.suppliers
  const shipments: Shipment[] = modes.map((mode, i) => {
    const sup = sups[i % sups.length]
    const pr = sup.products![Math.floor(rng() * sup.products!.length)]
    const cape = mode === 'sea' && i === 4
    const qcRework = i === 5
    const plan = planFor(mode, rng, cape, qcRework)
    const units = mode === 'air' ? 300 + Math.floor(rng() * 700) : 2500 + Math.floor(rng() * 7000)
    const { sample, accept } = sampleFor(units)
    const firstMajor = qcRework ? accept + 4 : Math.floor(rng() * (accept - 1))
    const total = planEnd(plan)
    return {
      id: `PO-2026-${1180 + i * 7}`, supplierId: sup.id, supplier: sup.name,
      goods: pr.goods, hs: pr.hs, dutyPct: pr.duty, units, unitFobEur: pr.fob, kgPerUnit: pr.kg, cbmPerUnit: pr.cbm, priceEur: pr.price,
      mode, viaCape: cape, incoterm: i % 3 === 0 ? 'EXW' : 'FOB',
      container: mode === 'sea' ? (i === 0 || i === 1 ? 'MSCU 441782-1' : i === 4 ? 'CMAU 220983-7' : 'TGHU 580315-2') : undefined,
      plan,
      startH: -total * (0.1 + 0.85 * (i / modes.length)),
      delayH: 0,
      qc: {
        aql: '2.5 / 4.0 (Level II)', lot: units, sample, acceptMajor: accept,
        firstMajor, firstMinor: 2 + Math.floor(rng() * 8), firstPass: firstMajor <= accept,
        finalMajor: qcRework ? Math.max(1, accept - 6) : firstMajor, finalMinor: 1 + Math.floor(rng() * 5),
        inspector: INSPECTORS[i % INSPECTORS.length],
      },
      docs: docsFor(mode),
      route: pathFor(mode, sup, cape),
      promisedH: total - (cape ? 24 * 10 : 0) - (qcRework ? 52 : 0),
    }
  })
  const boxes = new Set(shipments.map((s) => s.container).filter(Boolean)).size
  return {
    h: 0, shipments, live: false, t0: DEMO_T0, incidents: new Set(),
    events: [{ h: 0, level: 'info', text: `${shipments.length} open purchase orders · ${SETUP.suppliers.length} suppliers · 1 sourcing agent · ${boxes} containers` }],
  }
}

function qcFrom(row: OrderRow, rng: () => number, i: number): Qc {
  const { sample, accept } = sampleFor(row.units)
  const major = Number.isFinite(row.qcMajor) ? Math.max(0, Math.round(row.qcMajor!)) : Math.floor(rng() * Math.max(1, accept - 1))
  const pass = major <= accept
  return {
    aql: '2.5 / 4.0 (Level II)', lot: row.units, sample, acceptMajor: accept,
    firstMajor: major, firstMinor: Number.isFinite(row.qcMinor) ? Math.round(row.qcMinor!) : 1 + Math.floor(rng() * 6), firstPass: pass,
    finalMajor: pass ? major : Math.max(0, accept - 2), finalMinor: Number.isFinite(row.qcMinor) ? Math.round(row.qcMinor!) : 1 + Math.floor(rng() * 4),
    inspector: `${SETUP.agent} QC`,
  }
}

function shipmentFrom(row: OrderRow, rng: () => number, i: number): Shipment {
  const sup = findSupplier(row.supplier)
  const mode = row.mode
  const cape = mode === 'sea' && !!row.viaCape
  return {
    id: row.po, supplierId: sup.id, supplier: sup.name, goods: row.goods, hs: row.hs, dutyPct: row.dutyPct,
    units: row.units, unitFobEur: row.unitPrice, kgPerUnit: row.kgPerUnit, cbmPerUnit: row.cbmPerUnit, priceEur: row.salePrice,
    mode, viaCape: cape, incoterm: row.incoterm, container: mode === 'sea' ? row.container || undefined : undefined,
    plan: [], startH: 0, delayH: 0, qc: qcFrom(row, rng, i), docs: docsFor(mode), route: pathFor(mode, sup, cape),
    promisedH: 0, row,
  }
}

/** A user's orders, told as the demo's story: their goods, simulated dates, looping. */
function simulatedFromOrders(seed: number): Tracker {
  const rng = seeded(seed)
  const n = SETUP.orders.length
  const shipments = SETUP.orders.map((row, i) => {
    const s = shipmentFrom(row, rng, i)
    s.plan = planFor(s.mode, rng, s.viaCape, !s.qc.firstPass)
    const total = planEnd(s.plan)
    s.startH = -total * (0.1 + 0.85 * (i / n))
    const promised = dateH(row.promisedDate, 0) !== undefined && dateH(row.orderDate, 0) !== undefined ? dateH(row.promisedDate, 0)! - dateH(row.orderDate, 0)! : undefined
    s.promisedH = promised && promised > 0 ? promised : total - (s.viaCape ? 24 * 10 : 0) - (s.qc.firstPass ? 0 : 52)
    return s
  })
  return {
    h: 0, shipments, live: false, t0: DEMO_T0, incidents: new Set(),
    events: [{ h: 0, level: 'info', text: `${n} purchase orders · ${new Set(shipments.map((s) => s.supplierId)).size} suppliers · simulated dates` }],
  }
}

// ── Live: real dates ─────────────────────────────────────────────────────────

const ROW_DATE: Partial<Record<Stage, keyof OrderRow>> = { qc: 'qcDate', mainLeg: 'shippedDate', customs: 'arrivedDate', lastMile: 'clearedDate', delivered: 'deliveredDate' }

function nowH(t0: number): number { return (Date.now() - t0) / 3600_000 }

/**
 * Lay a shipment's stages on the calendar: a stage that happened starts on its
 * date; one still to come starts when the previous one typically ends — but
 * never in the past, so a stage that is overdue keeps pushing the ETA.
 */
function relayLive(s: Shipment, now: number): void {
  const a = s.actual ?? {}
  const order = s.startH
  let reached = 0
  STAGES.forEach((st, i) => { if (a[st] !== undefined && a[st]! <= now) reached = i })
  const starts: number[] = []
  let cursor = order
  STAGES.forEach((st, i) => {
    let start = st === 'production' ? order : a[st] !== undefined && a[st]! <= now ? a[st]! : cursor
    if (i > reached && start <= now) start = now + 1
    if (i > 0) start = Math.max(start, starts[i - 1])
    starts.push(start)
    cursor = start + typicalH(st, s.mode, s.viaCape)
  })
  s.plan = STAGES.slice(0, -1).map((st, i) => ({ stage: st, startH: starts[i] - order, durH: Math.max(0.01, starts[i + 1] - starts[i]) }))
  s.delayH = 0
}

function liveTracker(): Tracker {
  const t0 = Math.min(...SETUP.orders.map((r) => Date.parse(`${r.orderDate ?? ''}T12:00:00Z`)).filter(Number.isFinite), Date.now())
  const rng = seeded(7)
  const now = nowH(t0)
  const shipments = SETUP.orders.map((row, i) => {
    const s = shipmentFrom(row, rng, i)
    s.startH = dateH(row.orderDate, t0) ?? now
    s.actual = {}
    for (const [st, key] of Object.entries(ROW_DATE) as [Stage, keyof OrderRow][]) {
      const h = dateH(row[key] as string | undefined, t0)
      if (h !== undefined) s.actual[st] = h
    }
    // goods leave for the port a day after QC unless the file says otherwise
    if (s.actual.qc !== undefined && s.actual.toOrigin === undefined && s.actual.qc + 24 <= now) s.actual.toOrigin = s.actual.qc + 24
    relayLive(s, now)
    const promised = dateH(row.promisedDate, t0)
    s.promisedH = promised !== undefined ? promised - s.startH : planEnd(s.plan)
    return s
  })
  const t: Tracker = { h: now, shipments, live: true, t0, incidents: new Set(), events: [] }
  for (const s of shipments) markDocs(s, stageOf(t, s))
  t.events.push({ h: now, level: 'info', text: `${shipments.length} purchase orders from your file · real dates` })
  return t
}

function markDocs(s: Shipment, st: Stage): void {
  const upTo = STAGES.indexOf(st)
  for (const d of s.docs) for (const [stage, names] of Object.entries(DOC_AT) as [Stage, string[]][]) if (names.includes(d.name) && STAGES.indexOf(stage) <= upTo) d.done = true
}

export interface AgentUpdateRow { po: string; status: string; at?: string; lat?: number; lng?: number; note?: string }

const STATUS_WORDS: [RegExp, Stage][] = [
  [/deliver|pod|received/i, 'delivered'], [/clear|released|last ?mile/i, 'lastMile'], [/arriv|discharg|customs|landed/i, 'customs'],
  [/sail|depart|ship|loaded|on board|transit|flight|train/i, 'mainLeg'], [/port|truck|pickup|gate/i, 'toOrigin'], [/qc|inspect/i, 'qc'], [/produc|order|confirm/i, 'production'],
]
export function stageFromWord(w: string): Stage | null {
  if ((STAGES as string[]).includes(w)) return w as Stage
  for (const [re, st] of STATUS_WORDS) if (re.test(w)) return st
  return null
}

/**
 * The agent's updates (a spreadsheet, or a JSON list from their portal):
 * each one says an order reached a stage, maybe where and when. In live mode
 * the stage's date becomes real; in both modes it shows in the feed.
 */
export function applyUpdates(t: Tracker, rows: AgentUpdateRow[]): number {
  let n = 0
  for (const r of rows) {
    const s = t.shipments.find((x) => x.id.toLowerCase() === String(r.po ?? '').trim().toLowerCase())
    const st = stageFromWord(String(r.status ?? ''))
    if (!s || !st) continue
    if (t.live) {
      const at = dateH(r.at, t.t0) ?? t.h
      s.actual = { ...(s.actual ?? {}), [st]: Math.min(at, t.h) }
      relayLive(s, t.h)
      markDocs(s, stageOf(t, s))
    }
    s.pos = Number.isFinite(r.lat) && Number.isFinite(r.lng) ? [r.lat!, r.lng!] : undefined
    pushEvent(t, { level: st === 'delivered' ? 'ok' : 'info', text: `${s.id} · ${SETUP.agent}: ${r.note?.trim() || STAGE_LABEL[st].toLowerCase()}`, po: s.id })
    n++
  }
  return n
}

export function elapsed(t: Tracker, s: Shipment): number {
  const e = t.h - s.startH
  if (t.live) return e
  const cycle = totalH(s) + 48
  return ((e % cycle) + cycle) % cycle
}

export function stageOf(t: Tracker, s: Shipment): Stage {
  const e = elapsed(t, s)
  if (t.live) {
    if (s.actual?.delivered !== undefined && s.actual.delivered <= t.h) return 'delivered'
    if (e < 0) return 'production'
  }
  let delay = 0
  for (const p of s.plan) {
    if (p.stage === 'mainLeg' || p.stage === 'customs') delay = s.delayH
    if (e < p.startH + p.durH + delay) return p.stage
  }
  return t.live ? 'lastMile' : 'delivered'
}

export function progressOf(t: Tracker, s: Shipment): number {
  const e = elapsed(t, s)
  const st = stageOf(t, s)
  const p = s.plan.find((x) => x.stage === st)
  const n = s.route.length - 1
  const at = (i: number) => i / n
  if (st === 'production') return 0
  if (st === 'qc') return at(1)
  if (st === 'delivered') return 1
  const local = p ? Math.min(t.live ? 0.97 : 1, Math.max(0, (e - p.startH - (st === 'customs' || st === 'lastMile' ? s.delayH : 0)) / (p.durH + (st === 'mainLeg' ? s.delayH : 0)))) : 0
  if (st === 'toOrigin') return at(1) + (at(2) - at(1)) * local
  if (st === 'mainLeg') return at(2) + (at(n - 1) - at(2)) * local
  if (st === 'customs') return at(n - 1)
  return at(n - 1) + (1 - at(n - 1)) * local
}

export function pointAt(route: LatLng[], f: number): { at: LatLng; heading: number } {
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < route.length; i++) { const d = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); seg.push(d); total += d }
  let want = Math.max(0, Math.min(1, f)) * total
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, want / seg[i]) : 0
      const a = route[i], b = route[i + 1]
      return { at: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], heading: Math.atan2(b[0] - a[0], b[1] - a[1]) }
    }
    want -= seg[i]
  }
  return { at: route[route.length - 1], heading: 0 }
}

/** Where to draw an order: the agent's last reported position, or along its route. */
export function positionOf(t: Tracker, s: Shipment): { at: LatLng; heading: number } {
  const on = pointAt(s.route, progressOf(t, s))
  return s.pos ? { at: s.pos, heading: on.heading } : on
}

export function etaH(t: Tracker, s: Shipment): number { return Math.max(0, totalH(s) - elapsed(t, s)) }

/** A calendar date for an hour of this journey. */
export function dateLabel(t: Tracker, s: Shipment, journeyH: number): string {
  const startAbs = t.h - elapsed(t, s)
  const d = new Date(t.t0 + (startAbs + journeyH) * 3600_000)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface Milestone { label: string; planned: string; actual: string; done: boolean; late: boolean; note?: string }

const from = (m: Mode) => shortName(m === 'sea' ? TERM.originPort : m === 'air' ? TERM.originAirport : TERM.originRail)
const to = (m: Mode) => shortName(m === 'sea' ? TERM.destPort : m === 'air' ? TERM.destAirport : TERM.destRail)

export function milestones(t: Tracker, s: Shipment): Milestone[] {
  const e = elapsed(t, s)
  const shift = (st: Stage) => (st === 'customs' || st === 'lastMile' ? s.delayH : 0)
  const row = (label: string, plannedH: number, actualH: number, note?: string): Milestone => ({
    label, planned: dateLabel(t, s, plannedH), actual: dateLabel(t, s, actualH), done: e >= actualH, late: actualH > plannedH + 12, note,
  })
  const P = (st: Stage) => s.plan.find((p) => p.stage === st)!
  const promisedScale = s.promisedH / planEnd(s.plan)
  const planned = (h: number) => h * promisedScale
  const mainEnd = P('mainLeg').startH + P('mainLeg').durH + s.delayH
  const C = SETUP.costs
  const out = [
    row(`PO confirmed · ${C.depositPct}% deposit paid`, 0, 0),
    row('Production finished', planned(P('qc').startH), P('qc').startH),
    row(s.qc.firstPass ? 'QC passed at agent' : 'QC passed after re-inspection', planned(P('toOrigin').startH), P('toOrigin').startH, s.qc.firstPass ? undefined : `First inspection: ${s.qc.firstMajor} major (limit ${s.qc.acceptMajor})`),
    row(`${100 - C.depositPct}% balance paid · goods released`, planned(P('toOrigin').startH) + 4, P('toOrigin').startH + 4),
    row(s.mode === 'sea' ? `Sailed from ${from('sea')}${s.viaCape ? ' (via Cape)' : ''}` : s.mode === 'air' ? `Departed ${from('air')}` : `Left ${from('rail')}`, planned(P('mainLeg').startH), P('mainLeg').startH, s.viaCape ? 'Booked round Africa: Red Sea risk' : undefined),
    row(s.mode === 'air' ? `Landed ${to('air')}` : `Arrived ${to(s.mode)}`, planned(P('customs').startH), mainEnd, s.delayH > 0 ? `+${Math.round(s.delayH / 24)} d on the way` : undefined),
    row('Customs cleared', planned(P('lastMile').startH), P('lastMile').startH + shift('lastMile')),
    row(`Delivered to ${SETUP.warehouse.name}`, s.promisedH, totalH(s)),
  ]
  if (t.live) for (const m of out) if (!m.done) m.actual = `est. ${m.actual}`
  return out
}

// ── Money ────────────────────────────────────────────────────────────────────

export interface LandedCost { lines: { label: string; eur: number; note?: string }[]; totalEur: number; perUnitEur: number; marginPct: number; vatEur: number }

function freightEur(s: Shipment, mode: Mode = s.mode, viaCape = s.viaCape): number {
  const C = SETUP.costs
  const kg = s.units * s.kgPerUnit, cbm = s.units * s.cbmPerUnit
  if (mode === 'air') return Math.max(kg, cbm * 167) * C.airPerKg
  if (mode === 'rail') return cbm * C.railPerCbm + C.railFixed
  return cbm * (viaCape ? C.seaCapePerCbm : C.seaPerCbm) + C.seaFixed
}

export function landedCost(s: Shipment): LandedCost {
  const C = SETUP.costs
  const fob = s.units * s.unitFobEur
  const exwExtra = s.incoterm === 'EXW' ? C.exwHandling : 0
  const freight = freightEur(s)
  const insurance = (fob + freight) * (C.insurancePct / 100)
  const cif = fob + freight + insurance
  const duty = cif * (s.dutyPct / 100)
  const agent = fob * (C.agentPct / 100)
  const broker = C.broker
  const lastMile = s.mode === 'air' ? C.lastMileAir : C.lastMileSea
  const lines = [
    { label: `Goods (${s.incoterm})`, eur: fob, note: `${s.units.toLocaleString('en')} × €${s.unitFobEur.toFixed(2)}` },
    ...(exwExtra ? [{ label: 'Origin handling (EXW)', eur: exwExtra }] : []),
    { label: `Freight · ${s.mode}${s.viaCape ? ' via Cape' : ''}`, eur: freight, note: s.mode === 'air' ? `${Math.round(Math.max(s.units * s.kgPerUnit, s.units * s.cbmPerUnit * 167))} kg chargeable` : `${(s.units * s.cbmPerUnit).toFixed(1)} m³` },
    { label: `Insurance (${C.insurancePct}%)`, eur: insurance },
    { label: `Import duty · HS ${s.hs} · ${s.dutyPct}%`, eur: duty },
    { label: `Sourcing agent fee (${C.agentPct}%)`, eur: agent },
    { label: 'Customs broker', eur: broker },
    { label: `Last mile to ${SETUP.warehouse.name}`, eur: lastMile },
  ]
  const total = lines.reduce((n, l) => n + l.eur, 0)
  const per = total / s.units
  return { lines, totalEur: total, perUnitEur: per, marginPct: Math.round((1 - per / s.priceEur) * 100), vatEur: (cif + duty) * (C.vatPct / 100) }
}

/** What sending this order by air instead would cost and save (only while it has not left). */
export function expediteOption(t: Tracker, s: Shipment): { extraEur: number; daysSaved: number; perUnitDeltaEur: number } | null {
  const st = stageOf(t, s)
  if (s.mode === 'air' || !(st === 'production' || st === 'qc' || st === 'toOrigin')) return null
  const extra = freightEur(s, 'air', false) - freightEur(s)
  const main = s.plan.find((p) => p.stage === 'mainLeg')!.durH
  const daysSaved = Math.round((main - 30 + 22) / 24)
  return { extraEur: extra, daysSaved, perUnitDeltaEur: extra / s.units }
}

export function payments(s: Shipment, stage: Stage): { label: string; eur: number; paid: boolean }[] {
  const C = SETUP.costs
  const fob = s.units * s.unitFobEur
  const balancePaid = !(stage === 'production' || stage === 'qc')
  return [
    { label: `Deposit ${C.depositPct}% (on PO)`, eur: fob * (C.depositPct / 100), paid: true },
    { label: `Balance ${100 - C.depositPct}% (after QC, before loading)`, eur: fob * (1 - C.depositPct / 100), paid: balancePaid },
    { label: `Agent fee ${C.agentPct}%`, eur: fob * (C.agentPct / 100), paid: balancePaid },
    { label: 'Freight + duties', eur: landedCost(s).totalEur - fob * (1 + C.agentPct / 100), paid: stage === 'lastMile' || stage === 'delivered' },
  ]
}

// ── Containers and suppliers ─────────────────────────────────────────────────

export interface Container { id: string; type: string; vessel: string; pos: string[]; cbm: number; capacity: number; stage: Stage; viaCape: boolean }

export function containers(t: Tracker): Container[] {
  const byId = new Map<string, Shipment[]>()
  for (const s of t.shipments) if (s.container) byId.set(s.container, [...(byId.get(s.container) ?? []), s])
  const VESSELS: Record<string, string> = { 'MSCU 441782-1': 'MV Iberia Star · voy. 042W', 'CMAU 220983-7': 'MV Pearl River · voy. 117W', 'TGHU 580315-2': 'MV Levante Bridge · voy. 009W' }
  return [...byId].map(([id, list]) => {
    const cbm = list.reduce((n, s) => n + s.units * s.cbmPerUnit, 0)
    // Real boxes: 20' ≈ 33 m³, 40' ≈ 67, 40' HC ≈ 76; more than one HC books two.
    const capacity = cbm > 76 ? 152 : cbm > 30 ? 76 : cbm > 18 ? 67 : 33
    const type = capacity === 152 ? "2 × 40' high cube" : capacity === 33 ? "20' dry" : capacity === 67 ? "40' dry" : "40' high cube"
    return { id, type, vessel: VESSELS[id] ?? (t.live ? 'Vessel per your agent' : 'MV —'), pos: list.map((s) => s.id), cbm, capacity, stage: stageOf(t, list[0]), viaCape: list.some((s) => s.viaCape) }
  })
}

export interface SupplierScore { id: string; name: string; orders: number; qcFirstPassPct: number; avgProductionD: number; onTimePct: number; openValueEur: number; grade: 'A' | 'B' | 'C' }

export function supplierScores(t: Tracker): SupplierScore[] {
  return SETUP.suppliers.map((sup): SupplierScore => {
    const list = t.shipments.filter((s) => s.supplierId === sup.id)
    const qc = list.filter((s) => s.qc.firstPass).length / Math.max(1, list.length)
    const prod = list.reduce((n, s) => n + s.plan[0].durH, 0) / Math.max(1, list.length) / 24
    const onTime = list.filter((s) => totalH(s) <= s.promisedH + 24).length / Math.max(1, list.length)
    const open = list.filter((s) => stageOf(t, s) !== 'delivered').reduce((n, s) => n + s.units * s.unitFobEur, 0)
    const score = qc * 0.5 + onTime * 0.5
    return { id: sup.id, name: sup.name, orders: list.length, qcFirstPassPct: Math.round(qc * 100), avgProductionD: Math.round(prod * 10) / 10, onTimePct: Math.round(onTime * 100), openValueEur: open, grade: score > 0.85 ? 'A' : score > 0.6 ? 'B' : 'C' }
  }).filter((s) => s.orders > 0)
}

// ── Clock ────────────────────────────────────────────────────────────────────

function pushEvent(t: Tracker, e: Omit<TrackEvent, 'h'>): void {
  t.events.unshift({ h: t.h, ...e })
  if (t.events.length > 60) t.events.length = 60
}

const DOC_AT: Partial<Record<Stage, string[]>> = {
  toOrigin: ['QC report (AQL) + photos', 'Commercial invoice', 'Packing list', 'Certificate of origin'],
  mainLeg: ['Bill of lading', 'Air waybill', 'CIM consignment note'],
  lastMile: ['Customs declaration'],
  delivered: ['Proof of delivery'],
}

/** Move the clock: by `hours` when simulating; to now when live. */
export function advance(t: Tracker, hours: number): void {
  const before = new Map(t.shipments.map((s) => [s.id, stageOf(t, s)]))
  if (t.live) {
    t.h = nowH(t.t0)
    for (const s of t.shipments) relayLive(s, t.h)
  } else t.h += hours
  for (const s of t.shipments) {
    const st = stageOf(t, s)
    if (st === before.get(s.id)) continue
    s.pos = undefined
    for (const d of s.docs) if (DOC_AT[st]?.includes(d.name)) d.done = true
    if (st === 'production') {
      s.docs.forEach((d, i) => { d.done = i === 0 }); s.delayH = 0
      for (const k of [...t.incidents]) if (k.startsWith(s.id)) t.incidents.delete(k)
    }
    if (st === 'qc' && !s.qc.firstPass) {
      pushEvent(t, { level: 'alert', text: `${s.id} QC failed at the agent: ${s.qc.firstMajor} major defects in ${s.qc.sample} samples (limit ${s.qc.acceptMajor}) · supplier reworking, re-inspection booked`, po: s.id })
      continue
    }
    if (st === 'toOrigin') {
      pushEvent(t, { level: 'ok', text: `${s.id} ${s.qc.firstPass ? 'passed QC' : 'passed re-inspection'}: ${s.qc.finalMajor} major / ${s.qc.finalMinor} minor in ${s.qc.sample} · ${100 - SETUP.costs.depositPct}% balance released`, po: s.id })
      if (s.container) pushEvent(t, { level: 'info', text: `${s.id} consolidated into ${s.container}`, po: s.id })
      continue
    }
    const where = st === 'mainLeg' ? (s.mode === 'sea' ? `sailed from ${from('sea')}` : s.mode === 'air' ? `departed ${from('air')}` : `left ${from('rail')}`) : STAGE_LABEL[st].toLowerCase()
    pushEvent(t, { level: st === 'delivered' ? 'ok' : 'info', text: `${s.id} ${where}${st === 'delivered' ? ' · receipt posted to ERP · POD signed' : ''}`, po: s.id })
  }
  if (t.live) return // real orders: no invented incidents
  for (const s of t.shipments) {
    const st = stageOf(t, s), f = progressOf(t, s)
    const key = (k: string) => `${s.id}:${k}`
    if (s.viaCape && st === 'mainLeg' && !t.incidents.has(key('cape'))) {
      t.incidents.add(key('cape'))
      pushEvent(t, { level: 'warn', text: `${s.id} sailing via the Cape of Good Hope (Red Sea risk) · ETA +10 d vs Suez · buyer informed at booking`, po: s.id })
    }
    if (s.mode === 'sea' && !s.viaCape && st === 'mainLeg' && f > 0.32 && !t.incidents.has(key('sin'))) {
      t.incidents.add(key('sin')); s.delayH += 48
      pushEvent(t, { level: 'warn', text: `${s.id} port congestion at Singapore · ETA +2 d · sales told before customers ask`, po: s.id })
    }
    if (st === 'customs' && s.incoterm === 'EXW' && !t.incidents.has(key('dua'))) {
      t.incidents.add(key('dua')); s.delayH += 24
      pushEvent(t, { level: 'alert', text: `${s.id} held at customs: HS ${s.hs} classification query · broker sent the datasheet`, po: s.id })
    }
  }
}

export interface TrackKpis { inTransit: number; atRisk: number; valueAtSeaEur: number; avgDoorToDoorD: number }

export function trackKpis(t: Tracker): TrackKpis {
  const active = t.shipments.filter((s) => { const st = stageOf(t, s); return st !== 'delivered' && st !== 'production' })
  return {
    inTransit: active.length,
    atRisk: t.shipments.filter((s) => totalH(s) > s.promisedH + 24 && stageOf(t, s) !== 'delivered').length,
    valueAtSeaEur: t.shipments.filter((s) => s.mode === 'sea' && stageOf(t, s) === 'mainLeg').reduce((n, s) => n + s.units * s.unitFobEur, 0),
    avgDoorToDoorD: Math.round(t.shipments.reduce((n, s) => n + totalH(s), 0) / Math.max(1, t.shipments.length) / 24),
  }
}

// ── Feeds ────────────────────────────────────────────────────────────────────

export function agentUpdate(t: Tracker, s: Shipment): unknown {
  const p = positionOf(t, s).at
  return {
    order: s.id, supplier: s.supplier, status: stageOf(t, s), mode: s.mode, container: s.container ?? null,
    position: { lat: Number(p[0].toFixed(3)), lng: Number(p[1].toFixed(3)) },
    qc: { aql: s.qc.aql, sample: s.qc.sample, major: s.qc.finalMajor, minor: s.qc.finalMinor, result: s.qc.firstPass ? 'pass' : 'pass_after_reinspection' },
    eta: `+${Math.round(etaH(t, s) / 24)} d`, delay_hours: s.delayH,
    documents: s.docs.filter((d) => d.done).map((d) => d.name),
  }
}

export function erpReceipt(s: Shipment): unknown {
  const lc = landedCost(s)
  return {
    jsonrpc: '2.0', method: 'call',
    params: {
      service: 'object', method: 'execute_kw',
      args: ['your-db', '<uid>', '<api-key>', 'stock.picking', 'button_validate', [[`receipt ${s.id}`]]],
      kwargs: { context: { landed_cost_per_unit_eur: Number(lc.perUnitEur.toFixed(3)), hs_code: s.hs, container: s.container ?? null } },
    },
  }
}

// ── What needs the buyer now ─────────────────────────────────────────────────

export interface Attention { po: string; level: 'alert' | 'warn'; title: string; detail: string; impact: string }

/**
 * The few orders a buyer should look at right now, with why in plain words
 * and what it costs them in days. Alerts first. This is where the eye goes.
 */
export function attention(t: Tracker): Attention[] {
  const out: Attention[] = []
  for (const s of t.shipments) {
    const st = stageOf(t, s)
    if (st === 'delivered') continue
    const lateD = Math.round((totalH(s) - s.promisedH) / 24)
    if (!s.qc.firstPass && (st === 'qc' || st === 'production')) {
      out.push({ po: s.id, level: 'alert', title: 'Failed quality check', detail: `${s.qc.firstMajor} major defects (limit ${s.qc.acceptMajor}) · supplier reworking`, impact: '+2 d' })
    } else if (!t.live && st === 'customs' && s.incoterm === 'EXW' && s.delayH > 0) {
      out.push({ po: s.id, level: 'alert', title: 'Held at customs', detail: `HS ${s.hs} query · broker on it`, impact: '+1 d' })
    } else if (s.viaCape && (st === 'mainLeg' || st === 'toOrigin')) {
      out.push({ po: s.id, level: 'warn', title: 'Sailing round Africa', detail: 'Red Sea risk · booked via the Cape', impact: '+10 d' })
    } else if (!t.live && s.delayH > 0 && st === 'mainLeg') {
      out.push({ po: s.id, level: 'warn', title: 'Port congestion', detail: 'Singapore · the ship waited', impact: `+${Math.round(s.delayH / 24)} d` })
    } else if (lateD >= 1) {
      out.push({ po: s.id, level: lateD >= 7 ? 'alert' : 'warn', title: 'Running late', detail: `${STAGE_LABEL[st]} · later than promised`, impact: `+${lateD} d` })
    }
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'alert' ? -1 : 1)).slice(0, 4)
}

/** One sentence: where this order is and what it means for the buyer. */
export function summary(t: Tracker, s: Shipment): string {
  const st = stageOf(t, s)
  const lc = landedCost(s)
  const lateD = Math.round((totalH(s) - s.promisedH) / 24)
  const when = st === 'delivered' ? 'Delivered' : `Arrives in ${Math.max(1, Math.round(etaH(t, s) / 24))} days`
  const promise = lateD >= 1 ? `, ${lateD} d later than promised` : ', on time'
  return `${when}${promise}. Costs €${lc.perUnitEur.toFixed(2)} a unit landed: ${lc.marginPct}% margin.`
}

// The demo, until someone configures their own.
configureSupply()
