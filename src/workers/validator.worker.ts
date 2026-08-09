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
import { collectPortedElements } from '../lib/ifc-ports'
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
  IFCRELASSOCIATESCLASSIFICATION,
  IFCRELASSIGNSTOGROUP,
  IFCSYSTEM,
  IFCMATERIALLAYERSETUSAGE,
  IFCFLOWFITTING,
  IFCFLOWTERMINAL,
  IFCFLOWCONTROLLER,
  IFCFLOWMOVINGDEVICE,
  IFCFLOWTREATMENTDEVICE,
  IFCFLOWSTORAGEDEVICE,
  IFCBUILDINGELEMENTPROXY,
  IFCOPENINGELEMENT,
  IFCRELVOIDSELEMENT,
  IFCPROPERTYENUMERATEDVALUE,
  IFCSIUNIT,
  IFCCONVERSIONBASEDUNIT,
  IFCUNITASSIGNMENT,
  IFCPERSON,
  IFCORGANIZATION,
} from 'web-ifc'
import { cobieSheetFor, type CobieSheet } from '../lib/cobie/cobie-mapping'
import type { CobieRow, CobieExtractResult } from '../lib/worker-schemas'

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
  [IFCFLOWFITTING]: 'IfcFlowFitting',
  [IFCFLOWTERMINAL]: 'IfcFlowTerminal',
  [IFCFLOWCONTROLLER]: 'IfcFlowController',
  [IFCFLOWMOVINGDEVICE]: 'IfcFlowMovingDevice',
  [IFCFLOWTREATMENTDEVICE]: 'IfcFlowTreatmentDevice',
  [IFCFLOWSTORAGEDEVICE]: 'IfcFlowStorageDevice',
  [IFCBUILDINGELEMENTPROXY]: 'IfcBuildingElementProxy',
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
    try {
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
    } catch { /* corrupt IfcRelAggregates — skip this relation */ }
  }

  // ── IfcRelContainedInSpatialStructure ────────────────────────────────
  const contIds = api.GetLineIDsWithType(modelId, IFCRELCONTAINEDINSPATIALSTRUCTURE)
  for (let i = 0; i < contIds.size(); i++) {
    try {
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
    } catch { /* corrupt IfcRelContainedInSpatialStructure — skip */ }
  }

  // ── Pre-load names and GUIDs for spatial structure elements ──────────
  const spatialTypeList = [IFCPROJECT, IFCSITE, IFCBUILDING, IFCBUILDINGSTOREY, IFCSPACE]
  for (const typeId of spatialTypeList) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        idx.entityTypes.set(id, typeId)
        const guid = getStr(ent.GlobalId)
        const name = getStr(ent.Name)
        idx.globalIds.set(id, guid)
        idx.names.set(id, name)
        if (guid) idx.guidToId.set(guid, id)
      } catch { /* corrupt spatial entity — register type only */ }
    }
  }

  return idx
}

// ── Spatial path ──────────────────────────────────────────────────────────────

function getSpatialPath(expressId: number, idx: SpatialIndex): string[] {
  const path: string[] = []
  // Guard against circular aggregations (which RULE_CIRCULAR_REFERENCE reports):
  // without this, a cyclic aggParent chain would loop forever and hang the worker.
  const visited = new Set<number>([expressId])
  let cur: number | undefined = idx.contained.get(expressId) ?? idx.aggParent.get(expressId)
  while (cur !== undefined && !visited.has(cur)) {
    visited.add(cur)
    path.unshift(idx.names.get(cur) ?? `#${cur}`)
    cur = idx.aggParent.get(cur)
  }
  return path
}

