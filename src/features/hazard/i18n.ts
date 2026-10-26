// ─── slope-hazard translations ───────────────────────────────────────────────
// Own namespace, added when the flood panel opens (flood/i18n.ts pattern).

import i18n from 'i18next'

export const HAZARD_NS = 'hazard'

const loaders = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*.json')

async function add(lng: string): Promise<boolean> {
  if (i18n.hasResourceBundle(lng, HAZARD_NS)) return true
  const load = loaders[`./locales/${lng}.json`]
  if (!load) return false
  const mod = await load()
  i18n.addResourceBundle(lng, HAZARD_NS, mod.default, true, false)
  return true
}

export async function ensureHazardI18n(language: string = i18n.language): Promise<void> {
  await add('en')
  const base = (language || 'en').split('-')[0]
  if (base !== 'en') await add(base)
}
