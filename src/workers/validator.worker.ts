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
import { createLogger } from '../lib/logger'

const log = createLogger('ValidatorWorker')

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
  IFCPROPERTYSINGLEVALUE,
  IFCRELASSOCIATESMATERIAL,
  IFCELEMENTQUANTITY,
  IFCQUANTITYAREA,
  IFCQUANTITYVOLUME,
  IFCQUANTITYLENGTH,
  IFCQUANTITYCOUNT,
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
    } catch (err: unknown) {
      log.warn(`RULE_NAMING_CONVENTION: invalid pattern for "${cls}": ${pat}`, err)
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
    } catch (err: unknown) {
      log.debug(`RULE_MISSING_PROPERTY_SET: failed to read pset #${psetId}:`, err)
      continue
    }

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

// ── New rules ─────────────────────────────────────────────────────────────────

const IFC_GUID_RE = /^[0-9A-Za-z_$]{22}$/

async function ruleInvalidGuidFormat(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const allTypes = [...ELEMENT_TYPES, IFCPROJECT, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCSPACE]
  for (const typeId of allTypes) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id  = ids.get(i)
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      const guid = getStr(ent.GlobalId)
      if (!guid || IFC_GUID_RE.test(guid)) continue
      issues.push({
        id: newIssueId(),
        ruleId: 'RULE_INVALID_GUID_FORMAT',
        severity: 'error',
        expressId: id,
        globalId: guid,
        ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
        elementName: getStr(ent.Name) || '(unnamed)',
        message: `GlobalId "${guid}" is not a valid IFC GUID — must be exactly 22 characters from the set [0-9A-Za-z_$].`,
        path: getSpatialPath(id, idx),
        autoFixable: true,
      })
    }
  }
  return issues
}

async function ruleSpatialHierarchy(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  const check = (
    typeId: number,
    allowedParentTypes: number[],
    message: string,
  ): void => {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id       = ids.get(i)
      const parentId = idx.aggParent.get(id)
      if (parentId === undefined) return
      const parentType = idx.entityTypes.get(parentId)
      if (parentType !== undefined && !allowedParentTypes.includes(parentType)) {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_SPATIAL_HIERARCHY',
          severity: 'error',
          expressId: id,
          globalId: getStr(ent.GlobalId),
          ifcClass: TYPE_NAME[typeId] ?? '',
          elementName: getStr(ent.Name) || '(unnamed)',
          message,
          path: getSpatialPath(id, idx),
          autoFixable: false,
        })
      }
    }
  }

  check(IFCSITE,          [IFCPROJECT],     'IfcSite must be directly under IfcProject.')
  check(IFCBUILDING,      [IFCSITE],         'IfcBuilding must be under IfcSite, not directly under IfcProject.')
  check(IFCBUILDINGSTOREY,[IFCBUILDING],     'IfcBuildingStorey must be under IfcBuilding.')
  check(IFCSPACE,         [IFCBUILDINGSTOREY, IFCSPACE], 'IfcSpace must be under IfcBuildingStorey or another IfcSpace.')

  return issues
}

async function ruleCircularReference(
  _api: IfcAPI,
  _modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const confirmed = new Set<number>()

  for (const [startId] of idx.aggParent) {
    if (confirmed.has(startId)) continue
    const visited = new Set<number>()
    let cur: number | undefined = startId
    while (cur !== undefined) {
      if (visited.has(cur)) {
        confirmed.add(startId)
        const ifcClass = TYPE_NAME[idx.entityTypes.get(startId) ?? -1] ?? 'IfcElement'
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_CIRCULAR_REFERENCE',
          severity: 'error',
          expressId: startId,
          globalId: idx.globalIds.get(startId) ?? '',
          ifcClass,
          elementName: idx.names.get(startId) ?? '(unnamed)',
          message: `Circular reference detected — element #${startId} (${ifcClass}) is its own ancestor in the aggregation tree.`,
          path: [],
          autoFixable: false,
        })
        break
      }
      visited.add(cur)
      cur = idx.aggParent.get(cur)
    }
  }
  return issues
}