// ── Decomposition map builder ─────────────────────────────────────────────────
// Returns physical-element parent→children pairs from IfcRelAggregates.
// Spatial structure elements (project/site/building/storey/space) are excluded
// because they're already represented in the tree hierarchy.
function buildDecompMap(idx: SpatialIndex): [number, number[]][] {
  const result: [number, number[]][] = []
  for (const [parentId, childIds] of idx.aggChildren) {
    if (SPATIAL_TYPES.has(idx.entityTypes.get(parentId) ?? 0)) continue
    if (childIds.length > 0) result.push([parentId, childIds])
  }
  return result
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
  visited: Set<number> = new Set(),
): SpatialNode | null {
  // Guard against circular aggregations: without this, a cyclic aggChildren
  // graph would recurse until the worker's call stack overflows.
  if (visited.has(expressId)) return null
  visited.add(expressId)

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
      const child = buildNode(api, modelId, childId, idx, visited)
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
      const id = ids.get(i)
      try {
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
      } catch { /* corrupt entity — skip */ }
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

  // IfcSpace — warning (LongName carries room usage)
  const spaceIds = api.GetLineIDsWithType(modelId, IFCSPACE)
  for (let i = 0; i < spaceIds.size(); i++) {
    const id = spaceIds.get(i)
    try {
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      if (getStr(ent.LongName).trim() === '') {
        issues.push({
          id: newIssueId(), ruleId: 'RULE_EMPTY_LONGNAME', severity: 'warning',
          expressId: id, globalId: getStr(ent.GlobalId), ifcClass: 'IfcSpace',
          elementName: getStr(ent.Name) || '(unnamed)',
          message: 'IfcSpace has no LongName',
          path: getSpatialPath(id, idx), autoFixable: false,
        })
      }
    } catch { /* corrupt entity — skip */ }
  }

  // IfcBuildingStorey + IfcBuilding — info (floor/building label useful for documentation)
  for (const [typeId, className] of [
    [IFCBUILDINGSTOREY, 'IfcBuildingStorey'],
    [IFCBUILDING, 'IfcBuilding'],
  ] as const) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        if (getStr(ent.LongName).trim() === '') {
          issues.push({
            id: newIssueId(), ruleId: 'RULE_EMPTY_LONGNAME', severity: 'info',
            expressId: id, globalId: getStr(ent.GlobalId), ifcClass: className,
            elementName: getStr(ent.Name) || '(unnamed)',
            message: `${className} has no LongName`,
            path: getSpatialPath(id, idx), autoFixable: false,
          })
        }
      } catch { /* corrupt entity — skip */ }
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
      const id = ids.get(i)
      try {
        // Skip elements with no resolved parent: "duplicate name among siblings"
        // is meaningless without a real shared parent, and grouping every orphan
        // under a synthetic key would flag unrelated elements as duplicates.
        // Orphans are reported separately by RULE_ORPHAN_ELEMENT.
        const parent = idx.contained.get(id) ?? idx.aggParent.get(id)
        if (parent === undefined) continue
        const ent  = getLine<IfcBaseEntity>(api, modelId, id)
        const name = getStr(ent.Name).trim()
        if (!name) continue

        if (!siblingGroups.has(parent)) siblingGroups.set(parent, new Map())
        const nameMap = siblingGroups.get(parent)!
        const existing = nameMap.get(name) ?? []
        existing.push(id)
        nameMap.set(name, existing)
      } catch { /* corrupt entity — skip */ }
    }
  }

  for (const [, nameMap] of siblingGroups) {
    for (const [name, ids] of nameMap) {
      if (ids.length < 2) continue
      for (const id of ids) {
        try {
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
        } catch { /* corrupt entity — skip */ }
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
      const id = ids.get(i)
      try {
        const ent  = getLine<IfcBaseEntity>(api, modelId, id)
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
      } catch { /* corrupt entity — skip */ }
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
    try {
      const rel = getLine<IfcRelDefByType>(api, modelId, relTypeIds.get(i))
      for (const ref of rel.RelatedObjects ?? []) {
        const id = getRefId(ref)
        if (id !== null) hasType.add(id)
      }
    } catch { /* corrupt relation — skip */ }
  }

  for (const typeId of ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (!hasType.has(id)) {
        try {
          const ent = getLine<IfcBaseEntity>(api, modelId, id)
          issues.push({
            id: newIssueId(),
            ruleId: 'RULE_MISSING_TYPE',
            severity: 'warning',
            expressId: id,
            globalId: getStr(ent.GlobalId),
            ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
            elementName: getStr(ent.Name) || '(unnamed)',
            message: 'Element has no associated IfcTypeObject',
            path: getSpatialPath(id, idx),
            autoFixable: false,
          })
        } catch { /* corrupt entity — skip */ }
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
      const id = ids.get(i)
      try {
        const ent  = getLine<IfcBaseEntity>(api, modelId, id)
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
      } catch { /* corrupt entity — skip */ }
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
    // Collect every type constant that maps to this class name. Several IFC
    // constants share a name (e.g. IFCWALL and IFCWALLSTANDARDCASE both →
    // 'IfcWall'), so matching only the first would silently skip the *Case
    // variants — which are the default export in many authoring tools.
    const typeIds = Object.entries(TYPE_NAME)
      .filter(([, n]) => n === ifcClassName)
      .map(([k]) => parseInt(k))
    if (typeIds.length === 0) continue

    for (const typeId of typeIds) {
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
        try {
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
        } catch { /* corrupt entity — skip */ }
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
        try {
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
        } catch { /* corrupt entity — skip */ }
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
      const id = ids.get(i)
      try {
        const ent  = getLine<IfcBaseEntity>(api, modelId, id)
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
      } catch { /* corrupt entity — skip */ }
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
      if (parentId === undefined) continue
      const parentType = idx.entityTypes.get(parentId)
      if (parentType !== undefined && !allowedParentTypes.includes(parentType)) {
        try {
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
        } catch { /* corrupt entity — skip */ }
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

// Aggregate by (pset-name, property-name) to avoid flooding the panel on
// Revit / ArchiCAD exports where every instance owns a distinct pset copy.
// One issue per distinct (pset, property) pair, with count of affected elements.
const EMPTY_PROP_MAX_KEYS = 50   // max distinct (pset, prop) pairs to surface

async function ruleEmptyPropertyValue(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  // Build psetId → { first elemId, count of elements using this pset instance }
  const psetMeta = new Map<number, { first: number; count: number }>()
  const relPropIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)
  for (let i = 0; i < relPropIds.size(); i++) {
    const rel    = getLine<IfcRelDefByProps>(api, modelId, relPropIds.get(i))
    const psetId = getRefId(rel.RelatingPropertyDefinition)
    if (psetId === null) continue
    for (const ref of rel.RelatedObjects ?? []) {
      const elemId = getRefId(ref)
      if (elemId === null) continue
      const existing = psetMeta.get(psetId)
      if (existing) existing.count++
      else psetMeta.set(psetId, { first: elemId, count: 1 })
    }
  }

  // Aggregate empty properties by (pset-name, property-name)
  type AggEntry = { psetName: string; propName: string; count: number; firstElemId: number }
  const byKey = new Map<string, AggEntry>()

  const psetIds = api.GetLineIDsWithType(modelId, IFCPROPERTYSET)
  for (let i = 0; i < psetIds.size(); i++) {
    const psetId  = psetIds.get(i)
    const meta    = psetMeta.get(psetId)
    if (!meta) continue

    const pset     = getLine<IfcPSet & { HasProperties?: IfcRefValue[] }>(api, modelId, psetId)
    const psetName = getStr(pset.Name) ?? '(unnamed pset)'

    for (const propRef of pset.HasProperties ?? []) {
      const propId = getRefId(propRef)
      if (propId === null) continue
      try {
        const prop = api.GetLine(modelId, propId, false) as unknown as {
          type: number
          Name?: { type: 1; value: string }
          NominalValue: unknown
          EnumerationValues?: unknown[] | null
        }

        let name = ''
        let isEmpty = false

        if (prop.type === IFCPROPERTYSINGLEVALUE) {
          name = prop.Name?.value ?? ''
          const val = prop.NominalValue
          isEmpty =
            val === null || val === undefined ||
            (typeof val === 'object' && (val as { value?: unknown }).value === null) ||
            (typeof val === 'object' && (val as { value?: unknown }).value === '$') ||
            (typeof val === 'object' && typeof (val as { value?: unknown }).value === 'string' &&
              ((val as { value: string }).value.trim() === '' ||
               (val as { value: string }).value === 'Unknown'))
        } else if (prop.type === IFCPROPERTYENUMERATEDVALUE) {
          name = prop.Name?.value ?? ''
          const ev = prop.EnumerationValues
          isEmpty = ev === null || ev === undefined || (Array.isArray(ev) && ev.length === 0)
        } else {
          continue
        }

        if (!isEmpty) continue

        const key      = `${psetName}||${name}`
        const existing = byKey.get(key)
        if (existing) existing.count += meta.count
        else byKey.set(key, { psetName, propName: name, count: meta.count, firstElemId: meta.first })
      } catch (err: unknown) {
        log.debug(`RULE_EMPTY_PROPERTY_VALUE: failed to read property #${propId} in pset #${psetId}:`, err)
        continue
      }
    }
  }

  const issues: ValidationIssue[] = []
  let skipped = 0

  for (const [, agg] of byKey) {
    if (issues.length >= EMPTY_PROP_MAX_KEYS) { skipped++; continue }
    const { psetName, propName, count, firstElemId } = agg
    const elem   = getLine<IfcBaseEntity>(api, modelId, firstElemId)
    const suffix = count > 1 ? ` (${count} elements)` : ''
    issues.push({
      id: newIssueId(),
      ruleId: 'RULE_EMPTY_PROPERTY_VALUE',
      severity: 'warning',
      expressId: firstElemId,
      globalId:    getStr(elem.GlobalId),
      ifcClass:    TYPE_NAME[elem.type] ?? 'IfcElement',
      elementName: count > 1 ? `(${count} elements)` : (getStr(elem.Name) || '(unnamed)'),
      message:     `Property "${propName}" in Pset "${psetName}" has an empty or null value${suffix}.`,
      path: getSpatialPath(firstElemId, idx),
      autoFixable: false,
    })
  }

  if (skipped > 0) {
    issues.push({
      id: newIssueId(),
      ruleId: 'RULE_EMPTY_PROPERTY_VALUE',
      severity: 'info',
      expressId: 0, globalId: null,
      ifcClass: 'IfcProject', elementName: '(model)',
      message: `${skipped} more distinct empty property field${skipped > 1 ? 's' : ''} found — showing first ${EMPTY_PROP_MAX_KEYS}.`,
      path: [], autoFixable: false,
    })
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
      try {
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
      } catch { /* corrupt entity — skip */ }
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
        try {
          const ent = getLine<IfcBaseEntity>(api, modelId, id)
          issues.push({
            id: newIssueId(),
            ruleId: 'RULE_ELEMENT_IN_BUILDING',
            severity: 'error',
            expressId: id,
            globalId: getStr(ent.GlobalId),
            ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
            elementName: getStr(ent.Name) || '(unnamed)',
            message: 'Element is directly contained in IfcBuilding — it should be placed inside an IfcBuildingStorey.',
            path: getSpatialPath(id, idx),
            autoFixable: false,
          })
        } catch { /* corrupt entity — skip */ }
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

  // Collect structural element IDs, capped to avoid O(n²) blow-up. The cap is
  // distributed round-robin across element types so a type-heavy model (e.g.
  // thousands of walls) doesn't exhaust the budget before any beam/column/roof
  // is sampled — otherwise inter-type clashes for the later types would never
  // be detected.
  const perType: number[][] = CLASH_ELEMENT_TYPES.map((typeId) => {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    const arr: number[] = []
    for (let i = 0; i < ids.size(); i++) arr.push(ids.get(i))
    return arr
  })

  const candidates: Array<{ id: number; typeId: number }> = []
  for (let cursor = 0, added = true; added && candidates.length < CLASH_ELEMENT_LIMIT; cursor++) {
    added = false
    for (let t = 0; t < perType.length && candidates.length < CLASH_ELEMENT_LIMIT; t++) {
      if (cursor < perType[t].length) {
        candidates.push({ id: perType[t][cursor], typeId: CLASH_ELEMENT_TYPES[t] })
        added = true
      }
    }
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

// ── STEP header parser helpers ────────────────────────────────────────────────

/** Read first 4 KB of the buffer as an uppercase ASCII string (header only). */
function readStepHeaderRaw(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096))
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function parseHeaderField(header: string, field: string): string {
  const re = new RegExp(`${field}\\s*\\(\\s*\\(\\s*'([^']*)'`, 'i')
  const m = re.exec(header)
  return m ? m[1].trim() : ''
}

/** Extract the filename from FILE_NAME('name', ...) — field 0 (before the first comma). */
function parseFileNameFromHeader(header: string): string {
  const m = /FILE_NAME\s*\(\s*'([^']*)'/i.exec(header)
  return m ? m[1].trim() : ''
}

function parseFileAuthorFromHeader(header: string): string {
  // FILE_NAME('filename','timestamp',('Author'),('Org'),'preproc','','')
  const m = /FILE_NAME\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*\(\s*'([^']*)'/i.exec(header)
  return m ? m[1].trim() : ''
}

function parseFileOrgFromHeader(header: string): string {
  const m = /FILE_NAME\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*\([^)]*\)\s*,\s*\(\s*'([^']*)'/i.exec(header)
  return m ? m[1].trim() : ''
}

// ── Sprint V3 rule implementations ────────────────────────────────────────────

async function ruleMissingProject(
  api: IfcAPI,
  modelId: number,
): Promise<ValidationIssue[]> {
  if (api.GetLineIDsWithType(modelId, IFCPROJECT).size() > 0) return []
  return [{
    id: newIssueId(), ruleId: 'RULE_MISSING_PROJECT', severity: 'error',
    expressId: 0, globalId: null, ifcClass: 'IfcProject', elementName: 'IfcProject',
    message: 'The model contains no IfcProject entity — required root of every IFC file.',
    path: [], autoFixable: false,
  }]
}

async function ruleMissingBuilding(
  api: IfcAPI,
  modelId: number,
): Promise<ValidationIssue[]> {
  if (api.GetLineIDsWithType(modelId, IFCBUILDING).size() > 0) return []
  return [{
    id: newIssueId(), ruleId: 'RULE_MISSING_BUILDING', severity: 'warning',
    expressId: 0, globalId: null, ifcClass: 'IfcBuilding', elementName: 'IfcBuilding',
    message: 'The model contains no IfcBuilding entity.',
    path: [], autoFixable: false,
  }]
}

async function ruleMissingStorey(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const buildingIds = api.GetLineIDsWithType(modelId, IFCBUILDING)
  for (let i = 0; i < buildingIds.size(); i++) {
    const bid = buildingIds.get(i)
    const children = idx.aggChildren.get(bid) ?? []
    const hasStorey = children.some((cid) => idx.entityTypes.get(cid) === IFCBUILDINGSTOREY)
    if (!hasStorey) {
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, bid)
        issues.push({
          id: newIssueId(), ruleId: 'RULE_MISSING_STOREY', severity: 'warning',
          expressId: bid, globalId: getStr(ent.GlobalId),
          ifcClass: 'IfcBuilding', elementName: getStr(ent.Name) || '(unnamed)',
          message: 'IfcBuilding has no IfcBuildingStorey — elements cannot be organized by floor.',
          path: getSpatialPath(bid, idx), autoFixable: false,
        })
      } catch { /* corrupt entity — skip */ }
    }
  }
  return issues
}

async function ruleEmptyStorey(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const storeyIds = api.GetLineIDsWithType(modelId, IFCBUILDINGSTOREY)
  for (let i = 0; i < storeyIds.size(); i++) {
    const sid = storeyIds.get(i)
    const elemCount = (idx.containerElements.get(sid) ?? []).length
    const spaceCount = (idx.aggChildren.get(sid) ?? []).filter(
      (cid) => idx.entityTypes.get(cid) === IFCSPACE,
    ).length
    if (elemCount === 0 && spaceCount === 0) {
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, sid)
        issues.push({
          id: newIssueId(), ruleId: 'RULE_EMPTY_STOREY', severity: 'info',
          expressId: sid, globalId: getStr(ent.GlobalId),
          ifcClass: 'IfcBuildingStorey', elementName: getStr(ent.Name) || '(unnamed)',
          message: 'IfcBuildingStorey has no contained elements or spaces.',
          path: getSpatialPath(sid, idx), autoFixable: false,
        })
      } catch { /* corrupt entity — skip */ }
    }
  }
  return issues
}

