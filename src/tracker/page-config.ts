// ─── Tracking page: brand kit and link data ──────────────────────────────────
// The page opens from a link anyone can edit, so this is as untrusted as the
// widget's config: only https links, literal text, and no HTML anywhere.
import { normalizeShipment, safeUrl, type Shipment, type Status } from './config'

export interface Cta { label: string; url: string }
export interface StatusMessage { headline?: string; body?: string; cta?: Cta }
export interface Product { title: string; price?: string; image?: string; url: string }
export interface PageConfig {
  tagline?: string; siteUrl?: string; supportUrl?: string; supportEmail?: string; privacyUrl?: string
  cta?: Cta; messages: Partial<Record<Status, StatusMessage>>
  promoCode?: string; promoLabel?: string; products: Product[]; reviewUrl?: string
  fontUrl?: string; beacon?: string; campaign?: string
}

const text = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
const cta = (label: unknown, url: unknown): Cta | undefined => {
  const l = text(label, 60), u = safeUrl(url)
  return l && u ? { label: l, url: u } : undefined
}
const email = (v: unknown) => typeof v === 'string' && /^[^\s@<>"?&]+@[^\s@<>"?&]+\.[^\s@<>"?&]+$/.test(v.trim()) ? v.trim() : undefined

/** One product per line: title | price | image | link. */
export function parseProducts(raw: unknown): Product[] {
  if (Array.isArray(raw)) return raw.slice(0, 4).flatMap(p => {
    const o = (p ?? {}) as Record<string, unknown>, title = text(o.title, 80), url = safeUrl(o.url)
    return title && url ? [{ title, url, price: text(o.price, 24), image: safeUrl(o.image) }] : []
  })
  if (typeof raw !== 'string') return []
  return parseProducts(raw.split(/\r?\n/).map(line => {
    const [title, price, image, url] = line.split('|').map(s => s.trim())
    return { title, price, image, url }
  }))
}

export function normalizePage(raw: unknown): PageConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const m = (o.messages && typeof o.messages === 'object' ? o.messages : {}) as Record<string, Record<string, unknown>>
  const messages: PageConfig['messages'] = {}
  for (const st of ['pending', 'transit', 'delayed', 'delivered'] as Status[]) {
    const x = m[st] ?? {}, nested = (x.cta ?? {}) as Record<string, unknown>
    const out = { headline: text(x.headline, 100), body: text(x.body, 400), cta: cta(x.ctaLabel ?? nested.label, x.ctaUrl ?? nested.url) }
    if (out.headline || out.body || out.cta) messages[st] = out
  }
  const main = (o.cta ?? {}) as Record<string, unknown>
  return {
    tagline: text(o.tagline, 140), siteUrl: safeUrl(o.siteUrl), supportUrl: safeUrl(o.supportUrl), supportEmail: email(o.supportEmail), privacyUrl: safeUrl(o.privacyUrl),
    cta: cta(o.ctaLabel ?? main.label, o.ctaUrl ?? main.url), messages,
    promoCode: text(o.promoCode, 40), promoLabel: text(o.promoLabel, 120), products: parseProducts(o.products),
    reviewUrl: safeUrl(o.reviewUrl), fontUrl: safeUrl(o.fontUrl), beacon: safeUrl(o.beacon), campaign: text(o.campaign, 80),
  }
}

/** A tag the email platform left unfilled must read as empty, not as a reference. */
export const isUnfilled = (v: string) => /^\s*$|\*\||\|\*|\{\{|\}\}|%%/.test(v)

/** Query and fragment together: some click trackers drop one or the other. */
export function linkParams(search: string, hash: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const src of [search.replace(/^\?/, ''), hash.replace(/^#/, '')]) {
    new URLSearchParams(src).forEach((v, k) => { if (!isUnfilled(v)) out[k] = v })
  }
  return out
}
export function shipmentFromLink(p: Record<string, string>): Shipment | null {
  return p.from && p.to ? normalizeShipment(p) : null
}

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/** {id} and {status} are filled in; the campaign's UTMs follow every link out. */
export function outgoing(url: string, s: { id?: string; status?: string }, p: Record<string, string>, page: PageConfig, content: string): string {
  const filled = url.replace(/\{id\}/g, encodeURIComponent(s.id ?? '')).replace(/\{status\}/g, encodeURIComponent(s.status ?? ''))
  try {
    const u = new URL(filled)
    const given: Record<string, string | undefined> = { utm_source: 'tracking_page', utm_medium: 'email', utm_campaign: page.campaign, utm_content: content }
    for (const k of UTM) { const v = p[k] ?? given[k]; if (v && !u.searchParams.has(k)) u.searchParams.set(k, v) }
    return u.href
  } catch { return filled }
}
