import { describe, it, expect, afterAll, vi } from 'vitest'
import { configureSupply, createTracker, advance, stageOf, applyUpdates, milestones, landedCost, attention, positionOf, LANES, PLACES, DEMO_SETUP, type OrderRow } from './supply'
import { ordersFromCsv, suppliersFromCsv, updatesFromCsv, updatesFromJson, normaliseImportsConfig, ordersTemplateCsv } from './config'
import { lanesFor, DEFAULT_ROUTE } from './geo'
import { parseCsv } from '../../twin-builder/csv'

afterAll(() => { configureSupply(); vi.useRealTimers() })

const day = (d: string) => `2026-${d}`
const row = (o: Partial<OrderRow>): OrderRow => ({
  po: 'PO-1', supplier: 'weave', goods: 'Towels', hs: '6302 60', dutyPct: 12, units: 2000, unitPrice: 2, salePrice: 8,
  kgPerUnit: 0.4, cbmPerUnit: 0.0015, mode: 'sea', incoterm: 'FOB', ...o,
})

describe('import tracker with a user’s setup', () => {
  it('the default route is the demo’s, waypoint for waypoint', () => {
    const l = lanesFor(DEFAULT_ROUTE)
    expect(l.sea[0]).toEqual([22.57, 114.27]); expect(l.sea[l.sea.length - 1]).toEqual([39.44, -0.32]); expect(l.sea).toHaveLength(17)
    expect(l.air[l.air.length - 1]).toEqual([41.3, 2.08]); expect(l.rail[l.rail.length - 1]).toEqual([40.39, -3.69])
  })

  it('routes to another port and names it', () => {
    configureSupply({ route: { ...DEFAULT_ROUTE, originPort: 'shanghai', destPort: 'rotterdam' }, warehouse: { name: 'Venlo', at: [51.37, 6.17] }, orders: [row({})] })
    expect(LANES.sea[0]).toEqual([31.36, 121.6])
    expect(LANES.sea[LANES.sea.length - 1]).toEqual([51.95, 4.1])
    expect(PLACES.warehouse.name).toContain('Venlo')
    const t = createTracker(3)
    const ms = milestones(t, t.shipments[0])
    expect(ms.some((m) => /Shanghai/.test(m.label))).toBe(true)
    expect(ms.some((m) => /Rotterdam/.test(m.label))).toBe(true)
    expect(ms[ms.length - 1].label).toBe('Delivered to Venlo')
    expect(landedCost(t.shipments[0]).lines.some((l) => l.label === 'Last mile to Venlo')).toBe(true)
  })

  it('live: stages come from real dates, and nothing loops', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    configureSupply({
      live: true,
      orders: [
        row({ po: 'A', orderDate: day('09-01'), promisedDate: day('10-25'), qcDate: day('09-15'), shippedDate: day('09-20') }),
        row({ po: 'B', orderDate: day('10-10'), promisedDate: day('11-30') }),
        row({ po: 'C', orderDate: day('08-01'), promisedDate: day('09-20'), qcDate: day('08-10'), shippedDate: day('08-12'), arrivedDate: day('09-14'), clearedDate: day('09-16'), deliveredDate: day('09-18') }),
        row({ po: 'D', orderDate: day('08-01'), promisedDate: day('09-01'), qcDate: day('08-05') }),
      ],
    })
    const t = createTracker()
    expect(t.live).toBe(true)
    const by = (id: string) => t.shipments.find((s) => s.id === id)!
    expect(stageOf(t, by('A'))).toBe('mainLeg')
    expect(stageOf(t, by('B'))).toBe('production')
    expect(stageOf(t, by('C'))).toBe('delivered')
    // D passed QC in August and nobody said it shipped: it waits at origin, and is very late
    expect(stageOf(t, by('D'))).toBe('toOrigin')
    expect(attention(t).find((a) => a.po === 'D')?.level).toBe('alert')
    // a day later the clock is today, not a simulated hour
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    advance(t, 9999)
    expect(Math.round(t.h - (Date.parse('2026-10-21T12:00:00Z') - t.t0) / 3.6e6)).toBe(0)
    expect(stageOf(t, by('B'))).toBe('production')
    // the agent says D sailed yesterday, here
    const n = applyUpdates(t, [{ po: 'd', status: 'Sailed', at: day('10-20'), lat: 12, lng: 60, note: 'Loaded on MV Test' }])
    expect(n).toBe(1)
    expect(stageOf(t, by('D'))).toBe('mainLeg')
    expect(positionOf(t, by('D')).at).toEqual([12, 60])
    expect(t.events[0].text).toContain('Loaded on MV Test')
    expect(milestones(t, by('B')).some((m) => m.actual.startsWith('est.'))).toBe(true)
  })

  it('simulates a user’s own orders like the demo', () => {
    vi.useRealTimers()
    configureSupply({ orders: [row({ po: 'X1' }), row({ po: 'X2', mode: 'air', units: 300 }), row({ po: 'X3', mode: 'rail' })] })
    const t = createTracker(5)
    const seen = new Set<string>()
    for (let i = 0; i < 24 * 90; i++) { advance(t, 1); for (const s of t.shipments) seen.add(stageOf(t, s)) }
    expect(t.shipments.map((s) => s.id)).toEqual(['X1', 'X2', 'X3'])
    expect(seen.has('delivered')).toBe(true)
  })
  it('a saved and reloaded setup still runs the demo orders', () => {
    const c = normaliseImportsConfig(JSON.parse(JSON.stringify({ setup: DEMO_SETUP })))
    expect(c.setup.suppliers[0].products?.length).toBeGreaterThan(0)
    configureSupply({ ...c.setup, suppliers: c.setup.suppliers.map(({ products: _p, ...s }) => s) })
    expect(createTracker(21).shipments).toHaveLength(8)
  })
})


