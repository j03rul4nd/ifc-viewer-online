// ─── EIR types ──────────────────────────────────────────────────────────────
// Employer Information Requirements (EIR) validation — a data-driven, editable
// profile format inspired by ISO 19650. Deliberately a *strict subset* of
// buildingSMART IDS: every EirRule compiles 1:1 to an IdsSpecification
// (see eir-compiler.ts), so there is ONE validation engine (the IDS engine),
// not two. This file owns the on-disk/JSON shape only — no engine logic.
//
// Why reuse IDS instead of a new engine: the IDS engine (src/lib/ids) is pure,
// unit-tested against the official bSI testcases, already extracts/caches every
// property/pset/classification/material once per model (ids-gather.ts), and
// already renders results + 3D highlighting + export (IdsPanel). An EIR profile
// is therefore just another *source* of an IdsDocument.

import type { IdsResult } from '../ids/ids-types'

/**
 * Per-rule severity. `ignored` rules are NOT compiled into the IDS document,
 * so they never affect the compliance score (a true mute, not a hidden pass).
 * error/warning/info all compile to a required specification — a failure is a
 * failure in IDS terms; the severity is carried through for display/grouping.
 */
export type EirSeverity = 'error' | 'warning' | 'info' | 'ignored'

/** Comparison operators for a numeric rule. `=` uses tolerance-aware equality. */
export type NumericOperator = '>' | '>=' | '<' | '<=' | '='

/** Every rule type the engine supports today. New types extend this union. */
export type EirRuleType =
  | 'entityExists'
  | 'requiredProperty'
  | 'requiredPropertySet'
  | 'propertyNotEmpty'
  | 'propertyEquals'
  | 'numeric'
  | 'allowedValues'
  | 'regex'
  | 'classification'

interface EirRuleBase {
  /** Stable id (used by the editor for edit/delete/duplicate). */
  id: string
  type: EirRuleType
  /** IFC entity the rule applies to, e.g. "IfcDoor" (case-insensitive match). */
  entity: string
  /** Optional PredefinedType narrowing of the applicability, e.g. "FIRE_DOOR". */
  predefinedType?: string
  severity: EirSeverity
  /** Optional human label shown in the report instead of the generated one. */
  message?: string
}

/** At least one element of `entity` must exist in the model. */
export interface EntityExistsRule extends EirRuleBase { type: 'entityExists' }

/** The named property must be present (in `pset`, or any pset when omitted). */
export interface RequiredPropertyRule extends EirRuleBase {
  type: 'requiredProperty'
  pset?: string
  property: string
}

/** The named property set must be present on the element. */
export interface RequiredPropertySetRule extends EirRuleBase {
  type: 'requiredPropertySet'
  pset: string
}

/** The property must be present AND non-empty (rejects null and ""). */
export interface PropertyNotEmptyRule extends EirRuleBase {
  type: 'propertyNotEmpty'
  pset?: string
  property: string
}

/** The property must equal `value` (exact; numbers tolerance-aware). */
export interface PropertyEqualsRule extends EirRuleBase {
  type: 'propertyEquals'
  pset?: string
  property: string
  value: string
}

/** The property must satisfy a numeric comparison, e.g. Area > 0. */
export interface NumericRule extends EirRuleBase {
  type: 'numeric'
  pset?: string
  property: string
  operator: NumericOperator
  value: number
}

/** The property must be one of the allowed values, e.g. FireRating ∈ {EI30,EI60}. */
export interface AllowedValuesRule extends EirRuleBase {
  type: 'allowedValues'
  pset?: string
  property: string
  values: string[]
}

/**
 * The property (default) or root attribute (`target: 'attribute'`) must match a
 * regular expression, e.g. Reference matching ^[A-Z]{2}-[0-9]+$.
 */
export interface RegexRule extends EirRuleBase {
  type: 'regex'
  target?: 'property' | 'attribute'
  pset?: string
  property: string
  pattern: string
}

/** The element must carry a classification (optionally of `system`/`value`). */
export interface ClassificationRule extends EirRuleBase {
  type: 'classification'
  system?: string
  value?: string
}

export type EirRule =
  | EntityExistsRule
  | RequiredPropertyRule
  | RequiredPropertySetRule
  | PropertyNotEmptyRule
  | PropertyEqualsRule
  | NumericRule
  | AllowedValuesRule
  | RegexRule
  | ClassificationRule

/** A complete, editable, importable/exportable EIR validation profile. */
export interface EirProfile {
  /** Stable id (slug or uuid). Used by providers as the storage key. */
  id: string
  name: string
  /** Author-managed schema/content version (bumped on edit). */
  version: number
  description?: string
  rules: EirRule[]
}

/**
 * The validation report. Reuses the IDS result shape verbatim so the existing
 * IdsPanel renders it unchanged (compliance score, per-spec pass/fail/na,
 * per-element failures, grouping, 3D highlight, export). `score` is the
 * compliance percentage.
 */
export type EirReport = IdsResult

// ── Rule source abstraction (future REST / GraphQL / CDE providers) ───────────

/**
 * Abstracts WHERE profiles come from so the engine never depends on storage.
 * The default implementation is LocalStorageProfileProvider (eir-provider.ts);
 * a REST/GraphQL/CDE provider only has to implement this interface — no engine
 * change. This is the seam requested for future CDE/document-manager integration.
 */
export interface ValidationProfileProvider {
  /** All profiles this provider can serve (for a picker). */
  listProfiles(): Promise<EirProfile[]>
  /** Load one profile by id. Rejects if not found. */
  loadProfile(id: string): Promise<EirProfile>
  /** Create or overwrite a profile. */
  saveProfile(profile: EirProfile): Promise<void>
  /** Remove a profile by id. No-op if absent. */
  deleteProfile(id: string): Promise<void>
}