async function ruleFileDescriptionMissing(
  buffer: ArrayBuffer,
): Promise<ValidationIssue[]> {
  const header = readStepHeaderRaw(buffer)
  const desc = parseHeaderField(header, 'FILE_DESCRIPTION')
  if (desc) return []
  return [{
    id: newIssueId(), ruleId: 'RULE_FILE_DESCRIPTION_MISSING', severity: 'info',
    expressId: 0, globalId: null, ifcClass: 'FILE_DESCRIPTION', elementName: 'FILE_DESCRIPTION',
    message: 'IFC STEP header FILE_DESCRIPTION is empty — add a delivery description for traceability.',
    path: [], autoFixable: false,
  }]
}

async function ruleFileAuthorMissing(
  buffer: ArrayBuffer,
): Promise<ValidationIssue[]> {
  const header = readStepHeaderRaw(buffer)
  const author = parseFileAuthorFromHeader(header)
  if (author) return []
  return [{
    id: newIssueId(), ruleId: 'RULE_FILE_AUTHOR_MISSING', severity: 'info',
    expressId: 0, globalId: null, ifcClass: 'FILE_NAME', elementName: 'FILE_NAME',
    message: 'IFC STEP header FILE_NAME has no author specified.',
    path: [], autoFixable: false,
  }]
}

async function ruleProjectLongNameMissing(
  api: IfcAPI,
  modelId: number,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const projectIds = api.GetLineIDsWithType(modelId, IFCPROJECT)
  for (let i = 0; i < projectIds.size(); i++) {
    const id = projectIds.get(i)
    try {
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      if (!getStr(ent.LongName).trim()) {
        issues.push({
          id: newIssueId(), ruleId: 'RULE_PROJECT_LONGNAME_MISSING', severity: 'warning',
          expressId: id, globalId: getStr(ent.GlobalId),
          ifcClass: 'IfcProject', elementName: getStr(ent.Name) || '(unnamed project)',
          message: 'IfcProject has no LongName (official project name) — required for formal deliveries.',
          path: [], autoFixable: false,
        })
      }
    } catch { /* corrupt entity — skip */ }
  }
  return issues
}

async function ruleStoreyElevationMissing(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const storeyIds = api.GetLineIDsWithType(modelId, IFCBUILDINGSTOREY)
  for (let i = 0; i < storeyIds.size(); i++) {
    const sid = storeyIds.get(i)
    try {
      const storey = getLine<IfcBaseEntity & { Elevation?: { type: 4; value: number } | null }>(
        api, modelId, sid,
      )
      if (storey.Elevation == null) {
        issues.push({
          id: newIssueId(), ruleId: 'RULE_STOREY_ELEVATION_MISSING', severity: 'warning',
          expressId: sid, globalId: getStr(storey.GlobalId),
          ifcClass: 'IfcBuildingStorey', elementName: getStr(storey.Name) || '(unnamed)',
          message: 'IfcBuildingStorey has no Elevation defined — required for floor plans and energy analysis.',
          path: getSpatialPath(sid, idx), autoFixable: false,
        })
      }
    } catch { continue }
  }
  return issues
}

async function ruleIso19650ProjectInfo(
  api: IfcAPI,
  modelId: number,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const projectIds = api.GetLineIDsWithType(modelId, IFCPROJECT)
  for (let i = 0; i < projectIds.size(); i++) {
    const id = projectIds.get(i)
    try {
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      const missing: string[] = []
      if (!getStr(ent.LongName).trim())    missing.push('LongName (project name)')
      if (!getStr(ent.Description).trim()) missing.push('Description (delivery phase)')
      if (!getStr(ent.ObjectType).trim())  missing.push('ObjectType (delivery type)')
      if (missing.length > 0) {
        issues.push({
          id: newIssueId(), ruleId: 'RULE_ISO19650_PROJECT_INFO', severity: 'warning',
          expressId: id, globalId: getStr(ent.GlobalId),
          ifcClass: 'IfcProject', elementName: getStr(ent.Name) || '(unnamed project)',
          message: `IfcProject missing ISO 19650 required fields: ${missing.join(', ')}.`,
          path: [], autoFixable: false,
        })
      }
    } catch { /* corrupt entity — skip */ }
  }
  return issues
}

async function ruleIso19650AuthorInfo(
  buffer: ArrayBuffer,
): Promise<ValidationIssue[]> {
  const header = readStepHeaderRaw(buffer)
  const author = parseFileAuthorFromHeader(header)
  const org    = parseFileOrgFromHeader(header)
  if (author || org) return []
  return [{
    id: newIssueId(), ruleId: 'RULE_ISO19650_AUTHOR_INFO', severity: 'info',
    expressId: 0, globalId: null, ifcClass: 'FILE_NAME', elementName: 'FILE_NAME',
    message: 'IFC header has no author or organisation — ISO 19650 requires traceable information responsibility.',
    path: [], autoFixable: false,
  }]
}

async function ruleIso19650Filename(
  buffer: ArrayBuffer,
  customPattern: string | undefined,
): Promise<ValidationIssue[]> {
  const header   = readStepHeaderRaw(buffer)
  const fileName = parseFileNameFromHeader(header)

  // If the header has no filename at all, skip — ruleFileAuthorMissing covers that
  if (!fileName) return []

  // Default ISO 19650 convention: at least 5 underscore-separated fields
  // (e.g. PRJ_ORG_ZZ_M_DR_A_0001 or PRJ-ORG-ZZ-M-DR-A-0001)
  const DEFAULT_ISO_PATTERN = /^[^_-]+[_-][^_-]+[_-][^_-]+[_-][^_-]+[_-][^_-]+/

  if (customPattern) {
    let re: RegExp
    try { re = new RegExp(customPattern) } catch {
      // Invalid regex in config — emit info rather than crashing
      return [{
        id: newIssueId(), ruleId: 'RULE_ISO19650_FILENAME', severity: 'info',
        expressId: 0, globalId: null, ifcClass: 'FILE_NAME', elementName: fileName,
        message: `RULE_ISO19650_FILENAME: invalid regex pattern "${customPattern}" in rules config.`,
        path: [], autoFixable: false,
      }]
    }
    if (!re.test(fileName)) {
      return [{
        id: newIssueId(), ruleId: 'RULE_ISO19650_FILENAME', severity: 'warning',
        expressId: 0, globalId: null, ifcClass: 'FILE_NAME', elementName: fileName,
        message: `Filename "${fileName}" does not match the ISO 19650 naming pattern "${customPattern}".`,
        path: [], autoFixable: false,
      }]
    }
    return []
  }

  // No custom pattern — apply default structural check (info only)
  if (!DEFAULT_ISO_PATTERN.test(fileName)) {
    return [{
      id: newIssueId(), ruleId: 'RULE_ISO19650_FILENAME', severity: 'info',
      expressId: 0, globalId: null, ifcClass: 'FILE_NAME', elementName: fileName,
      message: `Filename "${fileName}" does not follow the ISO 19650 convention (expected ≥5 underscore/hyphen-separated fields).`,
      path: [], autoFixable: false,
    }]
  }
  return []
}

// ── Sprint V4 rules ───────────────────────────────────────────────────────────

// MEP flow element types (all subtypes of IfcDistributionFlowElement)
const MEP_ELEMENT_TYPES = [
  IFCFLOWSEGMENT, IFCPIPESEGMENT, IFCDUCTSEGMENT,
  IFCFLOWFITTING, IFCFLOWTERMINAL, IFCFLOWCONTROLLER,
  IFCFLOWMOVINGDEVICE, IFCFLOWTREATMENTDEVICE, IFCFLOWSTORAGEDEVICE,
]

