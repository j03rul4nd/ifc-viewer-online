// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as d from './document'
import { exportSvg } from './export-svg'
import { GestureArbiter, type Contact, type GestureAction } from './gestures'
import { resolveStudioLayout } from './layout'
import { dot, intersectPlane, isEdgeOn, offsetPlane, planeFromNormal, planeNormal, presetPlane, rotatePlane } from './plane'
import { isAppendOf, ribbonSize, writeRibbon, VERTEX_STRIDE } from './ribbon'
import { OneEuro, simplifyStroke } from './stroke'
import type { Stroke } from './types'

const stroke = (points: number[] = [0, 0, 0, 0.5, 1, 0, 0, 0.5]): Stroke => ({
  id: d.newId(), brush: 'pen', color: '#102030', width: 4, points: Float32Array.from(points),
})
const types = (a: GestureAction[]) => a.map((x) => x.type)
const touch = (id: number, x: number, y: number, timeMs: number, size?: number): Contact => ({ id, kind: 'touch', x, y, timeMs, size })
const pen = (x: number, y: number, timeMs: number): Contact => ({ id: 99, kind: 'pen', x, y, timeMs })

describe('planes', () => {
  it('hits a facing plane where the ray says', () => {
    expect(intersectPlane(presetPlane('front'), [2, 3, 10], [0, 0, -1])).toEqual([2, 3, 0])
  })

  it('refuses an edge-on plane instead of throwing a point to the horizon', () => {
    const p = presetPlane('ground')
    expect(intersectPlane(p, [0, 1, 10], [0, -0.001, -1])).toBeNull()
    expect(isEdgeOn(p, [0, 0, -1])).toBe(true)
  })

  it('refuses a plane behind the camera', () => {
    expect(intersectPlane(presetPlane('front'), [0, 0, 10], [0, 0, 1])).toBeNull()
  })

  it('stays orthonormal through rotations and keeps "up" for a wall', () => {
    const p = rotatePlane(presetPlane('front'), [0, 1, 0], Math.PI / 4)
    expect(dot(p.u, p.v)).toBeCloseTo(0)
    expect(p.v[1]).toBeCloseTo(1)
    const w = planeFromNormal([0, 0, 0], [1, 0, 1])
    expect(w.v[1]).toBeCloseTo(1)
  })

  it('handles a normal straight up, which has no "up" of its own', () => {
    const p = planeFromNormal([0, 0, 0], [0, 1, 0])
    expect(Math.abs(planeNormal(p)[1])).toBeCloseTo(1)
  })

  it('offsets along the normal', () => {
    expect(offsetPlane(presetPlane('front'), 2).origin[2]).toBeCloseTo(2)
  })
})

describe('gestures', () => {
  it('a finger draws until a pen appears, then only navigates', () => {
    const g = new GestureArbiter()
    expect(types(g.down(touch(1, 0, 0, 0)))).toEqual(['draw-start'])
    expect(types(g.up(touch(1, 0, 0, 50)))).toEqual(['draw-end'])
    expect(types(g.down(pen(0, 0, 100)))).toEqual(['pen-detected', 'draw-start'])
    g.up(pen(0, 0, 200))
    expect(types(g.down(touch(1, 0, 0, 300)))).toEqual([])
    expect(types(g.move(touch(1, 10, 0, 310)))).toEqual(['orbit'])
  })

  it('a second finger soon after cancels the first finger\'s stroke', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 0, 0, 0))
    expect(types(g.down(touch(2, 50, 0, 80)))).toEqual(['draw-cancel'])
  })

  it('a stray touch late in a finger stroke changes nothing', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 0, 0, 0))
    expect(g.down(touch(2, 50, 0, 900))).toEqual([])
    expect(types(g.move(touch(1, 5, 0, 910)))).toEqual(['draw-move'])
  })

  it('the resting hand never interrupts a pen stroke', () => {
    const g = new GestureArbiter()
    g.down(pen(0, 0, 0))
    expect(g.down(touch(1, 300, 300, 10, 80))).toEqual([])
    expect(g.down(touch(2, 300, 300, 20, 10))).toEqual([])
    expect(types(g.move(pen(5, 5, 30)))).toEqual(['draw-move'])
  })

  it('the pen wins over a finger stroke the hand started by landing first', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 300, 300, 0))
    expect(types(g.down(pen(0, 0, 400)))).toEqual(['pen-detected', 'draw-cancel', 'draw-start'])
  })

  it('two and three finger taps undo and redo; a drag does neither', () => {
    const g = new GestureArbiter()
    g.fingerDraw = false
    g.down(touch(1, 0, 0, 0)); g.down(touch(2, 40, 0, 10))
    g.up(touch(1, 0, 0, 100))
    expect(types(g.up(touch(2, 40, 0, 110)))).toEqual(['undo'])

    g.down(touch(1, 0, 0, 500)); g.down(touch(2, 40, 0, 505)); g.down(touch(3, 80, 0, 510))
    g.up(touch(1, 0, 0, 600)); g.up(touch(2, 40, 0, 605))
    expect(types(g.up(touch(3, 80, 0, 610)))).toEqual(['redo'])

    g.down(touch(1, 0, 0, 1000)); g.down(touch(2, 40, 0, 1005))
    g.move(touch(1, 60, 0, 1050)); g.move(touch(2, 100, 0, 1060))
    g.up(touch(1, 60, 0, 1100))
    expect(g.up(touch(2, 100, 0, 1110))).toEqual([])
  })

  it('pinch zooms by the change in spread; three fingers pan', () => {
    const g = new GestureArbiter()
    g.fingerDraw = false
    g.down(touch(1, 0, 0, 0)); g.down(touch(2, 100, 0, 5))
    g.move(touch(1, -50, 0, 20))
    const out = g.move(touch(2, 150, 0, 25))
    const zoom = out.find((a) => a.type === 'zoom')
    expect(zoom && zoom.type === 'zoom' && zoom.factor).toBeGreaterThan(1)
    g.down(touch(3, 50, 50, 30))
    expect(types(g.move(touch(3, 80, 50, 40)))).toEqual(['pan'])
  })

  it('a stroke the system takes away is cancelled, not committed', () => {
    const g = new GestureArbiter()
    g.down(pen(0, 0, 0))
    expect(types(g.cancel({ id: 99 }))).toEqual(['draw-cancel'])
  })
})

