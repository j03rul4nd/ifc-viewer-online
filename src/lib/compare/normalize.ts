// ─── compare/normalize.ts ─────────────────────────────────────────────────────
// Normalisation applied before two revisions are classified: what makes two
// exports of the same design look different although nothing a site engineer
// cares about changed. Pure — no web-ifc, no DOM.
//
//   • schema: IfcWallStandardCase and IfcWall are the same wall
//   • origin: a whole model re-based 10 m east is one fact, not 4 000 moves
//   • exporter noise: Psets / properties rewritten on every export

/**
 * Subtypes that only exist to say "this one has a standard parametric shape"
 * (IFC2X3/IFC4) — deprecated in IFC4X3, same element to a person.
 */
const CASE_SUFFIX = /(STANDARDCASE|ELEMENTEDCASE)$/

/** Explicit renames between schema versions (upper-case, after suffix strip). */
const SCHEMA_ALIASES: Record<string, string> = {
  // IFC2X3 → IFC4: a door/window "style" became a "type" (types are not elements,
  // but keep both spellings canonical in case a type is diffed).
  IFCDOORSTYLE: 'IFCDOORTYPE',
  IFCWINDOWSTYLE: 'IFCWINDOWTYPE',
}

/**
 * Canonical class used to compare an element across revisions: upper-case,
 * `*StandardCase` / `*ElementedCase` folded into the base class.
 * `schema` is accepted for future per-schema rules; the folding is safe for all
 * of IFC2X3, IFC4 and IFC4X3 because no base class ends in those suffixes.
 */
export function canonicalClass(ifcClass: string, _schema?: string | null): string {
  const up = (ifcClass ?? '').toUpperCase()
  const base = up.replace(CASE_SUFFIX, '')
  // "IFCSTANDARDCASE" is not a class; never strip a name down to "IFC".
  const folded = base.length > 3 ? base : up
  return SCHEMA_ALIASES[folded] ?? folded
}

export type Vec3 = [number, number, number]

/** Fewer matched pairs than this never count as an origin shift (one moved wall is a move). */
export const ORIGIN_SHIFT_MIN_PAIRS = 3
/** Share of pairs that must agree on the same translation. */
export const ORIGIN_SHIFT_SHARE = 0.6

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Global translation between two revisions: the per-axis median of the
 * centroid deltas Δc of the GlobalId-matched pairs, accepted when at least 60 %
 * of the pairs lie within `tol` (metres) of it and it is itself larger than
 * `tol`. Returns null otherwise.
 *
 * `pairs` are the deltas (head − base) of the matched elements that have
 * geometry on both sides.
 */
export function detectOriginShift(pairs: readonly Vec3[], tol: number): Vec3 | null {
  if (pairs.length < ORIGIN_SHIFT_MIN_PAIRS) return null
  const med: Vec3 = [0, 1, 2].map((k) => median(pairs.map((p) => p[k]))) as Vec3
  if (Math.hypot(med[0], med[1], med[2]) <= tol) return null
  let agree = 0
  for (const p of pairs) {
    if (Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2]) <= tol) agree++
  }
  if (agree / pairs.length < ORIGIN_SHIFT_SHARE) return null
  // Report the mean of the agreeing deltas: tighter than the median per axis.
  const sum: Vec3 = [0, 0, 0]
  for (const p of pairs) {
    if (Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2]) <= tol) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2] }
  }
  return [sum[0] / agree, sum[1] / agree, sum[2] / agree]
}

/**
 * Exporter noise ignored by default. Each entry is either a Pset name
 * ("ArchiCADProperties") or "Pset.Property"; `*` matches any run of characters.
 * Incomplete on purpose — extend it from real files (spec §7 risk 6).
 */
export const DEFAULT_IGNORE_PSETS: readonly string[] = [
  // Revit: internal ids and export bookkeeping
  '*.IfcGUID', '*.ElementId', '*.Element ID', '*.UniqueId', '*.Unique ID',
  '*.ExportDate', '*.Export Date', '*.Edited by',
  // Archicad: internal ids and timestamps
  'ArchiCADProperties.*ID', 'ArchiCADProperties.Last Modified*', '*.Renovation Status Modified*',
  // generic timestamps
  '*.LastModified', '*.Last Modified', '*.ModifiedDate', '*.CreationDate', '*.Creation Date',
]

function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${esc}$`, 'i')
}

/**
 * Matcher for `ignorePsets` entries. A key is "Pset" (a whole set) or
 * "Pset.Property". An entry without a dot names a whole Pset.
 */
export function makeIgnoreMatcher(entries: readonly string[]): (pset: string, prop?: string) => boolean {
  const whole: RegExp[] = [], props: RegExp[] = []
  for (const e of entries) {
    // A dot inside the pattern splits set from property — but Pset names may
    // contain no dot, so the first dot is the separator.
    if (e.includes('.')) props.push(globToRegExp(e))
    else whole.push(globToRegExp(e))
  }
  return (pset, prop) => {
    if (whole.some((r) => r.test(pset))) return true
    return prop != null && props.some((r) => r.test(`${pset}.${prop}`))
  }
}

/** 8-way compass word for a plan move (+Y = project north), or up/down when vertical. */
export function cardinalDirection(d: Vec3, tol = 1e-6): string | undefined {
  const [dx, dy, dz] = d
  const plan = Math.hypot(dx, dy)
  if (plan <= tol && Math.abs(dz) <= tol) return undefined
  if (plan <= tol || Math.abs(dz) > 2 * plan) return dz > 0 ? 'up' : 'down'
  const names = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']
  const a = Math.atan2(dy, dx) // 0 = east, counter-clockwise
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
  return names[i]
}
