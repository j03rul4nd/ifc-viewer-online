import { describe, expect, it } from 'vitest'
import { Mesh } from 'three'
import { buildLinearLayer, solveSceneVertical } from './osm-scene'
import { readVerticalTags } from './vertical'
import { metresToNormalized } from './geo-math'
import type { OsmFeature } from './osm-features'

const opts = { anchorLat: 31.2, anchorLon: 121.32, quality: 'detailed' as const }
function way(kind: 'rail' | 'road', tags: Record<string, string>): OsmFeature {
  return {
    id: 'way', kind, widthM: kind === 'rail' ? 4.5 : 8,
    ring: [{ lat: 31.2, lon: 121.32 }, { lat: 31.203, lon: 121.32 }],
    height: { heightM: 0, minHeightM: 0, estimated: true },
    style: { roofShape: 'flat', roofHeightM: 0, railKind: 'track', roadClass: 'vehicular' },
    vertical: readVerticalTags(tags), functional: kind === 'rail' ? 'railway' : 'road',
  }
}
function vertices(f: OsmFeature, quality: 'simple' | 'detailed') {
  const vertical = solveSceneVertical([f], opts)
  const layer = buildLinearLayer([f], f.kind as 'road' | 'rail', { ...opts, quality, vertical })!
  const z: number[] = []
  layer.object.traverse(n => {
    const p = (n as Mesh).geometry?.getAttribute('position')
    if (p) for (let i = 0; i < p.count; i++) z.push(p.getZ(i) / metresToNormalized(opts.anchorLat))
  })
  return { z, vertical }
}

describe('city infrastructure geometry', () => {
  it('does not paint a buried road on the surface in detailed 3D', () => {
    const f = way('road', { tunnel: 'yes', layer: '-1' })
    expect(vertices(f, 'simple').z.length).toBeGreaterThan(0)
    expect(vertices(f, 'detailed').z).toHaveLength(0)
  })
  it('gives elevated railway a structural underside deeper than its ballast', () => {
    const f = way('rail', { bridge: 'yes', layer: '1' })
    const { z, vertical } = vertices(f, 'detailed')
    const deck = Math.max(...vertical.get(f.id)!.elevationM)
    expect(z.some(v => v > deck - 1.2 && v < deck - 0.7)).toBe(true)
    expect(z.every(Number.isFinite)).toBe(true)
  })
  it('keeps ground masts but omits unsupported foundations beside elevated tracks', () => {
    for (const bridge of [false, true]) {
      const f = way('rail', bridge ? { bridge: 'yes', layer: '1' } : {})
      f.style.overheadWire = true
      const vertical = solveSceneVertical([f], opts)
      const layer = buildLinearLayer([f], 'rail', { ...opts, vertical })!
      expect(Boolean(layer.object.getObjectByName('osm-rail-masts'))).toBe(!bridge)
    }
  })
})
