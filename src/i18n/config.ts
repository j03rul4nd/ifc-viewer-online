import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'

import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from './registry'

// ── Re-export everything callers need (single import surface) ─────────────────
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_REGISTRY } from './registry'
export type { SupportedLocale, LocaleDefinition }             from './registry'
export { LOCALE_LABELS, LOCALE_SHORT, LOCALE_MAP }            from './registry'

// ── Intl helpers (use at call site — i18next v23+ dropped interpolation.format) ─
/**
 * Format a number according to the currently active locale.
 * Usage:  formatNumber(1234.5, i18n.language)  →  "1,234.5" / "1.234,5"
 */
export function formatNumber(value: number, lng = 'en'): string {
  return new Intl.NumberFormat(lng).format(value)
}

export function formatDate(value: Date, lng = 'en', opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(lng, opts).format(value)
}

// ── Lazy locale loader ────────────────────────────────────────────────────────
// Vite turns each `import(...)` into a separate async chunk so ONLY the
// namespaces + locales that are actually requested get downloaded.
// Adding a new language = add folder + entry in registry.ts. Zero changes here.

const NAMESPACES = [
  'common', 'toolbar', 'validation', 'viewer', 'sidebar',
  'landing', 'measurement', 'editor', 'errors', 'toasts', 'tree',
] as const

// ── Init ──────────────────────────────────────────────────────────────────────
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .use(
    resourcesToBackend(
      (language: string, namespace: string) =>
        import(`../locales/${language}/${namespace}.json`),
    ),
  )
  .init({
    detection: {
      order:              ['localStorage', 'navigator'],
      lookupLocalStorage: 'ifc-locale',
      caches:             ['localStorage'],
    },
    fallbackLng:  DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    defaultNS:    'common',
    ns:           [...NAMESPACES],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
    // Dev-only: warn on missing keys so they're caught before shipping
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => {
          console.warn(`[i18n] Missing key  ${ns}:${key}  for lang(s): ${lngs.join(', ')}`)
        }
      : undefined,
  })

export default i18n
