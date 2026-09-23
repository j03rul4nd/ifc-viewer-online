import { describe, expect, it } from 'vitest'
import { BLOG_POSTS, BLOG_POSTS_ES, type BlogPost } from './blog-posts'
import { foundationalPosts, freshness, lastTouched, MIN_TOPIC_POSTS, topicsFor, whatsNew } from './blog-topics'

const post = (slug: string, extra: Partial<BlogPost> = {}): BlogPost => ({
  slug, title: slug, excerpt: '', date: '2026-01-01', readTimeMin: 5, category: 'Validation',
  categorySlug: 'validation', author: 'x', content: [], ...extra,
})

describe('topics', () => {
  it('turns every English category into a hub, each with enough guides', () => {
    const topics = topicsFor(BLOG_POSTS, 'en')
    expect(topics.map((t) => t.slug).sort()).toEqual(['delivery', 'digital-twins', 'export-fixes', 'privacy', 'tools', 'validation'])
    for (const t of topics) expect(t.posts.length).toBeGreaterThanOrEqual(MIN_TOPIC_POSTS)
  })

  it('never makes a thin hub: a language only gets hubs where it has the guides', () => {
    expect(topicsFor(BLOG_POSTS_ES, 'es').map((t) => t.slug)).toEqual(['digital-twins'])
  })

  it('every post belongs to one of the six topics', () => {
    const known = new Set(['delivery', 'digital-twins', 'export-fixes', 'privacy', 'tools', 'validation'])
    for (const p of [...BLOG_POSTS, ...BLOG_POSTS_ES]) expect(known.has(p.categorySlug), p.slug).toBe(true)
  })
})

describe('foundational posts', () => {
  it('ranks by how many other posts link to them', () => {
    const a = post('a')
    const b = post('b', { content: [{ type: 'p', text: [{ text: 'a', to: 'a' }] }] })
    const c = post('c', { content: [{ type: 'p', text: [{ text: 'a', to: 'a' }, { text: 'b', to: 'b' }] }] })
    expect(foundationalPosts([a, b, c], 2).map((p) => p.slug)).toEqual(['a', 'b'])
  })
})

describe('freshness', () => {
  const today = new Date('2026-09-23')
  it('marks recent posts as new', () => {
    expect(freshness(post('n', { date: '2026-09-10' }), today)).toBe('new')
  })
  it('marks a real, recent revision as updated — not a same-week tweak', () => {
    expect(freshness(post('u', { date: '2026-03-01', dateModified: '2026-08-20' }), today)).toBe('updated')
    expect(freshness(post('t', { date: '2026-03-01', dateModified: '2026-03-05' }), today)).toBeNull()
  })
  it('orders "new and updated" by the last change', () => {
    const old = post('old', { date: '2026-01-01', dateModified: '2026-09-01' })
    const recent = post('recent', { date: '2026-08-01' })
    expect(lastTouched(old)).toBe('2026-09-01')
    expect(whatsNew([recent, old], 2).map((p) => p.slug)).toEqual(['old', 'recent'])
  })
})
