import { describe, expect, it } from 'vitest'
import type { BlogPost } from './blog-posts'
import { ALL_BLOG_POSTS } from './blog-posts'
import { linkedSlugs, postSections, relatedPosts, slugify } from './blog-related'
import { BLOG_TOOLS, toolsForPost } from './blog-tools'

const post = (slug: string, extra: Partial<BlogPost> = {}): BlogPost => ({
  slug, title: slug, excerpt: '', date: '2026-01-01', readTimeMin: 5, category: 'Validation',
  categorySlug: 'validation', author: 'x', content: [], ...extra,
})

describe('relatedPosts', () => {
  const current = post('a', {
    keywords: ['ifc', 'duplicate guid', 'bcf'],
    content: [{ type: 'p', text: ['see ', { text: 'b', to: 'b' }] }],
  })
  const pool = [
    current,
    post('b', { categorySlug: 'other', category: 'Other' }),
    post('c', { keywords: ['duplicate guid'], categorySlug: 'other', category: 'Other' }),
    post('d', { content: [{ type: 'p', text: [{ text: 'a', to: 'a' }] }], categorySlug: 'other', category: 'Other' }),
    post('e'),
    post('f', { categorySlug: 'other', category: 'Other', keywords: ['ifc'] }),
  ]

  it('ranks by the strongest relation and says why', () => {
    const r = relatedPosts(current, pool)
    expect(r.map((x) => x.post.slug)).toEqual(['b', 'd', 'c', 'e'])
    expect(r.map((x) => x.reason.kind)).toEqual(['linked', 'backlink', 'keywords', 'category'])
  })

  it('never recommends the post itself, or posts related only by generic keywords', () => {
    const slugs = relatedPosts(current, pool).map((x) => x.post.slug)
    expect(slugs).not.toContain('a')
    expect(slugs).not.toContain('f')
  })

  it('sinks posts already read', () => {
    expect(relatedPosts(current, pool, 6, new Set(['b']))[0].post.slug).toBe('d')
  })
})

describe('sections and links', () => {
  it('lists h2 sections with their opening paragraph', () => {
    const p = post('x', { content: [{ type: 'h2', text: 'Why It Breaks' }, { type: 'p', text: 'Because.' }, { type: 'h2', text: 'Fix' }] })
    expect(postSections(p, slugify)).toEqual([
      { id: 'why-it-breaks', title: 'Why It Breaks', lead: 'Because.' },
      { id: 'fix', title: 'Fix', lead: '' },
    ])
  })

  it('finds links in related blocks and references', () => {
    const p = post('x', { content: [{ type: 'related', to: 'y' }], references: [{ id: 'r', title: 't', to: 'z' }] })
    expect([...linkedSlugs(p)].sort()).toEqual(['y', 'z'])
  })
})

describe('content integrity', () => {
  it('every related block points at a real post and, if given, a real section', () => {
    for (const p of ALL_BLOG_POSTS) {
      for (const b of p.content) {
        if (b.type !== 'related') continue
        const target = ALL_BLOG_POSTS.find((t) => t.slug === b.to && (t.lang ?? 'en') === (p.lang ?? 'en'))
        expect(target, `${p.slug} → ${b.to}`).toBeDefined()
        if (b.section) expect(postSections(target!, slugify).some((s) => s.title === b.section), `${p.slug} → ${b.to}#${b.section}`).toBe(true)
      }
    }
  })

  it('every tool block names a catalogued tool', () => {
    const ids = new Set(BLOG_TOOLS.map((t) => t.id))
    for (const p of ALL_BLOG_POSTS) for (const b of p.content) if (b.type === 'tool') expect(ids.has(b.id)).toBe(true)
  })

  it('matches tools from what a post is about', () => {
    expect(toolsForPost(post('g', { title: 'Duplicate GUIDs', keywords: ['duplicate guid'] })).map((t) => t.id)).toContain('guid-fixer')
  })
})
