// ─── AGV fleet simulation ─────────────────────────────────────────────────────
// A 60 × 36 m distribution centre run by six narrow-aisle AGVs, entirely
// simulated and deterministic (seeded). Pure logic: the 3D scene (AgvTwin.tsx)
// only reads the state this produces.
//
// What happens on the floor, as in a real WMS + fleet manager:
//   · Trucks dock at D1–D4 with a load (carrier, plate, destination, cutoff)
//     made of sales orders. Every pallet of the load is a transfer order (TO)
//     to pick from a rack location and stage at that dock.
//   · Trucks from suppliers unload at D5. Every pallet that comes off is a
//     putaway TO to a free rack location.
//   · Carts have a turret head: the forks turn 90° and reach sideways into the
//     rack or onto the dock staging lane, so a cart never turns in an aisle.
//   · Traffic is one-way: road west → west cross aisle north → aisles east →
//     east cross aisle south → road. Carts reserve the stretch ahead of them
//     (their stopping distance) and keep a gap to every other reservation, and
//     merges (aisle ends, charger exits) are zones only one cart holds at a
//     time, taken all at once. That is what keeps them from touching.
//   · Each cart has its own charger; it tops up when there is nothing to do and
//     goes to charge when its battery is low.
//
// Coordinates are metres: x along the building (0 → 60), z across it (0 → 36).
// The dock doors are on the z = 0 wall; the racks fill z = 10 → 33.

export interface Vec { x: number; z: number }

// ── Layout ───────────────────────────────────────────────────────────────────

export const SIZE = { w: 60, d: 36 }
export const ROAD_Z = 6
export const XW = 9
export const XE = 51
export const CROSS_X = [XW, XE]
export const RACK_X0 = 12
export const RACK_X1 = 48
export const BAY_W = 2.7
export const BAYS = Math.floor((RACK_X1 - RACK_X0) / BAY_W)
export const LEVELS = 4
/** Rack rows (z of the row's centre). Row 11 is the back of row 12.4: stock, no aisle. */
export const RACK_ROWS = [11, 12.4, 18, 19.4, 25, 26.4, 32]
/** Aisle centre lines where carts drive (eastbound). */
export const AISLES = [15.2, 22.2, 29.2]
export const AISLE_NAMES = ['A', 'B', 'C']
/** From an aisle centre to the pallet centres of the rack rows each side. */
export const FACE = 2.8
/** Beam centre heights; a pallet sits 6 cm above. */
export const LEVEL_Y = [0.18, 1.45, 2.7, 3.95]
export const palletBottom = (level: number): number => LEVEL_Y[level] + 0.06

// Cart geometry (metres from the cart's centre, along its heading).
export const FRONT = 1.9
export const REAR = 1.2
/** The turret pivot, ahead of the centre. */
export const PIVOT = 0.9
/** Fork extension that puts the pallet centre FACE metres to the side. */
export const REACH_SIDE = FACE - 0.4
export const TRAVEL_LIFT = 0.22
/** Where carts park in a charger, and where pallets wait on the dock lanes. */
export const STUB_Z = 3.2
export const STAGE_Z = ROAD_Z - FACE

export interface DockDef { id: string; x: number; kind: 'out' | 'in' }
export const DOCKS: DockDef[] = [
  { id: 'D1', x: 12.5, kind: 'out' }, { id: 'D2', x: 17, kind: 'out' }, { id: 'D3', x: 21.5, kind: 'out' },
  { id: 'D4', x: 26, kind: 'out' }, { id: 'D5', x: 30.5, kind: 'in' },
]
export const CHARGERS = [33.5, 36, 38.5, 41, 43.5, 46]

export interface Rect { x0: number; x1: number; z0: number; z1: number }
/**
 * Zones a single cart may hold: where aisles A and B merge into the east
 * cross aisle. (Backing out of a charger reserves its whole swing instead.)
 */
export const ZONES: Rect[] = [
  { x0: 47.6, x1: 52.6, z0: AISLES[0] - 1.8, z1: AISLES[0] + 1.8 },
  { x0: 47.6, x1: 52.6, z0: AISLES[1] - 1.8, z1: AISLES[1] + 1.8 },
]

const SPEED = 1.6           // m/s empty
const SPEED_LOADED = 1.2
const SPEED_CURVE = 0.75
const SPEED_REVERSE = 0.6
const ACCEL = 0.7           // m/s²
const DECEL = 1.0
const CLEAR = 1.25          // centre-line gap between two carts' reservations
const CLEAR2 = CLEAR * CLEAR
const DRAIN_MOVE = 0.04     // %/s
const DRAIN_LOAD = 0.015
const DRAIN_LIFT = 0.03
const DRAIN_IDLE = 0.01
const CHARGE_RATE = 0.9
const LOW = 28
const CHARGED = 80
const AVAILABLE = 40

// ── Catalogue (fictional) ────────────────────────────────────────────────────

export interface Sku { code: string; name: string; cases: number; kgCase: number; color: string; wrap: string }
export const SKUS: Sku[] = [
  { code: 'WAT-150-06', name: 'Mineral water 1.5 L ×6', cases: 84, kgCase: 9.3, color: '#cfe3f2', wrap: 'film' },
  { code: 'OIL-100-12', name: 'Olive oil 1 L ×12', cases: 60, kgCase: 11.6, color: '#c7b36b', wrap: 'carton' },
  { code: 'PAS-050-24', name: 'Pasta 500 g ×24', cases: 80, kgCase: 12.4, color: '#d9b06a', wrap: 'carton' },
  { code: 'TOM-040-12', name: 'Crushed tomato 400 g ×12', cases: 90, kgCase: 5.4, color: '#c9714f', wrap: 'carton' },
  { code: 'DET-300-04', name: 'Laundry detergent 3 L ×4', cases: 48, kgCase: 12.8, color: '#8fb3d9', wrap: 'film' },
  { code: 'TIS-024-01', name: 'Toilet tissue 24 rolls', cases: 40, kgCase: 3.2, color: '#eceae4', wrap: 'film' },
  { code: 'BEV-033-24', name: 'Soft drink 33 cl ×24', cases: 96, kgCase: 8.6, color: '#c94b4b', wrap: 'film' },
  { code: 'MLK-100-06', name: 'UHT milk 1 L ×6', cases: 112, kgCase: 6.4, color: '#e9eef2', wrap: 'carton' },
  { code: 'COF-100-06', name: 'Coffee beans 1 kg ×6', cases: 70, kgCase: 6.2, color: '#8a6243', wrap: 'carton' },
  { code: 'RCE-100-10', name: 'Rice 1 kg ×10', cases: 80, kgCase: 10.2, color: '#e3d6b4', wrap: 'carton' },
]
const CUSTOMERS = ['Supermercados Costa', 'Frescamar Retail', 'Nordwind Markt', 'Mercat del Sol', 'Atlas Cash & Carry', 'Hiper Delta', 'Vía Norte Foods', 'Maison Durand']
const CITIES = ['Tarragona', 'Valencia', 'Zaragoza', 'Lyon', 'Toulouse', 'Madrid', 'Bilbao', 'Montpellier']
const CARRIERS = ['Transportes Ebro', 'Nordline Freight', 'Medi Cargo', 'Iber Express']
const SUPPLIERS = ['Aguas de Montaña', 'Aceites del Sur', 'Pastificio Valle', 'Conservas Ribera', 'Limpia Hogar SA', 'Café Altura']
const CONSONANTS = 'BCDFGHJKLMNPRSTVWXYZ'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Pallet { sscc: string; sku: Sku; cases: number; kg: number; lot: string; bbd: string; h: number }

