/**
 * LanguageSelector — renders locale toggle buttons.
 *
 * Variants:
 *  - "compact"  (default) — short code buttons: [EN] [ES]
 *  - "full"               — full native name:   [English] [Español]
 *
 * Usage:
 *   <LanguageSelector />
 *   <LanguageSelector variant="full" />
 */
import React from 'react'
import { useLocale } from '../i18n/hooks/useLocale'
import { LOCALE_LABELS, LOCALE_SHORT } from '../i18n/config'
import type { SupportedLocale } from '../i18n/config'

interface LanguageSelectorProps {
  variant?: 'compact' | 'full'
  /** Extra class names on the wrapping element */
  className?: string
}

const ARIA_LABEL: Record<SupportedLocale, string> = {
  en: 'Switch to English',
  es: 'Cambiar a español',
}

export function LanguageSelector({ variant = 'compact', className = '' }: LanguageSelectorProps) {
  const { locale, setLocale, supportedLocales } = useLocale()

  return (
    <div
      className={`flex items-center gap-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      {supportedLocales.map((lang) => {
        const active = locale === lang
        const label  = variant === 'full' ? LOCALE_LABELS[lang] : LOCALE_SHORT[lang]
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setLocale(lang)}
            aria-label={ARIA_LABEL[lang]}
            aria-pressed={active}
            className={[
              'px-2 py-1 text-[11px] font-medium rounded-[6px] transition-colors leading-none',
              active
                ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)]'
                : 'text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface)]',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Variant for use on the landing page nav (light-on-dark background). */
export function LanguageSelectorNav({ className = '' }: { className?: string }) {
  const { locale, setLocale, supportedLocales } = useLocale()

  return (
    <div
      className={`flex items-center gap-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      {supportedLocales.map((lang) => {
        const active = locale === lang
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setLocale(lang)}
            aria-label={ARIA_LABEL[lang]}
            aria-pressed={active}
            className={[
              'px-2 py-1 text-[11.5px] font-medium rounded-[6px] transition-colors leading-none',
              active
                ? 'text-white bg-white/15 border border-white/25'
                : 'text-white/50 hover:text-white/80 hover:bg-white/8',
            ].join(' ')}
          >
            {LOCALE_SHORT[lang]}
          </button>
        )
      })}
    </div>
  )
}
