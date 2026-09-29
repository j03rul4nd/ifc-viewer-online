// ─── TikTok sound links ────────────────────────────────────────────────────────
// Free and serverless by design: this tool is used a lot, so nothing here may
// cost per request. We never download TikTok audio — that needs a scraping
// proxy (paid, fragile, against TikTok's terms) and it is also the WORSE
// strategy for reach: a video that uses the sound inside TikTok is listed on
// the sound's page and is never muted for copyright.
//
// So the link gives us identity (title, author, cover — from TikTok's public
// oEmbed, straight from the browser) and the studio gives the timing: the edit
// is cut to the sound's beat, and the user is told where to start the sound
// when they add it in the app.

export interface SoundLink {
  url: string
  kind: 'music' | 'video' | 'short'
  title?: string
  author?: string
  cover?: string
}

const HOSTS = /(^|\.)tiktok\.com$/i

/** Recognise a TikTok music page, video or short link. Null if it is not one. */
export function parseTikTokUrl(raw: string): SoundLink | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.test(u.hostname)) return null
  const url = `https://${u.hostname}${u.pathname}`.replace(/\/$/, '')
  if (/^(vm|vt)\./i.test(u.hostname) || /^\/t\//.test(u.pathname)) return { url, kind: 'short' }
  if (/^\/music\//.test(u.pathname)) {
    // /music/<slug>-<id>: the slug is the sound's title, which is all we need offline.
    const slug = decodeURIComponent(u.pathname.split('/')[2] ?? '').replace(/-\d+$/, '').replace(/-/g, ' ').trim()
    return { url, kind: 'music', title: slug || undefined }
  }
  if (/\/video\/\d+/.test(u.pathname)) return { url, kind: 'video' }
  return null
}

/**
 * Title, author and cover from TikTok's public oEmbed. Best effort: if the
 * browser cannot reach it, the parsed link is still usable.
 */
export async function enrichTikTokLink(link: SoundLink, signal?: AbortSignal): Promise<SoundLink> {
  if (link.kind === 'music') return link // oEmbed covers videos, not sound pages
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link.url)}`, { signal })
    if (!res.ok) return link
    const j = await res.json() as { title?: string; author_name?: string; thumbnail_url?: string }
    return { ...link, title: j.title || link.title, author: j.author_name || link.author, cover: j.thumbnail_url || link.cover }
  } catch {
    return link
  }
}

/** TikTok's own, free trending-sounds ranking (Creative Center), per country. */
export function trendingSoundsUrl(country = 'ES'): string {
  return `https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en?countryCode=${encodeURIComponent(country)}&period=7`
}

/** 12.3 → "0:12" — how TikTok's sound trimmer shows the start. */
export function formatStart(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
