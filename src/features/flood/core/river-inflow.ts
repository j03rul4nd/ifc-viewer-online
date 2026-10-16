// ─── river inflow ─────────────────────────────────────────────────────────────
// The water a river BRINGS into the grid from upstream, which no amount of
// rain on the grid itself produces: a DANA upstream sends a flood wave down
// the river hours later, and that is what overtops the banks in town.
//
// The river enters as a boundary condition at the cells where its channel
// crosses into the grid: they are held at the depth the discharge needs to
// flow there (Manning's normal depth on a wide channel, with the slope of the
// ground along the course), and the scheme carries the water downstream —
// into its own channel, over the banks, into the streets. The discharge is a
// hydrograph: a base flow, a peak some hours after the rain's, and a recession.
//
// Pure: grid-local metres in, cell indices and series out.

/** A watercourse in the grid's own frame: (a, b) metres from cell (0, 0)'s corner, in flow direction. */
export interface LocalChannel {
  id: string
  name?: string
  cls: 'river' | 'canal' | 'stream' | 'ditch' | 'drain'
  line: Array<{ a: number; b: number }>
  widthM: number
}

export interface RiverEntry {
  id: string
  name?: string
  cls: LocalChannel['cls']
  widthM: number
  /** Cells held at the river's depth. */
  cells: number[]
  /** Where it enters, grid-local metres. */
  at: { a: number; b: number }
  /** Its direction of flow there (grid-local, not normalised). */
  dir: { a: number; b: number }
}

/** Typical discharges by class, m³/s — base flow and a flood peak — before the user says more. */
export const TYPICAL_FLOW: Record<LocalChannel['cls'], { base: number; peak: number }> = {
  river: { base: 40, peak: 600 }, canal: { base: 5, peak: 20 }, stream: { base: 0.5, peak: 15 },
  ditch: { base: 0.05, peak: 2 }, drain: { base: 0.05, peak: 2 },
}

/**
 * Where each watercourse comes INTO the grid: the first point of its course
 * (flow direction) inside the grid after being outside it — or its first
 * vertex when it starts inside, within a few cells of an edge (a river mapped
 * from just past the box). A course that rises inside the grid brings nothing
 * in and is skipped. The entry is a short line of cells across the channel,
 * as wide as it is, pressed against the edge.
 */
export function findRiverEntries(
  channels: ReadonlyArray<LocalChannel>, nx: number, ny: number, dx: number, blocked: Uint8Array,
): RiverEntry[] {
  const W = nx * dx, H = ny * dx
  const inside = (p: { a: number; b: number }) => p.a >= 0 && p.b >= 0 && p.a < W && p.b < H
  // OSM splits a river into many ways, and the one that crosses the edge is
  // not always mapped in full: a way can start a few tens of metres inside.
  const nearEdge = (p: { a: number; b: number }) => Math.min(p.a, p.b, W - p.a, H - p.b) <= Math.max(3 * dx, 40)
  // A way that starts where another one ends is a continuation, not an entry.
  const ends = channels.map((c) => c.line[c.line.length - 1])
  const continues = (p: { a: number; b: number }) => ends.some((q) => Math.hypot(q.a - p.a, q.b - p.b) < 1)
  const out: RiverEntry[] = []
  for (const ch of channels) {
    if (ch.line.length < 2) continue
    let at: { a: number; b: number } | null = null
    let dir = { a: 0, b: 0 }
    if (inside(ch.line[0])) {
      if (nearEdge(ch.line[0]) && !continues(ch.line[0])) { at = ch.line[0]; dir = sub(ch.line[1], ch.line[0]) }
    } else {
      for (let i = 1; i < ch.line.length && !at; i++) {
        const p = ch.line[i - 1], q = ch.line[i]
        // Walk the segment to its first point inside — both ends can be
        // outside when a straight reach crosses the whole grid.
        const n = Math.max(2, Math.ceil(len(sub(q, p)) / (dx / 2)))
        for (let k = 1; k <= n; k++) {
          const t = k / n
          const r = { a: p.a + (q.a - p.a) * t, b: p.b + (q.b - p.b) * t }
          if (inside(r)) { at = r; dir = sub(q, p); break }
        }
      }
    }
    if (!at) continue
    const d = len(dir) || 1
    // Across the flow: the cells within half the width, along the normal.
    const nrm = { a: -dir.b / d, b: dir.a / d }
    const half = Math.max(dx * 0.75, ch.widthM / 2)
    const cells = new Set<number>()
    for (let s = -half; s <= half; s += dx / 2) {
      for (const along of [0, dx]) {
        const pa = at.a + nrm.a * s + (dir.a / d) * along
        const pb = at.b + nrm.b * s + (dir.b / d) * along
        const i = Math.floor(pa / dx), j = Math.floor(pb / dx)
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue
        const c = j * nx + i
        if (!blocked[c]) cells.add(c)
      }
    }
    if (cells.size === 0) continue
    out.push({ id: ch.id, name: ch.name, cls: ch.cls, widthM: ch.widthM, cells: [...cells], at, dir })
  }
  // Widest first: the first is the main river, whose depth the series carries.
  return out.sort((x, y) => y.widthM - x.widthM)
}

/**
 * Manning's normal depth on a wide rectangular channel, metres:
 * Q = (1/n) · B · h^(5/3) · √S  →  h = (Q · n / (B · √S))^(3/5).
 * The slope is floored at 1e-4 (a lowland river): on flat DEM ground a zero
 * slope would ask for an infinite depth.
 */
export function normalDepth(qM3s: number, widthM: number, slope: number, n = 0.035): number {
  if (!(qM3s > 0) || !(widthM > 0)) return 0
  const s = Math.max(1e-4, slope)
  return Math.min(25, Math.pow((qM3s * n) / (widthM * Math.sqrt(s)), 3 / 5))
}

