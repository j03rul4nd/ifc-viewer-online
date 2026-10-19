import { describe, it, expect } from 'vitest'
import { createSim, step, kpis, route, erpPayload, SIZE, ROAD_Z, DOCKS, CHARGERS, AISLES } from './sim'

describe('agv sim', () => {
  it('routes along the network: road, cross aisle, aisle, then the stub', () => {
    const r = route(CHARGERS[0], { x: 20, z: AISLES[1] })
    expect(r[0]).toEqual({ x: CHARGERS[0].x, z: ROAD_Z })
    expect(r[r.length - 1]).toEqual({ x: 20, z: AISLES[1] })
    // every hop is axis-aligned
    let p = CHARGERS[0]
    for (const q of r) { expect(p.x === q.x || p.z === q.z).toBe(true); p = q }
  })

  it('delivers orders, keeps carts inside the building and is deterministic', () => {
    const run = () => {
      const s = createSim(7)
      for (let i = 0; i < 600 * 10; i++) step(s, 0.1)
      return s
    }
    const s = run()
    expect(s.done.length).toBeGreaterThan(8)
    for (const a of s.agvs) {
      expect(Number.isFinite(a.pos.x) && Number.isFinite(a.pos.z)).toBe(true)
      expect(a.pos.x).toBeGreaterThanOrEqual(0); expect(a.pos.x).toBeLessThanOrEqual(SIZE.w)
      expect(a.pos.z).toBeGreaterThanOrEqual(0); expect(a.pos.z).toBeLessThanOrEqual(SIZE.d)
      expect(a.battery).toBeGreaterThan(0)
    }
    expect(run().done.map((o) => o.id)).toEqual(s.done.map((o) => o.id))
    const k = kpis(s)
    expect(k.ordersPerHour).toBeGreaterThan(0)
    expect(k.onTimePct).toBeGreaterThanOrEqual(0)
    expect(s.events.some((e) => e.level === 'alert')).toBe(true)
    expect(s.agvs.some((a) => a.missions > 0)).toBe(true)
    expect(DOCKS.length).toBe(4)
  })

  it('builds ERP previews in each system’s shape', () => {
    const s = createSim(1)
    for (let i = 0; i < 3000 && s.syncs.length === 0; i++) step(s, 0.1)
    const sync = s.syncs[0]
    expect(sync).toBeTruthy()
    const odoo = erpPayload('odoo', sync).body as { params: { args: unknown[] } }
    expect(odoo.params.args[3]).toBe('stock.picking')
    expect(erpPayload('salesforce', sync).method).toBe('PATCH')
    expect((erpPayload('webhook', sync).body as { event: string }).event).toBe('order.delivered')
  })
})
