// ─── IFC auto-fix ─────────────────────────────────────────────────────────────
// Rewrites an IFC file so the most frequent Health Score findings disappear:
//
//   RULE_MISSING_TYPE    → create one IfcXxxType per (class, type name) group
//                          and link the occurrences with IfcRelDefinesByType.
//   RULE_DUPLICATE_NAME  → make sibling names unique (suffix with the Tag —
//                          the authoring tool's element id — or a counter).
//
// Conservative by design: only classes whose type entity we can write
// correctly for the file's schema are touched; everything else is reported as
// "left as is". Pure and isomorphic (see step.ts).

import {
  readStep, writeStep, writeEntity, replaceEntity, appendEntities, nextId, strValue,
  type StepEntity, type StepFile, type StepValue,
} from './step'

export interface AutoFixReport {
  schema: StepFile['schema']
  missingType: { typesCreated: number; elementsLinked: number; skippedClasses: Record<string, number> }
  duplicateName: { renamed: number; groups: number }
  /** Human-readable list of what changed, for the before/after view. */
  changes: string[]
}

export interface AutoFixOptions {
  fixMissingType?: boolean
  fixDuplicateName?: boolean
  /** Injectable for deterministic tests. */
  newGuid?: () => string
}

// ── Type entities we can write safely ─────────────────────────────────────────
// Occurrence class → [type class, schemas, extra trailing args after PredefinedType].
// IfcBuildingElementType subtypes share the layout
//   (GlobalId, OwnerHistory, Name, Description, ApplicableOccurrence,
//    HasPropertySets, RepresentationMaps, Tag, ElementType, PredefinedType)
// in both IFC2X3 and IFC4. Doors/windows use IfcDoorStyle/IfcWindowStyle in
// IFC2X3, which carry construction data we cannot invent, so they are IFC4-only.

type Schema = StepFile['schema']
interface TypeSpec { type: string; label: string; schemas: Schema[]; extra: StepValue[] }

const NOTDEFINED: StepValue = { k: 'enum', v: 'NOTDEFINED' }
const NULL: StepValue = { k: 'null' }
const BOTH: Schema[] = ['IFC2X3', 'IFC4', 'IFC4X3']
const IFC4UP: Schema[] = ['IFC4', 'IFC4X3']

const TYPE_FOR: Record<string, TypeSpec> = {
  IFCWALL: { type: 'IFCWALLTYPE', label: 'IfcWallType', schemas: BOTH, extra: [] },
  IFCWALLSTANDARDCASE: { type: 'IFCWALLTYPE', label: 'IfcWallType', schemas: BOTH, extra: [] },
  IFCSLAB: { type: 'IFCSLABTYPE', label: 'IfcSlabType', schemas: BOTH, extra: [] },
  IFCBEAM: { type: 'IFCBEAMTYPE', label: 'IfcBeamType', schemas: BOTH, extra: [] },
  IFCCOLUMN: { type: 'IFCCOLUMNTYPE', label: 'IfcColumnType', schemas: BOTH, extra: [] },
  IFCMEMBER: { type: 'IFCMEMBERTYPE', label: 'IfcMemberType', schemas: BOTH, extra: [] },
  IFCPLATE: { type: 'IFCPLATETYPE', label: 'IfcPlateType', schemas: BOTH, extra: [] },
  IFCCOVERING: { type: 'IFCCOVERINGTYPE', label: 'IfcCoveringType', schemas: BOTH, extra: [] },
  IFCRAILING: { type: 'IFCRAILINGTYPE', label: 'IfcRailingType', schemas: BOTH, extra: [] },
  IFCSTAIRFLIGHT: { type: 'IFCSTAIRFLIGHTTYPE', label: 'IfcStairFlightType', schemas: BOTH, extra: [] },
  IFCDOOR: { type: 'IFCDOORTYPE', label: 'IfcDoorType', schemas: IFC4UP, extra: [NOTDEFINED, NULL, NULL] }, // OperationType, ParameterTakesPrecedence, UserDefinedOperationType
  IFCWINDOW: { type: 'IFCWINDOWTYPE', label: 'IfcWindowType', schemas: IFC4UP, extra: [NOTDEFINED, NULL, NULL] },
  IFCSTAIR: { type: 'IFCSTAIRTYPE', label: 'IfcStairType', schemas: IFC4UP, extra: [] },
  IFCROOF: { type: 'IFCROOFTYPE', label: 'IfcRoofType', schemas: IFC4UP, extra: [] },
  IFCFOOTING: { type: 'IFCFOOTINGTYPE', label: 'IfcFootingType', schemas: IFC4UP, extra: [] },
}

/** Physical elements the Health Score looks at (IfcElement subtypes we care about). */
const ELEMENT_CLASSES = new Set([
  ...Object.keys(TYPE_FOR),
  'IFCBUILDINGELEMENTPROXY', 'IFCFURNISHINGELEMENT', 'IFCFLOWSEGMENT', 'IFCFLOWTERMINAL', 'IFCFLOWFITTING',
  'IFCCURTAINWALL', 'IFCRAMP', 'IFCFOOTING', 'IFCPILE', 'IFCSTAIRFLIGHT', 'IFCRAMPFLIGHT',
])

// IfcRoot-derived occurrences: 0 GlobalId, 1 OwnerHistory, 2 Name, 3 Description, 4 ObjectType, …, Tag at 7.
const A_OWNER = 1, A_NAME = 2, A_OBJTYPE = 4, A_TAG = 7

