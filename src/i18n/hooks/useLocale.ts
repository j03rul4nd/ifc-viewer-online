import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LOCALES, LOCALE_MAP, DEFAULT_LOCALE } from '../registry'
import type { SupportedLocale, LocaleDefinition } from '../registry'

export interface UseLocaleReturn {
  /** Active BCP-47 code, always one of SUPPORTED_LOCALES. */
  locale:           SupportedLocale
  /** Rich metadata for the active locale (label, flag, dir, …). */
  localeDefinition: LocaleDefinition
  /** Change the active locale and persist to localStorage. */
  setLocale:        (locale: SupportedLocale) => void
  /** Full registry list — drives LanguageSelector without extra imports. */
  supportedLocales: string[]
}

export function useLocale(): UseLocaleReturn {
  const { i18n } = useTranslation()

  const locale = (
    SUPPORTED_LOCALES.includes(i18n.language)
      ? i18n.language
      : DEFAULT_LOCALE
  ) as SupportedLocale

  const localeDefinition = LOCALE_MAP.get(locale) ?? LOCALE_MAP.get(DEFAULT_LOCALE)!

  const setLocale = useCallback(
    (next: SupportedLocale) => {
      void i18n.changeLanguage(next)
      localStorage.setItem('ifc-locale', next)
      // Update html[dir] for RTL languages
      const def = LOCALE_MAP.get(next)
      document.documentElement.dir = def?.dir ?? 'ltr'
    },
    [i18n],
  )

  return { locale, localeDefinition, setLocale, supportedLocales: SUPPORTED_LOCALES }
}
