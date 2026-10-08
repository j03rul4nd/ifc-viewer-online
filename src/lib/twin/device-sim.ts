// ─── device-sim ───────────────────────────────────────────────────────────────
// A connected home that needs no server: meter, solar, alarm, doors, water,
// rooms, parking bays and a camera, all reporting from a pure function of time.
// It exists so anyone can see the twin work in ten seconds with whatever IFC
// they have open — and so tests can assert what each device says at a given
// moment.
//
// `demoBindings` then ties those devices to elements of the loaded models by
// IFC class (spaces → rooms, doors → front door, windows → heat loss…), so the
// demo lights up a real building rather than an abstract list.

import type { SpatialNode } from '../../types'
import { newTwinId, type Binding, type DeviceSource, type TwinRule, type ElementRef } from './devices'

export const SIM_HOME_URL = 'sim:home'

export const SIM_PRESETS: Record<string, (tMs: number) => unknown> = {
  [SIM_HOME_URL]: simulateHome,
}

const wave = (tMs: number, periodMs: number, phase = 0): number => Math.sin((tMs / periodMs + phase) * Math.PI * 2)

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
    return { id: `room-${i + 1}`, kind: 'room', temp_c: Math.round(temp * 10) / 10, window_open: windowOpen, co2_ppm: Math.round(600 + 400 * (0.5 + 0.5 * wave(tMs, 300_000, i / 3))), updated: at }
  })
  const bays = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `bay-${i + 1}`, kind: 'parking', occupied: ((minute + i * 7) % 10) < 6, updated: at }))
  return {
    site: 'Demo home',
    devices: [
      { id: 'meter', kind: 'meter', power_kw: Math.round((1.4 + 1.1 * wave(tMs, 120_000) + (step % 9 === 0 ? 2.5 : 0)) * 100) / 100, updated: at },
      { id: 'solar', kind: 'solar', pv_kw: Math.round(4.2 * daylight * (0.85 + 0.15 * wave(tMs, 90_000)) * 100) / 100, battery_pct: Math.round(55 + 40 * wave(tMs, 600_000)), updated: at },
      { id: 'alarm', kind: 'alarm', state: alarmCycle === 11 ? 'triggered' : alarmCycle >= 6 ? 'armed' : 'disarmed', zone: alarmCycle === 11 ? 'front door' : null, updated: at },
      { id: 'front-door', kind: 'door', open: step % 8 === 3, updated: at },
      { id: 'water', kind: 'water', flow_lpm: leak ? 3.8 : Math.max(0, Math.round(6 * wave(tMs, 180_000) * 10) / 10), leak, updated: at },
      { id: 'camera-1', kind: 'camera', online: step % 30 !== 29, motion: alarmCycle >= 10, updated: at },
      ...rooms,
      ...bays,
    ],
  }
}

export function simulatedSource(): DeviceSource {
  return {
    id: newTwinId('s'),
    name: 'Demo home (simulated)',
    url: SIM_HOME_URL,
    intervalS: 5,
    mapping: { listPath: 'devices', idField: 'id', timeField: 'updated' },
    enabled: true,
  }
}

// ── Demo bindings ─────────────────────────────────────────────────────────────

const rule = (name: string, filters: TwinRule['filters'], color: string | null, opacity = 1, hide = false): TwinRule =>
  ({ id: newTwinId('r'), name, match: 'all', filters, effect: { color, opacity, hide } })

interface Found { ref: ElementRef; ifcClass: string }

function collect(trees: Record<string, SpatialNode[]>): Found[] {
  const out: Found[] = []
  const seen = new Set<string>()
  const add = (globalId: string, ifcClass: string, name: string): void => {
    if (!globalId || seen.has(globalId)) return
    seen.add(globalId)
    out.push({ ref: { globalId, label: name || ifcClass }, ifcClass: ifcClass.toUpperCase() })
  }
  for (const roots of Object.values(trees)) {
    const visit = (n: SpatialNode): void => {
      add(n.globalId, n.ifcClass, n.name)
      n.containedElements.forEach((e) => add(e.globalId, e.ifcClass, e.name))
      n.children.forEach(visit)
    }
    roots.forEach(visit)
  }
  return out
}

