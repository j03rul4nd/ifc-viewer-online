// ─── flood hazard to people ───────────────────────────────────────────────────
// The hazard rating of Defra / Environment Agency research FD2320 and FD2321,
// as clarified by their 2008 supplementary note:
//
//   HR = d × (v + 0.5) + DF
//
// d = depth (m), v = velocity (m/s), DF = debris factor. Two ways to pick DF:
//
//   precautionary (FD2320 Table 13.1, the one for development planning):
//     0.5 up to 0.25 m deep, 1.0 deeper — whatever the land use;
//   by land use (FD2321 Table 3.1): 0 up to 0.25 m; 0 / 0.5 / 1 for pasture,
//     woodland, urban up to 0.75 m; 0.5 / 1 / 1 deeper or faster than 2 m/s.
//
// Classes (FD2320): < 0.75 low (caution), 0.75–1.25 danger for some,
// 1.25–2.0 danger for most, > 2.0 danger for all.
//
// Pure. Used by the blog's hazard calculator (components/blog/FloodHazard.tsx).

export type DebrisMode = 'precautionary' | 'pasture' | 'woodland' | 'urban'

/** 0 low · 1 danger for some · 2 danger for most · 3 danger for all. */
export type HazardClass = 0 | 1 | 2 | 3

export function debrisFactor(d: number, v: number, mode: DebrisMode): number {
  if (mode === 'precautionary') return d <= 0.25 ? 0.5 : 1
  const col = mode === 'pasture' ? 0 : mode === 'woodland' ? 1 : 2
  if (d > 0.75 || v > 2) return [0.5, 1, 1][col]
  if (d > 0.25) return [0, 0.5, 1][col]
  return 0
}

/** HR for a depth and a velocity; 0 where there is no water. */
export function hazardRating(d: number, v: number, mode: DebrisMode = 'precautionary'): number {
  if (!(d > 0)) return 0
  return d * (Math.max(0, v) + 0.5) + debrisFactor(d, v, mode)
}

export function hazardClass(hr: number): HazardClass {
  if (hr < 0.75) return 0
  if (hr < 1.25) return 1
  if (hr <= 2) return 2
  return 3
}
