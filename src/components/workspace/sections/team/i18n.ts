// Team plan screens keep their own translations (./locales) so they ship
// without touching the shared workspace catalogue. Keys are the English text,
// like the rest of the workspace; a missing key falls back to English.
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { TEAM_LOCALES } from './locales'
import { sampleTitle } from './sample-titles'

export type TeamTx = (text: string, vars?: Record<string, string | number>) => string

export function teamT(lng: string, text: string, vars?: Record<string, string | number>): string {
  const s = TEAM_LOCALES[lng.slice(0, 2)]?.[text] ?? text
  return vars ? s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : s
}

/** `const tt = useTeamTx()` — re-renders when the language changes. */
export function useTeamTx(): TeamTx {
  const { i18n } = useTranslation()
  const lng = i18n?.language || 'en'
  return useCallback<TeamTx>((text, vars) => teamT(lng, text, vars), [lng])
}

/** `const st = useSampleTitle()` — the sample issue titles in the current language. */
export function useSampleTitle(): (title: string) => string {
  const { i18n } = useTranslation()
  const lng = i18n?.language || 'en'
  return useCallback((title: string) => sampleTitle(lng, title), [lng])
}
