// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BUILTIN_BRUSHES, pushRecent } from './brushes'
import * as d from './document'
import { eraseAround, mapStroke, mirrorMaps, pointInPolygon, recognizeShape, rotateOnPlane, scaleAbout, strokeInLasso } from './edit'
import { encodePsd } from './export-psd'
import { GestureArbiter } from './gestures'
import { presetPlane } from './plane'
import type { Stroke } from './types'

const plane = presetPlane('front')
const flat = ([x, y]: readonly number[]) => ({ x, y })
const stroke = (points: number[]): Stroke => ({ id: 's', brush: 'pen', color: '#000000', width: 2, points: Float32Array.from(points) })
const sample = (f: (t: number) => [number, number], n = 80) => {
  const out: number[] = []
  for (let i = 0; i <= n; i++) { const [x, y] = f(i / n); out.push(x, y, 0, 0.5) }
  return out
}

describe('lasso', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  it('knows inside from outside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })
  it('takes what is mostly inside and leaves what it grazes', () => {
    expect(strokeInLasso(stroke([1, 1, 0, 1, 2, 2, 0, 1, 3, 3, 0, 1]), square, flat)).toBe(true)
    expect(strokeInLasso(stroke([1, 1, 0, 1, 20, 2, 0, 1, 30, 3, 0, 1]), square, flat)).toBe(false)
  })
})

describe('transforms', () => {
  it('never touch the original, and keep the weights', () => {
    const s = stroke([1, 0, 0, 0.3])
    const out = mapStroke(s, scaleAbout([0, 0, 0], 2))
    expect(out.points[0]).toBe(2)
    expect(out.points[3]).toBeCloseTo(0.3)
    expect(s.points[0]).toBe(1)
  })
  it('rotate on the plane', () => {
    const [x, y, z] = rotateOnPlane(plane, [0, 0, 0], Math.PI / 2)([1, 0, 5])
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(1); expect(z).toBeCloseTo(5)
  })
})

describe('partial eraser', () => {
  const line = stroke([0, 0, 0, 1, 100, 0, 0, 1])
  it('cuts a straight line in two, even with no point near the cut', () => {
    const out = eraseAround([line], 50, 0, 5, flat)
    expect(out).toHaveLength(2)
    expect(out[0].id).not.toBe(out[1].id)
  })
  it('returns the same array when it touches nothing', () => {
    const all = [line]
    expect(eraseAround(all, 50, 40, 5, flat)).toBe(all)
  })
  it('removes a stroke entirely under it, without leaving specks', () => {
    expect(eraseAround([stroke([0, 0, 0, 1, 2, 0, 0, 1])], 1, 0, 6, flat)).toHaveLength(0)
  })
})

describe('symmetry', () => {
  it('mirrors across the plane axes through its origin', () => {
    expect(mirrorMaps(plane, 'off')).toHaveLength(0)
    expect(mirrorMaps(plane, 'vertical')[0]([2, 3, 0])).toEqual([-2, 3, 0])
    expect(mirrorMaps(plane, 'horizontal')[0]([2, 3, 0])).toEqual([2, -3, 0])
    expect(mirrorMaps(plane, 'both')[2]([2, 3, 0])).toEqual([-2, -3, 0])
  })
})

describe('QuickShape', () => {
  it('an open stroke is a line', () => {
    const r = recognizeShape(sample((t) => [t * 10, Math.sin(t * 9) * 0.2]), plane)
    expect(r.kind).toBe('line')
    expect(r.points).toHaveLength(8)
  })
  it('a wobbly circle is an ellipse, and closes', () => {
    const r = recognizeShape(sample((t) => [Math.cos(t * 6.28) * (5 + Math.sin(t * 40) * 0.1), Math.sin(t * 6.28) * 5]), plane)
    expect(r.kind).toBe('ellipse')
    expect(r.points[0]).toBeCloseTo(r.points[r.points.length - 4], 4)
  })
  it('a hand-drawn box is a rectangle', () => {
    const corners = [[0, 0], [10, 0], [10, 6], [0, 6], [0, 0]]
    const r = recognizeShape(sample((t) => {
      const k = Math.min(3.999, t * 4), i = Math.floor(k), f = k - i
      return [corners[i][0] + (corners[i + 1][0] - corners[i][0]) * f, corners[i][1] + (corners[i + 1][1] - corners[i][1]) * f]
    }), plane)
    expect(r.kind).toBe('rectangle')
    expect(r.points).toHaveLength(20)
  })
  it('a scribble that closes is not forced into a shape', () => {
    const r = recognizeShape(sample((t) => [Math.cos(t * 6.28) * (2 + 3 * Math.abs(Math.sin(t * 20))), Math.sin(t * 6.28) * (2 + 3 * Math.abs(Math.sin(t * 20)))]), plane)
    expect(r.kind).toBe('line')
  })
})

