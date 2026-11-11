// Client mail keeps its own translations (./locales), like Reception and Team,
// so it ships without touching the shared workspace catalogue. Keys are the
// English text; mail.test.ts keeps the nine languages complete.
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Mx } from './model'
import es from './locales/es.json'
import ca from './locales/ca.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import it from './locales/it.json'
import pt from './locales/pt.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'
import th from './locales/th.json'

export const MX_LOCALES: Record<string, Record<string, string>> = { es, ca, fr, de, it, pt, ja, zh, th }

const fill = (text: string, vars?: Record<string, unknown>) => (vars ? text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : text)

export function mxFor(lang: string): Mx {
  const dict = MX_LOCALES[lang.split('-')[0]]
  return (text, vars) => fill(dict?.[text] ?? text, vars)
}

export function useMx(): { mx: Mx; lang: string } {
  const { i18n } = useTranslation()
  const lang = (i18n?.language || 'en').split('-')[0]
  const mx = useCallback<Mx>((text, vars) => mxFor(lang)(text, vars), [lang])
  return { mx, lang }
}
