import { useLocale } from '../i18n/hooks/useLocale';
import type { SupportedLocale } from '../i18n/config';

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'EN',
  es: 'ES',
};

const LOCALE_ARIA: Record<SupportedLocale, string> = {
  en: 'Switch to English',
  es: 'Cambiar a español',
};

export function LanguageSelector() {
  const { locale, setLocale, supportedLocales } = useLocale();

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language">
      {supportedLocales.map((lang) => (
        <button
          key={lang}
          onClick={() => setLocale(lang)}
          aria-label={LOCALE_ARIA[lang]}
          aria-pressed={locale === lang}
          className={[
            'px-2 py-1 text-xs font-medium rounded transition-colors',
            locale === lang
              ? 'bg-white/20 text-white'
              : 'text-white/60 hover:text-white/90 hover:bg-white/10',
          ].join(' ')}
        >
          {LOCALE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