// Structural types for MEP vs structural clash
const STRUCTURAL_TYPES = [
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCSLABSTANDARDCASE,
  IFCBEAM, IFCBEAMSTANDARDCASE, IFCCOLUMN, IFCCOLUMNSTANDARDCASE,
  IFCFOOTING, IFCPILE, IFCMEMBER, IFCPLATE,
]

// Minimum Psets required per element type at each LOD
const LOD_REQUIRED_PSETS: Record<string, Record<number, string[]>> = {
  IfcWall:   { 200: ['Pset_WallCommon'], 300: ['Pset_WallCommon'], 350: ['Pset_WallCommon'], 400: ['Pset_WallCommon'] },
  IfcSlab:   { 200: ['Pset_SlabCommon'], 300: ['Pset_SlabCommon'], 350: ['Pset_SlabCommon'], 400: ['Pset_SlabCommon'] },
  IfcBeam:   { 300: ['Pset_BeamCommon'], 350: ['Pset_BeamCommon'], 400: ['Pset_BeamCommon'] },
  IfcColumn: { 300: ['Pset_ColumnCommon'], 350: ['Pset_ColumnCommon'], 400: ['Pset_ColumnCommon'] },
  IfcDoor:   { 200: ['Pset_DoorCommon'], 300: ['Pset_DoorCommon'] },
  IfcWindow: { 200: ['Pset_WindowCommon'], 300: ['Pset_WindowCommon'] },
  IfcSpace:  { 100: ['Pset_SpaceCommon'], 200: ['Pset_SpaceCommon'] },
}

interface IfcRelAssociatesClassification {
  expressID: number; type: number
  RelatedObjects: IfcRefValue[]
  RelatingClassification: IfcRefValue
}

interface IfcRelAssignsToGroup {
  expressID: number; type: number
  RelatedObjects: IfcRefValue[]
  RelatingGroup: IfcRefValue
}

async function ruleMissingClassification(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
  allowedSystems: string[],
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  // Build set of element expressIDs that have a classification
  const classifiedIds = new Set<number>()
  const relIds = api.GetLineIDsWithType(modelId, IFCRELASSOCIATESCLASSIFICATION)
  for (let i = 0; i < relIds.size(); i++) {
    try {
      const rel = getLine<IfcRelAssociatesClassification>(api, modelId, relIds.get(i))
      if (!rel.RelatedObjects) continue
      // If caller restricts classification systems, check the source name
      if (allowedSystems.length > 0) {
        try {
          const classRef = getLine<{ Name?: MaybeString }>(api, modelId, rel.RelatingClassification.value)
          const sysName = getStr(classRef.Name).toLowerCase()
          if (!allowedSystems.some((s) => sysName.includes(s.toLowerCase()))) continue
        } catch { /* skip */ }
      }
      for (const ref of rel.RelatedObjects) {
        if (ref?.value != null) classifiedIds.add(ref.value)
      }
    } catch { /* corrupt line */ }
  }

  for (const typeId of ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (classifiedIds.has(id)) continue
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        issues.push({
          id: newIssueId(), ruleId: 'RULE_MISSING_CLASSIFICATION', severity: 'warning',
          expressId: id, globalId: getStr(ent.GlobalId) || null, ifcClass: TYPE_NAME[typeId] ?? 'IfcElement',
          elementName: getStr(ent.Name) || `#${id}`,
          message: `${TYPE_NAME[typeId] ?? 'IfcElement'} has no classification reference${allowedSystems.length > 0 ? ` from ${allowedSystems.join('/')}` : ''}.`,
          path: getSpatialPath(id, idx), autoFixable: false,
        })
      } catch { /* corrupt */ }
    }
  }
  return issues
}

async function ruleLodPsetMissing(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
  lodLevel: number,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  // Build map: elementId → set of its pset names
  const elementPsets = new Map<number, Set<string>>()
  const relIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)
  for (let i = 0; i < relIds.size(); i++) {
    try {
      const rel = getLine<IfcRelDefByProps>(api, modelId, relIds.get(i))
      if (!rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue
      const pset = getLine<IfcPSet>(api, modelId, rel.RelatingPropertyDefinition.value)
      const psetName = getStr(pset.Name)
      if (!psetName) continue
      for (const ref of rel.RelatedObjects) {
        if (ref?.value == null) continue
        const existing = elementPsets.get(ref.value) ?? new Set<string>()
        existing.add(psetName)
        elementPsets.set(ref.value, existing)
      }
    } catch { /* corrupt */ }
  }

  const typeMap: Record<number, string> = {
    [IFCWALL]: 'IfcWall', [IFCWALLSTANDARDCASE]: 'IfcWall',
    [IFCSLAB]: 'IfcSlab', [IFCSLABSTANDARDCASE]: 'IfcSlab',
    [IFCBEAM]: 'IfcBeam', [IFCBEAMSTANDARDCASE]: 'IfcBeam',
    [IFCCOLUMN]: 'IfcColumn', [IFCCOLUMNSTANDARDCASE]: 'IfcColumn',
    [IFCDOOR]: 'IfcDoor', [IFCWINDOW]: 'IfcWindow', [IFCSPACE]: 'IfcSpace',
  }

  for (const [typeId, className] of Object.entries(typeMap)) {
    const required = LOD_REQUIRED_PSETS[className]?.[lodLevel]
    if (!required || required.length === 0) continue
    const ids = api.GetLineIDsWithType(modelId, Number(typeId))
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      const elemPsets = elementPsets.get(id) ?? new Set<string>()
      const missing = required.filter((p) => !elemPsets.has(p))
      if (missing.length === 0) continue
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        issues.push({
          id: newIssueId(), ruleId: 'RULE_LOD_PSET_MISSING', severity: 'warning',
          expressId: id, globalId: getStr(ent.GlobalId) || null, ifcClass: className,
          elementName: getStr(ent.Name) || `#${id}`,
          message: `${className} missing required Pset(s) for LOD ${lodLevel}: ${missing.join(', ')}.`,
          path: getSpatialPath(id, idx), autoFixable: false,
        })
      } catch { /* corrupt */ }
    }
  }
  return issues
}

// Structural types that need IfcElementQuantity at LOD 300+
const LOD_QUANTITY_TYPES = [
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCSLABSTANDARDCASE,
  IFCBEAM, IFCBEAMSTANDARDCASE, IFCCOLUMN, IFCCOLUMNSTANDARDCASE,
]

async function ruleLodQuantityMissing(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
  lodLevel: number,
): Promise<ValidationIssue[]> {
  if (lodLevel < 300) return []
  const issues: ValidationIssue[] = []

  // Build set of elements that have at least one IfcElementQuantity
  const quantifiedIds = new Set<number>()
  const relIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)
  for (let i = 0; i < relIds.size(); i++) {
    try {
      const rel = getLine<IfcRelDefByProps>(api, modelId, relIds.get(i))
      if (!rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue
      // Check if the definition is an IfcElementQuantity
      const defLine = getLine<{ type: number }>(api, modelId, rel.RelatingPropertyDefinition.value)
      if (defLine.type !== IFCELEMENTQUANTITY) continue
      for (const ref of rel.RelatedObjects) {
        if (ref?.value != null) quantifiedIds.add(ref.value)
      }
    } catch { /* corrupt */ }
  }

  for (const typeId of LOD_QUANTITY_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (quantifiedIds.has(id)) continue
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        const className = TYPE_NAME[typeId] ?? 'IfcElement'
        issues.push({
          id: newIssueId(), ruleId: 'RULE_LOD_QUANTITY_MISSING', severity: 'warning',
          expressId: id, globalId: getStr(ent.GlobalId) || null, ifcClass: className,
          elementName: getStr(ent.Name) || `#${id}`,
          message: `${className} has no IfcElementQuantity — required at LOD ${lodLevel}.`,
          path: getSpatialPath(id, idx), autoFixable: false,
        })
      } catch { /* corrupt */ }
    }
  }
  return issues
}

// Walls and slabs that should have IfcMaterialLayerSetUsage at LOD ≥ 300
const LAYERED_ELEMENT_TYPES = [
  IFCWALL, IFCWALLSTANDARDCASE, IFCSLAB, IFCSLABSTANDARDCASE,
]

async function ruleLodMaterialLayerMissing(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
  lodLevel: number,
): Promise<ValidationIssue[]> {
  if (lodLevel < 300) return []
  const issues: ValidationIssue[] = []

  // Build set of elements associated with a MaterialLayerSetUsage
  const layeredIds = new Set<number>()
  const matRelIds = api.GetLineIDsWithType(modelId, IFCRELASSOCIATESMATERIAL)
  for (let i = 0; i < matRelIds.size(); i++) {
    try {
      interface IfcRelAssocMat { RelatedObjects: IfcRefValue[]; RelatingMaterial: IfcRefValue }
      const rel = getLine<IfcRelAssocMat>(api, modelId, matRelIds.get(i))
      if (!rel.RelatingMaterial || !rel.RelatedObjects) continue
      const matLine = getLine<{ type: number }>(api, modelId, rel.RelatingMaterial.value)
      if (matLine.type !== IFCMATERIALLAYERSETUSAGE) continue
      for (const ref of rel.RelatedObjects) {
        if (ref?.value != null) layeredIds.add(ref.value)
      }
    } catch { /* corrupt */ }
  }

  for (const typeId of LAYERED_ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (layeredIds.has(id)) continue
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        const className = TYPE_NAME[typeId] ?? 'IfcElement'
        issues.push({
          id: newIssueId(), ruleId: 'RULE_LOD_MATERIAL_LAYER_MISSING', severity: 'warning',
          expressId: id, globalId: getStr(ent.GlobalId) || null, ifcClass: className,
          elementName: getStr(ent.Name) || `#${id}`,
          message: `${className} has no IfcMaterialLayerSetUsage — required at LOD ${lodLevel}.`,
          path: getSpatialPath(id, idx), autoFixable: false,
        })
      } catch { /* corrupt */ }
    }
  }
  return issues
}