export interface Slot {
  aisle: number; side: -1 | 1; pos: number; level: number
  x: number; rz: number; label: string
  pallet: Pallet | null
  reserved: boolean
}

export type TaskType = 'PICK' | 'PUTAWAY'
export type TaskStatus = 'queued' | 'assigned' | 'atSource' | 'loaded' | 'atDest' | 'done'
export interface Task {
  id: string            // transfer order, TO-0041231
  type: TaskType
  ref: string           // SO-26-018412 or PO-26-11873
  party: string         // customer or supplier
  city: string
  pallet: Pallet
  from: string          // A-07-3-L or D5
  to: string            // D2 or B-12-2-R
  slot: number
  dock: number
  priority: 1 | 2 | 3
  createdAt: number
  due: number
  status: TaskStatus
  agv?: string
  assignedAt?: number
  pickedAt?: number
  doneAt?: number
}

export interface Truck { plate: string; carrier: string; dest: string; ref: string; cap: number; count: number; arrivedAt: number; due: number; orders: string[] }
export type DockState = 'docked' | 'sealing' | 'departing' | 'empty' | 'arriving'
export interface Dock {
  def: DockDef
  state: DockState
  timer: number
  /** 0 = at the door, 1 = gone. */
  truckOut: number
  truck: Truck | null
  spot: Pallet | null
  spotTask: string | null
  slide: { pallet: Pallet; k: number; dir: 'in' | 'out' } | null
}

export type AgvState = 'charging' | 'idle' | 'parking' | 'toCharge' | 'toSource' | 'atSource' | 'toDest' | 'atDest'
export interface Turret { lift: number; yaw: number; reach: number }
interface Op { lift?: number; yaw?: number; reach?: number; dur: number; then?: 'attach' | 'detach'; gate?: 'dock'; label: string }
export type Wait = { kind: 'agv'; id: string } | { kind: 'obstacle' } | { kind: 'zone'; id: string } | { kind: 'dock'; dock: string }

export interface Leg { pts: Vec[]; cum: number[]; len: number; rev: boolean }

export interface Agv {
  id: string
  pos: Vec
  heading: number       // radians, 0 = +x
  v: number             // m/s
  state: AgvState
  battery: number       // 0..100
  lowCharge: boolean
  legs: Leg[]
  s: number             // metres along legs[0]
  task: Task | null
  payload: Pallet | null
  turret: Turret
  ops: Op[]
  opT: number
  opFrom: Turret
  opLabel: string
  wait: Wait | null
  waitSince: number
  claim: Vec[]
  zones: number[]
  home: number
  idleT: number
  distanceM: number
  missions: number
}

export interface SimEvent { t: number; level: 'info' | 'ok' | 'warn' | 'alert'; text: string; agv?: string; task?: string }
export interface ErpSync { t: number; task: Task; agv: string }
export interface Block { aisle: number; z: number; x0: number; x1: number; until: number }

export interface Sim {
  t: number
  rng: () => number
  agvs: Agv[]
  slots: Slot[]
  /** Slot indices whose pallet changed since the scene last looked. */
  dirty: number[]
  tasks: Task[]
  done: Task[]
  docks: Dock[]
  zones: { holder: string | null }[]
  events: SimEvent[]
  syncs: ErpSync[]
  blocked: Block | null
  blockPts: Vec[]
  nextBlockAt: number
  seq: { to: number; so: number; po: number; ld: number; sscc: number }
  trucksOut: number
  trucksLate: number
}

export const STATE_LABEL: Record<AgvState, string> = {
  charging: 'Charging', idle: 'Idle', parking: 'To charger', toCharge: 'Low battery',
  toSource: 'To pick', atSource: 'Handling', toDest: 'Delivering', atDest: 'Handling',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Small seeded PRNG (mulberry32) so the demo is the same on every screen. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) < eps
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z)
const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]
const inRect = (p: Vec, r: Rect) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1

/** GS1 SSCC: extension digit, company prefix, serial, mod-10 check digit. */
export function sscc(serial: number): string {
  const body = '3' + '8437012' + String(serial).padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(body[16 - i]) * (i % 2 === 0 ? 3 : 1)
  return body + ((10 - (sum % 10)) % 10)
}

function pushEvent(s: Sim, e: Omit<SimEvent, 't'>): void {
  s.events.unshift({ t: s.t, ...e })
  if (s.events.length > 80) s.events.length = 80
}

// ── Paths ────────────────────────────────────────────────────────────────────

/** Rounds every corner of a polyline (r m) so carts drive curves, not pivots. */
function fillet(way: Vec[], r: number): Vec[] {
  const w: Vec[] = []
  for (const p of way) { const l = w[w.length - 1]; if (!l || dist(l, p) > 0.01) w.push(p) }
  if (w.length < 3) return w
  const out: Vec[] = [w[0]]
  for (let i = 1; i < w.length - 1; i++) {
    const a = w[i - 1], b = w[i], c = w[i + 1]
    const d1 = dist(a, b), d2 = dist(b, c)
    const u1 = { x: (b.x - a.x) / d1, z: (b.z - a.z) / d1 }, u2 = { x: (c.x - b.x) / d2, z: (c.z - b.z) / d2 }
    if (Math.abs(u1.x * u2.z - u1.z * u2.x) < 1e-3) { if (u1.x * u2.x + u1.z * u2.z < 0) out.push(b); continue }
    const rr = Math.min(r, d1 / 2, d2 / 2)
    const p0 = { x: b.x - u1.x * rr, z: b.z - u1.z * rr }, p1 = { x: b.x + u2.x * rr, z: b.z + u2.z * rr }
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, m = 1 - t
      out.push({ x: m * m * p0.x + 2 * m * t * b.x + t * t * p1.x, z: m * m * p0.z + 2 * m * t * b.z + t * t * p1.z })
    }
  }
  out.push(w[w.length - 1])
  return out
}

