// ─── Drawing planes ───────────────────────────────────────────────────────────
// Pure vector maths for the surface the pen draws on. No three.js here, so the
// rules (what counts as edge-on, how a plane rotates) can be tested directly.

import type { SketchPlane, Vec3 } from './types'

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a)
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]
}

export const planeNormal = (p: SketchPlane): Vec3 => normalize(cross(p.u, p.v))

export type PlanePreset = 'ground' | 'front' | 'side'

export function presetPlane(preset: PlanePreset, origin: Vec3 = [0, 0, 0]): SketchPlane {
  switch (preset) {
    case 'ground': return { origin, u: [1, 0, 0], v: [0, 0, -1] }
    case 'front': return { origin, u: [1, 0, 0], v: [0, 1, 0] }
    case 'side': return { origin, u: [0, 0, -1], v: [0, 1, 0] }
  }
}

/** A plane through `origin` facing `normal`, keeping "up" as upright as it can. */
export function planeFromNormal(origin: Vec3, normal: Vec3): SketchPlane {
  const n = normalize(normal)
  // Straight up or down has no "up" of its own: fall back on -Z, like the ground preset.
  const reference: Vec3 = Math.abs(n[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0]
  const u = normalize(cross(reference, n))
  return { origin, u, v: normalize(cross(n, u)) }
}

const rotateAround = (a: Vec3, axis: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  // Rodrigues' rotation formula.
  return add(add(scale(a, c), scale(cross(axis, a), s)), scale(axis, dot(axis, a) * (1 - c)))
}

/** Rotate around a world axis through the plane's own origin. */
export function rotatePlane(p: SketchPlane, axis: Vec3, angle: number): SketchPlane {
  const n = normalize(axis)
  return { origin: p.origin, u: normalize(rotateAround(p.u, n, angle)), v: normalize(rotateAround(p.v, n, angle)) }
}

export function offsetPlane(p: SketchPlane, distance: number): SketchPlane {
  return { ...p, origin: add(p.origin, scale(planeNormal(p), distance)) }
}

export function movePlaneThrough(p: SketchPlane, point: Vec3): SketchPlane {
  return { ...p, origin: point }
}

/**
 * Where a ray meets the plane. Null when it is too close to edge-on: a point
 * there would land far away and the stroke would shoot off to the horizon.
 */
export const EDGE_ON_LIMIT = 0.06

export function intersectPlane(p: SketchPlane, rayOrigin: Vec3, rayDir: Vec3): Vec3 | null {
  const n = planeNormal(p)
  const facing = dot(n, normalize(rayDir))
  if (Math.abs(facing) < EDGE_ON_LIMIT) return null
  const t = dot(n, sub(p.origin, rayOrigin)) / dot(n, rayDir)
  if (t <= 0) return null
  return add(rayOrigin, scale(rayDir, t))
}

/** The plane is too edge-on to draw on from this direction. */
export function isEdgeOn(p: SketchPlane, viewDir: Vec3): boolean {
  return Math.abs(dot(planeNormal(p), normalize(viewDir))) < EDGE_ON_LIMIT
}
