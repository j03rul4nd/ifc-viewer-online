// ─── IFC Validator Web Worker ──────────────────────────────────────────────────
// Runs all validation rules off the main thread using web-ifc IfcAPI directly.
//
// Message protocol
// ─────────────────
// IN   { type: 'validate', id: string, buffer: ArrayBuffer, rules: RulesConfig }
//
// OUT  { type: 'tree',     id: string, tree: SpatialNode[] }
//      { type: 'partial',  id: string, ruleId: string, issues: ValidationIssue[], progress: number }
//      { type: 'done',     id: string, result: ValidationResult }
//      { type: 'error',    id: string, message: string }

import { IfcAPI } from 'web-ifc'
import type { ValidationIssue, ValidationResult, SpatialNode, SpatialElement, RulesConfig } from '../types'
import { validateIfcBuffer, assertModelId } from '../lib/ifc-guards'

// Force single-threaded WASM — nested workers (pthreads) fail inside a worker context
;((): void => {
  const _orig = IfcAPI.prototype.Init
  IfcAPI.prototype.Init = function (locateFile) {
    return _orig.call(this, locateFile, /* forceSingleThread */ true)
  }
})()

// ── IFC type constants (web-ifc numeric hashes) ───────────────────────────────

// Import numeric constants from web-ifc (these are exported as plain numbers)
import {
  IFCPROJECT,
  IFCSITE,
  IFCBUILDING,
  IFCBUILDINGSTOREY,
  IFCSPACE,
  IFCZONE,
  IFCELEMENT,
  IFCWALL,
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCSLABSTANDARDCASE,
  IFCBEAM,
  IFCBEAMSTANDARDCASE,
  IFCCOLUMN,
  IFCCOLUMNSTANDARDCASE,
  IFCDOOR,
  IFCWINDOW,
  IFCROOF,
  IFCSTAIR,
  IFCSTAIRFLIGHT,
  IFCRAILING,
  IFCFOOTING,
  IFCPILE,
  IFCFURNISHINGELEMENT,
  IFCFLOWSEGMENT,
  IFCPIPESEGMENT,
  IFCDUCTSEGMENT,
  IFCMEMBER,
  IFCPLATE,
  IFCCOVERING,
  IFCRELAGGREGATES,
  IFCRELCONTAINEDINSPATIALSTRUCTURE,
  IFCRELDEFINESBYTYPE,
  IFCRELDEFINESBYPROPERTIES,
  IFCPROPERTYSET,
} from 'web-ifc'

// ── Typed IFC entity shapes ───────────────────────────────────────────────────
// web-ifc GetLine returns objects where each attribute is an IfcValue wrapper.

interface IfcStringValue { type: 1; value: string }
interface IfcEnumValue   { type: 2; value: string }
interface IfcRefValue    { type: 5; value: number }

type MaybeString = IfcStringValue | null | undefined
type MaybeRef    = IfcRefValue    | null | undefined

interface IfcBaseEntity {
  expressID: number
  type: number
  GlobalId: IfcStringValue
  Name?: MaybeString
  LongName?: MaybeString
  Description?: MaybeString
  ObjectType?: MaybeString
}

interface IfcRelAgg {
  expressID: number; type: number
  RelatingObject: IfcRefValue
  RelatedObjects: IfcRefValue[]
}

interface IfcRelContained {
  expressID: number; type: number
  RelatingStructure: IfcRefValue
  RelatedElements: IfcRefValue[]
}

interface IfcRelDefByType {
  expressID: number; type: number
  RelatingType: IfcRefValue
  RelatedObjects: IfcRefValue[]
}

interface IfcRelDefByProps {
  expressID: number; type: number
  RelatingPropertyDefinition: IfcRefValue
  RelatedObjects: IfcRefValue[]
}

interface IfcPSet {
  expressID: number; type: number
  Name?: MaybeString
}

// ── Spatial structure type set ────────────────────────────────────────────────

const SPATIAL_TYPES = new Set([IFCPROJECT, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCSPACE])

