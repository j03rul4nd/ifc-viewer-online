// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { exportBlenderScript, exportObj } from './export-blender'
import { encodePsd, packBits } from './export-psd'
import { applyPressureCurve, applyTapers, findEndpointSnap, finishStroke, readTilt, sampleWeight, smoothPath, Stabilizer, DEFAULT_INK } from './ink'
import { strokeOutline } from './raster'
import { SaveQueue } from './save-queue'
import { fitIntoCard, shareImage } from './share'
import type { SketchLayer, Stroke } from './types'

const line = (n: number, p = 1): Float32Array => {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(i, 0, 0, p)
  return Float32Array.from(out)
}
const stroke = (points: number[]): Stroke => ({ id: 's', brush: 'pen', color: '#102030', width: 4, points: Float32Array.from(points) })
const layer = (strokes: Stroke[]): SketchLayer => ({ id: 'l', name: 'One', visible: true, locked: false, strokes })

describe('pressure and tilt', () => {
  it('curves bend the response and keep the ends', () => {
    expect(applyPressureCurve(0.5, 'soft')).toBeGreaterThan(0.5)
    expect(applyPressureCurve(0.5, 'firm')).toBeLessThan(0.5)
    expect(applyPressureCurve(1, 'firm')).toBe(1)
    expect(applyPressureCurve(0, 'soft')).toBe(0)
  })

  it('a pen uses its pressure; a constant 0.5 means no sensor, so speed stands in', () => {
    expect(sampleWeight('pen', 0.9, 0, 'normal', null)).toBeCloseTo(0.9)
    expect(sampleWeight('pen', 0.5, 0, 'normal', null)).toBeCloseTo(0.8)
    expect(sampleWeight('touch', 0, 3, 'normal', null)).toBeCloseTo(0.35)
  })

  it('weight is smoothed, not jumped', () => {
    const next = sampleWeight('pen', 1, 0, 'normal', 0.2)
    expect(next).toBeGreaterThan(0.2)
    expect(next).toBeLessThan(1)
  })

  it('reads altitude first, tilt otherwise', () => {
    expect(readTilt({ altitudeAngle: Math.PI / 2 })).toBeCloseTo(0)
    expect(readTilt({ altitudeAngle: Math.PI / 4 })).toBeCloseTo(0.5)
    expect(readTilt({ tiltX: 45, tiltY: -10 })).toBeCloseTo(0.5)
    expect(readTilt({})).toBe(0)
  })
})

describe('stabilizer', () => {
  it('level 0 is the raw hand', () => {
    const s = new Stabilizer(0)
    expect(s.push(1, 1)).toEqual({ x: 1, y: 1 })
    expect(s.push(9, 9)).toEqual({ x: 9, y: 9 })
  })

  it('more level means less jitter', () => {
    const spread = (level: number) => {
      const s = new Stabilizer(level)
      let max = 0
      for (let i = 0; i < 60; i++) max = Math.max(max, i > 30 ? Math.abs(s.push(i, i % 2 ? 4 : -4).y) : (s.push(i, i % 2 ? 4 : -4), 0))
      return max
    }
    expect(spread(6)).toBeLessThan(spread(1))
  })
})

describe('curves and ends', () => {
  it('passes through its points without overshooting a straight line', () => {
    const out = smoothPath(line(5), 0.2)
    expect(out.length / 4).toBeGreaterThan(5)
    for (let i = 0; i < out.length; i += 4) expect(out[i + 1]).toBeCloseTo(0)
    expect(out[out.length - 4]).toBe(4)
  })

  it('keeps a sharp corner sharp', () => {
    const corner = Float32Array.from([0, 0, 0, 1, 1, 0, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 2, 2, 0, 1])
    const out = smoothPath(corner, 0.1)
    let bulge = 0
    for (let i = 0; i < out.length; i += 4) bulge = Math.max(bulge, out[i] - 2)
    expect(bulge).toBeLessThan(0.01)
  })

  it('survives repeated points', () => {
    const out = smoothPath(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]), 0.1)
    expect([...out].every(Number.isFinite)).toBe(true)
  })

  it('tapers thin both ends and leave the middle', () => {
    const out = applyTapers(line(101), 10, 10)
    expect(out[3]).toBeLessThan(0.2)
    expect(out[out.length - 1]).toBeLessThan(0.2)
    expect(out[50 * 4 + 3]).toBeCloseTo(1)
  })

  it('a short stroke keeps a body', () => {
    const out = applyTapers(line(11), 100, 100)
    expect(out[5 * 4 + 3]).toBeGreaterThan(0.5)
  })

  it('a straight line is left as drawn', () => {
    const two = line(2)
    expect(finishStroke(two, 0.01, DEFAULT_INK, true)).toBe(two)
  })

  it('joins only what is close, and the closest', () => {
    const world = [0, 0, 0] as const
    const c = [{ x: 10, y: 0, world }, { x: 5, y: 0, world }]
    expect(findEndpointSnap(0, 0, c, 14)?.x).toBe(5)
    expect(findEndpointSnap(0, 0, c, 3)).toBeNull()
  })
})