async function ruleMepSystemMissing(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  // Build set of MEP elements assigned to at least one IfcSystem via IfcRelAssignsToGroup
  const assignedIds = new Set<number>()
  const relIds = api.GetLineIDsWithType(modelId, IFCRELASSIGNSTOGROUP)
  for (let i = 0; i < relIds.size(); i++) {
    try {
      const rel = getLine<IfcRelAssignsToGroup>(api, modelId, relIds.get(i))
      if (!rel.RelatingGroup || !rel.RelatedObjects) continue
      // Check that the group is an IfcSystem
      const grp = getLine<{ type: number }>(api, modelId, rel.RelatingGroup.value)
      if (grp.type !== IFCSYSTEM) continue
      for (const ref of rel.RelatedObjects) {
        if (ref?.value != null) assignedIds.add(ref.value)
      }
    } catch { /* corrupt */ }
  }

  for (const typeId of MEP_ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (assignedIds.has(id)) continue
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        const className = TYPE_NAME[typeId] ?? 'IfcDistributionFlowElement'
        issues.push({
          id: newIssueId(), ruleId: 'RULE_MEP_SYSTEM_MISSING', severity: 'warning',
          expressId: id, globalId: getStr(ent.GlobalId) || null, ifcClass: className,
          elementName: getStr(ent.Name) || `#${id}`,
          message: `${className} is not assigned to any IfcSystem.`,
          path: getSpatialPath(id, idx), autoFixable: false,
        })
      } catch { /* corrupt */ }
    }
  }
  return issues
}

async function ruleClashMepStructural(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
  onProgress?: (innerPct: number) => void,
): Promise<{ issues: ValidationIssue[]; cap?: { checkedCount: number; totalCount: number } }> {
  const issues: ValidationIssue[] = []

  const countElements = (types: number[]): number => {
    let n = 0
    for (const typeId of types) n += api.GetLineIDsWithType(modelId, typeId).size()
    return n
  }

  const buildBoxes = async (types: number[], limit: number): Promise<AABB[]> => {
    // Round-robin across types so the limit is spread evenly rather than
    // consumed by whichever type comes first — otherwise a type-heavy group
    // would starve the later types out of the sample entirely.
    const idsPerType = types.map((typeId) => {
      const v = api.GetLineIDsWithType(modelId, typeId)
      const arr: number[] = []
      for (let i = 0; i < v.size(); i++) arr.push(v.get(i))
      return arr
    })

    const boxes: AABB[] = []
    for (let cursor = 0, added = true; added && boxes.length < limit; cursor++) {
      added = false
      for (let t = 0; t < idsPerType.length && boxes.length < limit; t++) {
        if (cursor >= idsPerType[t].length) continue
        added = true
        const id  = idsPerType[t][cursor]
        const box = computeAABB(api, modelId, id)
        if (!box) continue
        try {
          const ent = getLine<IfcBaseEntity>(api, modelId, id)
          box.typeId = types[t]
          box.name   = getStr(ent.Name) || `#${id}`
          box.guid   = getStr(ent.GlobalId)
        } catch { /* metadata optional */ }
        boxes.push(box)
      }
    }
    return boxes
  }

  const mepBoxes  = await buildBoxes(MEP_ELEMENT_TYPES, CLASH_ELEMENT_LIMIT)
  const struBoxes = await buildBoxes(STRUCTURAL_TYPES,  CLASH_ELEMENT_LIMIT)
  if (mepBoxes.length === 0 || struBoxes.length === 0) return { issues }

  const wasCapped = mepBoxes.length >= CLASH_ELEMENT_LIMIT || struBoxes.length >= CLASH_ELEMENT_LIMIT
  const cap = wasCapped
    ? {
        checkedCount: mepBoxes.length + struBoxes.length,
        totalCount:   countElements(MEP_ELEMENT_TYPES) + countElements(STRUCTURAL_TYPES),
      }
    : undefined

  const reported = new Set<string>()
  let lastProgressStep = -1
  for (let mi = 0; mi < mepBoxes.length; mi++) {
    const mep = mepBoxes[mi]
    if (issues.length >= CLASH_ISSUE_LIMIT) break
    for (const str of struBoxes) {
      if (issues.length >= CLASH_ISSUE_LIMIT) break
      if (!aabbsClash(mep, str, CLASH_PENETRATION)) continue
      const pairKey = `${Math.min(mep.expressId, str.expressId)}-${Math.max(mep.expressId, str.expressId)}`
      if (reported.has(pairKey)) continue
      reported.add(pairKey)
      const mepClass  = TYPE_NAME[mep.typeId]  ?? 'IfcFlowElement'
      const struClass = TYPE_NAME[str.typeId] ?? 'IfcElement'
      issues.push({
        id: newIssueId(), ruleId: 'RULE_CLASH_MEP_STRUCTURAL', severity: 'warning',
        expressId: mep.expressId, globalId: mep.guid || null, ifcClass: mepClass,
        elementName: mep.name,
        message: `MEP ${mepClass} "${mep.name}" (#${mep.expressId}) clashes with structural ${struClass} "${str.name}" (#${str.expressId}).`,
        path: getSpatialPath(mep.expressId, idx), autoFixable: false,
      })
    }
    // Emit progress at each ~5 % increment through the MEP element set
    const step = Math.floor(((mi + 1) / mepBoxes.length) * 20)
    if (step > lastProgressStep) {
      lastProgressStep = step
      onProgress?.((mi + 1) / mepBoxes.length)
    }
  }
  return { issues, cap }
}

// ── Coordinate offset detection ──────────────────────────────────────────────
// Detects models whose geometry is positioned more than 10 km from the WCS
// origin. Happens when Revit / Tekla / AutoCAD export at "survey point" with
// real-world coordinates instead of project-internal coordinates.
//
// web-ifc GetFlatMesh returns vertices in METRES regardless of the IFC file's
// declared unit, so the 10,000 m threshold applies universally.

const COORD_OFFSET_THRESHOLD_M = 10_000  // 10 km — beyond this, float precision degrades
const COORD_SAMPLE_SIZE        = 20      // max elements sampled for bounding box check

async function ruleCoordinateOffset(
  api: IfcAPI,
  modelId: number,
  thresholdM: number = COORD_OFFSET_THRESHOLD_M,
): Promise<ValidationIssue[]> {
  let sampled = 0
  let offsetX = 0
  let offsetY = 0
  let found = false

  outer: for (const typeId of ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      if (sampled >= COORD_SAMPLE_SIZE) break outer
      const id = ids.get(i)
      const box = computeAABB(api, modelId, id)
      if (!box) continue
      sampled++
      const cx = (box.minX + box.maxX) / 2
      const cy = (box.minY + box.maxY) / 2
      if (Math.abs(cx) > thresholdM || Math.abs(cy) > thresholdM) {
        offsetX = cx
        offsetY = cy
        found = true
        break outer
      }
    }
  }

  if (!found) return []

  const fmt = (v: number): string => `${(v / 1000).toFixed(1)} km`
  return [{
    id: newIssueId(), ruleId: 'RULE_COORDINATE_OFFSET', severity: 'warning',
    expressId: 0, globalId: null, ifcClass: 'IfcProject',
    elementName: '(model)',
    message: `Model geometry is positioned approximately ${fmt(offsetX)} E, ${fmt(offsetY)} N from the WCS origin — large coordinates cause floating-point precision errors. Re-export with a project base point offset, or use IfcMapConversion to retain the real-world reference while centring the model near the origin.`,
    path: [], autoFixable: false,
  }]
}

// ── Proxy element overuse ─────────────────────────────────────────────────────
// Detects models where IfcBuildingElementProxy makes up more than 5% of all
// physical elements. This typically means Revit/ArchiCAD families were not
// converted to proper IFC types — a common export quality failure.
//
// Threshold: proxy% > PROXY_OVERUSE_THRESHOLD OR proxyCount > PROXY_ABSOLUTE_MIN
// The absolute minimum avoids noise on tiny models (< 20 elements).

const PROXY_OVERUSE_THRESHOLD = 0.05  // 5% of total physical elements
const PROXY_ABSOLUTE_MIN      = 5     // ignore files with only 1-4 proxies

