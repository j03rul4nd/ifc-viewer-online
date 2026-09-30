// ─── compare/types.ts ─────────────────────────────────────────────────────────
// Version comparison of IFC models — and of SETS of models (a discipline split
// across files, a weekly delivery of 6 IFCs). Everything is keyed by GlobalId:
// express ids are renumbered by every export, the GlobalId is the only identity
// an element keeps from one version to the next.
//
// A ModelSnapshot is what one gather of one file produces. It carries the same
// normalized element records the IDS engine consumes (IdsElement), so a single
// read of a file serves three jobs: the diff, an IDS check of that version, and
// a saved baseline that next week's delivery can be compared against without
// the old file.

import type { IdsElement } from '../ids/ids-types'

export type Scalar = string | number | boolean | null

/** One element of one version. An IdsElement plus what a diff also needs. */
export interface SnapElement extends IdsElement {
  /** Name of the spatial container (storey/space/building), when known. */
  storey?: string | null
  /**
   * Geometry fingerprint. `h` hashes tessellation sizes + placement (1 mm grid)
   * so an untouched element hashes identically across exports; `c` is the
   * placement origin in metres, used to report how far a moved element went.
   * Absent when the snapshot was taken without geometry.
   */
  geo?: { h: string; c: [number, number, number] } | null
}

export interface ModelSnapshot {
  /** Stable id of this snapshot (uuid). */
  id: string
  fileName: string
  /** IFC schema the header declares (IFC2X3 / IFC4 / IFC4X3…). */
  schema: string | null
  /** IfcProject GlobalId — the strongest signal that two files are the same model. */
  projectGid: string | null
  /** When the snapshot was taken (ms epoch). */
  capturedAt: number
  /** File size in bytes, for the report. */
  sourceBytes: number
  /** Whether `geo` fingerprints were computed. */
  geometry: boolean
  /** Entities the gather could not read (partial snapshot when > 0). */
  unreadable: number
  elements: SnapElement[]
}

// ── Diff output ──────────────────────────────────────────────────────────────

export type ElementStatus = 'added' | 'removed' | 'modified' | 'unchanged'

export type ChangeCategory =
  | 'class'          // IFC class / predefined type changed
  | 'name'
  | 'attribute'      // any other root attribute (Description, Tag, ObjectType…)
  | 'property'       // pset / qto value added, removed or changed
  | 'material'
  | 'classification'
  | 'container'      // moved to another storey / space
  | 'geometry'       // shape changed
  | 'placement'      // same shape, moved
  | 'file'           // element now lives in another file of the set

export const CHANGE_CATEGORIES: readonly ChangeCategory[] = [
  'class', 'name', 'attribute', 'property', 'material', 'classification',
  'container', 'geometry', 'placement', 'file',
]

export interface FieldChange {
  category: ChangeCategory
  /** Attribute name, "Pset.Property", material name… Empty for whole-element changes. */
  key: string
  before: Scalar | string[] | undefined
  after: Scalar | string[] | undefined
}

export interface ElementDiff {
  globalId: string
  status: ElementStatus
  ifcClass: string
  name: string | null
  storey: string | null
  /** Which snapshot (file) the element lives in, in each version. */
  baseFile?: string
  headFile?: string
  /** Express id in the head version (for picking in the viewer); base id for removed. */
  baseExpressId?: number
  headExpressId?: number
  changes: FieldChange[]
  /** Metres the placement origin moved, when geometry was compared. */
  moveDistance?: number
}

export interface DiffCounts {
  added: number
  removed: number
  modified: number
  unchanged: number
}

export interface FilePairing {
  base: string | null
  head: string | null
  /** How the pairing was decided — shown to the user so a wrong match is visible. */
  reason: 'project' | 'guid-overlap' | 'file-name' | 'unmatched'
  /** Share of GlobalIds the two files have in common (0–1), when both exist. */
  overlap: number
  counts: DiffCounts
}

export interface SetDiff {
  baseLabel: string
  headLabel: string
  createdAt: number
  counts: DiffCounts
  byClass: Record<string, DiffCounts>
  byStorey: Record<string, DiffCounts>
  byCategory: Record<ChangeCategory, number>
  files: FilePairing[]
  /** Every element that is not unchanged, sorted: removed, added, modified. */
  elements: ElementDiff[]
  /** GlobalIds seen more than once inside one version (they cannot be diffed reliably). */
  duplicateGuids: { base: number; head: number }
  /** Whether geometry was compared (both sides have fingerprints). */
  geometryCompared: boolean
}

export interface DiffOptions {
  /** Placement moves below this many metres are ignored (default 0.001). */
  moveTolerance?: number
  /** Relative tolerance for numeric property values (default 1e-6). */
  numericTolerance?: number
  /** Pset names ignored entirely (authoring-tool noise such as timestamps). */
  ignorePsets?: string[]
  /** Root attributes ignored (default: GlobalId, OwnerHistory-derived noise). */
  ignoreAttributes?: string[]
}
