import { describe, it, expect } from 'vitest'
import {
  FIX_GUIDE_LANGS, FIX_GUIDE_LANG_PATH, HANDWRITTEN_FIX_GUIDES,
  fixGuideSlug, fixGuideLangPath, fixGuidePath, fixGuideUrl,
} from './fix-guide-url'
import { RULE_METADATA } from '../types'

// The point of this module is that the app and the page generator agree about
// which guide pages exist. A link to a page nobody generated is a 404 that no
// type-checker sees, so the agreement is asserted here rather than assumed.

describe('the slug a guide is published at', () => {
  it('drops the RULE_ prefix and kebab-cases the rest', () => {
    expect(fixGuideSlug('RULE_MISSING_PROPERTY_SET')).toBe('missing-property-set')
    expect(fixGuideSlug('RULE_EMPTY_NAME')).toBe('empty-name')
  })

  it('gives every real rule a non-empty, URL-safe slug', () => {
    // A rule whose slug collided with another's would silently overwrite a page.
    const seen = new Map<string, string>()
    for (const ruleId of Object.keys(RULE_METADATA)) {
      const slug = fixGuideSlug(ruleId)
      expect(slug, ruleId).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(seen.get(slug), `${ruleId} collides with ${seen.get(slug)}`).toBeUndefined()
      seen.set(slug, ruleId)
    }
  })
})

describe('the language prefix', () => {
  it('puts EN at the root and every other language under its own folder', () => {
    expect(fixGuideLangPath('en')).toBe('')
    for (const lang of FIX_GUIDE_LANGS.filter((l) => l !== 'en')) {
      expect(fixGuideLangPath(lang), lang).toBe(`${lang}/`)
    }
  })

  it('accepts a full BCP-47 tag, not just the bare code', () => {
    // i18next hands us `zh-CN` and `pt-BR`; the pages ship at /zh/ and /pt/.
    expect(fixGuideLangPath('zh-CN')).toBe('zh/')
    expect(fixGuideLangPath('pt-BR')).toBe('pt/')
  })

  it('falls back to EN for a language with no pages', () => {
    // A guide in the wrong language beats a link to a page that does not exist.
    expect(fixGuideLangPath('nl')).toBe('')
    expect(fixGuideLangPath('')).toBe('')
  })

  it('has a path for every declared language and no orphans', () => {
    expect(Object.keys(FIX_GUIDE_LANG_PATH).sort()).toEqual([...FIX_GUIDE_LANGS].sort())
  })
})

describe('the URL the panel links to', () => {
  it('points at the generated page for an ordinary rule', () => {
    expect(fixGuidePath('RULE_EMPTY_NAME', 'en')).toBe('fix/empty-name/')
    expect(fixGuidePath('RULE_EMPTY_NAME', 'es')).toBe('es/fix/empty-name/')
  })

  it('sends the GUID rules to the hand-authored page instead', () => {
    // These two are deliberately NOT generated — see HANDWRITTEN_FIX_GUIDES.
    for (const ruleId of Object.keys(HANDWRITTEN_FIX_GUIDES)) {
      expect(fixGuidePath(ruleId, 'en')).toBe('tools/fix-duplicate-guids/')
      // and the hand-authored page is language-agnostic, so no prefix creeps in
      expect(fixGuidePath(ruleId, 'de')).toBe('tools/fix-duplicate-guids/')
    }
  })

  it('applies the caller base without doubling the slash', () => {
    expect(fixGuideUrl('RULE_EMPTY_NAME', 'fr', '/')).toBe('/fr/fix/empty-name/')
    expect(fixGuideUrl('RULE_EMPTY_NAME', 'fr', '/app/')).toBe('/app/fr/fix/empty-name/')
  })

  it('never emits a double slash for any rule in any language', () => {
    for (const ruleId of Object.keys(RULE_METADATA)) {
      for (const lang of FIX_GUIDE_LANGS) {
        const url = fixGuideUrl(ruleId, lang, '/')
        expect(url, `${ruleId} ${lang}`).not.toMatch(/\/\//)
        expect(url, `${ruleId} ${lang}`).toMatch(/\/$/)
      }
    }
  })
})

// The "nobody re-copies this function" guard lives in
// scripts/seo/generate-fix-pages.test.ts — it reads files off disk, and only the
// scripts project has node's types.
