// ─── AGV fleet simulation ─────────────────────────────────────────────────────
// A warehouse of 60 × 36 m run by six autonomous carts, entirely simulated and
// deterministic (seeded): orders arrive, carts drive to a rack, lift a pallet,
// take it to a dock, and charge when their battery runs low. An aisle gets
// blocked now and then, and the carts behind wait. Pure logic: the 3D scene
// (AgvTwin.tsx) only reads the state this produces.
//
// Coordinates are metres: x along the building (0 → 60), z across it (0 → 36).
// The docks are on the z = 0 side; the racks fill z = 10 → 34.

export type AgvState = 'idle' | 'toPick' | 'picking' | 'toDock' | 'dropping' | 'toCharge' | 'charging' | 'blocked'

export interface Vec { x: number; z: number }

export interface Order {
  id: string            // e.g. SO/2026/0412
  customer: string
  sku: string
  qty: number
  pick: string          // rack location label, e.g. B-07-3
  pickAt: Vec           // where the cart stops in the aisle
  rackZ: number         // the rack face it lifts from
  level: number         // 0..3
  dock: number          // 0..3
  createdAt: number
  due: number           // seconds of sim time
  agv?: string
  pickedAt?: number
  doneAt?: number
}

export interface Agv {
  id: string
  pos: Vec
  heading: number       // radians, 0 = +x
  state: AgvState
  resumeState: AgvState // what it goes back to after being blocked
  battery: number       // 0..100
  route: Vec[]          // remaining waypoints
  order?: Order
  loaded: boolean
  lift: number          // 0..1 fork height (pallet lift animation)
  timer: number         // seconds left in a timed state
  distanceM: number
  missions: number
  charger: number
}

export interface SimEvent { t: number; level: 'info' | 'ok' | 'warn' | 'alert'; text: string; agv?: string; order?: string }

export interface ErpSync { t: number; order: Order; agv: string }

export interface Sim {
  t: number
  agvs: Agv[]
  queue: Order[]
  done: Order[]
  events: SimEvent[]
  syncs: ErpSync[]
  blocked: { z: number; x0: number; x1: number; until: number } | null
  rng: () => number
  nextOrder: number
  nextOrderAt: number
  nextBlockAt: number
}

// ── Layout ───────────────────────────────────────────────────────────────────

export const SIZE = { w: 60, d: 36 }
export const ROAD_Z = 6
export const CROSS_X = [9, 51]
export const RACK_X0 = 12
export const RACK_X1 = 48
export const BAY_W = 2.7
export const LEVELS = 4
/** Rack rows (z of the row's centre). Back-to-back pairs with an aisle between pairs. */
export const RACK_ROWS = [11, 12.4, 18, 19.4, 25, 26.4, 32]
/** Aisle centre lines where carts drive. */
export const AISLES = [15.2, 22.2, 29.2]
export const DOCKS: Vec[] = [8, 18, 28, 38].map((x) => ({ x, z: 2.2 }))
export const CHARGERS: Vec[] = [47, 51, 55].map((x) => ({ x, z: 2.6 }))
export const LINES_Z = [ROAD_Z, ...AISLES]

const SPEED = 1.7          // m/s
const TURN = 3.2           // rad/s
const DRAIN_MOVE = 0.22    // %/s
const DRAIN_IDLE = 0.02
const CHARGE_RATE = 1.4
const LOW = 22
const FULL = 92

export const STATE_LABEL: Record<AgvState, string> = {
  idle: 'Idle', toPick: 'To pick', picking: 'Picking', toDock: 'To dock', dropping: 'Dropping',
  toCharge: 'To charger', charging: 'Charging', blocked: 'Blocked',
}

const CUSTOMERS = ['Nordwind GmbH', 'Iberlog SL', 'Café Mosaic', 'Atlas Retail', 'Pyrenees Foods', 'Lumen Tech', 'Costa Pharma', 'Velo Parts']
const SKUS = ['PAL-WATER-24', 'PAL-SNACK-12', 'BOX-PHONE-40', 'PAL-OIL-6', 'BOX-SHOE-30', 'PAL-PAINT-8', 'BOX-MED-60', 'PAL-TYRE-4']

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

/** The line (z) a point is on, or null when it is off the network (dock, charger). */
function lineOf(p: Vec): number | null {
  for (const z of LINES_Z) if (near(p.z, z, 0.2)) return z
  return null
}

/**
 * Route on the network: horizontal lines (road + aisles) joined by two vertical
 * cross aisles. Docks and chargers hang off the road on short stubs.
 */