describe('strokes', () => {
  it('drops points on a straight line but keeps the ends', () => {
    const pts: number[] = []
    for (let i = 0; i <= 100; i++) pts.push(i / 100, 0, 0, 0.5)
    const out = simplifyStroke(Float32Array.from(pts), 0.001)
    expect(out.length / 4).toBe(2)
    expect(out[0]).toBe(0)
    expect(out[4]).toBeCloseTo(1)
  })

  it('keeps the corner, and a change of pressure on a straight line', () => {
    const corner = simplifyStroke(Float32Array.from([0, 0, 0, .5, .5, 0, 0, .5, 1, 0, 0, .5, 1, .5, 0, .5, 1, 1, 0, .5]), 0.01)
    expect(corner.length / 4).toBe(3)
    const taper = simplifyStroke(Float32Array.from([0, 0, 0, .1, .5, 0, 0, .9, 1, 0, 0, .1]), 0.01)
    expect(taper.length / 4).toBe(3)
  })

  it('the filter steadies a jitter and follows a fast move', () => {
    const slow = new OneEuro()
    let last = 0
    for (let i = 0; i < 40; i++) last = slow.filter(i % 2 ? 1 : -1, i * 8)
    expect(Math.abs(last)).toBeLessThan(0.6)
    const fast = new OneEuro()
    for (let i = 0; i < 40; i++) last = fast.filter(i * 40, i * 8)
    expect(1560 - last).toBeLessThan(60)
  })

  it('never divides by zero on samples sharing a timestamp', () => {
    const f = new OneEuro()
    f.filter(0, 10)
    expect(Number.isFinite(f.filter(5, 10))).toBe(true)
  })
})

describe('ribbon', () => {
  const buffers = (points: number) => {
    const size = ribbonSize(points)
    return { vertices: new Float32Array(size.vertices * VERTEX_STRIDE), colors: new Uint8Array(size.vertices * 4), indices: new Uint32Array(size.indices), vertexCount: 0 }
  }

  it('makes two vertices a point and two triangles a segment', () => {
    const s = stroke([0, 0, 0, 1, 1, 0, 0, 1, 2, 0, 0, 1])
    const out = buffers(s.points.length)
    expect(writeRibbon(s, out, 0)).toBe(12)
    expect(out.vertexCount).toBe(6)
    expect(out.colors.slice(0, 4)).toEqual(Uint8Array.from([16, 32, 48, 255]))
  })

  it('a lone tap still leaves a mark', () => {
    const s = stroke([1, 1, 1, 0.5])
    const out = buffers(s.points.length)
    expect(writeRibbon(s, out, 0)).toBe(6)
    expect(out.vertexCount).toBe(4)
  })

  it('recognises an append and refuses anything else', () => {
    const [a, b] = [stroke(), stroke()]
    expect(isAppendOf([a], [a, b])).toBe(true)
    expect(isAppendOf([a, b], [a])).toBe(false)
    expect(isAppendOf([a], [b])).toBe(false)
  })
})