async function ruleEmptyPropertyValue(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  // Build reverse map: propertySet expressId → element expressId
  const psetToElem = new Map<number, number>()
  const relPropIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)
  for (let i = 0; i < relPropIds.size(); i++) {
    const rel    = getLine<IfcRelDefByProps>(api, modelId, relPropIds.get(i))
    const psetId = getRefId(rel.RelatingPropertyDefinition)
    if (psetId === null) continue
    for (const ref of rel.RelatedObjects ?? []) {
      const elemId = getRefId(ref)
      if (elemId !== null) psetToElem.set(psetId, elemId)
    }
  }

  // Check all property sets
  const psetIds = api.GetLineIDsWithType(modelId, IFCPROPERTYSET)
  for (let i = 0; i < psetIds.size(); i++) {
    const psetId  = psetIds.get(i)
    const pset    = getLine<IfcPSet & { HasProperties?: IfcRefValue[] }>(api, modelId, psetId)
    const psetName = getStr(pset.Name)
    const elemId   = psetToElem.get(psetId)
    if (elemId === undefined) continue

    for (const propRef of pset.HasProperties ?? []) {
      const propId = getRefId(propRef)
      if (propId === null) continue
      try {
        const prop = api.GetLine(modelId, propId, false) as unknown as {
          type: number; Name?: { type: 1; value: string }; NominalValue: unknown
        }
        if (prop.type !== IFCPROPERTYSINGLEVALUE) continue
        const name = prop.Name?.value ?? ''
        const val  = prop.NominalValue
        const isEmpty = val === null || val === undefined ||
          (typeof val === 'object' && (val as { value?: unknown }).value === null) ||
          (typeof val === 'object' && (val as { value?: unknown }).value === '$') ||
          (typeof val === 'object' && typeof (val as { value?: unknown }).value === 'string' &&
           ((val as { value: string }).value.trim() === '' || (val as { value: string }).value === 'Unknown'))
        if (!isEmpty) continue
        const elem = getLine<IfcBaseEntity>(api, modelId, elemId)
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_EMPTY_PROPERTY_VALUE',
          severity: 'warning',
          expressId: elemId,
          globalId: getStr(elem.GlobalId),
          ifcClass: TYPE_NAME[elem.type] ?? 'IfcElement',
          elementName: getStr(elem.Name) || '(unnamed)',
          message: `Property "${name}" in Pset "${psetName}" has an empty or null value.`,
          path: getSpatialPath(elemId, idx),
          autoFixable: false,
        })
      } catch (err: unknown) {
        log.debug(`RULE_EMPTY_PROPERTY_VALUE: failed to read property #${propId} in pset #${psetId}:`, err)
        continue
      }
    }
  }
  return issues
}

// Structural element types that should have materials
const MATERIAL_ELEMENT_TYPES = [
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCSLABSTANDARDCASE,
  IFCBEAM, IFCBEAMSTANDARDCASE, IFCCOLUMN, IFCCOLUMNSTANDARDCASE,
  IFCROOF, IFCFOOTING, IFCPILE, IFCMEMBER, IFCPLATE,
]

async function ruleMissingMaterial(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const hasMaterial = new Set<number>()

  const matIds = api.GetLineIDsWithType(modelId, IFCRELASSOCIATESMATERIAL)
  for (let i = 0; i < matIds.size(); i++) {
    const rel = getLine<{ RelatedObjects?: IfcRefValue[] }>(api, modelId, matIds.get(i))
    for (const ref of rel.RelatedObjects ?? []) {
      const id = getRefId(ref)
      if (id !== null) hasMaterial.add(id)
    }
  }

  for (const typeId of MATERIAL_ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (hasMaterial.has(id)) continue
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      issues.push({
        id: newIssueId(),
        ruleId: 'RULE_MISSING_MATERIAL',
        severity: 'warning',
        expressId: id,
        globalId: getStr(ent.GlobalId),
        ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
        elementName: getStr(ent.Name) || '(unnamed)',
        message: `${TYPE_NAME[typeId] ?? 'Element'} has no associated material (IfcRelAssociatesMaterial).`,
        path: getSpatialPath(id, idx),
        autoFixable: false,
      })
    }
  }
  return issues
}