async function ruleProxyOveruse(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
  thresholdFrac: number = PROXY_OVERUSE_THRESHOLD,
): Promise<ValidationIssue[]> {
  const proxyIds   = api.GetLineIDsWithType(modelId, IFCBUILDINGELEMENTPROXY)
  const proxyCount = proxyIds.size()

  if (proxyCount < PROXY_ABSOLUTE_MIN) return []

  // Count total physical elements to compute percentage.
  // Iterate ELEMENT_TYPES which excludes proxies, then add proxyCount.
  let totalPhysical = proxyCount
  for (const typeId of ELEMENT_TYPES) {
    totalPhysical += api.GetLineIDsWithType(modelId, typeId).size()
  }

  if (totalPhysical === 0 || proxyCount / totalPhysical < thresholdFrac) return []

  const pct    = Math.round((proxyCount / totalPhysical) * 100)
  const issues: ValidationIssue[] = []

  for (let i = 0; i < proxyCount; i++) {
    const id = proxyIds.get(i)
    try {
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      issues.push({
        id:          newIssueId(),
        ruleId:      'RULE_PROXY_OVERUSE',
        severity:    'warning',
        expressId:   id,
        globalId:    getStr(ent.GlobalId),
        ifcClass:    'IfcBuildingElementProxy',
        elementName: getStr(ent.Name) || '(unnamed)',
        message:     `Proxy element not converted to a proper IFC type (${pct}% of model elements are proxies). Re-export from the source application or convert families to typed IFC elements.`,
        path:        getSpatialPath(id, idx),
        autoFixable: false,
      })
    } catch { /* corrupt entity — skip */ }
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

// ── File size anomaly detection ───────────────────────────────────────────────
// Detects IFC files where the byte-per-physical-element ratio is abnormally
// high — a signal of over-detailed geometry, embedded textures, or duplicate
// geometry instances exported by Revit/ArchiCAD without "simplify geometry".
//
// Threshold: >500 KB per physical element is the heuristic upper bound.
// A typical architectural IFC4 file is 20-80 KB/element. Files at >500 KB/el
// are almost always candidates for re-export with simplified geometry.
//
// We only count typed physical elements (from ELEMENT_TYPES) to avoid flagging
// small models that are predominantly spatial structure (sites, buildings, storeys).
// Minimum: ANOMALY_MIN_ELEMENTS prevents false positives on tiny test files.

const FILE_SIZE_BYTES_PER_ELEMENT_THRESHOLD = 500_000  // 500 KB/element
const ANOMALY_MIN_ELEMENTS                   = 10        // ignore files with < 10 physical elements

async function ruleFileSizeAnomaly(
  api: IfcAPI,
  modelId: number,
  buffer: ArrayBuffer,
  thresholdBytes: number = FILE_SIZE_BYTES_PER_ELEMENT_THRESHOLD,
): Promise<ValidationIssue[]> {
  let elementCount = 0
  for (const typeId of ELEMENT_TYPES) {
    elementCount += api.GetLineIDsWithType(modelId, typeId).size()
  }

  if (elementCount < ANOMALY_MIN_ELEMENTS) return []

  const bytesPerElement = buffer.byteLength / elementCount
  if (bytesPerElement <= thresholdBytes) return []

  const mbSize   = (buffer.byteLength / 1_048_576).toFixed(1)
  const kbPerEl  = Math.round(bytesPerElement / 1024)
  return [{
    id: newIssueId(), ruleId: 'RULE_FILE_SIZE_ANOMALY', severity: 'info',
    expressId: 0, globalId: null, ifcClass: 'IfcProject',
    elementName: '(model)',
    message: `File is ${mbSize} MB with ${elementCount} elements — ${kbPerEl} KB per element. Typical IFC files are 20–80 KB/element. Re-export with simplified geometry, disable texture export, and remove duplicate geometry instances to reduce file size.`,
    path: [], autoFixable: false,
  }]
}

// ── Sprint V6 rules ───────────────────────────────────────────────────────────

async function ruleOpeningWithoutHost(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  // Collect openings that are properly hosted via IfcRelVoidsElement
  const hostedIds = new Set<number>()
  const voidRelIds = api.GetLineIDsWithType(modelId, IFCRELVOIDSELEMENT)
  for (let i = 0; i < voidRelIds.size(); i++) {
    try {
      const rel = getLine<{ RelatedOpeningElement?: MaybeRef }>(api, modelId, voidRelIds.get(i))
      const openId = getRefId(rel.RelatedOpeningElement as MaybeRef)
      if (openId !== null) hostedIds.add(openId)
    } catch { /* corrupt rel */ }
  }

  const issues: ValidationIssue[] = []
  const openingIds = api.GetLineIDsWithType(modelId, IFCOPENINGELEMENT)
  for (let i = 0; i < openingIds.size(); i++) {
    const id = openingIds.get(i)
    if (hostedIds.has(id)) continue
    try {
      const ent = getLine<IfcBaseEntity>(api, modelId, id)
      issues.push({
        id: newIssueId(),
        ruleId: 'RULE_OPENING_WITHOUT_HOST',
        severity: 'warning',
        expressId: id,
        globalId: getStr(ent.GlobalId),
        ifcClass: 'IfcOpeningElement',
        elementName: getStr(ent.Name) || '(unnamed)',
        message: 'IfcOpeningElement is not connected to any host element via IfcRelVoidsElement — orphan openings cause geometry errors in viewers and exporters.',
        path: getSpatialPath(id, idx),
        autoFixable: false,
      })
    } catch { /* corrupt entity */ }
  }
  return issues
}

async function ruleStoreyElevationDuplicate(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const buildingIds = api.GetLineIDsWithType(modelId, IFCBUILDING)

  for (let bi = 0; bi < buildingIds.size(); bi++) {
    const bid = buildingIds.get(bi)
    const children = idx.aggChildren.get(bid) ?? []
    const storeyIds = children.filter((cid) => idx.entityTypes.get(cid) === IFCBUILDINGSTOREY)
    if (storeyIds.length < 2) continue

    // Map elevation (rounded to nearest mm) → list of storey expressIds
    const elevBuckets = new Map<number, number[]>()
    for (const sid of storeyIds) {
      try {
        const storey = getLine<IfcBaseEntity & { Elevation?: { type: 4; value: number } | null }>(
          api, modelId, sid,
        )
        if (storey.Elevation == null) continue
        // Round to nearest mm to tolerate floating-point noise between authoring tools
        const elevMm = Math.round(storey.Elevation.value * 1000)
        const bucket = elevBuckets.get(elevMm) ?? []
        bucket.push(sid)
        elevBuckets.set(elevMm, bucket)
      } catch { continue }
    }

    for (const [, ids] of elevBuckets) {
      if (ids.length < 2) continue
      for (const sid of ids) {
        try {
          const storey = getLine<IfcBaseEntity & { Elevation?: { type: 4; value: number } | null }>(
            api, modelId, sid,
          )
          const elevM = (storey.Elevation?.value ?? 0).toFixed(3)
          issues.push({
            id: newIssueId(),
            ruleId: 'RULE_STOREY_ELEVATION_DUPLICATE',
            severity: 'warning',
            expressId: sid,
            globalId: getStr(storey.GlobalId),
            ifcClass: 'IfcBuildingStorey',
            elementName: getStr(storey.Name) || '(unnamed)',
            message: `IfcBuildingStorey shares elevation ${elevM} m with another storey in the same building — duplicate elevations indicate a misconfigured level.`,
            path: getSpatialPath(sid, idx),
            autoFixable: false,
          })
        } catch { continue }
      }
    }
  }
  return issues
}

async function ruleUnitConsistency(
  api: IfcAPI,
  modelId: number,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  const unitAssignmentIds = api.GetLineIDsWithType(modelId, IFCUNITASSIGNMENT)
  for (let i = 0; i < unitAssignmentIds.size(); i++) {
    const uaId = unitAssignmentIds.get(i)
    try {
      const ua = getLine<{ expressID: number; type: number; Units: (IfcRefValue | null)[] }>(
        api, modelId, uaId,
      )
      if (!Array.isArray(ua.Units)) continue

      for (const unitRef of ua.Units) {
        const uid = getRefId(unitRef as MaybeRef)
        if (!uid) continue
        try {
          const unit = getLine<{
            expressID: number; type: number
            UnitType?: IfcEnumValue | null
            Prefix?: IfcEnumValue | null
            Name?: MaybeString
          }>(api, modelId, uid)

          // Only flag imperial length units
          if (unit.UnitType?.value !== 'LENGTHUNIT') continue
          if (unit.type !== IFCCONVERSIONBASEDUNIT) continue

          const name = (unit.Name?.value ?? '').toUpperCase()
          const IMPERIAL = ['FOOT', 'FEET', 'INCH', 'YARD', 'MILE']
          if (!IMPERIAL.some(imp => name.includes(imp))) continue

          issues.push({
            id: newIssueId(),
            ruleId: 'RULE_UNIT_CONSISTENCY',
            severity: 'warning',
            expressId: uaId,
            globalId: null,
            ifcClass: 'IfcUnitAssignment',
            elementName: `LENGTHUNIT = "${unit.Name?.value ?? '?'}"`,
            message: `Model length unit is "${unit.Name?.value ?? '?'}" (imperial). IFC interchange expects SI metric units; imperial values cause incorrect area/volume calculations in downstream tools.`,
            path: [],
            autoFixable: false,
          })
        } catch { continue }
      }
    } catch { continue }
  }
  return issues
}

async function ruleSpaceAreaMissing(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  // Spaces that own at least one IfcElementQuantity containing NetFloorArea
  const spacesWithArea = new Set<number>()

  const relIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)
  for (let i = 0; i < relIds.size(); i++) {
    try {
      const rel = getLine<IfcRelDefByProps>(api, modelId, relIds.get(i))
      if (!rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue

      const defId = rel.RelatingPropertyDefinition.value
      const defLine = getLine<{ type: number; Quantities?: (IfcRefValue | null)[] }>(
        api, modelId, defId,
      )
      if (defLine.type !== IFCELEMENTQUANTITY) continue
      if (!Array.isArray(defLine.Quantities)) continue

      let hasNetFloorArea = false
      for (const qRef of defLine.Quantities) {
        const qId = getRefId(qRef as MaybeRef)
        if (!qId) continue
        try {
          const qty = getLine<{ type: number; Name?: MaybeString }>(api, modelId, qId)
          if (qty.type === IFCQUANTITYAREA && getStr(qty.Name) === 'NetFloorArea') {
            hasNetFloorArea = true
            break
          }
        } catch { continue }
      }
      if (!hasNetFloorArea) continue

      for (const ref of rel.RelatedObjects) {
        if (ref?.value != null) spacesWithArea.add(ref.value)
      }
    } catch { /* corrupt line */ }
  }

  const spaceIds = api.GetLineIDsWithType(modelId, IFCSPACE)
  if (spaceIds.size() === 0) return issues

  for (let i = 0; i < spaceIds.size(); i++) {
    const sid = spaceIds.get(i)
    if (spacesWithArea.has(sid)) continue
    try {
      const space = getLine<IfcBaseEntity>(api, modelId, sid)
      issues.push({
        id: newIssueId(),
        ruleId: 'RULE_SPACE_AREA_MISSING',
        severity: 'warning',
        expressId: sid,
        globalId: getStr(space.GlobalId) || null,
        ifcClass: 'IfcSpace',
        elementName: getStr(space.Name) || getStr(space.LongName) || `#${sid}`,
        message: 'IfcSpace has no NetFloorArea quantity — required for energy analysis, room schedules, and QS workflows.',
        path: getSpatialPath(sid, idx),
        autoFixable: false,
      })
    } catch { /* corrupt */ }
  }
  return issues
}

async function ruleConnectedMep(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  // Elements that have at least one IfcDistributionPort. IFC spells that two
  // ways and reading only the older one reported every modern services model as
  // broken — see ifc-ports.ts, where the fix lives so it can be tested.
  const connectedIds = collectPortedElements(api, modelId)

  const MEP_SEGMENT_TYPES = [IFCPIPESEGMENT, IFCDUCTSEGMENT, IFCFLOWSEGMENT]
  for (const typeId of MEP_SEGMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, typeId)
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i)
      if (connectedIds.has(id)) continue
      try {
        const ent = getLine<IfcBaseEntity>(api, modelId, id)
        const className = TYPE_NAME[typeId] ?? 'IfcFlowSegment'
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_CONNECTED_MEP',
          severity: 'warning',
          expressId: id,
          globalId: getStr(ent.GlobalId) || null,
          ifcClass: className,
          elementName: getStr(ent.Name) || `#${id}`,
          message: `${className} has no IfcDistributionPort connection — isolated MEP segments are excluded from system flow and energy calculations.`,
          path: getSpatialPath(id, idx),
          autoFixable: false,
        })
      } catch { continue }
    }
  }
  return issues
}