// Physical element types to check for orphan / wrong-container rules
const ELEMENT_TYPES = [
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCSLABSTANDARDCASE,
  IFCBEAM, IFCBEAMSTANDARDCASE, IFCCOLUMN, IFCCOLUMNSTANDARDCASE,
  IFCDOOR, IFCWINDOW, IFCROOF, IFCSTAIR, IFCSTAIRFLIGHT,
  IFCRAILING, IFCFOOTING, IFCPILE, IFCFURNISHINGELEMENT,
  IFCFLOWSEGMENT, IFCPIPESEGMENT, IFCDUCTSEGMENT,
  IFCMEMBER, IFCPLATE, IFCCOVERING,
]

// IFC class name map (type hash → string used in messages and path)
const TYPE_NAME: Record<number, string> = {
  [IFCPROJECT]: 'IfcProject',
  [IFCSITE]: 'IfcSite',
  [IFCBUILDING]: 'IfcBuilding',
  [IFCBUILDINGSTOREY]: 'IfcBuildingStorey',
  [IFCSPACE]: 'IfcSpace',
  [IFCZONE]: 'IfcZone',
  [IFCWALL]: 'IfcWall',
  [IFCWALLSTANDARDCASE]: 'IfcWall',
  [IFCSLAB]: 'IfcSlab',
  [IFCSLABSTANDARDCASE]: 'IfcSlab',
  [IFCBEAM]: 'IfcBeam',
  [IFCBEAMSTANDARDCASE]: 'IfcBeam',
  [IFCCOLUMN]: 'IfcColumn',
  [IFCCOLUMNSTANDARDCASE]: 'IfcColumn',
  [IFCDOOR]: 'IfcDoor',
  [IFCWINDOW]: 'IfcWindow',
  [IFCROOF]: 'IfcRoof',
  [IFCSTAIR]: 'IfcStair',
  [IFCSTAIRFLIGHT]: 'IfcStairFlight',
  [IFCRAILING]: 'IfcRailing',
  [IFCFOOTING]: 'IfcFooting',
  [IFCPILE]: 'IfcPile',
  [IFCFURNISHINGELEMENT]: 'IfcFurnishingElement',
  [IFCFLOWSEGMENT]: 'IfcFlowSegment',
  [IFCPIPESEGMENT]: 'IfcPipeSegment',
  [IFCDUCTSEGMENT]: 'IfcDuctSegment',
  [IFCMEMBER]: 'IfcMember',
  [IFCPLATE]: 'IfcPlate',
  [IFCCOVERING]: 'IfcCovering',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStr(val: MaybeString): string {
  return val?.value ?? ''
}

function getRefId(val: MaybeRef): number | null {
  return val?.value ?? null
}

function newIssueId(): string {
  return crypto.randomUUID()
}

function getLine<T>(api: IfcAPI, modelId: number, id: number): T {
  return api.GetLine(modelId, id, false) as unknown as T
}

// ── Spatial index ─────────────────────────────────────────────────────────────

interface SpatialIndex {
  /** child expressId → parent expressId (from IfcRelAggregates) */
  aggParent: Map<number, number>
  /** parent expressId → [child expressIds] (from IfcRelAggregates) */
  aggChildren: Map<number, number[]>
  /** element expressId → container expressId (from IfcRelContainedInSpatialStructure) */
  contained: Map<number, number>
  /** container expressId → [element expressIds] */
  containerElements: Map<number, number[]>
  /** expressId → entity type hash */
  entityTypes: Map<number, number>
  /** expressId → GlobalId string */
  globalIds: Map<number, string>
  /** GlobalId → expressId (reverse map for duplicate detection) */
  guidToId: Map<string, number>
  /** expressId → name string */
  names: Map<number, string>
}

function buildSpatialIndex(api: IfcAPI, modelId: number): SpatialIndex {
  const idx: SpatialIndex = {
    aggParent:        new Map(),
    aggChildren:      new Map(),
    contained:        new Map(),
    containerElements: new Map(),
    entityTypes:      new Map(),
    globalIds:        new Map(),
    guidToId:         new Map(),
    names:            new Map(),
  }

  // ── IfcRelAggregates ─────────────────────────────────────────────────
  const aggIds = api.GetLineIDsWithType(modelId, IFCRELAGGREGATES)
  for (let i = 0; i < aggIds.size(); i++) {
    const rel = getLine<IfcRelAgg>(api, modelId, aggIds.get(i))
    const parentId = getRefId(rel.RelatingObject)
    if (parentId === null) continue

    const children = (rel.RelatedObjects ?? [])
      .map((r) => getRefId(r))
      .filter((id): id is number => id !== null)

    for (const child of children) {
      idx.aggParent.set(child, parentId)
    }

    const existing = idx.aggChildren.get(parentId) ?? []
    idx.aggChildren.set(parentId, [...existing, ...children])
  }

  // ── IfcRelContainedInSpatialStructure ────────────────────────────────
  const contIds = api.GetLineIDsWithType(modelId, IFCRELCONTAINEDINSPATIALSTRUCTURE)
  for (let i = 0; i < contIds.size(); i++) {
    const rel = getLine<IfcRelContained>(api, modelId, contIds.get(i))
    const structId = getRefId(rel.RelatingStructure)
    if (structId === null) continue

    const elems = (rel.RelatedElements ?? [])
      .map((r) => getRefId(r))
      .filter((id): id is number => id !== null)

    for (const elem of elems) {
      idx.contained.set(elem, structId)
    }

    const existing = idx.containerElements.get(structId) ?? []
    idx.containerElements.set(structId, [...existing, ...elems])
  }

  // ── Pre-load names and GUIDs for spatial structure elements ──────────
  const spatialTypeList = [IFCPROJECT, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCSPACE]
  for (const typeId of spatialTypeList) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      idx.entityTypes.set(id, typeId)
      const guid = getStr(ent.GlobalId)
      const name = getStr(ent.Name)
      idx.globalIds.set(id, guid)
      idx.names.set(id, name)
      if (guid) {
        idx.guidToId.set(guid, id)
      }
    }
  }

  return idx
}

