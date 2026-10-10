// ─── twin-sources ─────────────────────────────────────────────────────────────
// The app side of the twin index: turn what is loaded — vector layers, IFC
// spatial trees, point clouds — into TwinEntity rows, keep one index current,
// and know how to "go to" any entity a search or a link points at.
//
// The index is rebuilt lazily, only when something it indexes changed (a layer
// added or restyled in height, a model or a scan loaded). Building is O(total
// properties); a 20 000-feature layer indexes in well under a second.

import { useVectorLayerStore, type VectorLayer } from '../../stores/vectorLayerStore'
import { useValidationStore } from '../../stores/validationStore'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { modelRegistry } from '../model-registry'
import { flattenProperties, inferSchema, labelOf, type FlatProp } from './flatten-props'
import { TwinIndex, entityKey, type TwinEntity, type TwinRef, type TwinShape, type PlanPoint } from './twin-index'
import { projectedFeatures, focusVectorFeature, frameSceneBox } from '../layers/vector-runner'
import type { SpatialNode } from '../../types'
import type { ScenePoint } from '../geo/scene-anchor'

export interface TwinHost {
  getModelBounds(modelId: string): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
  getCloudBounds(cloudId: string): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null
  selectIfcElement(modelId: string, expressId: number): void
  /** Psets + world box per element (viewer.getElementsDetail). Optional: without it IFC is indexed by name only. */
  getElementsDetail?(ids: number[], modelId: string): Promise<Array<{
    expressId: number
    data: import('../viewer').IFCItemData | null
    box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null
  }>>
}

// ── IFC enrichment (background) ────────────────────────────────────────────────
//
// The spatial tree gives every element a name and a class for free. Psets and
// a position cost a fragments query per element, so they are fetched in the
// background, in batches, and the index is rebuilt as they land: search works
// at once and gets better while the user types.

interface ElementDetail { props: Record<string, unknown>; shape?: TwinShape }

const detailByModel = new Map<string, Map<number, ElementDetail>>()
const enrichment = new Map<string, 'running' | 'done'>()
let detailVersion = 0
const listeners = new Set<() => void>()

/** Called whenever the index gained data (enrichment progress). */
export function onTwinIndexChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Elements fetched per round; the index is rebuilt after each one. */
const ENRICH_ROUND = 1500
/** Elements per model we are willing to enrich. Past it, names only. */
const ENRICH_CAP = 30_000

function elementIds(roots: SpatialNode[]): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  const visit = (n: SpatialNode): void => {
    for (const id of [n.expressId, ...n.containedElements.flatMap((e) => [e.expressId, ...(e.parts ?? []).map((p) => p.expressId)])]) {
      if (!seen.has(id)) { seen.add(id); ids.push(id) }
    }
    n.children.forEach(visit)
  }
  roots.forEach(visit)
  return ids
}

function detailProps(d: import('../viewer').IFCItemData): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Name: d.name, LongName: d.longName, Description: d.description, GlobalId: d.globalId,
    ObjectType: d.objectType, Tag: d.tag, Storey: d.storey, Type: d.typeName,
  }
  for (const ps of [...d.typeProperties, ...d.propertySets]) {
    const o: Record<string, unknown> = (props[ps.name] as Record<string, unknown>) ?? {}
    for (const p of ps.properties) o[p.name] = p.value
    props[ps.name] = o
  }
  for (const qs of d.quantitySets) {
    props[qs.name] = Object.fromEntries(qs.quantities.map((q) => [q.name, q.value]))
  }
  if (d.materials.length) props.Material = d.materials.map((m) => (m as { name?: string }).name ?? String(m))
  return props
}

/** Start (once per model) fetching Psets and positions for every element. */
export function enrichIfc(host: TwinHost): void {
  if (!host.getElementsDetail) return
  const trees = useValidationStore.getState().spatialTrees
  for (const [modelId, roots] of Object.entries(trees)) {
    if (!roots?.length || enrichment.has(modelId)) continue
    enrichment.set(modelId, 'running')
    void (async () => {
      const ids = elementIds(roots).slice(0, ENRICH_CAP)
      const map = new Map<number, ElementDetail>()
      detailByModel.set(modelId, map)
      for (let i = 0; i < ids.length; i += ENRICH_ROUND) {
        // A model unloaded half-way: stop, and let a reload start over.
        if (!useValidationStore.getState().spatialTrees[modelId]) {
          enrichment.delete(modelId); detailByModel.delete(modelId); return
        }
        let rows: Awaited<ReturnType<NonNullable<TwinHost['getElementsDetail']>>> = []
        try { rows = await host.getElementsDetail!(ids.slice(i, i + ENRICH_ROUND), modelId) } catch { /* names only */ }
        for (const r of rows) {
          map.set(r.expressId, {
            props: r.data ? detailProps(r.data) : {},
            shape: r.box ? { type: 'box', pts: [{ x: r.box.min.x, z: r.box.min.z }, { x: r.box.max.x, z: r.box.max.z }] } : undefined,
          })
        }
        detailVersion++
        listeners.forEach((cb) => cb())
      }
      enrichment.set(modelId, 'done')
    })()
  }
}

