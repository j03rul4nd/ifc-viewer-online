// ─── cloud/api-client.ts ──────────────────────────────────────────────────────
// The ONLY module that talks to the certification Worker (DA-10: the backend
// lives behind VITE_API_URL; this repo knows URLs, never credentials). Every
// function returns a Result (D-12) — no exception ever crosses this boundary.
//
// Without VITE_API_URL the cloud feature simply does not exist: isCloudEnabled()
// is false and certify()/getCertificate() resolve to `cloud_disabled` without
// touching the network. Deleting that env var is the rollback for all of F1.
//
// Only the CertifyPayloadV1 JSON travels here — never the IFC bytes (I-2).

import type { CertifyPayloadV1 } from '../certify/canonical'
import type { Result } from '../result'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Worker error envelope codes, plus the two client-side ones. */
export type ApiErrorCode =
  | 'cloud_disabled' // VITE_API_URL absent — cloud feature off, no fetch made
  | 'network' // fetch rejected or 15 s timeout
  | 'invalid_payload'
  | 'unknown_rule_id'
  | 'not_found'
  | 'rate_limited'
  | 'internal'
  // Authenticated surface (F2 — account-client.ts):
  | 'unauthorized'
  | 'quota_exceeded'
  | 'service_disabled'
  | 'upgrade_required'

export interface ApiError {
  code: ApiErrorCode
  message?: string
  /** Seconds from the Retry-After header, present on `rate_limited`. */
  retryAfterSeconds?: number
}

/** `POST /certify` success body. */
export interface CertifyResponse {
  payload: CertifyPayloadV1
  signature: string
  key_id: string
  cert_hash: string
  verify_url: string
  deduplicated: boolean
}

export interface CertificateEntry {
  payload: CertifyPayloadV1
  signature: string
  key_id: string
  status: string
  created_at: string
}

/** `GET /certificates/:hash` success body. */
export interface CertificateLookup {
  match: 'cert' | 'file'
  certificates: CertificateEntry[]
}

// ── Guard ─────────────────────────────────────────────────────────────────────

const apiUrl = (): string => (import.meta.env.VITE_API_URL as string | undefined) ?? ''

/** True only when a backend is configured. False → nobody makes network calls. */
export const isCloudEnabled = (): boolean => apiUrl() !== ''

// ── Internals ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 15_000

const KNOWN_CODES: readonly ApiErrorCode[] = [
  'invalid_payload',
  'unknown_rule_id',
  'not_found',
  'rate_limited',
  'internal',
]

/** Fallback mapping when the error envelope is missing or malformed. */
function codeFromStatus(status: number): ApiErrorCode {
  if (status === 400) return 'invalid_payload'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limited'
  return 'internal'
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let code = codeFromStatus(res.status)
  let message: string | undefined
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    const envelopeCode = body?.error?.code
    if (envelopeCode && (KNOWN_CODES as readonly string[]).includes(envelopeCode)) {
      code = envelopeCode as ApiErrorCode
    }
    message = body?.error?.message
  } catch {
    // Non-JSON error body — keep the status-derived code.
  }
  const error: ApiError = { code, message }
  const retryAfter = Number(res.headers.get('retry-after'))
  if (code === 'rate_limited' && Number.isFinite(retryAfter)) {
    error.retryAfterSeconds = retryAfter
  }
  return error
}

async function request<T>(path: string, init?: RequestInit): Promise<Result<T, ApiError>> {
  if (!isCloudEnabled()) return { ok: false, error: { code: 'cloud_disabled' } }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${apiUrl()}${path}`, { ...init, signal: controller.signal })
    if (res.ok) return { ok: true, value: (await res.json()) as T }
    return { ok: false, error: await errorFromResponse(res) }
  } catch {
    return { ok: false, error: { code: 'network' } }
  } finally {
    clearTimeout(timer)
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

/** Ask the Worker to sign a validation payload. Sends ONLY the JSON payload. */
export function certify(payload: CertifyPayloadV1): Promise<Result<CertifyResponse, ApiError>> {
  return request<CertifyResponse>('/certify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/** Look up certificates by cert hash (or file hash — the Worker decides `match`). */
export function getCertificate(hash: string): Promise<Result<CertificateLookup, ApiError>> {
  return request<CertificateLookup>(`/certificates/${encodeURIComponent(hash)}`)
}
