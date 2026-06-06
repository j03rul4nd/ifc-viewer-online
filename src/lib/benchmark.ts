// ─── benchmark.ts ─────────────────────────────────────────────────────────────
// Client for the anonymous Health Score benchmark (the "your 82 vs industry
// avg 71" line — the half that makes the number MEAN something, see
// memory/project_refocus_save_2026-06.md §4 decision 4).
//
// Privacy: this sends ONLY the integer Health Score to the Worker — no model
// data, no file name, no identifier. It is aggregate statistics, not tracking,
// and stays within the "nothing leaves the browser" invariant (the score is a
// number already computed locally; the IFC never moves). Backed by Worker KV.
//
// Both functions are defensive: if VITE_REPORT_URL isn't set, or the Worker /
// KV isn't provisioned, they no-op silently — nothing breaks.

/**
 * Minimum sample size before we show a comparison. A "vs avg" built on n=12 is
 * noise and destroys credibility — hold the comparison until the benchmark is
 * meaningful (see the gating rule in the refocus doc).
 */
export const BENCH_MIN_N = 200

export interface BenchStats {
  /** Number of scores folded into the benchmark so far. */
  n: number
  /** Mean score (rounded). Present only when n > 0. */
  avg?: number
  /** Approx median (from a 10-bin histogram). */
  p50?: number
  /** Approx 90th percentile. */
  p90?: number
  /** 10 bins: [0–9, 10–19, …, 90–100]. */
  hist?: number[]
}

/** Derive the Worker `/bench` endpoint from the report base (`…/r`). */
function benchBase(): string | undefined {
  const reportBase = import.meta.env.VITE_REPORT_URL as string | undefined
  if (!reportBase) return undefined
  return reportBase.replace(/\/(r|report)\/?$/, '/bench')
}

/**
 * Fold one Health Score into the public benchmark. Fire-and-forget: never
 * awaited, never throws, uses `keepalive` so it survives a navigation. Call
 * once per completed validation.
 */
export function postBenchmark(score: number): void {
  const base = benchBase()
  if (!base) return
  if (!Number.isFinite(score)) return
  const s = Math.max(0, Math.min(100, Math.round(score)))
  try {
    void fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: s }),
      keepalive: true,
    }).catch(() => {
      /* benchmark is best-effort — swallow network errors */
    })
  } catch {
    /* never let analytics-style calls break the app */
  }
}

/** Fetch the current benchmark aggregate, or null if unavailable. */
export async function fetchBenchmark(): Promise<BenchStats | null> {
  const base = benchBase()
  if (!base) return null
  try {
    const res = await fetch(base, { method: 'GET' })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    if (!data || typeof data !== 'object' || typeof (data as BenchStats).n !== 'number') {
      return null
    }
    return data as BenchStats
  } catch {
    return null
  }
}

/** True when the benchmark has enough data to show a trustworthy comparison. */
export function benchmarkReady(
  stats: BenchStats | null,
): stats is BenchStats & { avg: number } {
  return !!stats && stats.n >= BENCH_MIN_N && typeof stats.avg === 'number'
}
