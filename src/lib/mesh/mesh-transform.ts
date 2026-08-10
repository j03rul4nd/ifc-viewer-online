// ─── mesh-transform ───────────────────────────────────────────────────────────
// Frame + manual placement → the TRS the scene applies. Pure, so the composition
// can be checked without a renderer.
//
// Deliberately the same decomposition point clouds use — position, yaw, the two
// levelling angles, a structural tilt for a Z-up source, uniform scale. A scan
// and a mesh of the same room have to land the same way, and they only do that
// if they are placed by the same arithmetic.

import { NO_OFFSET } from '../pointcloud/pc-types'
import type { AlignmentOffset, MeshFrame } from './mesh-types'

const DEG = Math.PI / 180

export interface EffectivePlacement {
  position: { x: number; y: number; z: number }
  yawRad: number
  pitchRad: number
  rollRad: number
  /** −90° about X when the source is Z-up, laying it into the Y-up scene. */
  tiltRad: number
  /** Source unit → scene metre, including the user's multiplier. */
  scale: number
}

export function effectivePlacement(
  frame: MeshFrame, placement: AlignmentOffset | null,
): EffectivePlacement {
  const p = placement ?? NO_OFFSET
  return {
    position: { x: p.x, y: p.y, z: p.z },
    yawRad: p.yawDeg * DEG,
    pitchRad: (p.pitchDeg || 0) * DEG,
    rollRad: (p.rollDeg || 0) * DEG,
    tiltRad: frame.upAxis === 'z' ? -Math.PI / 2 : 0,
    // The unit conversion and the user's nudge are ONE scale, not two applied in
    // sequence: a mesh read as millimetres and then nudged to 1.1× must end up
    // at 0.0011, not at some order of magnitude nobody chose.
    scale: frame.unitScale * (p.scaleMul || 1),
  }
}
