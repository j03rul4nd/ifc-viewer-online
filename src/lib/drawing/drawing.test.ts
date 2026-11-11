import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createDrawingOverlay } from './overlay-3d'
import { aciToHex, dwgVersion, expandBulges, parseDxf, plainText, DxfError, decodeDxf } from './dxf-parse'
import { drawingToDxf, drawingToPdf, drawingToSvg, inkFor, layoutSheet, nearestAci, pdfLiteral } from './export'
import { buildCut, categoryLayer, chainSegments, sliceTriangles, SKIP_CATEGORIES } from './plan-cut'
import { drawingBounds, IDENTITY, placementFromPairs, robustBounds, toDrawing, toModel, type Entity, type Layer, type NewEntity } from './types'
import { initialPlacement } from '../../stores/drawingStore'
import { hitEntity, moved } from '../../components/drawings/DrawingCanvas'

const dxf = (...lines: (string | number)[]) => lines.join('\n') + '\n'
const SECTION = (name: string, ...body: (string | number)[]) => [0, 'SECTION', 2, name, ...body, 0, 'ENDSEC']
const file = (entities: (string | number)[], extra: (string | number)[] = []) =>
  dxf(...extra, ...SECTION('ENTITIES', ...entities), 0, 'EOF')
const only = <K extends Entity['kind']>(r: { entities: NewEntity[] }, kind: K) =>
  r.entities.filter((e) => e.kind === kind) as Extract<NewEntity, { kind: K }>[]

