// ─── the neighbourhood, drawn over the flood ─────────────────────────────────
// Two things the water layer cannot say on its own:
//
//   the course a river used to take — a dashed violet line on the ground,
//   so the water that collects along it reads as what it is;
//   the neighbouring buildings the water reaches — their outline at street
//   level, from amber (a few centimetres) to red (half a metre and more).
//
// Lines only, on the viewer's scene; never pickable (the IFC keeps the clicks).

import * as THREE from 'three'
import type { PlanPoint } from '../raster/frame'

/** Densify a polyline so it follows the ground between far-apart vertices. */
function densify(line: PlanPoint[], stepM: number): PlanPoint[] {
  const out: PlanPoint[] = []
  for (let k = 0; k + 1 < line.length; k++) {
    const p = line[k], q = line[k + 1]
    const len = Math.hypot(q.x - p.x, q.z - p.z)
    const n = Math.max(1, Math.ceil(len / stepM))
    for (let s = 0; s < n; s++) out.push({ x: p.x + ((q.x - p.x) * s) / n, z: p.z + ((q.z - p.z) * s) / n })
  }
  if (line.length) out.push(line[line.length - 1])
  return out
}

function unpickable<T extends THREE.Object3D>(o: T, name: string, order: number): T {
  o.name = name
  o.renderOrder = order
  o.frustumCulled = false
  o.raycast = () => { /* the IFC keeps the clicks */ }
  return o
}

/** The old courses, dashed, `liftM` above the ground (and the water) under them. */
export function createOldCourseLines(lines: PlanPoint[][], groundY: (x: number, z: number) => number, liftM = 0.35): THREE.LineSegments {
  const pos: number[] = []
  for (const line of lines) {
    const pts = densify(line, 4)
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1]
      pos.push(a.x, groundY(a.x, a.z) + liftM, a.z, b.x, groundY(b.x, b.z) + liftM, b.z)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const lines3 = new THREE.LineSegments(g, new THREE.LineDashedMaterial({
    color: 0xb08cff, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.95, depthWrite: false,
  }))
  lines3.computeLineDistances()
  return unpickable(lines3, 'flood-old-course', 7)
}

/** Amber → red by depth (5 cm … 50 cm). */
function depthColour(d: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (d - 0.05) / 0.45))
  return new THREE.Color().setRGB(1, 0.75 * (1 - t) + 0.18 * t, 0.2 * (1 - t) + 0.16 * t)
}

/** Outlines of the reached buildings at street level. */
export function createReachedOutlines(items: Array<{ ring: PlanPoint[]; depth: number }>, groundY: (x: number, z: number) => number): THREE.LineSegments {
  const pos: number[] = []
  const col: number[] = []
  for (const it of items) {
    const c = depthColour(it.depth)
    const pts = densify([...it.ring, it.ring[0]], 3)
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1]
      pos.push(a.x, groundY(a.x, a.z) + 0.15, a.z, b.x, groundY(b.x, b.z) + 0.15, b.z)
      col.push(c.r, c.g, c.b, c.r, c.g, c.b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return unpickable(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthWrite: false, transparent: true })), 'flood-reached', 8)
}

export function disposeLines(o: THREE.LineSegments | null): void {
  if (!o) return
  o.removeFromParent()
  o.geometry.dispose()
  ;(o.material as THREE.Material).dispose()
}
