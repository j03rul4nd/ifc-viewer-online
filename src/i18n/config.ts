import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'

import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './registry'
import { loadLocaleNamespace } from './lazyLoader'

// ── Re-export everything callers need (single import surface) ─────────────────
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_REGISTRY } from './registry'
export type { SupportedLocale, LocaleDefinition }             from './registry'
export { LOCALE_LABELS, LOCALE_SHORT, LOCALE_MAP }            from './registry'

// ── Intl helpers ──────────────────────────────────────────────────────────────
export function formatNumber(value: number, lng = 'en'): string {
  return new Intl.NumberFormat(lng).format(value)
}
export function formatDate(value: Date, lng = 'en', opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(lng, opts).format(value)
}

// ── Eagerly bundle the DEFAULT locale (EN) ────────────────────────────────────
// This guarantees all keys are available on the very first synchronous render,
// preventing "t(...).map is not a function" crashes from returnObjects calls.
// All OTHER locales (es, fr, de, …) are loaded on-demand via the backend below.

import enCommon      from '../locales/en/common.json'
import enToolbar     from '../locales/en/toolbar.json'
import enValidation  from '../locales/en/validation.json'
import enViewer      from '../locales/en/viewer.json'
import enSidebar     from '../locales/en/sidebar.json'
import enLanding     from '../locales/en/landing.json'
import enMeasurement from '../locales/en/measurement.json'
import enEditor      from '../locales/en/editor.json'
import enErrors      from '../locales/en/errors.json'
import enToasts      from '../locales/en/toasts.json'
import enTree        from '../locales/en/tree.json'

const EN_RESOURCES = {
  common:      enCommon,
  toolbar:     enToolbar,
  validation:  enValidation,
  viewer:      enViewer,
  sidebar:     enSidebar,
  landing:     enLanding,
  measurement: enMeasurement,
  editor:      enEditor,
  errors:      enErrors,
  toasts:      enToasts,
  tree:        enTree,
} as const

// ── Init ──────────────────────────────────────────────────────────────────────
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  // Lazy-load any locale that is NOT already in `resources` below.
  // Guard: skip the default locale — its namespaces are already pre-bundled
  // in the `resources` option below and will never be requested from the backend.
  // This prevents a Rollup "static + dynamic import of same file" warning.
  .use(
    resourcesToBackend(
      (language: string, namespace: string) => {
        if (language === DEFAULT_LOCALE) return Promise.resolve({}) // already bundled
        return loadLocaleNamespace(language, namespace)
      },
    ),
  )
  .init({
    // EN is pre-bundled — no async fetch needed for the default locale.
    resources: { [DEFAULT_LOCALE]: EN_RESOURCES },

    detection: {
      order:              ['localStorage', 'navigator'],
      lookupLocalStorage: 'ifc-locale',
      caches:             ['localStorage'],
    },
    fallbackLng:   DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    defaultNS:     'common',
    ns:            Object.keys(EN_RESOURCES),
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => {
          console.warn(`[i18n] Missing key  ${ns}:${key}  for lang(s): ${lngs.join(', ')}`)
        }
      : undefined,
  })

export default i18n