export function route(from: Vec, to: Vec): Vec[] {
  const out: Vec[] = []
  let p = { ...from }
  // Off the network: back out to the road first.
  if (lineOf(p) === null) { p = { x: p.x, z: ROAD_Z }; out.push(p) }
  const stubEnd = lineOf(to) === null ? to : null
  const target = stubEnd ? { x: to.x, z: ROAD_Z } : to
  const pz = lineOf(p) ?? ROAD_Z
  if (!near(pz, target.z, 0.2)) {
    const cx = CROSS_X.reduce((best, c) => (Math.abs(p.x - c) + Math.abs(target.x - c) < Math.abs(p.x - best) + Math.abs(target.x - best) ? c : best), CROSS_X[0])
    out.push({ x: cx, z: pz }, { x: cx, z: target.z })
  }
  out.push(target)
  if (stubEnd) out.push(stubEnd)
  // drop zero-length hops
  return out.filter((q, i) => dist(q, i === 0 ? from : out[i - 1]) > 0.01)
}

function rackLocation(rng: () => number): { label: string; at: Vec; rackZ: number; level: number } {
  const aisle = Math.floor(rng() * AISLES.length)
  const az = AISLES[aisle]
  const side = rng() < 0.5 ? -1 : 1
  const bays = Math.floor((RACK_X1 - RACK_X0) / BAY_W)
  const bay = Math.floor(rng() * bays)
  const x = RACK_X0 + BAY_W * (bay + 0.5)
  const level = Math.floor(rng() * LEVELS)
  const rowLetter = 'ABCDEFG'[aisle * 2 + (side > 0 ? 1 : 0)]
  return { label: `${rowLetter}-${String(bay + 1).padStart(2, '0')}-${level + 1}`, at: { x, z: az }, rackZ: az + side * 1.8, level }
}

function pushEvent(s: Sim, e: Omit<SimEvent, 't'>): void {
  s.events.unshift({ t: s.t, ...e })
  if (s.events.length > 60) s.events.length = 60
}

function newOrder(s: Sim): Order {
  const loc = rackLocation(s.rng)
  const n = s.nextOrder++
  return {
    id: `SO/2026/${String(n).padStart(4, '0')}`,
    customer: CUSTOMERS[Math.floor(s.rng() * CUSTOMERS.length)],
    sku: SKUS[Math.floor(s.rng() * SKUS.length)],
    qty: 1 + Math.floor(s.rng() * 3),
    pick: loc.label, pickAt: loc.at, rackZ: loc.rackZ, level: loc.level,
    dock: Math.floor(s.rng() * DOCKS.length),
    createdAt: s.t,
    due: s.t + 150 + s.rng() * 90,
  }
}

// ── Create / step ────────────────────────────────────────────────────────────

export function createSim(seed = 2026, fleet = 6): Sim {
  const rng = seeded(seed)
  const agvs: Agv[] = Array.from({ length: fleet }, (_, i) => {
    const start = i < CHARGERS.length ? CHARGERS[i] : { x: 12 + i * 6, z: ROAD_Z }
    return {
      id: `AGV-${String(i + 1).padStart(2, '0')}`,
      pos: { ...start }, heading: Math.PI / 2, state: 'idle', resumeState: 'idle',
      battery: 55 + rng() * 40, route: [], loaded: false, lift: 0, timer: 0,
      distanceM: 0, missions: 0, charger: i % CHARGERS.length,
    }
  })
  const s: Sim = { t: 0, agvs, queue: [], done: [], events: [], syncs: [], blocked: null, rng, nextOrder: 401, nextOrderAt: 0, nextBlockAt: 40 }
  for (let i = 0; i < 5; i++) s.queue.push(newOrder(s))
  pushEvent(s, { level: 'info', text: 'Shift started · 6 AGVs online · 5 orders in queue' })
  return s
}

function assign(s: Sim, a: Agv): void {
  if (a.battery < LOW) {
    a.state = 'toCharge'; a.route = route(a.pos, CHARGERS[a.charger])
    pushEvent(s, { level: 'warn', text: `${a.id} battery ${Math.round(a.battery)}% → charger C${a.charger + 1}`, agv: a.id })
    return
  }
  const o = s.queue.shift()
  if (!o) { a.state = 'idle'; return }
  o.agv = a.id
  a.order = o
  a.state = 'toPick'
  a.route = route(a.pos, o.pickAt)
  pushEvent(s, { level: 'info', text: `${o.id} (${o.customer}) → ${a.id} · pick ${o.pick}`, agv: a.id, order: o.id })
}

