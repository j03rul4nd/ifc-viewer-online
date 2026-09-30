// ─── compare/snapshot.ts ──────────────────────────────────────────────────────
// One read of an open web-ifc model → a ModelSnapshot. Reuses the IDS gather
// (same normalization the IDS engine checks against) with a document that asks
// for every relationship pass, then adds the two things a diff also needs: the
// spatial container name and a geometry fingerprint.
//
// ⚠ Imports web-ifc at runtime (through ids-gather) — only the snapshot worker
//   and tests may import this module. Main-thread code imports types.ts.

import { IFCPROJECT } from 'web-ifc'
import type { IfcAPI } from 'web-ifc'
import { gatherIdsElements, type GatherHooks } from '../ids/ids-gather'
import type { IdsDocument } from '../ids/ids-types'
import type { ModelSnapshot, SnapElement } from './types'

/**
 * A document that gathers EVERYTHING: no entity in the applicability, so every
 * element + spatial entity is collected, and one requirement of each
 * relationship kind, so the classification / material / partOf passes run.
 */
const GATHER_ALL: IdsDocument = {
  specifications: [{
    name: '__snapshot__',
    applicability: [],
    requirements: [
      { cardinality: 'optional', facet: { kind: 'classification' } },
      { cardinality: 'optional', facet: { kind: 'material' } },
      { cardinality: 'optional', facet: { kind: 'partOf' } },
    ],
  }],
}

const CONTAINED = 'IFCRELCONTAINEDINSPATIALSTRUCTURE'
const AGGREGATES = 'IFCRELAGGREGATES'
const SPATIAL = /^IFC(SITE|BUILDING|BUILDINGSTOREY|SPACE|FACILITY|FACILITYPART|BRIDGE|ROAD|RAILWAY|MARINEFACILITY)/

/** FNV-1a 32-bit — a fingerprint, not a security hash. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Container name for every element: its own spatial containment, or — for a
 * part (a stair flight, a curtain-wall panel) — the containment of the whole
 * it is aggregated into, a few levels up.
 */
export function resolveStoreys(elements: SnapElement[]): void {
  const byId = new Map(elements.map((e) => [e.expressId, e]))
  const direct = (e: SnapElement): number | undefined => e.partOf?.find((p) => p.relation === CONTAINED)?.parentExpressId
  const parentWhole = (e: SnapElement): number | undefined => e.partOf?.find((p) => p.relation === AGGREGATES)?.parentExpressId
  const label = (id: number): string | null => {
    const s = byId.get(id)
    if (!s) return null
    return (s.name || (s.attributes.LongName as string | null) || s.ifcClass) ?? null
  }
  for (const e of elements) {
    let cur: SnapElement | undefined = e
    let storey: string | null = null
    for (let depth = 0; cur && depth < 6; depth++) {
      const c = direct(cur)
      if (c != null) { storey = label(c); break }
      const up = parentWhole(cur)
      if (up == null) break
      const parent = byId.get(up)
      // A storey aggregated into a building: the element IS spatial — label it by its parent.
      if (parent && SPATIAL.test(parent.ifcClass) && SPATIAL.test(cur.ifcClass)) { storey = label(up); break }
      if (parent && SPATIAL.test(parent.ifcClass)) { storey = label(up); break }
      cur = parent
    }
    e.storey = storey
  }
}

export interface SnapshotHooks extends GatherHooks {
  /** Geometry pass progress, 0–1. */
  onGeometryProgress?: (fraction: number) => void
}

/** Per-element geometry fingerprint from web-ifc's mesh stream (no vertex reads). */
export function fingerprintGeometry(api: IfcAPI, modelId: number, onProgress?: (f: number) => void):
  Map<number, { h: string; c: [number, number, number] }> {
  const sizes = new Map<number, string>() // geometryExpressID → "v/i"
  const out = new Map<number, { h: string; c: [number, number, number] }>()
  api.StreamAllMeshes(modelId, (mesh, index, total) => {
    const parts: string[] = []
    let c: [number, number, number] | null = null
    const n = mesh.geometries.size()
    for (let i = 0; i < n; i++) {
      const pg = mesh.geometries.get(i)
      let sz = sizes.get(pg.geometryExpressID)
      if (sz === undefined) {
        try {
          const g = api.GetGeometry(modelId, pg.geometryExpressID)
          sz = `${g.GetVertexDataSize()}/${g.GetIndexDataSize()}`
          g.delete()
        } catch { sz = '?' }
        sizes.set(pg.geometryExpressID, sz)
      }
      const m = pg.flatTransformation
      // Rotation to 1e-4, translation to the millimetre: stable across
      // re-exports, sensitive to anything a person would call a change.
      const rot = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]].map((v) => Math.round(v * 1e4)).join(',')
      const tr = [m[12], m[13], m[14]].map((v) => Math.round(v * 1000)).join(',')
      parts.push(`${sz}@${rot};${tr}`)
      if (!c) c = [m[12], m[13], m[14]]
    }
    parts.sort()
    out.set(mesh.expressID, { h: fnv1a(parts.join('|')), c: c ?? [0, 0, 0] })
    if (onProgress && index % 500 === 0) onProgress(total ? index / total : 0)
  })
  return out
}

export interface SnapshotMeta {
  id: string
  fileName: string
  sourceBytes: number
  geometry: boolean
}

export async function buildSnapshot(
  api: IfcAPI, modelId: number, meta: SnapshotMeta, hooks: SnapshotHooks = {},
): Promise<ModelSnapshot> {
  let unreadable = 0
  const gathered = await gatherIdsElements(api, modelId, GATHER_ALL, {
    ...hooks,
    onUnreadable: () => { unreadable++; hooks.onUnreadable?.() },
  })
  // psetTypes are only used by dataType checks, which match leniently without
  // them; dropping them roughly halves a stored baseline.
  const elements: SnapElement[] = gathered.map(({ psetTypes: _t, ...rest }) => rest)
  resolveStoreys(elements)

  if (meta.geometry) {
    const geo = fingerprintGeometry(api, modelId, hooks.onGeometryProgress)
    for (const e of elements) e.geo = geo.get(e.expressId) ?? null
  }

  let schema: string | null = null
  try { schema = String(api.GetModelSchema(modelId)) || null } catch { /* unreadable header */ }
  let projectGid: string | null = null
  try {
    const ids = api.GetLineIDsWithType(modelId, IFCPROJECT)
    if (ids.size() > 0) {
      const p = api.GetLine(modelId, ids.get(0)) as { GlobalId?: { value?: string } }
      projectGid = p.GlobalId?.value ?? null
    }
  } catch { /* no project line */ }

  return {
    id: meta.id, fileName: meta.fileName, schema, projectGid,
    capturedAt: Date.now(), sourceBytes: meta.sourceBytes, geometry: meta.geometry,
    unreadable, elements,
  }
}
