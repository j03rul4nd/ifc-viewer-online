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
import enBlog        from '../locales/en/blog.json'
import enGeo         from '../locales/en/geo.json'
import enSolar       from '../locales/en/solar.json'
import enTour        from '../locales/en/tour.json'
import enClient      from '../locales/en/client.json'
import enIds         from '../locales/en/ids.json'
import enEir         from '../locales/en/eir.json'
import enInvite      from '../locales/en/invite.json'
import enCapture     from '../locales/en/capture.json'
import enVerify      from '../locales/en/verify.json'

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
  blog:        enBlog,
  geo:         enGeo,
  ids:         enIds,
  eir:         enEir,
  invite:      enInvite,
  capture:     enCapture,
  verify:      enVerify,
  solar:       enSolar,
  tour:        enTour,
  client:      enClient,
} as const

// ── Init ──────────────────────────────────────────────────────────────────────
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  // Lazy-load any locale that is NOT already in `resources` below.
  // The guard for DEFAULT_LOCALE exists purely to prevent a Rollup
  // "static + dynamic import of same file" warning — in practice, the
  // BackendConnector never reaches this branch for EN because it checks
  // hasResourceBundle() first and EN namespaces are already pre-loaded
  // from `resources` above.  For all other languages the dynamic import
  // fetches the JSON chunk on first use.
  .use(
    resourcesToBackend(
      (language: string, namespace: string) => {
        if (language === DEFAULT_LOCALE) return Promise.resolve({}) // already bundled; guard for Rollup
        return loadLocaleNamespace(language, namespace)
      },
    ),
  )
  .init({
    // EN is pre-bundled — no async fetch needed for the default locale.
    resources: { [DEFAULT_LOCALE]: EN_RESOURCES },

    // REQUIRED when mixing pre-bundled resources with a lazy-load backend.
    // Without this flag, i18next's loadResources() short-circuits to a no-op
    // whenever `options.resources` is set — meaning changeLanguage('fr') never
    // calls the backend, FR namespaces are never loaded, and t() always falls
    // back to English regardless of which language the user selects.
    partialBundledLanguages: true,

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
      // react-i18next v17 changed the default bindI18n to only 'languageChanged',
      // dropping 'loaded'. This means components never re-render when a lazily-loaded
      // namespace finishes fetching — the UI stays in the fallback (English) forever.
      // Restoring 'loaded' ensures re-renders after changeLanguage resolves all namespaces.
      bindI18n: 'languageChanged loaded',
      // bindI18nStore subscribes to i18n.store events. 'added' fires whenever a
      // resource bundle is added to the store — the most direct signal that a
      // dynamically-loaded namespace is now available. This is the belt-and-suspenders
      // companion to bindI18n:'loaded', covering timing edge-cases where the i18n-level
      // event propagation is delayed (e.g. backendConnector → i18n wildcard relay).
      bindI18nStore: 'added',
    },
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => {
          console.warn(`[i18n] Missing key  ${ns}:${key}  for lang(s): ${lngs.join(', ')}`)
        }
      : undefined,
  })

export default i18n