/** Progress for the UI: models still being enriched. */
export function ifcEnrichmentRunning(): boolean {
  return [...enrichment.values()].includes('running')
}

/** Cap on vertices kept per feature for spatial links — enough to follow a route. */
const MAX_SHAPE_PTS = 256

function sample(pts: ScenePoint[]): PlanPoint[] {
  const step = Math.max(1, Math.ceil(pts.length / MAX_SHAPE_PTS))
  const out: PlanPoint[] = []
  for (let i = 0; i < pts.length; i += step) out.push({ x: pts[i].x, z: pts[i].z })
  const last = pts[pts.length - 1]
  if (last && (out.length === 0 || out[out.length - 1].x !== last.x || out[out.length - 1].z !== last.z)) out.push({ x: last.x, z: last.z })
  return out
}

function vectorEntities(layer: VectorLayer): TwinEntity[] {
  const data = layer.data
  if (!data || layer.status !== 'ready') return []
  const flat = data.features.map((f) => flattenProperties(f.properties))
  const schema = inferSchema(flat)
  const projected = projectedFeatures(layer)
  return data.features.map((f, i) => {
    const p = projected?.[i]
    let shape: TwinShape | undefined
    if (p) {
      if (p.type === 'point') shape = { type: 'point', pts: sample(p.lists.flat()) }
      else if (p.type === 'line') shape = { type: 'line', pts: sample(p.lists.flat()) }
      else if (p.lists[0]) shape = { type: 'polygon', pts: sample(p.lists[0]) }
    }
    return {
      ref: { source: 'vector', sourceId: layer.id, localId: String(i) },
      stableKey: `vector::${layer.name}::${f.id}`,
      label: labelOf(flat[i], schema) ?? `${layer.name} #${i + 1}`,
      kind: f.geometry.type,
      sourceLabel: layer.name,
      props: flat[i],
      schema,
      shape,
    }
  })
}

function ifcEntities(modelId: string, roots: SpatialNode[], host: TwinHost): TwinEntity[] {
  const fileName = modelRegistry.get(modelId)?.fileName ?? modelId
  const out: TwinEntity[] = []
  const b = host.getModelBounds(modelId)
  // The model as a whole is what has a place: its footprint links it to the
  // routes, zones and scans around it. Elements link by value (names, tags).
  out.push({
    ref: { source: 'ifc', sourceId: modelId, localId: '' },
    stableKey: `ifc::${fileName}`,
    label: fileName, kind: 'IfcModel', sourceLabel: fileName,
    props: flattenProperties({ file: fileName }),
    shape: b ? {
      type: 'box',
      pts: [{ x: b.center.x - b.size.x / 2, z: b.center.z - b.size.z / 2 }, { x: b.center.x + b.size.x / 2, z: b.center.z + b.size.z / 2 }],
    } : undefined,
  })
  const seen = new Set<number>()
  const details = detailByModel.get(modelId)
  const visit = (n: SpatialNode): void => {
    const add = (expressId: number, ifcClass: string, props: Record<string, unknown>, name: string): void => {
      if (seen.has(expressId)) return
      seen.add(expressId)
      const detail = details?.get(expressId)
      const flat: FlatProp[] = flattenProperties(detail ? { ...props, ...detail.props } : props)
      out.push({
        ref: { source: 'ifc', sourceId: modelId, localId: String(expressId) },
        // GlobalId is THE stable identity of an IFC element, across exports too.
        stableKey: props.GlobalId ? `ifc::${String(props.GlobalId)}` : `ifc::${fileName}::${expressId}`,
        label: name || ifcClass, kind: ifcClass, sourceLabel: fileName, props: flat,
        // Spatial structure (site, building, storey) is not a place to link
        // to: its box is the whole model, which the model entity covers.
        shape: /^Ifc(Project|Site|Building|BuildingStorey)$/i.test(ifcClass) ? undefined : detail?.shape,
      })
    }
    add(n.expressId, n.ifcClass, {
      Name: n.name, LongName: n.longName, Description: n.description, GlobalId: n.globalId,
    }, n.longName || n.name)
    for (const el of n.containedElements) {
      add(el.expressId, el.ifcClass, { Name: el.name, GlobalId: el.globalId }, el.name)
      for (const p of el.parts ?? []) add(p.expressId, p.ifcClass, { Name: p.name, GlobalId: p.globalId }, p.name)
    }
    n.children.forEach(visit)
  }
  roots.forEach(visit)
  return out
}

