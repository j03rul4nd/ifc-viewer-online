// ─── ids-share.ts ─────────────────────────────────────────────────────────────
// Map an IDS/EIR result into the shared-report payload (src/lib/share-report.ts),
// so an IDS check or an EIR profile run can produce the same crawlable `/r?d=`
// report the validator already uses (D-21, moat #3). Pure + unit-tested.
//
// Severity: EIR specs carry `eir:<severity>` in their identifier; plain IDS specs
// have none → treated as errors (a failed requirement is a hard fail in IDS).

import type { IdsResult } from './ids-types'
import { renderReasons } from './ids-engine-facets'
import type { ShareReportPayload, ShareIssue } from '../share-report'
import { SHARE_REPORT_VERSION } from '../share-report'

type Sev = 'e' | 'w' | 'i'

function severityOf(identifier: string | undefined): Sev {
  if (identifier?.startsWith('eir:')) {
    const s = identifier.slice(4)
    if (s === 'warning') return 'w'
    if (s === 'info') return 'i'
  }
  return 'e'
}

const ORDER: Record<Sev, number> = { e: 0, w: 1, i: 2 }

/** Build a shareable report payload from an IDS/EIR result. */
export function idsResultToSharePayload(result: IdsResult, fileName: string): ShareReportPayload {
  let e = 0, w = 0, i = 0
  const issues: ShareIssue[] = []

  for (const spec of result.specs) {
    if (spec.status !== 'fail') continue
    const s = severityOf(spec.identifier)
    // Count every failed check toward the headline counts…
    if (s === 'e') e += spec.failedCount
    else if (s === 'w') w += spec.failedCount
    else i += spec.failedCount
    // …and list the per-element failures (synthetic spec rows have expressId < 0).
    for (const f of spec.failures) {
      issues.push({
        r: spec.name.slice(0, 80),
        s,
        n: (f.name || (f.expressId >= 0 ? `#${f.expressId}` : '')).slice(0, 60),
        c: f.ifcClass,
        m: renderReasons(f.reasons).join(' · ').slice(0, 120),
      })
    }
  }

  issues.sort((a, b) => ORDER[a.s as Sev] - ORDER[b.s as Sev])

  return {
    v: SHARE_REPORT_VERSION,
    score: result.score,
    file: fileName.slice(0, 80),
    e, w, i,
    ms: 0,
    ts: new Date().toISOString(),
    // Carry the partial-read caveat into the public report. An unreadable entity
    // never became applicable to any spec, so it left the score's ratio entirely
    // and every spec could still say `pass` — the one thing a shared link must
    // not do is present that as a complete check.
    ...((result.unreadableEntities ?? 0) > 0 ? { u: result.unreadableEntities } : {}),
    issues: issues.slice(0, 50),
  }
}
