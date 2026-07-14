// ─── FM-readiness (F5 P4) ─────────────────────────────────────────────────────
// A pure aggregate over a COBie extraction: how COMPLETE is the data a facility
// manager would receive? This is NOT a validator rule (the canonical rule count
// stays put) and NOT a COBie certification — it is an honest completeness
// indicator computed from the extraction's own per-sheet counters
// (rows / named / withGuid). Displayed as a badge; the wording never claims an
// official COBie pass.
//
// Rubric (documented, deterministic): FM handover cares that the assets someone
// will operate are present AND identifiable. We score the three sheets that
// carry that meaning, weighted by how load-bearing they are for O&M:
//   · Component (0.5) — the maintainable assets; want a name AND a GlobalId.
//   · Space     (0.3) — the room program; want a name.
//   · Type      (0.2) — the product types the components resolve to; presence.
// A sheet with zero rows contributes 0 (you cannot hand over what is not there).
// The score is the weighted sum of each sheet's completeness fraction × 100.

import type { CobieExtractResult } from '../worker-schemas'

export type FmTier = 'ready' | 'partial' | 'insufficient'

export interface FmReadiness {
  /** 0–100 completeness score (see rubric). */
  score: number
  tier: FmTier
  /** Per-sheet completeness, for the expanded breakdown. */
  sheets: {
    component: { rows: number; named: number; withGuid: number; fraction: number }
    space: { rows: number; named: number; fraction: number }
    type: { rows: number; fraction: number }
  }
}

const clampFraction = (n: number, d: number): number => (d <= 0 ? 0 : Math.max(0, Math.min(1, n / d)))

export function computeFmReadiness(result: CobieExtractResult): FmReadiness {
  const c = result.counts['Component'] ?? { rows: 0, named: 0, withGuid: 0 }
  const s = result.counts['Space'] ?? { rows: 0, named: 0, withGuid: 0 }
  const ty = result.counts['Type'] ?? { rows: 0, named: 0, withGuid: 0 }

  // Component completeness = average of the named-fraction and guid-fraction
  // (an asset needs both a human label and a stable id to be handed over).
  const compFraction = c.rows === 0 ? 0 : (clampFraction(c.named, c.rows) + clampFraction(c.withGuid, c.rows)) / 2
  const spaceFraction = clampFraction(s.named, s.rows)
  // Types are graded on presence relative to components: a component set with
  // no Type rows is unresolved; capped at 1 when types exist at all.
  const typeFraction = ty.rows > 0 ? 1 : c.rows > 0 ? 0 : 0

  const score = Math.round((compFraction * 0.5 + spaceFraction * 0.3 + typeFraction * 0.2) * 100)
  const tier: FmTier = score >= 75 ? 'ready' : score >= 40 ? 'partial' : 'insufficient'

  return {
    score,
    tier,
    sheets: {
      component: { rows: c.rows, named: c.named, withGuid: c.withGuid, fraction: compFraction },
      space: { rows: s.rows, named: s.named, fraction: spaceFraction },
      type: { rows: ty.rows, fraction: typeFraction },
    },
  }
}
