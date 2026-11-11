// ─── Reception strings ────────────────────────────────────────────────────────
// Kept apart from the shared workspace catalogue so this section can grow
// without touching files other screens edit. Keys are the English text, like
// the workspace namespace; `reception-strings.test.ts` keeps the nine
// translations complete against every rx call in this folder.

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import es from './locales/es.json'
import ca from './locales/ca.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import it from './locales/it.json'
import pt from './locales/pt.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'
import th from './locales/th.json'

export const RX_LOCALES: Record<string, Record<string, string>> = { es, ca, fr, de, it, pt, ja, zh, th }

export type Rx = (text: string, vars?: Record<string, unknown>) => string

const fill = (text: string, vars?: Record<string, unknown>) => (vars ? text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : text)

export function rxFor(lang: string): Rx {
  const dict = RX_LOCALES[lang.split('-')[0]]
  return (text, vars) => fill(dict?.[text] ?? text, vars)
}

export function useRx(): { rx: Rx; lang: string } {
  const { i18n } = useTranslation()
  const lang = (i18n?.language || 'en').split('-')[0]
  const rx = useCallback<Rx>((text, vars) => rxFor(lang)(text, vars), [lang])
  return { rx, lang }
}
