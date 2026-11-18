import { describe, expect, it } from 'vitest'
import { chunkCloud, MAX_CLOUD_POINTS, trianglesToElements } from './build-input'
import { runAsBuilt } from './pipeline'
import { fakeCapture, syntheticScene } from './synthetic-scene'
import type { ElementGeometry } from './surface-sampling'

/** Expand an indexed (optionally translated) geometry into world triangles. */
function toTriangles(g: ElementGeometry): Float32Array {
  const m = g.matrix
  const out = new Float32Array(g.indices.length * 3)
  for (let i = 0; i < g.indices.length; i++) {
    const v = g.indices[i] * 3
    out[i * 3] = g.positions[v] + (m ? m[12] : 0)
    out[i * 3 + 1] = g.positions[v + 1] + (m ? m[13] : 0)
    out[i * 3 + 2] = g.positions[v + 2] + (m ? m[14] : 0)
  }
  return out
}

describe('trianglesToElements', () => {
  it('concatenates chunks, indexes sequentially, preserves order and skips empty', async () => {
    const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const map = new Map<string, Float32Array[]>([
      ['7', [tri, tri]],
      ['3', []],
      ['5', [tri, new Float32Array(0)]],
    ])
    const els = await trianglesToElements(map, { modelId: 'm', yieldEvery: 1, classOf: (id) => (id === 7 ? 'IfcBeam' : undefined) })
    expect(els.map((e) => e.id)).toEqual([7, 5])
    expect(els[0].indices.length).toBe(6)
    expect(els[0].positions.length).toBe(18)
    expect(Array.from(els[0].indices)).toEqual([0, 1, 2, 3, 4, 5])
    expect(els[1].indices.length).toBe(3)
    expect(els[0].ifcClass).toBe('IfcBeam')
  })
})

describe('chunkCloud', () => {
  it('splits 600k points into 3 chunks preserving length', () => {
    const p = new Float32Array(600_000 * 3).map((_, i) => i)
    const c = chunkCloud(p)
    expect(c.length).toBe(3)
    expect(c.reduce((s, a) => s + a.length, 0)).toBe(p.length)
    expect(c[2][0]).toBe(2 * 262_144 * 3)
    expect(c[0].buffer).not.toBe(p.buffer)
    expect(MAX_CLOUD_POINTS).toBe(3_000_000)
  })
})

describe('adapter feeds the pipeline', { timeout: 30_000 }, () => {
  it('synthetic scene rebuilt from triangles scores 100', async () => {
    const scene = syntheticScene()
    const map = new Map(scene.map((g) => [String(g.id), [toTriangles(g)]]))
    const cls = new Map(scene.map((g) => [g.id, g.ifcClass]))
    const elements = await trianglesToElements(map, { classOf: (id) => cls.get(id) })
    const flat = fakeCapture(scene)
    const all = new Float32Array(flat.reduce((s, a) => s + a.length, 0))
    let off = 0
    for (const a of flat) { all.set(a, off); off += a.length }
    const r = runAsBuilt({ elements, cloud: chunkCloud(all), toleranceM: 0.025, alignmentRmseM: 0.005 })
    expect(r.elements.filter((e) => e.state !== 'conforming')).toEqual([])
    expect(r.score).toBe(100)
  })
})
