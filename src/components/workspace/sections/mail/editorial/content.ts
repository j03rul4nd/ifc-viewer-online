// Words of the sample templates and of the Studio in the product's ten
// languages. Spanish and English are written inline next to each other
// (x('es', 'en')); the other eight live in ./content/<lang>.json keyed by the
// English text, made with scripts/mail/extract-content.mjs and checked by
// editorial.test.ts. A missing key falls back to English.

import ca from './content/ca.json'
import fr from './content/fr.json'
import de from './content/de.json'
import it from './content/it.json'
import pt from './content/pt.json'
import ja from './content/ja.json'
import zh from './content/zh.json'
import th from './content/th.json'

export const CONTENT: Record<string, Record<string, string>> = { ca, fr, de, it, pt, ja, zh, th }

const fill = (s: string, v?: Record<string, string | number>) => (v ? s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s)

export type X = (es: string, en: string, vars?: Record<string, string | number>) => string

/** Set by scripts/mail/extract-content.mjs to collect every English key. */
export const RECORDER: { keys: Map<string, string> | null } = { keys: null }

/** Pick the text for a language; `vars` fill `{{name}}` placeholders. */
export function makeX(lang: string): X {
  const l = String(lang).split('-')[0]
  return (es, en, vars) => {
    RECORDER.keys?.set(en, es)
    return fill(l === 'es' ? es : l === 'en' ? en : (CONTENT[l]?.[en] ?? en), vars)
  }
}

/** Languages that write 96,4 rather than 96.4. */
export const decimalComma = (lang: string) => ['es', 'ca', 'fr', 'de', 'it', 'pt'].includes(String(lang).split('-')[0])
