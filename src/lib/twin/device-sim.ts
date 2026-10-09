// ─── device-sim ───────────────────────────────────────────────────────────────
// Two buildings that need no server — a connected HOME (meter, solar, alarm,
// doors, water, rooms, camera) and a residential COMMUNITY (dwellings, water
// per storey, parking bays, entrance, lift, roof solar, cameras) — all reporting
// from a pure function of time. They exist so anyone can see the twin work in
// ten seconds with whatever IFC they have open, and so tests can assert what
// each device says at a given moment.
//
// The TEMPLATES then tie those devices to the loaded models by what elements
// are (spaces, doors, windows, roofs, pipes, storeys), so the demo lights up a
// real building rather than an abstract list. Names come through `n()` so the
// app can hand them over in the user's language.

import type { SpatialNode } from '../../types'
import { buildCatalog, newTwinId, type Binding, type CatalogEntry, type DeviceSource, type TwinRule, type ElementRef } from './devices'

export const SIM_HOME_URL = 'sim:home'
export const SIM_COMMUNITY_URL = 'sim:community'

export type TwinTemplateId = 'home' | 'community'

const wave = (tMs: number, periodMs: number, phase = 0): number => Math.sin((tMs / periodMs + phase) * Math.PI * 2)
const r1 = (v: number): number => Math.round(v * 10) / 10

/**
 * A camera frame as an SVG data URL: time, name and a motion box. Stands in
 * for a real snapshot URL so the camera flow works without any server.
 */