async function ruleElementInBuilding(
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
      if (idx.entityTypes.get(containerId) === IFCBUILDING) {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_ELEMENT_IN_BUILDING',
          severity: 'warning',
          expressId: id,
          globalId: getStr(ent.GlobalId),
          ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
          elementName: getStr(ent.Name) || '(unnamed)',
          message: 'Element is directly contained in IfcBuilding — it should be placed inside an IfcBuildingStorey.',
          path: getSpatialPath(id, idx),
          autoFixable: false,
        })
      }
    }
  }
  return issues
}

// ── Clash detection ───────────────────────────────────────────────────────────

// Structural/envelope types checked for clashes (exclude MEP and furniture)
const CLASH_ELEMENT_TYPES = [
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCSLABSTANDARDCASE,
  IFCBEAM, IFCBEAMSTANDARDCASE, IFCCOLUMN, IFCCOLUMNSTANDARDCASE,
  IFCROOF, IFCFOOTING, IFCPILE, IFCMEMBER, IFCPLATE,
]
const CLASH_ELEMENT_LIMIT = 800   // max elements to process (bounds O(n²) vertex work)
const CLASH_ISSUE_LIMIT   = 100   // max issues to report
const CLASH_PENETRATION   = 0.05  // min penetration depth in metres to report (5 cm)

interface AABB {
  minX: number; minY: number; minZ: number
  maxX: number; maxY: number; maxZ: number
  expressId: number; typeId: number
  name: string; guid: string
}

function applyMat4(x: number, y: number, z: number, m: ArrayLike<number>): [number, number, number] {
  // column-major 4×4 multiply (same convention as OpenGL / web-ifc flatTransformation)
  return [
    m[0]*x + m[4]*y + m[ 8]*z + m[12],
    m[1]*x + m[5]*y + m[ 9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ]
}

function computeAABB(api: IfcAPI, modelId: number, expressId: number): AABB | null {
  let mesh: ReturnType<IfcAPI['GetFlatMesh']>
  try { mesh = api.GetFlatMesh(modelId, expressId) } catch { return null }
  if (!mesh || mesh.geometries.size() === 0) return null

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi)
    const m = placed.flatTransformation
    let geom: ReturnType<IfcAPI['GetGeometry']>
    try { geom = api.GetGeometry(modelId, placed.geometryExpressID) } catch { continue }
    let verts: Float32Array
    try { verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize()) } catch { geom.delete(); continue }
    for (let vi = 0; vi < verts.length; vi += 6) {
      const [wx, wy, wz] = applyMat4(verts[vi], verts[vi + 1], verts[vi + 2], m)
      if (wx < minX) minX = wx; if (wx > maxX) maxX = wx
      if (wy < minY) minY = wy; if (wy > maxY) maxY = wy
      if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz
    }
    geom.delete()
  }

  if (minX === Infinity) return null
  return { minX, minY, minZ, maxX, maxY, maxZ, expressId, typeId: 0, name: '', guid: '' }
}

function aabbsClash(a: AABB, b: AABB, pen: number): boolean {
  // Require penetration > pen in all 3 axes to avoid flagging touching faces
  return a.minX + pen < b.maxX && a.maxX - pen > b.minX &&
         a.minY + pen < b.maxY && a.maxY - pen > b.minY &&
         a.minZ + pen < b.maxZ && a.maxZ - pen > b.minZ
}

