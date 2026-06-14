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
