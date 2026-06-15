/**
 * LanguageSelector
 *
 * Adaptive UI — automatically switches between two layouts:
 *
 *   ≤ 3 locales → inline pill buttons  (current EN / ES look)
 *   ≥ 4 locales → compact dropdown     (globe icon + short-code trigger,
 *                                        scrollable list of all options)
 *
 * Two surface variants:
 *   <LanguageSelector />        — for the app toolbar (dark glass surface)
 *   <LanguageSelectorNav />     — for the landing page nav (light-on-dark)
 *
 * Adding a new language: edit src/i18n/registry.ts only.
 */
import React, { useState, useRef, useEffect } from 'react'
import { useLocale } from '../i18n/hooks/useLocale'
import { LOCALE_REGISTRY } from '../i18n/registry'
import type { LocaleDefinition, SupportedLocale } from '../i18n/registry'
import { useIsMobile } from '../hooks/useIsMobile'
import { MobileActionSheet, type SheetAction } from './mobile/MobileActionSheet'

// ── Shared logic ──────────────────────────────────────────────────────────────

/** Number of locales above which we switch to dropdown mode. */
const DROPDOWN_THRESHOLD = 4

// ── App toolbar variant ───────────────────────────────────────────────────────

interface LanguageSelectorProps {
  className?: string
}

export function LanguageSelector({ className = '' }: LanguageSelectorProps) {
  const { locale, setLocale, localeDefinition } = useLocale()
  const locales = LOCALE_REGISTRY
  const useDropdown = locales.length >= DROPDOWN_THRESHOLD

  return useDropdown
    ? (
      <LangDropdown
        locales={locales}
        active={locale}
        activeDef={localeDefinition}
        onSelect={setLocale}
        surface="dark"
        className={className}
      />
    )
    : (
      <LangPills
        locales={locales}
        active={locale}
        onSelect={setLocale}
        surface="dark"
        className={className}
      />
    )
}

// ── Landing nav variant ───────────────────────────────────────────────────────

export function LanguageSelectorNav({ className = '', landingTheme = 'dark' }: { className?: string; landingTheme?: 'dark' | 'light' }) {
  const { locale, setLocale, localeDefinition } = useLocale()
  const locales = LOCALE_REGISTRY
  const useDropdown = locales.length >= DROPDOWN_THRESHOLD
  // When landing is in light mode, CSS variables are overridden by .lp-light —
  // the "dark" surface style (which uses var(--text-dim) etc.) is the correct choice.
  const surface = landingTheme === 'light' ? 'dark' : 'light'

  return useDropdown
    ? (
      <LangDropdown
        locales={locales}
        active={locale}
        activeDef={localeDefinition}
        onSelect={setLocale}
        surface={surface}
        className={className}
      />
    )
    : (
      <LangPills
        locales={locales}
        active={locale}
        onSelect={setLocale}
        surface={surface}
        className={className}
      />
    )
}

// ── Inline pill buttons (≤ 3 locales) ────────────────────────────────────────

