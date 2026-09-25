// ─── Blog recommendations ────────────────────────────────────────────────────
// What to read or use next, ranked by how it relates to THIS article — not the
// three newest posts. Pure functions (tested in blog-related.test.ts); the UI
// lives in components/blog/Recommendations.tsx.
//
// Signals, strongest first:
//   linked     the article itself links to it — the author already said so
//   backlink   it links to this article — it builds on what you just read
//   keywords   shared search keywords (the post's declared topics)
//   category   same category
// Every recommendation carries its strongest reason, so the UI can say WHY
// ("Builds on this article", "Also about: GUIDs") instead of a bare list.

import type { BlogPost, ContentBlock, RichText } from './blog-posts'

export type RelatedReason =
  | { kind: 'linked' }
  | { kind: 'backlink' }
  | { kind: 'keywords'; shared: string[] }
  | { kind: 'category'; category: string }

export interface RelatedPost {
  post: BlogPost
  score: number
  reason: RelatedReason
}

function slugsIn(text: RichText | undefined): string[] {
  if (!text || typeof text === 'string') return []
  return text.flatMap((seg) => (typeof seg !== 'string' && 'to' in seg ? [seg.to] : []))
}

/** Every post slug an article links to, from its prose and its blocks. */
export function linkedSlugs(post: BlogPost): Set<string> {
  const out = new Set<string>()
  const add = (xs: string[]) => xs.forEach((x) => out.add(x))
  for (const b of post.content as ContentBlock[]) {
    switch (b.type) {
      case 'p': case 'callout': add(slugsIn(b.text)); break
      case 'takeaways': b.items.forEach((i) => add(slugsIn(i))); break
      case 'steps': b.items.forEach((i) => { add(slugsIn(i.body)); add(slugsIn(i.detail)) }); break
      case 'decision': b.options.forEach((o) => { add(slugsIn(o.body)); if (o.to) out.add(o.to) }); break
      case 'related': out.add(b.to); break
    }
  }
  post.references?.forEach((r) => { if (r.to) out.add(r.to) })
  out.delete(post.slug)
  return out
}

const norm = (k: string) => k.toLowerCase().trim()

/** Keywords too generic to say two posts are about the same thing. */
const GENERIC = new Set(['ifc', 'bim', 'ifc file', 'ifc viewer', 'ifc model', 'ifc files', 'openbim'])

export function relatedPosts(current: BlogPost, pool: BlogPost[], limit = 6, read: Set<string> = new Set()): RelatedPost[] {
  const links = linkedSlugs(current)
  const kw = new Set((current.keywords ?? []).map(norm).filter((k) => !GENERIC.has(k)))

  const scored = pool
    .filter((p) => p.slug !== current.slug && (p.lang ?? 'en') === (current.lang ?? 'en'))
    .map((p): RelatedPost => {
      const shared = (p.keywords ?? []).map(norm).filter((k) => kw.has(k))
      const linked = links.has(p.slug)
      const backlink = linkedSlugs(p).has(current.slug)
      const sameCat = p.categorySlug === current.categorySlug
      let score = (linked ? 6 : 0) + (backlink ? 4 : 0) + shared.length * 2 + (sameCat ? 1.5 : 0)
      // Already read: still eligible, but after the unread ones.
      if (read.has(p.slug)) score *= 0.35
      const reason: RelatedReason = linked ? { kind: 'linked' }
        : backlink ? { kind: 'backlink' }
        : shared.length ? { kind: 'keywords', shared: shared.slice(0, 2) }
        : { kind: 'category', category: p.category }
      return { post: p, score, reason }
    })
    .filter((r) => r.score > 0)

  // Stable tie-break: newest first.
  scored.sort((a, b) => b.score - a.score || b.post.date.localeCompare(a.post.date))
  return scored.slice(0, limit)
}

// ── Sections of other posts ─────────────────────────────────────────────────

/**
 * Heading → element id. Shared by the TOC, section links and deep links.
 *
 * Thai, kana and Han are kept: without them every Chinese, Japanese or Thai
 * heading collapsed to the same empty id, so the table of contents and every
 * section link pointed nowhere. Latin text slugs exactly as before, so ids
 * already shared in links keep working.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\u0E00-\u0E7F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export interface PostSection {
  id: string
  title: string
  /** First paragraph under the heading, as plain text. */
  lead: string
}

export function plainText(text: RichText): string {
  if (typeof text === 'string') return text
  return text.map((s) => (typeof s === 'string' ? s : 'text' in s ? (s.text ?? '') : '')).join('')
}

/** h2 sections of a post with the paragraph that opens each. */
export function postSections(post: BlogPost, slugify: (s: string) => string): PostSection[] {
  const out: PostSection[] = []
  const blocks = post.content
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.type !== 'h2') continue
    const next = blocks.slice(i + 1).find((x) => x.type === 'p' || x.type === 'h2')
    out.push({ id: slugify(b.text), title: b.text, lead: next && next.type === 'p' ? plainText(next.text) : '' })
  }
  return out
}