describe('layers', () => {
  const two = () => {
    let doc = d.addStroke(d.createDoc(), stroke([0, 0, 0, 1]))!
    doc = d.addLayer(doc, '2')
    return d.addStroke(doc, { ...stroke([1, 1, 0, 1]), id: 't' })!
  }
  it('duplicates with new stroke ids', () => {
    const doc = d.duplicateLayer(two())
    const layers = d.activePage(doc).layers
    expect(layers).toHaveLength(3)
    expect(layers[2].strokes[0].id).not.toBe('t')
  })
  it('merges down, and the bottom layer has nothing to merge into', () => {
    const doc = two()
    const merged = d.mergeLayerDown(doc)
    expect(d.activePage(merged).layers).toHaveLength(1)
    expect(d.activePage(merged).layers[0].strokes).toHaveLength(2)
    expect(d.mergeLayerDown(merged)).toBe(merged)
  })
  it('reorders within bounds', () => {
    const doc = two()
    const id = d.activePage(doc).activeLayerId
    expect(d.moveLayer(doc, id, 1)).toBe(doc)
    expect(d.activePage(d.moveLayer(doc, id, -1)).layers[0].id).toBe(id)
  })
  it('replaces strokes on any layer that is not locked', () => {
    const doc = two()
    const next = d.mapLayerStrokes(doc, (strokes) => strokes.filter((s) => s.id !== 't'))
    expect(d.activeLayer(d.activePage(next)).strokes).toHaveLength(0)
  })
})

describe('the rest', () => {
  it('recent colours stay short and unique', () => {
    expect(pushRecent(['#AAA', '#bbb'], '#aaa')).toEqual(['#aaa', '#bbb'])
    expect(pushRecent(Array.from({ length: 8 }, (_, i) => `#${i}`), '#x')).toHaveLength(8)
  })
  it('built-in brushes have sane values', () => {
    for (const b of BUILTIN_BRUSHES) { expect(b.opacity).toBeGreaterThan(0); expect(b.width).toBeGreaterThan(0) }
  })
  it('four fingers toggle the interface', () => {
    const g = new GestureArbiter()
    g.fingerDraw = false
    const t = (id: number, timeMs: number) => ({ id, kind: 'touch' as const, x: id * 30, y: 0, timeMs })
    ;[1, 2, 3, 4].forEach((id) => g.down(t(id, id)))
    ;[1, 2, 3].forEach((id) => g.up(t(id, 50)))
    expect(g.up(t(4, 60)).map((a) => a.type)).toEqual(['toggle-ui'])
  })
  it('a held Ctrl+Space zooms', () => {
    const g = new GestureArbiter()
    g.down({ id: 1, kind: 'pen', x: 0, y: 0, timeMs: 0, modifier: 'zoom' })
    const out = g.move({ id: 1, kind: 'pen', x: 0, y: -20, timeMs: 5 })
    expect(out[0].type).toBe('zoom')
  })
  it('a PSD layer carries its opacity', () => {
    const rgba = new Uint8Array(4)
    const psd = encodePsd(1, 1, [{ name: 'a', rgba, visible: true, opacity: 0.5 }], rgba)
    const at = Buffer.from(psd).indexOf('8BIMnorm')
    expect(psd[at + 8]).toBe(128)
  })
})
