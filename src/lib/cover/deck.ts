// ─── Deck planning ─────────────────────────────────────────────────────────────
// Turns a set of shots into the slide sequence a project presentation expects:
// cover → project sheet → the idea in one sentence → the views (one per slide,
// or two to four sharing a grid) → the model in numbers → closing. Pure, so the
// slide count shown in the UI and the one exported can't disagree.
//
// Every slide has a stable key (built from shot ids, not positions) so the
// user can hide one and it stays hidden while other shots come and go.

import type { CoverShot, CoverSpec, SlideKind } from './types'

export type ViewsPerSlide = 1 | 2 | 3 | 4

export interface DeckOptions {
  views: boolean
  data: boolean
  closing: boolean
  /** Project sheet: facts table, concept and the hero — the "ficha". */
  project: boolean
  /** The concept as a full-slide statement. */
  statement: boolean
  /** Views per slide: 1 = a full slide each; 2–4 share a slide as a grid. */
  perSlide: ViewsPerSlide
}

export const DEFAULT_DECK: DeckOptions = { views: true, data: true, closing: true, project: false, statement: false, perSlide: 1 }

export function normaliseDeck(o: Partial<DeckOptions> | null | undefined): DeckOptions {
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const per = o?.perSlide
  return {
    views: b(o?.views, DEFAULT_DECK.views),
    data: b(o?.data, DEFAULT_DECK.data),
    closing: b(o?.closing, DEFAULT_DECK.closing),
    project: b(o?.project, DEFAULT_DECK.project),
    statement: b(o?.statement, DEFAULT_DECK.statement),
    perSlide: per === 2 || per === 3 || per === 4 ? per : 1,
  }
}

export interface SlidePlan {
  /** Stable identity for hiding / selecting ("cover", "view:<shotId>"…). */
  key: string
  kind: SlideKind
  /** Shots this slide shows, primary first (indexes into the shot list). */
  shots: number[]
}

/** Every slide the options ask for, hidden ones included (the UI greys them). */
export function planDeck(shotIds: readonly string[], opts: DeckOptions): SlidePlan[] {
  const all = shotIds.map((_, i) => i)
  const plan: SlidePlan[] = [{ key: 'cover', kind: 'cover', shots: all }]
  if (opts.project) plan.push({ key: 'project', kind: 'project', shots: all })
  if (opts.statement) plan.push({ key: 'statement', kind: 'statement', shots: all })
  if (opts.views) {
    const per = Math.max(1, Math.min(4, opts.perSlide))
    for (let i = 0; i < shotIds.length; i += per) {
      const group = all.slice(i, i + per)
      plan.push(group.length === 1
        ? { key: `view:${shotIds[i]}`, kind: 'view', shots: group }
        : { key: `grid:${group.map((j) => shotIds[j]).join('+')}`, kind: 'grid', shots: group })
    }
  }
  if (opts.data) plan.push({ key: 'data', kind: 'data', shots: [] })
  if (opts.closing) plan.push({ key: 'closing', kind: 'closing', shots: all })
  return plan
}

/** The slides that export: everything not hidden (the cover never is). */
export function visibleSlides(plan: SlidePlan[], hidden: ReadonlySet<string>): SlidePlan[] {
  return plan.filter((s) => s.kind === 'cover' || !hidden.has(s.key))
}

/** Expand a plan into full specs sharing everything but kind, shots and index. */
export function specsForPlan(base: Omit<CoverSpec, 'kind' | 'index' | 'total' | 'shots'>, shots: CoverShot[], plan: SlidePlan[]): CoverSpec[] {
  return plan.map((s, i) => ({
    ...base,
    kind: s.kind,
    shots: s.shots.map((j) => shots[j]).filter(Boolean),
    index: i + 1,
    total: plan.length,
  }))
}
