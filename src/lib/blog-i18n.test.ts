// ─── The translated blog packs ───────────────────────────────────────────────
// Each pack is the English library translated under the same slugs. What makes
// that safe is structural identity — same blocks, same code, same links, same
// images — so that is what is pinned here, together with the two ways the
// packs could quietly hurt the rest of the site: landing in the main bundle,
// and headings or searches that only worked for Latin script.
//
// Spanish, German and French also have posts written directly in them. Where
// one of those IS an English post in that language (same translationKey), the
// pack has no translation of it and links to it go to the hand-written post.

import { describe, expect, it } from 'vitest'
import { ALL_BLOG_POSTS, BLOG_POSTS, getBlogPost, getBlogPostsByLang, isBlogLanguageReady, loadBlogLanguage, type BlogPost, type ContentBlock } from './blog-posts'
import { TRANSLATED_POSTS } from './blog-i18n'
import { blogPostMatchesQuery } from './blog-hub'
import { linkedSlugs, slugify } from './blog-related'
import { topicsFor } from './blog-topics'
import { editorialCopy } from './blog-editorial-copy'
import { getBlogHubCopy } from './blog-hub'
import { RULE_COUNT } from '../types'
import { retargetLinks } from '../../scripts/blog-i18n/segments'

const EN = new Map(BLOG_POSTS.map((p) => [p.slug, p]))
const LANGS = Object.keys(TRANSLATED_POSTS)
const key = (p: BlogPost) => p.translationKey ?? p.slug

/** English slug → the hand-written post that stands in for it in `lang`. */
function writtenFor(lang: string): Map<string, string> {
  const written = ALL_BLOG_POSTS.filter((p) => p.lang === lang)
  const out = new Map<string, string>()
  for (const source of BLOG_POSTS) {
    const own = written.find((p) => key(p) === key(source))
    if (own) out.set(source.slug, own.slug)
  }
  return out
}

/** The English post as its translation must look: links retargeted like apply.ts does. */
function expectedShape(source: BlogPost, lang: string): BlogPost {
  const copy = structuredClone(source)
  retargetLinks(copy, writtenFor(lang))
  return copy
}

const complete = (lang: string) => BLOG_POSTS.every((p) => writtenFor(lang).has(p.slug) || TRANSLATED_POSTS[lang].some((t) => t.slug === p.slug))

/** Everything about a block that is not prose. */
function skeleton(block: ContentBlock, whole: boolean): unknown {
  switch (block.type) {
    case 'code': return block
    case 'image': return { type: block.type, src: block.src, srcSet: block.srcSet, n: block.annotations?.length, xy: block.annotations?.map((a) => [a.x, a.y]) }
    // A partial pack drops deep links into posts it doesn't have yet (apply.ts).
    case 'related': return { type: block.type, to: block.to, ...(whole ? { hasSection: !!block.section } : {}) }
    case 'tool': return { type: block.type, id: block.id }
    case 'ifc-demo': return { type: block.type, modelId: block.modelId, schema: block.schema, size: block.size, height: block.height, variant: block.variant }
    case 'spatial-demo': return { type: block.type, demo: block.demo, poster: block.poster }
    case 'video': return { type: block.type, src: block.src, poster: block.poster }
    case 'stat-row': return { type: block.type, values: block.stats.map((s) => s.value) }
    case 'health-score': return { type: block.type, scores: block.items.map((i) => i.score) }
    case 'bars': return { type: block.type, values: block.items.map((i) => i.value) }
    case 'table': return { type: block.type, cols: block.headers.length, rows: block.rows.map((r) => r.length) }
    case 'ul': case 'ol': return { type: block.type, n: block.items.length }
    case 'decision': return { type: block.type, to: block.options.map((o) => o.to) }
    default: return { type: block.type }
  }
}

