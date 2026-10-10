// ─── flood translations ───────────────────────────────────────────────────────
// The flood feature carries its own strings and adds them to i18next when its
// panel first opens, so not one byte of them reaches the entry bundle (every
// other namespace's English is bundled eagerly). English is always added as
// the fallback; a language without its own file falls back to it.

import i18n from 'i18next'

export const FLOOD_NS = 'flood'

const loaders = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*.json')

async function add(lng: string): Promise<boolean> {
  if (i18n.hasResourceBundle(lng, FLOOD_NS)) return true
  const load = loaders[`./locales/${lng}.json`]
  if (!load) return false
  const mod = await load()
  i18n.addResourceBundle(lng, FLOOD_NS, mod.default, true, false)
  return true
}

/** Loads English and the current language's strings (once). */
export async function ensureFloodI18n(language: string = i18n.language): Promise<void> {
  await add('en')
  const base = (language || 'en').split('-')[0]
  if (base !== 'en') await add(base)
}
