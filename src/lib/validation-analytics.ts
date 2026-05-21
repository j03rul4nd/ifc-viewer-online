// ─── Validation analytics (client-side only) ─────────────────────────────────
// Records validation runs in localStorage so users can see their own patterns.
// No data ever leaves the browser. Max 50 records; oldest entries are evicted.

const ANALYTICS_KEY = 'ifc-validator-runs'
const MAX_RECORDS   = 50

export interface ValidationRunRecord {
  timestamp:     number
  profileId:     string | null
  rulesRun:      string[]
  durationMs:    number
  issuesByRule:  Record<string, number>
  qualityScore:  number
  modelFileName: string
}

function loadRuns(): ValidationRunRecord[] {
  try {
    return JSON.parse(localStorage.getItem(ANALYTICS_KEY) ?? '[]') as ValidationRunRecord[]
  } catch { return [] }
}

export function recordValidationRun(run: ValidationRunRecord): void {
  try {
    const stored = loadRuns()
    stored.push(run)
    if (stored.length > MAX_RECORDS) stored.splice(0, stored.length - MAX_RECORDS)
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(stored))
  } catch { /* quota */ }
}

/** Returns up to N most frequently activated rule IDs across all stored runs. */
export function getMostUsedRules(topN = 5): string[] {
  const counts: Record<string, number> = {}
  for (const run of loadRuns()) {
    for (const rule of run.rulesRun) {
      counts[rule] = (counts[rule] ?? 0) + 1
    }
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([k]) => k)
}

/** Returns average quality score across all stored runs, or null if no runs yet. */
export function getAverageQualityScore(): number | null {
  const runs = loadRuns()
  if (runs.length === 0) return null
  return Math.round(runs.reduce((s, r) => s + r.qualityScore, 0) / runs.length)
}

/** Returns the last N validation runs in reverse-chronological order. */
export function getRecentRuns(n = 10): ValidationRunRecord[] {
  return loadRuns().slice(-n).reverse()
}