function ofClass(all: Found[], ...classes: string[]): ElementRef[] {
  const want = classes.map((c) => c.toUpperCase())
  return all.filter((f) => want.some((c) => f.ifcClass === c || f.ifcClass.startsWith(c))).map((f) => f.ref)
}

/**
 * Bindings for the simulated home on whatever is loaded. Only creates a binding
 * when the model has something to bind it to; returns [] for an empty scene.
 */
export function demoBindings(trees: Record<string, SpatialNode[]>, sourceId: string): Binding[] {
  const all = collect(trees)
  const out: Binding[] = []
  const bind = (name: string, deviceId: string, targets: ElementRef[], rules: TwinRule[]): void => {
    if (targets.length === 0) return
    out.push({ id: newTwinId('b'), name, sourceId, deviceId, targets, rules, staleColor: '#7b8494', staleAfterS: 60 })
  }

  const spaces = ofClass(all, 'IFCSPACE')
  spaces.slice(0, 6).forEach((s, i) => bind(`${s.label} · temperature`, `room-${i + 1}`, [s], [
    rule('Window open (heat loss)', [{ field: 'window_open', op: 'isTrue' }], '#a855f7'),
    rule('Cold < 20 °C', [{ field: 'temp_c', op: 'lt', value: 20 }], '#3b82f6'),
    rule('Warm > 23 °C', [{ field: 'temp_c', op: 'gt', value: 23 }], '#ef4444'),
    rule('Comfort', [], '#22c55e', 0.6),
  ]))

  const doors = ofClass(all, 'IFCDOOR')
  if (doors.length) {
    bind('Alarm', 'alarm', doors.slice(0, 1), [
      rule('Triggered', [{ field: 'state', op: 'eq', value: 'triggered' }], '#ff1f1f'),
      rule('Armed', [{ field: 'state', op: 'eq', value: 'armed' }], '#f59e0b'),
    ])
    bind('Doors', 'front-door', doors.slice(1, 4), [rule('Open', [{ field: 'open', op: 'isTrue' }], '#f59e0b')])
  }

  const windows = ofClass(all, 'IFCWINDOW')
  spaces.length === 0 && windows.slice(0, 6).forEach((w, i) => bind(`${w.label} · window`, `room-${i + 1}`, [w], [
    rule('Open (heat loss)', [{ field: 'window_open', op: 'isTrue' }], '#a855f7'),
  ]))

  const roofs = ofClass(all, 'IFCROOF', 'IFCSOLARDEVICE')
  const slabs = ofClass(all, 'IFCSLAB')
  bind('Solar panels', 'solar', roofs.length ? roofs.slice(0, 4) : slabs.slice(-1), [
    rule('Producing > 2 kW', [{ field: 'pv_kw', op: 'gt', value: 2 }], '#facc15'),
    rule('Producing', [{ field: 'pv_kw', op: 'gt', value: 0.1 }], '#fde68a'),
    rule('Night', [], '#334155'),
  ])

  const water = ofClass(all, 'IFCPIPE', 'IFCFLOWSEGMENT', 'IFCSANITARYTERMINAL', 'IFCFLOWTERMINAL')
  bind('Water', 'water', water.slice(0, 20), [
    rule('Leak', [{ field: 'leak', op: 'isTrue' }], '#ff1f1f'),
    rule('Flowing', [{ field: 'flow_lpm', op: 'gt', value: 0 }], '#38bdf8'),
  ])

  // Parking: bays modelled as spaces/slabs named "parking"/"plaza"/"bay", if any.
  const bays = all.filter((f) => /parking|aparcament|aparcamiento|plaza|bay|stall/i.test(f.ref.label)).map((f) => f.ref)
  bays.slice(0, 8).forEach((b, i) => bind(`${b.label} · bay`, `bay-${i + 1}`, [b], [
    rule('Occupied', [{ field: 'occupied', op: 'isTrue' }], '#ef4444'),
    rule('Free', [], '#22c55e'),
  ]))

  return out
}