async function ruleElementClash(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  // Collect structural element IDs (capped to avoid O(n²) blow-up)
  const candidates: Array<{ id: number; typeId: number }> = []
  for (const typeId of CLASH_ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      candidates.push({ id: ids.get(i), typeId })
      if (candidates.length >= CLASH_ELEMENT_LIMIT) break
    }
    if (candidates.length >= CLASH_ELEMENT_LIMIT) break
  }

  if (candidates.length < 2) return issues

  // Compute AABBs
  const boxes: AABB[] = []
  for (const { id, typeId } of candidates) {
    const box = computeAABB(api, modelId, id)
    if (!box) continue
    try {
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      box.typeId = typeId
      box.name   = getStr(ent.Name) || `#${id}`
      box.guid   = getStr(ent.GlobalId)
    } catch (err: unknown) {
      log.debug(`RULE_ELEMENT_CLASH: failed to read entity #${id} for AABB metadata:`, err)
    }
    boxes.push(box)
  }

  // O(n²) AABB intersection test — bounded by CLASH_ELEMENT_LIMIT
  const reported = new Set<string>()
  for (let i = 0; i < boxes.length && issues.length < CLASH_ISSUE_LIMIT; i++) {
    for (let j = i + 1; j < boxes.length && issues.length < CLASH_ISSUE_LIMIT; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (!aabbsClash(a, b, CLASH_PENETRATION)) continue

      // Deduplicate: report each pair only once
      const pairKey = `${Math.min(a.expressId, b.expressId)}-${Math.max(a.expressId, b.expressId)}`
      if (reported.has(pairKey)) continue
      reported.add(pairKey)

      const classA = TYPE_NAME[a.typeId] ?? 'IfcElement'
      const classB = TYPE_NAME[b.typeId] ?? 'IfcElement'
      issues.push({
        id: newIssueId(),
        ruleId: 'RULE_ELEMENT_CLASH',
        severity: 'warning',
        expressId: a.expressId,
        globalId: a.guid,
        ifcClass: classA,
        elementName: a.name,
        message: `${classA} "${a.name}" (#${a.expressId}) clashes with ${classB} "${b.name}" (#${b.expressId})`,
        path: getSpatialPath(a.expressId, idx),
        autoFixable: false,
      })
    }
  }

  return issues
}

// ── IFC schema version check ──────────────────────────────────────────────────

const KNOWN_IFC_SCHEMAS: Record<string, { label: string; current: boolean }> = {
  IFC2X3:  { label: 'IFC 2x3',   current: false },
  IFC4:    { label: 'IFC 4',     current: true  },
  IFC4X3:  { label: 'IFC 4.3',   current: true  },
  IFC4X1:  { label: 'IFC 4.1',   current: true  },
  IFC4X2:  { label: 'IFC 4.2',   current: true  },
  IFC2X2:  { label: 'IFC 2x2',   current: false },
  IFC2X:   { label: 'IFC 2x',    current: false },
  IFC1_5_1: { label: 'IFC 1.5.1', current: false },
}

function readIfcSchema(buffer: ArrayBuffer): string | null {
  // Read only the first 2 KB — the FILE_SCHEMA section is always in the header
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2048))
  const header = new TextDecoder('utf-8', { fatal: false }).decode(bytes).toUpperCase()
  const match = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)/.exec(header)
  return match ? match[1].trim() : null
}

