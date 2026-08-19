// ── Slugs of the hand-authored localized SEO landings ────────────────────────
//
// Each language has its own keyword-localized landing pages under public/<lang>/.
// The slugs are chosen for search intent in that language, so they cannot be
// derived from the language code — this file is the single source of truth, and
// each entry must match a directory name on disk.
//
// Shared by generate-fix-pages.ts (footer links on ~510 fix pages),
// generate-lang-shells.ts (the <noscript> links on each language home) and the
// app's own Landing footer. Kept here so they cannot drift and start linking
// different targets. It lives under src/ because the app imports it too — the
// build-time generators may reach into src/, not the other way round.
//
// Before this existed, the fix-page footer hardcoded
//   langPath === 'es/' ? 'es/ifc-validador/' : 'ifc-validator/'
// which sent every non-ES language to the ENGLISH validator landing even though
// a localized one already existed for all nine.

export type LandingLang = 'es' | 'fr' | 'de' | 'pt' | 'it' | 'ca' | 'zh' | 'ja' | 'th'

/** The primary "IFC validator" landing per language (NOT the cloud variant). */
export const VALIDATOR_SLUG: Record<LandingLang, string> = {
  es: 'ifc-validador',
  fr: 'validateur-ifc-en-ligne',
  de: 'ifc-validator-online',
  pt: 'validador-ifc-online',
  it: 'validatore-ifc-online',
  ca: 'validador-ifc-en-linia',
  zh: 'ifc-validator-online',
  ja: 'ifc-validator-online',
  th: 'ifc-validator-online',
}

/** The "Solibri alternative" landing per language (NOT the WebChecker variant). */
export const SOLIBRI_SLUG: Record<LandingLang, string> = {
  es: 'alternativa-a-solibri',
  fr: 'alternative-solibri',
  de: 'solibri-alternative',
  pt: 'alternativa-ao-solibri',
  it: 'alternativa-a-solibri',
  ca: 'alternativa-a-solibri',
  zh: 'solibri-alternative',
  ja: 'solibri-alternative',
  th: 'solibri-alternative',
}

function isLandingLang(lang: string): lang is LandingLang {
  return lang in VALIDATOR_SLUG
}

/**
 * Site-root-relative path (no leading slash) of a language's landing, falling
 * back to the English page when the language has none — better an English page
 * than a 404.
 */
export function validatorPath(lang: string): string {
  return isLandingLang(lang) ? `${lang}/${VALIDATOR_SLUG[lang]}/` : 'ifc-validator/'
}

export function solibriPath(lang: string): string {
  return isLandingLang(lang) ? `${lang}/${SOLIBRI_SLUG[lang]}/` : 'solibri-alternative/'
}