describe('spreadsheets', () => {
  it('reads orders with English or Spanish headers', () => {
    const csv = 'Pedido;Proveedor;Producto;Código HS;Arancel;Cantidad;Precio unitario;PVP;Peso kg;Volumen m3;Modo;Fecha pedido;Fecha prometida\nP-9;Weave;Toallas;6302 60;12;1500;2,1;7,5;0,4;0,0015;Avión;2026-10-01;2026-10-20\n;;;;;;;;;;;;\nmal;;;;;;;;;;;;'
    const { orders, skipped } = ordersFromCsv(parseCsv(csv))
    expect(orders).toHaveLength(1)
    expect(skipped).toBe(1)
    expect(orders[0]).toMatchObject({ po: 'P-9', supplier: 'Weave', units: 1500, unitPrice: 2.1, salePrice: 7.5, mode: 'air', orderDate: '2026-10-01', promisedDate: '2026-10-20' })
  })

  it('the template round-trips', () => {
    const { orders } = ordersFromCsv(parseCsv(ordersTemplateCsv()))
    expect(orders.map((o) => o.po)).toEqual(['PO-0001', 'PO-0002'])
    expect(orders[0].shippedDate).toBe('2026-09-25')
    expect(orders[1].incoterm).toBe('EXW')
  })

  it('reads suppliers and agent updates', () => {
    expect(suppliersFromCsv(parseCsv('name,city,lat,lng\nAcme Co,Shenzhen,22.5,114.1\nNo coords,X,,'))).toEqual([{ id: 's1', name: 'Acme Co', city: 'Shenzhen', at: [22.5, 114.1] }])
    const u = updatesFromCsv(parseCsv('po,status,date,note\nPO-1,shipped,2026-10-02,On board\nPO-2,???,,'))
    expect(u).toEqual([{ po: 'PO-1', status: 'shipped', at: '2026-10-02', lat: undefined, lng: undefined, note: 'On board' }])
    expect(updatesFromJson({ data: [{ order: 'PO-3', event: 'arrived', position: { lat: 39, lng: -0.3 } }] }, 'data')[0]).toMatchObject({ po: 'PO-3', lat: 39, lng: -0.3 })
  })

  it('a config from a file or a link cannot smuggle in anything odd', () => {
    const c = normaliseImportsConfig({ setup: { company: 'A'.repeat(500), route: { destPort: 'atlantis' }, costs: { vatPct: -4 }, suppliers: [{ name: 'S', at: [999, 0] }] }, feed: { url: 'javascript:alert(1)', enabled: true } })
    expect(c.setup.company).toHaveLength(80)
    expect(c.setup.route.destPort).toBe('valencia')
    expect(c.setup.costs.vatPct).toBe(0)
    expect(c.setup.suppliers).toEqual(DEMO_SETUP.suppliers)
    expect(c.feed.url).toBe('')
  })
})