// ── Spatial path ──────────────────────────────────────────────────────────────

function getSpatialPath(expressId: number, idx: SpatialIndex): string[] {
  const path: string[] = []
  let cur: number | undefined = idx.contained.get(expressId) ?? idx.aggParent.get(expressId)
  while (cur !== undefined) {
    const name = idx.names.get(cur) ?? `#${cur}`
    path.unshift(name)
    cur = idx.aggParent.get(cur)
  }
  return path
}

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(api: IfcAPI, modelId: number, idx: SpatialIndex): SpatialNode[] {
  const roots: SpatialNode[] = []

  const projectIds = api.GetLineIDsWithType(modelId, IFCPROJECT)
  for (let i = 0; i < projectIds.size(); i++) {
    const root = buildNode(api, modelId, projectIds.get(i), idx)
    if (root) roots.push(root)
  }

  // Fallback: sites without a project parent
  if (roots.length === 0) {
    const siteIds = api.GetLineIDsWithType(modelId, IFCSITE)
    for (let i = 0; i < siteIds.size(); i++) {
      const node = buildNode(api, modelId, siteIds.get(i), idx)
      if (node) roots.push(node)
    }
  }

  return roots
}

function buildNode(
  api: IfcAPI,
  modelId: number,
  expressId: number,
  idx: SpatialIndex,
): SpatialNode | null {
  let ent: IfcBaseEntity
  try {
    ent = getLine<IfcBaseEntity>(api, modelId, expressId)
  } catch {
    return null
  }

  const typeHash  = ent.type
  const className = TYPE_NAME[typeHash] ?? `Ifc#${typeHash}`
  const name      = getStr(ent.Name) || '(unnamed)'
  const globalId  = getStr(ent.GlobalId)

  // Recursively build spatial children (from aggregation)
  const childIds  = idx.aggChildren.get(expressId) ?? []
  const children: SpatialNode[] = []
  for (const childId of childIds) {
    if (SPATIAL_TYPES.has(idx.entityTypes.get(childId) ?? 0) ||
        api.GetLine(modelId, childId, false) !== null) {
      const child = buildNode(api, modelId, childId, idx)
      if (child) children.push(child)
    }
  }

  // Physical elements directly contained in this spatial structure node
  const rawContained = idx.containerElements.get(expressId) ?? []
  const containedElements: SpatialElement[] = rawContained.map((elemId) => {
    try {
      const elem = getLine<IfcBaseEntity>(api, modelId, elemId)
      return {
        expressId: elemId,
        globalId:  getStr(elem.GlobalId),
        ifcClass:  TYPE_NAME[elem.type] ?? `Ifc#${elem.type}`,
        name:      getStr(elem.Name) || `#${elemId}`,
      }
    } catch {
      return { expressId: elemId, globalId: '', ifcClass: 'IfcElement', name: `#${elemId}` }
    }
  })

  return {
    expressId,
    globalId,
    ifcClass: className,
    name,
    longName: getStr(ent.LongName) || undefined,
    description: getStr(ent.Description) || undefined,
    children,
    containedElements,
  }
}

