// ─── Federation session ⇄ manifest ────────────────────────────────────────────
// Pure glue between the live scene (sceneStore + federationStore) and the
// byte-free manifest (federation-manifest) / reconcile step. Saving builds a
// manifest from the scene; opening turns manifest + reconcile into a plan of
// what to load, what to park and what is missing. No I/O, no stores.

import type { ModelTransform } from '../types'
import {
  buildManifest, baseName, type FederationManifestV1, type ManifestModelInput, type ManifestView, type RefId,
  MAX_MANIFEST_VIEWS, MAX_VIEW_ID, MAX_VIEW_NAME, MAX_VIEW_SECTIONS,
} from './federation-manifest'
import type { FederationView } from './federation'
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
  /** Saved views (keyed by file name, as federationStore keeps them). Those naming no file of the set are left out. */
  views?: FederationView[]
}

/** File-name-keyed view → manifest view keyed by session model key. */
function viewToKeys(v: FederationView, keysByName: Map<string, string[]>): ManifestView {
  const visible: Record<string, boolean> = {}
  const opacity: Record<string, number> = {}
  for (const [name, on] of Object.entries(v.visible)) for (const k of keysByName.get(name) ?? []) visible[k] = on
  for (const [name, o] of Object.entries(v.opacity)) for (const k of keysByName.get(name) ?? []) opacity[k] = o
  const out: ManifestView = {
    id: v.id.slice(0, MAX_VIEW_ID), name: v.name.slice(0, MAX_VIEW_NAME), visible, opacity,
    colorByDiscipline: v.colorByDiscipline,
  }
  if (v.camera) out.camera = v.camera
  if (v.sections) out.sections = v.sections.slice(0, MAX_VIEW_SECTIONS)
  return out
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
  const keysByName = new Map<string, string[]>()
  const index = (name: string, key: string) => {
    const list = keysByName.get(name) ?? []
    if (!list.includes(key)) keysByName.set(name, [...list, key])
  }
  for (const m of models) { index(m.fileName, m.key); index(baseName(m.fileName), m.key) }
  const views = (s.views ?? [])
    .map((v) => viewToKeys(v, keysByName))
    .filter((v) => Object.keys(v.visible).length > 0)
    .slice(0, MAX_MANIFEST_VIEWS)
  return buildManifest({
    id: s.id, name: s.name, now: s.now, build: s.build,
    models, colorByDiscipline: s.colorByDiscipline,
    ...(views.length > 0 ? { views } : {}),
  })
}

/**
 * The manifest's views back in federationStore's shape (keyed by file name),
 * in file order — the first is the one to show on open.
 */
export function viewsFromManifest(manifest: FederationManifestV1, now = Date.now()): FederationView[] {
  const nameOf = new Map(manifest.models.map((m) => [m.refId, m.fileName]))
  const byName = <V>(rec: Record<string, V>): Record<string, V> => {
    const out: Record<string, V> = {}
    for (const [r, v] of Object.entries(rec)) { const n = nameOf.get(r); if (n !== undefined) out[n] = v }
    return out
  }
  return manifest.presentation.views.map((v, i) => {
    const view: FederationView = {
      id: v.id, name: v.name, visible: byName(v.visible), opacity: byName(v.opacity),
      colorByDiscipline: v.colorByDiscipline ?? manifest.presentation.colorByDiscipline,
      createdAt: now - i,
    }
    if (v.camera) view.camera = { position: [...v.camera.position], target: [...v.camera.target], projection: v.camera.projection }
    if (v.sections) view.sections = v.sections.map((c) => ({ point: [...c.point], normal: [...c.normal] }))
    return view
  })
}

/** The view to show on open: the active one if the file names it, else the first. */
export function defaultView(manifest: FederationManifestV1, views: FederationView[]): FederationView | null {
  const id = manifest.presentation.activeViewId
  return (id ? views.find((v) => v.id === id) : undefined) ?? views[0] ?? null
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
