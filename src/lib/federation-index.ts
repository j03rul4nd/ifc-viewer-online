// ─── Federation index: what a big set of files is made of ────────────────────
// A professional set is not "some IFC files": it is containers named by a
// convention (ISO 19650 / BS 1192: PROJECT-ORIGINATOR-VOLUME-LEVEL-TYPE-ROLE-
// NUMBER, plus a revision), several revisions of the same container, several
// schemas, and sizes from 200 KB to 500 MB. This module reads all of that from
// the file name and the STEP header, pure and cheap, so the Scene panel can
// filter by zone or level, stack revisions and show only the latest.

import { detectDiscipline, type Discipline } from './federation'

export interface ContainerName {
  project: string | null
  originator: string | null
  /** Volume / zone / system (ISO "volume or system"; ZZ = all). */
  zone: string | null
  /** Level / location (ISO "level"; XX = none, ZZ = multiple). */
  level: string | null
  /** Information type (M3 = 3D model, …). */
  type: string | null
  role: Discipline
  number: string | null
  /** Revision as written (P01, C02, R3, v4, rev B…), or null. */
  revision: string | null
  /** The name without its revision — what versions of one container share. */
  stackKey: string
  /** True when the name follows the ISO field pattern. */
  iso: boolean
}

const EXT = /\.(ifc|ifczip|ifcxml|frag)$/i
// Revision tokens, last-match wins: P01 / C02 / A1 (status codes), R3, v4,
// rev-B, "_rev2", and a trailing date (2026-10-26 or 20261026).
const REV_PATTERNS: RegExp[] = [
  /[-_. ]+(?:rev(?:ision)?[-_. ]?)([a-z0-9]{1,4})$/i,
  /[-_. ]+([pcab]\d{2}(?:\.\d{1,2})?)$/i,
  /[-_. ]+(v\d{1,3}(?:\.\d{1,3})?)$/i,
  /[-_. ]+(r\d{1,3})$/i,
  /[-_. ]+(\d{4}-?\d{2}-?\d{2})$/,
  /[ ]?\((\d{1,3})\)$/, // "model (2).ifc" — a browser's duplicate download
]

function splitRevision(stem: string): { base: string; revision: string | null } {
  for (const re of REV_PATTERNS) {
    const m = stem.match(re)
    if (m && m.index !== undefined && m.index > 0) return { base: stem.slice(0, m.index), revision: m[1] }
  }
  return { base: stem, revision: null }
}

const isCode = (s: string, min: number, max: number): boolean =>
  s.length >= min && s.length <= max && /^[A-Z0-9]+$/.test(s)

export function parseContainerName(fileName: string): ContainerName {
  const stem = fileName.replace(EXT, '').trim()
  const { base, revision } = splitRevision(stem)
  const fields = base.split(/[-_]/).filter(Boolean)
  const role = detectDiscipline(fileName)
  // PROJECT-ORIG-VOL-LVL-TYPE-ROLE-NUMBER: 7 fields, role a single letter,
  // number digits. Accept one extra trailing field (a suffix some CDEs add).
  const iso = (fields.length === 7 || fields.length === 8) &&
    fields.slice(0, 6).every((f) => isCode(f, 1, 6)) && /^[A-Z]$/.test(fields[5]) && /^\d{2,6}$/.test(fields[6])
  const stackKey = base.toLowerCase().replace(/[\s_.-]+/g, '-')
  if (!iso) {
    return { project: null, originator: null, zone: null, level: null, type: null, role, number: null, revision, stackKey, iso: false }
  }
  return {
    project: fields[0], originator: fields[1], zone: fields[2], level: fields[3], type: fields[4],
    role, number: fields[6], revision, stackKey, iso: true,
  }
}

/**
 * Order two revisions of the same container, oldest first.
 * Status families order WIP < shared < published: P (preliminary) before C
 * (construction) / A/B (authorised). Inside a family, by number. Unknown
 * forms fall back to natural order, then to load time.
 */
export function compareRevisions(a: string | null, b: string | null): number {
  const rank = (r: string | null): [number, number, string] => {
    if (!r) return [0, 0, '']
    const s = r.toUpperCase()
    const fam = /^P\d/.test(s) ? 1 : /^[CAB]\d/.test(s) ? 2 : 1
    const n = Number((s.match(/\d+(?:\.\d+)?/) ?? ['0'])[0].replace(/-/g, ''))
    return [fam, Number.isFinite(n) ? n : 0, s]
  }
  const [fa, na, sa] = rank(a)
  const [fb, nb, sb] = rank(b)
  return fa - fb || na - nb || sa.localeCompare(sb, undefined, { numeric: true })
}