// ── Rule implementations ──────────────────────────────────────────────────────

async function ruleEmptyName(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const allTypes = [
    ...ELEMENT_TYPES,
    IFCSPACE, IFCBUILDINGSTOREY, IFCBUILDING, IFCSITE,
  ]

  for (const typeId of allTypes) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id  = ids.get(i)
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      const name = getStr(ent.Name).trim()
      if (name === '') {
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_EMPTY_NAME',
          severity: 'error',
          expressId: id,
          globalId: getStr(ent.GlobalId),
          ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
          elementName: '(empty)',
          message: 'Element has no Name',
          path: getSpatialPath(id, idx),
          autoFixable: false,
        })
      }
    }
  }
  return issues
}

async function ruleEmptyLongName(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const spaceIds = api.GetLineIDsWithType(modelId, IFCSPACE)

  for (let i = 0; i < spaceIds.size(); i++) {
    const id  = spaceIds.get(i)
    const ent = getLine<IfcBaseEntity>(api, modelId, id)
    const longName = getStr(ent.LongName).trim()
    if (longName === '') {
      issues.push({
        id: newIssueId(),
        ruleId: 'RULE_EMPTY_LONGNAME',
        severity: 'warning',
        expressId: id,
        globalId: getStr(ent.GlobalId),
        ifcClass: 'IfcSpace',
        elementName: getStr(ent.Name) || '(unnamed)',
        message: 'IfcSpace has no LongName',
        path: getSpatialPath(id, idx),
        autoFixable: false,
      })
    }
  }
  return issues
}

async function ruleDuplicateName(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  // Group siblings by parent, find duplicate names
  const siblingGroups = new Map<number, Map<string, number[]>>()

  const allTypes = [...ELEMENT_TYPES, IFCSPACE, IFCBUILDINGSTOREY]
  for (const typeId of allTypes) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id     = ids.get(i)
      const parent = idx.contained.get(id) ?? idx.aggParent.get(id) ?? -1
      const ent    = getLine<IfcBaseEntity>(api, modelId, id)
      const name   = getStr(ent.Name).trim()
      if (!name) continue

      if (!siblingGroups.has(parent)) siblingGroups.set(parent, new Map())
      const nameMap = siblingGroups.get(parent)!
      const existing = nameMap.get(name) ?? []
      existing.push(id)
      nameMap.set(name, existing)
    }
  }

  for (const [, nameMap] of siblingGroups) {
    for (const [name, ids] of nameMap) {
      if (ids.length < 2) continue
      for (const id of ids) {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        const typeId = ent.type
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_DUPLICATE_NAME',
          severity: 'warning',
          expressId: id,
          globalId: getStr(ent.GlobalId),
          ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
          elementName: name,
          message: `Duplicate Name "${name}" among siblings`,
          path: getSpatialPath(id, idx),
          autoFixable: false,
        })
      }
    }
  }
  return issues
}

async function ruleNamingConvention(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
  patterns: Record<string, string>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const compiled: Array<{ className: string; regex: RegExp }> = []

  for (const [cls, pat] of Object.entries(patterns)) {
    try {
      compiled.push({ className: cls, regex: new RegExp(pat) })
    } catch {
      // Skip invalid patterns
    }
  }
  if (compiled.length === 0) return issues

  const allTypes = [...ELEMENT_TYPES, IFCSPACE, IFCZONE]
  for (const typeId of allTypes) {
    const className = TYPE_NAME[typeId] ?? ''
    const matchingRules = compiled.filter(
      (r) => r.className === className || r.className === `Ifc${className}`,
    )
    if (matchingRules.length === 0) continue

    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id  = ids.get(i)
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      const name = getStr(ent.Name).trim()
      for (const rule of matchingRules) {
        if (!rule.regex.test(name)) {
          issues.push({
            id: newIssueId(),
            ruleId: 'RULE_NAMING_CONVENTION',
            severity: 'warning',
            expressId: id,
            globalId: getStr(ent.GlobalId),
            ifcClass: className,
            elementName: name || '(empty)',
            message: `Name "${name}" does not match pattern ${rule.regex.toString()}`,
            path: getSpatialPath(id, idx),
            autoFixable: false,
          })
          break
        }
      }
    }
  }
  return issues
}

