// ─── compare/revision-types.ts ────────────────────────────────────────────────
// Contract of revision compare (spec 10 §3.5). Only additions over types.ts:
// diffSnapshotSets and the current UI keep working unchanged.
//
// Everything here is plain data (structured-clone / JSON safe) so a diff can be
// computed in a worker, stored in IndexedDB and exported without conversion.

import type { DiffOptions, ElementDiff, ModelSnapshot, SetDiff, SnapElement } from './types'

export type MatchMethod = 'guid' | 'tag' | 'geometry' | 'split' | 'merge' | 'none'
export type ChangeKind =
  | 'added' | 'removed' | 'moved' | 'reshaped' | 'type_changed'
  | 'properties_changed' | 'relations_changed' | 'unchanged'

/** Priority order: the first kind an element has is its `kind`. */
export const CHANGE_KIND_PRIORITY: readonly ChangeKind[] = [
  'removed', 'added', 'type_changed', 'reshaped', 'moved',
  'relations_changed', 'properties_changed', 'unchanged',
]

/** Vectors and sizes in IFC axes: x east, y north, z up (not the Y-up mesh frame of `geo.c`). */
export interface GeoDelta {
  /** metres, after origin correction */
  move?: [number, number, number]
  moveDistance?: number
  /** 'N'|'NE'|…|'up'|'down' — for site wording */
  direction?: string
  sizeBefore?: [number, number, number]
  sizeAfter?: [number, number, number]
  volumeBefore?: number
  volumeAfter?: number
  rotationDeg?: number
}

export interface RevisionChange extends ElementDiff {
  kind: ChangeKind
  kinds: ChangeKind[]
  match: { method: MatchMethod; confidence: number; baseGlobalIds: string[]; headGlobalIds: string[] }
  delta?: GeoDelta
  /** short, localisable site sentence key + params, e.g. moved_mm {mm:120, dir:'E'} */
  summary: { key: string; params: Record<string, string | number> }
  /** user-set; persisted locally, never uploaded */
  review?: 'pending' | 'reviewed' | 'affects_site'
}

export interface RevisionDiff extends Omit<SetDiff, 'elements'> {
  version: 1
  options: Required<RevisionOptions>
  /** Whole-model translation in IFC axes (metres), already removed before classifying. */
  originShift: [number, number, number] | null
  guidRegenerated: boolean
  byKind: Record<ChangeKind, number>
  changes: RevisionChange[]
  /**
   * Matched elements whose fingerprint hash changed while size, volume and
   * position stayed within tolerance (re-tessellation). Counted as unchanged.
   * Addition over spec §3.5.
   */
  noise?: number
}

export interface RevisionOptions extends DiffOptions {
  sizeTolerance?: number
  volumeTolerance?: number
  angleTolerance?: number
  matchRadius?: number
  /** Pset.Property names treated as piece marks (layer 2 + filter) */
  markProperties?: string[]
}

// ── Extension points (additions over spec §3.5) ──────────────────────────────

/** One element of one version, with the file of the set it lives in. */
export interface LocatedElement { el: SnapElement; file: string }

/** A pairing an extra matcher proposes. 1:1, or 1:N / N:1 for split / merge. */
export interface MatchPair {
  base: LocatedElement[]
  head: LocatedElement[]
  method: MatchMethod
  confidence: number
}

export interface MatcherContext {
  options: Required<RevisionOptions>
  /**
   * Translation detected from the GlobalId layer, in the snapshot's mesh frame
   * (the frame of `geo.c`, Y-up): subtract it from head positions.
   */
  originShift: [number, number, number] | null
  schema: { base: string | null; head: string | null }
}

/**
 * Layers 3+ (geometry, split/merge — T2). Called in order on what is still
 * unmatched after the previous layers; each returned pair removes its elements
 * from the pool. Must be pure.
 */
export type ExtraMatcher = (
  unmatchedBase: readonly LocatedElement[],
  unmatchedHead: readonly LocatedElement[],
  ctx: MatcherContext,
) => MatchPair[]

export interface RevisionContext {
  labels?: { base: string; head: string }
  extraMatchers?: ExtraMatcher[]
}

export type DiffRevisionsFn = (
  base: readonly ModelSnapshot[], head: readonly ModelSnapshot[],
  opts?: RevisionOptions, ctx?: RevisionContext,
) => RevisionDiff
