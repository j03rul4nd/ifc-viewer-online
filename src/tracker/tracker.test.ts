import { describe, expect, it } from 'vitest'
import { DEFAULTS, decodeConfig, encodeConfig, normalizeConfig, normalizeShipment, normalizeShipments, parseCsv, resolveState, safeColor, safeUrl } from './config'
import { LANGS, words } from './i18n'
import { LAND } from './land-data'
import { angle, densify, EDGES, HUB_IDS, SEA, measure, pointAt, progressOf, resolvePlace, routeFor, SEA_HUB_IDS } from './routes'

const rings = LAND.split(';').map(r => {
  const n = r.split(' '); let x = 0, y = 0; const out: [number, number][] = []
  for (let i = 0; i < n.length; i += 2) { x += +n[i]; y += +n[i + 1]; out.push([x / 10, y / 10]) }
  return out
})
function onLand(lat: number, lng: number): boolean {
  let inside = false
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

describe('tracking globe config', () => {
  it('round-trips through the embed encoding, unicode included', () => {
    const c = normalizeConfig({ title: '上海 → Valencia', shipments: [{ id: 'A1', from: 'shanghai', to: 'valencia' }], theme: { accent: '#ff0066' } })
    expect(decodeConfig(encodeConfig(c))).toEqual(c)
  })
  it('keeps the default config out of the embed', () => {
    expect(encodeConfig(normalizeConfig({}))).toBe(btoa('{}').replace(/=+$/, ''))
  })
  it('falls back to defaults on a broken string', () => {
    expect(decodeConfig('%%%not-base64').view).toBe(DEFAULTS.view)
  })
  it('refuses anything that could inject CSS or a script URL', () => {
    expect(safeColor('red;}body{display:none')).toBeUndefined()
    expect(safeColor('url(https://evil)')).toBeUndefined()
    expect(safeColor('#5E6AD2')).toBe('#5E6AD2')
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('http://example.com/feed')).toBeUndefined()
    expect(safeUrl('https://example.com/feed')).toBe('https://example.com/feed')
    const c = normalizeConfig({ logo: 'javascript:x', feed: 'data:text/html,x', theme: { font: 'x;}</style><script>' } })
    expect(c.logo).toBeUndefined(); expect(c.feed).toBeUndefined(); expect(c.theme.font).toBeUndefined()
  })
  it('clamps the feed interval so visitors cannot hammer an endpoint', () => {
    expect(normalizeConfig({ feedInterval: 1 }).feedInterval).toBe(30)
  })
  it('reads the field names carriers and spreadsheets use', () => {
    const s = normalizeShipment({ tracking_number: 'MSKU1', origin: 'Shanghai', destination: [39.4, -0.3], transport: 'Ocean', status: 'In Transit', latitude: 12, longitude: 45, progress: 40 })!
    expect(s).toMatchObject({ id: 'MSKU1', mode: 'sea', status: 'transit', position: [12, 45], progress: .4 })
    expect(normalizeShipment({ id: 'x' })).toBeNull()
  })
  it('caps a feed at 200 shipments', () => {
    expect(normalizeShipments(Array.from({ length: 500 }, () => ({ from: 'hkg', to: 'bcn' }))).length).toBe(200)
  })
  it('parses a semicolon spreadsheet with quotes and a BOM', () => {
    const r = parseCsv('﻿id;from;to;mode;label\nPO-1;shanghai;rotterdam;sea;"Pumps; spare"\nPO-2;hkg;fra;air;Valves\n')
    expect(r.map(s => s.id)).toEqual(['PO-1', 'PO-2']); expect(r[0].label).toBe('Pumps; spare'); expect(r[1].mode).toBe('air')
  })
  it('derives state from dates, and past-ETA is late, not delivered', () => {
    const now = Date.parse('2026-06-15')
    const base = { id: 'x', from: 'hkg', to: 'bcn', mode: 'air' as const }
    expect(resolveState({ ...base, etd: '2026-06-01', eta: '2026-06-29' }, now)).toEqual({ progress: .5, status: 'transit' })
    expect(resolveState({ ...base, etd: '2026-06-20', eta: '2026-06-29' }, now).status).toBe('pending')
    expect(resolveState({ ...base, etd: '2026-05-01', eta: '2026-06-01' }, now).status).toBe('delayed')
    expect(resolveState({ ...base, etd: '2026-05-01', eta: '2026-06-01', status: 'delivered' }, now)).toEqual({ progress: 1, status: 'delivered' })
  })
})

describe('tracking globe routes', () => {
  it('has the words in all ten languages', () => {
    expect(LANGS).toHaveLength(10)
    const en = Object.keys(words('en'))
    for (const l of LANGS) { const w = words(l); for (const k of en) expect(w[k as keyof typeof w], `${l}.${k}`).toBeTruthy() }
  })
  it('resolves hubs by id or name, and leaves the unknown unresolved', () => {
    expect(resolvePlace('Shanghai')?.at).toEqual(resolvePlace('shanghai')?.at)
    expect(resolvePlace('HKG')?.name).toBe('HKG')
    expect(resolvePlace('Atlantis')).toBeNull()
    expect(resolvePlace({ lat: 1, lng: 2, name: 'Depot' })?.name).toBe('Depot')
  })
  it('ships Shanghai to Valencia through Malacca and Suez', () => {
    const r = routeFor(resolvePlace('shanghai')!, resolvePlace('valencia')!, 'sea')
    const near = (la: number, lo: number) => r.some(p => angle(p, [la, lo]) < 3 * Math.PI / 180)
    expect(near(29.7, 32.57)).toBe(true); expect(near(1.15, 104.1)).toBe(true)
  })
  it('crosses the Pacific instead of going round the world', () => {
    const m = measure(routeFor(resolvePlace('shanghai')!, resolvePlace('losangeles')!, 'sea'))
    expect(m.total).toBeLessThan(2 * Math.PI * .35)
  })
  it('keeps every sea lane in open water', () => {
    const run = (a: [number, number], b: [number, number]) => {
      let r = 0, worst = 0
      for (const p of densify([a, b], .5)) { if (onLand(p[0], p[1])) { r++; worst = Math.max(worst, r) } else r = 0 }
      return worst
    }
    // 0.5° steps. Two is the Suez and Panama canals, and straits the coarse coastline closes.
    const bad = EDGES.filter(([a, b]) => run(SEA[a], SEA[b]) > 2).map(e => e.join('-'))
    // A port is on the coast and may sit up an estuary: up to 3° of land on its last leg.
    for (const id of SEA_HUB_IDS) { const h = resolvePlace(id)!; if (run(h.at, SEA[h.sea!]) > 6) bad.push(id) }
    expect(bad).toEqual([])
  })
  it('walks a route and finds a reported position on it', () => {
    const m = measure(routeFor(resolvePlace('hkg')!, resolvePlace('fra')!, 'air'))
    const mid = pointAt(m, .5).at
    expect(progressOf(m, mid)).toBeCloseTo(.5, 1)
    expect(HUB_IDS.length).toBeGreaterThan(30)
  })
})
