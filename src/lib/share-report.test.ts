// ─── share-report.test.ts ───────────────────────────────────────────────────
// Guards the shared-report URL codec and, critically, the CROSS-BOUNDARY
// CONTRACT with the Cloudflare Worker: a payload encoded by the frontend MUST
// decode in the Worker (cf-worker/worker.js `decodeReport`). The encoder and the
// Worker decoder live in separate files edited independently, so the contract is
// the thing most likely to silently break moat #3. The `workerDecode` helper
// below is a faithful mirror of the Worker's decode steps — keep it in sync.

import { describe, it, expect } from 'vitest'
import {
  encodeReportPayload,
  toBase64Url,
  decodeReportPayload,
  buildShareUrl,
  buildBadgeUrl,
  buildBadgeMarkdown,
  MAX_SHARE_URL_LEN,
  SHARE_REPORT_VERSION,
  validationResultToSharePayload,
  type ShareReportPayload,
} from './share-report'
import type { ValidationResult } from '../types'

function makePayload(over: Partial<ShareReportPayload> = {}): ShareReportPayload {
  return {
    v: SHARE_REPORT_VERSION,
    score: 82,
    file: 'Tower-A_Structural.ifc',
    e: 3, w: 5, i: 2, ms: 1840,
    ts: '2026-05-29T10:00:00.000Z',
    issues: [
      { r: 'RULE_DUPLICATE_GUID', s: 'e', n: 'Basic Wall', c: 'IfcWall', m: 'shared GlobalId' },
      { r: 'RULE_EMPTY_NAME', s: 'i', n: '#4821', c: 'IfcBeam', m: 'Name is empty' },
    ],
    ...over,
  }
}

/**
 * Faithful mirror of cf-worker/worker.js `decodeReport` base64url→JSON step
 * (UTF-8 via TextDecoder). If the frontend encoding changes, this must still
 * recover the object — that's the contract.
 */
function workerDecode(d: string): Record<string, unknown> {
  let b64 = d.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin   = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const json  = new TextDecoder('utf-8').decode(bytes)
  return JSON.parse(json) as Record<string, unknown>
}

describe('encodeReportPayload / decodeReportPayload', () => {
  it('round-trips a payload losslessly', () => {
    const payload = makePayload()
    const decoded = decodeReportPayload(encodeReportPayload(payload))
    expect(decoded).toEqual(payload)
  })

  it('survives non-ASCII filenames (UTF-8 safe)', () => {
    const payload = makePayload({ file: 'Edificio-Müller_日本語_ñ.ifc' })
    const decoded = decodeReportPayload(encodeReportPayload(payload)) as ShareReportPayload
    expect(decoded.file).toBe('Edificio-Müller_日本語_ñ.ifc')
  })

  it('returns null for malformed input', () => {
    expect(decodeReportPayload('@@@not-base64@@@')).toBeNull()
    expect(decodeReportPayload('')).toBeNull()
  })
})

describe('toBase64Url', () => {
  it('maps +,/ and strips = padding', () => {
    expect(toBase64Url('ab+cd/ef==')).toBe('ab-cd_ef')
  })

  it('produces URL-safe output for a real payload (no + / =)', () => {
    const urlSafe = toBase64Url(encodeReportPayload(makePayload()))
    expect(urlSafe).not.toMatch(/[+/=]/)
  })

  it('is reversible back to the original payload', () => {
    const payload = makePayload()
    const urlSafe = toBase64Url(encodeReportPayload(payload))
    expect(decodeReportPayload(urlSafe)).toEqual(payload)
  })
})

