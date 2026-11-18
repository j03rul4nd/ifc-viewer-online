// ─── The site's calendar day ─────────────────────────────────────────────────
// Every dated site record (progress, snags, inspections, handovers, daily
// reports) uses the local calendar date, never the UTC one: work done at
// 00:30 in Madrid belongs to that day, not the previous.

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Local day of an ISO timestamp; '' when it does not parse. */
export function localDayOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : localDate(d)
}
