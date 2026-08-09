// ─── up-axis tests ────────────────────────────────────────────────────────────
// Which way is up was the one thing about a scan that could be wrong with no way
// to fix it. Every reader hardcoded Z-up, and the manual controls offered yaw
// only — so a Y-up scan (ARKit, photogrammetry, anything game-adjacent) arrived
// lying on its side and stayed there.
//
// These cover the three parts of the answer: infer it, let it be corrected, and
// make the correction stick.

import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { Bounds } from './pc-reader'
import { PlyReader } from './ply-reader'
import { effectiveTransform, saveCloudUpAxis, loadCloudUpAxis, clearCloudUpAxis } from './pc-align'
import { clampOffset, NO_OFFSET, MAX_LEVEL_DEG, type PointCloudAlignment } from './pc-types'

function boundsOf(min: [number, number, number], max: [number, number, number]): Bounds {
  const b = new Bounds()
  b.add(...min)
  b.add(...max)
  return b
}

// ── Inference ──────────────────────────────────────────────────────────────────

describe('Bounds.inferUpAxis', () => {
  it('reads a room scan as Y-up', () => {
    // 6 m × 2.5 m × 8 m — a room off a phone. The short axis is the vertical one.
    const b = boundsOf([0, 0, 0], [6, 2.5, 8])
    expect(b.inferUpAxis()).toEqual({ axis: 'y', confident: true })
  })

  it('reads an aerial survey as Z-up', () => {
    // 800 m × 600 m of ground with 40 m of relief.
    const b = boundsOf([0, 0, 0], [800, 600, 40])
    expect(b.inferUpAxis()).toEqual({ axis: 'z', confident: true })
  })

  it('refuses to call a near-cubic scan, and says so', () => {
    // No signal here. Guessing confidently would be worse than defaulting,
    // because a confident wrong answer stops the user looking for the control.
    const b = boundsOf([0, 0, 0], [10, 9, 10])
    expect(b.inferUpAxis()).toEqual({ axis: 'z', confident: false })
  })

  it('defaults to the survey convention when there is nothing to read', () => {
    expect(new Bounds().inferUpAxis()).toEqual({ axis: 'z', confident: false })
    expect(boundsOf([5, 5, 5], [5, 5, 5]).inferUpAxis().confident).toBe(false)
  })

  it('is not fooled by which horizontal axis is longer', () => {
    // A corridor: very long one way, narrower the other, shortest vertically.
    // Which horizontal axis is the long one is irrelevant — the comparison is
    // against the SMALLER horizontal candidate.
    expect(boundsOf([0, 0, 0], [40, 2.5, 6]).inferUpAxis()).toEqual({ axis: 'y', confident: true })
    expect(boundsOf([0, 0, 0], [40, 6, 2.5]).inferUpAxis()).toEqual({ axis: 'z', confident: true })
  })

  it('declines a corridor as narrow as it is tall, which is the honest answer', () => {
    // 40 m long, 3 m wide, 2.4 m high. A bounding box cannot tell the floor from
    // a wall here, and the margin is what stops it pretending otherwise. This is
    // the documented limit of the heuristic, not an oversight — the user gets
    // the default plus a switch, rather than a coin flip presented as a fact.
    expect(boundsOf([0, 0, 0], [40, 2.4, 3]).inferUpAxis().confident).toBe(false)
  })
})

// ── Provenance ─────────────────────────────────────────────────────────────────

describe('readers report where the up axis came from', () => {
  it('PLY infers it and admits that it did', async () => {
    // A room-shaped PLY: 6 wide, 2.5 tall in Y, 8 deep.
    const header = [
      'ply', 'format ascii 1.0', 'element vertex 4',
      'property float x', 'property float y', 'property float z', 'end_header',
    ].join('\n') + '\n'
    const body = '0 0 0\n6 0 0\n0 2.5 0\n0 0 8\n'
    const reader = new PlyReader(new File([header + body], 'room.ply'))
    const info = await reader.open()

    expect(info.frame.upAxis).toBe('y')
    // The claim that matters: it is marked as a guess, which is what makes the
    // panel offer the switch instead of stating it as fact.
    expect(info.frame.upAxisSource).toBe('assumed')
  })
})

// ── The transform ──────────────────────────────────────────────────────────────

function alignmentOf(patch: Partial<PointCloudAlignment> = {}): PointCloudAlignment {
  return {
    rung: 'local', confidence: 'high',
    origin: { x: 0, y: 0, z: 0 }, yawRad: 0, scale: 1, upAxis: 'z',
    reasons: [], offset: { ...NO_OFFSET },
    ...patch,
  }
}

/** Apply the transform exactly as point-cloud-system does. */
function quaternionFor(a: PointCloudAlignment): THREE.Quaternion {
  const t = effectiveTransform(a)
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(t.pitchRad, t.yawRad, t.rollRad, 'YXZ'),
  )
  if (t.tiltRad !== 0) {
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.tiltRad))
  }
  return q
}