function makeLeg(way: Vec[], rev = false): Leg {
  const pts = fillet(way, 1.4)
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]))
  return { pts, cum, len: cum[cum.length - 1], rev }
}

/** The point s metres along a leg (past the end it carries on straight). */
export function pointAt(leg: Leg, s: number): Vec {
  const { pts, cum } = leg
  if (s <= 0 || pts.length < 2) return { ...pts[0] }
  if (s >= leg.len) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1]
    const d = dist(a, b) || 1, e = s - leg.len
    return { x: b.x + ((b.x - a.x) / d) * e, z: b.z + ((b.z - a.z) / d) * e }
  }
  let lo = 0, hi = cum.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1)
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, z: pts[lo].z + (pts[hi].z - pts[lo].z) * t }
}

type Place = { kind: 'stub' | 'road' | 'aisle'; x: number; z: number }

function placeOf(a: Agv): Place {
  if (near(a.pos.z, STUB_Z, 0.4)) return { kind: 'stub', x: a.pos.x, z: STUB_Z }
  if (near(a.pos.z, ROAD_Z, 0.3)) return { kind: 'road', x: a.pos.x, z: ROAD_Z }
  return { kind: 'aisle', x: a.pos.x, z: a.pos.z }
}

/** The aisle a cart loops through when its target is behind it on the road. */
function loopAisle(s: Sim): number {
  const busy = AISLES.map((z, i) => (s.blocked?.aisle === i ? 99 : 0) + s.agvs.filter((a) => near(a.pos.z, z, 0.5)).length)
  let best = 0
  for (let i = 1; i < busy.length; i++) if (busy[i] < busy[best]) best = i
  return best
}

/** Legs over the one-way network: a reverse leg out of a charger, then forward. */
export function legsTo(s: Sim, from: Place, to: Place): Leg[] {
  const legs: Leg[] = []
  let cur: Place = from
  if (from.kind === 'stub') {
    // back out, swinging east, and stop facing west
    legs.push(makeLeg([{ x: from.x, z: from.z }, { x: from.x, z: ROAD_Z }, { x: from.x + 1.6, z: ROAD_Z }], true))
    cur = { kind: 'road', x: from.x + 1.6, z: ROAD_Z }
  }
  const way: Vec[] = [{ x: cur.x, z: cur.z }]
  const down = () => way.push({ x: XE, z: cur.z }, { x: XE, z: ROAD_Z })
  const loop = () => { const az = AISLES[loopAisle(s)]; way.push({ x: XW, z: ROAD_Z }, { x: XW, z: az }, { x: XE, z: az }, { x: XE, z: ROAD_Z }) }
  if (to.kind === 'aisle') {
    if (cur.kind === 'aisle' && near(cur.z, to.z, 0.3) && to.x >= cur.x + 0.3) way.push({ x: to.x, z: to.z })
    else {
      if (cur.kind === 'aisle') down()
      way.push({ x: XW, z: ROAD_Z }, { x: XW, z: to.z }, { x: to.x, z: to.z })
    }
  } else {
    const room = to.kind === 'stub' ? 2.4 : 0.3
    if (!(cur.kind === 'road' && to.x <= cur.x - room)) { if (cur.kind === 'aisle') down(); else loop() }
    way.push({ x: to.x, z: ROAD_Z })
    if (to.kind === 'stub') way.push({ x: to.x, z: to.z })
  }
  const fwd = makeLeg(way)
  if (fwd.len > 0.01) legs.push(fwd)
  return legs
}

// ── Inventory, orders, trucks ────────────────────────────────────────────────

function buildSlots(rng: () => number, s: Sim): Slot[] {
  const out: Slot[] = []
  for (let aisle = 0; aisle < AISLES.length; aisle++) {
    for (const side of [-1, 1] as const) {
      for (let pos = 0; pos < BAYS * 2; pos++) {
        const x = RACK_X0 + BAY_W * (Math.floor(pos / 2) + 0.5) + (pos % 2 ? 0.66 : -0.66)
        for (let level = 0; level < LEVELS; level++) {
          const label = `${AISLE_NAMES[aisle]}-${String(pos + 1).padStart(2, '0')}-${level + 1}-${side < 0 ? 'L' : 'R'}`
          out.push({ aisle, side, pos, level, x, rz: AISLES[aisle] + side * FACE, label, pallet: rng() < 0.72 ? newPallet(s, pick(rng, SKUS)) : null, reserved: false })
        }
      }
    }
  }
  return out
}

function newPallet(s: Sim, sku: Sku): Pallet {
  const rng = s.rng
  const cases = Math.max(8, Math.round(sku.cases * (0.55 + rng() * 0.45)))
  const m = 1 + Math.floor(rng() * 12)
  return {
    sscc: sscc(s.seq.sscc++), sku, cases, kg: Math.round(cases * sku.kgCase + 22),
    lot: `L26${String(200 + Math.floor(rng() * 160)).padStart(3, '0')}`, bbd: `${m > 9 ? 2027 : 2028}-${String(m).padStart(2, '0')}`,
    h: 0.75 + (cases / sku.cases) * 0.65,
  }
}

const plate = (rng: () => number) => `${1000 + Math.floor(rng() * 9000)} ${pick(rng, [...CONSONANTS])}${pick(rng, [...CONSONANTS])}${pick(rng, [...CONSONANTS])}`

function aisleBlocked(s: Sim, aisle: number): boolean { return !!s.blocked && s.blocked.aisle === aisle }