function cloudEntities(host: TwinHost): TwinEntity[] {
  return usePointCloudStore.getState().clouds
    .filter((c) => c.status === 'ready')
    .map((c) => {
      const b = host.getCloudBounds(c.id)
      return {
        ref: { source: 'pointcloud', sourceId: c.id, localId: '' } as TwinRef,
        stableKey: `pointcloud::${c.fileName}`,
        label: c.fileName, kind: 'pointcloud', sourceLabel: c.fileName,
        props: flattenProperties({ format: c.format, points: c.pointCount, crs: c.frame?.epsgCode ?? null }),
        shape: b ? { type: 'box', pts: [{ x: b.min.x, z: b.min.z }, { x: b.max.x, z: b.max.z }] } : undefined,
      } satisfies TwinEntity
    })
}

let cache: { key: string; index: TwinIndex } | null = null

function versionKey(): string {
  const layers = useVectorLayerStore.getState().layers
    // fetchedAt in 10 s buckets: live layers re-index, but not on every 2 s tick.
    .map((l) => `${l.id}:${l.status}:${l.heightMode}:${l.data ? l.data.features.length : 0}:${Math.floor(l.fetchedAt / 10_000)}`).join('|')
  const trees = useValidationStore.getState().spatialTrees
  const treeKey = Object.keys(trees).map((k) => `${k}:${trees[k]?.length ?? 0}`).join('|')
  const clouds = usePointCloudStore.getState().clouds.map((c) => `${c.id}:${c.status}`).join('|')
  return `${layers}#${treeKey}#${clouds}#${detailVersion}`
}

/** The index over everything loaded right now (rebuilt only when that changed). */
export function getTwinIndex(host: TwinHost): TwinIndex {
  const key = versionKey()
  if (cache && cache.key === key) return cache.index
  const entities: TwinEntity[] = []
  for (const l of useVectorLayerStore.getState().layers) entities.push(...vectorEntities(l))
  const trees = useValidationStore.getState().spatialTrees
  for (const [modelId, roots] of Object.entries(trees)) {
    if (roots?.length) entities.push(...ifcEntities(modelId, roots, host))
  }
  entities.push(...cloudEntities(host))
  cache = { key, index: new TwinIndex(entities) }
  return cache.index
}

/** Drop the cached index (e.g. after the scene anchor moved). */
export function invalidateTwinIndex(): void { cache = null }

/** Move the view to an entity, selecting it where the source supports it. */
export async function focusTwinEntity(e: TwinEntity, host: TwinHost): Promise<void> {
  const { source, sourceId, localId } = e.ref
  if (source === 'vector') { await focusVectorFeature(sourceId, Number(localId)); return }
  if (source === 'ifc' && localId) { host.selectIfcElement(sourceId, Number(localId)); return }
  if (source === 'ifc') {
    const b = host.getModelBounds(sourceId)
    if (b) {
      await frameSceneBox(
        { x: b.center.x - b.size.x / 2, y: b.center.y - b.size.y / 2, z: b.center.z - b.size.z / 2 },
        { x: b.center.x + b.size.x / 2, y: b.center.y + b.size.y / 2, z: b.center.z + b.size.z / 2 },
      )
    }
    return
  }
  if (source === 'pointcloud') {
    const b = host.getCloudBounds(sourceId)
    if (b) await frameSceneBox(b.min, b.max)
  }
}

/** The reference a user-made link is stored against. */
export function stableRefOf(e: TwinEntity): import('../../stores/twinLinkStore').StableRef {
  return { source: e.ref.source, key: e.stableKey ?? entityKey(e.ref), label: e.label }
}
