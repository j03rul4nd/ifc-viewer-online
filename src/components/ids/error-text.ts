// ─── localizeIdsError ─────────────────────────────────────────────────────────
// Render an IDS run failure through the `ids` i18n namespace.
//
// idsStore.error carries a code and a message from two different worlds. Codes
// raised on the main thread ('parse', 'no-buffer', 'orphaned') already come with
// a translated message. Codes that come back from the worker (IDS_ERROR_CODES)
// do not: their message is whatever web-ifc, Zod or the runner produced, in
// English, and the panel printed it verbatim in all ten locales — "web-ifc init
// failed: …" is not a sentence a Spanish or Japanese user should be shown, and
// it says nothing about what to do next.
//
// Same shape as localizeReason in reasons.ts, including the defaultValue: an
// unmapped code falls back to the raw message rather than to the key, so a code
// added later degrades to today's behaviour instead of printing
// "errors.codes.whatever" in red.

import type { TFunction } from 'i18next'

export interface IdsErrorLike { code: string; message: string }

/** The sentence to show the user. Never a key, never empty. */
export function localizeIdsError(t: TFunction<'ids'>, error: IdsErrorLike): string {
  return t(`errors.codes.${error.code}` as 'errors.codes.unknown', {
    detail: error.message,
    defaultValue: error.message,
  })
}

/**
 * The raw technical text, for a `title` tooltip beside the sentence above —
 * localizing the failure must not cost the detail that makes it diagnosable.
 * Returns undefined when the sentence already IS the raw message.
 */
export function idsErrorDetail(t: TFunction<'ids'>, error: IdsErrorLike): string | undefined {
  const shown = localizeIdsError(t, error)
  return shown === error.message || shown.includes(error.message) ? undefined : error.message
}