async function ruleMissingType(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const hasType = new Set<number>()

  const relTypeIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYTYPE)
  for (let i = 0; i < relTypeIds.size(); i++) {
    const rel = getLine<IfcRelDefByType>(api, modelId, relTypeIds.get(i))
    for (const ref of rel.RelatedObjects ?? []) {
      const id = getRefId(ref)
      if (id !== null) hasType.add(id)
    }
  }

  for (const typeId of ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (!hasType.has(id)) {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_MISSING_TYPE',
          severity: 'info',
          expressId: id,
          globalId: getStr(ent.GlobalId),
          ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
          elementName: getStr(ent.Name) || '(unnamed)',
          message: 'Element has no associated IfcTypeObject',
          path: getSpatialPath(id, idx),
          autoFixable: false,
        })
      }
    }
  }
  return issues
}

async function ruleDuplicateGuid(
  api: IfcAPI,
  modelId: number,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const seen = new Map<string, number>() // guid → first expressId

  const allTypes = [...ELEMENT_TYPES, ...Array.from(SPATIAL_TYPES)]
  for (const typeId of allTypes) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id  = ids.get(i)
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      const guid = getStr(ent.GlobalId)
      if (!guid) continue

      if (seen.has(guid)) {
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_DUPLICATE_GUID',
          severity: 'error',
          expressId: id,
          globalId: guid,
          ifcClass: TYPE_NAME[ent.type] ?? 'IfcElement',
          elementName: getStr(ent.Name) || '(unnamed)',
          message: `Duplicate GlobalId "${guid}" (first seen at #${seen.get(guid)})`,
          path: [],
          autoFixable: true,
        })
      } else {
        seen.set(guid, id)
      }
    }
  }
  return issues
}

async function ruleMissingPropertySet(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
  requiredPsets: Record<string, string[]>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  if (Object.keys(requiredPsets).length === 0) return issues

  // Build map: element expressId → set of its pset names
  const elemPsets = new Map<number, Set<string>>()

  const relPropIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)
  for (let i = 0; i < relPropIds.size(); i++) {
    const rel    = getLine<IfcRelDefByProps>(api, modelId, relPropIds.get(i))
    const psetId = getRefId(rel.RelatingPropertyDefinition)
    if (psetId === null) continue

    let psetName = ''
    try {
      const pset = getLine<IfcPSet>(api, modelId, psetId)
      if (pset.type === IFCPROPERTYSET) {
        psetName = getStr(pset.Name)
      }
    } catch { continue }

    for (const ref of rel.RelatedObjects ?? []) {
      const elemId = getRefId(ref)
      if (elemId === null) continue
      const set = elemPsets.get(elemId) ?? new Set<string>()
      set.add(psetName)
      elemPsets.set(elemId, set)
    }
  }

  for (const [ifcClassName, psetNames] of Object.entries(requiredPsets)) {
    // Find matching type constant
    const typeEntry = Object.entries(TYPE_NAME).find(([, n]) => n === ifcClassName)
    if (!typeEntry) continue
    const typeId = parseInt(typeEntry[0])

    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id    = ids.get(i)
      const psets = elemPsets.get(id) ?? new Set<string>()
      for (const required of psetNames) {
        if (!psets.has(required)) {
          const ent = getLine<IfcBaseEntity>(api, modelId, id)
          issues.push({
            id: newIssueId(),
            ruleId: 'RULE_MISSING_PROPERTY_SET',
            severity: 'warning',
            expressId: id,
            globalId: getStr(ent.GlobalId),
            ifcClass: ifcClassName,
            elementName: getStr(ent.Name) || '(unnamed)',
            message: `Missing required property set "${required}"`,
            path: getSpatialPath(id, idx),
            autoFixable: false,
          })
        }
      }
    }
  }
  return issues
}

async function ruleOrphanElement(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  for (const typeId of ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (!idx.contained.has(id) && !idx.aggParent.has(id)) {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_ORPHAN_ELEMENT',
          severity: 'error',
          expressId: id,
          globalId: getStr(ent.GlobalId),
          ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
          elementName: getStr(ent.Name) || '(unnamed)',
          message: 'Element is not contained in any spatial structure element',
          path: [],
          autoFixable: false,
        })
      }
    }
  }
  return issues
}