function blockedAhead(s: Sim, a: Agv, next: Vec): boolean {
  const b = s.blocked
  if (!b || s.t > b.until) return false
  if (!near(a.pos.z, b.z, 0.3) || !near(next.z, b.z, 0.3)) return false
  const lo = Math.min(a.pos.x, next.x), hi = Math.max(a.pos.x, next.x)
  return hi > b.x0 - 1.2 && lo < b.x1 + 1.2 && !(a.pos.x > b.x0 - 1.5 && a.pos.x < b.x1 + 1.5)
}

function trafficAhead(s: Sim, a: Agv): boolean {
  const hx = Math.cos(a.heading), hz = Math.sin(a.heading)
  return s.agvs.some((o) => {
    if (o === a) return false
    const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z
    const ahead = dx * hx + dz * hz
    const side = Math.abs(-dx * hz + dz * hx)
    return ahead > 0.2 && ahead < 2.4 && side < 0.9 && o.id < a.id // the lower id has way
  })
}

function drive(s: Sim, a: Agv, dt: number): boolean {
  const next = a.route[0]
  if (!next) return true
  if (blockedAhead(s, a, next)) {
    if (a.state !== 'blocked') {
      a.resumeState = a.state; a.state = 'blocked'
      pushEvent(s, { level: 'alert', text: `${a.id} stopped: aisle ${'ABC'[AISLES.indexOf(s.blocked!.z)] ?? ''} blocked`, agv: a.id })
    }
    return false
  }
  if (a.state === 'blocked') { a.state = a.resumeState; pushEvent(s, { level: 'ok', text: `${a.id} resumed`, agv: a.id }) }
  if (trafficAhead(s, a)) return false
  const want = Math.atan2(next.z - a.pos.z, next.x - a.pos.x)
  let d = want - a.heading
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  const turn = Math.sign(d) * Math.min(Math.abs(d), TURN * dt)
  a.heading += turn
  if (Math.abs(d) > 0.35) return false // turn on the spot first
  const step = Math.min(SPEED * dt * (1 - Math.min(0.6, Math.abs(d))), dist(a.pos, next))
  a.pos.x += Math.cos(want) * step
  a.pos.z += Math.sin(want) * step
  a.distanceM += step
  a.battery = Math.max(0, a.battery - DRAIN_MOVE * dt)
  if (dist(a.pos, next) < 0.02) { a.pos = { ...next }; a.route.shift() }
  return a.route.length === 0
}

