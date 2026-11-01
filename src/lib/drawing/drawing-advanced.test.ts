import { describe, expect, it } from 'vitest'
import { BEYOND_LAYER, buildCut, POCHE_LAYER, projectBeyond } from './plan-cut'
import { rasterBand, SCAN_LAYERS, SegmentIndex, sliceScan } from './scan-slice'
import { DIFF_LAYERS, diffSheets } from './diff'
import { PDF_LINES, PDF_TEXT, readOperators, vectorsToEntities, type Matrix, type PdfOps } from './pdf-vectors'
import { runJob } from './drawing.worker'
import { IDENTITY, type Entity, type Layer } from './types'

/** A closed box as triangles (Y up), from (0,0,0) to (w,h,d). */
function box(w: number, h: number, d: number, y0 = 0): Float32Array {
  const v = (x: number, y: number, z: number) => [x * w, y0 + y * h, z * d]
  const q = (a: number[], b: number[], c: number[], e: number[]) => [...a, ...b, ...c, ...a, ...c, ...e]
  const p = [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0), v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)]
  return new Float32Array([
    ...q(p[0], p[1], p[2], p[3]), ...q(p[5], p[4], p[7], p[6]), ...q(p[4], p[0], p[3], p[7]),
    ...q(p[1], p[5], p[6], p[2]), ...q(p[3], p[2], p[6], p[7]), ...q(p[4], p[5], p[1], p[0]),
  ])
}

describe('projection beyond the cut', () => {
  it('keeps the object\'s edges, not the tessellation\'s', () => {
    const out: number[] = []
    // A flat slab below the plan: 4 outline edges in plan; its diagonals are coplanar.
    projectBeyond(box(4, 0.2, 2), { kind: 'plan', y: 1 }, 3, out)
    const lengths = new Set<number>()
    for (let i = 0; i < out.length; i += 4) lengths.add(Math.round(Math.hypot(out[i + 2] - out[i], out[i + 3] - out[i + 1]) * 100) / 100)
    expect([...lengths].sort((a, b) => a - b)).toEqual([2, 4])
  })

  it('ignores what lies above the plane or past the depth', () => {
    const out: number[] = []
    projectBeyond(box(4, 0.2, 2, 5), { kind: 'plan', y: 1 }, 3, out)
    projectBeyond(box(4, 0.2, 2, -9), { kind: 'plan', y: 1 }, 3, out)
    expect(out).toEqual([])
  })

  it('layers the cut over what is beyond, and fills structure only', () => {
    const soups: [string, Float32Array[]][] = [['IFCWALL', [box(4, 3, 0.2)]], ['IFCDOOR', [box(1, 3, 0.1)]], ['IFCSLAB', [box(4, 0.2, 4)]]]
    const r = buildCut(soups, { kind: 'plan', y: 1.2 }, { beyond: 2, poche: true })
    const names = r.layers.map((l) => l.name)
    expect(names.indexOf(BEYOND_LAYER)).toBeLessThan(names.indexOf('IFCWALL'))
    const fills = r.entities.filter((e) => e.kind === 'fill')
    expect(fills.length).toBe(1)
    expect(fills[0].layer).toBe(POCHE_LAYER)
    expect(r.entities.some((e) => e.layer === BEYOND_LAYER)).toBe(true)
  })

  it('stays the plain cut without options', () => {
    const r = buildCut([['IFCWALL', [box(4, 3, 0.2)]]], { kind: 'plan', y: 1.2 })
    expect(r.layers.map((l) => l.name)).toEqual(['IFCWALL'])
  })
})

describe('scan slice', () => {
  // A wall of points at scene z = 0 (drawing y = 0), x 0–10, heights 0–3.
  const wall = (offset = 0) => {
    const p: number[] = []
    for (let x = 0; x < 10; x += 0.01) for (let y = 0; y < 3; y += 0.2) p.push(x, y, -offset)
    return new Float32Array(p)
  }
  const options = { plane: { kind: 'plan', y: 1.2 } as const, thickness: 0.3, cell: 0.05, tolerance: 0.03 }

  it('keeps only the band, and costs a grid rather than a point each', () => {
    const { inBand, cells } = rasterBand(wall(), options)
    expect(inBand).toBeGreaterThan(0)
    expect(inBand).toBeLessThan(wall().length / 3)
    expect(cells.size).toBe(1)
    const r = sliceScan(wall(), null, options)
    expect(r.layers.map((l) => l.name)).toEqual([SCAN_LAYERS.plain])
    expect(r.entities.length).toBe(1)
    const line = r.entities[0] as Extract<Entity, { kind: 'line' }>
    expect(Math.abs(line.b.x - line.a.x - 10)).toBeLessThanOrEqual(0.051)
  })

  it('classifies against the model by real distance', () => {
    const ref = [[{ x: 0, y: 0.025 }, { x: 10, y: 0.025 }]]
    expect(sliceScan(wall(), ref, options).report.differs).toBe(0)
    const near = sliceScan(wall(0.06), ref, options).report // ~5–6 cm off
    expect(near.check).toBeGreaterThan(0)
    expect(near.matches).toBe(0)
    const far = sliceScan(wall(1), ref, options)
    expect(far.report.differs).toBe(far.report.cells)
    expect(far.layers.map((l) => l.name)).toEqual([SCAN_LAYERS.differs])
  })

  it('finds the nearest segment across grid cells', () => {
    const idx = new SegmentIndex(1)
    idx.add({ x: 0, y: 0 }, { x: 5, y: 0 })
    expect(idx.distance(2.5, 0.4)).toBeCloseTo(0.4)
    expect(idx.distance(2.5, 9)).toBe(Infinity)
  })

  it('stays small on a big cloud', () => {
    const p = new Float32Array(3_000_000)
    for (let i = 0; i < p.length; i += 3) { p[i] = Math.random() * 100; p[i + 1] = 1.2; p[i + 2] = -Math.random() * 100 }
    const started = performance.now()
    const r = sliceScan(p, null, { ...options, cell: 0.5 })
    expect(r.entities.length).toBeLessThan(1000)
    expect(performance.now() - started).toBeLessThan(4000)
  })
})

