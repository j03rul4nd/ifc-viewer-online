// ─── url-template ─────────────────────────────────────────────────────────────
// Time windows in a source URL. Many APIs only answer fast for a window
// ("readings since 2 h ago": Socrata, FMI's WFS, SensorThings), and a saved
// URL cannot hold "2 h ago" — it would freeze at the moment it was saved.
// So the URL keeps a token and the token is resolved at each fetch:
//
//   {now}               2026-10-09T18:30:00Z        (ISO, UTC, no milliseconds)
//   {now-2h}            two hours earlier            units s m h d
//   {now-2h:floating}   2026-10-09T16:30:00          (UTC without the Z — Socrata's
//                                                      floating timestamps)
//   {now:date}          2026-10-09
//   {now:epoch}         1791563400                   (seconds)
//   {now:epochms}       1791563400000
//
// Tokens also work percent-encoded (%7Bnow-2h%7D), which is how they come back
// after a URL has been through URLSearchParams.
//
// Pure.

const TOKEN = /(?:\{|%7B)now(?:([+-])(\d+)([smhd]))?(?::(iso|floating|date|epoch|epochms))?(?:\}|%7D)/gi
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }

export function hasUrlTemplate(url: string): boolean {
  TOKEN.lastIndex = 0
  return TOKEN.test(url)
}

export function expandUrlTemplate(url: string, now = Date.now()): string {
  TOKEN.lastIndex = 0
  return url.replace(TOKEN, (_m, sign: string | undefined, n: string | undefined, unit: string | undefined, fmt: string | undefined) => {
    const delta = sign && n && unit ? Number(n) * UNIT_MS[unit.toLowerCase()] * (sign === '-' ? -1 : 1) : 0
    const t = new Date(now + delta)
    const iso = t.toISOString().replace(/\.\d{3}Z$/, 'Z')
    switch ((fmt ?? 'iso').toLowerCase()) {
      case 'floating': return encodeURIComponent(iso.slice(0, -1))
      case 'date': return iso.slice(0, 10)
      case 'epoch': return String(Math.floor(t.getTime() / 1000))
      case 'epochms': return String(t.getTime())
      default: return encodeURIComponent(iso)
    }
  })
}