describe('outlines', () => {
  it('breaks at a point behind the camera', () => {
    const s = stroke([0, 0, 0, 1, 5, 0, 0, 1, 9, 0, 0, 1, 12, 0, 0, 1])
    expect(strokeOutline(s, ([x, y]) => (x === 5 ? null : { x, y }))).toHaveLength(2)
  })

  it('makes a dot of a lone point', () => {
    expect(strokeOutline(stroke([1, 1, 0, 1]), ([x, y]) => ({ x, y }))[0].length).toBeGreaterThan(3)
  })
})

describe('psd', () => {
  const unpack = (b: Uint8Array): number[] => {
    const out: number[] = []
    for (let i = 0; i < b.length;) {
      const n = b[i] > 127 ? b[i] - 256 : b[i]
      if (n >= 0) { for (let k = 0; k <= n; k++) out.push(b[i + 1 + k]); i += n + 2 } else { for (let k = 0; k < 1 - n; k++) out.push(b[i + 1]); i += 2 }
    }
    return out
  }

  it('packBits round-trips runs, literals and long rows', () => {
    const rows = [[0, 0, 0, 0], [1, 2, 3, 4], [1, 1, 2, 3, 3, 3], new Array(300).fill(7), Array.from({ length: 300 }, (_, i) => i % 256)]
    for (const row of rows) expect(unpack(packBits(Uint8Array.from(row)))).toEqual(row)
  })

  it('writes the header', () => {
    const rgba = new Uint8Array(4 * 4)
    const psd = encodePsd(2, 2, [{ name: 'Capa 1', rgba, visible: true }], rgba)
    expect(String.fromCharCode(...psd.subarray(0, 4))).toBe('8BPS')
    expect(psd[13]).toBe(4)
    expect(psd[21]).toBe(2)
  })
})

describe('blender', () => {
  it('turns Y-up into Z-up, keeps layers and carries pressure as radius', () => {
    const py = exportBlenderScript('s', [layer([stroke([1, 2, 3, 1, 4, 5, 6, 0.5])])], 0.01)
    expect(py).toContain('(1,-3,2,0.02)')
    expect(py).toContain('"One"')
    expect(py).toContain('(4,-6,5,0.0115)')
  })

  it('escapes a layer name that would break the script', () => {
    expect(exportBlenderScript('s', [{ ...layer([stroke([0, 0, 0, 1, 1, 0, 0, 1])]), name: 'a"b' }], 1)).toContain('"a\\"b"')
  })

  it('numbers obj vertices across strokes', () => {
    const obj = exportObj([layer([stroke([0, 0, 0, 1, 1, 0, 0, 1]), stroke([2, 0, 0, 1, 3, 0, 0, 1])])])
    expect(obj).toContain('l 1 2')
    expect(obj).toContain('l 3 4')
  })
})

describe('save queue', () => {
  it('runs one at a time and drops what was overtaken', async () => {
    const written: number[] = []
    let release: () => void = () => undefined
    const q = new SaveQueue<number>(async (v) => {
      written.push(v)
      await new Promise<void>((r) => { release = r })
      return true
    }, () => undefined)
    q.push(1); q.push(2); q.push(3)
    release()
    await new Promise((r) => setTimeout(r))
    release()
    await q.flushed()
    expect(written).toEqual([1, 3])
  })

  it('reports a failed write and carries on', async () => {
    const seen: boolean[] = []
    const q = new SaveQueue<number>(async () => { throw new Error('quota') }, (ok) => seen.push(ok))
    q.push(1)
    await q.flushed()
    expect(seen).toEqual([false])
  })
})

describe('sharing', () => {
  const file = {} as File
  it('uses the share sheet when it takes files', async () => {
    const share = async () => undefined
    expect(await shareImage(file, () => undefined, { canShare: () => true, share })).toBe('shared')
  })

  it('saves the image when there is no sheet, and does not save on cancel', async () => {
    let saved = 0
    expect(await shareImage(file, () => { saved++ }, {})).toBe('saved')
    const abort = async () => { throw Object.assign(new Error(), { name: 'AbortError' }) }
    expect(await shareImage(file, () => { saved++ }, { canShare: () => true, share: abort })).toBe('cancelled')
    expect(saved).toBe(1)
  })

  it('fits the drawing inside the card', () => {
    const { scale, x, y } = fitIntoCard(1000, 500, 1080, 1920)
    expect(1000 * scale).toBeLessThanOrEqual(1080)
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
  })
})
