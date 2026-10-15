// ─── twin localize ────────────────────────────────────────────────────────────
// A published scene is read in ten languages, but its bindings and rules carry
// one `name` each: "Few bikes (≤ 2)" stood in English next to a Spanish tour,
// in the legend and in the explorer. A binding or rule may add `names` — the
// same name per language code — and what a visitor sees picks from it.
//
// The editor keeps working on `name` (the one you type); only the views a
// visitor reads (explorer, tour, legend, inspector, alerts) go through here.

import type { Binding, TwinRule } from './devices'

type Named = { name: string; names?: Record<string, string> }

/** `names[lang]`, then its base language ("pt-BR" → "pt"), then `name`. */
export function localName(item: Named, lang: string): string {
  const names = item.names
  if (!names || typeof names !== 'object') return item.name
  const exact = names[lang]
  if (typeof exact === 'string' && exact) return exact
  const base = names[lang.split('-')[0]]
  return typeof base === 'string' && base ? base : item.name
}

const localRule = (r: TwinRule, lang: string): TwinRule => {
  const name = localName(r, lang)
  return name === r.name ? r : { ...r, name }
}

/**
 * The bindings as a visitor reads them: each binding's and rule's `name` in
 * `lang`. Ids, targets and effects are untouched, so lookups by id still
 * match; objects without translations are returned as they are.
 */
export function localizeBindings(bindings: readonly Binding[], lang: string): Binding[] {
  return bindings.map((b) => {
    const name = localName(b, lang)
    const mapped = b.rules.map((r) => localRule(r, lang))
    const rules = mapped.every((r, i) => r === b.rules[i]) ? b.rules : mapped
    return name === b.name && rules === b.rules ? b : { ...b, name, rules }
  })
}

/** Keep `names` only when it is an object of non-empty strings (hand-edited scene files). */
export function cleanNames(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim() && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(k)) out[k] = v.trim().slice(0, 300)
  }
  return Object.keys(out).length ? out : undefined
}
