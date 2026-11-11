// ─── Public pricing page paths ────────────────────────────────────────────────
// One static page per language, written by scripts/seo/generate-pricing-pages.ts.
// The landing's "Pricing" link and the generator's hreflang set both read this,
// so a slug changes in one place.

export const PRICING_LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'] as const
export type PricingLang = (typeof PRICING_LANGS)[number]

const SLUG: Record<PricingLang, string> = {
  en: 'pricing', es: 'precios', de: 'preise', fr: 'tarifs', pt: 'precos',
  it: 'prezzi', ca: 'preus', zh: 'pricing', ja: 'pricing', th: 'pricing',
}

export function isPricingLang(lang: string): lang is PricingLang {
  return (PRICING_LANGS as readonly string[]).includes(lang)
}

/** Site-relative path of the pricing page, with leading and trailing slash. */
export function pricingPath(lang: string): string {
  const l: PricingLang = isPricingLang(lang) ? lang : 'en'
  return l === 'en' ? `/${SLUG.en}/` : `/${l}/${SLUG[l]}/`
}
