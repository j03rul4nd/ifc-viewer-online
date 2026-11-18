import { describe, it, expect } from 'vitest'
import { flattenProperties } from '../twin/flatten-props'
import { buildLegendLayer, forCapture, type LegendStrings, type LegendInput } from './legend-model'
import { paintLegend } from './legend-paint'
import { defaultLayerStyle, defaultGroupStyle, RAMPS, type LayerStyle } from './style-groups'

const str: LegendStrings = { rest: 'Rest', density: 'Density', less: 'less', more: 'more', count: 'Count', fn: (f) => f }

const rows = [
  ...Array.from({ length: 30 }, () => ({ state: 'ok', occupancy: 0.4 })),
  ...Array.from({ length: 5 }, () => ({ state: 'empty', occupancy: 0 })),
  ...Array.from({ length: 2 }, () => ({ state: 'weird' })),
].map((p) => flattenProperties(p))

const style: LayerStyle = {
  ...defaultLayerStyle('#999999'),
  groups: [
    { id: 'a', name: 'ok', match: 'all', filters: [{ field: 'state', op: 'eq', value: 'ok' }], style: { ...defaultGroupStyle('#5ce27a'), point: { ...defaultGroupStyle('#5ce27a').point, symbol: { kind: 'icon', icon: 'bike' } } }, visible: true },
    { id: 'b', name: 'empty', match: 'all', filters: [{ field: 'state', op: 'eq', value: 'empty' }], style: defaultGroupStyle('#f25c54'), visible: false },
    { id: 'c', name: 'never', match: 'all', filters: [{ field: 'state', op: 'eq', value: 'nope' }], style: defaultGroupStyle('#000000'), visible: true },
  ],
  aggregate: { ...defaultLayerStyle('#999').aggregate, kind: 'hexbin', field: 'occupancy', fn: 'mean', ramp: RAMPS.occupancy },
}

const input = (over: Partial<LegendInput> = {}): LegendInput => ({
  id: 'L', name: 'Bicing', live: true, style, rows, kinds: { point: 37, line: 0, polygon: 0 },
  aggregateOn: false, aggMin: null, aggMax: null, folded: false, ...over,
})

describe('legend model', () => {
  it('lists groups that hold features, with counts and swatches, plus the rest', () => {
    const l = buildLegendLayer(input(), str)
    expect(l.rows.map((r) => [r.name, r.count, r.visible])).toEqual([['ok', 30, true], ['empty', 5, false], ['Rest', 2, true]])
    expect(l.rows[0].swatch).toEqual({ kind: 'icon', icon: 'bike', color: '#5ce27a' })
    expect(l.scale).toBeNull()
    expect(l.aggregatesFar).toBe(true)
  })

  it('switches to the colour scale when the aggregate is on screen', () => {
    const l = buildLegendLayer(input({ aggregateOn: true, aggMin: 0, aggMax: 0.96 }), str)
    expect(l.scale).toMatchObject({ caption: 'occupancy · mean', lo: '0.00', hi: '0.96' })
    expect(l.aggregatesFar).toBe(false)
  })

  it('captures leave out hidden groups, empty layers and folded bodies', () => {
    const shown = forCapture([buildLegendLayer(input(), str), buildLegendLayer(input({ id: 'F', folded: true }), str)])
    expect(shown[0].rows.map((r) => r.name)).toEqual(['ok', 'Rest'])
    expect(shown[1].rows).toEqual([])
    expect(shown[1].folded).toBe(true)
  })

  it('caps long legends with a "+N" row', () => {
    const many: LayerStyle = {
      ...style,
      groups: Array.from({ length: 20 }, (_, i) => ({
        id: `g${i}`, name: `g${i}`, match: 'all' as const, filters: [], style: defaultGroupStyle('#fff'), visible: true,
      })),
    }
    // Empty filters match everything → only the first group holds features; use counts by giving each its own value.
    const r = Array.from({ length: 20 }, (_, i) => flattenProperties({ k: `v${i}` }))
    many.groups.forEach((g, i) => { g.filters = [{ field: 'k', op: 'eq', value: `v${i}` }] })
    const [l] = forCapture([buildLegendLayer(input({ style: many, rows: r }), str)], 12)
    expect(l.rows.length).toBe(12)
    expect(l.rows[11].name).toBe('+9')
    expect(l.rows[11].count).toBe(9)
  })
})

