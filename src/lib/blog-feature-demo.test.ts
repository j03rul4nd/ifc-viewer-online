import { describe, expect, it } from 'vitest'
import { FEATURE_DEMO_LANGS, featureDemoCopy, featureDemoLinks, SOLUTION_SLUGS, STEP_INDEX } from './blog-feature-demo-copy'
import { SLUGS as LANDING_SLUGS } from '../../scripts/seo/solution-landings/pages'
import { pricingPath } from './pricing/pricing-paths'
import { PREVIEW_FEATURE_POSTS_EN } from './blog-preview-features-en'
import { PREVIEW_FEATURE_POSTS2_EN } from './blog-preview-features2-en'
import { PREVIEW_FEATURE_POSTS3_EN } from './blog-preview-features3-en'
import { PREVIEW_FEATURE_POSTS4_EN } from './blog-preview-features4-en'
import { EVERY_BLOG_POST } from './blog-i18n'

const PREVIEW = [...PREVIEW_FEATURE_POSTS_EN, ...PREVIEW_FEATURE_POSTS2_EN, ...PREVIEW_FEATURE_POSTS3_EN, ...PREVIEW_FEATURE_POSTS4_EN]
const SLUGS = new Set(PREVIEW.map((p) => p.slug))

describe('feature-demo block', () => {
  it('has copy in the ten blog languages', () => {
    expect(FEATURE_DEMO_LANGS.sort()).toEqual(['ca', 'de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh'])
    for (const l of FEATURE_DEMO_LANGS) {
      const c = featureDemoCopy(l)
      for (const s of Object.keys(STEP_INDEX)) expect(c.steps[s as keyof typeof c.steps], `${l} ${s}`).toBeTruthy()
    }
  })

  it('never mentions AI and always says the paid tools are not open', () => {
    for (const l of FEATURE_DEMO_LANGS) {
      const text = JSON.stringify(featureDemoCopy(l))
      expect(text, l).not.toMatch(/\b(AI|IA|KI)\b|artificial|人工智能|人工知能|ปัญญาประดิษฐ์/i)
    }
    expect(featureDemoCopy('en').sample).toMatch(/preview and not open/)
  })

  it('is in every preview post, once, in every language', () => {
    const byLang = new Map<string, number>()
    for (const post of [...EVERY_BLOG_POST.filter((p) => SLUGS.has(p.slug))]) {
      const n = post.content.filter((b) => b.type === 'feature-demo').length
      expect(n, `${post.lang ?? 'en'} ${post.slug}`).toBe(1)
      byLang.set(post.lang ?? 'en', (byLang.get(post.lang ?? 'en') ?? 0) + 1)
    }
    for (const [, n] of byLang) expect(n).toBe(PREVIEW.length)
  })

  it('links the guided demo at its step, and localized pricing and solution pages', () => {
    const l = featureDemoLinks({ step: 'clashes', free: 'viewer', role: 'team', talk: 'engineering', lang: 'es' })
    expect(l.demo).toBe('/workspace/rules/advanced?demo=reception-flow&step=4')
    expect(l.waitlist).toBe(`${pricingPath('es')}?role=team`)
    expect(l.talk).toBe('/es/para-ingenierias/')
    expect(featureDemoLinks({ step: 'drop', free: 'validator', role: 'receive', talk: 'contractors', lang: 'en' }).waitlist).toBe('/pricing/?role=receive')
    expect(SOLUTION_SLUGS).toEqual(LANDING_SLUGS)
  })
})