async function ruleInvalidIfcVersion(
  buffer: ArrayBuffer,
): Promise<ValidationIssue[]> {
  const schema = readIfcSchema(buffer)
  if (!schema) {
    return [{
      id: newIssueId(),
      ruleId: 'RULE_INVALID_IFC_VERSION',
      severity: 'warning',
      expressId: 0,
      globalId: null,
      ifcClass: 'FILE_SCHEMA',
      elementName: 'FILE_SCHEMA',
      message: 'Could not determine the IFC schema version from the file header.',
      path: [],
      autoFixable: false,
    }]
  }

  const info = KNOWN_IFC_SCHEMAS[schema]
  if (!info) {
    return [{
      id: newIssueId(),
      ruleId: 'RULE_INVALID_IFC_VERSION',
      severity: 'info',
      expressId: 0,
      globalId: null,
      ifcClass: 'FILE_SCHEMA',
      elementName: 'FILE_SCHEMA',
      message: `Unrecognised IFC schema version: "${schema}". Expected IFC2X3, IFC4, or IFC4X3.`,
      path: [],
      autoFixable: false,
    }]
  }

  if (!info.current) {
    return [{
      id: newIssueId(),
      ruleId: 'RULE_INVALID_IFC_VERSION',
      severity: 'info',
      expressId: 0,
      globalId: null,
      ifcClass: 'FILE_SCHEMA',
      elementName: 'FILE_SCHEMA',
      message: `File uses ${info.label} schema. Consider upgrading to IFC4 or IFC4X3 for full feature support.`,
      path: [],
      autoFixable: false,
    }]
  }

  return []
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

    if (rules.RULE_INVALID_GUID_FORMAT)
      await runRule('RULE_INVALID_GUID_FORMAT', () => ruleInvalidGuidFormat(api!, modelId, idx))

    if (rules.RULE_SPATIAL_HIERARCHY)
      await runRule('RULE_SPATIAL_HIERARCHY', () => ruleSpatialHierarchy(api!, modelId, idx))

    if (rules.RULE_CIRCULAR_REFERENCE)
      await runRule('RULE_CIRCULAR_REFERENCE', () => ruleCircularReference(api!, modelId, idx))

    if (rules.RULE_EMPTY_PROPERTY_VALUE)
      await runRule('RULE_EMPTY_PROPERTY_VALUE', () => ruleEmptyPropertyValue(api!, modelId, idx))

    if (rules.RULE_MISSING_MATERIAL)
      await runRule('RULE_MISSING_MATERIAL', () => ruleMissingMaterial(api!, modelId, idx))

    if (rules.RULE_ELEMENT_IN_BUILDING)
      await runRule('RULE_ELEMENT_IN_BUILDING', () => ruleElementInBuilding(api!, modelId, idx))

    if (rules.RULE_INVALID_IFC_VERSION)
      await runRule('RULE_INVALID_IFC_VERSION', () => ruleInvalidIfcVersion(buffer))

    if (rules.RULE_ELEMENT_CLASH)
      await runRule('RULE_ELEMENT_CLASH', () => ruleElementClash(api!, modelId, idx))

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
      try { api.CloseModel(modelId) } catch (err: unknown) { log.debug('handleValidate: CloseModel failed:', err) }
    }
  }
}

// ── Build-tree-only handler ───────────────────────────────────────────────────

async function handleBuildTree(msg: BuildTreeMessage): Promise<void> {
  const { id, buffer } = msg

  const bufferCheck = validateIfcBuffer(buffer, 'the model buffer')
  if (!bufferCheck.ok) {
    post({ type: 'error', id, message: bufferCheck.reason! })
    return
  }

  let api: IfcAPI | null = null
  let modelId = -1

  try {
    api = new IfcAPI()
    api.SetWasmPath(
      import.meta.env.DEV
        ? `${import.meta.env.BASE_URL}node_modules/web-ifc/`
        : import.meta.env.BASE_URL,
    )
    await api.Init()
    modelId = api.OpenModel(new Uint8Array(buffer))

    const idx  = buildSpatialIndex(api, modelId)
    const tree = buildTree(api, modelId, idx)
    post({ type: 'tree',      id, tree })
    post({ type: 'tree-done', id })

  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err)
    post({ type: 'error', id, message: `Tree build failed: ${raw}` })
  } finally {
    if (api && modelId !== -1) {
      try { api.CloseModel(modelId) } catch (err: unknown) { log.debug('handleBuildTree: CloseModel failed:', err) }
    }
  }
}

// ── Quantity takeoff handler ──────────────────────────────────────────────────

