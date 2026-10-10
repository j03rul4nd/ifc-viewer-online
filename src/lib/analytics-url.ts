// ─── analytics-url ────────────────────────────────────────────────────────────
// What a URL may say to the analytics provider. The app's links carry content:
// `?model=<another site's file>`, `?layers=<url>`, `#scene=<a whole scene,
// packed>`, `#report=<the issues of a model>`. A pageview sent the full URL —
// so all of that reached PostHog, against the promise that model content never
// leaves the browser. Kept: the origin, the path, which parameters were there
// (what features a visit used), and the values of a few that are plain
// choices from a fixed list. Dropped: every other value, and the fragment's.
//
// Pure.

/** Parameters whose values are enum choices, safe to keep. */
const KEEP_VALUES = new Set([
  'map', 'ui', 'view', 'lang', 'look', 'theme', 'embed', 'fill', 'twin',
  'utm_source', 'utm_medium', 'utm_campaign',
])

export function sanitizeAnalyticsUrl(raw: string): string {
  let u: URL
  try { u = new URL(raw) } catch { return '' }
  const params: string[] = []
  for (const [k, v] of u.searchParams) params.push(KEEP_VALUES.has(k) ? `${encodeURIComponent(k)}=${encodeURIComponent(v)}` : encodeURIComponent(k))
  // The fragment's keys only (`#scene=…` → `#scene`), the same way.
  const frag = u.hash.replace(/^#/, '')
  const fragKeys = frag ? [...new Set(frag.split('&').map((p) => p.split('=')[0]).filter(Boolean))] : []
  return `${u.origin}${u.pathname}${params.length ? `?${params.join('&')}` : ''}${fragKeys.length ? `#${fragKeys.join('&')}` : ''}`
}

/** The event properties that carry URLs. */
export const URL_PROPERTIES = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer'] as const