async function ruleWrongContainer(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  for (const typeId of ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id          = ids.get(i)
      const containerId = idx.contained.get(id)
      if (containerId === undefined) continue

      const containerType = idx.entityTypes.get(containerId)
      // Flag if element is directly inside IfcSite (no Building/Storey in between)
      if (containerType === IFCSITE) {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_WRONG_CONTAINER',
          severity: 'error',
          expressId: id,
          globalId: getStr(ent.GlobalId),
          ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
          elementName: getStr(ent.Name) || '(unnamed)',
          message: 'Element is directly contained in IfcSite — should be inside a Building or Storey',
          path: getSpatialPath(id, idx),
          autoFixable: false,
        })
      }
    }
  }
  return issues
}

async function ruleBrokenAggregate(
  api: IfcAPI,
  modelId: number,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const aggIds = api.GetLineIDsWithType(modelId, IFCRELAGGREGATES)

  for (let i = 0; i < aggIds.size(); i++) {
    const relId = aggIds.get(i)
    const rel   = getLine<IfcRelAgg>(api, modelId, relId)

    const checkRef = (refId: number, role: string): void => {
      try {
        const ent = api.GetLine(modelId, refId, false)
        if (!ent) throw new Error('null')
      } catch {
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_BROKEN_AGGREGATE',
          severity: 'error',
          expressId: relId,
          globalId: '',
          ifcClass: 'IfcRelAggregates',
          elementName: `IfcRelAggregates #${relId}`,
          message: `Broken IfcRelAggregates: ${role} expressId #${refId} does not exist`,
          path: [],
          autoFixable: false,
        })
      }
    }

    const parentId = getRefId(rel.RelatingObject)
    if (parentId !== null) checkRef(parentId, 'RelatingObject')

    for (const ref of rel.RelatedObjects ?? []) {
      const childId = getRefId(ref)
      if (childId !== null) checkRef(childId, 'RelatedObject')
    }
  }
  return issues
}

// ── Main validation handler ───────────────────────────────────────────────────

type PostFn = (msg: unknown, transfer?: Transferable[]) => void
const post = self.postMessage.bind(self) as PostFn

