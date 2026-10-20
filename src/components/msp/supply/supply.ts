// ─── Import tracker simulation ───────────────────────────────────────────────
// A buyer in Spain sources from three Chinese suppliers through a sourcing
// agent in Shenzhen. Each purchase order lives through production, the agent's
// QC inspection (AQL), consolidation into a container, the main leg by sea, air
// or rail, customs and the last mile — with its documents, payments and landed
// cost. Simulated and seeded: the same story on every screen. The map and the
// panels (ImportTracker.tsx) only read what this returns.
//
// Time runs fast: one second of the demo is SIM_HOURS_PER_S hours of the trip.
// Hour 0 is 1 October 2026.

export type Mode = 'sea' | 'air' | 'rail'
export type LatLng = [number, number]

export interface Place { id: string; name: string; at: LatLng; kind: 'supplier' | 'hub' | 'port' | 'airport' | 'rail' | 'warehouse' }

export const PLACES: Record<string, Place> = {
  dongguan: { id: 'dongguan', name: 'Dongguan · Brightway Lighting', at: [23.02, 113.75], kind: 'supplier' },
  yiwu: { id: 'yiwu', name: 'Yiwu · Homestyle Trading', at: [29.31, 120.08], kind: 'supplier' },
  ningbo: { id: 'ningbo', name: 'Ningbo · Weave Textiles', at: [29.87, 121.55], kind: 'supplier' },
  shenzhenHub: { id: 'shenzhenHub', name: 'Sourcing agent hub · Shenzhen (QC + consolidation)', at: [22.63, 114.03], kind: 'hub' },
  yantian: { id: 'yantian', name: 'Port of Yantian', at: [22.57, 114.27], kind: 'port' },
  hkg: { id: 'hkg', name: 'Hong Kong airport (HKG)', at: [22.31, 113.92], kind: 'airport' },
  xian: { id: 'xian', name: 'Xi’an rail terminal', at: [34.34, 108.94], kind: 'rail' },
  valencia: { id: 'valencia', name: 'Port of Valencia', at: [39.44, -0.32], kind: 'port' },
  bcnAir: { id: 'bcnAir', name: 'Barcelona airport (BCN)', at: [41.30, 2.08], kind: 'airport' },
  madridRail: { id: 'madridRail', name: 'Madrid rail terminal', at: [40.39, -3.69], kind: 'rail' },
  zaragoza: { id: 'zaragoza', name: 'Your warehouse · Zaragoza', at: [41.65, -0.88], kind: 'warehouse' },
}

const SEA: LatLng[] = [[22.57, 114.27], [20.5, 113.5], [13.5, 109.8], [6.5, 105.5], [1.25, 103.85], [5.9, 95.3], [6.9, 79.8], [12.6, 51.5], [12.6, 43.4], [20.5, 38.4], [27.9, 33.8], [29.95, 32.55], [31.3, 32.3], [33.6, 25.5], [36.6, 13.2], [38.6, 4.5], [39.44, -0.32]]
/** Booked round Africa when the Red Sea is a risk: ~10 more days. */
const CAPE: LatLng[] = [[22.57, 114.27], [20.5, 113.5], [13.5, 109.8], [6.5, 105.5], [1.25, 103.85], [-6.0, 95.0], [-20.0, 75.0], [-30.0, 45.0], [-35.2, 20.0], [-30.0, 10.0], [-10.0, 0.0], [10.0, -18.0], [28.0, -16.0], [36.0, -6.0], [36.2, -2.0], [39.44, -0.32]]
const AIR: LatLng[] = [[22.31, 113.92], [30.5, 104.0], [39.5, 75.9], [41.3, 69.3], [41.0, 49.5], [41.0, 29.0], [42.0, 13.0], [41.30, 2.08]]
const RAIL: LatLng[] = [[34.34, 108.94], [36.06, 103.8], [43.8, 87.6], [44.2, 80.4], [43.25, 76.9], [43.65, 51.2], [40.4, 49.9], [41.7, 44.8], [41.0, 29.0], [45.0, 20.0], [46.2, 6.1], [41.4, 2.17], [40.39, -3.69]]

export const LANES: Record<Mode | 'cape', LatLng[]> = { sea: SEA, cape: CAPE, air: AIR, rail: RAIL }

export const SIM_HOURS_PER_S = 6
const T0 = Date.UTC(2026, 9, 1)

export type Stage = 'production' | 'qc' | 'toOrigin' | 'mainLeg' | 'customs' | 'lastMile' | 'delivered'

export const STAGE_LABEL: Record<Stage, string> = {
  production: 'In production', qc: 'QC at agent', toOrigin: 'To port of loading', mainLeg: 'In transit',
  customs: 'Customs', lastMile: 'Last mile', delivered: 'Delivered',
}

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
}

