import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyMode, assessBurial, buildPitWalls, cutPlanes, cutRect, maxPolarFor,
  restoreMaterial, saveMaterial, SURFACE_MAX_POLAR_RAD, XRAY_OPACITY,
} from './subsurface'

const station = { center: { x: 0, y: -15, z: 0 }, size: { x: 120, y: 18, z: 24 } }
const flat = () => 0

describe('assessBurial', () => {
  it('calls a metro box 6–24 m down buried', () => {
    const a = assessBurial(station, flat)!
    expect(a.buried).toBe(true)
    expect(a.buriedFraction).toBe(1)
    expect(a.depthM).toBeCloseTo(24)
  })

  it('does not call a building with a basement buried', () => {
    const building = { center: { x: 0, y: 30, z: 0 }, size: { x: 40, y: 70, z: 40 } } // −5 … 65
    const a = assessBurial(building, flat)!
    expect(a.buried).toBe(false)
    expect(a.buriedFraction).toBeCloseTo(5 / 70)
  })

  it('reads a tunnel under a hillside by its whole plan, not one point', () => {
    // Road at y 0…8, ground rising from 0 at x=−50 to 40 at x=+50.
    const tunnel = { center: { x: 0, y: 4, z: 0 }, size: { x: 100, y: 8, z: 10 } }
    const a = assessBurial(tunnel, (x) => 20 + 0.4 * x)!
    expect(a.buriedFraction).toBeGreaterThan(0.6)
    expect(a.buried).toBe(true)
  })

  it('is null with no ground to compare', () => {
    expect(assessBurial(station, () => null)).toBeNull()
  })
})

describe('cutRect / cutPlanes', () => {
  it('pads the plan so the pit wall stands clear of the model', () => {
    const r = cutRect(station)
    expect(r.minX).toBeLessThan(-60)
    expect(r.maxZ).toBeGreaterThan(12)
  })

  it('prefers the oriented footprints when given', () => {
    const r = cutRect(station, [[{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }]])
    expect(r.minX).toBeCloseTo(-4)
    expect(r.maxX).toBeCloseTo(14)
  })

  it('clips inside the rectangle and nowhere else (clipIntersection)', () => {
    const planes = cutPlanes({ minX: -10, maxX: 10, minZ: -5, maxZ: 5 })
    const clipped = (p: THREE.Vector3) => planes.every((pl) => pl.distanceToPoint(p) < 0)
    expect(clipped(new THREE.Vector3(0, 0, 0))).toBe(true)
    expect(clipped(new THREE.Vector3(0, 100, 0))).toBe(true)
    expect(clipped(new THREE.Vector3(11, 0, 0))).toBe(false)
    expect(clipped(new THREE.Vector3(0, 0, -6))).toBe(false)
  })
})

describe('buildPitWalls', () => {
  it('follows the ground along each edge down to the floor', () => {
    const geo = buildPitWalls({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, -20, (x) => x, 0)
    const pos = geo.getAttribute('position')
    let maxY = -Infinity, minY = Infinity
    for (let i = 0; i < pos.count; i++) { maxY = Math.max(maxY, pos.getY(i)); minY = Math.min(minY, pos.getY(i)) }
    expect(minY).toBe(-20)
    expect(maxY).toBe(10)
    expect(pos.count % 3).toBe(0)
  })

  it('bands the walls every STRATUM_M metres and closes the pit with an up-facing floor', () => {
    const geo = buildPitWalls({ minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, -12, () => 0, 0)
    const pos = geo.getAttribute('position')
    const ys = new Set<number>()
    for (let i = 0; i < pos.count; i++) ys.add(Math.round(pos.getY(i) * 1000) / 1000)
    expect([...ys].sort((a, b) => a - b)).toEqual([-12, -9, -6, -3, 0])
    const floor = geo.groups[1]
    expect(floor.count).toBe(6)
    // Up-facing: the floor's first triangle has a +y normal.
    const v = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, floor.start + k)
    const n = new THREE.Vector3().crossVectors(v(1).sub(v(0)), v(2).sub(v(0)))
    expect(n.y).toBeGreaterThan(0)
  })
})

describe('materials', () => {
  it('x-ray fades and stops writing depth, and restores exactly', () => {
    const m = new THREE.MeshBasicMaterial({ opacity: 0.9, transparent: false })
    const saved = saveMaterial(m, 'xray')
    expect(applyMode(m, 'xray', null)).toBe(true)
    expect(m.opacity).toBeCloseTo(0.9 * XRAY_OPACITY)
    expect(m.depthWrite).toBe(false)
    restoreMaterial(m, saved)
    expect(m.opacity).toBe(0.9)
    expect(m.transparent).toBe(false)
    expect(m.depthWrite).toBe(true)
  })

  it('cut leaves a material that already clips alone', () => {
    const own = [new THREE.Plane()]
    const m = new THREE.MeshBasicMaterial()
    m.clippingPlanes = own
    expect(applyMode(m, 'cut', cutPlanes({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }))).toBe(false)
    expect(m.clippingPlanes).toBe(own)
  })

  it('surface camera stays above the horizon; below ground it may look up', () => {
    expect(maxPolarFor('surface')).toBe(SURFACE_MAX_POLAR_RAD)
    expect(maxPolarFor('cut')).toBeGreaterThan(Math.PI / 2)
  })
})
