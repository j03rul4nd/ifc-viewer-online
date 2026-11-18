import { afterEach, describe, expect, it, vi } from 'vitest'
import { blogOffer, getSeen, postInterest, recordSeen, resolveBlogInterest, type Interest } from './blog-cta'
import { BLOG_POSTS } from './blog-posts'
import en from '../locales/en/blog.json'
import es from '../locales/es/blog.json'
import ca from '../locales/ca/blog.json'
import de from '../locales/de/blog.json'
import fr from '../locales/fr/blog.json'
import it_ from '../locales/it/blog.json'
import pt from '../locales/pt/blog.json'
import ja from '../locales/ja/blog.json'
import zh from '../locales/zh/blog.json'
import th from '../locales/th/blog.json'

const post = (categorySlug: string, extra: Partial<{ slug: string; title: string; keywords: string[] }> = {}) => ({
  slug: extra.slug ?? 'a-post', title: extra.title ?? 'A post', categorySlug, keywords: extra.keywords,
})

describe('resolveBlogInterest: category fallback', () => {
  it.each([
    ['validation', 'validation'], ['digital-twins', 'twin'], ['delivery', 'iso19650'],
    ['tools', 'open'], ['export-fixes', 'open'], ['privacy', 'open'], ['other', 'open'],
  ])('%s → %s', (cat, want) => {
    expect(resolveBlogInterest(post(cat))).toBe(want)
  })
})

describe('resolveBlogInterest: keyword overrides', () => {
  it('steel in the slug beats the category', () => {
    expect(resolveBlogInterest(post('validation', { slug: 'tekla-ifc-export' }))).toBe('steel')
  })
  it('structural in the title', () => {
    expect(resolveBlogInterest(post('tools', { title: 'Structural models in the browser' }))).toBe('steel')
  })
  it('federation and large files', () => {
    expect(resolveBlogInterest(post('tools', { slug: 'federated-models' }))).toBe('large')
    expect(resolveBlogInterest(post('privacy', { keywords: ['big-file ifc'] }))).toBe('large')
  })
  it('iso 19650 / naming / cde', () => {
    expect(resolveBlogInterest(post('tools', { slug: 'iso-19650-guide' }))).toBe('iso19650')
    expect(resolveBlogInterest(post('validation', { title: 'File naming rules' }))).toBe('iso19650')
    expect(resolveBlogInterest(post('other', { keywords: ['CDE setup'] }))).toBe('iso19650')
  })
})

describe('resolveBlogInterest: seen tiebreak', () => {
  it('an open post borrows the most frequent seen interest', () => {
    const seen: Interest[] = ['open', 'twin', 'steel', 'steel', 'open']
    expect(resolveBlogInterest(post('tools'), seen)).toBe('steel')
  })
  it('stays open when only open was seen', () => {
    expect(resolveBlogInterest(post('tools'), ['open', 'open'])).toBe('open')
  })
  it('a specific post ignores the session', () => {
    expect(resolveBlogInterest(post('validation'), ['twin', 'twin'])).toBe('validation')
  })
})

describe('blogOffer', () => {
  it('steel links the steel demo tour', () => {
    expect(blogOffer('steel', 'en').viewerHref).toBe('/?steel=demo&tour=steel')
    expect(blogOffer('steel', 'en').offerKey).toBe('steel_takeoff')
  })
  it('open has no plans link', () => {
    expect(blogOffer('open', 'en').secondaryHref).toBeNull()
  })
  it('plans link is localised', () => {
    expect(blogOffer('validation', 'es').secondaryHref).toMatch(/^\/es\/precios\//)
    expect(blogOffer('twin', 'en').secondaryHref).toMatch(/^\/pricing\//)
  })
})

describe('seen storage', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('does not crash when storage throws', () => {
    vi.stubGlobal('window', { sessionStorage: {
      getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') },
    } })
    expect(() => recordSeen('x')).not.toThrow()
    expect(getSeen()).toEqual([])
  })

  it('records, dedupes and caps at 20', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) },
    } })
    for (let i = 0; i < 25; i++) recordSeen(`p${i}`)
    recordSeen('p10')
    const seen = getSeen()
    expect(seen).toHaveLength(20)
    expect(seen[seen.length - 1]).toBe('p10')
    expect(seen.filter((s) => s === 'p10')).toHaveLength(1)
  })
})

describe('real posts', () => {
  it('resolve to several interests', () => {
    const got = new Set(BLOG_POSTS.map((p) => postInterest(p)))
    expect(got.size).toBeGreaterThanOrEqual(3)
  })
  it('screenshot posts resolve as expected', () => {
    const by = (s: string) => BLOG_POSTS.find((p) => p.slug === s)
    const pick = Object.fromEntries(['iso-19650-file-naming-convention', 'large-ifc-file-browser-crash', 'real-time-lidar-web-digital-twin-mcap']
      .map((s) => [s, by(s) ? postInterest(by(s)!) : 'missing']))
    expect(pick).toEqual({
      'iso-19650-file-naming-convention': 'iso19650',
      'large-ifc-file-browser-crash': 'large',
      'real-time-lidar-web-digital-twin-mcap': 'twin',
    })
  })
})

type Json = Record<string, unknown>
function keys(obj: Json, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' ? keys(v as Json, key) : [key]
  })
}

describe('blog cta locale parity', () => {
  const ref = keys((en as Json).cta as Json).sort()
  it.each(Object.entries({ es, ca, de, fr, it: it_, pt, ja, zh, th }))('%s has every cta key', (_l, json) => {
    expect(keys((json as Json).cta as Json).sort()).toEqual(ref)
  })
  it('copy never mentions AI', () => {
    for (const json of [en, es, ca, de, fr, it_, pt, ja, zh, th]) {
      const text = JSON.stringify((json as Json).cta)
      expect(text).not.toMatch(/\b(AI|IA|KI)\b/)
      expect(text).not.toMatch(/artificial|künstlich|人工智能|人工知能|ปัญญาประดิษฐ์/i)
    }
  })
})
