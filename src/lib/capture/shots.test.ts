import { describe, expect, it } from 'vitest'
import { cameraAt, defaultShot, fitDistance, orbitPoint, shotFrameTimes, SHOT_TYPES, type Bounds, type Vec3 } from './shots'

const building: Bounds = { center: { x: 0, y: 10, z: 0 }, size: { x: 40, y: 20, z: 30 } }
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

describe('framing', () => {
  it('stands further back for a vertical frame than a wide one', () => {
    const vertical = fitDistance(building, 45, 9 / 16)
    const wide = fitDistance(building, 45, 16 / 9)
    expect(vertical).toBeGreaterThan(wide * 1.5)
  })

  it('keeps the whole bounding sphere inside the narrower field of view', () => {
    for (const aspect of [9 / 16, 4 / 5, 1, 16 / 9]) {
      const d = fitDistance(building, 45, aspect, 1)
      const r = Math.hypot(40, 20, 30) / 2
      const vfov = (45 * Math.PI) / 180
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
      // Angular radius of the sphere seen from d must fit in half the narrow fov.
      expect(Math.asin(r / d)).toBeLessThanOrEqual(Math.min(vfov, hfov) / 2 + 1e-9)
    }
  })
})

describe('camera moves', () => {
  it('orbit keeps a constant distance and sweeps the requested angle', () => {
    const s = defaultShot('orbit', building, 9 / 16, 4)
    const a = cameraAt(s, 0)
    const b = cameraAt(s, 4)
    expect(dist(a.position, building.center)).toBeCloseTo(dist(b.position, building.center))
    const ha = Math.atan2(a.position.x, a.position.z)
    const hb = Math.atan2(b.position.x, b.position.z)
    expect(((hb - ha) * 180) / Math.PI).toBeCloseTo(s.sweepDeg, 3)
  })

  it('dollyIn gets closer, crane gets higher, reveal pulls out', () => {
    const dolly = defaultShot('dollyIn', building, 1, 3)
    expect(dist(cameraAt(dolly, 3).position, building.center)).toBeLessThan(dist(cameraAt(dolly, 0).position, building.center))
    const crane = defaultShot('crane', building, 1, 3)
    expect(cameraAt(crane, 3).position.y).toBeGreaterThan(cameraAt(crane, 0).position.y)
    const reveal = defaultShot('reveal', building, 1, 3)
    expect(dist(cameraAt(reveal, 3).position, building.center)).toBeGreaterThan(dist(cameraAt(reveal, 0).position, building.center))
  })

  it('topDown starts looking straight down', () => {
    const p = cameraAt(defaultShot('topDown', building, 1, 3), 0)
    const flat = Math.hypot(p.position.x - p.target.x, p.position.z - p.target.z)
    expect(flat / (p.position.y - p.target.y)).toBeLessThan(0.05)
  })

  it('every shot type yields finite poses over its whole length', () => {
    for (const type of SHOT_TYPES) {
      const s = defaultShot(type, building, 9 / 16, 2)
      for (const t of [0, 0.5, 1, 1.5, 2, 5]) {
        const { position, target } = cameraAt(s, t)
        for (const v of [position.x, position.y, position.z, target.x, target.y, target.z]) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })
})

it('frame times cover the shot at the requested rate', () => {
  const times = shotFrameTimes(defaultShot('orbit', building, 1, 2), 30)
  expect(times).toHaveLength(60)
  expect(times[1]).toBeCloseTo(1 / 30)
})

it('orbitPoint at 0° elevation sits on the horizon', () => {
  expect(orbitPoint({ x: 0, y: 5, z: 0 }, 10, 0, 0)).toEqual({ x: 0, y: 5, z: 10 })
})

describe('tight framing', () => {
  // Project a world point with a look-at camera and return NDC x/y.
  function ndc(p: Vec3, eye: Vec3, target: Vec3, fovDeg: number, aspect: number) {
    const f = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z }
    const fl = Math.hypot(f.x, f.y, f.z); f.x /= fl; f.y /= fl; f.z /= fl
    let r = { x: f.y * 0 - f.z * 1, y: f.z * 0 - f.x * 0, z: f.x * 1 - f.y * 0 }
    const rl = Math.hypot(r.x, r.y, r.z); r = { x: r.x / rl, y: r.y / rl, z: r.z / rl }
    const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x }
    const v = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z }
    const z = v.x * f.x + v.y * f.y + v.z * f.z
    const t = Math.tan((fovDeg * Math.PI) / 360)
    return { x: (v.x * r.x + v.y * r.y + v.z * r.z) / (z * t * aspect), y: (v.x * u.x + v.y * u.y + v.z * u.z) / (z * t) }
  }

  it('puts every box corner inside the frame, and at least one near its edge', () => {
    for (const aspect of [9 / 16, 4 / 5, 16 / 9]) {
      const s = defaultShot('orbit', building, aspect, 4)
      for (const t of [0, 1, 2, 3, 4]) {
        const { position, target, fovDeg } = cameraAt(s, t)
        let maxAbs = 0
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          const c = { x: building.center.x + sx * 20, y: building.center.y + sy * 10, z: building.center.z + sz * 15 }
          const q = ndc(c, position, target, fovDeg, aspect)
          maxAbs = Math.max(maxAbs, Math.abs(q.x), Math.abs(q.y))
        }
        expect(maxAbs).toBeLessThanOrEqual(1 + 1e-6)
        // Tight: the model spans a good share of the frame, unlike the sphere fit.
        if (t === 0) expect(maxAbs).toBeGreaterThan(0.6)
      }
    }
  })

  it('is closer than the bounding-sphere fit for a long building', () => {
    const long = { center: { x: 0, y: 5, z: 0 }, size: { x: 9, y: 10, z: 27 } }
    const s = defaultShot('orbit', long, 9 / 16, 4)
    const eye = cameraAt(s, 0).position
    expect(dist(eye, long.center)).toBeLessThan(fitDistance(long, 45, 9 / 16, s.padding))
  })
})
