// ─── as-built-score ───────────────────────────────────────────────────────────
// Per-element deviation → an As-Built Conformance Score in 0–100.
//
// Normative reference: docs/AS_BUILT_SCORE_PLAN.md §3.
//
// This is a deliberate replica of calculateQualityScore() in ../validator.ts:
// same logarithmic penalty model, same "explain it before you total it" shape,
// same refusal to launder an unknown into a pass. That is a product decision,
// not laziness — the number only earns trust if it reads as the same KIND of
// number as the Health Score rather than a second metric to learn.
//
// Pure module: plain arithmetic, no three.js, no DOM, no i18n. The geometry that
// produces ElementDeviation lives in the worker; this file only judges it.

/**
 * What the measurement concluded about one modelled element.
 *
 *   conforming  — built where the model says
 *   deviated    — built, but outside tolerance
 *   missing     — looked at, and the surface is not there
 *   occluded    — inside a camera frustum but blocked by something nearer
 *   unobserved  — no camera ever looked at it
 *
 * The last two are NOT failures and never penalised. Treating an element nobody
 * filmed as compliant is how a 20-second clip of one clean corner scores 100.
 */
export type ElementState = 'conforming' | 'deviated' | 'missing' | 'occluded' | 'unobserved'

/** Judgeable states — the denominator the score is actually computed over. */
const SCOREABLE: ReadonlySet<ElementState> = new Set<ElementState>(['conforming', 'deviated', 'missing'])

export interface ElementDeviation {
  /** IFC express id, or whatever stable handle the caller uses. */
  id: number
  ifcClass: string
  state: ElementState
  /**
   * p95 of sample→nearest-point distance in metres, over matched samples.
   * null whenever the state is not scoreable, and for `missing` (there is no
   * matched surface to measure a distance against).
   */
  deviationP95: number | null
  /** Fraction of the element's sampled surface that found any nearby point. */
  matchedFraction: number
}

/** Reconstructed geometry with no modelled element near it — built, not drawn. */
export interface UnmodelledCluster {
  id: string
  pointCount: number
}

export interface AsBuiltCoverage {
  total: number
  observed: number
  occluded: number
  unobserved: number
  /** observed / total. The number that must always be printed beside the score. */
  observedFraction: number
}

export type AsBuiltRuleId = 'AB_ELEMENT_MISSING' | 'AB_POSITION_DEVIATION' | 'AB_UNMODELLED_ELEMENT'

export interface AsBuiltContribution {
  ruleId: AsBuiltRuleId
  severity: 'error' | 'warning'
  count: number
  /** Points recovered by clearing this rule (exact away from the 0/100 clamp). */
  penalty: number
}

/**
 * Why no score was emitted. A null score with a reason is a usable product
 * state; a number produced from insufficient evidence is not.
 */
export type InconclusiveReason = 'low-coverage' | 'tolerance-below-alignment' | 'nothing-scoreable'

export interface AsBuiltInput {
  elements: ElementDeviation[]
  unmodelled: UnmodelledCluster[]
  /** Combined tolerance τ in metres: construction tolerance ⊕ measurement uncertainty. */
  toleranceM: number
  /** RMSE of the cloud↔IFC registration, metres. */
  alignmentRmseM: number
}

