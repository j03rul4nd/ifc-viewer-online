// ─── shading-optimizer ────────────────────────────────────────────────────────
// PURE: which solar protection to put on the sun-facing façades. A short list
// of standard designs, each measured with the full annual daylight method
// (the caller runs it), ranked the way LEED reads the result:
//   1. designs that bring ASE1000,250 h down to ≤ 10 % of the floor first,
//   2. among them, the one that keeps the most daylight (mean DA300, then sDA);
//   3. if none reaches 10 %, the lowest ASE, then the most daylight.

import type { ShadingDesign, Orientation } from './shading-devices'

export interface Candidate {
  id: string
  design: ShadingDesign
}

const NONE: ShadingDesign = {
  overhang: { on: false, depth: 0.6, gap: 0.1, extend: 0.2 },
  fins: { on: false, depth: 0.4 },
  louvres: { on: false, count: 4, depth: 0.25, tiltDeg: 20 },
}

const d = (patch: Partial<{ [K in keyof ShadingDesign]: Partial<ShadingDesign[K]> }>): ShadingDesign => ({
  overhang: { ...NONE.overhang, ...patch.overhang },
  fins: { ...NONE.fins, ...patch.fins },
  louvres: { ...NONE.louvres, ...patch.louvres },
})

/** The designs tried, from nothing to heavy screening. */
export const CANDIDATES: Candidate[] = [
  { id: 'none', design: NONE },
  { id: 'overhang60', design: d({ overhang: { on: true, depth: 0.6 } }) },
  { id: 'overhang120', design: d({ overhang: { on: true, depth: 1.2 } }) },
  { id: 'fins50', design: d({ fins: { on: true, depth: 0.5 } }) },
  { id: 'louvres4', design: d({ louvres: { on: true, count: 4, depth: 0.25, tiltDeg: 20 } }) },
  { id: 'louvres6', design: d({ louvres: { on: true, count: 6, depth: 0.3, tiltDeg: 30 } }) },
  { id: 'louvres8', design: d({ louvres: { on: true, count: 8, depth: 0.4, tiltDeg: 45 } }) },
  { id: 'louvres6fins', design: d({ louvres: { on: true, count: 6, depth: 0.3, tiltDeg: 30 }, fins: { on: true, depth: 0.5 } }) },
]

/** The façades that see the sun: everything but the three facing the pole. */
export function sunFacing(lat: number): Orientation[] {
  return lat >= 0 ? ['E', 'SE', 'S', 'SW', 'W'] : ['E', 'NE', 'N', 'NW', 'W']
}

export interface CandidateResult {
  id: string
  /** Floor-area-weighted over the rooms. */
  sDA: number
  ASE: number
  meanDA: number
  blindHours: number
}

export const ASE_TARGET = 0.1

/** Best first. */
export function rankCandidates(results: CandidateResult[]): CandidateResult[] {
  return [...results].sort((a, b) => {
    const fa = a.ASE <= ASE_TARGET, fb = b.ASE <= ASE_TARGET
    if (fa !== fb) return fa ? -1 : 1
    if (!fa && Math.abs(a.ASE - b.ASE) > 0.005) return a.ASE - b.ASE
    if (Math.abs(a.meanDA - b.meanDA) > 0.005) return b.meanDA - a.meanDA
    return b.sDA - a.sDA
  })
}

/** Area-weighted building figures from per-room ones. */
export function aggregateRooms(rooms: Array<{ weight: number; sDA: number; ASE: number; meanDA: number; blindHours?: number }>): Omit<CandidateResult, 'id'> {
  const w = rooms.reduce((a, r) => a + r.weight, 0) || 1
  const sum = (f: (r: typeof rooms[number]) => number) => rooms.reduce((a, r) => a + f(r) * r.weight, 0) / w
  return { sDA: sum((r) => r.sDA), ASE: sum((r) => r.ASE), meanDA: sum((r) => r.meanDA), blindHours: sum((r) => r.blindHours ?? 0) }
}
