import { describe, it, expect, afterAll } from 'vitest'
import {
  configureAgv, createSim, step, applyFleet, clampLayout, DEFAULT_LAYOUT,
  SIZE, AISLES, RACK_ROWS, DOCKS, CHARGERS, ZONES, XE, LEVEL_Y, FRONT, REAR, type Agv,
} from './sim'

function corners(a: Agv) {
  const hx = Math.cos(a.heading), hz = Math.sin(a.heading), w = 0.54
  const pts: { x: number; z: number }[] = []
  for (const u of [-REAR + 0.05, FRONT - 0.05]) for (const v of [-w, w]) pts.push({ x: a.pos.x + hx * u - hz * v, z: a.pos.z + hz * u + hx * v })
  return [pts[0], pts[1], pts[3], pts[2]]
}
function overlap(a: Agv, b: Agv): boolean {
  const pa = corners(a), pb = corners(b)
  for (const poly of [pa, pb]) for (let i = 0; i < 4; i++) {
    const p = poly[i], q = poly[(i + 1) % 4]
    const nx = q.z - p.z, nz = -(q.x - p.x)
    const A = pa.map((c) => c.x * nx + c.z * nz), B = pb.map((c) => c.x * nx + c.z * nz)
    if (Math.max(...A) < Math.min(...B) || Math.max(...B) < Math.min(...A)) return false
  }
  return true
}

afterAll(() => { configureAgv() })

describe('configurable AGV layout', () => {
  it('the default layout is the demo centre, value for value', () => {
    configureAgv()
    expect(SIZE).toEqual({ w: 60, d: 36 })
    expect(AISLES).toEqual([15.2, 22.2, 29.2])
    expect(RACK_ROWS).toEqual([11, 12.4, 18, 19.4, 25, 26.4, 32])
    expect(DOCKS.map((d) => [d.x, d.kind])).toEqual([[12.5, 'out'], [17, 'out'], [21.5, 'out'], [26, 'out'], [30.5, 'in']])
    expect(CHARGERS).toEqual([33.5, 36, 38.5, 41, 43.5, 46])
    expect(XE).toBe(51)
    expect(ZONES.map((r) => ({ x0: +r.x0.toFixed(2), x1: +r.x1.toFixed(2), z0: +r.z0.toFixed(2), z1: +r.z1.toFixed(2) }))).toEqual([{ x0: 47.6, x1: 52.6, z0: 13.4, z1: 17 }, { x0: 47.6, x1: 52.6, z0: 20.4, z1: 24 }])
    expect(LEVEL_Y).toEqual([0.18, 1.45, 2.7, 3.95])
  })

  it('clamps what the floor model cannot build', () => {
    expect(clampLayout({ aisles: 40, bays: 1, levels: 'x' as unknown as number, fleet: 0 })).toEqual({ ...DEFAULT_LAYOUT, aisles: 6, bays: 4, fleet: 1 })
  })

  it.each([
    { aisles: 1, bays: 6, levels: 2, docksOut: 1, docksIn: 1, fleet: 2 },
    { aisles: 2, bays: 20, levels: 5, docksOut: 3, docksIn: 2, fleet: 4 },
    { aisles: 5, bays: 24, levels: 6, docksOut: 6, docksIn: 2, fleet: 10 },
    { aisles: 6, bays: 30, levels: 3, docksOut: 8, docksIn: 3, fleet: 12 },
  ])('runs a shift on %o without carts touching or gridlocking', (layout) => {
    configureAgv(layout)
    expect(DOCKS).toHaveLength(layout.docksOut + layout.docksIn)
    expect(CHARGERS[CHARGERS.length - 1]).toBeLessThan(XE)
    const s = createSim(11, layout.fleet)
    expect(s.agvs).toHaveLength(layout.fleet)
    let collisions = 0, longestWait = 0
    for (let i = 0; i < 25 * 60 * 10; i++) {
      step(s, 0.1)
      if (i % 5 === 0) for (let x = 0; x < s.agvs.length; x++) for (let y = x + 1; y < s.agvs.length; y++) if (overlap(s.agvs[x], s.agvs[y])) collisions++
      for (const a of s.agvs) if (a.wait) longestWait = Math.max(longestWait, s.t - a.waitSince)
    }
    expect(collisions).toBe(0)
    expect(longestWait).toBeLessThan(60)
    expect(s.done.some((t) => t.type === 'PICK')).toBe(true)
    expect(s.done.some((t) => t.type === 'PUTAWAY')).toBe(true)
    for (const a of s.agvs) {
      expect(a.pos.x).toBeGreaterThanOrEqual(0); expect(a.pos.x).toBeLessThanOrEqual(SIZE.w)
      expect(a.pos.z).toBeGreaterThanOrEqual(0); expect(a.pos.z).toBeLessThanOrEqual(SIZE.d)
    }
  }, 60_000)

  it('uses the catalogue it is given', () => {
    configureAgv({ ...DEFAULT_LAYOUT }, {
      site: 'Almacén Norte', customers: ['Cliente Uno'], cities: ['Bilbao'], carriers: ['Rápido SL'], priorityCarrier: 'Rápido SL', suppliers: ['Proveedor A'],
      skus: [{ code: 'SKU-1', name: 'Tornillos', cases: 40, kgCase: 8, color: '#999999', wrap: 'carton' }],
    })
    const s = createSim(5)
    for (let i = 0; i < 3000; i++) step(s, 0.1)
    const all = [...s.tasks, ...s.done]
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((t) => t.pallet.sku.code === 'SKU-1')).toBe(true)
    expect(all.filter((t) => t.type === 'PICK').every((t) => t.party === 'Cliente Uno' && t.city === 'Bilbao' && t.priority === 1)).toBe(true)
  })

  it('hands a cart over to a real fleet and stops simulating it', () => {
    configureAgv()
    const s = createSim(9)
    for (let i = 0; i < 1200; i++) step(s, 0.1)
    applyFleet(s, [{ id: 'AMR-7', x: 20, z: 6, battery: 63, state: 'idle', mission: 'Pick 4411' }])
    const a = s.agvs.find((x) => x.external?.realId === 'AMR-7')!
    expect(a).toBeTruthy()
    expect(a.task).toBeNull()
    for (let i = 0; i < 600; i++) step(s, 0.1)
    expect(a.pos).toEqual({ x: 20, z: 6 })
    expect(a.battery).toBe(63)
    expect(s.tasks.some((t) => t.agv === a.id)).toBe(false)
    applyFleet(s, [{ id: 'AMR-7', x: 24, z: 6 }])
    expect(a.pos.x).toBe(24)
    expect(Math.abs(a.heading)).toBeLessThan(1e-9) // moving +x
  })
})
