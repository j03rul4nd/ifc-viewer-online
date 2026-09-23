// ─── Blog topics ─────────────────────────────────────────────────────────────
// A topic is a category that has earned its own page: /blog/topic/<slug>/.
//
// Why pages and not only a filter: a filter exists only in JavaScript, so a
// search engine sees one undifferentiated list and no page that is ABOUT
// "IFC validation". A topic hub is that page — an intro, the guide to start
// with, every article in the topic, and the tools that solve its problems —
// and every article links up to it from its breadcrumb.
//
// A category only becomes a hub with MIN_TOPIC_POSTS articles in that
// language: a hub with one article is a thin page that competes with the
// article itself.

import type { BlogPost } from './blog-posts'
import { linkedSlugs } from './blog-related'

export const MIN_TOPIC_POSTS = 3

export interface TopicCopy {
  /** Page title (H1) — what someone searching the topic would type. */
  title: string
  /** One or two sentences: what the topic covers and who it helps. */
  intro: string
}

/** Written per language; a category without copy here never becomes a hub. */
const TOPIC_COPY: Record<string, Record<string, TopicCopy>> = {
  en: {
    validation: {
      title: 'IFC validation and model checking',
      intro: 'How to check an IFC model before it is delivered — schema, quality rules, IDS and the Health Score — and how to read what the checks report.',
    },
    'export-fixes': {
      title: 'Fixing broken IFC exports',
      intro: 'The export problems that get models rejected — changing or duplicate GUIDs, missing properties, wrong coordinates, oversized files — traced to their cause in Revit and other tools.',
    },
    tools: {
      title: 'IFC tools, viewers and formats compared',
      intro: 'Which viewer, checker or editor fits the job, which file format and IFC version to deliver, and how to open or read IFC without desktop software.',
    },
    delivery: {
      title: 'IFC delivery and ISO 19650',
      intro: 'Turning model quality into an agreed routine: ISO 19650 checks, BEP clauses, acceptance criteria and what to hand over with a model.',
    },
    privacy: {
      title: 'Privacy and security for BIM models',
      intro: 'What happens to a model when a tool processes it: NDA projects, GDPR, IT-security questions for vendors, and browser versus cloud processing.',
    },
    'digital-twins': {
      title: 'IFC digital twins: point clouds, LiDAR, video and maps',
      intro: 'Combining IFC with point clouds, temporal LiDAR, construction video and 3D maps in the browser — each guide with a working demo you can open.',
    },
  },
  es: {
    'digital-twins': {
      title: 'Gemelos digitales IFC: nubes de puntos, LiDAR, vídeo y mapas',
      intro: 'Cómo combinar IFC con nubes de puntos, LiDAR temporal, vídeo de obra y mapas 3D en el navegador; cada guía incluye una demo que puedes abrir.',
    },
  },
}

export interface Topic {
  slug: string
  /** Short label (the category name), for chips and breadcrumbs. */
  label: string
  copy: TopicCopy
  posts: BlogPost[]
}

export function topicsFor(posts: BlogPost[], lang: string): Topic[] {
  const copy = TOPIC_COPY[lang] ?? {}
  const bySlug = new Map<string, BlogPost[]>()
  for (const p of posts) {
    if ((p.lang ?? 'en') !== lang) continue
    bySlug.set(p.categorySlug, [...(bySlug.get(p.categorySlug) ?? []), p])
  }
  return [...bySlug.entries()]
    .filter(([slug, list]) => list.length >= MIN_TOPIC_POSTS && copy[slug])
    .map(([slug, list]) => ({ slug, label: list[0].category, copy: copy[slug], posts: list }))
    .sort((a, b) => b.posts.length - a.posts.length)
}

export function topicBySlug(posts: BlogPost[], lang: string, slug: string): Topic | undefined {
  return topicsFor(posts, lang).find((t) => t.slug === slug)
}

/**
 * How many other posts link to each post — the site's own evidence of which
 * articles are foundational. A post five others build on is where a newcomer
 * should start; that's a better signal than recency, and honest without
 * page-view data.
 */
export function inboundLinks(posts: BlogPost[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of posts) {
    for (const slug of linkedSlugs(p)) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  return counts
}

/** Most-linked posts first; ties go to the newer one. */
export function foundationalPosts(posts: BlogPost[], limit: number, pool: BlogPost[] = posts): BlogPost[] {
  const inbound = inboundLinks(pool)
  return [...posts]
    .sort((a, b) => (inbound.get(b.slug) ?? 0) - (inbound.get(a.slug) ?? 0) || b.date.localeCompare(a.date))
    .slice(0, limit)
}

// ── Freshness ───────────────────────────────────────────────────────────────

const DAY = 86_400_000
const NEW_DAYS = 30
/** An update counts only if it came well after publication. */
const UPDATE_GAP_DAYS = 14

export type Freshness = 'new' | 'updated' | null

export function freshness(post: BlogPost, today: Date): Freshness {
  const published = Date.parse(post.date)
  const modified = post.dateModified ? Date.parse(post.dateModified) : NaN
  if (today.getTime() - published <= NEW_DAYS * DAY) return 'new'
  if (Number.isFinite(modified) && modified - published >= UPDATE_GAP_DAYS * DAY && today.getTime() - modified <= 90 * DAY) return 'updated'
  return null
}

/** The date that matters to a returning reader: last update, else publication. */
export function lastTouched(post: BlogPost): string {
  return post.dateModified && post.dateModified > post.date ? post.dateModified : post.date
}

/** Newest activity first — new posts and meaningful updates together. */
export function whatsNew(posts: BlogPost[], limit: number): BlogPost[] {
  return [...posts].sort((a, b) => lastTouched(b).localeCompare(lastTouched(a))).slice(0, limit)
}
