// ─── ids-gather.ts ────────────────────────────────────────────────────────────
// Element gathering for IDS checks: walks an OPEN web-ifc model and produces the
// normalized IdsElement[] the pure engine consumes. Extracted from ids.worker.ts
// (P0-1) so the buildingSMART fixture suite can exercise the REAL gather logic
// in vitest (web-ifc resolves to its Node build there via the `node` condition).
//
// ⚠ This module imports `web-ifc` at runtime. It must only ever be imported by
//   ids.worker.ts and by tests — importing it from main-thread code would pull
//   the whole web-ifc bundle into the app (the worker is the only place that
//   runs WASM in production; see IDS_IMPLEMENTATION_PLAN.md §1.3).
//
// The caller owns the IfcAPI lifecycle (Init/OpenModel/CloseModel). Hooks make
// the chunked loops observable: the worker injects progress posts, event-loop
// yields (required for cancel-message delivery) and cancellation checks; tests
// pass no hooks and the loops run straight through.

import {
  IFCRELDEFINESBYPROPERTIES, IFCRELDEFINESBYTYPE,
  IFCRELASSOCIATESCLASSIFICATION, IFCRELASSOCIATESMATERIAL,
  IFCRELAGGREGATES, IFCRELNESTS, IFCRELCONTAINEDINSPATIALSTRUCTURE,
  IFCRELVOIDSELEMENT, IFCRELFILLSELEMENT, IFCRELASSIGNSTOGROUP,
} from 'web-ifc'
import type { IfcAPI } from 'web-ifc'
import type { IdsDocument, IdsElement, IdsFacet } from './ids-types'

type PropValue = string | number | boolean | null
type PsetMap = Record<string, Record<string, PropValue>>
type PsetTypeMap = Record<string, Record<string, string>>
type PsetListMap = Record<string, Record<string, PropValue[]>>
/** Property values + IFC value type names (P2-5) + multi-value candidate lists (P2-7), kept in parallel. */
interface PsetData { values: PsetMap; types: PsetTypeMap; lists: PsetListMap }

const SPATIAL = new Set(['IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE', 'IFCZONE'])

// Chunk sizes: between chunks the worker yields + checks the cancel flag + posts
// progress. Gather progress is reported on the protocol's absolute scale
// (phase weights, plan §4.2): psets 20→35 %, element walk 35→75 %.
const PSET_REL_CHUNK = 2_000
const GATHER_CHUNK = 5_000

export interface GatherHooks {
  /** Absolute protocol progress in [20, 75]. */
  onProgress?: (pct: number) => void
  /** Yield one macrotask between chunks (worker: lets `cancel` messages land). */
  yieldNow?: () => Promise<void>
  /** Throw (e.g. CancelledError) to abort between chunks. */
  throwIfCancelled?: () => void
}

function val(v: unknown): string | number | boolean | null {
  if (v == null) return null
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    // web-ifc wraps typed values as `{ value }`; measures may instead expose
    // `_representationValue` (e.g. IfcLengthMeasure on bounded/table props).
    const inner = 'value' in o ? o.value : '_representationValue' in o ? o._representationValue : undefined
    return (typeof inner === 'string' || typeof inner === 'number' || typeof inner === 'boolean') ? inner : null
  }
  return (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') ? v : null
}

function canon(s: string): string {
  return s.toUpperCase().replace('STANDARDCASE', '').replace('ELEMENTEDCASE', '')
}

/** Classes named by entity applicability facets; null = must gather everything. */
function targetClasses(doc: IdsDocument): Set<string> | null {
  const set = new Set<string>()
  for (const spec of doc.specifications) {
    const entity = spec.applicability.find((f) => f.kind === 'entity')
    if (!entity || entity.kind !== 'entity') return null // no entity → can't narrow
    const name = entity.name
    if ('simpleValue' in name) set.add(canon(name.simpleValue))
    else if (name.restriction.enumeration) name.restriction.enumeration.forEach((e) => set.add(canon(e)))
    else return null // pattern/open restriction → gather everything
  }
  return set
}

/** IFC type name of a wrapped value (web-ifc exposes it as `.name`, e.g. "IFCTIMEMEASURE"). */
function valueTypeName(v: unknown): string | null {
  if (v == null || typeof v !== 'object') return null
  const named = (v as { name?: unknown }).name
  if (typeof named === 'string' && named) return named.toUpperCase()
  const ctor = (v as { constructor?: { name?: string } }).constructor?.name
  return ctor && ctor !== 'Object' ? ctor.toUpperCase() : null
}