function newOutboundLoad(s: Sim, d: Dock, di: number): void {
  const rng = s.rng
  const carrier = pick(rng, CARRIERS)
  const truck: Truck = {
    plate: plate(rng), carrier, dest: pick(rng, CITIES), ref: `LD-2610-${String(s.seq.ld++).padStart(3, '0')}`,
    cap: 0, count: 0, arrivedAt: s.t, due: s.t + 420 + rng() * 240, orders: [],
  }
  d.truck = truck
  const priority: 1 | 2 = carrier === 'Iber Express' ? 1 : 2
  const pallets = 3 + Math.floor(rng() * 3)
  const nSo = pallets > 3 && rng() < 0.6 ? 2 : 1
  for (let o = 0; o < nSo; o++) {
    const so = `SO-26-${String(18400 + s.seq.so++).padStart(6, '0')}`
    truck.orders.push(so)
    const customer = pick(rng, CUSTOMERS)
    const lines = o === nSo - 1 ? pallets - Math.floor(pallets / nSo) * (nSo - 1) : Math.floor(pallets / nSo)
    for (let l = 0; l < lines; l++) {
      const free = s.slots.map((sl, i) => i).filter((i) => s.slots[i].pallet && !s.slots[i].reserved && !aisleBlocked(s, s.slots[i].aisle))
      if (!free.length) break
      const si = free[Math.floor(rng() * free.length)]
      const slot = s.slots[si]
      slot.reserved = true
      s.tasks.push({
        id: `TO-${String(41200 + s.seq.to++).padStart(7, '0')}`, type: 'PICK', ref: so, party: customer, city: truck.dest,
        pallet: slot.pallet!, from: slot.label, to: d.def.id, slot: si, dock: di, priority,
        createdAt: s.t, due: truck.due, status: 'queued',
      })
      truck.cap++
    }
  }
  pushEvent(s, { level: 'info', text: `Truck ${truck.plate} (${carrier} → ${truck.dest}) docked at ${d.def.id} · ${truck.ref} · ${truck.cap} pallets · ${truck.orders.join(', ')}` })
}

function newInboundTruck(s: Sim, d: Dock): void {
  const rng = s.rng
  const n = 4 + Math.floor(rng() * 3)
  d.truck = {
    plate: plate(rng), carrier: pick(rng, SUPPLIERS), dest: 'DC Tarragona', ref: `PO-26-${String(11870 + s.seq.po++).padStart(5, '0')}`,
    cap: n, count: n, arrivedAt: s.t, due: s.t + 600, orders: [],
  }
  pushEvent(s, { level: 'info', text: `Inbound ${d.truck.ref} · ${n} pallets from ${d.truck.carrier} at ${d.def.id} (truck ${d.truck.plate})` })
}

function createPutaway(s: Sim, d: Dock, di: number): void {
  const p = d.spot!
  const free = s.slots.map((sl, i) => i).filter((i) => !s.slots[i].pallet && !s.slots[i].reserved && !aisleBlocked(s, s.slots[i].aisle))
  if (!free.length) return
  // the WMS slots fast movers low: prefer levels 1–2
  free.sort((a, b) => s.slots[a].level - s.slots[b].level)
  const si = free[Math.floor(s.rng() * Math.min(free.length, 40))]
  const slot = s.slots[si]
  slot.reserved = true
  const t: Task = {
    id: `TO-${String(41200 + s.seq.to++).padStart(7, '0')}`, type: 'PUTAWAY', ref: d.truck?.ref ?? 'PO', party: d.truck?.carrier ?? '', city: '',
    pallet: p, from: d.def.id, to: slot.label, slot: si, dock: di, priority: 2, createdAt: s.t, due: s.t + 300, status: 'queued',
  }
  s.tasks.push(t)
  d.spotTask = t.id
}

function fillPct(s: Sim): number { return s.slots.filter((x) => x.pallet).length / s.slots.length }

function tickDock(s: Sim, d: Dock, di: number, dt: number): void {
  if (d.slide) {
    d.slide.k += dt / 2.6
    if (d.slide.k >= 1) {
      if (d.slide.dir === 'in') { if (d.truck) d.truck.count++ } else { d.spot = d.slide.pallet; d.spotTask = null }
      d.slide = null
    }
  }
  const tr = d.truck
  switch (d.state) {
    case 'docked':
      if (d.def.kind === 'out') {
        if (d.spot && !d.slide) { d.slide = { pallet: d.spot, k: 0, dir: 'in' }; d.spot = null }
        const pending = s.tasks.some((t) => t.dock === di && t.type === 'PICK')
        if (tr && !pending && !d.slide && !d.spot && tr.count >= tr.cap) { d.state = 'sealing'; d.timer = 4 }
      } else {
        if (d.spot && !d.spotTask) createPutaway(s, d, di)
        if (!d.spot && !d.slide && tr && tr.count > 0) { tr.count--; d.slide = { pallet: newPallet(s, pick(s.rng, SKUS)), k: 0, dir: 'out' } }
        if (!d.spot && !d.slide && tr && tr.count === 0) { d.state = 'sealing'; d.timer = 3 }
      }
      break
    case 'sealing':
      d.timer -= dt
      if (d.timer <= 0) {
        d.state = 'departing'; d.timer = 7
        if (tr && d.def.kind === 'out') {
          s.trucksOut++
          const late = s.t > tr.due
          if (late) s.trucksLate++
          pushEvent(s, { level: late ? 'warn' : 'ok', text: `Truck ${tr.plate} left ${d.def.id} for ${tr.dest} · ${tr.count} pallets · ${late ? 'late' : 'on time'} · ASN sent` })
        } else if (tr) pushEvent(s, { level: 'ok', text: `${tr.ref} received in full · truck ${tr.plate} released from ${d.def.id}` })
      }
      break
    case 'departing':
      d.timer -= dt
      d.truckOut = Math.min(1, 1 - d.timer / 7)
      if (d.timer <= 0) {
        d.state = 'empty'; d.truck = null; d.truckOut = 1
        const f = fillPct(s)
        d.timer = d.def.kind === 'out' ? 25 + s.rng() * 30 : f > 0.75 ? 70 : f < 0.6 ? 8 : 30
      }
      break
    case 'empty':
      d.timer -= dt
      if (d.timer <= 0) { d.state = 'arriving'; d.timer = 7 }
      break
    case 'arriving':
      d.timer -= dt
      d.truckOut = Math.max(0, d.timer / 7)
      if (d.timer <= 0) {
        d.state = 'docked'; d.truckOut = 0
        if (d.def.kind === 'out') newOutboundLoad(s, d, di); else newInboundTruck(s, d)
      }
      break
  }
}

// ── Traffic ──────────────────────────────────────────────────────────────────

function bodyPts(a: Agv): Vec[] {
  const hx = Math.cos(a.heading), hz = Math.sin(a.heading)
  const out: Vec[] = []
  for (let u = -REAR; u < FRONT; u += 0.35) out.push({ x: a.pos.x + hx * u, z: a.pos.z + hz * u })
  out.push({ x: a.pos.x + hx * FRONT, z: a.pos.z + hz * FRONT })
  return out
}

function hitAt(s: Sim, a: Agv, p: Vec): Wait | null {
  for (const o of s.agvs) {
    if (o === a || Math.abs(o.pos.x - p.x) > 7 || Math.abs(o.pos.z - p.z) > 7) continue
    for (const q of o.claim) if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < CLEAR2) return { kind: 'agv', id: o.id }
  }
  for (const q of s.blockPts) if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < CLEAR2) return { kind: 'obstacle' }
  return null
}

