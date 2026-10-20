// ─── Import tracker simulation ───────────────────────────────────────────────
// Purchase orders bought from suppliers in China, consolidated by a sourcing
// agent in Shenzhen, shipped by sea, air or rail to Spain and trucked to the
// buyer's warehouse. Simulated and seeded: the same story on every screen. The
// map (ImportTracker.tsx) only draws what this returns.
//
// Time runs fast: one second of the demo is SIM_HOURS_PER_S hours of the trip.

export type Mode = 'sea' | 'air' | 'rail'
export type LatLng = [number, number]

export interface Place { id: string; name: string; at: LatLng; kind: 'supplier' | 'hub' | 'port' | 'airport' | 'rail' | 'warehouse' }

export const PLACES: Record<string, Place> = {
  dongguan: { id: 'dongguan', name: 'Dongguan · lighting supplier', at: [23.02, 113.75], kind: 'supplier' },
  yiwu: { id: 'yiwu', name: 'Yiwu · homeware supplier', at: [29.31, 120.08], kind: 'supplier' },
  ningbo: { id: 'ningbo', name: 'Ningbo · textile supplier', at: [29.87, 121.55], kind: 'supplier' },
  shenzhenHub: { id: 'shenzhenHub', name: 'Sourcing agent hub · Shenzhen (QC + consolidation)', at: [22.63, 114.03], kind: 'hub' },
  yantian: { id: 'yantian', name: 'Port of Yantian', at: [22.57, 114.27], kind: 'port' },
  hkg: { id: 'hkg', name: 'Hong Kong airport (HKG)', at: [22.31, 113.92], kind: 'airport' },
  xian: { id: 'xian', name: 'Xi’an rail terminal', at: [34.34, 108.94], kind: 'rail' },
  valencia: { id: 'valencia', name: 'Port of Valencia', at: [39.44, -0.32], kind: 'port' },
  bcnAir: { id: 'bcnAir', name: 'Barcelona airport (BCN)', at: [41.30, 2.08], kind: 'airport' },
  madridRail: { id: 'madridRail', name: 'Madrid rail terminal', at: [40.39, -3.69], kind: 'rail' },
  zaragoza: { id: 'zaragoza', name: 'Your warehouse · Zaragoza', at: [41.65, -0.88], kind: 'warehouse' },
}

// Lanes as waypoint chains (rough but plausible tracks).
const SEA: LatLng[] = [[22.57, 114.27], [20.5, 113.5], [13.5, 109.8], [6.5, 105.5], [1.25, 103.85], [5.9, 95.3], [6.9, 79.8], [12.6, 51.5], [12.6, 43.4], [20.5, 38.4], [27.9, 33.8], [29.95, 32.55], [31.3, 32.3], [33.6, 25.5], [36.6, 13.2], [38.6, 4.5], [39.44, -0.32]]
const AIR: LatLng[] = [[22.31, 113.92], [30.5, 104.0], [39.5, 75.9], [41.3, 69.3], [41.0, 49.5], [41.0, 29.0], [42.0, 13.0], [41.30, 2.08]]
const RAIL: LatLng[] = [[34.34, 108.94], [36.06, 103.8], [43.8, 87.6], [44.2, 80.4], [43.25, 76.9], [43.65, 51.2], [40.4, 49.9], [41.7, 44.8], [41.0, 29.0], [45.0, 20.0], [46.2, 6.1], [41.4, 2.17], [40.39, -3.69]]

export const LANES: Record<Mode, LatLng[]> = { sea: SEA, air: AIR, rail: RAIL }

export const SIM_HOURS_PER_S = 6

export type Stage = 'production' | 'qc' | 'toOrigin' | 'mainLeg' | 'customs' | 'lastMile' | 'delivered'

export const STAGE_LABEL: Record<Stage, string> = {
  production: 'In production', qc: 'QC at agent', toOrigin: 'To port of loading', mainLeg: 'In transit',
  customs: 'Customs', lastMile: 'Last mile', delivered: 'Delivered',
}

export interface Shipment {
  id: string            // PO number
  supplier: string
  goods: string
  units: number
  valueEur: number
  mode: Mode
  incoterm: 'FOB' | 'EXW' | 'DAP'
  /** Hours of the trip at which each stage starts (cumulative), plus the end. */
  plan: { stage: Stage; startH: number; durH: number }[]
  /** The hour this shipment started (sim clock). */
  startH: number
  delayH: number        // added by incidents
  docs: { name: string; done: boolean }[]
  route: LatLng[]       // full path, supplier → warehouse
}

