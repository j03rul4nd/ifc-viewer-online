import { describe, it, expect } from 'vitest'
import { northScreenAngle, pitchDeg, scaleBar, metresPerPixel, type ViewLike } from './map-furniture'

const DEG = Math.PI / 180
/** Camera looking at the origin from `azimuthDeg` (0 = from the south, looking north) and `pitch`. */
function view(azimuthDeg: number, pitch: number, dist = 1000): ViewLike {
  const a = azimuthDeg * DEG, p = pitch * DEG
  // Forward (unit): horizontal component points toward azimuth (0 → −z = north).
  const fx = Math.sin(a) * Math.cos(p), fz = -Math.cos(a) * Math.cos(p), fy = -Math.sin(p)
  return {
    position: { x: -fx * dist, y: -fy * dist, z: -fz * dist }, target: { x: 0, y: 0, z: 0 },
    direction: { x: fx, y: fy, z: fz }, fovDeg: 60, aspect: 1.5,
  }
}

describe('north arrow', () => {
  it('looking north on an unrotated site, north is up', () => {
    expect(northScreenAngle(view(0, 60), 0)).toBeCloseTo(0)
  })
  it('looking east, north is to the left (−90°)', () => {
    expect(northScreenAngle(view(90, 60), 0) / DEG).toBeCloseTo(-90)
  })
  it('a site rotated 30° turns the arrow by 30°', () => {
    expect(northScreenAngle(view(0, 60), 30) / DEG).toBeCloseTo(30)
  })
  it('straight down still gives an answer', () => {
    expect(Number.isFinite(northScreenAngle(view(0, 90), 0))).toBe(true)
  })
})

describe('scale bar', () => {
  it('only for views that look down enough', () => {
    expect(pitchDeg(view(0, 70))).toBeCloseTo(70)
    expect(scaleBar(view(0, 30), 800)).toBeNull()
    expect(scaleBar(view(0, 70), 800)).not.toBeNull()
  })
  it('picks a round length that fits, at the true metres per pixel', () => {
    const v = view(0, 89, 1000)
    const mpp = metresPerPixel(v, 800)!
    // 2·1000·tan(30°) / 800 ≈ 1.443 m/px
    expect(mpp).toBeCloseTo(1.4434, 3)
    const bar = scaleBar(v, 800, 96)!
    expect([1, 2, 5].some((m) => bar.metres / 10 ** Math.floor(Math.log10(bar.metres)) === m)).toBe(true)
    expect(bar.px).toBeLessThanOrEqual(96)
    expect(bar.px).toBeGreaterThan(96 / 2.5)
    expect(bar.label).toBe('100 m')
  })
  it('orthographic views use their visible height, at any pitch', () => {
    const bar = scaleBar({ ...view(0, 20), orthoWorldHeight: 4000 }, 800, 100)!
    expect(bar.label).toBe('500 m')
    expect(bar.px).toBeCloseTo(100)
  })
})