export interface TrackEvent { h: number; level: 'info' | 'ok' | 'warn' | 'alert'; text: string; po?: string }

export interface Tracker { h: number; shipments: Shipment[]; events: TrackEvent[]; incidents: Set<string> }

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

interface Product { goods: string; hs: string; duty: number; fob: number; kg: number; cbm: number; price: number }
const SUPPLIERS: { id: string; place: string; name: string; products: Product[] }[] = [
  { id: 'brightway', place: 'dongguan', name: 'Dongguan Brightway Lighting', products: [
    { goods: 'LED panels 60×60', hs: '9405 11', duty: 4.7, fob: 9.8, kg: 2.6, cbm: 0.012, price: 29 },
    { goods: 'Track spotlights', hs: '9405 11', duty: 4.7, fob: 6.4, kg: 0.7, cbm: 0.004, price: 22 },
    { goods: 'Smart bulbs E27', hs: '8539 52', duty: 2.7, fob: 2.1, kg: 0.12, cbm: 0.0008, price: 8.9 },
  ] },
  { id: 'homestyle', place: 'yiwu', name: 'Yiwu Homestyle Trading', products: [
    { goods: 'Ceramic mugs', hs: '6912 00', duty: 9.0, fob: 0.9, kg: 0.38, cbm: 0.0012, price: 4.5 },
    { goods: 'Storage boxes', hs: '3924 90', duty: 6.5, fob: 1.6, kg: 0.5, cbm: 0.006, price: 7.9 },
    { goods: 'Kitchen textiles', hs: '6302 60', duty: 12.0, fob: 1.2, kg: 0.15, cbm: 0.0007, price: 5.5 },
  ] },
  { id: 'weave', place: 'ningbo', name: 'Ningbo Weave Textiles', products: [
    { goods: 'Cotton towels', hs: '6302 60', duty: 12.0, fob: 2.3, kg: 0.45, cbm: 0.0015, price: 9.9 },
    { goods: 'Bed linen sets', hs: '6302 31', duty: 12.0, fob: 6.9, kg: 1.4, cbm: 0.004, price: 24 },
    { goods: 'Workwear jackets', hs: '6203 33', duty: 12.0, fob: 11.5, kg: 0.9, cbm: 0.005, price: 39 },
  ] },
]
export const SUPPLIER_NAMES: Record<string, string> = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s.name]))

const INSPECTORS = ['L. Chen (agent QC)', 'W. Zhao (agent QC)', 'M. Liu (agent QC)']

function sampleFor(lot: number): { sample: number; accept: number } {
  // ISO 2859-1, general level II, AQL 2.5 (major)
  if (lot <= 500) return { sample: 50, accept: 3 }
  if (lot <= 1200) return { sample: 80, accept: 5 }
  if (lot <= 3200) return { sample: 125, accept: 7 }
  if (lot <= 10000) return { sample: 200, accept: 10 }
  return { sample: 315, accept: 14 }
}

function pathFor(mode: Mode, supplierPlace: string, cape: boolean): LatLng[] {
  const s = PLACES[supplierPlace].at, hub = PLACES.shenzhenHub.at, wh = PLACES.zaragoza.at
  if (mode === 'sea') return [s, hub, PLACES.yantian.at, ...(cape ? CAPE : SEA), wh]
  if (mode === 'air') return [s, hub, PLACES.hkg.at, ...AIR, wh]
  return [s, hub, PLACES.xian.at, ...RAIL, wh]
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

export function createTracker(seed = 21): Tracker {
  const rng = seeded(seed)
  const modes: Mode[] = ['sea', 'sea', 'air', 'rail', 'sea', 'air', 'sea', 'rail']
  const shipments: Shipment[] = modes.map((mode, i) => {
    const sup = SUPPLIERS[i % SUPPLIERS.length]
    const pr = sup.products[Math.floor(rng() * sup.products.length)]
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
      docs: [
        { name: 'Proforma invoice + 30% deposit', done: true },
        { name: 'QC report (AQL) + photos', done: false },
        { name: 'Commercial invoice', done: false }, { name: 'Packing list', done: false },
        { name: mode === 'sea' ? 'Bill of lading' : mode === 'air' ? 'Air waybill' : 'CIM consignment note', done: false },
        { name: 'Certificate of origin', done: false },
        { name: 'Customs declaration (DUA)', done: false },
        { name: 'Proof of delivery', done: false },
      ],
      route: pathFor(mode, sup.place, cape),
      promisedH: total - (cape ? 24 * 10 : 0) - (qcRework ? 52 : 0),
    }
  })
  return { h: 0, shipments, events: [{ h: 0, level: 'info', text: '8 open purchase orders · 3 suppliers · 1 sourcing agent · 3 containers' }], incidents: new Set() }
}