export interface TrackEvent { h: number; level: 'info' | 'ok' | 'warn' | 'alert'; text: string; po?: string }

export interface Tracker {
  h: number                 // sim hours
  shipments: Shipment[]
  events: TrackEvent[]
  incidents: Set<string>    // ids of incidents already fired
}

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const SUPPLIERS: { place: string; name: string; goods: string[] }[] = [
  { place: 'dongguan', name: 'Dongguan Brightway Lighting', goods: ['LED panels 60×60', 'Track spotlights', 'Smart bulbs E27'] },
  { place: 'yiwu', name: 'Yiwu Homestyle Trading', goods: ['Ceramic mugs', 'Storage boxes', 'Kitchen textiles'] },
  { place: 'ningbo', name: 'Ningbo Weave Textiles', goods: ['Cotton towels', 'Bed linen sets', 'Workwear jackets'] },
]

function pathFor(mode: Mode, supplier: string): LatLng[] {
  const s = PLACES[supplier].at
  const hub = PLACES.shenzhenHub.at
  const wh = PLACES.zaragoza.at
  if (mode === 'sea') return [s, hub, PLACES.yantian.at, ...SEA, wh]
  if (mode === 'air') return [s, hub, PLACES.hkg.at, ...AIR, wh]
  return [s, hub, PLACES.xian.at, ...RAIL, wh]
}

function planFor(mode: Mode, rng: () => number): Shipment['plan'] {
  const prod = 48 + rng() * 72
  const qc = 18 + rng() * 18
  const toOrigin = mode === 'rail' ? 30 : 10
  const main = mode === 'sea' ? 24 * 30 : mode === 'rail' ? 24 * 18 : 30
  const customs = mode === 'air' ? 12 : 36
  const last = 10 + rng() * 8
  const steps: [Stage, number][] = [['production', prod], ['qc', qc], ['toOrigin', toOrigin], ['mainLeg', main], ['customs', customs], ['lastMile', last]]
  let t = 0
  return steps.map(([stage, durH]) => { const p = { stage, startH: t, durH }; t += durH; return p })
}

export function totalH(s: Shipment): number {
  const last = s.plan[s.plan.length - 1]
  return last.startH + last.durH + s.delayH
}

export function createTracker(seed = 21): Tracker {
  const rng = seeded(seed)
  const modes: Mode[] = ['sea', 'sea', 'air', 'rail', 'sea', 'air', 'sea', 'rail']
  const shipments: Shipment[] = modes.map((mode, i) => {
    const sup = SUPPLIERS[i % SUPPLIERS.length]
    const plan = planFor(mode, rng)
    const goods = sup.goods[Math.floor(rng() * sup.goods.length)]
    const units = mode === 'air' ? 200 + Math.floor(rng() * 600) : 2000 + Math.floor(rng() * 9000)
    const total = plan[plan.length - 1].startH + plan[plan.length - 1].durH
    return {
      id: `PO-2026-${1180 + i * 7}`, supplier: sup.name, goods, units,
      valueEur: Math.round(units * (mode === 'air' ? 18 : 4.5) * (0.8 + rng() * 0.6)),
      mode, incoterm: i % 3 === 0 ? 'EXW' : 'FOB', plan,
      // spread them along their journeys so the map is busy from the start
      startH: -total * (0.1 + 0.85 * (i / modes.length)),
      delayH: 0,
      docs: [
        { name: 'Commercial invoice', done: false }, { name: 'Packing list', done: false },
        { name: 'QC report + photos', done: false }, { name: mode === 'sea' ? 'Bill of lading' : mode === 'air' ? 'Air waybill' : 'CIM consignment note', done: false },
        { name: 'Customs declaration (DUA)', done: false },
      ],
      route: pathFor(mode, sup.place),
    }
  })
  return { h: 0, shipments, events: [{ h: 0, level: 'info', text: '8 open purchase orders · 3 suppliers · 1 sourcing agent' }], incidents: new Set() }
}