async function handleValidate(msg: ValidateMessage): Promise<void> {
  const { id, buffer, rules } = msg
  const startTime = Date.now()
  const allIssues: ValidationIssue[] = []

  // ── Pre-flight: validate the IFC buffer before attempting WASM init ────────
  // Uses the shared ifc-guards utility (same checks as the parser worker).
  const bufferCheck = validateIfcBuffer(buffer, 'the model buffer')
  if (!bufferCheck.ok) {
    post({ type: 'error', id, message: bufferCheck.reason! })
    return
  }

  // ── Pre-flight: confirm at least one rule is enabled ──────────────────────
  const enabledRules = Object.entries(rules).filter(([, v]) => v === true)
  if (enabledRules.length === 0) {
    // Nothing to do — emit an empty result rather than initialising WASM for nothing
    post({
      type: 'done',
      id,
      result: {
        issues: [],
        stats: { total: 0, errors: 0, warnings: 0, info: 0, byRule: {} },
        durationMs: 0,
      },
    })
    return
  }

  let api: IfcAPI | null = null
  let modelId = -1

  try {
    api = new IfcAPI()
    // In dev mode Vite serves node_modules directly; in prod WASM is at dist root.
    api.SetWasmPath(
      import.meta.env.DEV
        ? `${import.meta.env.BASE_URL}node_modules/web-ifc/`
        : import.meta.env.BASE_URL,
    )

    try {
      await api.Init()
    } catch (initErr: unknown) {
      throw new Error(
        `WebAssembly (web-ifc) failed to initialise: ${initErr instanceof Error ? initErr.message : String(initErr)}. ` +
        'This can happen on GitHub Pages if WASM files are not correctly served or if the browser lacks SharedArrayBuffer support.',
      )
    }

    const data = new Uint8Array(buffer)

    try {
      modelId = api.OpenModel(data)
    } catch (openErr: unknown) {
      throw new Error(
        `web-ifc could not open the model: ${openErr instanceof Error ? openErr.message : String(openErr)}. ` +
        'The IFC file may be corrupted or use an unsupported schema version.',
      )
    }

    const modelIdError = assertModelId(modelId, 'validation')
    if (modelIdError) {
      throw new Error(modelIdError)
    }

    // ── Build spatial index ──────────────────────────────────────────
    const idx = buildSpatialIndex(api, modelId)

    // ── Build and stream tree ────────────────────────────────────────
    const tree = buildTree(api, modelId, idx)
    post({ type: 'tree', id, tree })

    // ── Define enabled rules ─────────────────────────────────────────
    const totalRules = enabledRules.length
    let completedRules = 0

    const runRule = async (
      ruleId: string,
      fn: () => Promise<ValidationIssue[]>,
    ): Promise<void> => {
      const issues = await fn()
      allIssues.push(...issues)
      completedRules++
      const progress = Math.round((completedRules / totalRules) * 100)
      post({ type: 'partial', id, ruleId, issues, progress })
    }

    if (rules.RULE_EMPTY_NAME)
      await runRule('RULE_EMPTY_NAME', () => ruleEmptyName(api!, modelId, idx))

    if (rules.RULE_EMPTY_LONGNAME)
      await runRule('RULE_EMPTY_LONGNAME', () => ruleEmptyLongName(api!, modelId, idx))

    if (rules.RULE_DUPLICATE_NAME)
      await runRule('RULE_DUPLICATE_NAME', () => ruleDuplicateName(api!, modelId, idx))

    if (rules.RULE_NAMING_CONVENTION)
      await runRule('RULE_NAMING_CONVENTION', () =>
        ruleNamingConvention(api!, modelId, idx, rules.namingConventionPatterns ?? {}))

    if (rules.RULE_MISSING_TYPE)
      await runRule('RULE_MISSING_TYPE', () => ruleMissingType(api!, modelId, idx))

    if (rules.RULE_DUPLICATE_GUID)
      await runRule('RULE_DUPLICATE_GUID', () => ruleDuplicateGuid(api!, modelId))

    if (rules.RULE_MISSING_PROPERTY_SET)
      await runRule('RULE_MISSING_PROPERTY_SET', () =>
        ruleMissingPropertySet(api!, modelId, idx, rules.requiredPsets ?? {}))

    if (rules.RULE_ORPHAN_ELEMENT)
      await runRule('RULE_ORPHAN_ELEMENT', () => ruleOrphanElement(api!, modelId, idx))

    if (rules.RULE_WRONG_CONTAINER)
      await runRule('RULE_WRONG_CONTAINER', () => ruleWrongContainer(api!, modelId, idx))

    if (rules.RULE_BROKEN_AGGREGATE)
      await runRule('RULE_BROKEN_AGGREGATE', () => ruleBrokenAggregate(api!, modelId))

    // ── Compile final result ─────────────────────────────────────────
    const byRule: Record<string, number> = {}
    let errors = 0, warnings = 0, info = 0
    for (const issue of allIssues) {
      byRule[issue.ruleId] = (byRule[issue.ruleId] ?? 0) + 1
      if (issue.severity === 'error')   errors++
      else if (issue.severity === 'warning') warnings++
      else info++
    }

    const result: ValidationResult = {
      issues: allIssues,
      stats: { total: allIssues.length, errors, warnings, info, byRule },
      durationMs: Date.now() - startTime,
    }

    post({ type: 'done', id, result })

  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err)
    post({ type: 'error', id, message: `Validation failed: ${raw}` })
  } finally {
    if (api && modelId !== -1) {
      try { api.CloseModel(modelId) } catch { /* ignore cleanup errors */ }
    }
  }
}

// ── Worker message handler ────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<ValidateMessage>): void => {
  if (e.data.type === 'validate') {
    void handleValidate(e.data)
  }
}

// ── Message types ─────────────────────────────────────────────────────────────

interface ValidateMessage {
  type: 'validate'
  id: string
  buffer: ArrayBuffer
  rules: RulesConfig
}

export type ValidatorOutMessage =
  | { type: 'tree';    id: string; tree: SpatialNode[] }
  | { type: 'partial'; id: string; ruleId: string; issues: ValidationIssue[]; progress: number }
  | { type: 'done';    id: string; result: ValidationResult }
  | { type: 'error';   id: string; message: string }
