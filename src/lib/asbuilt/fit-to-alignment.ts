/**
 * Compose a rigid fit (T-401; maps CURRENT cloud world positions -> model) onto the
 * cloud's existing alignment, so the cloud on screen is the scored cloud.
 *
 * The cloud root is placed as (point-cloud-system.ts):
 *   world = position + scale * Ry(yaw) Rx(pitch) Rz(roll) * tilt * src      (Euler 'YXZ')
 * With the fit (Rf, tf): world' = (Rf position + tf) + scale * (Rf Ry Rx Rz) * tilt * src.
 * So we decompose Rf Ry Rx Rz back into YXZ Euler angles and write the delta into the offset.
 * Pure: no three.js.
 */
import type { PointCloudAlignment, AlignmentOffset } from '../pointcloud/pc-types'
import { MAX_LEVEL_DEG } from '../pointcloud/pc-types'
import type { FitResult } from './rigid-fit'

const DEG = Math.PI / 180
export const POINT_PAIRS_REASON = 'align.reason.pointPairs'

type M3 = number[]
const mul = (a: M3, b: M3): M3 => {
  const r = new Array<number>(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
  return r
}
const rx = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c] }
const ry = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c] }
const rz = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1] }

/** Same decomposition as THREE.Euler.setFromRotationMatrix(…, 'YXZ'). */
function eulerYXZ(m: M3): { yaw: number; pitch: number; roll: number } {
  const m23 = Math.max(-1, Math.min(1, m[5]))
  const pitch = Math.asin(-m23)
  if (Math.abs(m23) < 0.9999999) return { pitch, yaw: Math.atan2(m[2], m[8]), roll: Math.atan2(m[3], m[4]) }
  return { pitch, yaw: Math.atan2(-m[6], m[0]), roll: 0 }
}

const wrapDeg = (d: number): number => {
  let r = d % 360
  if (r > 180) r -= 360
  if (r <= -180) r += 360
  return r
}

export function applyFitToAlignment(
  current: PointCloudAlignment,
  fit: FitResult,
): { alignment: PointCloudAlignment } | { error: 'tilt-out-of-range' } {
  const o: AlignmentOffset = current.offset
  const R0 = mul(mul(ry(current.yawRad + o.yawDeg * DEG), rx((o.pitchDeg || 0) * DEG)), rz((o.rollDeg || 0) * DEG))
  const e = eulerYXZ(mul(fit.rotation, R0))
  const pitchDeg = e.pitch / DEG
  const rollDeg = e.roll / DEG
  if (Math.abs(pitchDeg) > MAX_LEVEL_DEG || Math.abs(rollDeg) > MAX_LEVEL_DEG) return { error: 'tilt-out-of-range' }

  const P = [current.origin.x + o.x, current.origin.y + o.y, current.origin.z + o.z]
  const R = fit.rotation, t = fit.translation
  const np = [0, 1, 2].map((i) => R[i * 3] * P[0] + R[i * 3 + 1] * P[1] + R[i * 3 + 2] * P[2] + t[i])

  const offset: AlignmentOffset = {
    x: np[0] - current.origin.x,
    y: np[1] - current.origin.y,
    z: np[2] - current.origin.z,
    yawDeg: wrapDeg((e.yaw - current.yawRad) / DEG),
    pitchDeg,
    rollDeg,
    scaleMul: o.scaleMul,
  }
  const reasons = current.reasons.includes(POINT_PAIRS_REASON) ? current.reasons.slice() : [...current.reasons, POINT_PAIRS_REASON]
  return { alignment: { ...current, rung: 'manual', confidence: 'manual', reasons, offset } }
}