export function elapsed(t: Tracker, s: Shipment): number {
  // loop each shipment so the demo never runs dry
  const total = totalH(s) + 48
  const e = t.h - s.startH
  return ((e % total) + total) % total
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

/** Fraction 0..1 along the route for the map marker. */
export function progressOf(t: Tracker, s: Shipment): number {
  const e = elapsed(t, s)
  const st = stageOf(t, s)
  const p = s.plan.find((x) => x.stage === st)
  const n = s.route.length - 1
  // route indices: 0 supplier, 1 hub, 2 origin port/airport/rail, 3..n-2 lane, n warehouse
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

/** Point at fraction f of a polyline (by segment length in degrees — fine for a demo). */
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

export function etaH(t: Tracker, s: Shipment): number {
  return Math.max(0, totalH(s) - elapsed(t, s))
}

function pushEvent(t: Tracker, e: Omit<TrackEvent, 'h'>): void {
  t.events.unshift({ h: t.h, ...e })
  if (t.events.length > 50) t.events.length = 50
}

/** Advance the clock by `hours`; stage changes and incidents become events. */
export function advance(t: Tracker, hours: number): void {
  const before = new Map(t.shipments.map((s) => [s.id, stageOf(t, s)]))
  t.h += hours
  for (const s of t.shipments) {
    const st = stageOf(t, s)
    const was = before.get(s.id)
    if (st === was) continue
    // documents complete as the stages pass
    if (st === 'toOrigin') { s.docs[0].done = true; s.docs[1].done = true; s.docs[2].done = true }
    if (st === 'mainLeg') s.docs[3].done = true
    if (st === 'lastMile') s.docs[4].done = true
    if (st === 'production') { s.docs.forEach((d) => { d.done = false }); s.delayH = 0; t.incidents.forEach((k) => { if (k.startsWith(s.id)) t.incidents.delete(k) }) }
    const where = st === 'mainLeg' ? `${s.mode === 'sea' ? 'sailed from Yantian' : s.mode === 'air' ? 'departed HKG' : 'left Xi’an'}` : STAGE_LABEL[st].toLowerCase()
    pushEvent(t, { level: st === 'delivered' ? 'ok' : 'info', text: `${s.id} ${where}${st === 'delivered' ? ' · receipt posted to ERP' : ''}`, po: s.id })
    if (st === 'toOrigin') pushEvent(t, { level: 'ok', text: `${s.id} passed QC at the agent · ${s.units.toLocaleString('en')} units, photos attached`, po: s.id })
  }
  // incidents, once per journey
  for (const s of t.shipments) {
    const st = stageOf(t, s), f = progressOf(t, s)
    const key = (k: string) => `${s.id}:${k}`
    if (s.mode === 'sea' && st === 'mainLeg' && f > 0.32 && !t.incidents.has(key('sin'))) {
      t.incidents.add(key('sin')); s.delayH += 48
      pushEvent(t, { level: 'warn', text: `${s.id} congestion at Singapore · ETA +2 days · buyer notified`, po: s.id })
    }
    if (st === 'customs' && s.incoterm === 'EXW' && !t.incidents.has(key('dua'))) {
      t.incidents.add(key('dua')); s.delayH += 24
      pushEvent(t, { level: 'alert', text: `${s.id} held at customs: HS code query · broker on it`, po: s.id })
    }
  }
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface TrackKpis { inTransit: number; atRisk: number; valueAtSeaEur: number; avgDoorToDoorD: number }

export function trackKpis(t: Tracker): TrackKpis {
  const active = t.shipments.filter((s) => { const st = stageOf(t, s); return st !== 'delivered' && st !== 'production' })
  return {
    inTransit: active.length,
    atRisk: t.shipments.filter((s) => s.delayH > 0 && stageOf(t, s) !== 'delivered').length,
    valueAtSeaEur: t.shipments.filter((s) => s.mode === 'sea' && stageOf(t, s) === 'mainLeg').reduce((n, s) => n + s.valueEur, 0),
    avgDoorToDoorD: Math.round(t.shipments.reduce((n, s) => n + totalH(s), 0) / t.shipments.length / 24),
  }
}

// ── What flows in and out ────────────────────────────────────────────────────

/** A status update as a sourcing agent or forwarder would push it (illustrative shape). */
export function agentUpdate(t: Tracker, s: Shipment): unknown {
  const p = pointAt(s.route, progressOf(t, s)).at
  return {
    order: s.id, supplier: s.supplier, status: stageOf(t, s), mode: s.mode,
    position: { lat: Number(p[0].toFixed(3)), lng: Number(p[1].toFixed(3)) },
    eta: `+${Math.round(etaH(t, s) / 24)} d`, delay_hours: s.delayH,
    documents: s.docs.filter((d) => d.done).map((d) => d.name),
  }
}

/** The receipt the buyer's ERP would get on delivery (Odoo shape). */
export function erpReceipt(s: Shipment): unknown {
  return {
    jsonrpc: '2.0', method: 'call',
    params: { service: 'object', method: 'execute_kw', args: ['your-db', '<uid>', '<api-key>', 'stock.picking', 'button_validate', [[`receipt for ${s.id}`]]] },
  }
}