function zonesOf(pts: Vec[], into: Set<number>): Set<number> {
  for (const p of pts) for (let i = 0; i < ZONES.length; i++) if (inRect(p, ZONES[i])) into.add(i)
  return into
}

function holdZones(s: Sim, a: Agv, keep: Set<number>): void {
  s.zones.forEach((z, zi) => { if (z.holder === a.id && !keep.has(zi)) z.holder = null })
  a.zones = [...keep].filter((zi) => s.zones[zi].holder === a.id)
}

function setWait(s: Sim, a: Agv, w: Wait | null): void {
  if (!w) { a.wait = null; return }
  if (a.wait && a.wait.kind === w.kind) { a.wait = w; return }
  a.wait = w; a.waitSince = s.t
  if (w.kind === 'obstacle') pushEvent(s, { level: 'alert', text: `${a.id} stopped by its safety scanner: obstacle in aisle ${AISLE_NAMES[s.blocked?.aisle ?? 0]}`, agv: a.id, task: a.task?.id })
}

/**
 * Where the leading end of the cart will be d metres on: both the point on the
 * path and the end of the straight body (in a curve the body cuts the corner).
 */
function leadPts(leg: Leg, at: number, lead: number): [Vec, Vec] {
  const c = pointAt(leg, at), n = pointAt(leg, at + 0.3), m = pointAt(leg, at - 0.3)
  const l = Math.hypot(n.x - m.x, n.z - m.z) || 1
  return [pointAt(leg, at + lead), { x: c.x + ((n.x - m.x) / l) * lead, z: c.z + ((n.z - m.z) / l) * lead }]
}

/** Both ends of the cart along the rest of a reverse leg. */
function swingPts(leg: Leg, from: number): Vec[] {
  const out: Vec[] = []
  for (let d = from, last = false; !last; d += 0.3) {
    if (d >= leg.len - 1e-6) { d = leg.len; last = true } // always the end of the swing
    const c = pointAt(leg, d), n = pointAt(leg, d + 0.3), m = pointAt(leg, d - 0.3)
    const l = Math.hypot(n.x - m.x, n.z - m.z) || 1
    const tx = (n.x - m.x) / l, tz = (n.z - m.z) / l
    out.push({ x: c.x + tx * REAR, z: c.z + tz * REAR }, c, { x: c.x - tx * FRONT, z: c.z - tz * FRONT })
  }
  return out
}

/** Moves a cart along its legs. Returns true once it has arrived. */
function travel(s: Sim, a: Agv, dt: number): boolean {
  const leg = a.legs[0]
  if (!leg) return true
  const lead = leg.rev ? REAR : FRONT
  let limit = leg.len - a.s
  let wait: Wait | null = null

  // 1) carts and obstacles ahead: stop short of anything already reserved
  const scan = Math.min(limit, 7)
  for (let d = 0, last = false; !last; d += 0.25) {
    if (d >= scan - 1e-6) { d = scan; last = true }
    const [p, q] = leadPts(leg, a.s + d, lead)
    const hit = hitAt(s, a, p) ?? hitAt(s, a, q)
    // (stop a sample and a margin short, so this cart never ends up inside
    //  the other's clearance and blocks it in turn)
    if (hit) { limit = Math.max(0, d - 0.45); wait = hit; break }
  }

  // 2) zones: every zone the next stretch crosses, taken all at once, or none
  // Backing out of a charger is one manoeuvre: it starts only when its whole
  // swing (both ends of the cart) is clear, and reserves all of it, so a cart
  // on the road stops short instead of meeting it half way.
  const swing = leg.rev ? swingPts(leg, a.s) : null
  if (swing && a.s < 0.01 && swing.some((p) => hitAt(s, a, p))) {
    a.v = 0
    a.claim = bodyPts(a)
    setWait(s, a, swing.map((p) => hitAt(s, a, p)).find(Boolean) ?? null)
    return false
  }
  const win: Vec[] = []
  const winLen = Math.min(6, limit)
  for (let d = 0; d <= winLen + 1e-6; d += 0.3) win.push(pointAt(leg, a.s + lead + d))
  const body = bodyPts(a)
  const need = zonesOf(win, zonesOf(body, new Set()))
  const taken = (zi: number) => { const h = s.zones[zi].holder; return h !== null && h !== a.id }
  const acquired = ![...need].some(taken)
  if (!acquired) {
    // stop before the first zone it does not hold yet
    const mine = (zi: number) => s.zones[zi].holder === a.id
    const i = win.findIndex((p) => ZONES.some((r, zi) => !mine(zi) && inRect(p, r)))
    const d0 = Math.max(0, i) * 0.3
    const holder = [...need].map((zi) => s.zones[zi].holder).find((h) => h && h !== a.id)
    limit = Math.min(limit, Math.max(0, d0 - 0.2))
    wait = { kind: 'zone', id: holder ?? '' }
  } else for (const zi of need) s.zones[zi].holder = a.id

  // 3) speed: brake to stop exactly at the limit
  const p1 = pointAt(leg, a.s), p2 = pointAt(leg, a.s + 0.6), p3 = pointAt(leg, a.s + 2.4), p4 = pointAt(leg, a.s + 3)
  let turn = Math.atan2(p4.z - p3.z, p4.x - p3.x) - Math.atan2(p2.z - p1.z, p2.x - p1.x)
  while (turn > Math.PI) turn -= 2 * Math.PI
  while (turn < -Math.PI) turn += 2 * Math.PI
  const vmax = leg.rev ? SPEED_REVERSE : Math.abs(turn) > 0.3 ? SPEED_CURVE : a.payload ? SPEED_LOADED : SPEED
  // (a creep speed for the last centimetres, or braking never quite arrives)
  const target = limit > 0.002 ? Math.max(0.06, Math.min(vmax, Math.sqrt(2 * DECEL * Math.max(0, limit - 0.05)))) : 0
  a.v = target > a.v ? Math.min(target, a.v + ACCEL * dt) : target
  const ds = Math.min(a.v * dt, limit)

  a.s += ds
  a.distanceM += ds
  a.pos = pointAt(leg, a.s)
  const ahead = pointAt(leg, a.s + 0.3), behind = pointAt(leg, a.s - 0.3)
  a.heading = Math.atan2(ahead.z - behind.z, ahead.x - behind.x) + (leg.rev ? Math.PI : 0)
  a.battery = Math.max(0, a.battery - (ds > 0 ? DRAIN_MOVE + (a.payload ? DRAIN_LOAD : 0) : DRAIN_IDLE) * dt)
  setWait(s, a, ds < 1e-4 && limit < leg.len - a.s - 0.01 ? wait : null)

  // reservation: the body plus the stopping distance ahead
  const claim = bodyPts(a)
  const stop = (a.v * a.v) / (2 * DECEL)
  for (let d = 0.3; d <= stop + 1e-6; d += 0.3) claim.push(...leadPts(leg, a.s + d, lead))
  if (leg.rev) claim.push(...swingPts(leg, a.s))
  a.claim = claim
  const keep = zonesOf(claim, new Set())
  if (acquired) zonesOf(win.filter((_, i) => i * 0.3 >= ds), keep)
  holdZones(s, a, keep)

  if (leg.len - a.s < 0.003) { a.legs.shift(); a.s = 0; a.v = 0 }
  return a.legs.length === 0
}

