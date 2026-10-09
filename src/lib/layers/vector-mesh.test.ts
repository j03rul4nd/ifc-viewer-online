import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildVectorLayer, densify, DEFAULT_STYLE } from './vector-mesh'
import { parseGeoJson, projectLayer } from './geojson'
import { anchorFromPlacement } from '../geo/scene-anchor'
import { SAMPLE_GEOJSON } from './sample-layers'

const anchor = anchorFromPlacement(
  { lat: 41.39, lon: 2.166, rotationDeg: 0, heightOffsetM: 0, source: 'manual', confidence: 'high' },
  { x: 0, z: 0 }, 0, 'test',
)

function build(geojson: unknown, mode: 'relative' | 'absolute' | 'ignore' = 'relative', ground = (_x: number, _z: number) => 0) {
  const r = parseGeoJson(geojson)
  if (!r.ok) throw r.error
  return buildVectorLayer({
    features: projectLayer(r.value, anchor, mode), style: DEFAULT_STYLE, heightMode: mode, anchorY: 0, ground,
  })
}

function byName(g: THREE.Group, name: string): THREE.Mesh | undefined {
  return g.children.find((c) => c.name === name) as THREE.Mesh | undefined
}

describe('buildVectorLayer', () => {
  it('turns the synthetic sample into ribbons, fills, a volume and points', () => {
    const { group, stats, bounds } = build(SAMPLE_GEOJSON)
    expect(stats.ribbons).toBe(2)
    expect(stats.volumes).toBe(1)
    expect(stats.fills).toBe(1)
    expect(stats.points).toBe(4)
    expect(byName(group, 'vector-ribbons')).toBeDefined()
    expect(byName(group, 'vector-volumes')).toBeDefined()
    let inst = false
    group.traverse((c) => { if (c instanceof THREE.InstancedMesh) inst = true })
    expect(inst).toBe(true)
    // ~1 km of route: the bounds must be city-block sized, not degrees.
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(500)
    expect(bounds.max.x - bounds.min.x).toBeLessThan(2000)
    // The drone path flies 40–80 m up; the block is 25 m tall.
    expect(bounds.max.y).toBeGreaterThan(75)
  })

  it('drapes a route over the ground function, densified where the ground bends', () => {
    // A planar slope needs no extra vertices: the straight ribbon IS the slope.
    const slope = (x: number) => x * 0.1
    const flat = build({ type: 'LineString', coordinates: [[2.166, 41.39], [2.168, 41.39]] }, 'relative', (x) => slope(x))
    const fp = byName(flat.group, 'vector-ribbons')!.geometry.getAttribute('position')
    for (let i = 0; i < fp.count; i++) expect(fp.getY(i)).toBeCloseTo(slope(fp.getX(i)) + 0.15, 0)
    // Curved ground: split, and every vertex sits on it.
    const wave = (x: number) => Math.sin(x / 20) * 5
    const { group } = build({ type: 'LineString', coordinates: [[2.166, 41.39], [2.168, 41.39]] }, 'relative', (x) => wave(x))
    const pos = byName(group, 'vector-ribbons')!.geometry.getAttribute('position')
    expect(pos.count).toBeGreaterThan(30)
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(wave(pos.getX(i)) + 0.15, 0)
  })

  it('a zone volume sits on the lowest ground under its footprint', () => {
    const { group } = build({
      type: 'Feature', properties: { height: 10 },
      geometry: { type: 'Polygon', coordinates: [[[2.166, 41.39], [2.167, 41.39], [2.167, 41.391], [2.166, 41.39]]] },
    }, 'relative', (x) => x * 0.05)
    const vol = byName(group, 'vector-volumes')!
    vol.geometry.computeBoundingBox()
    const bb = vol.geometry.boundingBox!
    expect(bb.min.y).toBeCloseTo(0, 3) // lowest corner is at x = 0
    expect(bb.max.y - bb.min.y).toBeCloseTo(10, 3)
  })

  it('ignore mode flattens heights onto the ground', () => {
    const { bounds } = build({ type: 'LineString', coordinates: [[2.166, 41.39, 50], [2.167, 41.39, 90]] }, 'ignore')
    expect(bounds.max.y).toBeLessThan(1)
  })

  it('densify keeps the ends and caps the step', () => {
    const d = densify([{ x: 0, y: 0, z: 0 }, { x: 100, y: 10, z: 0 }], 10)
    expect(d.length).toBe(11)
    expect(d[5]).toEqual({ x: 50, y: 5, z: 0 })
  })
})

describe('adaptive draping', () => {
  it('leaves straight segments alone on flat ground', () => {
    const line = [{ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 0 }, { x: 300, y: 0, z: 200 }]
    expect(densify(line, 8, () => 12)).toHaveLength(3)
  })
  it('splits only where the ground bends, never below the step', () => {
    // A 10 m hump centred at x = 150, flat elsewhere.
    const hump = (x: number): number => Math.max(0, 10 - Math.abs(x - 150) / 5)
    const d = densify([{ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 0 }], 8, (x) => hump(x))
    expect(d.length).toBeGreaterThan(3)
    expect(d.length).toBeLessThan(Math.ceil(300 / 8) + 1)
    // Halving stops at the step: no piece is shorter than half of it.
    for (let i = 1; i < d.length; i++) expect(d[i].x - d[i - 1].x).toBeGreaterThanOrEqual(4)
    // The top of the hump is sampled closely enough to be within tolerance.
    const near = d.reduce((m, p) => Math.min(m, Math.abs(p.x - 150)), Infinity)
    expect(near).toBeLessThanOrEqual(8)
  })
})
