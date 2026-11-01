// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { markBox } from './brand'
import * as d from './document'
import { reshapeStroke } from './edit'
import { crc32, encodeOra, zipStored } from './export-ora'
import { encodePsd } from './export-psd'
import { applyPressureCurve, applyTip } from './ink'
import { actionForKey, isBindable, keyFor, rebind } from './keymap'
import { decodeSketchLink, encodeSketchLink, linkableDoc } from './share-link'
import { presetPlane } from './plane'
import type { Stroke } from './types'

const plane = presetPlane('front')
const line = (n: number): Float32Array => {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(i, 0, 0, 1)
  return Float32Array.from(out)
}

describe('free pressure curve', () => {
  it('passes through the ends and bends toward its point', () => {
    expect(applyPressureCurve(0, 'custom', [0.2, 0.8])).toBeCloseTo(0)
    expect(applyPressureCurve(1, 'custom', [0.2, 0.8])).toBeCloseTo(1)
    expect(applyPressureCurve(0.5, 'custom', [0.2, 0.8])).toBeGreaterThan(0.6)
    expect(applyPressureCurve(0.5, 'custom', [0.8, 0.2])).toBeLessThan(0.4)
  })
})

describe('tips', () => {
  it('round leaves it alone', () => {
    const p = line(5)
    expect(applyTip(p, 'round', plane, 0.01, 3)).toEqual([p])
  })
  it('flat changes weight with direction, as a nib does', () => {
    const across = applyTip(Float32Array.from([0, 0, 0, 1, 1, 1, 0, 1]), 'flat', plane, 0.01, 3)[0]
    const along = applyTip(Float32Array.from([0, 0, 0, 1, 1, -1, 0, 1]), 'flat', plane, 0.01, 3)[0]
    expect(across[3]).not.toBeCloseTo(along[3])
  })
  it('dash cuts into pieces', () => {
    expect(applyTip(line(100), 'dash', plane, 0.5, 2).length).toBeGreaterThan(3)
  })
  it('bristle makes parallel thin lines', () => {
    const out = applyTip(line(10), 'bristle', plane, 0.01, 4)
    expect(out).toHaveLength(3)
    expect(out[1][1]).not.toBeCloseTo(out[2][1])
    expect(out[0][3]).toBeLessThan(1)
  })
})

describe('reshape', () => {
  it('moves the point most and leaves the far end', () => {
    const s: Stroke = { id: 's', brush: 'pen', color: '#000000', width: 2, points: line(21) }
    const out = reshapeStroke(s, 10, [0, 2, 0], 4)
    expect(out.points[10 * 4 + 1]).toBeCloseTo(2)
    expect(Math.abs(out.points[1])).toBeLessThan(0.01)
    expect(out.points[12 * 4 + 1]).toBeGreaterThan(0.5)
    expect(s.points[10 * 4 + 1]).toBe(0)
  })
})

describe('shortcuts', () => {
  it('rebinding swaps, so nothing is left without a key', () => {
    const k = rebind({}, 'pen', 'e')
    expect(keyFor('pen', k)).toBe('e')
    expect(keyFor('eraser', k)).toBe('p')
    expect(actionForKey('E', k)).toBe('pen')
  })
  it('refuses numbers and special keys', () => {
    expect(isBindable('5')).toBe(false)
    expect(isBindable('Tab')).toBe(false)
    expect(isBindable('q')).toBe(true)
  })
})

describe('ora', () => {
  it('computes the standard crc', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('puts mimetype first, uncompressed', () => {
    const zip = zipStored([{ name: 'mimetype', data: new TextEncoder().encode('image/openraster') }])
    expect(String.fromCharCode(zip[0], zip[1])).toBe('PK')
    expect(new TextDecoder().decode(zip.subarray(30, 38))).toBe('mimetype')
    expect(new TextDecoder().decode(zip.subarray(38, 54))).toBe('image/openraster')
  })
  it('lists layers top first with their blend', () => {
    const png = new Uint8Array(1)
    const ora = new TextDecoder().decode(encodeOra(1, 1, [{ name: 'low', png, visible: true, opacity: 1, blend: 'normal' }, { name: 'a&b', png, visible: false, opacity: 0.5, blend: 'multiply' }], png, png))
    expect(ora.indexOf('a&amp;b')).toBeLessThan(ora.indexOf('"low"'))
    expect(ora).toContain('composite-op="svg:multiply"')
  })
})

describe('blend and background', () => {
  it('PSD writes the blend key', () => {
    const rgba = new Uint8Array(4)
    const psd = Buffer.from(encodePsd(1, 1, [{ name: 'a', rgba, visible: true, blend: 'multiply' }], rgba))
    expect(psd.indexOf('8BIMmul ')).toBeGreaterThan(0)
  })
  it('background and blend are optional, so old sketches still open', () => {
    const doc = d.setBackground(d.createDoc(), { color: '#112233', pattern: 'grid' })
    const back = d.parseDoc(d.serializeDoc(doc))!
    expect(back.background?.pattern).toBe('grid')
    expect(d.createDoc().background).toBeUndefined()
  })
})

describe('brand mark', () => {
  it('stays inside the margin in every corner', () => {
    expect(markBox(1000, 1000, 100, 20, 'bottom-right')).toEqual({ x: 870, y: 950 })
    expect(markBox(1000, 1000, 100, 20, 'top-left')).toEqual({ x: 30, y: 30 })
  })
})

describe('link', () => {
  const doc = () => {
    let x = d.addStroke(d.createDoc(), { id: 's', brush: 'pen', color: '#000000', width: 2, points: line(30) })!
    x = d.addPage(x)
    x = d.addStroke(x, { id: 't', brush: 'pen', color: '#ff0000', width: 2, points: line(3) })!
    return d.setBackground(x, { imageId: 'photo', color: '#fff000' })
  }
  it('carries only the page on show, without images', () => {
    const out = linkableDoc(doc())
    expect(out.pages).toHaveLength(1)
    expect(out.background?.imageId).toBeUndefined()
    expect(out.background?.color).toBe('#fff000')
  })
  it('round-trips', async () => {
    const back = await decodeSketchLink(await encodeSketchLink(doc()))
    expect(d.activeLayer(d.activePage(back!)).strokes[0].id).toBe('t')
  })
  it('refuses a broken link', async () => {
    expect(await decodeSketchLink('nonsense')).toBeNull()
  })
})