export function elapsed(t: Tracker, s: Shipment): number {
  const cycle = totalH(s) + 48
  const e = t.h - s.startH
  return ((e % cycle) + cycle) % cycle
}

export function stageOf(t: Tracker, s: Shipment): Stage {
  const e = elapsed(t, s)
  let delay = 0
  for (const p of s.plan) {
    if (p.stage === 'mainLeg' || p.stage === 'customs') delay = s.delayH
    if (e < p.startH + p.durH + delay) return p.stage
  }
  return 'delivered'
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
  const local = p ? Math.min(1, Math.max(0, (e - p.startH - (st === 'customs' || st === 'lastMile' ? s.delayH : 0)) / (p.durH + (st === 'mainLeg' ? s.delayH : 0)))) : 0
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

export function etaH(t: Tracker, s: Shipment): number { return Math.max(0, totalH(s) - elapsed(t, s)) }

/** The demo's calendar: hour 0 is 1 Oct 2026, each journey dated from its own start. */
export function dateLabel(t: Tracker, s: Shipment, journeyH: number): string {
  const startAbs = t.h - elapsed(t, s)
  const d = new Date(T0 + (startAbs + journeyH) * 3600_000)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface Milestone { label: string; planned: string; actual: string; done: boolean; late: boolean; note?: string }

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
  return [
    row('PO confirmed · 30% deposit paid', 0, 0),
    row('Production finished', planned(P('qc').startH), P('qc').startH),
    row(s.qc.firstPass ? 'QC passed at agent' : 'QC passed after re-inspection', planned(P('toOrigin').startH), P('toOrigin').startH, s.qc.firstPass ? undefined : `First inspection: ${s.qc.firstMajor} major (limit ${s.qc.acceptMajor})`),
    row('70% balance paid · goods released', planned(P('toOrigin').startH) + 4, P('toOrigin').startH + 4),
    row(s.mode === 'sea' ? `Sailed from Yantian${s.viaCape ? ' (via Cape)' : ''}` : s.mode === 'air' ? 'Departed HKG' : 'Left Xi’an', planned(P('mainLeg').startH), P('mainLeg').startH, s.viaCape ? 'Booked round Africa: Red Sea risk' : undefined),
    row(s.mode === 'sea' ? 'Arrived Valencia' : s.mode === 'air' ? 'Landed BCN' : 'Arrived Madrid', planned(P('customs').startH), mainEnd, s.delayH > 0 ? `+${Math.round(s.delayH / 24)} d on the way` : undefined),
    row('Customs cleared', planned(P('lastMile').startH), P('lastMile').startH + shift('lastMile')),
    row('Delivered to Zaragoza', s.promisedH, totalH(s)),
  ]
}

// ── Money ────────────────────────────────────────────────────────────────────

export interface LandedCost { lines: { label: string; eur: number; note?: string }[]; totalEur: number; perUnitEur: number; marginPct: number; vatEur: number }

function freightEur(s: Shipment, mode: Mode = s.mode, viaCape = s.viaCape): number {
  const kg = s.units * s.kgPerUnit, cbm = s.units * s.cbmPerUnit
  if (mode === 'air') return Math.max(kg, cbm * 167) * 4.8
  if (mode === 'rail') return cbm * 140 + 450
  return cbm * (viaCape ? 118 : 92) + 380
}

export function landedCost(s: Shipment): LandedCost {
  const fob = s.units * s.unitFobEur
  const exwExtra = s.incoterm === 'EXW' ? 240 : 0
  const freight = freightEur(s)
  const insurance = (fob + freight) * 0.003
  const cif = fob + freight + insurance
  const duty = cif * (s.dutyPct / 100)
  const agent = fob * 0.05
  const broker = 95
  const lastMile = s.mode === 'air' ? 180 : 420
  const lines = [
    { label: `Goods (${s.incoterm})`, eur: fob, note: `${s.units.toLocaleString('en')} × €${s.unitFobEur.toFixed(2)}` },
    ...(exwExtra ? [{ label: 'Origin handling (EXW)', eur: exwExtra }] : []),
    { label: `Freight · ${s.mode}${s.viaCape ? ' via Cape' : ''}`, eur: freight, note: s.mode === 'air' ? `${Math.round(Math.max(s.units * s.kgPerUnit, s.units * s.cbmPerUnit * 167))} kg chargeable` : `${(s.units * s.cbmPerUnit).toFixed(1)} m³` },
    { label: 'Insurance (0.3%)', eur: insurance },
    { label: `Import duty · HS ${s.hs} · ${s.dutyPct}%`, eur: duty },
    { label: 'Sourcing agent fee (5%)', eur: agent },
    { label: 'Customs broker', eur: broker },
    { label: 'Last mile to Zaragoza', eur: lastMile },
  ]
  const total = lines.reduce((n, l) => n + l.eur, 0)
  const per = total / s.units
  return { lines, totalEur: total, perUnitEur: per, marginPct: Math.round((1 - per / s.priceEur) * 100), vatEur: (cif + duty) * 0.21 }
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
  const fob = s.units * s.unitFobEur
  const balancePaid = !(stage === 'production' || stage === 'qc')
  return [
    { label: 'Deposit 30% (on PO)', eur: fob * 0.3, paid: true },
    { label: 'Balance 70% (after QC, before loading)', eur: fob * 0.7, paid: balancePaid },
    { label: 'Agent fee 5%', eur: fob * 0.05, paid: balancePaid },
    { label: 'Freight + duties', eur: landedCost(s).totalEur - fob * 1.05, paid: stage === 'lastMile' || stage === 'delivered' },
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
    const capacity = cbm > 30 ? 76 : cbm > 18 ? 67 : 33
    return { id, type: capacity === 33 ? "20' dry" : capacity === 67 ? "40' dry" : "40' high cube", vessel: VESSELS[id] ?? 'MV —', pos: list.map((s) => s.id), cbm, capacity, stage: stageOf(t, list[0]), viaCape: list.some((s) => s.viaCape) }
  })
}