// Human-readable labels for IFC classes in the takeoff panel
const TAKEOFF_LABEL: Record<string, string> = {
  IfcWall: 'Walls', IfcSlab: 'Slabs', IfcBeam: 'Beams', IfcColumn: 'Columns',
  IfcDoor: 'Doors', IfcWindow: 'Windows', IfcRoof: 'Roofs',
  IfcStair: 'Stairs', IfcStairFlight: 'Stair Flights', IfcRailing: 'Railings',
  IfcFooting: 'Footings', IfcPile: 'Piles', IfcMember: 'Members',
  IfcPlate: 'Plates', IfcCovering: 'Coverings',
  IfcFurnishingElement: 'Furniture', IfcFlowSegment: 'MEP',
  IfcPipeSegment: 'Pipes', IfcDuctSegment: 'Ducts',
  IfcSpace: 'Spaces', IfcBuildingStorey: 'Storeys',
}

interface NumericValue { type: 4; value: number }
type MaybeNum = NumericValue | null | undefined

function getNum(val: MaybeNum): number | null {
  return (val && val.type === 4) ? val.value : null
}

import type { TakeoffResult, TakeoffGroup, TakeoffQuantity } from '../types'

async function handleComputeTakeoff(msg: ComputeTakeoffMessage): Promise<void> {
  const { id, buffer } = msg
  const startTime = Date.now()

  const bufferCheck = validateIfcBuffer(buffer, 'the model buffer')
  if (!bufferCheck.ok) {
    post({ type: 'error', id, message: bufferCheck.reason! })
    return
  }

  let api: IfcAPI | null = null
  let modelId = -1

  try {
    api = new IfcAPI()
    api.SetWasmPath(
      import.meta.env.DEV
        ? `${import.meta.env.BASE_URL}node_modules/web-ifc/`
        : import.meta.env.BASE_URL,
    )
    await api.Init()
    modelId = api.OpenModel(new Uint8Array(buffer))

    // ── Count elements per class ─────────────────────────────────────
    const elementCounts = new Map<string, number>()
    for (const [hash, className] of Object.entries(TYPE_NAME)) {
      if (['IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcZone'].includes(className)) continue
      const ids = api.GetLineIDsWithType(modelId, Number(hash))
      if (ids.size() > 0) {
        elementCounts.set(className, (elementCounts.get(className) ?? 0) + ids.size())
      }
    }

    // ── Read IfcElementQuantity via IfcRelDefinesByProperties ────────
    // Map: elementExpressId → accumulated quantities per name+unit
    const elemQtys = new Map<number, Map<string, { value: number; unit: string }>>()

    const relIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)
    for (let i = 0; i < relIds.size(); i++) {
      let rel: { RelatingPropertyDefinition?: MaybeRef; RelatedObjects?: MaybeRef[] }
      try { rel = api.GetLine(modelId, relIds.get(i), false) as typeof rel } catch { continue }

      const defId = getRefId(rel.RelatingPropertyDefinition as MaybeRef)
      if (defId === null) continue

      let def: { type: number; Quantities?: MaybeRef[] }
      try { def = api.GetLine(modelId, defId, false) as typeof def } catch { continue }
      if (def.type !== IFCELEMENTQUANTITY) continue

      // Collect quantity key → { value, unit }
      const qtyMap = new Map<string, { value: number; unit: string }>()
      for (const qRef of def.Quantities ?? []) {
        const qId = getRefId(qRef as MaybeRef)
        if (qId === null) continue
        try {
          const q = api.GetLine(modelId, qId, false) as {
            type: number
            Name?: MaybeString
            AreaValue?:   MaybeNum
            VolumeValue?: MaybeNum
            LengthValue?: MaybeNum
            CountValue?:  MaybeNum
          }
          const name = getStr(q.Name)
          if (!name) continue
          let value: number | null = null
          let unit = ''
          if      (q.type === IFCQUANTITYAREA   && q.AreaValue)   { value = getNum(q.AreaValue);   unit = 'm²' }
          else if (q.type === IFCQUANTITYVOLUME  && q.VolumeValue) { value = getNum(q.VolumeValue); unit = 'm³' }
          else if (q.type === IFCQUANTITYLENGTH  && q.LengthValue) { value = getNum(q.LengthValue); unit = 'm'  }
          else if (q.type === IFCQUANTITYCOUNT   && q.CountValue)  { value = getNum(q.CountValue);  unit = ''   }
          if (value !== null) qtyMap.set(`${name}|${unit}`, { value, unit })
        } catch { continue }
      }

      // Apply to all related objects
      for (const objRef of rel.RelatedObjects ?? []) {
        const elemId = getRefId(objRef as MaybeRef)
        if (elemId === null) continue
        if (!elemQtys.has(elemId)) elemQtys.set(elemId, new Map())
        const existing = elemQtys.get(elemId)!
        for (const [key, qty] of qtyMap) {
          const prev = existing.get(key)
          existing.set(key, { value: (prev?.value ?? 0) + qty.value, unit: qty.unit })
        }
      }
    }

    // ── Aggregate quantities by IFC class ────────────────────────────
    // Map: className → Map<key, { value, unit }>
    const classQtys = new Map<string, Map<string, { value: number; unit: string }>>()

    for (const [elemId, qtys] of elemQtys) {
      let elemLine: { type: number }
      try { elemLine = api.GetLine(modelId, elemId, false) as typeof elemLine } catch { continue }
      const className = TYPE_NAME[elemLine.type]
      if (!className) continue
      if (!classQtys.has(className)) classQtys.set(className, new Map())
      const dest = classQtys.get(className)!
      for (const [key, qty] of qtys) {
        const prev = dest.get(key)
        dest.set(key, { value: (prev?.value ?? 0) + qty.value, unit: qty.unit })
      }
    }

    // ── Build result groups ──────────────────────────────────────────
    const groups: TakeoffGroup[] = []
    for (const [className, count] of elementCounts) {
      const quantities: TakeoffQuantity[] = []
      const qMap = classQtys.get(className)
      if (qMap) {
        for (const [key, { value, unit }] of qMap) {
          const name = key.split('|')[0]
          quantities.push({ name, value: Math.round(value * 100) / 100, unit })
        }
        // Sort: area first, then volume, then length, then others
        const ORDER = ['m²', 'm³', 'm', '']
        quantities.sort((a, b) => ORDER.indexOf(a.unit) - ORDER.indexOf(b.unit))
      }
      groups.push({
        ifcClass: className,
        label: TAKEOFF_LABEL[className] ?? className,
        count,
        quantities,
      })
    }
    // Sort groups: largest count first
    groups.sort((a, b) => b.count - a.count)

    const result: TakeoffResult = { groups, durationMs: Date.now() - startTime }
    post({ type: 'takeoff-done', id, result })

  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err)
    post({ type: 'error', id, message: `Takeoff computation failed: ${raw}` })
  } finally {
    if (api && modelId !== -1) {
      try { api.CloseModel(modelId) } catch (err: unknown) { log.debug('handleComputeTakeoff: CloseModel failed:', err) }
    }
  }
}

