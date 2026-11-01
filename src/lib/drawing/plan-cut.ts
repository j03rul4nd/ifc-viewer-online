// ─── Plans and sections from triangles ────────────────────────────────────────
// Slice triangle soups with a plane and chain the pieces into polylines, one
// layer per IFC class. This is the honest part of a plan: what the cut goes
// through. It does not yet project what lies below the cut (see docs/DRAWINGS.md).
//
// Coordinates: soups are in scene space (Y up). A plan's drawing space is IFC XY
// in metres (x, −z), so a generated plan needs no alignment: its placement is
// the identity and everything else lines up against it.

import { LAYER_PALETTE, type Layer, type NewEntity, type Pt } from './types'

export type CutPlane =
  | { kind: 'plan'; y: number }
  /** Vertical section along IFC X at this scene x, looking along −X → drawing (−z, y). */
  | { kind: 'sectionX'; x: number }
  /** Vertical section along IFC Y at this scene z → drawing (x, y). */
  | { kind: 'sectionY'; z: number }

/** Segments (x1,y1,x2,y2 flat) of a soup against a plane. */
export function sliceTriangles(tri: Float32Array, plane: CutPlane, out: number[]): void {
  const axis = plane.kind === 'plan' ? 1 : plane.kind === 'sectionX' ? 0 : 2
  const value = plane.kind === 'plan' ? plane.y : plane.kind === 'sectionX' ? plane.x : plane.z
  const project = plane.kind === 'plan'
    ? (x: number, _y: number, z: number): [number, number] => [x, -z]
    : plane.kind === 'sectionX'
      ? (_x: number, y: number, z: number): [number, number] => [-z, y]
      : (x: number, y: number): [number, number] => [x, y]
  for (let i = 0; i + 8 < tri.length; i += 9) {
    const a = tri[i + axis] - value
    const b = tri[i + 3 + axis] - value
    const c = tri[i + 6 + axis] - value
    // Nudge exact hits: a vertex on the plane would otherwise yield 0 or 3 crossings.
    const da = a === 0 ? 1e-7 : a
    const db = b === 0 ? 1e-7 : b
    const dc = c === 0 ? 1e-7 : c
    if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue
    const hits: number[] = []
    const edge = (p: number, q: number, dp: number, dq: number) => {
      if ((dp > 0) === (dq > 0)) return
      const t = dp / (dp - dq)
      const [u, v] = project(
        tri[i + p] + (tri[i + q] - tri[i + p]) * t,
        tri[i + p + 1] + (tri[i + q + 1] - tri[i + p + 1]) * t,
        tri[i + p + 2] + (tri[i + q + 2] - tri[i + p + 2]) * t,
      )
      hits.push(u, v)
    }
    edge(0, 3, da, db)
    edge(3, 6, db, dc)
    edge(6, 0, dc, da)
    if (hits.length === 4) out.push(hits[0], hits[1], hits[2], hits[3])
  }
}