/**
 * Every candidate value a property exposes (P2-7). buildingSMART semantics: a
 * property value-check passes if ANY candidate matches. The first candidate is
 * the representative one (presence + dataType); `list` carries the rest for the
 * any-match engine path. Covers every IfcSimpleProperty value shape:
 *  - single   → NominalValue
 *  - enumerated → EnumerationValues[]
 *  - list     → ListValues[]
 *  - bounded  → SetPointValue / UpperBoundValue / LowerBoundValue
 *  - table    → DefiningValues[] + DefinedValues[]
 */
function propertyValues(p: Record<string, unknown>): { primary: PropValue; type: string | null; list?: PropValue[] } {
  const raw: unknown[] = []
  const pushArr = (a: unknown): void => { if (Array.isArray(a)) raw.push(...a) }

  if ('NominalValue' in p && p.NominalValue != null) raw.push(p.NominalValue)
  pushArr(p.EnumerationValues)
  pushArr(p.ListValues)
  for (const k of ['SetPointValue', 'UpperBoundValue', 'LowerBoundValue']) if (p[k] != null) raw.push(p[k])
  pushArr(p.DefiningValues)
  pushArr(p.DefinedValues)

  if (raw.length === 0) return { primary: null, type: null }
  const list = raw.map(val)
  const type = raw.map(valueTypeName).find((t) => t != null) ?? null
  return { primary: list[0], type, ...(list.length > 1 ? { list } : {}) }
}

/** Read one IfcPropertySetDefinition line (pset or quantity set) → name + props (+ value types P2-5, + multi-value lists P2-7). */
function readPsetDefinition(
  api: IfcAPI, modelId: number, defId: number,
): { name: string; props: Record<string, PropValue>; types: Record<string, string>; lists: Record<string, PropValue[]> } | null {
  const def = api.GetLine(modelId, defId, false) as {
    Name?: { value: string }
    HasProperties?: Array<{ value: number } | null>
    HasQuantities?: Array<{ value: number } | null>
  }
  const setName = def.Name?.value
  if (!setName) return null
  const props: Record<string, PropValue> = {}
  const types: Record<string, string> = {}
  const lists: Record<string, PropValue[]> = {}
  for (const ref of def.HasProperties ?? []) {
    if (ref?.value == null) continue
    try {
      const p = api.GetLine(modelId, ref.value, false) as Record<string, unknown> & { Name?: { value: string } }
      const name = p.Name?.value
      if (!name) continue
      const { primary, type, list } = propertyValues(p)
      props[name] = primary
      if (type) types[name] = type
      if (list) lists[name] = list
    } catch { /* skip */ }
  }
  for (const ref of def.HasQuantities ?? []) {
    if (ref?.value == null) continue
    try {
      const q = api.GetLine(modelId, ref.value, false) as Record<string, unknown> & { Name?: { value: string } }
      const name = q.Name?.value
      if (!name) continue
      // quantities store the value under *Value (LengthValue, AreaValue, …)
      const key = Object.keys(q).find((k) => k.endsWith('Value') && k !== 'Name')
      props[name] = key ? val(q[key]) : null
      const t = key ? valueTypeName(q[key]) : null
      if (t) types[name] = t
    } catch { /* skip */ }
  }
  if (Object.keys(props).length === 0) return null
  return { name: setName, props, types, lists }
}

/** elementId → property values + value types. Progress: 20 → 30 %. */
async function buildPsetMap(
  api: IfcAPI, modelId: number, hooks: GatherHooks,
): Promise<Map<number, PsetData>> {
  const map = new Map<number, PsetData>()
  const relIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)
  const total = relIds.size()
  for (let i = 0; i < total; i++) {
    if (i > 0 && i % PSET_REL_CHUNK === 0) {
      hooks.onProgress?.(20 + (i / total) * 10)
      await hooks.yieldNow?.()
      hooks.throwIfCancelled?.()
    }
    try {
      const rel = api.GetLine(modelId, relIds.get(i), false) as {
        RelatingPropertyDefinition?: { value: number }
        RelatedObjects?: Array<{ value: number } | null>
      }
      const defId = rel.RelatingPropertyDefinition?.value
      if (defId == null || !rel.RelatedObjects) continue
      const def = readPsetDefinition(api, modelId, defId)
      if (!def) continue
      for (const ref of rel.RelatedObjects) {
        if (ref?.value == null) continue
        const existing = map.get(ref.value) ?? { values: {}, types: {}, lists: {} }
        existing.values[def.name] = { ...(existing.values[def.name] ?? {}), ...def.props }
        existing.types[def.name] = { ...(existing.types[def.name] ?? {}), ...def.types }
        existing.lists[def.name] = { ...(existing.lists[def.name] ?? {}), ...def.lists }
        map.set(ref.value, existing)
      }
    } catch { /* corrupt rel */ }
  }
  return map
}