describe('sheet compare', () => {
  const layers: Layer[] = [{ name: '0', color: '#fff', visible: true, locked: false }]
  const line = (id: number, x: number): Entity => ({ id, kind: 'line', layer: '0', color: null, a: { x, y: 0 }, b: { x: x + 1, y: 0 } })

  it('reads a revision as what changed', () => {
    const d = diffSheets(
      { layers, placement: IDENTITY, entities: [line(1, 0), line(2, 5)] },
      { layers, placement: IDENTITY, entities: [line(1, 0), line(3, 9)] },
    )
    expect([d.added, d.removed, d.same]).toEqual([1, 1, 1])
    expect(d.entities.filter((e) => e.layer === DIFF_LAYERS.added)).toHaveLength(1)
  })

  it('sees no change across units or broken polylines', () => {
    const mm: Entity = { id: 1, kind: 'polyline', layer: '0', color: null, closed: false, points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }] }
    const m: Entity[] = [
      { id: 2, kind: 'line', layer: '0', color: null, a: { x: 1, y: 0 }, b: { x: 0, y: 0 } },
      { id: 3, kind: 'line', layer: '0', color: null, a: { x: 1, y: 0 }, b: { x: 2, y: 0 } },
    ]
    const d = diffSheets({ layers, placement: { ...IDENTITY, scale: 0.001 }, entities: [mm] }, { layers, placement: IDENTITY, entities: m })
    expect([d.added, d.removed, d.same]).toEqual([0, 0, 2])
  })

  it('skips layers that are switched off', () => {
    const off: Layer[] = [{ ...layers[0], visible: false }]
    const d = diffSheets({ layers: off, placement: IDENTITY, entities: [line(1, 0)] }, { layers, placement: IDENTITY, entities: [] })
    expect(d.removed).toBe(0)
  })
})

describe('PDF vectors', () => {
  const ops: PdfOps = {
    save: 1, restore: 2, transform: 3, constructPath: 4, moveTo: 5, lineTo: 6, curveTo: 7, curveTo2: 8, curveTo3: 9, closePath: 10, rectangle: 11,
    stroke: 12, closeStroke: 13, fill: 14, eoFill: 15, fillStroke: 16, eoFillStroke: 17, closeFillStroke: 18, closeEOFillStroke: 19, endPath: 20,
  }
  const I: Matrix = [1, 0, 0, 1, 0, 0]

  it('applies the transform stack and drops unpainted paths', () => {
    const r = readOperators(
      [ops.save, ops.transform, ops.constructPath, ops.stroke, ops.restore, ops.constructPath, ops.endPath, ops.constructPath, ops.fill],
      [
        null, [2, 0, 0, 2, 10, 10], [[ops.moveTo, ops.lineTo], [0, 0, 5, 0]], null, null,
        [[ops.moveTo, ops.lineTo], [9, 9, 8, 8]], null,
        [[ops.rectangle], [1, 1, 2, 2]], null,
      ],
      ops, I,
    )
    expect(r.polylines).toHaveLength(2)
    expect(r.polylines[0].points).toEqual([{ x: 10, y: 10 }, { x: 20, y: 10 }])
    expect(r.polylines[1].closed).toBe(true)
    expect(r.polylines[1].points[2]).toEqual({ x: 3, y: 3 })
  })

  it('flattens curves to their end point', () => {
    const r = readOperators([ops.constructPath, ops.stroke], [[[ops.moveTo, ops.curveTo], [0, 0, 0, 1, 1, 1, 1, 0]], null], ops, I)
    const last = r.polylines[0].points[r.polylines[0].points.length - 1]
    expect(last.x).toBeCloseTo(1); expect(last.y).toBeCloseTo(0)
    expect(r.polylines[0].points.length).toBe(7)
  })

  it('brings lines and text in switched off and locked, and says when there are none', () => {
    const v = vectorsToEntities([{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false }], [{ str: 'A-101', transform: [12, 0, 0, 12, 5, 6] }, { str: ' ', transform: I }], I, false)
    expect(v.layers.map((l) => [l.name, l.visible, l.locked])).toEqual([[PDF_LINES, false, true], [PDF_TEXT, false, true]])
    expect(v.texts).toBe(1)
    const text = v.entities.find((e) => e.kind === 'text') as Extract<Entity, { kind: 'text' }>
    expect(text.height).toBe(12); expect(text.at).toEqual({ x: 5, y: 6 })
    expect(vectorsToEntities([], [], I, false).layers).toEqual([])
  })
})

describe('worker jobs', () => {
  it('runs the same code a worker would', () => {
    const r = runJob({ kind: 'cut', soups: [['IFCWALL', [box(4, 3, 0.2)]]], plane: { kind: 'plan', y: 1 }, options: {} }) as ReturnType<typeof buildCut>
    expect(r.entities.length).toBeGreaterThan(0)
  })
})
