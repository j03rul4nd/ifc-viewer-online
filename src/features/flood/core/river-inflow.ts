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
    out.push({ id: ch.id, name: ch.name, cls: ch.cls, widthM: ch.widthM, cells: [...cells], at })
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
