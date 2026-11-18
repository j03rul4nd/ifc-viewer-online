import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applyFitToAlignment, POINT_PAIRS_REASON } from './fit-to-alignment'
import { effectiveTransform } from '../pointcloud/pc-align'
import type { PointCloudAlignment } from '../pointcloud/pc-types'
import type { FitResult } from './rigid-fit'

let seed = 12345
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
const range = (a: number, b: number) => a + (b - a) * rnd()
const DEG = Math.PI / 180

/** Exactly how point-cloud-system.ts places the cloud root. */
function place(a: PointCloudAlignment, src: THREE.Vector3): THREE.Vector3 {
  const t = effectiveTransform(a)
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.pitchRad, t.yawRad, t.rollRad, 'YXZ'))
  if (t.tiltRad !== 0) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.tiltRad))
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(t.position.x, t.position.y, t.position.z), q, new THREE.Vector3(t.scale, t.scale, t.scale))
  return src.clone().applyMatrix4(m)
}

function randomAlignment(): PointCloudAlignment {
  return {
    rung: 'local', confidence: 'approximate',
    origin: { x: range(-500, 500), y: range(-20, 20), z: range(-500, 500) },
    yawRad: range(-Math.PI, Math.PI), scale: range(0.001, 2), upAxis: rnd() < 0.5 ? 'z' : 'y',
    reasons: ['align.reason.local'],
    offset: { x: range(-5, 5), y: range(-1, 1), z: range(-5, 5), yawDeg: range(-180, 180),
      pitchDeg: range(-15, 15), rollDeg: range(-15, 15), scaleMul: range(0.9, 1.1) },
  }
}

function randomFit(maxTiltDeg: number): FitResult {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    range(-maxTiltDeg, maxTiltDeg) * DEG, range(-Math.PI, Math.PI), range(-maxTiltDeg, maxTiltDeg) * DEG, 'YXZ'))
  const e = new THREE.Matrix4().makeRotationFromQuaternion(q).elements // column-major
  const rotation = [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]]
  return { rotation, translation: [range(-50, 50), range(-5, 5), range(-50, 50)], yawRad: 0,
    residualsM: [], fitRmseM: 0, looRmseM: null, alignmentRmseM: 0 }
}

const applyFit = (f: FitResult, p: THREE.Vector3) => {
  const R = f.rotation
  return new THREE.Vector3(
    R[0] * p.x + R[1] * p.y + R[2] * p.z + f.translation[0],
    R[3] * p.x + R[4] * p.y + R[5] * p.z + f.translation[1],
    R[6] * p.x + R[7] * p.y + R[8] * p.z + f.translation[2])
}

describe('applyFitToAlignment', () => {
  it('effectiveTransform(result) == fit ∘ effectiveTransform(current) within 1e-6 m', () => {
    let worst = 0
    for (let k = 0; k < 300; k++) {
      const cur = randomAlignment()
      const fit = randomFit(10)
      const r = applyFitToAlignment(cur, fit)
      if ('error' in r) throw new Error('unexpected ' + r.error)
      for (let i = 0; i < 8; i++) {
        const src = new THREE.Vector3(range(-100, 100), range(-100, 100), range(-100, 100))
        worst = Math.max(worst, place(r.alignment, src).distanceTo(applyFit(fit, place(cur, src))))
      }
    }
    expect(worst).toBeLessThan(1e-6)
  })

  it('refuses a tilt beyond MAX_LEVEL_DEG instead of clamping', () => {
    const cur = randomAlignment()
    cur.offset = { ...cur.offset, pitchDeg: 0, rollDeg: 0 }
    const a = 60 * DEG
    const fit = randomFit(0)
    fit.rotation = [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)]
    expect(applyFitToAlignment(cur, fit)).toEqual({ error: 'tilt-out-of-range' })
  })

  it('keeps scaleMul, marks manual and adds the pointPairs reason once', () => {
    const cur = randomAlignment()
    const r = applyFitToAlignment(cur, randomFit(5))
    if ('error' in r) throw new Error('unexpected')
    expect(r.alignment.offset.scaleMul).toBe(cur.offset.scaleMul)
    expect(r.alignment.rung).toBe('manual')
    expect(r.alignment.confidence).toBe('manual')
    expect(r.alignment.reasons).toEqual(['align.reason.local', POINT_PAIRS_REASON])
    const again = applyFitToAlignment(r.alignment, randomFit(0))
    if ('error' in again) throw new Error('unexpected')
    expect(again.alignment.reasons.filter((x) => x === POINT_PAIRS_REASON)).toHaveLength(1)
  })
})