export function simulatedSnapshot(name: string, tMs: number, motion: boolean): string {
  const time = new Date(tMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const x = 40 + Math.round(120 * (0.5 + 0.5 * wave(tMs, 20_000)))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">`
    + `<rect width="320" height="180" fill="#1f2937"/><rect y="120" width="320" height="60" fill="#374151"/>`
    + `<rect x="230" y="50" width="60" height="70" fill="#4b5563"/>`
    + (motion ? `<rect x="${x}" y="70" width="34" height="62" fill="none" stroke="#ef4444" stroke-width="3"/><circle cx="${x + 17}" cy="88" r="9" fill="#9ca3af"/><rect x="${x + 9}" y="98" width="16" height="30" fill="#9ca3af"/>` : '')
    + `<text x="10" y="20" font-family="monospace" font-size="13" fill="#e5e7eb">${name}</text>`
    + `<text x="310" y="20" font-family="monospace" font-size="13" fill="#e5e7eb" text-anchor="end">${time}</text>`
    + `<circle cx="300" cy="165" r="5" fill="${motion ? '#ef4444' : '#22c55e'}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Deterministic in `tMs`. Cycles are minutes long so the demo visibly changes. */
export function simulateHome(tMs: number): unknown {
  const hour = new Date(tMs).getHours() + new Date(tMs).getMinutes() / 60
  const daylight = Math.max(0, Math.sin(((hour - 7) / 13) * Math.PI)) // 07:00–20:00
  const minute = Math.floor(tMs / 60_000)
  const step = Math.floor(tMs / 15_000) // changes every 15 s
  const alarmCycle = step % 12
  const leak = step % 20 >= 17
  const at = new Date(tMs).toISOString()
  const rooms = [0, 1, 2, 3, 4, 5].map((i) => {
    const windowOpen = (step + i * 3) % 16 >= 13
    const temp = 21 + 2.5 * wave(tMs, 240_000, i / 6) - (windowOpen ? 4 : 0)
    return { id: `room-${i + 1}`, kind: 'room', temp_c: r1(temp), window_open: windowOpen, co2_ppm: Math.round(600 + 400 * (0.5 + 0.5 * wave(tMs, 300_000, i / 3))), updated: at }
  })
  const bays = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `bay-${i + 1}`, kind: 'parking', occupied: ((minute + i * 7) % 10) < 6, updated: at }))
  const motion = alarmCycle >= 10
  return {
    site: 'Demo home',
    devices: [
      { id: 'meter', kind: 'meter', power_kw: Math.round((1.4 + 1.1 * wave(tMs, 120_000) + (step % 9 === 0 ? 2.5 : 0)) * 100) / 100, updated: at },
      { id: 'solar', kind: 'solar', pv_kw: Math.round(4.2 * daylight * (0.85 + 0.15 * wave(tMs, 90_000)) * 100) / 100, battery_pct: Math.round(55 + 40 * wave(tMs, 600_000)), updated: at },
      { id: 'alarm', kind: 'alarm', state: alarmCycle === 11 ? 'triggered' : alarmCycle >= 6 ? 'armed' : 'disarmed', zone: alarmCycle === 11 ? 'front door' : null, updated: at },
      { id: 'front-door', kind: 'door', open: step % 8 === 3, updated: at },
      { id: 'water', kind: 'water', flow_lpm: leak ? 3.8 : Math.max(0, r1(6 * wave(tMs, 180_000))), leak, updated: at },
      { id: 'camera-1', kind: 'camera', online: step % 30 !== 29, motion, snapshot_url: simulatedSnapshot('CAM 1 · entrance', tMs, motion), updated: at },
      ...rooms,
      ...bays,
    ],
  }
}

/** A residential block: `dwellings` flats over `storeys` floors, a car park, one entrance. */
export function simulateCommunity(tMs: number, dwellings = 24, storeys = 8, bays = 30): unknown {
  const step = Math.floor(tMs / 15_000)
  const minute = Math.floor(tMs / 60_000)
  const hour = new Date(tMs).getHours() + new Date(tMs).getMinutes() / 60
  const daylight = Math.max(0, Math.sin(((hour - 7) / 13) * Math.PI))
  const at = new Date(tMs).toISOString()
  const flats = Array.from({ length: dwellings }, (_, i) => {
    const heat = Math.max(0, r1(1.5 + 1.2 * wave(tMs, 300_000, i / dwellings)))
    // One flat at a time leaks heat (window open with the heating on) for a while.
    const heatLoss = (step + i * 5) % 40 === 0 || (step + i * 5) % 40 === 1
    return { id: `flat-${i + 1}`, kind: 'dwelling', heat_kw: heat, temp_c: r1(21 + 1.8 * wave(tMs, 420_000, i / 7) - (heatLoss ? 3 : 0)), heat_loss: heatLoss, water_lpm: Math.max(0, r1(4 * wave(tMs, 200_000, i / 5))), updated: at }
  })
  const floors = Array.from({ length: storeys }, (_, i) => {
    const leak = (step + i * 11) % 60 >= 57
    return { id: `water-floor-${i}`, kind: 'water', flow_lpm: r1((leak ? 6 : 0) + Math.max(0, 12 * wave(tMs, 180_000, i / storeys))), leak, updated: at }
  })
  const park = Array.from({ length: bays }, (_, i) => ({ id: `bay-${i + 1}`, kind: 'parking', occupied: ((minute + i * 7) % 11) < 7, ev_charging: i % 6 === 0 && ((minute + i) % 4) < 2, updated: at }))
  const free = park.filter((b) => !b.occupied).length
  const motion = step % 8 >= 6
  return {
    site: 'Demo community',
    devices: [
      ...flats, ...floors, ...park,
      { id: 'parking', kind: 'parking-summary', free, total: bays, updated: at },
      { id: 'entrance', kind: 'door', open: step % 6 === 2, access_today: 40 + (minute % 300), updated: at },
      { id: 'lift', kind: 'lift', status: step % 50 === 49 ? 'fault' : step % 3 === 0 ? 'moving' : 'idle', floor: step % storeys, updated: at },
      { id: 'roof-solar', kind: 'solar', pv_kw: r1(18 * daylight * (0.85 + 0.15 * wave(tMs, 90_000))), updated: at },
      { id: 'fire', kind: 'fire', state: step % 240 === 239 ? 'alarm' : 'normal', updated: at },
      { id: 'camera-entrance', kind: 'camera', online: true, motion, snapshot_url: simulatedSnapshot('CAM · entrance', tMs, motion), updated: at },
      { id: 'camera-parking', kind: 'camera', online: step % 40 !== 39, motion: !motion, snapshot_url: simulatedSnapshot('CAM · parking', tMs, !motion), updated: at },
    ],
  }
}

export const SIM_PRESETS: Record<string, (tMs: number) => unknown> = {
  [SIM_HOME_URL]: simulateHome,
  [SIM_COMMUNITY_URL]: (t) => simulateCommunity(t),
}

// ── Names (the app passes localized ones) ─────────────────────────────────────

export const TEMPLATE_NAMES_EN = {
  homeSource: 'Demo home (simulated)', communitySource: 'Demo community (simulated)',
  temperature: 'temperature', window: 'window', bay: 'bay', alarm: 'Alarm', doors: 'Doors', solar: 'Solar panels',
  water: 'Water', camera: 'Camera', dwelling: 'dwelling', floorWater: 'Water · storey', entrance: 'Entrance', lift: 'Lift',
  fire: 'Fire alarm', parkingCamera: 'Parking camera',
  windowOpen: 'Window open (heat loss)', cold: 'Cold < 20 °C', warm: 'Warm > 23 °C', comfort: 'Comfort',
  triggered: 'Triggered', armed: 'Armed', open: 'Open', producingHigh: 'Producing > 2 kW', producing: 'Producing',
  night: 'Night', leak: 'Leak', flowing: 'Flowing', occupied: 'Occupied', free: 'Free', charging: 'EV charging',
  motion: 'Motion', offline: 'Offline', heatLoss: 'Heat loss', highUse: 'High use', fault: 'Fault', moving: 'Moving',
  fireAlarm: 'Fire alarm',
}
export type TemplateNames = typeof TEMPLATE_NAMES_EN

export function simulatedSource(template: TwinTemplateId = 'home', names: TemplateNames = TEMPLATE_NAMES_EN): DeviceSource {
  return {
    id: newTwinId('s'),
    name: template === 'home' ? names.homeSource : names.communitySource,
    url: template === 'home' ? SIM_HOME_URL : SIM_COMMUNITY_URL,
    intervalS: 5,
    mapping: { listPath: 'devices', idField: 'id', timeField: 'updated' },
    enabled: true,
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

const rule = (name: string, filters: TwinRule['filters'], color: string | null, opacity = 1, hide = false, alertMin: number | null = null): TwinRule =>
  ({ id: newTwinId('r'), name, match: 'all', filters, effect: { color, opacity, hide }, alert: alertMin === null ? null : { forMin: alertMin } })

const refOf = (e: CatalogEntry): ElementRef => ({ globalId: e.globalId, label: e.name || e.ifcClass })

function uniqueByGuid(list: CatalogEntry[]): CatalogEntry[] {
  const seen = new Set<string>()
  return list.filter((e) => (e.globalId && !seen.has(e.globalId) ? (seen.add(e.globalId), true) : false))
}

function ofClass(all: CatalogEntry[], ...classes: string[]): CatalogEntry[] {
  const want = classes.map((c) => c.toUpperCase())
  return all.filter((e) => want.some((c) => e.ifcClass.toUpperCase() === c || e.ifcClass.toUpperCase().startsWith(c)))
}

const PARKING_NAME = /parking|aparcament|aparcamiento|garage|garaje|plaza|bay|stall|estacionamento|parkplatz/i

interface Ctx { out: Binding[]; sourceId: string }

function binder(ctx: Ctx) {
  return (name: string, deviceId: string, targets: ElementRef[], rules: TwinRule[], extra: Partial<Binding> = {}): void => {
    if (targets.length === 0 && !extra.query) return
    ctx.out.push({ id: newTwinId('b'), name, sourceId: ctx.sourceId, deviceId, targets, rules, staleColor: '#7b8494', staleAfterS: 60, label: null, ...extra })
  }
}

/**
 * Bindings for the simulated HOME on whatever is loaded. Only creates a binding
 * when the model has something to bind it to; returns [] for an empty scene.
 */
export function demoBindings(trees: Record<string, SpatialNode[]>, sourceId: string, n: TemplateNames = TEMPLATE_NAMES_EN): Binding[] {
  const all = uniqueByGuid(buildCatalog(trees))
  const ctx: Ctx = { out: [], sourceId }
  const bind = binder(ctx)

  const spaces = ofClass(all, 'IFCSPACE')
  spaces.slice(0, 6).forEach((s, i) => bind(`${refOf(s).label} · ${n.temperature}`, `room-${i + 1}`, [refOf(s)], [
    rule(n.windowOpen, [{ field: 'window_open', op: 'isTrue' }], '#a855f7'),
    rule(n.cold, [{ field: 'temp_c', op: 'lt', value: 20 }], '#3b82f6'),
    rule(n.warm, [{ field: 'temp_c', op: 'gt', value: 23 }], '#ef4444'),
    rule(n.comfort, [], '#22c55e', 0.6),
  ], { label: { field: 'temp_c' } }))

  const doors = ofClass(all, 'IFCDOOR').map(refOf)
  if (doors.length) {
    bind(n.alarm, 'alarm', doors.slice(0, 1), [
      rule(n.triggered, [{ field: 'state', op: 'eq', value: 'triggered' }], '#ff1f1f', 1, false, 0),
      rule(n.armed, [{ field: 'state', op: 'eq', value: 'armed' }], '#f59e0b'),
    ])
    bind(n.camera, 'camera-1', doors.slice(0, 1), [
      rule(n.offline, [{ field: 'online', op: 'isFalse' }], '#7b8494'),
      rule(n.motion, [{ field: 'motion', op: 'isTrue' }], '#f97316'),
    ], { media: { field: 'snapshot_url' } })
    bind(n.doors, 'front-door', doors.slice(1, 4), [rule(n.open, [{ field: 'open', op: 'isTrue' }], '#f59e0b')])
  }

  const windows = ofClass(all, 'IFCWINDOW').map(refOf)
  if (spaces.length === 0) {
    windows.slice(0, 6).forEach((w, i) => bind(`${w.label} · ${n.window}`, `room-${i + 1}`, [w], [
      rule(n.windowOpen, [{ field: 'window_open', op: 'isTrue' }], '#a855f7'),
    ], { label: { field: 'temp_c' } }))
  }

  const roofs = ofClass(all, 'IFCROOF', 'IFCSOLARDEVICE').map(refOf)
  const slabs = ofClass(all, 'IFCSLAB').map(refOf)
  bind(n.solar, 'solar', roofs.length ? roofs.slice(0, 4) : slabs.slice(-1), [
    rule(n.producingHigh, [{ field: 'pv_kw', op: 'gt', value: 2 }], '#facc15'),
    rule(n.producing, [{ field: 'pv_kw', op: 'gt', value: 0.1 }], '#fde68a'),
    rule(n.night, [], '#334155'),
  ], { label: { field: 'pv_kw' } })

  const water = ofClass(all, 'IFCPIPE', 'IFCFLOWSEGMENT', 'IFCSANITARYTERMINAL', 'IFCFLOWTERMINAL').map(refOf)
  bind(n.water, 'water', water.slice(0, 20), [
    rule(n.leak, [{ field: 'leak', op: 'isTrue' }], '#ff1f1f', 1, false, 0),
    rule(n.flowing, [{ field: 'flow_lpm', op: 'gt', value: 0 }], '#38bdf8'),
  ])

  const bays = all.filter((e) => PARKING_NAME.test(e.name)).map(refOf)
  bays.slice(0, 8).forEach((b, i) => bind(`${b.label} · ${n.bay}`, `bay-${i + 1}`, [b], [
    rule(n.occupied, [{ field: 'occupied', op: 'isTrue' }], '#ef4444'),
    rule(n.free, [], '#22c55e'),
  ]))

  return ctx.out
}

/**
 * Bindings for the simulated COMMUNITY. Leans on queries: water meters bind to
 * a whole storey ("every element on Level 3"), so a project split into
 * architecture + MEP files lights up in all of them at once.
 */
export function communityBindings(trees: Record<string, SpatialNode[]>, sourceId: string, n: TemplateNames = TEMPLATE_NAMES_EN): Binding[] {
  const all = uniqueByGuid(buildCatalog(trees))
  const ctx: Ctx = { out: [], sourceId }
  const bind = binder(ctx)

  // Dwellings: spaces that are not parking; fall back to storeys' slabs.
  const spaces = ofClass(all, 'IFCSPACE').filter((e) => !PARKING_NAME.test(e.name))
  spaces.slice(0, 24).forEach((s, i) => bind(`${refOf(s).label} · ${n.dwelling}`, `flat-${i + 1}`, [refOf(s)], [
    rule(n.heatLoss, [{ field: 'heat_loss', op: 'isTrue' }], '#a855f7', 1, false, 1),
    rule(n.cold, [{ field: 'temp_c', op: 'lt', value: 20 }], '#3b82f6'),
    rule(n.warm, [{ field: 'temp_c', op: 'gt', value: 22.5 }], '#ef4444'),
    rule(n.comfort, [], '#22c55e', 0.6),
  ], { label: { field: 'temp_c' } }))

  // Water per storey, by query: every element of that storey in every file.
  const storeys = [...new Set(all.filter((e) => /^ifcbuildingstorey$/i.test(e.ifcClass)).map((e) => e.name).filter(Boolean))]
  storeys.slice(0, 8).forEach((st, i) => bind(`${n.floorWater} ${st}`, `water-floor-${i}`, [], [
    rule(n.leak, [{ field: 'leak', op: 'isTrue' }], '#ff1f1f', 1, false, 0),
  ], { query: { classes: ['IfcPipe*', 'IfcDuct*', 'IfcFlow*', 'IfcSanitaryTerminal', 'IfcAirTerminal', 'IfcValve'], storey: st, nameContains: '' } }))

  const bays = all.filter((e) => PARKING_NAME.test(e.name)).map(refOf)
  bays.slice(0, 30).forEach((b, i) => bind(`${b.label} · ${n.bay}`, `bay-${i + 1}`, [b], [
    rule(n.charging, [{ field: 'ev_charging', op: 'isTrue' }], '#38bdf8'),
    rule(n.occupied, [{ field: 'occupied', op: 'isTrue' }], '#ef4444'),
    rule(n.free, [], '#22c55e'),
  ]))

  const doors = ofClass(all, 'IFCDOOR').map(refOf)
  bind(n.entrance, 'entrance', doors.slice(0, 1), [rule(n.open, [{ field: 'open', op: 'isTrue' }], '#f59e0b')], { label: { field: 'access_today' } })
  bind(n.camera, 'camera-entrance', doors.slice(0, 1), [rule(n.motion, [{ field: 'motion', op: 'isTrue' }], '#f97316')], { media: { field: 'snapshot_url' } })
  if (bays.length) bind(n.parkingCamera, 'camera-parking', bays.slice(0, 1), [rule(n.offline, [{ field: 'online', op: 'isFalse' }], '#7b8494', 1, false, 0)], { media: { field: 'snapshot_url' } })

  const lifts = ofClass(all, 'IFCTRANSPORTELEMENT').map(refOf)
  bind(n.lift, 'lift', lifts, [
    rule(n.fault, [{ field: 'status', op: 'eq', value: 'fault' }], '#ff1f1f', 1, false, 0),
    rule(n.moving, [{ field: 'status', op: 'eq', value: 'moving' }], '#38bdf8'),
  ], { label: { field: 'floor' } })

  const roofs = ofClass(all, 'IFCROOF', 'IFCSOLARDEVICE').map(refOf)
  const slabs = ofClass(all, 'IFCSLAB').map(refOf)
  bind(n.solar, 'roof-solar', roofs.length ? roofs.slice(0, 4) : slabs.slice(-1), [
    rule(n.producing, [{ field: 'pv_kw', op: 'gt', value: 0.1 }], '#facc15'),
    rule(n.night, [], '#334155'),
  ], { label: { field: 'pv_kw' } })

  // Fire alarm: every storey slab, so the whole building goes red at once.
  bind(n.fire, 'fire', slabs.slice(0, 40), [rule(n.fireAlarm, [{ field: 'state', op: 'eq', value: 'alarm' }], '#ff1f1f', 1, false, 0)])

  return ctx.out
}

export function templateBindings(id: TwinTemplateId, trees: Record<string, SpatialNode[]>, sourceId: string, n: TemplateNames = TEMPLATE_NAMES_EN): Binding[] {
  return id === 'home' ? demoBindings(trees, sourceId, n) : communityBindings(trees, sourceId, n)
}