export interface AsBuiltResult {
  /** 0–100, or null when inconclusive. */
  score: number | null
  inconclusiveReason: InconclusiveReason | null
  coverage: AsBuiltCoverage
  contributions: AsBuiltContribution[]
  counts: { conforming: number; deviated: number; missing: number; unmodelled: number }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEIGHTS: Record<AsBuiltRuleId, { error: number; warning: number }> = {
  // Something modelled is not there. The most consequential finding on a site.
  AB_ELEMENT_MISSING:    { error: 5, warning: 0 },
  AB_POSITION_DEVIATION: { error: 4, warning: 1.2 },
  // Built but not modelled: a real finding, but it is a drawing problem rather
  // than a construction defect, so it never reaches error weight.
  AB_UNMODELLED_ELEMENT: { error: 0, warning: 1.5 },
}

/** Below this observed fraction the capture cannot support a number at all. */
export const MIN_COVERAGE_FRACTION = 0.25

/**
 * τ must clear the registration error by this factor before any deviation can be
 * attributed to the building rather than to our own alignment. Without this
 * guard the product confidently reports registration artefacts as construction
 * defects — the single fastest way to destroy the credibility of a number.
 */
export const ALIGNMENT_MARGIN = 2

/** A deviation beyond this multiple of τ is an error, not a warning. */
const ERROR_MULTIPLE = 2

// ── Coverage ──────────────────────────────────────────────────────────────────

export function computeCoverage(elements: readonly ElementDeviation[]): AsBuiltCoverage {
  let observed = 0, occluded = 0, unobserved = 0
  for (const e of elements) {
    if (e.state === 'occluded') occluded++
    else if (e.state === 'unobserved') unobserved++
    else observed++
  }
  const total = elements.length
  return {
    total, observed, occluded, unobserved,
    observedFraction: total > 0 ? observed / total : 0,
  }
}

// ── Penalties ─────────────────────────────────────────────────────────────────

/**
 * Break the score into per-rule penalties, ranked by impact.
 *
 * Penalties diminish logarithmically: the first offending element costs the full
 * weight, each further one adds less (`weight × (1 + ln(count))`). This matters
 * more here than in validation — a slab poured 4 cm high is ONE site problem,
 * not eight hundred defective elements, and a linear sum would floor the score
 * of every real capture to zero.
 */
export function explainAsBuiltScore(input: AsBuiltInput): AsBuiltContribution[] {
  const buckets = new Map<string, { ruleId: AsBuiltRuleId; severity: 'error' | 'warning'; count: number }>()

  const bump = (ruleId: AsBuiltRuleId, severity: 'error' | 'warning'): void => {
    const key = ruleId + ':' + severity
    const existing = buckets.get(key)
    if (existing) existing.count++
    else buckets.set(key, { ruleId, severity, count: 1 })
  }

  for (const e of input.elements) {
    if (e.state === 'missing') {
      bump('AB_ELEMENT_MISSING', 'error')
    } else if (e.state === 'deviated') {
      // A deviation is only an error once it is far enough past tolerance that
      // measurement noise cannot explain it.
      const severe = e.deviationP95 !== null && e.deviationP95 > ERROR_MULTIPLE * input.toleranceM
      bump('AB_POSITION_DEVIATION', severe ? 'error' : 'warning')
    }
  }
  for (const _ of input.unmodelled) bump('AB_UNMODELLED_ELEMENT', 'warning')

  const contributions: AsBuiltContribution[] = []
  for (const { ruleId, severity, count } of buckets.values()) {
    const weight = WEIGHTS[ruleId][severity]
    if (weight <= 0 || count <= 0) continue
    contributions.push({ ruleId, severity, count, penalty: weight * (1 + Math.log(count)) })
  }
  return contributions.sort((a, b) => b.penalty - a.penalty)
}

// ── Score ─────────────────────────────────────────────────────────────────────

/**
 * The headline number, or an explicit refusal to produce one.
 *
 * Note what is deliberately NOT done: the score is never scaled by coverage.
 * Folding a 34% coverage into an 87 to report 30 would be arithmetic dressed as
 * honesty — it destroys the meaning of both numbers. They are reported side by
 * side, exactly as the Health Score reports its rule coverage.
 */
export function scoreAsBuilt(input: AsBuiltInput): AsBuiltResult {
  const coverage = computeCoverage(input.elements)
  const contributions = explainAsBuiltScore(input)

  const counts = { conforming: 0, deviated: 0, missing: 0, unmodelled: input.unmodelled.length }
  for (const e of input.elements) {
    if (e.state === 'conforming') counts.conforming++
    else if (e.state === 'deviated') counts.deviated++
    else if (e.state === 'missing') counts.missing++
  }

  const reason = inconclusiveReason(input, coverage)
  if (reason) {
    return { score: null, inconclusiveReason: reason, coverage, contributions, counts }
  }

  let penalty = 0
  for (const c of contributions) penalty += c.penalty
  return {
    score: Math.max(0, Math.round(100 - penalty)),
    inconclusiveReason: null,
    coverage, contributions, counts,
  }
}

function inconclusiveReason(input: AsBuiltInput, coverage: AsBuiltCoverage): InconclusiveReason | null {
  // Order matters: a tolerance that cannot separate the building from the
  // registration invalidates the measurement itself, so it outranks coverage.
  if (!(input.toleranceM > 0) || input.toleranceM < ALIGNMENT_MARGIN * input.alignmentRmseM) {
    return 'tolerance-below-alignment'
  }
  if (coverage.observed === 0) return 'nothing-scoreable'
  if (coverage.observedFraction < MIN_COVERAGE_FRACTION) return 'low-coverage'
  return null
}
