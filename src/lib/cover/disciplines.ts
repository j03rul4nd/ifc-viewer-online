// ─── Disciplines of a federated set ────────────────────────────────────────────
// A coordination board shows architecture, structure and MEP side by side —
// each in its own colour, then all together. The discipline of a loaded model
// comes from, in order:
//   1. its ISO 19650 file name: Project-Originator-Volume-Level-Type-Role-Number,
//      where Role A = architect, S = structural, M/E/P = mechanical, electrical,
//      public health (the convention every UK/EU BIM execution plan uses);
//   2. common words in the name (ARQ, STRUCT, MEP, HVAC…);
//   3. what it contains: mostly beams/columns/footings → structure, mostly
//      distribution elements (ducts, pipes, cables) → MEP, otherwise architecture.
// Pure, so the guess is testable and never touches the viewer.

import { isSubtypeOf } from '../ids/ifc-hierarchy'
import { isPhysicalCategory } from './stats'

export type DisciplineId = 'arch' | 'struct' | 'mep' | 'other'

export const DISCIPLINE_ORDER: readonly DisciplineId[] = ['arch', 'struct', 'mep', 'other']

/**
 * The colours coordination software converged on: warm for architecture,
 * blue for structure, green-teal for services. Readable on white and dark.
 */
export const DISCIPLINE_COLORS: Record<DisciplineId, string> = {
  arch: '#C8693F',
  struct: '#3F6FAE',
  mep: '#2B9C82',
  other: '#8C8A84',
}

const ROLE: Record<string, DisciplineId> = {
  A: 'arch', I: 'arch', L: 'arch',
  S: 'struct', C: 'struct',
  M: 'mep', E: 'mep', P: 'mep', W: 'mep', H: 'mep',
}

const WORDS: Array<[RegExp, DisciplineId]> = [
  [/(^|[^a-z])(arq|arc|arch|architect\w*|arquitect\w*)([^a-z]|$)/i, 'arch'],
  [/(^|[^a-z])(str|est|estr\w*|struct\w*|structur\w*)([^a-z]|$)/i, 'struct'],
  [/(^|[^a-z])(mep|mech|hvac|ins|inst\w*|elec\w*|plumb\w*|fon|san|clima)([^a-z]|$)/i, 'mep'],
]

/** Discipline from an ISO 19650 name ("BCN-IVO-ZZ-XX-M3-S-0001.ifc" → struct), or null. */
export function roleFromIsoName(fileName: string): DisciplineId | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '')
  const parts = base.split('-')
  // Project-Originator-Volume-Level-Type-Role-Number (7 fields; some sets add a suffix).
  if (parts.length < 7) return null
  const role = parts[5].trim().toUpperCase()
  return role.length === 1 ? ROLE[role] ?? null : null
}

interface ModelLike {
  fileName: string
  categories: ReadonlyArray<{ id: string; count: number }>
}

/** Discipline guessed from what the model contains (physical elements only). */
export function roleFromContent(categories: ModelLike['categories']): DisciplineId {
  let structural = 0
  let services = 0
  let total = 0
  for (const c of categories) {
    if (!isPhysicalCategory(c.id)) continue
    const cls = c.id.toUpperCase()
    total += c.count
    if (isSubtypeOf(cls, 'IFCDISTRIBUTIONELEMENT')) services += c.count
    else if (/^IFC(BEAM|COLUMN|FOOTING|PILE|MEMBER|REINFORCING|TENDON)/.test(cls)) structural += c.count
  }
  if (total === 0) return 'other'
  if (services / total > 0.5) return 'mep'
  if (structural / total > 0.5) return 'struct'
  return 'arch'
}

export function disciplineOf(model: ModelLike): DisciplineId {
  return roleFromIsoName(model.fileName)
    ?? WORDS.find(([re]) => re.test(model.fileName))?.[1]
    ?? roleFromContent(model.categories)
}

export interface DisciplineGroup {
  discipline: DisciplineId
  modelIds: string[]
  fileNames: string[]
  /** Physical elements across the group's models. */
  elements: number
}

/** Visible models grouped by discipline, in the conventional A → S → MEP order. */
export function groupByDiscipline(models: ReadonlyArray<ModelLike & { id: string; visible?: boolean }>): DisciplineGroup[] {
  const groups = new Map<DisciplineId, DisciplineGroup>()
  for (const m of models) {
    if (m.visible === false) continue
    const d = disciplineOf(m)
    const g = groups.get(d) ?? { discipline: d, modelIds: [], fileNames: [], elements: 0 }
    g.modelIds.push(m.id)
    g.fileNames.push(m.fileName)
    g.elements += m.categories.filter((c) => isPhysicalCategory(c.id)).reduce((n, c) => n + c.count, 0)
    groups.set(d, g)
  }
  return DISCIPLINE_ORDER.filter((d) => groups.has(d)).map((d) => groups.get(d)!)
}
