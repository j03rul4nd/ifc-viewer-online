import * as THREE from 'three'
import type { NumberSink } from './growable-array'

/** Open metal railing. Dimensions are illustrative, not surveyed fabrication. */
export function appendBridgeRailing(
  positions: NumberSink, colors: NumberSink, a: THREE.Vector3, b: THREE.Vector3,
  unit: number, tone: [number, number, number], heightM = 1.1,
): void {
  const delta = b.clone().sub(a)
  const length = Math.hypot(delta.x, delta.y)
  if (length < unit * 0.001) return
  const side = new THREE.Vector3(-delta.y / length, delta.x / length, 0)
  const prism = (p: THREE.Vector3, q: THREE.Vector3, width: number, height: number): void => {
    const corners = [p, q].flatMap(v => [
      v.clone().addScaledVector(side, -width / 2),
      v.clone().addScaledVector(side, width / 2),
      v.clone().addScaledVector(side, width / 2).add(new THREE.Vector3(0, 0, height)),
      v.clone().addScaledVector(side, -width / 2).add(new THREE.Vector3(0, 0, height)),
    ])
    for (const [i, j, k, l] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]]) {
      for (const index of [i,j,k,i,k,l]) {
        const v = corners[index]
        positions.push(v.x, v.y, v.z)
        colors.push(...tone)
      }
    }
  }
  // Low curb, intermediate rails and handrail leave the deck visible through them.
  for (const [z, w, h] of [[0, .16, .16], [.42, .035, .035], [.72, .035, .035], [heightM - .06, .065, .06]]) {
    const lift = new THREE.Vector3(0, 0, z * unit)
    prism(a.clone().add(lift), b.clone().add(lift), w * unit, h * unit)
  }
  const bays = Math.max(1, Math.ceil(length / (1.8 * unit)))
  const tangent = new THREE.Vector3(delta.x / length, delta.y / length, 0)
  for (let i = 0; i < bays; i++) {
    const p = a.clone().lerp(b, (i + .5) / bays)
    prism(p.clone().addScaledVector(tangent, -.025 * unit), p.clone().addScaledVector(tangent, .025 * unit), .05 * unit, heightM * unit)
  }
}
