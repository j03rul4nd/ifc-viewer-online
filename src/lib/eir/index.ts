// ─── EIR validation — public API ──────────────────────────────────────────────
// The ONLY surface other modules should import from. Everything here delegates to
// the existing IDS engine/worker; EIR adds the editable profile format + compiler.
//
//   validateModel(buffer, profile) → Promise<EirReport>   (runs in the IDS worker)
//   validateElements(elements, profile) → EirReport        (pure, for tests/SDK)
//
// Run results render unchanged in the existing IdsPanel (compliance score,
// per-element failures, 3D highlight, JSON/CSV/HTML/BCF export).

import type { IdsElement } from '../ids/ids-types'
import { runIds, type IdsRunOptions } from '../ids/ids-runner'
import { runIdsChecks, type IdsCheckOptions } from '../ids/ids-engine'
import { compileEirToIds } from './eir-compiler'
import type { EirProfile, EirReport } from './eir-types'

/**
 * Validate an IFC model buffer against an EIR profile, off the main thread.
 * Compiles the profile to an IdsDocument and runs it on the IDS worker — the
 * same path the .ids loader uses, so there is one engine and one worker.
 */
export async function validateModel(
  buffer: ArrayBuffer | Uint8Array,
  profile: EirProfile,
  options: IdsRunOptions = {},
): Promise<EirReport> {
  const doc = compileEirToIds(profile)
  const { result } = await runIds(doc, buffer, options)
  return result
}

/**
 * Pure validation against already-gathered elements (no worker, no WASM).
 * Used by unit tests and any caller that already holds normalized elements.
 */
export function validateElements(
  elements: IdsElement[],
  profile: EirProfile,
  options: IdsCheckOptions = {},
): EirReport {
  return runIdsChecks(compileEirToIds(profile), elements, options)
}

export { compileEirToIds, ruleToSpec, numericValue, defaultRuleName } from './eir-compiler'
export { parseEirProfile, serializeEirProfile, eirProfileSchema, eirRuleSchema, isValidRule, slug } from './eir-schema'
export { idsToEir, type EirImportResult } from './eir-import'
export { modelClassCounts, applicabilityCount } from './model-vocab'
export { lintProfile, lintByRule, type LintIssue, type LintCode } from './eir-lint'
export { BUILTIN_EIR_PROFILES, emptyEirProfile } from './eir-profiles'
export {
  LocalStorageProfileProvider, defaultProfileProvider, isBuiltinProfile,
} from './eir-provider'
export type {
  EirProfile, EirRule, EirRuleType, EirSeverity, NumericOperator, EirReport,
  ValidationProfileProvider,
} from './eir-types'
