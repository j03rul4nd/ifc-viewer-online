// ─── certify/canonical.ts ─────────────────────────────────────────────────────
// Canonical codec for the signed validation-certificate payload.
//
// This is a CROSS-BOUNDARY CONTRACT (same discipline as share-report.ts ↔ the
// report Worker): the frontend builds and canonicalises the payload here, and
// the certification Worker re-canonicalises the exact same bytes before signing
// (ECDSA P-256) and when deriving the deduplication hash. If the two sides ever
// disagree by a single byte, signatures stop verifying — the frozen vectors in
// canonical.test.ts are the shared contract and must be mirrored by the Worker's
// test suite. Bump CERTIFY_SCHEMA_VERSION on any incompatible payload change.
//
// IMPORTANT: this file must stay dependency-free (no React, no Zustand, no app
// imports) so it can be copied verbatim into the Worker and imported by tests
// in any runtime. Only Web-standard APIs (TextEncoder, crypto.subtle) are used.

// ── Payload schema (v1) ───────────────────────────────────────────────────────

export const CERTIFY_SCHEMA_VERSION = 1

/**
 * Aggregate outcome of one enabled rule in the certified run.
 *   fail    — at least one error-severity issue
 *   warning — no errors, at least one warning
 *   pass    — no errors/warnings (info-only findings are advisory → still pass)
 */
export type CertifyRuleStatus = 'pass' | 'fail' | 'warning'

export interface CertifyRuleResult {
  rule_id: string
  status: CertifyRuleStatus
}

/**
 * The exact object that gets canonicalised and signed. Deliberately excludes
 * file names, element names, GlobalIds, messages and geometry — the certificate
 * attests the per-rule aggregate result, never the model's contents.
 */
export interface CertifyPayloadV1 {
  schema_version: typeof CERTIFY_SCHEMA_VERSION
  /** sha256 (lowercase hex) of the raw IFC bytes, computed in the browser. */
  file_hash_sha256: string
  /** App/validator version + rule-set size, e.g. "2.0.0+r44". */
  validator_version: string
  /** Profile id + fingerprint of the effective RulesConfig, e.g. "profile:iso19650@sha256:ab12…". */
  ruleset_version: string
  /** One entry per rule enabled in the run, in canonical DEFAULT_RULES order. */
  rules_result: CertifyRuleResult[]
  /** Integer 0–100 (calculateQualityScore, rounded and clamped). */
  health_score: number
  /** sha256 of the .ids spec when the run included an IDS check, else null. */
  ids_spec_hash: string | null
  /** ISO-8601 UTC. Excluded from the dedup hash (see computeCertHash). */
  validated_at: string
  /** Clerk organization id when an authenticated member issues for their org. */
  org_id: string | null
}

// ── Canonical JSON ────────────────────────────────────────────────────────────

/**
 * Deterministic JSON serialisation: object keys sorted by UTF-16 code unit
 * (NOT locale-aware — localeCompare would break cross-runtime determinism),
 * no whitespace, arrays in their given order, `undefined` object values
 * dropped. Throws on values JSON cannot represent losslessly (undefined at
 * the top level / in arrays, functions, symbols, bigints, NaN/Infinity) —
 * a signed payload must never silently coerce.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error('canonicalJson: non-finite numbers cannot be canonicalised')
      }
      return JSON.stringify(value)
    case 'string':
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v)).join(',')}]`
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
    }
    default:
      throw new Error(`canonicalJson: unsupported value of type "${typeof value}"`)
  }
}

/** UTF-8 bytes of the canonical payload — exactly what the Worker signs. */
export function payloadCanonicalBytes(payload: CertifyPayloadV1): Uint8Array {
  return new TextEncoder().encode(canonicalJson(payload))
}

// ── Hashing ───────────────────────────────────────────────────────────────────

/** sha256 as lowercase hex. Accepts raw bytes (file hashing) or a string (canonical JSON). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes: BufferSource = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Deduplication key + public certificate id: sha256 of the canonical payload
 * WITHOUT `validated_at`. Re-certifying the same file with the same ruleset and
 * the same outcome on a different day therefore yields the same cert_hash, and
 * the Worker reuses the stored row instead of minting a duplicate.
 */
export async function computeCertHash(payload: CertifyPayloadV1): Promise<string> {
  const withoutTimestamp: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (k !== 'validated_at') withoutTimestamp[k] = v
  }
  return sha256Hex(canonicalJson(withoutTimestamp))
}
