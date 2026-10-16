// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { fitStopToScreen, type Vec3 } from './fit-stop'

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
const stop = { position: { x: 150, y: 60, z: 90 }, target: { x: 80, y: 35, z: -15 }, fovDeg: 60 }

describe('fitStopToScreen', () => {
  it('leaves a desktop exactly as recorded', () => {
    const r = fitStopToScreen({ ...stop, viewW: 1440, viewH: 900, coverBottomPx: 140 })
    expect(r).toEqual({ position: stop.position, target: stop.target })
  })

  it('on an upright phone backs off along the same line of sight, at most 1.6×', () => {
    const r = fitStopToScreen({ ...stop, viewW: 390, viewH: 664, coverBottomPx: 230 })
    const before = sub(stop.position, stop.target), after = sub(r.position, r.target)
    const k = len(after) / len(before)
    expect(k).toBeGreaterThan(1.2)
    expect(k).toBeLessThanOrEqual(1.6 + 1e-9)
    // Same direction: the stop still looks at the building from where it did.
    const dot = (before.x * after.x + before.y * after.y + before.z * after.z) / (len(before) * len(after))
    expect(dot).toBeCloseTo(1, 9)
  })

  it('puts the recorded target in the middle of what the bar leaves visible', () => {
    const viewW = 390, viewH = 664, cover = 230
    const r = fitStopToScreen({ ...stop, viewW, viewH, coverBottomPx: cover })
    // Project the ORIGINAL target with the new camera: its height on screen.
    const f = sub(r.target, r.position); const fl = len(f)
    const fwd = { x: f.x / fl, y: f.y / fl, z: f.z / fl }
    const to = sub(stop.target, r.position)
    const along = to.x * fwd.x + to.y * fwd.y + to.z * fwd.z
    const up = sub(stop.target, r.target) // the lift, along the camera's up
    const yNdc = (len(up) / along) / Math.tan((60 * Math.PI) / 360)
    const pxAboveCentre = (yNdc * viewH) / 2
    expect(pxAboveCentre).toBeCloseTo(cover / 2, 0)
    expect(up.y).toBeGreaterThan(0) // the scene was lifted, not lowered
  })

  it('copes with a stop looking straight down', () => {
    const top = { position: { x: 0, y: 100, z: 0 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 60 }
    const r = fitStopToScreen({ ...top, viewW: 390, viewH: 664, coverBottomPx: 200 })
    expect(Number.isFinite(r.position.x + r.position.y + r.position.z)).toBe(true)
    expect(r.target.y).toBeCloseTo(0, 9) // the lift is horizontal there
  })

  it('does nothing odd with a degenerate pose or an empty view', () => {
    const same = { position: { x: 1, y: 2, z: 3 }, target: { x: 1, y: 2, z: 3 }, fovDeg: 60 }
    expect(fitStopToScreen({ ...same, viewW: 390, viewH: 664, coverBottomPx: 200 })).toEqual({ position: same.position, target: same.target })
    expect(fitStopToScreen({ ...stop, viewW: 0, viewH: 0, coverBottomPx: 0 })).toEqual({ position: stop.position, target: stop.target })
  })
})
