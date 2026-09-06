// ─── vertical audit ───────────────────────────────────────────────────────────
// HOW MUCH OF THE VERTICAL AXIS IS MEASURED, AND HOW MUCH IS A GUESS.
//
// `vertical.ts` already records this: every profile carries a
// `VerticalConfidence` saying whether its height came from a survey, from what
// it was observed to cross, from a `layer` ordering, or from a default. The
// docstring for that type says out loud what it is for — "so the debug overlay
// can explain a floating road by its CAUSE rather than by its symptom".
//
// This is that overlay's data half. Until now the confidence was written down
// and never read: `summariseProfiles` prints it to a dev console, which answers
// "how many" and never "WHICH ONE".
//
// ── Why this is a correctness tool and not a debug toy ────────────────────────
//
// The brief this was built under says: if a height does not exist in the
// source, degrade honestly and visibly, never fabricate a plausible value. The
// pipeline already does the first half — `assumed` is recorded, not laundered.
// This is the second half. A default clearance that nobody can see IS a
// fabricated value in every way that matters, because nothing downstream, and
// nobody looking at a screenshot, can tell it from a measurement.
//
// So the ranking below is not "how bad is the render". It is HOW MUCH IS BEING
// ASSERTED ON HOW LITTLE, which is a different question and the one that
// decides whether a picture can be shown to a client.
//
// PURE: profiles in, findings out. No THREE, no scene, no colour — a palette
// belongs to whoever draws, and this module is the reason to draw, not the ink.

import type { VerticalConfidence, StructureType } from './vertical'
import type { SolvedProfile } from './vertical-network'

/**
 * How far off the ground a structure has to sit before an unevidenced height
 * is worth flagging, metres.
 *
 * At grade, `assumed` costs nothing: the way is on the ground, which is where
 * it would be anyway. The claim only becomes load-bearing once the geometry
 * lifts or sinks — that is the point where a guess starts to look, to anyone
 * viewing it, exactly like a survey.
 */
export const ASSERTION_THRESHOLD_M = 1.0

/** One way whose vertical position is asserted on weak evidence. */
export interface VerticalFinding {
  wayId: string
  structure: StructureType
  confidence: VerticalConfidence
  /** Largest distance from its own ground along the way, metres. Signed. */
  peakOffsetM: number
  /** True where the grade limit had to be broken to keep the profile joined. */
  relaxed: boolean
}

export interface VerticalAudit {
  total: number
  byConfidence: Record<VerticalConfidence, number>
  /**
   * Ways placed off the ground on `assumed` evidence, worst first.
   *
   * "Worst" is by how far they are asserted, not by how wrong they look: a
   * viaduct guessed 5 m into the air is a bigger claim than a kerb guessed by
   * 20 cm, and only the first can put a road through a building.
   */
  findings: VerticalFinding[]
  /** Share of ways carrying no evidence better than a default, 0..1. */
  assumedShare: number
  /** Ways whose grade limit had to be relaxed to stay continuous. */
  relaxedCount: number
}

const EMPTY_COUNTS = (): Record<VerticalConfidence, number> =>
  ({ surveyed: 0, inferred: 0, tagged: 0, assumed: 0 })

/** Largest signed distance between a profile and its own ground, metres. */
export function peakOffsetM(p: SolvedProfile): number {
  let peak = 0
  for (let i = 0; i < p.elevationM.length; i++) {
    const d = p.elevationM[i] - p.groundM[i]
    if (Math.abs(d) > Math.abs(peak)) peak = d
  }
  return peak
}

/**
 * Census a solved scene by how well evidenced its vertical axis is.
 *
 * Deliberately reports `assumedShare` over the WHOLE scene rather than over the
 * flagged subset. Most ways in any city are at grade with no vertical claim to
 * make, and a denominator of "things I already decided were interesting" is how
 * a metric flatters itself.
 */
export function auditVertical(profiles: Iterable<SolvedProfile>): VerticalAudit {
  const byConfidence = EMPTY_COUNTS()
  const findings: VerticalFinding[] = []
  let total = 0
  let relaxedCount = 0

  for (const p of profiles) {
    total++
    byConfidence[p.confidence]++
    if (p.relaxed) relaxedCount++

    const peak = peakOffsetM(p)
    if (p.confidence === 'assumed' && Math.abs(peak) >= ASSERTION_THRESHOLD_M) {
      findings.push({
        wayId: p.wayId,
        structure: p.structure,
        confidence: p.confidence,
        peakOffsetM: peak,
        relaxed: p.relaxed,
      })
    }
  }

  findings.sort((a, b) => Math.abs(b.peakOffsetM) - Math.abs(a.peakOffsetM))

  return {
    total,
    byConfidence,
    findings,
    assumedShare: total === 0 ? 0 : byConfidence.assumed / total,
    relaxedCount,
  }
}

/**
 * The audit as a paragraph, for a dev console and for a commit message.
 *
 * Says what is NOT known first. A report that opens with how much was surveyed
 * is a report nobody reads to the end, and the end is the part that matters.
 */
export function describeAudit(audit: VerticalAudit): string {
  if (audit.total === 0) return 'no solved profiles'

  const pct = (n: number): string => `${((n / audit.total) * 100).toFixed(0)}%`
  const lines = [
    `${audit.total} ways solved`,
    `  assumed   ${audit.byConfidence.assumed} (${pct(audit.byConfidence.assumed)})` +
      '  — no evidence beyond a default clearance',
    `  tagged    ${audit.byConfidence.tagged} (${pct(audit.byConfidence.tagged)})`,
    `  inferred  ${audit.byConfidence.inferred} (${pct(audit.byConfidence.inferred)})`,
    `  surveyed  ${audit.byConfidence.surveyed} (${pct(audit.byConfidence.surveyed)})`,
  ]
  if (audit.relaxedCount > 0) {
    lines.push(`  ${audit.relaxedCount} ways exceeded their grade limit to stay continuous`)
  }
  if (audit.findings.length > 0) {
    lines.push(`  ${audit.findings.length} placed off the ground on a guess, worst first:`)
    for (const f of audit.findings.slice(0, 10)) {
      const sign = f.peakOffsetM >= 0 ? '+' : ''
      lines.push(`    ${f.wayId}  ${f.structure}  ${sign}${f.peakOffsetM.toFixed(1)} m`)
    }
    if (audit.findings.length > 10) {
      lines.push(`    …and ${audit.findings.length - 10} more`)
    }
  }
  return lines.join('\n')
}