async function ruleStoreyElevationOrder(
  api: IfcAPI,
  modelId: number,
  idx: SpatialIndex,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const buildingIds = api.GetLineIDsWithType(modelId, IFCBUILDING)

  for (let bi = 0; bi < buildingIds.size(); bi++) {
    const bid = buildingIds.get(bi)
    const children = idx.aggChildren.get(bid) ?? []
    const storeyIds = children.filter((cid) => idx.entityTypes.get(cid) === IFCBUILDINGSTOREY)
    if (storeyIds.length < 2) continue

    type StoreyEntry = { id: number; elevM: number; name: string }
    const storeys: StoreyEntry[] = []
    for (const sid of storeyIds) {
      try {
        const storey = getLine<IfcBaseEntity & { Elevation?: { type: 4; value: number } | null }>(
          api, modelId, sid,
        )
        if (storey.Elevation == null) continue
        storeys.push({ id: sid, elevM: storey.Elevation.value, name: getStr(storey.Name) || `#${sid}` })
      } catch { continue }
    }
    if (storeys.length < 2) continue

    // Detect any storey whose elevation is lower than the highest elevation seen so far.
    // Comparing against max(predecessors) instead of just the immediate predecessor catches
    // all out-of-order storeys regardless of where the inversion first appears.
    let maxPrevElev = storeys[0].elevM
    for (let i = 1; i < storeys.length; i++) {
      if (storeys[i].elevM < maxPrevElev) {
        issues.push({
          id: newIssueId(),
          ruleId: 'RULE_STOREY_ELEVATION_ORDER',
          severity: 'warning',
          expressId: storeys[i].id,
          globalId: null,
          ifcClass: 'IfcBuildingStorey',
          elementName: storeys[i].name,
          message: `IfcBuildingStorey "${storeys[i].name}" (${storeys[i].elevM.toFixed(3)} m) has a lower elevation than an earlier storey in the same building — storeys should be listed in ascending elevation order.`,
          path: getSpatialPath(storeys[i].id, idx),
          autoFixable: false,
        })
      } else {
        maxPrevElev = storeys[i].elevM
      }
    }
  }
  return issues
}

// ── Main validation handler ───────────────────────────────────────────────────

type PostFn = (msg: unknown, transfer?: Transferable[]) => void
const post = self.postMessage.bind(self) as PostFn