/** Chain loose segments into polylines by shared endpoints (1 mm tolerance), dropping collinear points. */
export function chainSegments(seg: ArrayLike<number>, tolerance = 0.001): { points: Pt[]; closed: boolean }[] {
  const key = (x: number, y: number) => `${Math.round(x / tolerance)},${Math.round(y / tolerance)}`
  const n = seg.length / 4
  const at = new Map<string, number[]>()
  const push = (k: string, v: number) => { const l = at.get(k); if (l) l.push(v); else at.set(k, [v]) }
  const keysA: string[] = new Array(n)
  const keysB: string[] = new Array(n)
  const used = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    keysA[i] = key(seg[i * 4], seg[i * 4 + 1])
    keysB[i] = key(seg[i * 4 + 2], seg[i * 4 + 3])
    if (keysA[i] === keysB[i]) { used[i] = 1; continue } // degenerate
    push(keysA[i], i); push(keysB[i], i)
  }
  const out: { points: Pt[]; closed: boolean }[] = []
  const follow = (startKey: string, into: Pt[]) => {
    let k = startKey
    for (;;) {
      const next = at.get(k)?.find((s) => !used[s])
      if (next === undefined) return k
      used[next] = 1
      const forward = keysA[next] === k
      into.push(forward
        ? { x: seg[next * 4 + 2], y: seg[next * 4 + 3] }
        : { x: seg[next * 4], y: seg[next * 4 + 1] })
      k = forward ? keysB[next] : keysA[next]
    }
  }
  for (let i = 0; i < n; i++) {
    if (used[i]) continue
    used[i] = 1
    const a = { x: seg[i * 4], y: seg[i * 4 + 1] }
    const b = { x: seg[i * 4 + 2], y: seg[i * 4 + 3] }
    const ahead: Pt[] = [a, b]
    const endKey = follow(keysB[i], ahead)
    const behind: Pt[] = []
    const startKey = follow(keysA[i], behind)
    const points = [...behind.reverse(), ...ahead]
    const closed = startKey === endKey && points.length > 3
    if (closed) points.pop()
    out.push({ points: simplifyCollinear(points, closed), closed })
  }
  return out
}

function simplifyCollinear(p: Pt[], closed: boolean): Pt[] {
  if (p.length < 3) return p
  const out: Pt[] = []
  const n = p.length
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) { out.push(p[i]); continue }
    const a = p[(i - 1 + n) % n]; const b = p[i]; const c = p[(i + 1) % n]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const len = Math.hypot(c.x - a.x, c.y - a.y)
    if (Math.abs(cross) > 1e-6 * Math.max(len, 1e-6)) out.push(b)
  }
  return out.length >= 2 ? out : p
}

/** IFCWALLSTANDARDCASE → IFCWALL, so one wall layer whichever class exported it. */
export function categoryLayer(category: string): string {
  return category.toUpperCase().replace(/STANDARDCASE$|ELEMENTEDCASE$/, '')
}

/** IFC classes a plan never cuts: spaces and voids are not material. */
export const SKIP_CATEGORIES = /^IFC(SPACE|OPENINGELEMENT|OPENINGSTANDARDCASE|GRID|ANNOTATION|SITE)$/

const LAYER_COLORS: Record<string, string> = {
  IFCWALL: '#e6e6e6', IFCSLAB: '#8a93a6', IFCCOLUMN: '#ff5a5a', IFCBEAM: '#ff9a4a', IFCDOOR: '#4cc38a',
  IFCWINDOW: '#4aa8ff', IFCSTAIR: '#f5c04a', IFCSTAIRFLIGHT: '#f5c04a', IFCRAILING: '#c58cff',
  IFCFURNISHINGELEMENT: '#3fd0d0', IFCFURNITURE: '#3fd0d0', IFCROOF: '#b6b6b6', IFCMEMBER: '#d9a066', IFCPLATE: '#7fb3d5',
}

/** Cut per-category soups into entities and their layers. */
export function buildCut(soups: Iterable<[string, Float32Array[]]>, plane: CutPlane): { layers: Layer[]; entities: NewEntity[] } {
  const layers: Layer[] = []
  const entities: NewEntity[] = []
  for (const [category, chunks] of soups) {
    const seg: number[] = []
    for (const c of chunks) sliceTriangles(c, plane, seg)
    if (!seg.length) continue
    const name = categoryLayer(category)
    if (!layers.some((l) => l.name === name)) {
      layers.push({ name, color: LAYER_COLORS[name] ?? LAYER_PALETTE[layers.length % LAYER_PALETTE.length], visible: true, locked: false })
    }
    for (const c of chainSegments(seg)) {
      if (c.points.length >= 2) entities.push({ kind: 'polyline', layer: name, color: null, points: c.points, closed: c.closed })
    }
  }
  return { layers, entities }
}
