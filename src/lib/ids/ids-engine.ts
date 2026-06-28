// ─── IDS engine ───────────────────────────────────────────────────────────────
// Pure checker: given a parsed IdsDocument and a list of normalized elements,
// evaluate applicability + requirements and produce a structured result.
// Worker-agnostic and fully unit-tested. Per-facet evaluation lives in
// ids-engine-facets.ts; failure reasons are machine-readable codes (ids-types).

import type {
  IdsDocument, IdsElement, IdsResult, IdsSpecResult, IdsFailure,
  IdsFacet, IdsReason, IdsSpecification,
} from './ids-types'
import { evalFacet, reasonFor } from './ids-engine-facets'

const MAX_FAILURES_PER_SPEC = 200

/**
 * Collapse a schema identifier to its family for ifcVersion matching (P2-4):
 * IFC4X3_ADD2 → IFC4X3, IFC4_ADD2 → IFC4, IFC2X3_TC1 → IFC2X3. Order matters —
 * IFC4X3 must be tested before IFC4 (prefix overlap).
 */
export function ifcSchemaFamily(schema: string): string {
  const s = schema.toUpperCase().trim()
  if (s.startsWith('IFC4X3')) return 'IFC4X3'
  if (s.startsWith('IFC4')) return 'IFC4'
  if (s.startsWith('IFC2X3')) return 'IFC2X3'
  return s
}

function specTargetsSchema(spec: IdsSpecification, modelSchema: string | undefined): boolean {
  if (!spec.ifcVersions?.length || !modelSchema) return true // no constraint / unknown schema → applies
  const family = ifcSchemaFamily(modelSchema)
  return spec.ifcVersions.some((v) => ifcSchemaFamily(v) === family)
}

export interface IdsCheckOptions {
  /** Schema of the model being checked (from web-ifc GetModelSchema). */
  modelSchema?: string
  /**
   * Skip specs whose ifcVersions exclude the model schema (status na +
   * skippedReason). OFF by default: the official bSI testcases declare
   * ifcVersion="IFC2X3" on IFC4 fixtures and still expect evaluation —
   * ifctester mirrors this with an opt-in `should_filter_version`.
   */
  filterByIfcVersion?: boolean
}

function applies(el: IdsElement, applicability: IdsFacet[]): boolean {
  // Element applies if every supported applicability facet is satisfied.
  let anySupported = false
  for (const f of applicability) {
    const r = evalFacet(el, f)
    if (!r.supported) continue
    anySupported = true
    if (!(r.present && r.valueOk)) return false
  }
  return anySupported // require at least one supported (entity) facet to drive the set
}