// ── Worker message handler ────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<ValidateMessage | BuildTreeMessage | ComputeTakeoffMessage>): void => {
  if (e.data.type === 'validate')        void handleValidate(e.data as ValidateMessage)
  if (e.data.type === 'build-tree')      void handleBuildTree(e.data as BuildTreeMessage)
  if (e.data.type === 'compute-takeoff') void handleComputeTakeoff(e.data as ComputeTakeoffMessage)
}

// ── Message types ─────────────────────────────────────────────────────────────

interface ValidateMessage {
  type: 'validate'
  id: string
  buffer: ArrayBuffer
  rules: RulesConfig
}

interface BuildTreeMessage {
  type: 'build-tree'
  id: string
  buffer: ArrayBuffer
}

interface ComputeTakeoffMessage {
  type: 'compute-takeoff'
  id: string
  buffer: ArrayBuffer
}

export type ValidatorOutMessage =
  | { type: 'tree';         id: string; tree: SpatialNode[] }
  | { type: 'tree-done';    id: string }
  | { type: 'partial';      id: string; ruleId: string; issues: ValidationIssue[]; progress: number }
  | { type: 'done';         id: string; result: ValidationResult }
  | { type: 'takeoff-done'; id: string; result: TakeoffResult }
  | { type: 'error';        id: string; message: string }