/** Read a type object's HasPropertySets refs into PsetData. */
function readTypePsets(api: IfcAPI, modelId: number, refs: Array<{ value: number } | null> | undefined): PsetData {
  const data: PsetData = { values: {}, types: {}, lists: {} }
  for (const ref of refs ?? []) {
    if (ref?.value == null) continue
    try {
      const def = readPsetDefinition(api, modelId, ref.value)
      if (!def) continue
      data.values[def.name] = { ...(data.values[def.name] ?? {}), ...def.props }
      data.types[def.name] = { ...(data.types[def.name] ?? {}), ...def.types }
      data.lists[def.name] = { ...(data.lists[def.name] ?? {}), ...def.lists }
    } catch { /* skip corrupt pset */ }
  }
  return data
}

interface TypeInfo {
  psets: PsetData
  /** The type's effective predefined type (USERDEFINED resolved to ElementType/ProcessType). */
  predefinedType: string | null
}

/**
 * Type index (P2-1/P2-2): IFCRELDEFINESBYTYPE → RelatingType. Collects each
 * type's HasPropertySets (merged into occurrences at PROPERTY granularity) and
 * its effective PredefinedType (inherited by occurrences that declare none).
 * Progress: 30 → 35 %.
 */
async function buildTypeIndex(
  api: IfcAPI, modelId: number, hooks: GatherHooks,
): Promise<{ occToType: Map<number, number>; typeInfo: Map<number, TypeInfo> }> {
  const occToType = new Map<number, number>()
  const typeInfo = new Map<number, TypeInfo>()
  const relIds = api.GetLineIDsWithType(modelId, IFCRELDEFINESBYTYPE)
  const total = relIds.size()
  for (let i = 0; i < total; i++) {
    if (i > 0 && i % PSET_REL_CHUNK === 0) {
      hooks.onProgress?.(30 + (i / total) * 5)
      await hooks.yieldNow?.()
      hooks.throwIfCancelled?.()
    }
    try {
      const rel = api.GetLine(modelId, relIds.get(i), false) as {
        RelatingType?: { value: number }
        RelatedObjects?: Array<{ value: number } | null>
      }
      const typeId = rel.RelatingType?.value
      if (typeId == null || !rel.RelatedObjects) continue
      if (!typeInfo.has(typeId)) {
        let psets: PsetData = { values: {}, types: {}, lists: {} }
        let pt: string | null = null
        try {
          const typeLine = api.GetLine(modelId, typeId, false) as {
            HasPropertySets?: Array<{ value: number } | null>
            PredefinedType?: { value: string } | string
            ElementType?: { value: string }
            ProcessType?: { value: string }
          }
          psets = readTypePsets(api, modelId, typeLine.HasPropertySets)
          const raw = typeof typeLine.PredefinedType === 'string'
            ? typeLine.PredefinedType
            : (typeLine.PredefinedType?.value ?? null)
          if (raw === 'USERDEFINED') pt = typeLine.ElementType?.value ?? typeLine.ProcessType?.value ?? null
          else if (raw !== 'NOTDEFINED') pt = raw
        } catch { /* corrupt type line */ }
        typeInfo.set(typeId, { psets, predefinedType: pt })
      }
      for (const ref of rel.RelatedObjects) {
        if (ref?.value == null) continue
        occToType.set(ref.value, typeId)
      }
    } catch { /* corrupt rel */ }
  }
  return { occToType, typeInfo }
}

/** Facet kinds the document actually uses — lets the gather skip unneeded relationship passes. */
function facetKindsNeeded(doc: IdsDocument): Set<IdsFacet['kind']> {
  const kinds = new Set<IdsFacet['kind']>()
  for (const spec of doc.specifications) {
    for (const f of spec.applicability) kinds.add(f.kind)
    for (const r of spec.requirements) kinds.add(r.facet.kind)
  }
  return kinds
}

