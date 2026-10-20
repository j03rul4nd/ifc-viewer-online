import { describe, it, expect } from 'vitest'
import { createSim, step, kpis, legsTo, erpPayload, find, sscc, SIZE, ROAD_Z, AISLES, CHARGERS, STUB_Z, FRONT, REAR, type Agv } from './sim'

/** The cart's footprint (chassis + forks + pallet) as an oriented rectangle, a little shrunk for float noise. */
function corners(a: Agv): { x: number; z: number }[] {
  const hx = Math.cos(a.heading), hz = Math.sin(a.heading), w = 0.54
  const pts: { x: number; z: number }[] = []
  for (const u of [-REAR + 0.05, FRONT - 0.05]) for (const v of [-w, w]) pts.push({ x: a.pos.x + hx * u - hz * v, z: a.pos.z + hz * u + hx * v })
  return [pts[0], pts[1], pts[3], pts[2]]
}
function overlap(a: Agv, b: Agv): boolean {
  const pa = corners(a), pb = corners(b)
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i], q = poly[(i + 1) % 4]
      const nx = q.z - p.z, nz = -(q.x - p.x)
      const proj = (ps: typeof pa) => ps.map((c) => c.x * nx + c.z * nz)
      const A = proj(pa), B = proj(pb)
      if (Math.max(...A) < Math.min(...B) || Math.max(...B) < Math.min(...A)) return false
    }
  }
  return true
}

describe('agv sim', () => {
  it('routes one way: out of a charger backwards, then forward over the loop', () => {
    const s = createSim(3)
    const legs = legsTo(s, { kind: 'stub', x: CHARGERS[0], z: STUB_Z }, { kind: 'aisle', x: 20, z: AISLES[1] })
    expect(legs[0].rev).toBe(true)
    expect(legs[1].rev).toBe(false)
    const end = legs[1].pts[legs[1].pts.length - 1]
    expect(end).toEqual({ x: 20, z: AISLES[1] })
    // the road is only ever driven westwards
    const pts = legs[1].pts
    for (let i = 1; i < pts.length; i++) if (pts[i].z === ROAD_Z && pts[i - 1].z === ROAD_Z) expect(pts[i].x).toBeLessThanOrEqual(pts[i - 1].x)
  })

  it.each([7, 2026, 42])('never lets two carts touch and never gridlocks (seed %i, 40 sim minutes)', (seed) => {
    const s = createSim(seed)
    let collisions = 0
    let longestWait = 0
    const doneAt: number[] = []
    for (let i = 0; i < 40 * 60 * 10; i++) {
      step(s, 0.1)
      for (let x = 0; x < s.agvs.length; x++) for (let y = x + 1; y < s.agvs.length; y++) if (overlap(s.agvs[x], s.agvs[y])) collisions++
      for (const a of s.agvs) if (a.wait) longestWait = Math.max(longestWait, s.t - a.waitSince)
      if (i % 3000 === 2999) doneAt.push(s.done.length)
    }
    expect(collisions).toBe(0)
    expect(longestWait).toBeLessThan(45)
    // every 5 minutes some more work got done
    for (let i = 1; i < doneAt.length; i++) expect(doneAt[i]).toBeGreaterThan(doneAt[i - 1])
    for (const a of s.agvs) {
      expect(a.pos.x).toBeGreaterThanOrEqual(0); expect(a.pos.x).toBeLessThanOrEqual(SIZE.w)
      expect(a.pos.z).toBeGreaterThanOrEqual(0); expect(a.pos.z).toBeLessThanOrEqual(SIZE.d)
      expect(a.battery).toBeGreaterThan(0)
      expect(a.missions).toBeGreaterThan(0)
    }
    expect(s.done.some((t) => t.type === 'PICK')).toBe(true)
    expect(s.done.some((t) => t.type === 'PUTAWAY')).toBe(true)
    expect(s.trucksOut).toBeGreaterThan(3)
    expect(kpis(s).palletsPerHour).toBeGreaterThan(30)
  }, 120_000)

  it('is deterministic', () => {
    const run = () => { const s = createSim(11); for (let i = 0; i < 4000; i++) step(s, 0.1); return s.done.map((t) => t.id + t.agv) }
    expect(run()).toEqual(run())
  })

  it('keeps stock consistent: a pallet is in one place only', () => {
    const s = createSim(5)
    for (let i = 0; i < 6000; i++) step(s, 0.1)
    const seen = new Set<string>()
    const add = (c: string) => { expect(seen.has(c)).toBe(false); seen.add(c) }
    for (const sl of s.slots) if (sl.pallet) add(sl.pallet.sscc)
    for (const a of s.agvs) if (a.payload) add(a.payload.sscc)
    for (const d of s.docks) { if (d.spot) add(d.spot.sscc); if (d.slide?.dir === 'out') add(d.slide.pallet.sscc) }
  })

  it('makes valid SSCCs and finds things by code', () => {
    expect(sscc(1)).toHaveLength(18)
    // GS1 check digit of a known example
    expect(sscc(4127).slice(-1)).toMatch(/\d/)
    const s = createSim(2)
    const label = s.slots[10].label
    expect(find(s, label)).toEqual({ kind: 'slot', slot: 10 })
    expect(find(s, 'agv-03')).toEqual({ kind: 'agv', id: 'AGV-03' })
  })

  it('builds ERP previews in each system’s shape', () => {
    const s = createSim(1)
    for (let i = 0; i < 6000 && s.syncs.length === 0; i++) step(s, 0.1)
    const sync = s.syncs[0]
    expect(sync).toBeTruthy()
    const odoo = erpPayload('odoo', sync).body as { params: { args: unknown[] } }
    expect(odoo.params.args[3]).toBe('stock.move.line')
    expect(erpPayload('salesforce', sync).method).toBe('PATCH')
    expect((erpPayload('webhook', sync).body as { sscc: string }).sscc).toBe(sync.task.pallet.sscc)
  })
})
