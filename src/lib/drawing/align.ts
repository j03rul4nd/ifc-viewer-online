// ─── Registering one revision of a sheet onto the next ────────────────────────
// A revised sheet rarely sits where the old one did: re-plotted at 1:50 instead
// of 1:100, shifted on the paper, turned a hair. Before comparing anything, find
// the similarity (scale, small rotation, translation) that lays sheet A on sheet B.
// First by the frame, which works when only the paper moved; otherwise by RANSAC
// over the ends of long segments, which follows the drawing itself. Pure: no DOM,
// no pdf.js, so it runs in tests and in a worker alike.

import { entityExtent, entityPolylines, placementFromPairs, toModel, type Bounds2, type NewEntity, type Placement, type Pt } from './types'

export interface Seg { a: Pt; b: Pt }

/** Frame and title block of a sheet, in its own units. Either may be missing. */
export interface SheetFrame { frame: Bounds2 | null; titleBlock: Bounds2 | null }

export interface Alignment {
  /** A → B. A `Placement`, so `toModel(placement, pointInA)` lands in B. */
  placement: Placement
  method: 'frame' | 'ransac' | 'identity'
  /** Root mean square of the matched points, in millimetres of B's paper. */
  rmsMm: number
  /** Matched ends of A's segments over the ones tried, 0–1. */
  inlierRatio: number
  inliers: number
}

export interface AlignOptions {
  /** Millimetres per sheet unit (a PDF point is 25.4 / 72). */
  mmPerUnitA: number
  mmPerUnitB: number
  /** Two ends match when closer than this, in mm of B's paper. */
  toleranceMm?: number
  /** Largest rotation tried, radians. Revisions turn a little, not a quarter. */
  maxRotation?: number
  /** Regions of each sheet left out of the registration (frame, title block, user zones). */
  excludeA?: Bounds2[]
  excludeB?: Bounds2[]
  frameA?: SheetFrame
  frameB?: SheetFrame
}

export const PDF_MM_PER_UNIT = 25.4 / 72

// ── geometry helpers ──────────────────────────────────────────────────────────

export function boundsOf(points: readonly Pt[]): Bounds2 {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export const area = (b: Bounds2) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY)
export const grow = (b: Bounds2, d: number): Bounds2 => ({ minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d })
export const inside = (p: Pt, b: Bounds2) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY
export const contains = (outer: Bounds2, inner: Bounds2) => inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
export const overlaps = (a: Bounds2, b: Bounds2) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY

/** Every straight piece of every non-text entity. */
export function segmentsOf(entities: readonly NewEntity[]): Seg[] {
  const out: Seg[] = []
  for (const e of entities) {
    if (e.kind === 'text' || e.kind === 'point') continue
    for (const pl of entityPolylines(e as Parameters<typeof entityPolylines>[0])) {
      const n = pl.points.length
      for (let i = 0; i < (pl.closed ? n : n - 1); i++) {
        const a = pl.points[i]; const b = pl.points[(i + 1) % n]
        if (a.x !== b.x || a.y !== b.y) out.push({ a, b })
      }
    }
  }
  return out
}

/** An axis-aligned rectangle drawn as one closed path (PDF `re`, a closed 4-point polyline). */
function asRect(e: NewEntity): Bounds2 | null {
  if (e.kind !== 'polyline' && e.kind !== 'fill') return null
  let pts = e.points
  if (pts.length === 5 && pts[0].x === pts[4].x && pts[0].y === pts[4].y) pts = pts.slice(0, 4)
  if (pts.length !== 4 || (e.kind === 'polyline' && !e.closed && pts === e.points)) return null
  const b = boundsOf(pts)
  const eps = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 1e-4
  const onCorner = pts.every((p) => (Math.abs(p.x - b.minX) < eps || Math.abs(p.x - b.maxX) < eps) && (Math.abs(p.y - b.minY) < eps || Math.abs(p.y - b.maxY) < eps))
  return onCorner && area(b) > 0 ? b : null
}

/**
 * The drawing frame (the largest rectangle on the sheet) and the title block
 * (the largest rectangle inside it that sits in one of its corners). Nothing is
 * guessed when the sheet has no such rectangles.
 */