describe('cross-boundary contract with the Cloudflare Worker', () => {
  it('Worker can decode the frontend base64url output', () => {
    const payload = makePayload({ file: 'Müller_中文.ifc' })
    const d = toBase64Url(encodeReportPayload(payload))
    const recovered = workerDecode(d)
    expect(recovered.score).toBe(82)
    expect(recovered.file).toBe('Müller_中文.ifc')
    expect(Array.isArray(recovered.issues)).toBe(true)
    expect((recovered.issues as unknown[]).length).toBe(2)
  })

  // The caveat fields are the whole reason the public report can be trusted, and
  // they cross the same boundary as everything else: encoded here, coerced in the
  // Worker's decodeReport with toCount. Mirrored below — if the Worker stops
  // reading them, a shared link publishes a bare score again.
  it('carries the partial-read caveats across the boundary', () => {
    const d = toBase64Url(encodeReportPayload(makePayload({ u: 1234, nr: 2 })))
    const recovered = workerDecode(d)
    expect(recovered.u).toBe(1234)
    expect(recovered.nr).toBe(2)
  })

  /** Mirror of the Worker's `toCount`: attacker-controlled, so never NaN/negative. */
  const toCount = (val: unknown): number =>
    typeof val === 'number' && Number.isFinite(val) && val >= 0 ? Math.round(val) : 0

  it('reads a missing or hostile caveat as "none reported", never as a fabricated one', () => {
    // An older link has no `u`/`nr` at all. The Worker must not invent a caveat…
    const old = workerDecode(toBase64Url(encodeReportPayload(makePayload())))
    expect(toCount(old.u)).toBe(0)
    expect(toCount(old.nr)).toBe(0)
    // …and must not be talked into a nonsensical one either.
    for (const hostile of [-5, NaN, Infinity, '12', null, {}]) {
      expect(toCount(hostile)).toBe(0)
    }
    expect(toCount(3.6)).toBe(4)
  })
})

describe('validationResultToSharePayload', () => {
  const base: ValidationResult = {
    issues: [],
    stats: { total: 0, errors: 0, warnings: 0, info: 0, byRule: {} },
    durationMs: 1200,
    qualityScore: 100,
  }
  const coverage = (over: Partial<NonNullable<NonNullable<ValidationResult['metadata']>['coverage']>>) => ({
    attempted: ['A'], entries: [], okCount: 1, failedCount: 0, notRunCount: 0, complete: true,
    unreadableEntities: 0, ...over,
  })

  it('uses the version constant rather than a hardcoded literal', () => {
    // The copy this replaced hardcoded `v: 1`, so bumping the constant would have
    // silently left the validator's links on the old version.
    expect(validationResultToSharePayload(base, 'm.ifc').v).toBe(SHARE_REPORT_VERSION)
  })

  it('publishes the unreadable-entity caveat with the score', () => {
    const result = { ...base, metadata: { coverage: coverage({ unreadableEntities: 1234 }) } }
    const p = validationResultToSharePayload(result, 'm.ifc')
    // A perfect 100 with a caveat: exactly the report that must not go out bare.
    expect(p).toMatchObject({ score: 100, u: 1234 })
  })

  it('publishes checks that did not run, summing failed and not-run', () => {
    const result = { ...base, metadata: { coverage: coverage({ failedCount: 2, notRunCount: 3, complete: false }) } }
    expect(validationResultToSharePayload(result, 'm.ifc').nr).toBe(5)
  })

  it('keeps the two caveats separate, because they answer different questions', () => {
    // Every rule can run perfectly on a file half of whose entities are
    // unreadable, and vice versa — summing them would lose one.
    const result = { ...base, metadata: { coverage: coverage({ unreadableEntities: 7, notRunCount: 1, complete: false }) } }
    expect(validationResultToSharePayload(result, 'm.ifc')).toMatchObject({ u: 7, nr: 1 })
  })

  it('omits both when the run was complete, and when there is no coverage at all', () => {
    const complete = validationResultToSharePayload({ ...base, metadata: { coverage: coverage({}) } }, 'm.ifc')
    expect(complete.u).toBeUndefined()
    expect(complete.nr).toBeUndefined()
    const noMeta = validationResultToSharePayload(base, 'm.ifc')
    expect(noMeta.u).toBeUndefined()
    expect(noMeta.nr).toBeUndefined()
  })

  it('still orders issues errors-first so length-trimming keeps the worst', () => {
    const issue = (severity: 'error' | 'warning' | 'info', ruleId: string) => ({
      id: ruleId, ruleId, severity, expressId: 1, globalId: null,
      ifcClass: 'IfcWall', elementName: 'W', message: 'm', path: [], autoFixable: false,
    })
    const result = { ...base, issues: [issue('info', 'I'), issue('error', 'E'), issue('warning', 'W')] }
    expect(validationResultToSharePayload(result, 'm.ifc').issues.map((i) => i.s)).toEqual(['e', 'w', 'i'])
  })
})

