// ─── certify/build-payload.ts ─────────────────────────────────────────────────
// Builds the CertifyPayloadV1 for the signed validation certificate from state
// the client ALREADY has (validationStore result + active RulesConfig). Nothing
// is recomputed and — critically — nothing model-identifying enters the payload:
// no file name, no element names, no GlobalIds, no messages (see canonical.ts).
//
// The caller supplies the file hash, computed from the raw IFC bytes via
// sha256Hex(modelRegistry.getBuffer(modelId)) — the bytes themselves never leave
// the browser; only their digest does.

import type { RulesConfig, ValidationIssue, ValidationResult } from '../../types'
import { DEFAULT_RULES } from '../../types'
import { APP_VERSION } from '../app-version'
import { calculateQualityScore } from '../validator'
import {
  CERTIFY_SCHEMA_VERSION,
  canonicalJson,
  sha256Hex,
  type CertifyPayloadV1,
  type CertifyRuleResult,
  type CertifyRuleStatus,
} from './canonical'

// ── Validator version ─────────────────────────────────────────────────────────

// The base version comes from the shared `app-version.ts` (same source the
// local certificate in ValidationExportModal uses, so they can't diverge).
// The `+rN` suffix tracks the canonical rule count (DEFAULT_RULES is the source
// of truth per ARCHITECTURE.md), so adding a rule changes the version string —
// and therefore the cert_hash — without anyone having to remember to bump it.

const CANONICAL_RULE_IDS = Object.entries(DEFAULT_RULES)
  .filter(([key, value]) => key.startsWith('RULE_') && typeof value === 'boolean')
  .map(([key]) => key)

export const CERTIFY_VALIDATOR_VERSION = `${APP_VERSION}+r${CANONICAL_RULE_IDS.length}`

// ── Ruleset fingerprint ───────────────────────────────────────────────────────

/**
 * `profile:<id>@sha256:<16-hex>` — identifies the *effective* configuration the
 * run used: enabled rules, naming patterns, required Psets, severityOverrides
 * and thresholds all live in RulesConfig, so hashing the whole (canonicalised)
 * object fingerprints every Pro control in one move. Truncated to 16 hex chars:
 * this is a version discriminator, not a security boundary (integrity of the
 * certificate is the ECDSA signature over the full payload).
 */
export async function computeRulesetVersion(
  rules: RulesConfig,
  profileId: string | null,
): Promise<string> {
  const id = (profileId ?? 'custom').replace(/[^0-9A-Za-z._-]/g, '-')
  const fingerprint = await sha256Hex(canonicalJson(rules))
  return `profile:${id}@sha256:${fingerprint.slice(0, 16)}`
}

// ── Rule results ──────────────────────────────────────────────────────────────

/** Enabled rules in canonical DEFAULT_RULES order (unknown extras appended, sorted). */
function enabledRuleIds(rules: RulesConfig): string[] {
  const cfg = rules as Record<string, unknown>
  const canonical = CANONICAL_RULE_IDS.filter((key) => cfg[key] === true)
  const extras = Object.keys(cfg)
    .filter((key) => key.startsWith('RULE_') && cfg[key] === true && !CANONICAL_RULE_IDS.includes(key))
    .sort()
  return [...canonical, ...extras]
}

function ruleResults(issues: ValidationIssue[], enabledIds: string[]): CertifyRuleResult[] {
  const worst = new Map<string, CertifyRuleStatus>()
  for (const issue of issues) {
    if (issue.severity === 'error') {
      worst.set(issue.ruleId, 'fail')
    } else if (issue.severity === 'warning' && worst.get(issue.ruleId) !== 'fail') {
      worst.set(issue.ruleId, 'warning')
    }
    // 'info' issues are advisory — they never demote a rule from 'pass'.
  }
  return enabledIds.map((rule_id) => ({ rule_id, status: worst.get(rule_id) ?? 'pass' }))
}

// ── Payload builder ───────────────────────────────────────────────────────────

const HEX_SHA256 = /^[0-9a-f]{64}$/

export interface BuildCertifyPayloadArgs {
  /** The finished run for ONE model (issues + optional precomputed score). */
  result: Pick<ValidationResult, 'issues' | 'qualityScore'>
  /** The effective RulesConfig the run used (incl. overrides/thresholds). */
  rules: RulesConfig
  /** Active validation profile id, or null for a hand-tuned custom config. */
  profileId: string | null
  /** sha256 hex of the raw IFC bytes (sha256Hex over modelRegistry buffer). */
  fileHashSha256: string
  /** sha256 of the .ids spec if the certified run included an IDS check. */
  idsSpecHash?: string | null
  /** Clerk organization id when issuing on behalf of an organization. */
  orgId?: string | null
  /** Injectable for tests; defaults to now. */
  validatedAt?: Date
  /** Injectable for tests; defaults to CERTIFY_VALIDATOR_VERSION. */
  validatorVersion?: string
}

export async function buildCertifyPayload(args: BuildCertifyPayloadArgs): Promise<CertifyPayloadV1> {
  const fileHash = args.fileHashSha256.toLowerCase()
  if (!HEX_SHA256.test(fileHash)) {
    throw new Error('buildCertifyPayload: fileHashSha256 must be 64 lowercase hex chars (sha256)')
  }

  const rawScore = args.result.qualityScore ?? calculateQualityScore(args.result)
  const healthScore = Math.max(0, Math.min(100, Math.round(rawScore)))

  return {
    schema_version: CERTIFY_SCHEMA_VERSION,
    file_hash_sha256: fileHash,
    validator_version: args.validatorVersion ?? CERTIFY_VALIDATOR_VERSION,
    ruleset_version: await computeRulesetVersion(args.rules, args.profileId),
    rules_result: ruleResults(args.result.issues, enabledRuleIds(args.rules)),
    health_score: healthScore,
    ids_spec_hash: args.idsSpecHash ?? null,
    validated_at: (args.validatedAt ?? new Date()).toISOString(),
    org_id: args.orgId ?? null,
  }
}