export interface StackMember { id: string; fileName: string; loadedAt: number }

export interface VersionStack {
  key: string
  /** Oldest → newest. */
  members: Array<StackMember & { revision: string | null }>
  latestId: string
}

/** Group files that are revisions of one container. Single files are stacks of one. */
export function versionStacks(models: StackMember[]): VersionStack[] {
  const byKey = new Map<string, Array<StackMember & { revision: string | null }>>()
  for (const m of models) {
    const p = parseContainerName(m.fileName)
    byKey.set(p.stackKey, [...(byKey.get(p.stackKey) ?? []), { ...m, revision: p.revision }])
  }
  return [...byKey.entries()].map(([key, members]) => {
    members.sort((a, b) => compareRevisions(a.revision, b.revision) || a.loadedAt - b.loadedAt)
    return { key, members, latestId: members[members.length - 1].id }
  })
}

/** Ids of every file that is NOT the newest of its stack. */
export function supersededIds(models: StackMember[]): Set<string> {
  const out = new Set<string>()
  for (const s of versionStacks(models)) for (const m of s.members) if (m.id !== s.latestId) out.add(m.id)
  return out
}

// ── Schema ───────────────────────────────────────────────────────────────────

export type IfcSchema = 'IFC2X3' | 'IFC4' | 'IFC4X1' | 'IFC4X2' | 'IFC4X3' | 'other'

/** The FILE_SCHEMA in a STEP header. Reads only the first 4 KB. */
export function readSchema(buffer: ArrayBuffer | Uint8Array | null | undefined): IfcSchema | null {
  if (!buffer || buffer.byteLength === 0) return null
  const bytes = buffer instanceof Uint8Array ? buffer.subarray(0, 4096) : new Uint8Array(buffer, 0, Math.min(4096, buffer.byteLength))
  let head = ''
  for (let i = 0; i < bytes.length; i++) head += String.fromCharCode(bytes[i])
  const m = head.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)
  if (!m) return null
  const s = m[1].toUpperCase()
  if (s.startsWith('IFC2X3')) return 'IFC2X3'
  if (s.startsWith('IFC4X3')) return 'IFC4X3'
  if (s.startsWith('IFC4X2')) return 'IFC4X2'
  if (s.startsWith('IFC4X1')) return 'IFC4X1'
  if (s.startsWith('IFC4')) return 'IFC4'
  return 'other'
}

// ── Facets ───────────────────────────────────────────────────────────────────

export type FacetKind = 'discipline' | 'zone' | 'level' | 'schema' | 'version'

export interface FacetInput {
  id: string
  fileName: string
  loadedAt: number
  discipline: Discipline
  schema: IfcSchema | null
}

/** The value a model has for a facet, or null when the file does not say. */
export function facetValue(kind: FacetKind, m: FacetInput, superseded: Set<string>): string | null {
  switch (kind) {
    case 'discipline': return m.discipline
    case 'zone': return parseContainerName(m.fileName).zone
    case 'level': return parseContainerName(m.fileName).level
    case 'schema': return m.schema
    case 'version': return superseded.has(m.id) ? 'old' : 'latest'
  }
}

export interface FacetBucket { value: string; ids: string[] }

/** Buckets for one facet, in a stable order. Models with no value go to '?'. */
export function facetBuckets(kind: FacetKind, models: FacetInput[]): FacetBucket[] {
  const sup = kind === 'version' ? supersededIds(models) : new Set<string>()
  const map = new Map<string, string[]>()
  for (const m of models) {
    const v = facetValue(kind, m, sup) ?? '?'
    map.set(v, [...(map.get(v) ?? []), m.id])
  }
  return [...map.entries()]
    .map(([value, ids]) => ({ value, ids }))
    .sort((a, b) => (a.value === '?' ? 1 : b.value === '?' ? -1 : a.value.localeCompare(b.value, undefined, { numeric: true })))
}

/** Facets worth offering: those that split the set into at least two buckets. */
export function usefulFacets(models: FacetInput[]): FacetKind[] {
  const kinds: FacetKind[] = ['discipline', 'zone', 'level', 'version', 'schema']
  return kinds.filter((k) => facetBuckets(k, models).length > 1)
}