async function handleValidate(msg: ValidateMessage): Promise<void> {
  const { id, buffer, rules, skipTree } = msg
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

    // ── Build and stream tree (skipped for secondary pool workers) ──
    if (!skipTree) {
      const tree  = buildTree(api, modelId, idx)
      const decomp = buildDecompMap(idx)
      post({ type: 'tree', id, tree, decomp })
    }

    // ── Define enabled rules ─────────────────────────────────────────
    const totalRules = enabledRules.length
    let completedRules = 0
    let clashCap: { checkedCount: number; totalCount: number } | undefined

    const runRule = async (
      ruleId: string,
      fn: () => Promise<ValidationIssue[]>,
    ): Promise<void> => {
      let issues: ValidationIssue[] = []
      let status: 'ok' | 'failed' = 'ok'
      let error: string | undefined
      try {
        issues = await fn()
      } catch (err: unknown) {
        // Isolate rule failures: one rule throwing must never abort the rest.
        // Report it as 'failed' so the launcher records honest coverage instead
        // of silently treating the rule as a clean pass (which inflates the score).
        status = 'failed'
        error  = (err instanceof Error ? err.message : String(err)).slice(0, 300)
        log.warn(`${ruleId} threw unexpectedly — marking failed:`, err)
      }
      allIssues.push(...issues)
      completedRules++
      const progress = Math.round((completedRules / totalRules) * 100)
      post({ type: 'partial', id, ruleId, issues, progress, status, ...(error !== undefined ? { error } : {}) })
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

    // ── Sprint V3 rules ──────────────────────────────────────────────
    if (rules.RULE_MISSING_PROJECT)
      await runRule('RULE_MISSING_PROJECT', () => ruleMissingProject(api!, modelId))

    if (rules.RULE_MISSING_BUILDING)
      await runRule('RULE_MISSING_BUILDING', () => ruleMissingBuilding(api!, modelId))

    if (rules.RULE_MISSING_STOREY)
      await runRule('RULE_MISSING_STOREY', () => ruleMissingStorey(api!, modelId, idx))

    if (rules.RULE_EMPTY_STOREY)
      await runRule('RULE_EMPTY_STOREY', () => ruleEmptyStorey(api!, modelId, idx))

    if (rules.RULE_FILE_DESCRIPTION_MISSING)
      await runRule('RULE_FILE_DESCRIPTION_MISSING', () => ruleFileDescriptionMissing(buffer))

    if (rules.RULE_FILE_AUTHOR_MISSING)
      await runRule('RULE_FILE_AUTHOR_MISSING', () => ruleFileAuthorMissing(buffer))

    if (rules.RULE_PROJECT_LONGNAME_MISSING)
      await runRule('RULE_PROJECT_LONGNAME_MISSING', () => ruleProjectLongNameMissing(api!, modelId))

    if (rules.RULE_STOREY_ELEVATION_MISSING)
      await runRule('RULE_STOREY_ELEVATION_MISSING', () => ruleStoreyElevationMissing(api!, modelId, idx))

    if (rules.RULE_ISO19650_PROJECT_INFO)
      await runRule('RULE_ISO19650_PROJECT_INFO', () => ruleIso19650ProjectInfo(api!, modelId))

    if (rules.RULE_ISO19650_AUTHOR_INFO)
      await runRule('RULE_ISO19650_AUTHOR_INFO', () => ruleIso19650AuthorInfo(buffer))

    if (rules.RULE_ISO19650_FILENAME)
      await runRule('RULE_ISO19650_FILENAME', () =>
        ruleIso19650Filename(buffer, rules.iso19650FilenamePattern),
      )

    // ── Sprint V4 rules ──────────────────────────────────────────────
    const lodLvl = rules.lodLevel ?? 300
    if (rules.RULE_MISSING_CLASSIFICATION)
      await runRule('RULE_MISSING_CLASSIFICATION', () =>
        ruleMissingClassification(api!, modelId, idx, rules.classificationSystems ?? []),
      )
    if (rules.RULE_LOD_PSET_MISSING)
      await runRule('RULE_LOD_PSET_MISSING', () => ruleLodPsetMissing(api!, modelId, idx, lodLvl))
    if (rules.RULE_LOD_QUANTITY_MISSING)
      await runRule('RULE_LOD_QUANTITY_MISSING', () => ruleLodQuantityMissing(api!, modelId, idx, lodLvl))
    if (rules.RULE_LOD_MATERIAL_LAYER_MISSING)
      await runRule('RULE_LOD_MATERIAL_LAYER_MISSING', () => ruleLodMaterialLayerMissing(api!, modelId, idx, lodLvl))
    if (rules.RULE_MEP_SYSTEM_MISSING)
      await runRule('RULE_MEP_SYSTEM_MISSING', () => ruleMepSystemMissing(api!, modelId, idx))
    if (rules.RULE_CLASH_MEP_STRUCTURAL) {
      const rulesBeforeClash = completedRules
      try {
        const clashResult = await ruleClashMepStructural(api!, modelId, idx, (innerPct) => {
          // Emit granular progress during the O(M×N) loop so the UI bar moves smoothly
          const p = Math.round(((rulesBeforeClash + innerPct) / totalRules) * 100)
          post({ type: 'partial', id, ruleId: 'RULE_CLASH_MEP_STRUCTURAL', issues: [], progress: p })
        })
        allIssues.push(...clashResult.issues)
        if (clashResult.cap) clashCap = clashResult.cap
        completedRules++
        post({ type: 'partial', id, ruleId: 'RULE_CLASH_MEP_STRUCTURAL', issues: clashResult.issues, progress: Math.round(completedRules / totalRules * 100), status: 'ok' })
      } catch (err: unknown) {
        // Previously unwrapped: a throw here escaped to the outer catch and turned
        // the ENTIRE run into one error message, discarding every rule that had
        // already passed. Mark just this rule failed and let the rest stand.
        completedRules++
        const error = (err instanceof Error ? err.message : String(err)).slice(0, 300)
        log.warn('RULE_CLASH_MEP_STRUCTURAL threw unexpectedly — marking failed:', err)
        post({ type: 'partial', id, ruleId: 'RULE_CLASH_MEP_STRUCTURAL', issues: [], progress: Math.round(completedRules / totalRules * 100), status: 'failed', error })
      }
    }
    const th = rules.thresholds
    if (rules.RULE_PROXY_OVERUSE)
      await runRule('RULE_PROXY_OVERUSE', () => ruleProxyOveruse(api!, modelId, idx,
        th?.proxyOverusePct != null ? th.proxyOverusePct / 100 : undefined))
    if (rules.RULE_COORDINATE_OFFSET)
      await runRule('RULE_COORDINATE_OFFSET', () => ruleCoordinateOffset(api!, modelId,
        th?.coordinateOffsetKm != null ? th.coordinateOffsetKm * 1000 : undefined))
    if (rules.RULE_FILE_SIZE_ANOMALY)
      await runRule('RULE_FILE_SIZE_ANOMALY', () => ruleFileSizeAnomaly(api!, modelId, buffer,
        th?.fileSizePerElementKB != null ? th.fileSizePerElementKB * 1000 : undefined))
    // ── Sprint V6 rules ──────────────────────────────────────────────
    if (rules.RULE_OPENING_WITHOUT_HOST)
      await runRule('RULE_OPENING_WITHOUT_HOST', () => ruleOpeningWithoutHost(api!, modelId, idx))
    if (rules.RULE_STOREY_ELEVATION_DUPLICATE)
      await runRule('RULE_STOREY_ELEVATION_DUPLICATE', () => ruleStoreyElevationDuplicate(api!, modelId, idx))
    if (rules.RULE_UNIT_CONSISTENCY)
      await runRule('RULE_UNIT_CONSISTENCY', () => ruleUnitConsistency(api!, modelId))
    if (rules.RULE_SPACE_AREA_MISSING)
      await runRule('RULE_SPACE_AREA_MISSING', () => ruleSpaceAreaMissing(api!, modelId, idx))
    if (rules.RULE_CONNECTED_MEP)
      await runRule('RULE_CONNECTED_MEP', () => ruleConnectedMep(api!, modelId, idx))
    if (rules.RULE_STOREY_ELEVATION_ORDER)
      await runRule('RULE_STOREY_ELEVATION_ORDER', () => ruleStoreyElevationOrder(api!, modelId, idx))

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
      ...(clashCap ? { metadata: { clashCapped: clashCap } } : {}),
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

    const idx   = buildSpatialIndex(api, modelId)
    const tree  = buildTree(api, modelId, idx)
    const decomp = buildDecompMap(idx)
    post({ type: 'tree',      id, tree, decomp })
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

// ── COBie extraction (F5 P2) ──────────────────────────────────────────────────
// Same open→walk→close skeleton as handleComputeTakeoff: this worker already
// owns the WASM + traversal, so COBie is a message type, NOT a 9th worker
// (each worker costs ~3-4 MB of WASM — T-F5 pinned decision). Coverage grows
// with TYPE_NAME: classes the validator does not map yet are simply not rows.
async function handleExtractCobie(msg: ExtractCobieMessage): Promise<void> {
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

    const rows: CobieRow[] = []
    const pushLines = (typeHash: number, ifcClass: string, sheet: CobieSheet): void => {
      const ids = api!.GetLineIDsWithType(modelId, typeHash)
      for (let i = 0; i < ids.size(); i++) {
        const eid = ids.get(i)
        try {
          const line = api!.GetLine(modelId, eid, false) as {
            GlobalId?: MaybeString
            Name?: MaybeString
            /** IfcPerson has no Name — identify by FamilyName/Identification. */
            FamilyName?: MaybeString
            Identification?: MaybeString
          }
          const name = getStr(line.Name) || getStr(line.FamilyName) || getStr(line.Identification) || null
          rows.push({
            sheet,
            expressId: eid,
            ifcClass,
            globalId: getStr(line.GlobalId) || null,
            name,
          })
        } catch { /* malformed line — skip, never abort the extraction */ }
      }
    }

    for (const [hash, className] of Object.entries(TYPE_NAME)) {
      const sheet = cobieSheetFor(className)
      if (sheet) pushLines(Number(hash), className, sheet)
    }
    // Contacts come from header entities, outside TYPE_NAME's element map.
    pushLines(IFCPERSON, 'IfcPerson', 'Contact')
    pushLines(IFCORGANIZATION, 'IfcOrganization', 'Contact')

    // Per-sheet honesty counters (the FM-readiness badge aggregates these —
    // it is NOT a new validator rule; the canonical rule count stays put).
    const counts: Record<string, { rows: number; named: number; withGuid: number }> = {}
    for (const r of rows) {
      const c = (counts[r.sheet] ??= { rows: 0, named: 0, withGuid: 0 })
      c.rows++
      if (r.name) c.named++
      if (r.globalId) c.withGuid++
    }

    post({ type: 'cobie-done', id, result: { rows, counts, durationMs: Date.now() - startTime } })
  } catch (err: unknown) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : 'COBie extraction failed' })
  } finally {
    if (api && modelId !== -1) {
      try { api.CloseModel(modelId) } catch (err: unknown) { log.debug('handleExtractCobie: CloseModel failed:', err) }
    }
  }
}

self.onmessage = (e: MessageEvent<ValidateMessage | BuildTreeMessage | ComputeTakeoffMessage | ExtractCobieMessage>): void => {
  if (e.data.type === 'validate')        void handleValidate(e.data as ValidateMessage)
  if (e.data.type === 'build-tree')      void handleBuildTree(e.data as BuildTreeMessage)
  if (e.data.type === 'compute-takeoff') void handleComputeTakeoff(e.data as ComputeTakeoffMessage)
  if (e.data.type === 'extract-cobie')   void handleExtractCobie(e.data as ExtractCobieMessage)
}

// ── Message types ─────────────────────────────────────────────────────────────

interface ValidateMessage {
  type: 'validate'
  id: string
  buffer: ArrayBuffer
  rules: RulesConfig
  /** When true, skip spatial tree building (used for worker-pool secondary workers). */
  skipTree?: boolean
}

interface BuildTreeMessage {
  type: 'build-tree'
  id: string
  buffer: ArrayBuffer
}

interface ExtractCobieMessage {
  type: 'extract-cobie'
  id: string
  buffer: ArrayBuffer
}

interface ComputeTakeoffMessage {
  type: 'compute-takeoff'
  id: string
  buffer: ArrayBuffer
}

export type ValidatorOutMessage =
  | { type: 'tree';         id: string; tree: SpatialNode[]; decomp?: [number, number[]][] }
  | { type: 'tree-done';    id: string }
  | { type: 'partial';      id: string; ruleId: string; issues: ValidationIssue[]; progress: number; status?: 'ok' | 'failed'; error?: string }
  | { type: 'done';         id: string; result: ValidationResult }
  | { type: 'takeoff-done'; id: string; result: TakeoffResult }
  | { type: 'cobie-done';   id: string; result: CobieExtractResult }
  | { type: 'error';        id: string; message: string }
