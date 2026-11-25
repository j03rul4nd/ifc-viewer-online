// ─── Public integrations page paths ───────────────────────────────────────────
// One static page per language, written by scripts/seo/generate-integrations-page.ts.
// The home's "All integrations" link and the generator's hreflang set both read
// this, so a slug changes in one place.

export const INTEGRATIONS_LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'] as const
export type IntegrationsLang = (typeof INTEGRATIONS_LANGS)[number]

const SLUG: Record<IntegrationsLang, string> = {
  en: 'integrations', es: 'integraciones', de: 'integrationen', fr: 'integrations', pt: 'integracoes',
  it: 'integrazioni', ca: 'integracions', zh: 'integrations', ja: 'integrations', th: 'integrations',
}

export function isIntegrationsLang(lang: string): lang is IntegrationsLang {
  return (INTEGRATIONS_LANGS as readonly string[]).includes(lang)
}

/** Site-relative path of the integrations page, with leading and trailing slash. */
export function integrationsPath(lang: string): string {
  const l: IntegrationsLang = isIntegrationsLang(lang) ? lang : 'en'
  return l === 'en' ? `/${SLUG.en}/` : `/${l}/${SLUG[l]}/`
}