/** Check a single specification against the elements. Pure. */
export function checkSpec(spec: IdsSpecification, elements: IdsElement[], options: IdsCheckOptions = {}): IdsSpecResult {
  // All six IDS 1.0 facets are evaluated since P3-4. The set stays in the result
  // shape for forward compatibility (a future IDS version may add facet kinds).
  const unsupported = new Set<string>()

  // ifcVersion gate (P2-4, OPT-IN — see IdsCheckOptions.filterByIfcVersion):
  // the spec targets other schemas → honest skip, never a silent pass/fail.
  // Score excludes it (0 applicable, 0 checks).
  if (options.filterByIfcVersion === true && !specTargetsSchema(spec, options.modelSchema)) {
    return {
      name: spec.name,
      description: spec.description,
      ...(spec.identifier ? { identifier: spec.identifier } : {}),
      status: 'na',
      skippedReason: 'ifcVersion',
      applicableCount: 0,
      passedCount: 0,
      failedCount: 0,
      failures: [],
      unsupported: [...unsupported],
    }
  }

  const cardinality = spec.cardinality ?? 'required'
  const applicable = elements.filter((el) => applies(el, spec.applicability))

  // Prohibited specification (P2-3): the model must contain NO applicable
  // elements — requirements play no role (the IDS schema forbids them here).
  if (cardinality === 'prohibited') {
    const failures: IdsFailure[] = applicable.slice(0, MAX_FAILURES_PER_SPEC).map((el) => ({
      expressId: el.expressId,
      ifcClass: el.ifcClass,
      name: el.name ?? `#${el.expressId}`,
      ...(el.globalId != null ? { globalId: el.globalId } : {}),
      reasons: [{ code: 'specProhibitedButPresent' as const }],
    }))
    return {
      name: spec.name,
      description: spec.description,
      ...(spec.identifier ? { identifier: spec.identifier } : {}),
      status: applicable.length === 0 ? 'pass' : 'fail',
      applicableCount: applicable.length,
      passedCount: 0,
      failedCount: applicable.length,
      failures,
      unsupported: [...unsupported],
    }
  }

  const failures: IdsFailure[] = []
  let passed = 0

  for (const el of applicable) {
    const reasons: IdsReason[] = []
    for (const req of spec.requirements) {
      const reason = reasonFor(el, req.facet, req.cardinality)
      if (reason) reasons.push(reason)
    }
    if (reasons.length === 0) passed++
    else if (failures.length < MAX_FAILURES_PER_SPEC) {
      failures.push({
        expressId: el.expressId, ifcClass: el.ifcClass, name: el.name ?? `#${el.expressId}`,
        ...(el.globalId != null ? { globalId: el.globalId } : {}), reasons,
      })
    } else {
      // keep counting but stop storing
    }
  }

  // Required specification with nothing applicable (P2-3): "the model must
  // contain such elements" → synthetic failure row (expressId -1) that also
  // counts as one failed check in the score.
  if (applicable.length === 0 && cardinality === 'required') {
    return {
      name: spec.name,
      description: spec.description,
      ...(spec.identifier ? { identifier: spec.identifier } : {}),
      status: 'fail',
      applicableCount: 0,
      passedCount: 0,
      failedCount: 1,
      failures: [{ expressId: -1, ifcClass: '', name: '', reasons: [{ code: 'specRequiredButAbsent' }] }],
      unsupported: [...unsupported],
    }
  }

  const failedCount = applicable.length - passed
  const status: IdsSpecResult['status'] = applicable.length === 0 ? 'na' : failedCount === 0 ? 'pass' : 'fail'
  return {
    name: spec.name,
    description: spec.description,
    status,
    applicableCount: applicable.length,
    passedCount: passed,
    failedCount,
    failures,
    unsupported: [...unsupported],
  }
}

/** Aggregate per-spec results into the final IdsResult. Pure. */
export function summarizeResults(title: string | undefined, specs: IdsSpecResult[], modelSchema?: string): IdsResult {
  let totApplicable = 0, totPassed = 0
  let passedSpecs = 0, failedSpecs = 0, naSpecs = 0
  for (const s of specs) {
    // For normal specs applicable === passed + failed; the max() keeps the
    // required-but-absent synthetic check (0 applicable, 1 failed) in the
    // denominator so the score can't be 100 while a required spec failed.
    totApplicable += Math.max(s.applicableCount, s.passedCount + s.failedCount)
    totPassed += s.passedCount
    if (s.status === 'pass') passedSpecs++
    else if (s.status === 'fail') failedSpecs++
    else naSpecs++
  }
  return {
    title,
    ...(modelSchema ? { modelSchema } : {}),
    totalSpecs: specs.length,
    passedSpecs,
    failedSpecs,
    naSpecs,
    score: totApplicable > 0 ? Math.round((totPassed / totApplicable) * 100) : 100,
    specs,
  }
}

/** Run all specifications against the elements. Pure. */
export function runIdsChecks(doc: IdsDocument, elements: IdsElement[], options: IdsCheckOptions = {}): IdsResult {
  return summarizeResults(doc.title, doc.specifications.map((s) => checkSpec(s, elements, options)), options.modelSchema)
}
