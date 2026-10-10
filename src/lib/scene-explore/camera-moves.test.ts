import { describe, it, expect } from 'vitest'
import {
  zoomPose, orbitPose, topPose, isTopPose, focusPose, poseDistance, MIN_DISTANCE_M, MAX_DISTANCE_M, type Pose,
} from './camera-moves'

const pose: Pose = { position: { x: 0, y: 30, z: 40 }, target: { x: 0, y: 0, z: 0 } } // 50 m away

describe('zoom', () => {
  it('moves along the line of sight and keeps the target', () => {
    const p = zoomPose(pose, 0.5)
    expect(poseDistance(p)).toBeCloseTo(25, 9)
    expect(p.target).toEqual(pose.target)
    expect(p.position.y / p.position.z).toBeCloseTo(30 / 40, 9) // same direction
  })

  it('backs away by at least a useful step, even from very close', () => {
    const close: Pose = { position: { x: 0, y: 0.6, z: 0.8 }, target: { x: 0, y: 0, z: 0 } } // 1 m
    expect(poseDistance(zoomPose(close, 1.65))).toBeCloseTo(13, 9)
  })

  it('stops at the near and far limits', () => {
    expect(poseDistance(zoomPose(pose, 1e-6))).toBeCloseTo(MIN_DISTANCE_M, 9)
    expect(poseDistance(zoomPose(pose, 1e6))).toBeCloseTo(MAX_DISTANCE_M, 6)
  })
})

describe('orbit', () => {
  it('turns about the vertical, keeping height and distance', () => {
    const p = orbitPose(pose, Math.PI / 2)
    expect(p.position.y).toBeCloseTo(30, 9)
    expect(poseDistance(p)).toBeCloseTo(50, 9)
    // +90° about +Y takes +z to +x.
    expect(p.position.x).toBeCloseTo(40, 9)
    expect(p.position.z).toBeCloseTo(0, 9)
  })
})

describe('top view', () => {
  it('looks straight down from the same distance, north up', () => {
    const p = topPose(pose)
    expect(isTopPose(p)).toBe(true)
    expect(isTopPose(pose)).toBe(false)
    expect(poseDistance(p)).toBeCloseTo(50, 3)
    expect(p.position.z).toBeGreaterThan(p.target.z) // camera south of the target: north is up on screen
  })
})

describe('focus with context', () => {
  // A 30 cm dock post 300 m from the target.
  const post = { min: { x: 300, y: 0, z: -2 }, max: { x: 300.3, y: 1.2, z: -1.7 } }

  it('never dives into a small element: it shows it with its surroundings', () => {
    const p = focusPose(pose, post)
    expect(p.target.x).toBeCloseTo(300.15, 6)
    expect(poseDistance(p)).toBeGreaterThan(40) // 18 m radius × 2.6, not a metre
  })

  it('keeps the direction it looked from', () => {
    const p = focusPose(pose, post)
    const d = { x: p.position.x - p.target.x, y: p.position.y - p.target.y, z: p.position.z - p.target.z }
    expect(d.x).toBeCloseTo(0, 6) // was looking from +z, still is
    expect(d.y / d.z).toBeCloseTo(30 / 40, 6)
  })

  it('lifts a flat view so the ground around it shows', () => {
    const flat: Pose = { position: { x: 0, y: 1, z: 100 }, target: { x: 0, y: 0, z: 0 } }
    const p = focusPose(flat, post)
    const elev = Math.atan2(p.position.y - p.target.y, Math.hypot(p.position.x - p.target.x, p.position.z - p.target.z))
    expect(elev * 180 / Math.PI).toBeCloseTo(22, 6)
  })

  it('stands back further for a big model', () => {
    const station = { min: { x: -100, y: 0, z: -300 }, max: { x: 120, y: 50, z: 340 } }
    expect(poseDistance(focusPose(pose, station))).toBeGreaterThan(800)
  })
})