export function detectFrame(entities: readonly NewEntity[], page?: { width: number; height: number }): SheetFrame {
  const rects = entities.map(asRect).filter((r): r is Bounds2 => !!r)
  if (!rects.length) return { frame: null, titleBlock: null }
  rects.sort((a, b) => area(b) - area(a))
  const frame = rects[0]
  const content = boundsOf(entities.flatMap((e) => entityExtent(e as Parameters<typeof entityExtent>[0])))
  const reference = page ? page.width * page.height : area(content)
  if (area(frame) < reference * 0.3) return { frame: null, titleBlock: null }
  const w = frame.maxX - frame.minX
  const h = frame.maxY - frame.minY
  const near = Math.max(w, h) * 0.02
  let titleBlock: Bounds2 | null = null
  for (const r of rects.slice(1)) {
    const a = area(r)
    if (a > area(frame) * 0.25 || a < area(frame) * 0.003) continue
    if (!contains(grow(frame, near), r)) continue
    const atX = Math.abs(r.maxX - frame.maxX) < near || Math.abs(r.minX - frame.minX) < near
    const atY = Math.abs(r.minY - frame.minY) < near || Math.abs(r.maxY - frame.maxY) < near
    if (atX && atY) { titleBlock = r; break }
  }
  return { frame, titleBlock }
}

/**
 * Whether an entity is sheet furniture rather than drawing: the frame itself,
 * anything in the title block or an excluded zone, anything outside the frame.
 */
export function isFurniture(e: NewEntity, f: SheetFrame, zones: readonly Bounds2[], band: number): boolean {
  const pts = entityExtent(e as Parameters<typeof entityExtent>[0])
  if (!pts.length) return false
  const b = boundsOf(pts)
  if (f.titleBlock && contains(grow(f.titleBlock, band), b)) return true
  for (const z of zones) if (contains(z, b)) return true
  if (f.frame) {
    const fr = f.frame
    if (!contains(grow(fr, band), b)) return true
    const onEdge = (p: Pt) => Math.abs(p.x - fr.minX) < band || Math.abs(p.x - fr.maxX) < band || Math.abs(p.y - fr.minY) < band || Math.abs(p.y - fr.maxY) < band
    if (pts.every(onEdge) && (e.kind === 'polyline' || e.kind === 'line')) return true
  }
  return false
}

// ── nearest point lookups on a grid ───────────────────────────────────────────

class PointGrid {
  private cells = new Map<number, Pt[]>()
  constructor(points: readonly Pt[], private cell: number) {
    for (const p of points) {
      const k = this.key(Math.floor(p.x / cell), Math.floor(p.y / cell))
      const list = this.cells.get(k)
      if (list) list.push(p); else this.cells.set(k, [p])
    }
  }
  private key(i: number, j: number) { return (i + 0x8000) * 0x10000 + (j + 0x8000) }
  /** The nearest point within `cell`, or null. */
  nearest(p: Pt): Pt | null {
    const i = Math.floor(p.x / this.cell); const j = Math.floor(p.y / this.cell)
    let best: Pt | null = null; let d = this.cell * this.cell
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const list = this.cells.get(this.key(i + di, j + dj))
      if (!list) continue
      for (const q of list) {
        const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
        if (dd <= d) { d = dd; best = q }
      }
    }
    return best
  }
}

/** Least-squares similarity taking `from[i]` → `to[i]` (Umeyama, in 2D). */
export function fitSimilarity(from: readonly Pt[], to: readonly Pt[]): Placement | null {
  const n = from.length
  if (n < 2) return null
  let ax = 0; let ay = 0; let bx = 0; let by = 0
  for (let i = 0; i < n; i++) { ax += from[i].x; ay += from[i].y; bx += to[i].x; by += to[i].y }
  ax /= n; ay /= n; bx /= n; by /= n
  let sxx = 0; let sxy = 0; let saa = 0
  for (let i = 0; i < n; i++) {
    const px = from[i].x - ax; const py = from[i].y - ay
    const qx = to[i].x - bx; const qy = to[i].y - by
    sxx += px * qx + py * qy
    sxy += px * qy - py * qx
    saa += px * px + py * py
  }
  if (saa < 1e-18) return null
  const rotation = Math.atan2(sxy, sxx)
  const scale = Math.hypot(sxx, sxy) / saa
  const c = Math.cos(rotation) * scale; const s = Math.sin(rotation) * scale
  return { scale, rotation, x: bx - (c * ax - s * ay), y: by - (s * ax + c * ay) }
}

function endsOf(segs: readonly Seg[]): Pt[] {
  const out: Pt[] = []
  for (const s of segs) out.push(s.a, s.b)
  return out
}

/** A deterministic, evenly spread subset: same answer on every run. */
function spread<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return items.slice()
  const step = items.length / max
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * step)])
  return out
}

interface Score { inliers: number; tried: number; from: Pt[]; to: Pt[] }

function score(p: Placement, probes: readonly Pt[], grid: PointGrid, keep = false): Score {
  let inliers = 0
  const from: Pt[] = []; const to: Pt[] = []
  for (const q of probes) {
    const m = grid.nearest(toModel(p, q))
    if (m) { inliers++; if (keep) { from.push(q); to.push(m) } }
  }
  return { inliers, tried: probes.length, from, to }
}