describe('document', () => {
  it('undo and redo walk the history; a new edit drops the redo branch', () => {
    let h = d.startHistory(d.createDoc())
    const count = () => d.activeLayer(d.activePage(h.present)).strokes.length
    h = d.commit(h, d.addStroke(h.present, stroke())!)
    h = d.commit(h, d.addStroke(h.present, stroke())!)
    expect(count()).toBe(2)
    h = d.undo(h)
    expect(count()).toBe(1)
    h = d.redo(h)
    expect(count()).toBe(2)
    h = d.undo(h)
    h = d.commit(h, d.addStroke(h.present, stroke())!)
    expect(h.future).toHaveLength(0)
  })

  it('edits share what they did not touch', () => {
    const a = d.addPage(d.createDoc())
    const b = d.addStroke(a, stroke())!
    expect(b.pages[0]).toBe(a.pages[0])
    expect(b.pages[1]).not.toBe(a.pages[1])
  })

  it('a locked or hidden layer refuses a stroke', () => {
    const doc = d.createDoc()
    const id = d.activePage(doc).activeLayerId
    expect(d.addStroke(d.patchLayer(doc, id, { locked: true }), stroke())).toBeNull()
    expect(d.addStroke(d.patchLayer(doc, id, { visible: false }), stroke())).toBeNull()
  })

  it('the eraser leaves a locked layer alone', () => {
    const s = stroke()
    let doc = d.addStroke(d.createDoc(), s)!
    doc = d.patchLayer(doc, d.activePage(doc).activeLayerId, { locked: true })
    expect(d.activeLayer(d.activePage(d.removeStrokes(doc, new Set([s.id])))).strokes).toHaveLength(1)
  })

  it('keeps the last layer and the last page', () => {
    const doc = d.createDoc()
    expect(d.deleteLayer(doc, d.activePage(doc).activeLayerId).pages[0].layers).toHaveLength(1)
    expect(d.deletePage(doc, doc.activePageId)).toBe(doc)
  })

  it('deleting a page lands on a neighbour', () => {
    const one = d.createDoc()
    const two = d.addPage(one)
    const after = d.deletePage(two, two.activePageId)
    expect(after.activePageId).toBe(one.activePageId)
  })

  it('round-trips through a file and refuses what is not a sketch', () => {
    const doc = d.addStroke(d.createDoc(), stroke([0.5, 0.25, 0, 1]))!
    const back = d.parseDoc(d.serializeDoc(doc))!
    const s = d.activeLayer(d.activePage(back)).strokes[0]
    expect(s.points).toBeInstanceOf(Float32Array)
    expect(s.points[1]).toBeCloseTo(0.25)
    expect(d.parseDoc('{"version":2}')).toBeNull()
    expect(d.parseDoc('nope')).toBeNull()
    expect(d.parseDoc('{"version":1,"pages":[{"layers":[{}]}],"activePageId":"x"}')).toBeNull()
  })

  it('forgetting an image removes it from every page', () => {
    const plane = presetPlane('front')
    let doc = d.placeImage(d.createDoc(), { id: 'p', imageId: 'i', plane, width: 1, height: 1, opacity: 1 })
    doc = d.forgetImage(doc, 'i')
    expect(d.activePage(doc).placed).toHaveLength(0)
  })
})

describe('layout follows the space, not a device', () => {
  it('a phone-sized space is compact and floats the references', () => {
    expect(resolveStudioLayout(390, 844)).toMatchObject({ density: 'compact', paneMode: 'docked-stack' })
    expect(resolveStudioLayout(390, 600)).toMatchObject({ density: 'compact', paneMode: 'floating' })
  })

  it('half a stacked split is short and floats', () => {
    expect(resolveStudioLayout(600, 420)).toMatchObject({ density: 'compact', short: true, paneMode: 'floating' })
  })

  it('an open foldable docks the references beside the drawing', () => {
    expect(resolveStudioLayout(1000, 780)).toMatchObject({ density: 'regular', paneMode: 'docked-side' })
  })

  it('a tall open foldable stacks them, so the rail leaves room to draw', () => {
    expect(resolveStudioLayout(780, 1000)).toMatchObject({ density: 'regular', paneMode: 'docked-stack' })
  })

  it('a real hinge decides the split', () => {
    const rect = { x: 0, y: 0, width: 400, height: 400 }
    const hw = { posture: 'stacked' as const, source: 'hardware' as const, viewer: rect, pane: rect, hinge: rect }
    expect(resolveStudioLayout(800, 800, hw)).toMatchObject({ paneMode: 'docked-stack', paneShare: 0.5 })
  })
})

describe('svg', () => {
  const page = (strokes: Stroke[]) => [{ id: 'l', name: '1', visible: true, locked: false, strokes }]
  const project = ([x, y]: readonly number[]) => ({ x, y })

  it('writes paths, and leaves hidden layers out', () => {
    const svg = exportSvg(page([stroke()]), 100, 50, '#fff', project)
    expect(svg).toContain('d="M0 0L1 0"')
    expect(svg).toContain('stroke="#102030"')
    const hidden = exportSvg([{ ...page([stroke()])[0], visible: false }], 100, 50, '#fff', project)
    expect(hidden).not.toContain('<path')
  })

  it('starts a new subpath across a point behind the camera', () => {
    const s = stroke([0, 0, 0, 1, 5, 5, 0, 1, 2, 0, 0, 1])
    const svg = exportSvg(page([s]), 10, 10, '#fff', ([x, y]) => (x === 5 ? null : { x, y }))
    expect(svg).toContain('d="M0 0M2 0"')
  })
})