type ClassificationRef = NonNullable<IdsElement['classifications']>[number]

/**
 * Classification references per element (P3-1): walks each reference's
 * ReferencedSource chain collecting ancestor codes (`pathValues`) until the
 * terminal IfcClassification, whose Name is the `system`. Handles lightweight
 * associations (RelatingClassification = IfcClassification directly).
 */
async function buildClassificationMap(
  api: IfcAPI, modelId: number, hooks: GatherHooks,
): Promise<Map<number, ClassificationRef[]>> {
  const map = new Map<number, ClassificationRef[]>()
  const refCache = new Map<number, ClassificationRef>()

  const resolveRef = (refId: number): ClassificationRef => {
    const cached = refCache.get(refId)
    if (cached) return cached
    let system: string | null = null
    let value: string | null = null
    const pathValues: string[] = []
    let currentId: number | null = refId
    let first = true
    for (let depth = 0; depth < 16 && currentId != null; depth++) {
      let className: string
      let line: Record<string, unknown>
      try {
        className = String(api.GetNameFromTypeCode(api.GetLineType(modelId, currentId))).toUpperCase()
        line = api.GetLine(modelId, currentId, false) as Record<string, unknown>
      } catch { break }
      if (className === 'IFCCLASSIFICATION') {
        const n = val(line.Name)
        system = n != null ? String(n) : null
        break
      }
      // IfcClassificationReference: code = Identification (IFC4) / ItemReference (2x3)
      const code = val(line.Identification) ?? val(line.ItemReference) ?? val(line.Name)
      const codeStr = code != null && code !== '' ? String(code) : null
      if (first) { value = codeStr; first = false }
      else if (codeStr != null) pathValues.push(codeStr)
      const src = line.ReferencedSource as { value?: unknown } | null | undefined
      currentId = src && typeof src.value === 'number' ? src.value : null
    }
    const out: ClassificationRef = { system, value, ...(pathValues.length ? { pathValues } : {}) }
    refCache.set(refId, out)
    return out
  }

  const relIds = api.GetLineIDsWithType(modelId, IFCRELASSOCIATESCLASSIFICATION)
  const total = relIds.size()
  for (let i = 0; i < total; i++) {
    if (i > 0 && i % PSET_REL_CHUNK === 0) {
      hooks.onProgress?.(35)
      await hooks.yieldNow?.()
      hooks.throwIfCancelled?.()
    }
    try {
      const rel = api.GetLine(modelId, relIds.get(i), false) as {
        RelatingClassification?: { value: number }
        RelatedObjects?: Array<{ value: number } | null>
      }
      const clsId = rel.RelatingClassification?.value
      if (clsId == null || !rel.RelatedObjects) continue
      const ref = resolveRef(clsId)
      for (const r of rel.RelatedObjects) {
        if (r?.value == null) continue
        const arr = map.get(r.value) ?? []
        arr.push(ref)
        map.set(r.value, arr)
      }
    } catch { /* corrupt rel */ }
  }
  return map
}

/**
 * Material names per element (P3-2): resolves every IfcMaterialSelect shape
 * (material, layer/profile/constituent sets ± usage indirection, lists) and
 * collects all reachable Names + Categories — an IDS material value matches any
 * of them.
 */