export interface Hydrograph {
  baseM3s: number
  peakM3s: number
  /** When the peak passes the entry, s from the start of the run. */
  peakAtS: number
  /** From base to peak, s (the recession takes twice as long). */
  riseS: number
}

/** Discharge at t, m³/s: a rise to the peak, a recession twice as long, the base flow either side. */
export function dischargeAt(h: Hydrograph, tS: number): number {
  const rise = Math.max(60, h.riseS)
  const x = tS - h.peakAtS
  let f = 0
  if (x <= 0) f = Math.max(0, 1 + x / rise)
  else f = Math.max(0, 1 - x / (2 * rise))
  // A smooth crest: a triangle squared would be too sharp, a sine is close to gauged waves.
  f = Math.sin((f * Math.PI) / 2) ** 2
  return h.baseM3s + (h.peakM3s - h.baseM3s) * f
}

/**
 * A river's CROSS-SECTION at its entry: the grid's bed along a line across
 * the flow through the entry point, as far as `halfM` either side. Blocked
 * cells (buildings) are NaN — the water cannot cross them. `centre` is the
 * cell nearest the channel's centreline.
 */
export interface Transect {
  cells: number[]
  z: number[]
  centre: number
}

export function entryTransect(
  at: { a: number; b: number }, dir: { a: number; b: number },
  g: { nx: number; ny: number; dx: number; z: ArrayLike<number>; blocked: ArrayLike<number> },
  halfM = 300,
): Transect {
  const d = Math.hypot(dir.a, dir.b) || 1
  const nrm = { a: -dir.b / d, b: dir.a / d }
  const cells: number[] = [], z: number[] = []
  let centre = 0, best = Infinity
  const seen = new Set<number>()
  for (let s = -halfM; s <= halfM; s += g.dx / 2) {
    const i = Math.floor((at.a + nrm.a * s) / g.dx), j = Math.floor((at.b + nrm.b * s) / g.dx)
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue
    const c = j * g.nx + i
    if (seen.has(c)) continue
    seen.add(c)
    if (Math.abs(s) < best) { best = Math.abs(s); centre = cells.length }
    cells.push(c)
    z.push(g.blocked[c] ? NaN : g.z[c])
  }
  return { cells, z, centre: Math.min(centre, Math.max(0, cells.length - 1)) }
}

/**
 * The contiguous wet part of a transect at a level: outwards from the lowest
 * open cell near the centre while the ground is below the level — a hollow
 * behind a bank higher than the water is NOT part of the section.
 */
export function wetSpan(level: number, t: Transect, searchCells = 6): [number, number] | null {
  let c0 = -1, zmin = Infinity
  for (let k = Math.max(0, t.centre - searchCells); k <= Math.min(t.z.length - 1, t.centre + searchCells); k++) {
    if (Number.isFinite(t.z[k]) && t.z[k] < zmin) { zmin = t.z[k]; c0 = k }
  }
  if (c0 < 0 || !(level > zmin)) return null
  let lo = c0, hi = c0
  while (lo - 1 >= 0 && Number.isFinite(t.z[lo - 1]) && t.z[lo - 1] < level) lo--
  while (hi + 1 < t.z.length && Number.isFinite(t.z[hi + 1]) && t.z[hi + 1] < level) hi++
  return [lo, hi]
}

/** Lowest open bed near the transect's centre. */
export function transectBed(t: Transect, searchCells = 6): number {
  let m = Infinity
  for (let k = Math.max(0, t.centre - searchCells); k <= Math.min(t.z.length - 1, t.centre + searchCells); k++) {
    if (Number.isFinite(t.z[k])) m = Math.min(m, t.z[k])
  }
  return m
}

/**
 * Discharge through a transect at a level: the section split into vertical
 * strips one cell wide, each a wide channel of its own depth — Q = Σ (1/n)
 * h^(5/3) √S · dx. The standard way a compound channel (river and its
 * floodplain) is treated; the floodplain's shallow strips carry little.
 */
export function sectionDischarge(level: number, t: Transect, dx: number, slope: number, n = 0.035): number {
  const span = wetSpan(level, t)
  if (!span) return 0
  const k = Math.sqrt(Math.max(1e-4, slope)) / n * dx
  let q = 0
  for (let i = span[0]; i <= span[1]; i++) q += k * Math.pow(level - t.z[i], 5 / 3)
  return q
}

/** The level a discharge needs through a transect (bisection on sectionDischarge). */
export function levelForDischarge(qM3s: number, t: Transect, dx: number, slope: number, n = 0.035): number {
  const bed = transectBed(t)
  if (!Number.isFinite(bed) || !(qM3s > 0)) return bed
  let lo = bed, hi = bed + 1
  while (sectionDischarge(hi, t, dx, slope, n) < qM3s && hi - bed < 60) hi = bed + (hi - bed) * 2
  for (let it = 0; it < 50; it++) {
    const mid = (lo + hi) / 2
    if (sectionDischarge(mid, t, dx, slope, n) < qM3s) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

/** The main river's depth over the run, every stepS: the solver's stage series. */
export function stageSeries(
  h: Hydrograph, widthM: number, slope: number, durationS: number, stepS = 300, n = 0.035,
): number[] {
  const out: number[] = []
  const count = Math.max(2, Math.ceil(durationS / stepS) + 1)
  for (let k = 0; k < count; k++) out.push(normalDepth(dischargeAt(h, k * stepS), widthM, slope, n))
  return out
}

function sub(p: { a: number; b: number }, q: { a: number; b: number }) { return { a: p.a - q.a, b: p.b - q.b } }
function len(v: { a: number; b: number }) { return Math.hypot(v.a, v.b) }