describe('translated blog packs', () => {
  it.each(LANGS)('%s: has every English post, translated or written in the language', (lang) => {
    // A new English post ships with its translations (docs/BLOG_I18N.md) —
    // otherwise its links from translated posts would point at nothing, and
    // the language quietly falls behind.
    const have = new Set(TRANSLATED_POSTS[lang].map((p) => p.slug))
    const own = writtenFor(lang)
    expect(BLOG_POSTS.map((p) => p.slug).filter((slug) => !have.has(slug) && !own.has(slug))).toEqual([])
    // …and never both: a translation next to the hand-written version would compete with it.
    expect(BLOG_POSTS.map((p) => p.slug).filter((slug) => have.has(slug) && own.has(slug))).toEqual([])
  })

  it.each(LANGS)('%s: every post is a translation of an English post, and marked as such', (lang) => {
    for (const post of TRANSLATED_POSTS[lang]) {
      const source = EN.get(post.slug)
      expect(source, `${lang}/${post.slug} has no English original`).toBeDefined()
      expect(post.lang).toBe(lang)
      expect(post.translationKey).toBe(source!.translationKey ?? source!.slug)
      expect(post.categorySlug).toBe(source!.categorySlug)
      expect(post.title).not.toBe(source!.title)
    }
  })

  it.each(LANGS)('%s: keeps the structure of the original — blocks, code, links, media, numbers', (lang) => {
    const whole = complete(lang)
    for (const post of TRANSLATED_POSTS[lang]) {
      const source = expectedShape(EN.get(post.slug)!, lang)
      expect(post.content.map((b) => skeleton(b, whole)), `${lang}/${post.slug}`).toEqual(source.content.map((b) => skeleton(b, whole)))
      expect([...linkedSlugs(post)].sort(), `${lang}/${post.slug} links`).toEqual([...linkedSlugs(source)].sort())
      expect(post.heroImage).toBe(source.heroImage)
      expect(post.date).toBe(source.date)
    }
  })

  it.each(LANGS)('%s: every internal link resolves to a post in the same language', (lang) => {
    // Only a complete language must resolve everything; a partial one is checked for what it has.
    if (!complete(lang)) return
    const slugs = new Set(getBlogPostsByLang(lang).map((p) => p.slug))
    for (const post of TRANSLATED_POSTS[lang]) {
      for (const to of linkedSlugs(post)) expect(slugs.has(to), `${lang}/${post.slug} → ${to}`).toBe(true)
    }
  })

  it.each(LANGS)('%s: deep links name a heading that exists in the target', (lang) => {
    const bySlug = new Map(getBlogPostsByLang(lang).map((p) => [p.slug, p]))
    for (const post of TRANSLATED_POSTS[lang]) {
      for (const block of post.content) {
        if (block.type !== 'related' || !block.section) continue
        const target = bySlug.get(block.to)!
        expect(target.content.some((b) => b.type === 'h2' && b.text === block.section), `${lang}/${post.slug} → ${block.to}#${block.section}`).toBe(true)
      }
    }
  })

  it.each(LANGS)('%s: every heading gets its own non-empty anchor', (lang) => {
    // slugify() used to keep only [a-z0-9]: every CJK/Thai heading became "",
    // so the table of contents and all section links pointed nowhere.
    for (const post of TRANSLATED_POSTS[lang]) {
      const ids = post.content.filter((b) => b.type === 'h2').map((b) => slugify((b as { text: string }).text))
      expect(ids.every(Boolean), `${lang}/${post.slug}`).toBe(true)
      expect(new Set(ids).size, `${lang}/${post.slug} duplicate h2 anchors`).toBe(ids.length)
    }
  })

  it.each(LANGS.filter((l) => ['zh', 'ja', 'th'].includes(l)))('%s: quotes the current number of validation rules', (lang) => {
    // rule-count.test.ts sweeps the English sources and the Latin-script packs,
    // but its prose windows are too loose for scripts without spaces ("GDPR
    // 第 28 条" is Article 28, not 28 rules). So these packs get patterns that
    // only match a rule-count claim: "44 条规则", "44のルール", "กฎ 44 ข้อ".
    const CLAIM = {
      zh: /(\d{2,3})\s*(?:条|项)\p{Script=Han}{0,4}规则/gu,
      ja: /(\d{2,3})(?:の|個の|件の)?[\p{Script=Han}\p{Script=Katakana}ー]{0,4}ルール(?!セット)/gu,
      th: /กฎ[^\d"]{0,12}?(\d{2,3})\s*ข้อ/gu,
    }[lang]!
    const stale = TRANSLATED_POSTS[lang].flatMap((post) =>
      [...JSON.stringify(post).matchAll(CLAIM)].map((m) => Number(m[1])).filter((n) => n >= 25 && n !== RULE_COUNT).map((n) => `${post.slug}: ${n}`))
    expect(stale).toEqual([])
    const quoted = TRANSLATED_POSTS[lang].some((post) => [...JSON.stringify(post).matchAll(CLAIM)].some((m) => Number(m[1]) === RULE_COUNT))
    expect(quoted, 'the pattern should find the claims the English posts make').toBe(true)
  })

  it('leaves Latin anchors exactly as they were', () => {
    expect(slugify('What Each Threshold Means')).toBe('what-each-threshold-means')
    expect(slugify('Paso 3: Exportar desde Revit')).toBe('paso-3-exportar-desde-revit')
  })

  it.each(LANGS)('%s: has the copy the blog needs in that language', (lang) => {
    expect(editorialCopy(lang)).not.toBe(editorialCopy('en'))
    expect(getBlogHubCopy(lang)).not.toBe(getBlogHubCopy('en'))
    // A complete language earns the same topic hubs as English.
    if (complete(lang)) {
      expect(topicsFor(getBlogPostsByLang(lang), lang).map((t) => t.slug).sort()).toEqual(topicsFor(BLOG_POSTS, 'en').map((t) => t.slug).sort())
    }
  })
})

describe('blog search in scripts written without spaces', () => {
  const find = (lang: string, query: string): BlogPost[] => TRANSLATED_POSTS[lang].filter((p) => blogPostMatchesQuery(p, query))

  it('finds Chinese, Japanese and Thai queries', () => {
    expect(find('zh', '验证').length).toBeGreaterThan(0)
    expect(find('zh', '点云').length).toBeGreaterThan(0)
    expect(find('ja', '検証').length).toBeGreaterThan(0)
    expect(find('ja', 'ビューアー').length).toBeGreaterThan(0)
    if (TRANSLATED_POSTS.th.length > 1) expect(find('th', 'ตรวจสอบ').length).toBeGreaterThan(0)
  })

  it('still narrows a query instead of matching everything', () => {
    expect(find('zh', '点云').length).toBeLessThan(TRANSLATED_POSTS.zh.length)
    expect(find('ja', '点群').length).toBeLessThan(TRANSLATED_POSTS.ja.length)
  })
})

describe('lazy language packs', () => {
  it('are not readable until loaded, then are', async () => {
    // blog-i18n/index.ts (imported above) registers the packs eagerly, the way
    // the build does; loading must still resolve and serve the same posts.
    await loadBlogLanguage('ja')
    expect(isBlogLanguageReady('ja')).toBe(true)
    expect(getBlogPostsByLang('ja')).toHaveLength(TRANSLATED_POSTS.ja.length)
    expect(getBlogPost('how-to-validate-ifc-file', 'ja')?.lang).toBe('ja')
    expect(getBlogPost('how-to-validate-ifc-file', 'en')?.lang ?? 'en').toBe('en')
  })

  it('are never imported statically by app code', () => {
    // Blog.tsx is part of the main bundle, so one static import of a pack
    // would ship ~1 MB of translations to every visitor. Only blog-posts.ts
    // (dynamic import()) and the build-only index may reference them.
    const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/lib/blog-i18n/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const offenders = Object.entries(sources)
      .filter(([file, text]) => file !== '/src/lib/blog-posts.ts' && /from\s+['"][^'"]*blog-i18n[^'"]*['"]|import\(\s*['"][^'"]*blog-i18n/.test(text))
      .map(([file]) => file)
    expect(offenders).toEqual([])
    expect(sources['/src/lib/blog-posts.ts']).toMatch(/import\('\.\/blog-i18n\/zh'\)/)
  })
})
