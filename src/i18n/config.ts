import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

// ── Locale data (eager — only 2 locales, total ~25 KB gzipped is fine) ────────
import enCommon from '../locales/en/common.json'
import enToolbar from '../locales/en/toolbar.json'
import enValidation from '../locales/en/validation.json'
import enViewer from '../locales/en/viewer.json'
import enSidebar from '../locales/en/sidebar.json'
import enLanding from '../locales/en/landing.json'
import enMeasurement from '../locales/en/measurement.json'
import enEditor from '../locales/en/editor.json'
import enErrors from '../locales/en/errors.json'
import enToasts from '../locales/en/toasts.json'
import enTree from '../locales/en/tree.json'

import esCommon from '../locales/es/common.json'
import esToolbar from '../locales/es/toolbar.json'
import esValidation from '../locales/es/validation.json'
import esViewer from '../locales/es/viewer.json'
import esSidebar from '../locales/es/sidebar.json'
import esLanding from '../locales/es/landing.json'
import esMeasurement from '../locales/es/measurement.json'
import esEditor from '../locales/es/editor.json'
import esErrors from '../locales/es/errors.json'
import esToasts from '../locales/es/toasts.json'
import esTree from '../locales/es/tree.json'

// ── Constants ─────────────────────────────────────────────────────────────────
export const SUPPORTED_LOCALES = ['en', 'es'] as const
export type SupportedLocale    = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'en'

/** Human-readable label for each locale (shown in the language selector). */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español',
}

/** Short code used in the language selector button. */
export const LOCALE_SHORT: Record<SupportedLocale, string> = {
  en: 'EN',
  es: 'ES',
}

// ── Intl helpers (use at call site — i18next v23+ dropped interpolation.format) ──
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

// ── Init ──────────────────────────────────────────────────────────────────────
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        toolbar: enToolbar,
        validation: enValidation,
        viewer: enViewer,
        sidebar: enSidebar,
        landing: enLanding,
        measurement: enMeasurement,
        editor: enEditor,
        errors: enErrors,
        toasts: enToasts,
        tree: enTree,
      },
      es: {
        common: esCommon,
        toolbar: esToolbar,
        validation: esValidation,
        viewer: esViewer,
        sidebar: esSidebar,
        landing: esLanding,
        measurement: esMeasurement,
        editor: esEditor,
        errors: esErrors,
        toasts: esToasts,
        tree: esTree,
      },
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'ifc-locale',
      caches: ['localStorage'],
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: 'common',
    ns: ['common', 'toolbar', 'validation', 'viewer', 'sidebar', 'landing', 'measurement', 'editor', 'errors', 'toasts', 'tree'],
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
