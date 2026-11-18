// ─── Project facts ─────────────────────────────────────────────────────────────
// The lines of a project sheet ("ficha técnica"). Two sources, never mixed up:
//   - the model's own numbers, measured from the IFC — storeys from the
//     spatial tree, height and plan dimensions from the physical elements'
//     box, element count, the Health Score when a validation ran;
//   - the lines only the author knows (built area, status, certification,
//     team), typed in by the user.
// Nothing is estimated: a number the model can't give is simply not printed.

import type { CoverFact, CoverStats } from './types'

export type AutoFactId = 'storeys' | 'height' | 'size' | 'elements' | 'score'

export const AUTO_FACT_IDS: readonly AutoFactId[] = ['storeys', 'height', 'size', 'elements', 'score']

export const MAX_CUSTOM_FACTS = 8

export interface ModelMeasures {
  /** Storeys in the tallest model's spatial tree (federated sets repeat levels). */
  storeys: number | null
  /** Box of the physical elements, metres, Y up. */
  box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null
}

export type AutoFactToggles = Record<AutoFactId, boolean>

export const DEFAULT_AUTO_FACTS: AutoFactToggles = { storeys: true, height: true, size: false, elements: true, score: true }

function num(locale: string, v: number, digits: number): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v)
  } catch {
    return v.toFixed(digits)
  }
}

/**
 * The model's facts, in reading order. Height and dimensions under 1 m are
 * dropped: that is a component, not a building, and "0.4 m" on a cover reads
 * as a bug.
 */
export function autoFacts(
  m: ModelMeasures, stats: CoverStats, on: AutoFactToggles,
  labels: Record<AutoFactId, string>, locale: string, showScore: boolean,
): CoverFact[] {
  const out: CoverFact[] = []
  if (on.storeys && m.storeys && m.storeys > 0) out.push({ label: labels.storeys, value: num(locale, m.storeys, 0) })
  if (m.box) {
    const h = m.box.max.y - m.box.min.y
    const w = m.box.max.x - m.box.min.x
    const d = m.box.max.z - m.box.min.z
    if (on.height && h >= 1) out.push({ label: labels.height, value: `${num(locale, h, h < 20 ? 1 : 0)} m` })
    if (on.size && w >= 1 && d >= 1) out.push({ label: labels.size, value: `${num(locale, Math.max(w, d), 0)} × ${num(locale, Math.min(w, d), 0)} m` })
  }
  if (on.elements && stats.elements > 0) out.push({ label: labels.elements, value: num(locale, stats.elements, 0) })
  if (on.score && showScore && stats.score !== null) out.push({ label: labels.score, value: `${stats.score}/100` })
  return out
}

/** The user's own lines, trimmed; half-empty rows are skipped, not printed as "—". */
export function customFacts(rows: ReadonlyArray<CoverFact>): CoverFact[] {
  return rows
    .map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
    .filter((r) => r.label && r.value)
    .slice(0, MAX_CUSTOM_FACTS)
}

/** The user's lines first (they chose them), then the model's; one entry per label. */
export function mergeFacts(custom: CoverFact[], auto: CoverFact[]): CoverFact[] {
  const seen = new Set<string>()
  const out: CoverFact[] = []
  for (const f of [...custom, ...auto]) {
    const k = f.label.toLocaleLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(f)
  }
  return out
}