describe('parseDxf', () => {
  it('reads lines, circles and arcs with their layer colours', () => {
    const r = parseDxf(dxf(
      ...SECTION('TABLES', 0, 'TABLE', 2, 'LAYER', 0, 'LAYER', 2, 'WALLS', 70, 0, 62, 1, 0, 'ENDTAB'),
      ...SECTION('ENTITIES',
        0, 'LINE', 8, 'WALLS', 10, 0, 20, 0, 11, 3, 21, 4,
        0, 'CIRCLE', 8, 'WALLS', 62, 3, 10, 1, 20, 1, 40, 2,
        0, 'ARC', 8, 'NEW', 10, 0, 20, 0, 40, 1, 50, 0, 51, 90),
      0, 'EOF',
    ))
    expect(r.layers.find((l) => l.name === 'WALLS')?.color).toBe('#ff0000')
    expect(r.layers.some((l) => l.name === 'NEW')).toBe(true)
    expect(only(r, 'line')[0].b).toEqual({ x: 3, y: 4 })
    expect(only(r, 'circle')[0].color).toBe('#00ff00')
    expect(only(r, 'arc')[0].end).toBeCloseTo(Math.PI / 2)
  })

  it('handles CRLF and reads $INSUNITS', () => {
    const text = file([0, 'POINT', 8, '0', 10, 1, 20, 2], [...SECTION('HEADER', 9, '$INSUNITS', 70, 4)]).replace(/\n/g, '\r\n')
    const r = parseDxf(text)
    expect(r.metresPerUnit).toBe(0.001)
    expect(only(r, 'point')[0].at).toEqual({ x: 1, y: 2 })
  })

  it('expands LWPOLYLINE bulges through the arc they describe', () => {
    const r = parseDxf(file([0, 'LWPOLYLINE', 8, '0', 90, 2, 70, 0, 10, 0, 20, 0, 42, 1, 10, 2, 20, 0]))
    const pts = only(r, 'polyline')[0].points
    expect(pts.length).toBeGreaterThan(2)
    // Bulge 1 is a half circle of radius 1 around (1, 0): every point stays on it.
    for (const p of pts) expect(Math.hypot(p.x - 1, p.y)).toBeCloseTo(1, 6)
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(-1, 1)
  })

  it('reads old-style POLYLINE and its vertices', () => {
    const r = parseDxf(file([
      0, 'POLYLINE', 8, 'A', 66, 1, 70, 1,
      0, 'VERTEX', 8, 'A', 10, 0, 20, 0, 0, 'VERTEX', 8, 'A', 10, 1, 20, 0, 0, 'VERTEX', 8, 'A', 10, 1, 20, 1,
      0, 'SEQEND', 8, 'A',
      0, 'LINE', 8, 'A', 10, 5, 20, 5, 11, 6, 21, 6,
    ]))
    expect(only(r, 'polyline')[0].closed).toBe(true)
    expect(only(r, 'polyline')[0].points).toHaveLength(3)
    expect(only(r, 'line')).toHaveLength(1)
  })

  it('expands INSERT with scale, rotation and base point; layer 0 follows the insert', () => {
    const r = parseDxf(dxf(
      ...SECTION('BLOCKS', 0, 'BLOCK', 2, 'B', 8, '0', 10, 1, 20, 0, 0, 'LINE', 8, '0', 10, 1, 20, 0, 11, 2, 21, 0, 0, 'ENDBLK'),
      ...SECTION('ENTITIES', 0, 'INSERT', 8, 'FURN', 2, 'B', 10, 10, 20, 10, 41, 2, 42, 2, 50, 90),
      0, 'EOF',
    ))
    const line = only(r, 'line')[0]
    expect(line.layer).toBe('FURN')
    expect(line.a.x).toBeCloseTo(10); expect(line.a.y).toBeCloseTo(10)
    expect(line.b.x).toBeCloseTo(10); expect(line.b.y).toBeCloseTo(12)
  })

  it('survives a block that inserts itself', () => {
    const r = parseDxf(dxf(
      ...SECTION('BLOCKS', 0, 'BLOCK', 2, 'B', 0, 'INSERT', 2, 'B', 10, 0, 20, 0, 0, 'POINT', 8, '0', 10, 0, 20, 0, 0, 'ENDBLK'),
      ...SECTION('ENTITIES', 0, 'INSERT', 2, 'B', 10, 0, 20, 0),
      0, 'EOF',
    ))
    expect(only(r, 'point')).toHaveLength(1)
  })

  it('ignores paper space while model space has content; frozen layers arrive off, not lost', () => {
    const r = parseDxf(dxf(
      ...SECTION('TABLES', 0, 'LAYER', 2, 'F', 70, 1, 62, 7),
      ...SECTION('ENTITIES',
        0, 'POINT', 8, '0', 10, 1, 20, 1,
        0, 'POINT', 8, '0', 67, 1, 10, 9, 20, 9,
        0, 'POINT', 8, 'F', 10, 8, 20, 8),
      0, 'EOF',
    ))
    expect(only(r, 'point').map((e) => e.at.x)).toEqual([1, 8])
    expect(r.layers.find((l) => l.name === 'F')?.visible).toBe(false)
  })

  it('reads a solid HATCH as a fill and a pattern HATCH as its outline', () => {
    const loop = (solid: number) => [0, 'HATCH', 8, 'H', 70, solid, 91, 1, 92, 2, 72, 0, 73, 1, 93, 3, 10, 0, 20, 0, 10, 1, 20, 0, 10, 1, 20, 1, 97, 0]
    const r = parseDxf(file([...loop(1), ...loop(0)]))
    expect(only(r, 'fill')[0].points).toHaveLength(3)
    expect(only(r, 'polyline')[0].closed).toBe(true)
  })

  it('counts what it cannot read instead of dropping it silently', () => {
    expect(parseDxf(file([0, '3DSOLID', 8, '0', 0, '3DSOLID', 8, '0'])).skipped['3DSOLID']).toBe(2)
  })

  it('cleans MTEXT codes', () => {
    expect(plainText('{\\fArial|b0;Planta}\\Pbaja %%c50 \\U+00B0')).toBe('Planta\nbaja Ø50 °')
    const r = parseDxf(file([0, 'MTEXT', 8, '0', 10, 0, 20, 0, 40, 1, 1, 'A\\PB']))
    expect(only(r, 'text').map((e) => e.text)).toEqual(['A', 'B'])
  })

  it('refuses binary DXF and non-DXF by name', () => {
    expect(() => decodeDxf(new TextEncoder().encode('AutoCAD Binary DXF\r\n'))).toThrow(DxfError)
    expect(() => parseDxf('hello world')).toThrow(DxfError)
  })

  it('names a DWG version', () => {
    expect(dwgVersion(new TextEncoder().encode('AC1032xxx'))).toBe('2018')
    expect(dwgVersion(new TextEncoder().encode('%PDF-1.7'))).toBeNull()
  })

  it('maps ACI colours', () => {
    expect(aciToHex(1)).toBe('#ff0000')
    expect(aciToHex(250)).toBe('#333333')
    expect(aciToHex(10)).toBe('#ff0000')
  })

  it('expandBulges keeps straight runs untouched', () => {
    expect(expandBulges([{ p: { x: 0, y: 0 }, bulge: 0 }, { p: { x: 1, y: 0 }, bulge: 0 }], false)).toHaveLength(2)
  })
})