describe('levelling', () => {
  it('leaves the old behaviour untouched when pitch and roll are zero', () => {
    // The regression that matters: adding two angles must not move a single
    // existing scan. With both at zero this has to reduce to yaw(Y) ∘ tilt(X).
    for (const [upAxis, yawRad] of [['z', 0], ['z', 0.7], ['y', -1.2]] as const) {
      const q = quaternionFor(alignmentOf({ upAxis, yawRad }))
      const legacy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad)
      if (upAxis === 'z') {
        legacy.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
      }
      // 1e-6 rad is 6e-5 degrees — the gap between composing a quaternion from
      // an Euler triple and from an axis-angle, and nothing else.
      expect(q.angleTo(legacy)).toBeLessThan(1e-6)
    }
  })

  it('puts source up at scene up for both conventions', () => {
    // The whole point. A Z-up source has its +Z raised to scene +Y; a Y-up
    // source is already there and must be left alone.
    const zUp = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternionFor(alignmentOf({ upAxis: 'z' })))
    expect(zUp.y).toBeCloseTo(1, 9)

    const yUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternionFor(alignmentOf({ upAxis: 'y' })))
    expect(yUp.y).toBeCloseTo(1, 9)
  })

  it('pitch tips the scan, measurably and in the right direction', () => {
    const level = alignmentOf({ upAxis: 'y' })
    const tipped = alignmentOf({
      upAxis: 'y', offset: { ...NO_OFFSET, pitchDeg: 10 },
    })
    const up = new THREE.Vector3(0, 1, 0)
    expect(up.clone().applyQuaternion(quaternionFor(level)).y).toBeCloseTo(1, 9)

    const after = up.clone().applyQuaternion(quaternionFor(tipped))
    expect(after.y).toBeCloseTo(Math.cos(10 * Math.PI / 180), 6)
    // Pitch about +X tips the top toward +Z.
    expect(after.z).toBeGreaterThan(0)
  })

  it('roll drops one side', () => {
    const rolled = alignmentOf({ upAxis: 'y', offset: { ...NO_OFFSET, rollDeg: 10 } })
    const after = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternionFor(rolled))
    expect(after.y).toBeCloseTo(Math.cos(10 * Math.PI / 180), 6)
    expect(Math.abs(after.x)).toBeGreaterThan(0.1)
  })

  it('levelling composes with a corrected up axis rather than fighting it', () => {
    // The structural tilt is applied FIRST, so once the axis is right the
    // sliders behave in scene terms. Same nudge, same result, either convention.
    const fromZ = quaternionFor(alignmentOf({ upAxis: 'z', offset: { ...NO_OFFSET, pitchDeg: 8 } }))
    const fromY = quaternionFor(alignmentOf({ upAxis: 'y', offset: { ...NO_OFFSET, pitchDeg: 8 } }))
    const upZ = new THREE.Vector3(0, 0, 1).applyQuaternion(fromZ)
    const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(fromY)
    expect(upZ.y).toBeCloseTo(upY.y, 9)
    expect(upZ.z).toBeCloseTo(upY.z, 9)
  })
})

// ── Clamping and backward compatibility ────────────────────────────────────────

describe('clampOffset with the levelling angles', () => {
  it('defaults them for a placement saved before they existed', () => {
    // Real stored data: offsets written by earlier builds have no pitch or roll.
    // They must read back as level, not as NaN, and not as undefined.
    const legacy = { x: 3, y: 0, z: -2, yawDeg: 45, scaleMul: 1.5 }
    const out = clampOffset(legacy)
    expect(out.pitchDeg).toBe(0)
    expect(out.rollDeg).toBe(0)
    expect(out.yawDeg).toBe(45)
    expect(out.x).toBe(3)
  })

  it('clamps to the levelling range rather than allowing free rotation', () => {
    expect(clampOffset({ pitchDeg: 200 }).pitchDeg).toBe(MAX_LEVEL_DEG)
    expect(clampOffset({ rollDeg: -200 }).rollDeg).toBe(-MAX_LEVEL_DEG)
    expect(clampOffset({ pitchDeg: NaN }).pitchDeg).toBe(0)
  })
})

// ── Persistence ────────────────────────────────────────────────────────────────

describe('a corrected up axis is remembered', () => {
  const KEY = 'scan.ply:2048:99'
  beforeEach(() => { clearCloudUpAxis(KEY) })

  it('round-trips, so correcting a scan once is enough', () => {
    expect(loadCloudUpAxis(KEY)).toBeNull()
    saveCloudUpAxis(KEY, 'y')
    expect(loadCloudUpAxis(KEY)).toBe('y')
  })

  it('is per file, so one correction does not follow every other scan', () => {
    saveCloudUpAxis(KEY, 'y')
    expect(loadCloudUpAxis('other.ply:1:1')).toBeNull()
  })

  it('ignores a corrupted entry instead of throwing', () => {
    localStorage.setItem('ifc-pc-upaxis:v1:' + KEY, '{not json')
    expect(loadCloudUpAxis(KEY)).toBeNull()
    localStorage.setItem('ifc-pc-upaxis:v1:' + KEY, JSON.stringify({ v: 1, axis: 'sideways' }))
    expect(loadCloudUpAxis(KEY)).toBeNull()
  })
})
