// ─── where water from outside enters ──────────────────────────────────────────
// A river, a stream or a riera that comes INTO the simulated area brings water
// the rain on the area does not: its flood wave. This finds where each
// watercourse OpenStreetMap knows enters the grid — live ones and those that
// are gone or piped (an old riera in spate follows its old bed) — and turns a
// source (one of them, or a point the user picks) into the cells the discharge
// is spread over.
//
// OpenStreetMap draws a waterway in the direction it flows, so a course enters
// where its line first crosses from outside the grid to inside, or at its
// first point when it rises inside. A way that only continues another (rivers
// come in several ways) starts where the previous one ended: not an entry.
//
// Pure.

import { toGridLocal, type GridPlan, type PlanPoint } from './frame'
import type { ChannelClass } from '../../../lib/geo/osm-hydro'

/** A channel as the system holds it: its line in scene coordinates. */
export interface InflowChannel {
  id: string
  cls: ChannelClass
  name?: string
  historic: boolean
  culvert: boolean
  widthM: number
  line: PlanPoint[]
}

export interface InflowCandidate {
  id: string
  cls: ChannelClass
  name?: string
  historic: boolean
  culvert: boolean
  widthM: number
  /** Where it enters, scene (x, z). */
  entry: PlanPoint
  /** It crosses the grid's edge there (else it rises inside the area). */
  edge: boolean
}

export type InflowSource = { kind: 'channel'; id: string } | { kind: 'point'; x: number; z: number }

/** Scene (x, z) of grid-local (a, b). */
function toScene(plan: GridPlan, a: number, b: number): PlanPoint {
  const { originX, originZ, rotation } = plan.frame
  const c = Math.cos(rotation), s = Math.sin(rotation)
  return { x: originX + a * c - b * s, z: -(-originZ + a * s + b * c) }
}

/**
 * Where segment p → q enters the rectangle [0, W] × [0, H] (Liang–Barsky): the
 * parameter t in [0, 1], or null when it does not come in.
 */
function enterT(p: { a: number; b: number }, q: { a: number; b: number }, W: number, H: number): number | null {
  const da = q.a - p.a, db = q.b - p.b
  let t0 = 0, t1 = 1
  for (const [pk, qk] of [[-da, p.a], [da, W - p.a], [-db, p.b], [db, H - p.b]] as const) {
    if (pk === 0) { if (qk < 0) return null; continue }
    const r = qk / pk
    if (pk < 0) { if (r > t1) return null; if (r > t0) t0 = r }
    else { if (r < t0) return null; if (r < t1) t1 = r }
  }
  return t0 <= t1 ? t0 : null
}

/** The watercourses that enter the grid, widest first. */
export function inflowCandidates(plan: GridPlan, channels: InflowChannel[]): InflowCandidate[] {
  const W = plan.nx * plan.dx, H = plan.ny * plan.dx
  const inside = (p: { a: number; b: number }): boolean => p.a >= 0 && p.a <= W && p.b >= 0 && p.b <= H
  const ends = channels.map((ch) => ch.line[ch.line.length - 1]).filter(Boolean)
  const out: InflowCandidate[] = []
  for (const ch of channels) {
    if (ch.line.length < 2) continue
    const pts = ch.line.map((p) => toGridLocal(plan.frame, p.x, p.z))
    let entry: { a: number; b: number } | null = null
    let edge = false
    if (inside(pts[0])) {
      // Rises inside, or continues a way that ended here.
      const p0 = ch.line[0]
      if (ends.some((e) => e !== ch.line[ch.line.length - 1] && Math.hypot(e.x - p0.x, e.z - p0.z) < 1.5)) continue
      entry = pts[0]
    } else {
      for (let k = 0; k + 1 < pts.length && !entry; k++) {
        const p = pts[k], q = pts[k + 1]
        const t0 = enterT(p, q, W, H)
        if (t0 === null) continue
        // Half a cell in, so the entry cell is inside the grid.
        const len = Math.hypot(q.a - p.a, q.b - p.b) || 1
        const t = Math.min(1, t0 + (plan.dx * 0.5) / len)
        entry = { a: p.a + t * (q.a - p.a), b: p.b + t * (q.b - p.b) }
        edge = true
      }
    }
    if (!entry) continue
    out.push({ id: ch.id, cls: ch.cls, name: ch.name, historic: ch.historic, culvert: ch.culvert, widthM: ch.widthM, entry: toScene(plan, entry.a, entry.b), edge })
  }
  return out.sort((x, y) => y.widthM - x.widthM || (x.name ?? '').localeCompare(y.name ?? ''))
}

/**
 * The cells a discharge enters by: open cells whose centre is within
 * `radiusM` of `center`, equally — or the nearest open cell when none is.
 * Null when there is no open cell within 20 cells.
 */
export function inflowWeights(plan: GridPlan, blocked: Uint8Array, center: PlanPoint, radiusM: number): Float32Array | null {
  const { nx, ny, dx } = plan
  const p = toGridLocal(plan.frame, center.x, center.z)
  const ci = Math.floor(p.a / dx), cj = Math.floor(p.b / dx)
  const w = new Float32Array(nx * ny)
  const r = Math.max(radiusM, dx * 0.5)
  const R = Math.ceil(r / dx) + 1
  let n = 0
  for (let j = cj - R; j <= cj + R; j++) {
    if (j < 0 || j >= ny) continue
    for (let i = ci - R; i <= ci + R; i++) {
      if (i < 0 || i >= nx) continue
      const c = j * nx + i
      if (blocked[c]) continue
      if (Math.hypot((i + 0.5) * dx - p.a, (j + 0.5) * dx - p.b) <= r) { w[c] = 1; n++ }
    }
  }
  if (n) return w
  // Nothing open there (the point is on a building): the nearest open cell.
  let best = -1, bestD = Infinity
  for (let j = cj - 20; j <= cj + 20; j++) {
    if (j < 0 || j >= ny) continue
    for (let i = ci - 20; i <= ci + 20; i++) {
      if (i < 0 || i >= nx || blocked[j * nx + i]) continue
      const d = Math.hypot(i - ci, j - cj)
      if (d < bestD) { bestD = d; best = j * nx + i }
    }
  }
  if (best < 0) return null
  w[best] = 1
  return w
}

/** The radius a source's discharge is spread over, metres. */
export function sourceRadiusM(dx: number, widthM?: number): number {
  return widthM ? Math.max(widthM / 2, dx) : Math.max(1.5 * dx, 3)
}
