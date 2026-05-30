// ─── share-report.ts ────────────────────────────────────────────────────────
// Canonical codec for the shared-report link payload.
//
// This is a CROSS-BOUNDARY CONTRACT: the frontend encodes the payload here, and
// the Cloudflare Worker (cf-worker/worker.js, `decodeReport`) decodes it to
// server-render a crawlable report (D-21, moat #3). The two live in separate
// files edited independently — share-report.test.ts mirrors the Worker's decode
// to guard against silent drift. Keep the encoding in sync with the Worker.
//
// Two URL shapes:
//   • Worker route   →  <VITE_REPORT_URL>?d=<base64url>     (crawlable, preferred)
//   • In-app hash    →  <app>/#report=<base64>              (legacy fallback)
// Both carry the same JSON; only the base64 flavour differs (url-safe vs standard).

/** A single condensed issue in a shared report. */
export interface ShareIssue {
  r: string   // ruleId
  s: string   // severity initial: 'e' | 'w' | 'i'
  n: string   // elementName
  c: string   // ifcClass
  m: string   // message
}

/** The compact payload encoded into a shared-report URL. */
export interface ShareReportPayload {
  v: number
  score: number
  file: string
  e: number
  w: number
  i: number
  ms: number
  ts: string
  issues: ShareIssue[]
}

/** Payload schema version. Bump when the shape changes incompatibly. */
export const SHARE_REPORT_VERSION = 1

/** UTF-8-safe JSON → standard base64 (the in-app `#report=` hash flavour). */
export function encodeReportPayload(payload: ShareReportPayload): string {
  const json = JSON.stringify(payload)
  return btoa(unescape(encodeURIComponent(json)))
}

/** Standard base64 → url-safe base64url (for the `?d=` query param). */
export function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode either flavour (standard base64 or url-safe base64url) back to the raw
 * parsed object. Returns null on any malformed input. Normalisation/validation
 * of the fields is the caller's job (e.g. SharedReportView coerces every field
 * because the string is attacker-controlled).
 */
export function decodeReportPayload(encoded: string): unknown | null {
  try {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const json = decodeURIComponent(escape(atob(b64)))
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Max shareable-URL length. Kept well under the limits enforced by browsers,
 * CDNs and social unfurlers (commonly 8 KB) so the link is reliably clickable
 * and crawlable everywhere — a slightly shorter, working link beats a complete
 * one that some clients silently truncate.
 */
export const MAX_SHARE_URL_LEN = 8000

export interface ShareUrlResult {
  /** The final shareable URL (always ≤ MAX_SHARE_URL_LEN). */
  url: string
  /** How many issues were trimmed from the tail to fit the length budget. */
  droppedIssues: number
}

/**
 * Build the shareable URL for a report payload, guaranteeing it fits within
 * `maxLen`. Issues are severity-sorted (errors first) by the caller, so trimming
 * from the tail drops the least-important ones; the score + full counts always
 * survive (the report still reads "top N of M"). A report with zero issues that
 * still somehow exceeds `maxLen` is returned as-is (nothing left to trim).
 *
 * - With `reportBase` (VITE_REPORT_URL) → the crawlable Worker route `?d=…`.
 * - Without it → the in-app `#report=…` hash link (works, but not crawlable).
 *
 * `appBase` is the in-app origin+path (e.g. `${location.origin}${location.pathname}`),
 * passed in so this stays free of `window` and unit-testable.
 */
export function buildShareUrl(
  payload: ShareReportPayload,
  reportBase: string | undefined,
  appBase: string,
  maxLen: number = MAX_SHARE_URL_LEN,
): ShareUrlResult {
  const make = (p: ShareReportPayload): string => {
    const b64 = encodeReportPayload(p)
    return reportBase ? `${reportBase}?d=${toBase64Url(b64)}` : `${appBase}#report=${b64}`
  }

  let url = make(payload)
  if (url.length <= maxLen) return { url, droppedIssues: 0 }

  const issues = [...payload.issues]
  let dropped = 0
  while (issues.length > 0 && url.length > maxLen) {
    issues.pop()
    dropped++
    url = make({ ...payload, issues })
  }
  return { url, droppedIssues: dropped }
}