/** A 2D context that records where things were drawn. */
function fakeCtx() {
  const ops: string[] = []
  let tx = 0, ty = 0, k = 1
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, p: string) {
      if (p === 'measureText') return (s: string) => ({ width: s.length * 6 })
      if (p === 'createLinearGradient') return () => ({ addColorStop: () => {} })
      if (p === 'translate') return (x: number, y: number) => { tx = x; ty = y; ops.push(`translate ${x} ${y}`) }
      if (p === 'scale') return (a: number) => { k = a; ops.push(`scale ${a}`) }
      return () => {}
    },
    set() { return true },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, at: () => ({ tx, ty, k }) }
}

describe('legend paint', () => {
  const layers = forCapture([buildLegendLayer(input(), str)])

  it('draws the card bottom-left at the capture pixel scale', () => {
    const f = fakeCtx()
    expect(paintLegend(f.ctx, 2400, 1600, 2, layers, 'Legend')).toBe(true)
    const { tx, ty, k } = f.at()
    expect(k).toBe(2)
    expect(tx).toBe(32)                 // 16 CSS px margin × 2
    expect(ty).toBeGreaterThan(1000)    // anchored to the bottom
  })

  it('shrinks to fit a small GIF frame instead of overflowing it', () => {
    const f = fakeCtx()
    paintLegend(f.ctx, 320, 120, 1, layers, 'Legend')
    const { ty, k } = f.at()
    expect(k).toBeLessThan(1)
    expect(ty).toBeGreaterThanOrEqual(16 - 1e-9)
  })

  it('paints nothing when there is nothing to explain', () => {
    expect(paintLegend(fakeCtx().ctx, 800, 600, 1, [], 'Legend')).toBe(false)
  })
})

describe('legend extras', () => {
  it('live layers carry the source time of their data', () => {
    const at = Date.parse('2026-10-08T10:42:00Z')
    const l = buildLegendLayer(input({ dataAt: at }), { ...str, asOf: (ms) => `data ${new Date(ms).toISOString().slice(11, 16)}` })
    expect(l.asOf).toBe('data 10:42')
    expect(buildLegendLayer(input({ live: false, dataAt: at }), { ...str, asOf: () => 'x' }).asOf).toBeNull()
  })

  it('paints the footer only when an extra is on, and keeps the bar at screen length', () => {
    const layers = forCapture([buildLegendLayer(input(), str)])
    const a = fakeCtx(), b = fakeCtx()
    paintLegend(a.ctx, 2400, 1600, 2, layers, 'Legend', null)
    paintLegend(b.ctx, 2400, 1600, 2, layers, 'Legend', { northRad: 0.5, scale: { metres: 100, px: 69, label: '100 m' } })
    // The footer makes the card taller: its top sits higher.
    expect(b.at().ty).toBeLessThan(a.at().ty)
  })
})

describe('legend corner', () => {
  const layers = forCapture([buildLegendLayer(input(), str)])
  it('anchors the card to the chosen corner of the frame', () => {
    const at = (corner: 'bl' | 'br' | 'tl' | 'tr') => { const f = fakeCtx(); paintLegend(f.ctx, 2000, 1200, 1, layers, 'L', null, corner); return f.at() }
    expect(at('tl')).toMatchObject({ tx: 16, ty: 16 })
    expect(at('tr').tx).toBe(2000 - 16 - 224)
    expect(at('br').ty).toBe(at('bl').ty)
    expect(at('bl').ty).toBeGreaterThan(600)
  })
})
