import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildVectorLayer, updateLayerLod, DEFAULT_STYLE } from './vector-mesh'
import { lodBands } from './point-lod'
import { defaultGroupStyle, NO_AGGREGATION, RAMPS, type ResolvedStyle } from './style-groups'
import type { ProjectedFeature } from './geojson'

// 400 chargers on a 20×20 grid, 50 m apart (a 1 km square).
const features: ProjectedFeature[] = Array.from({ length: 400 }, (_, i) => ({
  id: `c${i}`, type: 'point', lists: [[{ x: (i % 20) * 50, y: 0, z: Math.floor(i / 20) * 50 }]],
  ringCounts: [], extrusionM: 0, properties: {},
}))
const style: ResolvedStyle = {
  ...defaultGroupStyle('#5ce27a'), groupIndex: 0, visible: true,
  point: { symbol: { kind: 'primitive', shape: 'sphere' }, color: '#5ce27a', size: 4, labelField: 'name' },
}

function build(aggregate = NO_AGGREGATION) {
  return buildVectorLayer({
    features, style: DEFAULT_STYLE, heightMode: 'relative', anchorY: 0, ground: () => 0,
    styles: features.map(() => style), labels: features.map((_, i) => `Charger ${i}`),
    zoom: { detailM: 100, iconM: 600, dotM: 3000 },
    aggregate, aggValues: features.map((_, i) => (i % 20) / 19), // occupancy grows west → east
  })
}
const holder = (g: THREE.Group) => g.children.find((c) => c.name === 'vector-points-lod')!
const count = (bands: Uint8Array, b: number) => bands.reduce((n, x) => n + (x === b ? 1 : 0), 0)

describe('zoom bands', () => {
  it('close up: full detail near the camera, icons further, dots and nothing beyond', () => {
    const { group, bounds } = build()
    updateLayerLod(group, new THREE.Vector3(0, 30, 0), bounds)
    const b = lodBands(holder(group))!
    expect(count(b, 0)).toBeGreaterThan(0)              // detail (+label) right below
    expect(count(b, 1)).toBeGreaterThan(count(b, 0))    // icons around
    expect(count(b, 0) + count(b, 1) + count(b, 2) + count(b, 3)).toBe(400)
  })

  it('far away: every charger is a dot, then nothing', () => {
    const { group, bounds } = build()
    updateLayerLod(group, new THREE.Vector3(500, 2000, 500), bounds)
    expect(count(lodBands(holder(group))!, 2)).toBe(400)
    const dots = holder(group).children.find((c) => c.name === 'vector-dots') as THREE.Points
    expect(dots.geometry.drawRange.count).toBe(400)
    updateLayerLod(group, new THREE.Vector3(500, 9000, 500), bounds)
    expect(count(lodBands(holder(group))!, 3)).toBe(400)
  })

  it('aggregate takes over beyond its distance and hands back to points up close', () => {
    const { group, bounds } = build({
      ...NO_AGGREGATION, kind: 'hexbin', field: 'occupancy', fn: 'mean', cellM: 200, ramp: RAMPS.occupancy, fromM: 1500,
    })
    const hex = group.children.find((c) => c.name === 'vector-hexbin')!
    expect(hex.userData.cells).toBeGreaterThan(10)
    updateLayerLod(group, new THREE.Vector3(500, 4000, 500), bounds)
    expect(hex.visible).toBe(true)
    expect(count(lodBands(holder(group))!, 3)).toBe(400) // points suppressed
    updateLayerLod(group, new THREE.Vector3(500, 300, 500), bounds)
    expect(hex.visible).toBe(false)
    expect(count(lodBands(holder(group))!, 3)).toBeLessThan(400)
  })

  it('heatmap builds a ground texture covering the points', () => {
    const { group } = build({ ...NO_AGGREGATION, kind: 'heatmap', cellM: 120 })
    const heat = group.children.find((c) => c.name === 'vector-heatmap') as THREE.Mesh
    const box = new THREE.Box3().setFromObject(heat)
    expect(box.min.x).toBeLessThan(0)
    expect(box.max.z).toBeGreaterThan(950)
  })
})
