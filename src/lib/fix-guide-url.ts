// ── Where a rule's "how to fix" guide lives ───────────────────────────────────
//
// One rule id in, one URL out. This existed three times — once in
// ValidationPanel, once in ValidationPanelMobile, and once (split across
// `LANGS`/`LANG_PATH`/`SKIP`/`slugOf`) inside the generator that actually writes
// the pages. Three copies of a routing rule is three chances to publish links to
// pages that were never generated, and the failure is silent: the app renders a
// perfectly good anchor to a 404, on one platform only.
//
// So the generator (scripts/seo/generate-fix-pages.ts) imports from here too.
// It is the thing that decides which pages exist; this module is that decision
// stated once, in a form the runtime can also read.
//
// Deliberately pure — no `import.meta.env`, no DOM. The generator runs in node,
// where `import.meta.env` does not exist, so callers pass their own base.

/**
 * Languages the fix guides ship in. EN is canonical at the site root; every
 * other language gets a `/<lang>/` prefix. Adding a language here is what makes
 * both the pages and the links to them appear.
 */
export const FIX_GUIDE_LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'] as const

export type FixGuideLang = (typeof FIX_GUIDE_LANGS)[number]

/** Path prefix per language, relative to the site root. EN = root. */
export const FIX_GUIDE_LANG_PATH: Record<FixGuideLang, string> = {
  en: '', es: 'es/', de: 'de/', fr: 'fr/', pt: 'pt/', it: 'it/', ca: 'ca/', zh: 'zh/', ja: 'ja/', th: 'th/',
}

/**
 * Rules whose guide is a richer, hand-authored page rather than a generated one.
 * The generator skips these so it does not publish a thinner competing page, and
 * the app links to the hand-authored one instead. Both behaviours read this set,
 * which is the only reason they agree.
 */
export const HANDWRITTEN_FIX_GUIDES: Readonly<Record<string, string>> = {
  RULE_DUPLICATE_GUID: 'tools/fix-duplicate-guids/',
  RULE_INVALID_GUID_FORMAT: 'tools/fix-duplicate-guids/',
}

/** `RULE_EMPTY_NAME` → `empty-name`. The slug the generated page is written at. */
export function fixGuideSlug(ruleId: string): string {
  return ruleId.replace(/^RULE_/, '').toLowerCase().replace(/_/g, '-')
}

/**
 * The `<lang>/` prefix for a UI language tag. Accepts full tags (`zh-CN`,
 * `pt-BR`) and falls back to EN — the root — for anything unrecognised, because
 * a guide in the wrong language beats a link to a page that does not exist.
 */
export function fixGuideLangPath(language: string): string {
  const lang = language.slice(0, 2) as FixGuideLang
  return FIX_GUIDE_LANG_PATH[lang] ?? ''
}

/**
 * Root-relative path to a rule's guide, with no base applied — `es/fix/empty-name/`.
 * Use this when you are building an absolute URL against a known origin.
 */
export function fixGuidePath(ruleId: string, language: string): string {
  const handwritten = HANDWRITTEN_FIX_GUIDES[ruleId]
  if (handwritten) return handwritten
  return `${fixGuideLangPath(language)}fix/${fixGuideSlug(ruleId)}/`
}

/**
 * The URL to link a user to. `base` is the app's base URL — in the browser that
 * is `import.meta.env.BASE_URL`, which already carries its trailing slash.
 */
export function fixGuideUrl(ruleId: string, language: string, base: string): string {
  return `${base}${fixGuidePath(ruleId, language)}`
}