/** "Basic Wall:Generic 200mm:348120" → "Basic Wall:Generic 200mm" (Revit appends the element id). */
export function typeNameFor(e: StepEntity): string {
  // Revit writes "Family:Type:<type element id>" into ObjectType too.
  const objectType = strValue(e.args[A_OBJTYPE]).replace(/:\d+$/, '').trim()
  if (objectType) return objectType
  const name = strValue(e.args[A_NAME]).trim()
  const stripped = name.replace(/:\d+$/, '').trim()
  if (stripped) return stripped
  return `${e.type.replace(/^IFC/, '').toLowerCase()} (untyped)`
}

const IFC_B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
function randomGuid(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // 128 bits → 22 chars: first char carries 2 bits, then 21 × 6 bits.
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ''
  for (let i = 0; i < 22; i++) { out = IFC_B64[Number(n & 63n)] + out; n >>= 6n }
  return out
}

function fixMissingType(f: StepFile, guid: () => string, report: AutoFixReport): void {
  const typed = new Set<number>()
  for (const e of f.entities.values()) {
    if (e.type !== 'IFCRELDEFINESBYTYPE') continue
    const related = e.args[4]
    if (related?.k === 'list') for (const r of related.items) if (r.k === 'ref') typed.add(r.id)
  }

  // Group untyped occurrences by (type class, type name).
  const groups = new Map<string, { spec: TypeSpec; name: string; members: StepEntity[] }>()
  for (const e of f.entities.values()) {
    if (!ELEMENT_CLASSES.has(e.type) || typed.has(e.id)) continue
    const spec = TYPE_FOR[e.type]
    if (!spec || !spec.schemas.includes(f.schema)) {
      report.missingType.skippedClasses[e.type] = (report.missingType.skippedClasses[e.type] ?? 0) + 1
      continue
    }
    const name = typeNameFor(e)
    const key = `${spec.type}|${name}`
    const g = groups.get(key) ?? { spec, name, members: [] }
    g.members.push(e)
    groups.set(key, g)
  }

  const out: string[] = []
  for (const g of groups.values()) {
    const owner = g.members[0].args[A_OWNER] ?? NULL
    const typeId = nextId(f)
    out.push(writeEntity(typeId, g.spec.type, [
      { k: 'str', v: guid() }, owner, { k: 'str', v: g.name }, NULL, NULL, NULL, NULL, NULL, NULL, NOTDEFINED, ...g.spec.extra,
    ]))
    const relId = nextId(f)
    out.push(writeEntity(relId, 'IFCRELDEFINESBYTYPE', [
      { k: 'str', v: guid() }, owner, NULL, NULL,
      { k: 'list', items: g.members.map((m) => ({ k: 'ref', id: m.id }) as StepValue) },
      { k: 'ref', id: typeId },
    ]))
    report.missingType.typesCreated++
    report.missingType.elementsLinked += g.members.length
    report.changes.push(`Created ${g.spec.label} "${g.name}" for ${g.members.length} element${g.members.length === 1 ? '' : 's'}`)
  }
  if (out.length) appendEntities(f, out)
}

function fixDuplicateNames(f: StepFile, report: AutoFixReport): void {
  // Parent of each element: its spatial container, else its aggregate.
  const parent = new Map<number, number>()
  for (const e of f.entities.values()) {
    if (e.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
      const related = e.args[4], structure = e.args[5]
      if (related?.k === 'list' && structure?.k === 'ref') for (const r of related.items) if (r.k === 'ref') parent.set(r.id, structure.id)
    }
  }
  for (const e of f.entities.values()) {
    if (e.type === 'IFCRELAGGREGATES') {
      const whole = e.args[4], parts = e.args[5]
      if (whole?.k === 'ref' && parts?.k === 'list') for (const r of parts.items) if (r.k === 'ref' && !parent.has(r.id)) parent.set(r.id, whole.id)
    }
  }

  const groups = new Map<string, StepEntity[]>()
  for (const e of f.entities.values()) {
    if (!ELEMENT_CLASSES.has(e.type) && e.type !== 'IFCSPACE') continue
    const p = parent.get(e.id)
    const name = strValue(e.args[A_NAME]).trim()
    if (p === undefined || !name) continue
    const key = `${p}|${name}`
    const g = groups.get(key) ?? []
    g.push(e)
    groups.set(key, g)
  }

  for (const [key, members] of groups) {
    if (members.length < 2) continue
    report.duplicateName.groups++
    const name = key.slice(key.indexOf('|') + 1)
    const used = new Set<string>()
    members.forEach((e, i) => {
      if (i === 0) { used.add(name); return }
      const tag = strValue(e.args[A_TAG]).trim()
      let candidate = tag ? `${name} [${tag}]` : `${name} (${i + 1})`
      let n = i + 1
      while (used.has(candidate)) candidate = `${name} (${++n})`
      used.add(candidate)
      const args = [...e.args]
      args[A_NAME] = { k: 'str', v: candidate }
      replaceEntity(f, e, args)
      report.duplicateName.renamed++
    })
    report.changes.push(`Made ${members.length} elements named "${name}" unique`)
  }
}

export function autoFixIfc(text: string, opts: AutoFixOptions = {}): { text: string; report: AutoFixReport } {
  const f = readStep(text)
  const report: AutoFixReport = {
    schema: f.schema,
    missingType: { typesCreated: 0, elementsLinked: 0, skippedClasses: {} },
    duplicateName: { renamed: 0, groups: 0 },
    changes: [],
  }
  // Types first: grouping reads the original names (Revit's "Family:Type:id").
  if (opts.fixMissingType !== false) fixMissingType(f, opts.newGuid ?? randomGuid, report)
  if (opts.fixDuplicateName !== false) fixDuplicateNames(f, report)
  return { text: writeStep(f), report }
}