function stand(s: Sim, a: Agv): void {
  a.v = 0
  a.claim = bodyPts(a)
  holdZones(s, a, zonesOf(a.claim, new Set()))
}

// ── Handling (turret: lift, turn, reach) ─────────────────────────────────────

/** +1 when the target is on the cart's local +z side. */
function sideOf(a: Agv, target: Vec): 1 | -1 {
  const lx = -Math.sin(a.heading), lz = Math.cos(a.heading)
  return (target.x - a.pos.x) * lx + (target.z - a.pos.z) * lz >= 0 ? 1 : -1
}

function handleOps(a: Agv, target: Vec, h: number, pickUp: boolean, where: string, gate = false): Op[] {
  const side = sideOf(a, target)
  const yaw = side * (Math.PI / 2)
  const up = pickUp ? h + 0.02 : h + 0.14
  const ops: Op[] = []
  if (gate) ops.push({ dur: 0, gate: 'dock', label: 'Waiting for the staging lane' })
  ops.push(
    { yaw, lift: up, dur: 1.1 + Math.abs(up - TRAVEL_LIFT) / 0.5, label: `Turret ${side > 0 ? 'right' : 'left'} · lift to ${where}` },
    { reach: REACH_SIDE, dur: 1.5, label: pickUp ? 'Forks into the pallet' : 'Reaching in with the pallet', then: pickUp ? 'attach' : undefined },
    pickUp ? { lift: h + 0.14, dur: 0.7, label: 'Lifting the pallet' } : { lift: h + 0.02, dur: 0.7, label: 'Setting the pallet down', then: 'detach' },
    { reach: 0, dur: 1.5, label: 'Retracting the forks' },
    { yaw: 0, lift: TRAVEL_LIFT, dur: 1.1 + Math.abs(up - TRAVEL_LIFT) / 0.6, label: 'Lowering to travel height' },
  )
  return ops
}

