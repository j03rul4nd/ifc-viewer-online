// ─── Federation session ⇄ manifest ────────────────────────────────────────────
// Pure glue between the live scene (sceneStore + federationStore) and the
// byte-free manifest (federation-manifest) / reconcile step. Saving builds a
// manifest from the scene; opening turns manifest + reconcile into a plan of
// what to load, what to park and what is missing. No I/O, no stores.

import type { ModelTransform } from '../types'
import {
  buildManifest, type FederationManifestV1, type ManifestModelInput, type RefId,
} from './federation-manifest'
import type { ReconcileResult } from './federation-reconcile'

export const FEDERATION_FILE_SUFFIX = '.ifcfed.json'

export interface SessionModel {
  id: string
  fileName: string
  fileSize: number
  visible: boolean
  transform?: ModelTransform
  placedByHand?: boolean
}

export interface SessionParked { id: string; fileName: string; fileSize: number }

export interface SessionInput {
  id: string
  name: string
  now?: string
  build?: string
  models: SessionModel[]
  parked: SessionParked[]
  opacityById: Record<string, number>
  disciplineById?: Record<string, string>
  colorByDiscipline: boolean
}

const isIdentity = (t?: ModelTransform): boolean => {
  if (!t) return true
  const zero = (v?: { x: number; y: number; z: number }) => !v || (v.x === 0 && v.y === 0 && v.z === 0)
  const one = t.scale === undefined || t.scale === 1 ||
    (typeof t.scale === 'object' && t.scale.x === 1 && t.scale.y === 1 && t.scale.z === 1)
  return zero(t.position) && zero(t.rotation) && one
}

/** Manifest for the current scene: loaded models first, then parked ones. */
export function manifestFromSession(s: SessionInput): FederationManifestV1 {
  const models: ManifestModelInput[] = [
    ...s.models.map((m) => {
      const r: ManifestModelInput = {
        key: m.id, fileName: m.fileName, size: m.fileSize || 0,
        visible: m.visible, parked: false, opacity: s.opacityById[m.id] ?? 1,
      }
      if (!isIdentity(m.transform)) r.transform = m.transform
      if (m.placedByHand) r.placedByHand = true
      const d = s.disciplineById?.[m.id]
      if (d) r.discipline = d
      return r
    }),
    ...s.parked.map((p) => ({
      key: p.id, fileName: p.fileName, size: p.fileSize, visible: true, parked: true, opacity: 1,
    })),
  ]
  return buildManifest({
    id: s.id, name: s.name, now: s.now, build: s.build,
    models, colorByDiscipline: s.colorByDiscipline,
  })
}

/** File-system-safe download name: `<name>.ifcfed.json`. */
export function federationFileName(name: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').slice(0, 80).trim()
  return `${base || 'federation'}${FEDERATION_FILE_SUFFIX}`
}

/** What to do to a model once it has loaded. */
export interface RestoreApply {
  visible: boolean
  opacity: number
  transform?: ModelTransform
  placedByHand: boolean
  discipline?: string
}

export interface RestorePlan {
  /** Files to load, then apply `apply` to the resulting model. */
  loads: Array<{ refId: RefId; fileIndex: number; apply: RestoreApply }>
  /** Files that were parked when saved: keep their bytes aside, do not load. */
  parks: Array<{ refId: RefId; fileIndex: number }>
  /** Manifest entries with no file supplied. */
  missing: Array<{ refId: RefId; fileName: string }>
  /** Supplied files the manifest does not mention (ignored). */
  unassigned: number[]
  colorByDiscipline: boolean
}

export function planRestore(manifest: FederationManifestV1, rec: ReconcileResult): RestorePlan {
  const byRef = new Map(manifest.models.map((m) => [m.refId, m]))
  const plan: RestorePlan = {
    loads: [], parks: [], missing: [], unassigned: [...rec.unassigned],
    colorByDiscipline: manifest.presentation.colorByDiscipline,
  }
  for (const r of rec.refs) {
    const ref = byRef.get(r.refId)
    if (!ref) continue
    if (r.status === 'missing' || r.fileIndex === undefined) {
      plan.missing.push({ refId: r.refId, fileName: ref.fileName })
      continue
    }
    if (ref.parked) { plan.parks.push({ refId: r.refId, fileIndex: r.fileIndex }); continue }
    const apply: RestoreApply = {
      visible: ref.visible,
      opacity: Math.min(1, Math.max(0.05, ref.opacity)),
      placedByHand: !!ref.placedByHand,
    }
    if (ref.transform) apply.transform = ref.transform
    if (ref.discipline) apply.discipline = ref.discipline
    plan.loads.push({ refId: r.refId, fileIndex: r.fileIndex, apply })
  }
  return plan
}

export type ModelCountBucket = '2' | '3-5' | '6-10' | '11+'
export function modelCountBucket(n: number): ModelCountBucket {
  if (n <= 2) return '2'
  if (n <= 5) return '3-5'
  return n <= 10 ? '6-10' : '11+'
}