describe('buildShareUrl', () => {
  const payload = makePayload()
  const appBase = 'https://www.ifcvieweronline.eu/'

  it('builds a crawlable Worker URL when a report base is configured', () => {
    const { url, droppedIssues } = buildShareUrl(payload, 'https://w.workers.dev/r', appBase)
    expect(url.startsWith('https://w.workers.dev/r?d=')).toBe(true)
    expect(droppedIssues).toBe(0)
    const d = url.split('?d=')[1]
    expect(d).not.toMatch(/[+/=]/)               // url-safe
    expect(decodeReportPayload(d)).toEqual(payload) // and decodable
  })

  it('falls back to the in-app hash link when no report base is set', () => {
    const { url } = buildShareUrl(payload, undefined, appBase)
    expect(url.startsWith(`${appBase}#report=`)).toBe(true)
    const encoded = url.split('#report=')[1]
    expect(decodeReportPayload(encoded)).toEqual(payload)
  })

  it('trims issues so the URL never exceeds the length budget', () => {
    // 500 verbose issues would blow past any sane URL limit.
    const huge = makePayload({
      issues: Array.from({ length: 500 }, (_, k) => ({
        r: 'RULE_EMPTY_NAME', s: 'w',
        n: `Element-${k}-${'x'.repeat(40)}`,
        c: 'IfcBuildingElementProxy',
        m: 'A fairly long message describing the problem '.repeat(2),
      })),
    })
    const { url, droppedIssues } = buildShareUrl(huge, 'https://w.workers.dev/r', appBase)
    expect(url.length).toBeLessThanOrEqual(MAX_SHARE_URL_LEN)
    expect(droppedIssues).toBeGreaterThan(0)
    // Whatever survived must still decode, and the score is always preserved.
    const decoded = decodeReportPayload(url.split('?d=')[1]) as ShareReportPayload
    expect(decoded.score).toBe(huge.score)
    expect(decoded.issues.length).toBe(500 - droppedIssues)
  })
})

describe('buildBadgeUrl', () => {
  it('derives the /badge endpoint from the report base and clamps the score', () => {
    expect(buildBadgeUrl(82, 'https://w.workers.dev/r')).toBe('https://w.workers.dev/badge?score=82')
    expect(buildBadgeUrl(82, 'https://w.workers.dev/report')).toBe('https://w.workers.dev/badge?score=82')
    expect(buildBadgeUrl(140, 'https://w.workers.dev/r')).toBe('https://w.workers.dev/badge?score=100')
    expect(buildBadgeUrl(-5, 'https://w.workers.dev/r')).toBe('https://w.workers.dev/badge?score=0')
    expect(buildBadgeUrl(82.6, 'https://w.workers.dev/r')).toBe('https://w.workers.dev/badge?score=83')
  })

  it('returns null without a worker base (the hash fallback cannot serve an image)', () => {
    expect(buildBadgeUrl(82, undefined)).toBeNull()
  })
})

describe('buildBadgeMarkdown', () => {
  it('wraps the badge image in a link to the verifiable report', () => {
    const md = buildBadgeMarkdown(82, 'https://w.workers.dev/r?d=ABC', 'https://w.workers.dev/r')
    expect(md).toBe('[![IFC Health Score: 82/100](https://w.workers.dev/badge?score=82)](https://w.workers.dev/r?d=ABC)')
  })

  it('returns null without a worker base', () => {
    expect(buildBadgeMarkdown(82, 'whatever', undefined)).toBeNull()
  })
})
