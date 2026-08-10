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

import type { ValidationResult } from '../types'

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
  /**
   * Entities the run could not read, and therefore never checked. > 0 means the
   * score beside it covers only part of the model.
   *
   * This payload is the most public thing the app produces: it server-renders a
   * crawlable page and feeds an embeddable badge on other people's sites. Both
   * carried a bare score, so a run that skipped unreadable entities published a
   * clean number with no caveat — the panel says so since 9616000, the artifact
   * that travels did not.
   *
   * Optional: an older link decodes with it absent, which the Worker reads as
   * "none reported" rather than inventing a caveat.
   */
  u?: number
  /**
   * Checks that did not run (validator rules that failed or were skipped). A
   * different question from `u` — every rule can run perfectly on a file half of
   * whose entities are unreadable, and vice versa — so it is reported separately
   * rather than summed, matching ValidationCoverage.
   */
  nr?: number
  issues: ShareIssue[]
}

/**
 * Payload schema version. Bump when the shape changes incompatibly.
 * `u`/`nr` were added compatibly: absent means "not reported", so v1 links keep
 * decoding and an older deployed Worker ignores them.
 */
export const SHARE_REPORT_VERSION = 1

/**
 * Build the compact shared-report payload from a validation result (score +
 * condensed top-50 issues, no geometry). Used by the Share button and by the
 * embeddable Badge so both publish the identical report. Errors first, so the
 * length-trimming in buildShareUrl keeps the worst issues.
 *
 * Lives here rather than inside ValidationPanel — where it used to — next to the
 * codec it feeds and to `idsResultToSharePayload`, its IDS twin. Buried in a
 * 1900-line component it was the copy that hardcoded `v: 1` instead of the
 * version constant and dropped the coverage caveats, with no way to test it.
 */
export function validationResultToSharePayload(result: ValidationResult, fileName: string): ShareReportPayload {
  const order = { error: 0, warning: 1, info: 2 }
  const coverage = result.metadata?.coverage
  // The caveats the panel shows beside the score travel WITH the score. Without
  // them the shared page and the badge published a bare number for a run that
  // had skipped unreadable entities or never ran some rules — the honesty added
  // in 9616000 stopped at the edge of the app.
  const unreadable = coverage?.unreadableEntities ?? 0
  const notRun = coverage ? coverage.failedCount + coverage.notRunCount : 0
  return {
    v: SHARE_REPORT_VERSION,
    score: result.qualityScore ?? 0,
    file: fileName.slice(0, 80),
    e: result.stats.errors,
    w: result.stats.warnings,
    i: result.stats.info,
    ms: result.durationMs,
    ts: new Date().toISOString(),
    ...(unreadable > 0 ? { u: unreadable } : {}),
    ...(notRun > 0 ? { nr: notRun } : {}),
    issues: [...result.issues]
      .sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2))
      .slice(0, 50)
      .map((iss) => ({
        r: iss.ruleId,
        s: iss.severity[0],          // 'e' | 'w' | 'i'
        n: iss.elementName.slice(0, 60),
        c: iss.ifcClass,
        m: iss.message.slice(0, 120),
      })),
  }
}

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

/**
 * URL of the embeddable SVG Health Score badge (served by the same Worker at
 * `/badge`, derived from the report base `VITE_REPORT_URL` e.g. `…/r`).
 * Returns null when no Worker base is configured — the badge needs the Worker
 * (the in-app hash fallback can't serve an image).
 */
export function buildBadgeUrl(score: number, reportBase: string | undefined): string | null {
  if (!reportBase) return null
  const base = reportBase.replace(/\/(r|report)\/?$/, '/badge')
  const s = Math.max(0, Math.min(100, Math.round(score)))
  return `${base}?score=${s}`
}

/**
 * Compose the markdown snippet a sender pastes into a deliverable README / PR /
 * handoff: the badge image links to the crawlable, verifiable report. Returns
 * null when the Worker base isn't configured. `reportUrl` is the already-built
 * `/r?d=…` link (from buildShareUrl).
 */
export function buildBadgeMarkdown(
  score: number,
  reportUrl: string,
  reportBase: string | undefined,
): string | null {
  const img = buildBadgeUrl(score, reportBase)
  if (!img) return null
  return `[![IFC Health Score: ${Math.round(score)}/100](${img})](${reportUrl})`
}