export function step(s: Sim, dt: number): void {
  s.t += dt

  // Orders arrive.
  if (s.t >= s.nextOrderAt) {
    if (s.queue.length < 8) s.queue.push(newOrder(s))
    s.nextOrderAt = s.t + 9 + s.rng() * 9
  }
  // An aisle gets blocked now and then (a dropped carton, a person).
  if (s.t >= s.nextBlockAt) {
    const z = AISLES[Math.floor(s.rng() * AISLES.length)]
    const x0 = 18 + s.rng() * 22
    s.blocked = { z, x0, x1: x0 + 2.5, until: s.t + 14 }
    pushEvent(s, { level: 'alert', text: `Obstacle in aisle ${'ABC'[AISLES.indexOf(z)]} at x ${Math.round(x0)} m · AGVs hold` })
    s.nextBlockAt = s.t + 55 + s.rng() * 40
  }
  if (s.blocked && s.t > s.blocked.until) {
    pushEvent(s, { level: 'ok', text: `Aisle ${'ABC'[AISLES.indexOf(s.blocked.z)]} clear` })
    s.blocked = null
  }

  for (const a of s.agvs) {
    a.lift += ((a.state === 'picking' || a.state === 'dropping' ? 1 : a.loaded ? 0.35 : 0) - a.lift) * Math.min(1, dt * 3)
    switch (a.state) {
      case 'idle':
        a.battery = Math.max(0, a.battery - DRAIN_IDLE * dt)
        assign(s, a)
        break
      case 'toPick':
      case 'toDock':
      case 'toCharge':
      case 'blocked': {
        const arrived = drive(s, a, dt)
        if (!arrived) break
        if (a.state === 'toPick') {
          a.state = 'picking'; a.timer = 3.2
          // face the rack
          a.heading = a.order && a.order.rackZ > a.pos.z ? Math.PI / 2 : -Math.PI / 2
        } else if (a.state === 'toDock') { a.state = 'dropping'; a.timer = 2.4 }
        else if (a.state === 'toCharge') { a.state = 'charging'; pushEvent(s, { level: 'info', text: `${a.id} charging at C${a.charger + 1}`, agv: a.id }) }
        break
      }
      case 'picking':
        a.timer -= dt
        if (a.timer <= 0 && a.order) {
          a.loaded = true; a.order.pickedAt = s.t
          a.state = 'toDock'; a.route = route(a.pos, DOCKS[a.order.dock])
          pushEvent(s, { level: 'info', text: `${a.id} picked ${a.order.qty}× ${a.order.sku} at ${a.order.pick}`, agv: a.id, order: a.order.id })
        }
        break
      case 'dropping':
        a.timer -= dt
        if (a.timer <= 0 && a.order) {
          const o = a.order
          a.loaded = false; o.doneAt = s.t; a.missions++
          s.done.unshift(o); if (s.done.length > 200) s.done.length = 200
          s.syncs.unshift({ t: s.t, order: o, agv: a.id }); if (s.syncs.length > 20) s.syncs.length = 20
          const late = o.doneAt > o.due
          pushEvent(s, { level: late ? 'warn' : 'ok', text: `${o.id} delivered to dock D${o.dock + 1}${late ? ' · late' : ''} · ERP updated`, agv: a.id, order: o.id })
          a.order = undefined
          assign(s, a)
        }
        break
      case 'charging':
        a.battery = Math.min(100, a.battery + CHARGE_RATE * dt)
        if (a.battery >= FULL) { a.state = 'idle'; pushEvent(s, { level: 'ok', text: `${a.id} charged to ${Math.round(a.battery)}%`, agv: a.id }) }
        break
    }
  }
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface Kpis { ordersPerHour: number; onTimePct: number; utilisationPct: number; avgBattery: number; queue: number; done: number }

export function kpis(s: Sim): Kpis {
  const windowS = Math.min(600, Math.max(60, s.t))
  const recent = s.done.filter((o) => (o.doneAt ?? 0) > s.t - windowS)
  const busy = s.agvs.filter((a) => a.state !== 'idle' && a.state !== 'charging').length
  const onTime = s.done.length ? s.done.filter((o) => (o.doneAt ?? 0) <= o.due).length / s.done.length : 1
  return {
    ordersPerHour: Math.round((recent.length / windowS) * 3600),
    onTimePct: Math.round(onTime * 100),
    utilisationPct: Math.round((busy / s.agvs.length) * 100),
    avgBattery: Math.round(s.agvs.reduce((n, a) => n + a.battery, 0) / s.agvs.length),
    queue: s.queue.length,
    done: s.done.length,
  }
}

// ── What an ERP / CRM would receive ──────────────────────────────────────────

export type ErpTarget = 'odoo' | 'salesforce' | 'webhook'

/**
 * The request a delivered order would turn into, in each system's own API
 * shape. A preview: the demo sends nothing anywhere.
 */
export function erpPayload(target: ErpTarget, sync: ErpSync): { method: string; url: string; body: unknown } {
  const o = sync.order
  const pickingId = 4000 + Number(o.id.slice(-4))
  if (target === 'odoo') {
    return {
      method: 'POST',
      url: 'https://your-company.odoo.com/jsonrpc',
      body: {
        jsonrpc: '2.0', method: 'call',
        params: {
          service: 'object', method: 'execute_kw',
          args: ['your-db', '<uid>', '<api-key>', 'stock.picking', 'button_validate', [[pickingId]]],
          kwargs: { context: { agv_id: sync.agv, dock: `D${o.dock + 1}`, origin: o.id } },
        },
      },
    }
  }
  if (target === 'salesforce') {
    return {
      method: 'PATCH',
      url: `/services/data/v61.0/sobjects/WorkOrder/External_Id__c/${encodeURIComponent(o.id)}`,
      body: { Status: 'Completed', Subject: `${o.qty}× ${o.sku} → ${o.customer}`, AGV__c: sync.agv, Dock__c: `D${o.dock + 1}`, Completed_At__c: new Date(Date.UTC(2026, 9, 21, 9, 0, Math.round(sync.t))).toISOString() },
    }
  }
  return {
    method: 'POST',
    url: 'https://hooks.your-company.com/agv',
    body: { event: 'order.delivered', order: o.id, customer: o.customer, sku: o.sku, qty: o.qty, location: o.pick, dock: `D${o.dock + 1}`, agv: sync.agv, on_time: (o.doneAt ?? 0) <= o.due },
  }
}