function LangPills({
  locales, active, onSelect, surface, className,
}: {
  locales: LocaleDefinition[]
  active:  string
  onSelect: (code: SupportedLocale) => void
  surface: 'dark' | 'light'
  className: string
}) {
  return (
    <div
      className={`flex items-center gap-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      {locales.map((lang) => {
        const isActive = active === lang.code
        const darkActive  = 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)]'
        const darkIdle    = 'text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface)]'
        const lightActive = 'text-white bg-white/15 border border-white/25'
        const lightIdle   = 'text-white/50 hover:text-white/80 hover:bg-white/8'
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => onSelect(lang.code as SupportedLocale)}
            aria-label={`Switch to ${lang.label}`}
            aria-pressed={isActive}
            className={[
              'px-2 py-1 text-[11px] font-medium rounded-[6px] transition-colors leading-none',
              surface === 'dark'
                ? (isActive ? darkActive : darkIdle)
                : (isActive ? lightActive : lightIdle),
            ].join(' ')}
          >
            {lang.short}
          </button>
        )
      })}
    </div>
  )
}

// ── Dropdown (≥ 4 locales) ────────────────────────────────────────────────────

function LangDropdown({
  locales, active, activeDef, onSelect, surface, className,
}: {
  locales:   LocaleDefinition[]
  active:    string
  activeDef: LocaleDefinition
  onSelect:  (code: SupportedLocale) => void
  surface:   'dark' | 'light'
  className: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  // Close on outside click (desktop dropdown only — the mobile sheet owns its
  // own scrim/dismissal, and this handler would race the action tap).
  useEffect(() => {
    if (!open || isMobile) return
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, isMobile])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handleSelect = (code: SupportedLocale) => {
    onSelect(code)
    setOpen(false)
  }

  // ── Trigger styles ──
  const darkTrigger  = 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border border-[var(--border)]'
  const lightTrigger = 'text-white/70 hover:text-white hover:bg-white/10 border border-white/20'

  // ── Dropdown panel styles ──
  const panelBase = 'absolute right-0 top-full mt-1.5 z-50 rounded-xl border shadow-2xl overflow-hidden min-w-[180px] max-h-[320px] overflow-y-auto'
  const darkPanel  = 'bg-[rgba(14,14,20,0.97)] border-[var(--border)] backdrop-blur-[20px]'
  const lightPanel = 'bg-[rgba(14,14,20,0.97)] border-white/15 backdrop-blur-[20px]'

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${activeDef.label}`}
        className={[
          'flex items-center gap-1.5 px-2 py-1 rounded-[8px] text-[11px] font-medium transition-colors leading-none',
          surface === 'dark' ? darkTrigger : lightTrigger,
        ].join(' ')}
      >
        {/* Globe icon */}
        <svg
          width="13" height="13" viewBox="0 0 13 13" fill="none"
          stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
          className="shrink-0 opacity-70"
        >
          <circle cx="6.5" cy="6.5" r="5.5" />
          <path d="M6.5 1c-2 1.5-3 3.5-3 5.5s1 4 3 5.5M6.5 1c2 1.5 3 3.5 3 5.5s-1 4-3 5.5M1 6.5h11" />
        </svg>
        <span className="font-mono tracking-wide">{activeDef.short}</span>
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
          className="shrink-0 opacity-50"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        >
          <path d="M1 2.5L4 5.5L7 2.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>

      {/* Mobile: dedicated bottom-sheet (portals to <body>, so it can never be
          clipped by an `overflow-hidden` ancestor like the MobileBottomNav "More"
          sheet, nor open off-screen below the trigger). */}
      {isMobile && (
        <MobileActionSheet
          open={open}
          title="Language"
          onClose={() => setOpen(false)}
          actions={locales.map<SheetAction>((lang) => ({
            key: lang.code,
            icon: lang.flag ? <span style={{ fontSize: 18, lineHeight: 1 }}>{lang.flag}</span> : undefined,
            label: lang.labelNative,
            desc: lang.short,
            tone: active === lang.code ? 'accent' : 'default',
            onClick: () => handleSelect(lang.code as SupportedLocale),
          }))}
        />
      )}

      {/* Desktop: absolute dropdown panel */}
      {!isMobile && open && (
        <div
          className={[panelBase, surface === 'dark' ? darkPanel : lightPanel].join(' ')}
          role="listbox"
          aria-label="Select language"
        >
          <div className="py-1">
            {locales.map((lang) => {
              const isActive = active === lang.code
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(lang.code as SupportedLocale)}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors text-left',
                    isActive
                      ? 'text-[var(--accent)] bg-[var(--accent)]/10'
                      : 'text-[rgba(255,255,255,0.6)] hover:text-white hover:bg-white/6',
                  ].join(' ')}
                >
                  {/* Flag */}
                  {lang.flag && (
                    <span className="text-[14px] leading-none shrink-0">{lang.flag}</span>
                  )}

                  {/* Native name */}
                  <span className="flex-1 font-medium" dir={lang.dir ?? 'ltr'}>
                    {lang.labelNative}
                  </span>

                  {/* Short code */}
                  <span className="font-mono text-[9px] opacity-50 shrink-0">{lang.short}</span>

                  {/* Active check */}
                  {isActive && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--accent)]">
                      <path d="M2 5l2.5 2.5 4-4" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
