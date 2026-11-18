// @vitest-environment node
// The toasts namespace has no general parity guard (it has drifted before and
// fixing that is its own job). This one covers the toasts the loading system
// raises — a failed load, a finished federation, a rejected drop — because
// they are shown to every user in their own language and nothing else would
// notice an English sentence in a Japanese UI.
import { describe, it, expect } from 'vitest'

const LOCALES = ['ca', 'de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh'] as const
/** Languages with a single plural form — they carry only `_other`. */
const OTHER_ONLY = new Set(['ja', 'th', 'zh'])

const files = import.meta.glob('./*/toasts.json', { eager: true, import: 'default' }) as Record<string, { model: Record<string, string> }>

const KEYS = ['loadFailedNamed', 'batchLoaded', 'batchPartial', 'dropUnsupported', 'dropBcfHint'] as const
const PLURAL = new Set(['batchLoaded', 'dropUnsupported'])

function params(s: string): string[] {
  return [...s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort()
}

function forms(lng: string, key: string): string[] {
  if (!PLURAL.has(key)) return [key]
  return OTHER_ONLY.has(lng) ? [`${key}_other`] : [`${key}_one`, `${key}_other`]
}

describe('toasts — loading keys in every locale', () => {
  const en = files['./en/toasts.json'].model

  for (const lng of LOCALES) {
    it(`${lng} has every loading toast, with the English parameters`, () => {
      const model = files[`./${lng}/toasts.json`]?.model
      expect(model, `${lng}/toasts.json`).toBeTruthy()
      for (const key of KEYS) {
        for (const form of forms(lng, key)) {
          const value = model[form]
          expect(typeof value === 'string' && value.trim().length > 0, `${lng}: model.${form}`).toBe(true)
          const reference = en[form] ?? en[`${key}_other`]
          expect(params(value), `${lng}: model.${form} params`).toEqual(params(reference))
        }
      }
    })
  }
})
