// ─── Workspace translations ───────────────────────────────────────────────────
// The paid workspace has its own namespace, loaded only when the workspace
// route opens, so free users never download it. Keys are the English text
// itself (natural keys): catalogues such as tours, protocols and alerts keep
// English as their source and are translated where they are shown, and a
// string that is not translated yet falls back to readable English instead of
// a raw key. `src/locales/workspace-parity.test.ts` keeps all ten locales
// complete against the extracted English catalogue.

import { Fragment, useCallback, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'

export const WS_NS = 'workspace'

const OPTS = { ns: WS_NS, keySeparator: false, nsSeparator: false } as const

export type Tx = (text: string, vars?: Record<string, unknown>) => string

/** Translate outside React (formatters, pure helpers called from components). */
// Natural keys are plain strings, outside the app's typed key unions.
type LooseT = (key: string, options: Record<string, unknown>) => string

export const wsT: Tx = (text, vars) =>
  i18n.isInitialized ? (i18n.t as unknown as LooseT)(text, { ...OPTS, ...vars }) : interpolate(text, vars)

function interpolate(text: string, vars?: Record<string, unknown>): string {
  return vars ? text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : text
}

/** `const tx = useTx()` — re-renders when the language or the namespace changes. */
export function useTx(): Tx {
  const { t } = useTranslation(WS_NS as never)
  // Without an initialised i18next (tests, server render) still fill in the values.
  return useCallback<Tx>((text, vars) => (i18n.isInitialized ? (t as unknown as LooseT)(text, { ...OPTS, ...vars }) : interpolate(text, vars)), [t])
}

/** The language numbers and money are formatted in. */
export const wsLocale = (): string => (i18n.isInitialized && i18n.language) || 'en'

/**
 * A translated sentence with inline elements: `<0>…</0>`, `<1>…</1>` mark the
 * parts that become links, bold text or buttons, so translators move them
 * with the words instead of the code splitting the sentence.
 *   rich(tx('Stuck? <0>Ask us</0> — a person answers.'), [(c) => <button>{c}</button>])
 */
export function rich(text: string, parts: ((children: string) => ReactNode)[]): ReactNode[] {
  const out: ReactNode[] = []
  const re = /<(\d+)>(.*?)<\/\1>/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const render = parts[Number(m[1])]
    out.push(render ? <Fragment key={k++}>{render(m[2])}</Fragment> : m[2])
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