function startOps(a: Agv, ops: Op[]): void {
  a.ops = ops; a.opT = 0; a.opFrom = { ...a.turret }; a.opLabel = ops[0]?.label ?? ''
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

/** Runs the turret ops. Returns true when they are all done. */
function runOps(s: Sim, a: Agv, dt: number): boolean {
  const op = a.ops[0]
  if (!op) return true
  const t = a.task
  if (op.gate === 'dock' && t) {
    const d = s.docks[t.dock]
    if (d.spot || d.slide) { setWait(s, a, { kind: 'dock', dock: d.def.id }); return false }
    setWait(s, a, null)
  }
  a.opT += dt
  a.opLabel = op.label
  const k = op.dur > 0 ? Math.min(1, a.opT / op.dur) : 1
  const e = ease(k)
  const f = a.opFrom
  a.turret = {
    lift: f.lift + ((op.lift ?? f.lift) - f.lift) * e,
    yaw: f.yaw + ((op.yaw ?? f.yaw) - f.yaw) * e,
    reach: f.reach + ((op.reach ?? f.reach) - f.reach) * e,
  }
  if (op.lift !== undefined && op.lift !== f.lift) a.battery = Math.max(0, a.battery - DRAIN_LIFT * dt)
  if (k >= 1) {
    if (op.then && t) effect(s, a, t, op.then)
    a.ops.shift(); a.opT = 0; a.opFrom = { ...a.turret }
  }
  return a.ops.length === 0
}

function effect(s: Sim, a: Agv, t: Task, what: 'attach' | 'detach'): void {
  const slot = s.slots[t.slot]
  const dock = s.docks[t.dock]
  const atRack = (t.type === 'PICK') === (a.state === 'atSource')
  if (what === 'attach') {
    if (atRack) { a.payload = slot.pallet; slot.pallet = null; s.dirty.push(t.slot) } else { a.payload = dock.spot; dock.spot = null; dock.spotTask = null }
  } else {
    if (atRack) { slot.pallet = a.payload; slot.reserved = false; s.dirty.push(t.slot) } else dock.spot = a.payload
    a.payload = null
  }
}

// ── Dispatch and the cart's day ──────────────────────────────────────────────

function sourcePlace(s: Sim, t: Task): Place {
  const slot = s.slots[t.slot]
  return t.type === 'PICK' ? { kind: 'aisle', x: slot.x - PIVOT, z: AISLES[slot.aisle] } : { kind: 'road', x: s.docks[t.dock].def.x + PIVOT, z: ROAD_Z }
}
function destPlace(s: Sim, t: Task): Place {
  const slot = s.slots[t.slot]
  return t.type === 'PICK' ? { kind: 'road', x: s.docks[t.dock].def.x + PIVOT, z: ROAD_Z } : { kind: 'aisle', x: slot.x - PIVOT, z: AISLES[slot.aisle] }
}

function go(s: Sim, a: Agv, state: AgvState, to: Place): void {
  a.state = state
  a.legs = legsTo(s, placeOf(a), to)
  a.s = 0
}

function goHome(s: Sim, a: Agv, low: boolean): void {
  a.lowCharge = low
  go(s, a, low ? 'toCharge' : 'parking', { kind: 'stub', x: CHARGERS[a.home], z: STUB_Z })
  if (low) pushEvent(s, { level: 'warn', text: `${a.id} battery ${Math.round(a.battery)}% → charger C${a.home + 1}`, agv: a.id })
}

function dispatch(s: Sim): void {
  const free = s.agvs.filter((a) => !a.task && (a.state === 'idle' || (a.state === 'charging' && !a.lowCharge && a.battery >= AVAILABLE)))
  if (!free.length) return
  const queued = s.tasks
    .filter((t) => t.status === 'queued' && !aisleBlocked(s, s.slots[t.slot].aisle))
    .sort((x, y) => x.priority - y.priority || x.createdAt - y.createdAt)
  for (const t of queued) {
    if (!free.length) break
    const src = sourcePlace(s, t)
    free.sort((x, y) => dist(x.pos, src) - dist(y.pos, src))
    const a = free.shift()!
    t.agv = a.id; t.status = 'assigned'; t.assignedAt = s.t
    a.task = t; a.lowCharge = false
    go(s, a, 'toSource', src)
    pushEvent(s, {
      level: 'info', agv: a.id, task: t.id,
      text: t.type === 'PICK'
        ? `${t.id} · pick ${t.pallet.sku.code} at ${t.from} for ${t.ref} (${t.party}) → ${a.id}`
        : `${t.id} · put away ${t.pallet.sku.code} from ${t.from} to ${t.to} → ${a.id}`,
    })
  }
}

function complete(s: Sim, a: Agv): void {
  const t = a.task!
  t.status = 'done'; t.doneAt = s.t
  s.tasks = s.tasks.filter((x) => x !== t)
  s.done.unshift(t); if (s.done.length > 300) s.done.length = 300
  s.syncs.unshift({ t: s.t, task: t, agv: a.id }); if (s.syncs.length > 20) s.syncs.length = 20
  a.missions++
  a.task = null
  if (t.type === 'PICK') {
    const tr = s.docks[t.dock].truck
    const late = s.t > t.due
    pushEvent(s, { level: late ? 'warn' : 'ok', agv: a.id, task: t.id, text: `${t.ref} · SSCC …${t.pallet.sscc.slice(-6)} staged at ${t.to}${tr ? ` · ${tr.count + 1}/${tr.cap} for ${tr.plate}` : ''}${late ? ' · after cutoff' : ''}` })
  } else pushEvent(s, { level: 'ok', agv: a.id, task: t.id, text: `${t.pallet.sku.code} put away at ${t.to} · stock updated` })
  if (a.battery < LOW) goHome(s, a, true)
  else { a.state = 'idle'; a.idleT = 0 }
}

function tickAgv(s: Sim, a: Agv, dt: number): void {
  switch (a.state) {
    case 'charging':
      a.battery = Math.min(100, a.battery + CHARGE_RATE * dt)
      if (a.lowCharge && a.battery >= CHARGED) { a.lowCharge = false; pushEvent(s, { level: 'ok', text: `${a.id} charged to ${Math.round(a.battery)}% · back in service`, agv: a.id }) }
      stand(s, a)
      break
    case 'idle':
      a.idleT += dt
      a.battery = Math.max(0, a.battery - DRAIN_IDLE * dt)
      stand(s, a)
      if (a.idleT > 1.5) goHome(s, a, false)
      break
    case 'parking':
    case 'toCharge':
    case 'toSource':
    case 'toDest':
      if (!travel(s, a, dt)) break
      setWait(s, a, null)
      if (a.state === 'parking' || a.state === 'toCharge') { a.state = 'charging'; a.heading = -Math.PI / 2; break }
      if (a.task) {
        const t = a.task
        const slot = s.slots[t.slot]
        const d = s.docks[t.dock]
        const atRack = (t.type === 'PICK') === (a.state === 'toSource')
        a.state = a.state === 'toSource' ? 'atSource' : 'atDest'
        t.status = a.state === 'atSource' ? 'atSource' : 'atDest'
        startOps(a, atRack
          ? handleOps(a, { x: slot.x, z: slot.rz }, palletBottom(slot.level), t.type === 'PICK', `level ${slot.level + 1}`)
          : handleOps(a, { x: d.def.x, z: STAGE_Z }, 0, t.type === 'PUTAWAY', 'the floor', t.type === 'PICK'))
      }
      break
    case 'atSource':
    case 'atDest': {
      stand(s, a)
      if (!runOps(s, a, dt) || !a.task) break
      const t = a.task
      if (a.state === 'atSource') {
        t.status = 'loaded'; t.pickedAt = s.t
        pushEvent(s, { level: 'info', agv: a.id, task: t.id, text: `${a.id} has SSCC …${t.pallet.sscc.slice(-6)} (${t.pallet.cases} cases ${t.pallet.sku.code}) from ${t.from}` })
        go(s, a, 'toDest', destPlace(s, t))
      } else complete(s, a)
      break
    }
  }
}

// ── Create / step ────────────────────────────────────────────────────────────

export function createSim(seed = 2026, fleet = 6): Sim {
  const rng = seeded(seed)
  const s: Sim = {
    t: 0, rng, agvs: [], slots: [], dirty: [], tasks: [], done: [], docks: [], zones: ZONES.map(() => ({ holder: null })),
    events: [], syncs: [], blocked: null, blockPts: [], nextBlockAt: 70,
    seq: { to: 0, so: 0, po: 0, ld: 71, sscc: 4127 }, trucksOut: 0, trucksLate: 0,
  }
  s.slots = buildSlots(rng, s)
  s.agvs = Array.from({ length: Math.min(fleet, CHARGERS.length) }, (_, i) => {
    const a: Agv = {
      id: `AGV-${String(i + 1).padStart(2, '0')}`,
      pos: { x: CHARGERS[i], z: STUB_Z }, heading: -Math.PI / 2, v: 0, state: 'charging', battery: 55 + rng() * 40, lowCharge: false,
      legs: [], s: 0, task: null, payload: null, turret: { lift: TRAVEL_LIFT, yaw: 0, reach: 0 }, ops: [], opT: 0,
      opFrom: { lift: TRAVEL_LIFT, yaw: 0, reach: 0 }, opLabel: '', wait: null, waitSince: 0, claim: [], zones: [],
      home: i, idleT: 0, distanceM: 0, missions: 0,
    }
    a.claim = bodyPts(a)
    return a
  })
  s.docks = DOCKS.map((def, i) => ({
    def, state: 'arriving' as DockState, timer: 1 + i * 2.5, truckOut: 1, truck: null, spot: null, spotTask: null, slide: null,
  }))
  pushEvent(s, { level: 'info', text: `Shift started · ${s.agvs.length} AGVs online · ${Math.round(fillPct(s) * 100)}% of ${s.slots.length} locations full` })
  return s
}

function tick(s: Sim, dt: number): void {
  s.t += dt
  s.docks.forEach((d, i) => tickDock(s, d, i, dt))

  // An aisle gets blocked now and then (a dropped carton, a person walking in).
  if (s.t >= s.nextBlockAt && !s.blocked) {
    const aisle = Math.floor(s.rng() * AISLES.length)
    const z = AISLES[aisle]
    const x0 = 17 + s.rng() * 24
    const clear = s.agvs.every((a) => a.claim.every((q) => Math.hypot(q.x - (x0 + 1), q.z - z) > 4))
    if (clear) {
      s.blocked = { aisle, z, x0, x1: x0 + 2, until: s.t + 16 }
      s.blockPts = []
      for (let x = x0; x <= x0 + 2 + 1e-6; x += 0.4) for (const dz of [-0.7, 0, 0.7]) s.blockPts.push({ x, z: z + dz })
      pushEvent(s, { level: 'alert', text: `Obstacle in aisle ${AISLE_NAMES[aisle]} at ${Math.round(x0)} m · fleet manager holds new work there` })
      s.nextBlockAt = s.t + 80 + s.rng() * 50
    } else s.nextBlockAt = s.t + 3
  }
  if (s.blocked && s.t > s.blocked.until) {
    pushEvent(s, { level: 'ok', text: `Aisle ${AISLE_NAMES[s.blocked.aisle]} clear · traffic resumes` })
    s.blocked = null; s.blockPts = []
  }

  dispatch(s)
  for (const a of s.agvs) tickAgv(s, a, dt)
}

export function step(s: Sim, dt: number): void {
  for (let left = dt; left > 1e-9; left -= 0.05) tick(s, Math.min(0.05, left))
}

// ── KPIs and lookups ─────────────────────────────────────────────────────────

export interface Kpis { palletsPerHour: number; onTimePct: number; utilisationPct: number; avgBattery: number; queue: number; done: number; trucksOut: number; fillPct: number }

export function kpis(s: Sim): Kpis {
  const windowS = Math.min(900, Math.max(60, s.t))
  const recent = s.done.filter((o) => (o.doneAt ?? 0) > s.t - windowS)
  const busy = s.agvs.filter((a) => !!a.task).length
  const picks = s.done.filter((o) => o.type === 'PICK')
  const onTime = picks.length ? picks.filter((o) => (o.doneAt ?? 0) <= o.due).length / picks.length : 1
  return {
    palletsPerHour: Math.round((recent.length / windowS) * 3600),
    onTimePct: Math.round(onTime * 100),
    utilisationPct: Math.round((busy / s.agvs.length) * 100),
    avgBattery: Math.round(s.agvs.reduce((n, a) => n + a.battery, 0) / s.agvs.length),
    queue: s.tasks.filter((t) => t.status === 'queued').length,
    done: s.done.length,
    trucksOut: s.trucksOut,
    fillPct: Math.round(fillPct(s) * 100),
  }
}

export type Found = { kind: 'slot'; slot: number } | { kind: 'agv'; id: string } | { kind: 'task'; task: Task }

/** Finds a location code, an SSCC (or its last digits), a TO / SO / PO, or a cart. */
export function find(s: Sim, query: string): Found | null {
  const q = query.trim().toUpperCase().replace(/\s+/g, '')
  if (q.length < 2) return null
  const agv = s.agvs.find((a) => a.id.replace('-', '') === q.replace('-', '') || a.id.endsWith(q.padStart(2, '0')) && /^\d+$/.test(q))
  if (agv) return { kind: 'agv', id: agv.id }
  const task = [...s.tasks, ...s.done].find((t) => t.id === q || t.ref === q || t.id.endsWith(q) && q.length >= 4)
  if (task) return { kind: 'task', task }
  const si = s.slots.findIndex((x) => x.label.replace(/-/g, '') === q.replace(/-/g, ''))
  if (si >= 0) return { kind: 'slot', slot: si }
  if (/^\d{4,18}$/.test(q)) {
    const onCart = s.agvs.find((a) => a.payload?.sscc.endsWith(q))
    if (onCart) return { kind: 'agv', id: onCart.id }
    const sj = s.slots.findIndex((x) => x.pallet?.sscc.endsWith(q))
    if (sj >= 0) return { kind: 'slot', slot: sj }
  }
  const prefix = s.slots.findIndex((x) => x.label.replace(/-/g, '').startsWith(q.replace(/-/g, '')))
  return prefix >= 0 ? { kind: 'slot', slot: prefix } : null
}

/** Shift clock: the demo shift starts at 08:00. */
export function clock(t: number): string {
  const m = Math.floor(t / 60) + 8 * 60
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
}

// ── What an ERP / CRM would receive ──────────────────────────────────────────

export type ErpTarget = 'odoo' | 'salesforce' | 'webhook'

/**
 * The request a finished transfer order would turn into, in each system's own
 * API shape. A preview: the demo sends nothing anywhere.
 */
export function erpPayload(target: ErpTarget, sync: ErpSync): { method: string; url: string; body: unknown } {
  const t = sync.task
  const at = new Date(Date.UTC(2026, 9, 21, 8, 0, Math.round(t.doneAt ?? sync.t))).toISOString()
  if (target === 'odoo') {
    return {
      method: 'POST',
      url: 'https://your-company.odoo.com/jsonrpc',
      body: {
        jsonrpc: '2.0', method: 'call',
        params: {
          service: 'object', method: 'execute_kw',
          args: ['your-db', '<uid>', '<api-key>', 'stock.move.line', 'create', [{
            reference: t.id, origin: t.ref, product_code: t.pallet.sku.code, quantity: t.pallet.cases,
            package_name: t.pallet.sscc, lot_name: t.pallet.lot,
            location_code: t.type === 'PICK' ? t.from : `WH/${t.from}/STAGE`, location_dest_code: t.type === 'PICK' ? `WH/${t.to}/STAGE` : t.to,
          }]],
          kwargs: { context: { agv_id: sync.agv, done_at: at } },
        },
      },
    }
  }
  if (target === 'salesforce') {
    return {
      method: 'PATCH',
      url: `/services/data/v61.0/sobjects/WorkOrder/External_Id__c/${encodeURIComponent(t.id)}`,
      body: { Status: 'Completed', Subject: `${t.type} ${t.pallet.cases}× ${t.pallet.sku.code} · ${t.from} → ${t.to}`, Order__c: t.ref, Account__c: t.party, SSCC__c: t.pallet.sscc, AGV__c: sync.agv, Completed_At__c: at },
    }
  }
  return {
    method: 'POST',
    url: 'https://hooks.your-company.com/wms',
    body: {
      event: t.type === 'PICK' ? 'pallet.staged' : 'pallet.putaway', transfer_order: t.id, order: t.ref, party: t.party,
      sscc: t.pallet.sscc, sku: t.pallet.sku.code, cases: t.pallet.cases, weight_kg: t.pallet.kg, lot: t.pallet.lot,
      from: t.from, to: t.to, agv: sync.agv, at, on_time: (t.doneAt ?? 0) <= t.due,
    },
  }
}