async function buildMaterialMap(
  api: IfcAPI, modelId: number, hooks: GatherHooks,
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>()
  const matCache = new Map<number, string[]>()

  const nameOf = (line: Record<string, unknown>, key: string): string | null => {
    const v = val(line[key])
    return v != null && v !== '' ? String(v) : null
  }
  const push = (arr: string[], n: string | null): void => {
    if (n != null && !arr.includes(n)) arr.push(n)
  }

  const resolveMaterial = (id: number, depth: number): string[] => {
    if (depth > 8) return []
    const cached = matCache.get(id)
    if (cached) return cached
    const names: string[] = []
    matCache.set(id, names) // pre-set: breaks reference cycles
    let className: string
    let line: Record<string, unknown>
    try {
      className = String(api.GetNameFromTypeCode(api.GetLineType(modelId, id))).toUpperCase()
      line = api.GetLine(modelId, id, false) as Record<string, unknown>
    } catch { return names }

    const followRef = (key: string): void => {
      const ref = line[key] as { value?: unknown } | null | undefined
      if (ref && typeof ref.value === 'number') for (const n of resolveMaterial(ref.value, depth + 1)) push(names, n)
    }
    const followList = (key: string): void => {
      const list = line[key]
      if (!Array.isArray(list)) return
      for (const ref of list) {
        const v = (ref as { value?: unknown } | null)?.value
        if (typeof v === 'number') for (const n of resolveMaterial(v, depth + 1)) push(names, n)
      }
    }

    switch (className) {
      case 'IFCMATERIAL':
        push(names, nameOf(line, 'Name')); push(names, nameOf(line, 'Category')); break
      case 'IFCMATERIALLAYERSETUSAGE':
        followRef('ForLayerSet'); break
      case 'IFCMATERIALLAYERSET':
        push(names, nameOf(line, 'LayerSetName')); followList('MaterialLayers'); break
      case 'IFCMATERIALLAYER':
        push(names, nameOf(line, 'Name')); push(names, nameOf(line, 'Category')); followRef('Material'); break
      case 'IFCMATERIALPROFILESETUSAGE':
        followRef('ForProfileSet'); break
      case 'IFCMATERIALPROFILESET':
        push(names, nameOf(line, 'Name')); followList('MaterialProfiles'); break
      case 'IFCMATERIALPROFILE':
        push(names, nameOf(line, 'Name')); push(names, nameOf(line, 'Category')); followRef('Material'); break
      case 'IFCMATERIALCONSTITUENTSET':
        push(names, nameOf(line, 'Name')); followList('MaterialConstituents'); break
      case 'IFCMATERIALCONSTITUENT':
        push(names, nameOf(line, 'Name')); push(names, nameOf(line, 'Category')); followRef('Material'); break
      case 'IFCMATERIALLIST':
        followList('Materials'); break
      default:
        push(names, nameOf(line, 'Name'))
    }
    return names
  }

  const relIds = api.GetLineIDsWithType(modelId, IFCRELASSOCIATESMATERIAL)
  const total = relIds.size()
  for (let i = 0; i < total; i++) {
    if (i > 0 && i % PSET_REL_CHUNK === 0) {
      hooks.onProgress?.(37)
      await hooks.yieldNow?.()
      hooks.throwIfCancelled?.()
    }
    try {
      const rel = api.GetLine(modelId, relIds.get(i), false) as {
        RelatingMaterial?: { value: number }
        RelatedObjects?: Array<{ value: number } | null>
      }
      const matId = rel.RelatingMaterial?.value
      if (matId == null || !rel.RelatedObjects) continue
      // An unnamed material still records presence: the element gets a (possibly
      // empty) entry — `el.materials != null` is the presence signal downstream.
      const names = resolveMaterial(matId, 0)
      for (const r of rel.RelatedObjects) {
        if (r?.value == null) continue
        const arr = map.get(r.value) ?? []
        for (const n of names) if (!arr.includes(n)) arr.push(n)
        map.set(r.value, arr)
      }
    } catch { /* corrupt rel */ }
  }
  return map
}

type PartOfEdge = NonNullable<IdsElement['partOf']>[number]
const MAX_PARTOF_EDGES = 32

