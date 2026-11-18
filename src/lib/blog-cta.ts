// ─── Blog CTAs: which offer a post leads to ──────────────────────────────────
// Pure: a post (plus the interests of posts already read this session) maps to
// one interest, and each interest to one viewer link and one plans link.
// Features are named, never priced — prices live on /pricing/ only.

import { pricingPath } from './pricing/pricing-paths'
import { toolById, toolHref } from './blog-tools'

export type Interest = 'validation' | 'iso19650' | 'steel' | 'large' | 'twin' | 'open'
export type OfferKey = 'health_pro' | 'iso19650_team' | 'steel_takeoff' | 'large_models' | 'twin' | 'viewer'

export interface PostLike {
  slug: string
  title: string
  categorySlug: string
  keywords?: string[]
}

export interface BlogOffer {
  viewerHref: string
  /** Null when the interest has no paid feature to point at. */
  secondaryHref: string | null
  offerKey: OfferKey
}

const KEYWORD_RULES: Array<[RegExp, Interest]> = [
  [/steel|tekla|structural/, 'steel'],
  [/federat|large|big-file|huge|performance/, 'large'],
  [/iso-19650|iso 19650|naming|\bcde\b/, 'iso19650'],
]

const CATEGORY_RULES: Record<string, Interest> = {
  validation: 'validation',
  'digital-twins': 'twin',
  delivery: 'iso19650',
}

/** The interest of a post on its own, ignoring the session. */
export function postInterest(post: PostLike): Interest {
  const hay = [post.slug, post.title, ...(post.keywords ?? [])].join(' ').toLowerCase()
  for (const [re, interest] of KEYWORD_RULES) if (re.test(hay)) return interest
  return CATEGORY_RULES[post.categorySlug] ?? 'open'
}

/**
 * The interest to offer on this post. A generic post ('open') borrows the most
 * frequent specific interest among the posts read earlier in the session.
 */
export function resolveBlogInterest(post: PostLike, seenInterests: readonly Interest[] = []): Interest {
  const own = postInterest(post)
  if (own !== 'open') return own
  const counts = new Map<Interest, number>()
  let best: Interest = 'open'
  let bestN = 0
  for (const i of seenInterests) {
    if (i === 'open') continue
    const n = (counts.get(i) ?? 0) + 1
    counts.set(i, n)
    if (n > bestN) { best = i; bestN = n }
  }
  return best
}

const OFFER_KEY: Record<Interest, OfferKey> = {
  validation: 'health_pro',
  iso19650: 'iso19650_team',
  steel: 'steel_takeoff',
  large: 'large_models',
  twin: 'twin',
  open: 'viewer',
}

const PLAN_ROLE: Partial<Record<Interest, string>> = {
  validation: 'bim_coordinator',
  iso19650: 'bim_coordinator',
  steel: 'steel_detailer',
  large: 'bim_coordinator',
  twin: 'owner_operator',
}

export function viewerHome(lang: string): string {
  const viewer = toolById('viewer')
  return viewer ? toolHref(viewer, lang) : lang === 'en' ? '/' : `/${lang}/`
}

export function blogOffer(interest: Interest, lang: string): BlogOffer {
  const viewerHref = interest === 'steel' ? '/?steel=demo&tour=steel' : viewerHome(lang)
  const role = PLAN_ROLE[interest]
  return {
    viewerHref,
    secondaryHref: interest === 'open' ? null : `${pricingPath(lang)}${role ? `?role=${role}` : ''}`,
    offerKey: OFFER_KEY[interest],
  }
}

// ─── Session memory of read posts ─────────────────────────────────────────────

const SEEN_KEY = 'ifcv.blog.seen'
const SEEN_CAP = 20

export function getSeen(): string[] {
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY)
    const v: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(-SEEN_CAP) : []
  } catch {
    return []
  }
}

export function recordSeen(slug: string): void {
  try {
    const next = [...getSeen().filter((s) => s !== slug), slug].slice(-SEEN_CAP)
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: the CTA just stays generic */
  }
}