function refine(start: Placement, probes: readonly Pt[], grid: PointGrid): { placement: Placement; s: Score } {
  let placement = start
  let s = score(placement, probes, grid, true)
  for (let it = 0; it < 4; it++) {
    const next = fitSimilarity(s.from, s.to)
    if (!next) break
    const ns = score(next, probes, grid, true)
    if (ns.inliers < s.inliers) break
    placement = next; s = ns
  }
  return { placement, s }
}

function rms(p: Placement, s: Score): number {
  if (!s.from.length) return Infinity
  let sum = 0
  for (let i = 0; i < s.from.length; i++) {
    const m = toModel(p, s.from[i])
    sum += (m.x - s.to[i].x) ** 2 + (m.y - s.to[i].y) ** 2
  }
  return Math.sqrt(sum / s.from.length)
}

const corners = (b: Bounds2): Pt[] => [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]

/**
 * Register sheet A onto sheet B. Both come as their own segments; furniture
 * (frame, title block, excluded zones) should already be out, or be named in
 * the options, so the paper does not outvote the drawing.
 */
export function alignSheets(segsA: readonly Seg[], segsB: readonly Seg[], o: AlignOptions): Alignment {
  const tol = (o.toleranceMm ?? 1) / o.mmPerUnitB
  const maxRot = o.maxRotation ?? (10 * Math.PI) / 180
  const keep = (zones: readonly Bounds2[] | undefined) => (s: Seg) => !zones?.some((z) => inside(s.a, z) && inside(s.b, z))
  const a = segsA.filter(keep(o.excludeA))
  const b = segsB.filter(keep(o.excludeB))
  const identity: Alignment = { placement: { scale: o.mmPerUnitA / o.mmPerUnitB, rotation: 0, x: 0, y: 0 }, method: 'identity', rmsMm: Infinity, inlierRatio: 0, inliers: 0 }
  if (a.length < 2 || b.length < 2) return identity
  const grid = new PointGrid(endsOf(b), tol)
  const probes = spread(endsOf(a), 4000)
  const quick = spread(probes, 600)
  const tiny = spread(quick, 100)
  const result = (placement: Placement, method: Alignment['method'], s: Score): Alignment => ({
    placement, method, rmsMm: rms(placement, s) * o.mmPerUnitB, inlierRatio: s.inliers / Math.max(1, s.tried), inliers: s.inliers,
  })

  // 1. The frame: the cheap answer, right whenever only the paper moved.
  let best: Alignment | null = null
  const fa = o.frameA?.frame; const fb = o.frameB?.frame
  if (fa && fb) {
    const p = fitSimilarity(corners(fa), corners(fb))
    if (p && Math.abs(p.rotation) <= maxRot) {
      const r = refine(p, probes, grid)
      best = result(r.placement, 'frame', r.s)
      if (best.inlierRatio >= 0.8) return best
    }
  }

  // 2. RANSAC over long segments: each pair of long segments, one in A and one
  // in B with the same heading, proposes a similarity; the one most ends agree on wins.
  const long = (segs: readonly Seg[]) => segs
    .map((s) => ({ s, l: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) }))
    .sort((x, y) => y.l - x.l)
    .slice(0, 40)
  const la = long(a); const lb = long(b)
  let top: { p: Placement; inliers: number }[] = []
  for (const x of la) {
    for (const y of lb) {
      const scale = y.l / x.l
      if (scale < 0.05 || scale > 20) continue
      for (const flip of [false, true]) {
        const p = placementFromPairs(x.s.a, x.s.b, flip ? y.s.b : y.s.a, flip ? y.s.a : y.s.b)
        if (!p) continue
        let r = p.rotation
        while (r > Math.PI) r -= 2 * Math.PI
        while (r < -Math.PI) r += 2 * Math.PI
        if (Math.abs(r) > maxRot) continue
        // Most proposals are wrong: a tiny sample says so before the full count.
        const floor = top.length < 8 ? 0 : top[top.length - 1].inliers
        if (floor && score(p, tiny, grid).inliers * (quick.length / tiny.length) < floor * 0.5) continue
        const s = score(p, quick, grid)
        if (top.length < 8 || s.inliers > floor) {
          top.push({ p, inliers: s.inliers })
          top.sort((u, v) => v.inliers - u.inliers)
          top = top.slice(0, 8)
        }
      }
    }
  }
  for (const h of top) {
    const r = refine(h.p, probes, grid)
    const cand = result(r.placement, 'ransac', r.s)
    if (!best || cand.inliers > best.inliers || (cand.inliers === best.inliers && cand.rmsMm < best.rmsMm)) best = cand
  }
  return best ?? identity
}