/** Whole-part edges per element (P3-3): the element is the PART, the edge records the WHOLE. */
async function buildPartOfMap(
  api: IfcAPI, modelId: number, hooks: GatherHooks,
): Promise<Map<number, PartOfEdge[]>> {
  const map = new Map<number, PartOfEdge[]>()
  const parentCache = new Map<number, { cls: string; pt: string | null } | null>()

  const parentInfo = (id: number): { cls: string; pt: string | null } | null => {
    if (parentCache.has(id)) return parentCache.get(id) ?? null
    let info: { cls: string; pt: string | null } | null = null
    try {
      const cls = String(api.GetNameFromTypeCode(api.GetLineType(modelId, id))).toUpperCase()
      const line = api.GetLine(modelId, id, false) as Record<string, unknown> & { PredefinedType?: { value: string } | string }
      let pt = typeof line.PredefinedType === 'string' ? line.PredefinedType : (line.PredefinedType?.value ?? null)
      if (pt === 'USERDEFINED') {
        const ud = val(line.ObjectType) ?? val(line.ElementType)
        if (ud != null && ud !== '') pt = String(ud)
      }
      info = { cls, pt }
    } catch { info = null }
    parentCache.set(id, info)
    return info
  }

  const addEdge = (childId: number, relation: string, parentId: number): void => {
    const arr = map.get(childId) ?? []
    if (arr.length >= MAX_PARTOF_EDGES) return
    const p = parentInfo(parentId)
    if (!p) return
    arr.push({ relation, parentClass: p.cls, parentPredefinedType: p.pt, parentExpressId: parentId })
    map.set(childId, arr)
  }

  // RelatedOpeningElement / RelatedBuildingElement are single refs — normalize.
  const passes = [
    { type: IFCRELAGGREGATES, relation: 'IFCRELAGGREGATES', parentKey: 'RelatingObject', childKey: 'RelatedObjects' },
    { type: IFCRELNESTS, relation: 'IFCRELNESTS', parentKey: 'RelatingObject', childKey: 'RelatedObjects' },
    { type: IFCRELCONTAINEDINSPATIALSTRUCTURE, relation: 'IFCRELCONTAINEDINSPATIALSTRUCTURE', parentKey: 'RelatingStructure', childKey: 'RelatedElements' },
    { type: IFCRELVOIDSELEMENT, relation: 'IFCRELVOIDSELEMENT', parentKey: 'RelatingBuildingElement', childKey: 'RelatedOpeningElement' },
    { type: IFCRELFILLSELEMENT, relation: 'IFCRELFILLSELEMENT', parentKey: 'RelatingOpeningElement', childKey: 'RelatedBuildingElement' },
    { type: IFCRELASSIGNSTOGROUP, relation: 'IFCRELASSIGNSTOGROUP', parentKey: 'RelatingGroup', childKey: 'RelatedObjects' },
  ] as const

  for (const pass of passes) {
    const relIds = api.GetLineIDsWithType(modelId, pass.type)
    const total = relIds.size()
    for (let i = 0; i < total; i++) {
      if (i > 0 && i % PSET_REL_CHUNK === 0) {
        hooks.onProgress?.(39)
        await hooks.yieldNow?.()
        hooks.throwIfCancelled?.()
      }
      try {
        const rel = api.GetLine(modelId, relIds.get(i), false) as Record<string, unknown>
        const parentRef = rel[pass.parentKey] as { value?: unknown } | null | undefined
        if (!parentRef || typeof parentRef.value !== 'number') continue
        const childrenRaw = rel[pass.childKey]
        const children = Array.isArray(childrenRaw) ? childrenRaw : [childrenRaw]
        for (const c of children) {
          const v = (c as { value?: unknown } | null)?.value
          if (typeof v === 'number') addEdge(v, pass.relation, parentRef.value)
        }
      } catch { /* corrupt rel */ }
    }
  }
  return map
}

/** Merge type psets under occurrence psets — occurrence wins per PROPERTY, not per pset. */
function mergeNested<T>(
  fromType: Record<string, Record<string, T>> | undefined,
  own: Record<string, Record<string, T>> | undefined,
): Record<string, Record<string, T>> {
  if (!fromType || Object.keys(fromType).length === 0) return own ?? {}
  const merged: Record<string, Record<string, T>> = {}
  for (const [name, props] of Object.entries(fromType)) merged[name] = { ...props }
  for (const [name, props] of Object.entries(own ?? {})) merged[name] = { ...(merged[name] ?? {}), ...props }
  return merged
}

