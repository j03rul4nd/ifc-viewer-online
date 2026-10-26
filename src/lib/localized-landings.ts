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

// ── Tool landings (scripts/seo/generate-tool-landings.mjs) ───────────────────
// The editor, classification and health-check pages, per language: the path
// and the link text (each page's H1). tool-landings.test.ts checks these
// against the generator's copy, so a renamed slug cannot leave a dead link.

export type ToolLanding = 'editor' | 'classification' | 'health'

export const TOOL_LANDINGS: Record<'en' | LandingLang, Record<ToolLanding, { path: string; label: string }>> = {
  en: { editor: { path: 'ifc-editor/', label: 'Free IFC Editor' }, classification: { path: 'ifc-classification-checker/', label: 'IFC Classification Checker' }, health: { path: 'ifc-health-check/', label: 'IFC Model Health Check' } },
  es: { editor: { path: 'es/editor-ifc-online/', label: 'Editor IFC gratis' }, classification: { path: 'es/comprobar-clasificacion-ifc/', label: 'Comprobar la clasificación IFC' }, health: { path: 'es/informe-calidad-ifc/', label: 'Health check del modelo IFC' } },
  de: { editor: { path: 'de/ifc-editor-online/', label: 'IFC Editor kostenlos' }, classification: { path: 'de/ifc-klassifikation-pruefen/', label: 'IFC-Klassifikation prüfen' }, health: { path: 'de/ifc-modellpruefung/', label: 'IFC-Modellprüfung' } },
  fr: { editor: { path: 'fr/editeur-ifc-en-ligne/', label: 'Éditeur IFC gratuit' }, classification: { path: 'fr/verifier-classification-ifc/', label: 'Vérifier la classification IFC' }, health: { path: 'fr/controle-qualite-ifc/', label: 'Contrôle qualité IFC' } },
  pt: { editor: { path: 'pt/editor-ifc-online/', label: 'Editor IFC grátis' }, classification: { path: 'pt/verificar-classificacao-ifc/', label: 'Verificar a classificação IFC' }, health: { path: 'pt/verificacao-qualidade-ifc/', label: 'Verificação de qualidade IFC' } },
  it: { editor: { path: 'it/editor-ifc-online/', label: 'Editor IFC gratis' }, classification: { path: 'it/verifica-classificazione-ifc/', label: 'Verifica classificazione IFC' }, health: { path: 'it/controllo-qualita-ifc/', label: 'Controllo qualità IFC' } },
  ca: { editor: { path: 'ca/editor-ifc-en-linia/', label: 'Editor IFC gratis' }, classification: { path: 'ca/comprovar-classificacio-ifc/', label: 'Comprovar la classificació IFC' }, health: { path: 'ca/control-qualitat-ifc/', label: 'Control de qualitat IFC' } },
  zh: { editor: { path: 'zh/ifc-editor-online/', label: '免费 IFC 编辑器' }, classification: { path: 'zh/ifc-classification-checker/', label: 'IFC 分类检查' }, health: { path: 'zh/ifc-health-check/', label: 'IFC 模型健康检查' } },
  ja: { editor: { path: 'ja/ifc-editor-online/', label: '無料 IFC エディタ' }, classification: { path: 'ja/ifc-classification-checker/', label: 'IFC 分類チェック' }, health: { path: 'ja/ifc-health-check/', label: 'IFC モデルのヘルスチェック' } },
  th: { editor: { path: 'th/ifc-editor-online/', label: 'โปรแกรมแก้ไข IFC ฟรี' }, classification: { path: 'th/ifc-classification-checker/', label: 'ตรวจสอบการจัดหมวดหมู่ IFC' }, health: { path: 'th/ifc-health-check/', label: 'ตรวจสุขภาพโมเดล IFC' } },
}

/** The tool landings of a language (English when it has none). */
export function toolLandings(lang: string): Array<{ key: ToolLanding; path: string; label: string }> {
  const set = TOOL_LANDINGS[(lang in TOOL_LANDINGS ? lang : 'en') as 'en']
  return (['editor', 'classification', 'health'] as const).map((key) => ({ key, ...set[key] }))
}
