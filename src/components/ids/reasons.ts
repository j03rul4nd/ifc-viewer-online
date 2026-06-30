// ─── localizeReasons ──────────────────────────────────────────────────────────
// Render engine reason codes through the `ids` i18n namespace. The engine stays
// i18n-free (emits {code, params}); the SDK keeps its frozen EN renderer
// (renderReasons in ids-engine-facets). This is the UI-side counterpart.

import type { TFunction } from 'i18next'
import type { IdsReason } from '../../lib/ids/ids-types'

export function localizeReason(t: TFunction<'ids'>, r: IdsReason): string {
  return t(`reasons.${r.code}` as 'reasons.missingRequired', { ...r.params, defaultValue: r.code })
}

export function localizeReasons(t: TFunction<'ids'>, reasons: IdsReason[]): string {
  return reasons.map((r) => localizeReason(t, r)).join(' · ')
}

/**
 * Actionable "how to fix" guidance for a set of failure reasons (the remediation
 * corpus). One line per distinct reason code, so repeated codes don't duplicate.
 * Returns '' when nothing maps. Renders through the `ids:remediation.*` namespace.
 */
export function localizeRemediation(t: TFunction<'ids'>, reasons: IdsReason[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of reasons) {
    if (seen.has(r.code)) continue
    seen.add(r.code)
    out.push(t(`remediation.${r.code}` as 'remediation.missingRequired', { ...r.params, defaultValue: '' }))
  }
  return out.filter(Boolean).join(' · ')
}