/** Gather IdsElements from an open model. Progress: 20 → 75 %. */
export async function gatherIdsElements(
  api: IfcAPI, modelId: number, doc: IdsDocument, hooks: GatherHooks = {},
): Promise<IdsElement[]> {
  const targets = targetClasses(doc)
  const kinds = facetKindsNeeded(doc)
  const psetMap = await buildPsetMap(api, modelId, hooks)
  const { occToType, typeInfo } = await buildTypeIndex(api, modelId, hooks)
  // Relationship passes only for the facet kinds the document actually uses.
  const classMap = kinds.has('classification') ? await buildClassificationMap(api, modelId, hooks) : null
  const matMap = kinds.has('material') ? await buildMaterialMap(api, modelId, hooks) : null
  const partOfMap = kinds.has('partOf') ? await buildPartOfMap(api, modelId, hooks) : null
  const elements: IdsElement[] = []
  const allIds = api.GetAllLines(modelId)
  const total = allIds.size()

  for (let i = 0; i < total; i++) {
    if (i > 0 && i % GATHER_CHUNK === 0) {
      hooks.onProgress?.(35 + (i / total) * 40)
      await hooks.yieldNow?.()
      hooks.throwIfCancelled?.()
    }
    const id = allIds.get(i)
    let typeCode: number
    try { typeCode = api.GetLineType(modelId, id) } catch { continue }
    let className: string
    try { className = String(api.GetNameFromTypeCode(typeCode)).toUpperCase() } catch { continue }

    const include = targets ? targets.has(canon(className)) : (api.IsIfcElement(typeCode) || SPATIAL.has(className))
    if (!include) continue

    try {
      const line = api.GetLine(modelId, id, false) as Record<string, unknown> & {
        PredefinedType?: { value: string } | string
        HasPropertySets?: Array<{ value: number } | null>
      }

      // ALL scalar attributes of the line, generically (P2-2a): unwrap {value}
      // wrappers, keep nulls (unset attrs), skip entity refs (tape type 5),
      // lists and web-ifc metadata keys.
      const attributes: Record<string, string | number | boolean | null> = {}
      for (const [key, raw] of Object.entries(line)) {
        if (key === 'expressID' || key === 'type') continue
        if (raw === null || raw === undefined) { attributes[key] = null; continue }
        if (Array.isArray(raw)) continue
        if (typeof raw === 'object') {
          const o = raw as { value?: unknown; type?: number }
          if (o.type === 5) continue // entity reference, not a scalar attribute
          const v = o.value
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') attributes[key] = v
          else if (v == null) attributes[key] = null
          continue
        }
        if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') attributes[key] = raw
      }

      const typeId = occToType.get(id)
      const tInfo = typeId != null ? typeInfo.get(typeId) : undefined

      // PredefinedType resolution (P2-2c): USERDEFINED → the user label
      // (ObjectType on occurrences, ElementType/ProcessType on type objects);
      // null/NOTDEFINED → inherited from the relating type. The literal value
      // is kept in predefinedTypeRaw (an IDS may ask for "USERDEFINED" itself).
      const predefinedTypeRaw = typeof line.PredefinedType === 'string'
        ? line.PredefinedType
        : (line.PredefinedType?.value ?? null)
      let predefinedType: string | null = predefinedTypeRaw
      if (predefinedType === 'USERDEFINED') {
        const ud = attributes.ObjectType ?? attributes.ElementType ?? attributes.ProcessType
        if (ud != null && ud !== '') predefinedType = String(ud)
      } else if (predefinedType == null || predefinedType === 'NOTDEFINED') {
        predefinedType = tInfo?.predefinedType ?? predefinedType
      }

      // Inherited psets (P2-1): occurrences take their type's psets; a TYPE
      // object exposes its own HasPropertySets directly (bSI testcase
      // "inherited from the type 2/2" checks the IfcWallType itself).
      const fromType = tInfo != null
        ? tInfo.psets
        : (typeInfo.get(id)?.psets ?? (Array.isArray(line.HasPropertySets) ? readTypePsets(api, modelId, line.HasPropertySets) : undefined))

      const own = psetMap.get(id)

      // Classification/material associations on the TYPE propagate to its
      // occurrences (P3-1/P3-2); partOf edges are instance-level only.
      const ownCls = classMap?.get(id)
      const typeCls = typeId != null ? classMap?.get(typeId) : undefined
      const classifications = ownCls || typeCls ? [...(typeCls ?? []), ...(ownCls ?? [])] : undefined
      const ownMat = matMap?.get(id)
      const typeMat = typeId != null ? matMap?.get(typeId) : undefined
      const materials = ownMat || typeMat
        ? [...new Set([...(typeMat ?? []), ...(ownMat ?? [])])]
        : undefined
      const partOf = partOfMap?.get(id)

      elements.push({
        expressId: id,
        ifcClass: className,
        predefinedType,
        predefinedTypeRaw,
        name: attributes.Name != null ? String(attributes.Name) : null,
        attributes,
        psets: mergeNested(fromType?.values, own?.values),
        psetTypes: mergeNested(fromType?.types, own?.types),
        psetValueLists: mergeNested(fromType?.lists, own?.lists),
        ...(classifications ? { classifications } : {}),
        ...(materials ? { materials } : {}),
        ...(partOf ? { partOf } : {}),
      })
    } catch { /* skip corrupt element */ }
  }
  return elements
}
