import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '../config';
import type { SupportedLocale } from '../config';

export interface UseLocaleReturn {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  supportedLocales: readonly SupportedLocale[];
}

export function useLocale(): UseLocaleReturn {
  const { i18n } = useTranslation();

  const locale = (
    SUPPORTED_LOCALES.includes(i18n.language as SupportedLocale)
      ? i18n.language
      : 'en'
  ) as SupportedLocale;

  const setLocale = useCallback(
    (next: SupportedLocale) => {
      void i18n.changeLanguage(next);
      localStorage.setItem('ifc-locale', next);
    },
    [i18n],
  );

  return { locale, setLocale, supportedLocales: SUPPORTED_LOCALES };
}
