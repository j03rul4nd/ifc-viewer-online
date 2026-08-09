// ─── pc-pick tests ────────────────────────────────────────────────────────────
// Picking has one decision in it that is easy to get subtly wrong — which point
// wins when several are near the ray — and getting it wrong means clicks that
// reach through a wall and grab what is behind it. That decision is a pure
// function here so it can be pinned down exactly.

import { describe, it, expect } from 'vitest'
import { raySphereDistance, pickInPositions, pickThresholdAt, type Ray } from './pc-pick'

/** A ray down −Z from the origin, which is where a default camera looks. */
const DOWN_Z: Ray = { origin: { x: 0, y: 0, z: 10 }, direction: { x: 0, y: 0, z: -1 } }

function positions(points: Array<[number, number, number]>): Float32Array {
  const out = new Float32Array(points.length * 3)
  points.forEach(([x, y, z], i) => { out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z })
  return out
}

// ── Sphere prefilter ───────────────────────────────────────────────────────────

describe('raySphereDistance', () => {
  it('reports the near intersection for a sphere ahead', () => {
    // Sphere at z = 0, radius 1 → the ray from z = 10 first touches it at t = 9.
    expect(raySphereDistance(DOWN_Z, { x: 0, y: 0, z: 0 }, 1)).toBeCloseTo(9, 6)
  })

  it('misses a sphere off to the side', () => {
    expect(raySphereDistance(DOWN_Z, { x: 5, y: 0, z: 0 }, 1)).toBeNull()
  })

  it('rejects a sphere entirely behind the ray', () => {
    expect(raySphereDistance(DOWN_Z, { x: 0, y: 0, z: 50 }, 1)).toBeNull()
  })

  it('returns 0 when the ray starts inside the sphere', () => {
    // A camera standing inside a chunk must not skip it.
    expect(raySphereDistance(DOWN_Z, { x: 0, y: 0, z: 10 }, 5)).toBe(0)
  })

  it('grazing counts as a hit — the prefilter must not be tighter than the pick', () => {
    expect(raySphereDistance(DOWN_Z, { x: 1, y: 0, z: 0 }, 1)).not.toBeNull()
  })
})

// ── Point pick ─────────────────────────────────────────────────────────────────

describe('pickInPositions', () => {
  it('finds a point sitting on the ray', () => {
    const hit = pickInPositions(DOWN_Z, positions([[0, 0, 0]]), 1, 0.5)
    expect(hit).not.toBeNull()
    expect(hit!.index).toBe(0)
    expect(hit!.t).toBeCloseTo(10, 6)
    expect(hit!.offset).toBeCloseTo(0, 6)
    expect(hit!.point).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('ignores points further from the ray than the threshold', () => {
    expect(pickInPositions(DOWN_Z, positions([[2, 0, 0]]), 1, 0.5)).toBeNull()
    expect(pickInPositions(DOWN_Z, positions([[0.4, 0, 0]]), 1, 0.5)).not.toBeNull()
  })

  it('takes the NEAREST point along the ray, not the closest to it', () => {
    // The far point is dead centre; the near one is slightly off-axis. A click
    // means the near surface — preferring the mathematically closest would reach
    // straight through a wall and grab what is behind it.
    const hit = pickInPositions(DOWN_Z, positions([
      [0, 0, -50],     // far, perfectly on the ray
      [0.3, 0, 0],     // near, slightly off
    ]), 2, 0.5)
    expect(hit!.index).toBe(1)
  })

  it('ignores points behind the camera', () => {
    expect(pickInPositions(DOWN_Z, positions([[0, 0, 20]]), 1, 0.5)).toBeNull()
  })

  it('honours the point count, so only the DRAWN range is scanned', () => {
    // LOD has already decided what is visible; picking an undrawn point would
    // report something the user cannot see.
    const buf = positions([[5, 0, 0], [0, 0, 0]])
    expect(pickInPositions(DOWN_Z, buf, 1, 0.5)).toBeNull()   // only the first
    expect(pickInPositions(DOWN_Z, buf, 2, 0.5)).not.toBeNull()
  })

  it('applies a chunk origin without copying the array', () => {
    // Chunk positions are stored relative to the chunk centre; the origin has to
    // be added at scan time or every pick lands in the wrong place.
    const hit = pickInPositions(DOWN_Z, positions([[0, 0, 0]]), 1, 0.5, { x: 0, y: 0, z: -5 })
    expect(hit).not.toBeNull()
    expect(hit!.point).toEqual({ x: 0, y: 0, z: -5 })
    expect(hit!.t).toBeCloseTo(15, 6)
  })

  it('returns null for an empty set', () => {
    expect(pickInPositions(DOWN_Z, new Float32Array(0), 0, 1)).toBeNull()
  })

  it('reports the perpendicular offset, for a confidence read-out', () => {
    const hit = pickInPositions(DOWN_Z, positions([[0.3, 0.4, 0]]), 1, 1)
    expect(hit!.offset).toBeCloseTo(0.5, 6)
  })
})

// ── Screen-space tolerance ─────────────────────────────────────────────────────

describe('pickThresholdAt', () => {
  it('grows with distance, so the tolerance is constant on screen', () => {
    const near = pickThresholdAt(10, 8, 1000)
    const far = pickThresholdAt(100, 8, 1000)
    expect(far).toBeCloseTo(near * 10, 6)
  })

  it('is the pixel tolerance divided by the projection factor, times distance', () => {
    expect(pickThresholdAt(500, 10, 1000)).toBeCloseTo(5, 6)
  })

  it('does not collapse to zero at the camera', () => {
    expect(pickThresholdAt(0, 8, 1000)).toBeGreaterThan(0)
  })
})
