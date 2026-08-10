// ─── localizeIdsError tests ───────────────────────────────────────────────────
// Two failure modes are being pinned, and they pull in opposite directions:
//   · a worker code must NOT print raw English in a Spanish UI, and
//   · a code with no mapping must NOT print the i18n key ("errors.codes.foo")
//     into a red banner, which is what i18next returns for a key it lacks.
// The defaultValue is what reconciles them, so it is tested directly rather than
// through a rendered component (this repo has no component-test harness).

import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import { localizeIdsError, idsErrorDetail } from './error-text'
import { IDS_ERROR_CODES } from '../../lib/ids/ids-types'
import enIds from '../../locales/en/ids.json'

/** Stands in for i18next: resolves dotted keys against the real EN bundle. */
const t = ((key: string, opts?: Record<string, unknown>) => {
  const hit = key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], enIds)
  if (typeof hit !== 'string') return (opts?.defaultValue as string) ?? key
  return hit.replace(/\{\{(\w+)\}\}/g, (_, p: string) => String(opts?.[p] ?? `{{${p}}}`))
}) as unknown as TFunction<'ids'>

describe('localizeIdsError', () => {
  it('translates every code the worker and runner can emit', () => {
    for (const code of IDS_ERROR_CODES) {
      const shown = localizeIdsError(t, { code, message: 'web-ifc init failed: abort(7)' })
      expect(shown, `${code} has no mapping`).not.toBe('web-ifc init failed: abort(7)')
      expect(shown, `${code} leaked its key`).not.toContain('errors.codes')
      expect(shown.length).toBeGreaterThan(10)
    }
  })

  it('keeps the technical detail for the codes where it is the information', () => {
    // `unknown` means "we could not classify this" — the raw text is the only
    // thing that says what happened, so the translation frames it rather than
    // replacing it. This is where the Zod reason from a rejected payload lands.
    const shown = localizeIdsError(t, { code: 'unknown', message: 'specifications: too small' })
    expect(shown).toContain('specifications: too small')
    // Already visible in the sentence → no duplicate tooltip.
    expect(idsErrorDetail(t, { code: 'unknown', message: 'specifications: too small' })).toBeUndefined()
  })

  it('offers the raw text as a tooltip when the sentence replaced it', () => {
    const err = { code: 'model-open', message: 'Invalid IFC line 42' }
    expect(localizeIdsError(t, err)).not.toContain('Invalid IFC line 42')
    expect(idsErrorDetail(t, err)).toBe('Invalid IFC line 42')
  })

  it('falls back to the message, never the key, for main-thread codes', () => {
    // 'parse' / 'no-buffer' / 'orphaned' are raised on the main thread and their
    // message is ALREADY translated — mapping them again would be wrong, and
    // printing the key would be worse.
    for (const code of ['parse', 'no-buffer', 'orphaned', 'invented-tomorrow']) {
      const err = { code, message: 'ya traducido' }
      expect(localizeIdsError(t, err)).toBe('ya traducido')
      expect(idsErrorDetail(t, err)).toBeUndefined()
    }
  })
})