describe('placement', () => {
  it('two point pairs give scale, rotation and translation', () => {
    const p = placementFromPairs({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 25 })!
    expect(p.scale).toBeCloseTo(2)
    expect(p.rotation).toBeCloseTo(Math.PI / 2)
    const q = toModel(p, { x: 10, y: 0 })
    expect(q.x).toBeCloseTo(5); expect(q.y).toBeCloseTo(25)
    const back = toDrawing(p, q)
    expect(back.x).toBeCloseTo(10); expect(back.y).toBeCloseTo(0)
  })

  it('refuses coincident points', () => {
    expect(placementFromPairs({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull()
  })

  it('robust bounds ignore a stray entity far away', () => {
    const entities: Entity[] = []
    for (let i = 0; i < 100; i++) entities.push({ id: i, kind: 'point', layer: '0', color: null, at: { x: i, y: i } })
    entities.push({ id: 999, kind: 'point', layer: '0', color: null, at: { x: 1e7, y: 1e7 } })
    expect(drawingBounds({ entities })!.maxX).toBe(1e7)
    expect(robustBounds({ entities })!.maxX).toBeLessThan(1000)
  })

  it('a new sheet lands on the reference, at the scale its units state', () => {
    const entities: NewEntity[] = [{ kind: 'line', layer: '0', color: null, a: { x: 5000, y: 5000 }, b: { x: 7000, y: 5000 } }]
    const ref = {
      id: 'r', name: 'r', source: 'plan', layers: [], skipped: {}, metresPerUnit: 1, visible: true, in3d: false, elevation: 0, placement: IDENTITY,
      entities: [{ id: 1, kind: 'line', layer: '0', color: null, a: { x: -1, y: 0 }, b: { x: 1, y: 0 } }],
    } as Parameters<typeof initialPlacement>[1][number]
    const p = initialPlacement({ entities, metresPerUnit: 0.001 }, [ref])
    expect(p.scale).toBe(0.001)
    const mid = toModel(p, { x: 6000, y: 5000 })
    expect(mid.x).toBeCloseTo(0); expect(mid.y).toBeCloseTo(0)
  })
})

describe('plan cut', () => {
  // A 2 × 2 × 3 m column, y up, as two triangles per side wall.
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...b, ...c, ...a, ...c, ...d]
  const box = new Float32Array([
    ...quad([0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0]),
    ...quad([2, 0, 0], [2, 0, 2], [2, 3, 2], [2, 3, 0]),
    ...quad([2, 0, 2], [0, 0, 2], [0, 3, 2], [2, 3, 2]),
    ...quad([0, 0, 2], [0, 0, 0], [0, 3, 0], [0, 3, 2]),
  ])

  it('slices to segments in IFC XY', () => {
    const seg: number[] = []
    sliceTriangles(box, { kind: 'plan', y: 1.2 }, seg)
    expect(seg.length).toBeGreaterThan(0)
    for (let i = 1; i < seg.length; i += 2) expect(seg[i]).toBeLessThanOrEqual(1e-6) // y = −z ≤ 0
  })

  it('chains them into one closed outline without collinear points', () => {
    const seg: number[] = []
    sliceTriangles(box, { kind: 'plan', y: 1.2 }, seg)
    const chains = chainSegments(seg)
    expect(chains).toHaveLength(1)
    expect(chains[0].closed).toBe(true)
    expect(chains[0].points).toHaveLength(4)
  })

  it('a plane exactly on a vertex still closes', () => {
    const seg: number[] = []
    sliceTriangles(box, { kind: 'plan', y: 3 }, seg)
    expect(chainSegments(seg).every((c) => c.points.length >= 2)).toBe(true)
  })

  it('sections look along an axis', () => {
    const r = buildCut([['IFCCOLUMN', [box]]], { kind: 'sectionX', x: 1 })
    expect(r.entities.length).toBeGreaterThan(0)
    const pts = (r.entities[0] as Extract<NewEntity, { kind: 'polyline' }>).points
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(3)
  })

  it('one layer per IFC class, standard-case variants merged', () => {
    expect(categoryLayer('IFCWALLSTANDARDCASE')).toBe('IFCWALL')
    const r = buildCut([['IFCWALL', [box]], ['IFCWALLSTANDARDCASE', [box]]], { kind: 'plan', y: 1 })
    expect(r.layers.map((l) => l.name)).toEqual(['IFCWALL'])
    expect(r.entities).toHaveLength(2)
  })

  it('never cuts spaces and voids', () => {
    expect(SKIP_CATEGORIES.test('IFCSPACE')).toBe(true)
    expect(SKIP_CATEGORIES.test('IFCOPENINGELEMENT')).toBe(true)
    expect(SKIP_CATEGORIES.test('IFCWALL')).toBe(false)
  })
})

describe('exports', () => {
  const layers: Layer[] = [
    { name: 'A WALL', color: '#ff0000', visible: true, locked: false },
    { name: 'HIDDEN', color: '#00ff00', visible: false, locked: false },
  ]
  const entities: Entity[] = [
    { id: 1, kind: 'line', layer: 'A WALL', color: null, a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
    { id: 2, kind: 'polyline', layer: 'A WALL', color: '#0000ff', closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] },
    { id: 3, kind: 'circle', layer: 'A WALL', color: null, c: { x: 1, y: 1 }, r: 1 },
    { id: 4, kind: 'arc', layer: 'A WALL', color: null, c: { x: 2, y: 2 }, r: 1, start: 0, end: Math.PI / 2 },
    { id: 5, kind: 'text', layer: 'A WALL', color: null, at: { x: 3, y: 3 }, height: 0.5, rotation: 0, text: 'Sala & <1>', align: 'center' },
    { id: 6, kind: 'fill', layer: 'A WALL', color: null, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
    { id: 7, kind: 'point', layer: 'A WALL', color: null, at: { x: 9, y: 9 } },
    { id: 8, kind: 'line', layer: 'HIDDEN', color: null, a: { x: 100, y: 0 }, b: { x: 200, y: 0 } },
  ]
  const d = { layers, entities, metresPerUnit: 1 as number | null }
  const sheet = { paper: 'A3' as const, title: 'Planta', project: 'Obra', author: 'JB', date: '2026-11-01' }

  it('DXF round-trips through our own reader', () => {
    const r = parseDxf(drawingToDxf(d))
    expect(r.metresPerUnit).toBe(1)
    expect(only(r, 'line')).toHaveLength(1) // the hidden layer stays out
    expect(only(r, 'line')[0].layer).toBe('A_WALL')
    expect(only(r, 'circle')[0].r).toBe(1)
    expect(only(r, 'arc')[0].end).toBeCloseTo(Math.PI / 2, 4)
    expect(only(r, 'text')[0].text).toBe('Sala & <1>')
    expect(only(r, 'text')[0].align).toBe('center')
    expect(only(r, 'text')[0].at).toEqual({ x: 3, y: 3 })
    expect(only(r, 'fill')[0].points).toHaveLength(4)
    // SOLID's Z order must come back as the same square, not a bow tie.
    expect(only(r, 'fill')[0].points[2]).toEqual({ x: 1, y: 1 })
    expect(only(r, 'polyline')[0].closed).toBe(true)
  })

  it('SVG escapes text, keeps layers as groups and omits hidden ones', () => {
    const svg = drawingToSvg(d, sheet)
    expect(svg).toContain('Sala &amp; &lt;1&gt;')
    expect(svg).toContain('<g id="A_WALL">')
    expect(svg).not.toContain('HIDDEN')
    expect(svg).toContain('width="420mm"')
    expect(svg).toContain('Planta')
  })

  it('PDF is well formed: header, xref offsets that land on objects, vector ops', () => {
    const bytes = drawingToPdf(d, sheet)
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    const xref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const offsets = text.slice(xref).split('\n').slice(3, 8).map((l) => Number(l.slice(0, 10)))
    offsets.forEach((o, i) => expect(text.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`))
    expect(text).toContain(' re\n'.length ? 'Tj' : '')
    expect(text).toMatch(/\d l /)
    expect(text).not.toContain('/Im0') // no page: no picture
  })

  it('PDF embeds a page picture when it has one', () => {
    const page = { url: 'data:image/png;base64,AA', width: 100, height: 50, pixelWidth: 2, pixelHeight: 1, pageNumber: 1, pageCount: 1 }
    const text = new TextDecoder('latin1').decode(drawingToPdf({ ...d, page }, sheet, { jpeg: new Uint8Array([255, 216, 255, 217]), width: 2, height: 1 }))
    expect(text).toContain('/Im0 Do')
    expect(text).toContain('/DCTDecode')
  })

  it('picks the largest standard scale that fits', () => {
    // 40 × 20 m on A3: 1:100 needs 400 × 200 mm, more than the frame leaves; 1:125 fits.
    const s = layoutSheet({ minX: 0, minY: 0, maxX: 40, maxY: 20 }, 1, 'A3')
    expect(s.scaleLabel).toBe('1:125')
    expect(40 * s.unit).toBeCloseTo(320)
  })

  it('an unscaled sheet says so instead of inventing a scale', () => {
    expect(layoutSheet({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, null, 'A4').scaleLabel).toBeNull()
  })

  it('escapes PDF strings and encodes Latin-1', () => {
    expect(pdfLiteral('a(b)')).toBe('(a\\(b\\))')
    expect(pdfLiteral('ñ')).toBe('(\\361)')
    expect(pdfLiteral('図')).toBe('(?)')
  })

  it('prints near-white as black and picks a near colour', () => {
    expect(inkFor('#ffffff')).toBe('#000000')
    expect(inkFor('#ff0000')).toBe('#ff0000')
    expect(nearestAci('#fe0101')).toBe(1)
  })
})

describe('editing', () => {
  const sheet = {
    layers: [{ name: 'A', color: '#fff', visible: true, locked: false }, { name: 'L', color: '#fff', visible: true, locked: true }],
    entities: [
      { id: 1, kind: 'line', layer: 'A', color: null, a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { id: 2, kind: 'line', layer: 'L', color: null, a: { x: 0, y: 5 }, b: { x: 10, y: 5 } },
    ] as Entity[],
  }
  it('hits within tolerance and never a locked layer', () => {
    expect(hitEntity(sheet, { x: 5, y: 0.1 }, 0.5)?.id).toBe(1)
    expect(hitEntity(sheet, { x: 5, y: 5 }, 0.5)).toBeNull()
    expect(hitEntity(sheet, { x: 5, y: 2 }, 0.5)).toBeNull()
  })
  it('moves every kind', () => {
    const m = moved(sheet.entities[0], 1, 2) as Extract<Entity, { kind: 'line' }>
    expect(m.a).toEqual({ x: 1, y: 2 }); expect(m.b).toEqual({ x: 11, y: 2 })
  })
})

describe('3D overlay', () => {
  it('lays every shown layer flat at its height, in scene axes', () => {
    const scene = new THREE.Scene()
    const overlay = createDrawingOverlay(scene, () => {})
    const entities: Entity[] = [
      { id: 1, kind: 'polyline', layer: 'W', color: null, closed: true, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }] },
      { id: 2, kind: 'line', layer: 'S', color: null, a: { x: 0, y: 1 }, b: { x: 1, y: 1 } },
      { id: 3, kind: 'line', layer: 'OFF', color: null, a: { x: 9, y: 9 }, b: { x: 8, y: 8 } },
    ]
    const layers: Layer[] = [
      { name: 'W', color: '#e6e6e6', visible: true, locked: false },
      { name: 'S', color: '#f5c04a', visible: true, locked: false },
      { name: 'OFF', color: '#fff', visible: false, locked: false },
    ]
    overlay.sync([{ id: 'a', name: 'a', source: 'plan', layers, entities, placement: IDENTITY, metresPerUnit: 1, visible: true, in3d: true, elevation: 5, skipped: {} }])
    const lines = scene.getObjectByName('drawings-overlay')!.children[0].children[0] as THREE.LineSegments
    const pos = lines.geometry.getAttribute('position')
    expect(pos.count).toBe(8) // three closed edges + one line, two ends each
    expect(pos.getY(0)).toBe(5)
    expect(pos.getZ(2)).toBeCloseTo(0)
    expect(pos.getZ(3)).toBeCloseTo(-3)
    overlay.dispose()
    expect(scene.getObjectByName('drawings-overlay')).toBeUndefined()
  })
})