export interface SupplierScore { id: string; name: string; orders: number; qcFirstPassPct: number; avgProductionD: number; onTimePct: number; openValueEur: number; grade: 'A' | 'B' | 'C' }

export function supplierScores(t: Tracker): SupplierScore[] {
  return SUPPLIERS.map((sup) => {
    const list = t.shipments.filter((s) => s.supplierId === sup.id)
    const qc = list.filter((s) => s.qc.firstPass).length / Math.max(1, list.length)
    const prod = list.reduce((n, s) => n + s.plan[0].durH, 0) / Math.max(1, list.length) / 24
    const onTime = list.filter((s) => totalH(s) <= s.promisedH + 24).length / Math.max(1, list.length)
    const open = list.filter((s) => stageOf(t, s) !== 'delivered').reduce((n, s) => n + s.units * s.unitFobEur, 0)
    const score = qc * 0.5 + onTime * 0.5
    return { id: sup.id, name: sup.name, orders: list.length, qcFirstPassPct: Math.round(qc * 100), avgProductionD: Math.round(prod * 10) / 10, onTimePct: Math.round(onTime * 100), openValueEur: open, grade: score > 0.85 ? 'A' : score > 0.6 ? 'B' : 'C' }
  })
}

// ── Clock ────────────────────────────────────────────────────────────────────

function pushEvent(t: Tracker, e: Omit<TrackEvent, 'h'>): void {
  t.events.unshift({ h: t.h, ...e })
  if (t.events.length > 60) t.events.length = 60
}

const DOC_AT: Partial<Record<Stage, string[]>> = {
  toOrigin: ['QC report (AQL) + photos', 'Commercial invoice', 'Packing list', 'Certificate of origin'],
  mainLeg: ['Bill of lading', 'Air waybill', 'CIM consignment note'],
  lastMile: ['Customs declaration (DUA)'],
  delivered: ['Proof of delivery'],
}

export function advance(t: Tracker, hours: number): void {
  const before = new Map(t.shipments.map((s) => [s.id, stageOf(t, s)]))
  t.h += hours
  for (const s of t.shipments) {
    const st = stageOf(t, s)
    if (st === before.get(s.id)) continue
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
      pushEvent(t, { level: 'ok', text: `${s.id} ${s.qc.firstPass ? 'passed QC' : 'passed re-inspection'}: ${s.qc.finalMajor} major / ${s.qc.finalMinor} minor in ${s.qc.sample} · 70% balance released`, po: s.id })
      if (s.container) pushEvent(t, { level: 'info', text: `${s.id} consolidated into ${s.container}`, po: s.id })
      continue
    }
    const where = st === 'mainLeg' ? (s.mode === 'sea' ? 'sailed from Yantian' : s.mode === 'air' ? 'departed HKG' : 'left Xi’an') : STAGE_LABEL[st].toLowerCase()
    pushEvent(t, { level: st === 'delivered' ? 'ok' : 'info', text: `${s.id} ${where}${st === 'delivered' ? ' · receipt posted to ERP · POD signed' : ''}`, po: s.id })
  }
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
    avgDoorToDoorD: Math.round(t.shipments.reduce((n, s) => n + totalH(s), 0) / t.shipments.length / 24),
  }
}

// ── Feeds ────────────────────────────────────────────────────────────────────

export function agentUpdate(t: Tracker, s: Shipment): unknown {
  const p = pointAt(s.route, progressOf(t, s)).at
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
