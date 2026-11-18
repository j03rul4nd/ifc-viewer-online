// ─── Federation compare ───────────────────────────────────────────────────────
// Compare the models loaded now against a saved federation (the baseline).
// Model level only: unchanged / changed / added / removed, plus placement and
// visibility flags. Pure; built on `reconcile`. The element-level diff lives in
// the revision compare and is not repeated here. Nothing leaves the device.

import type { ModelTransform } from '../types'
import type { FederationManifestV1 } from './federation-manifest'
import { reconcile, type MatchedBy } from './federation-reconcile'

export interface CurrentModel {
  fileName: string
  size: number
  sha256?: string
  visible: boolean
  parked: boolean
  opacity?: number
  transform?: ModelTransform
}

export type ModelCompareStatus = 'unchanged' | 'changed' | 'added' | 'removed'

export interface ModelCompareRow {
  status: ModelCompareStatus
  /** Name in the baseline (absent for added). */
  baselineName?: string
  /** Name loaded now (absent for removed). */
  currentName?: string
  baselineSize?: number
  currentSize?: number
  matchedBy?: MatchedBy
  /** Index into `current`, when there is a current model. */
  currentIndex?: number
  placementChanged: boolean
  visibilityChanged: boolean
}

export interface FederationCompareResult {
  rows: ModelCompareRow[]
  counts: Record<ModelCompareStatus, number> & { placement: number; visibility: number }
}

const v3 = (v?: { x: number; y: number; z: number }, d = 0): [number, number, number] =>
  v ? [v.x, v.y, v.z] : [d, d, d]
const scale3 = (s?: number | { x: number; y: number; z: number }): [number, number, number] =>
  s === undefined ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : v3(s, 1)

/** Same placement within a small tolerance (absent = identity). */
export function sameTransform(a?: ModelTransform, b?: ModelTransform, eps = 1e-6): boolean {
  const pa = [...v3(a?.position), ...v3(a?.rotation), ...scale3(a?.scale)]
  const pb = [...v3(b?.position), ...v3(b?.rotation), ...scale3(b?.scale)]
  return pa.every((x, i) => Math.abs(x - pb[i]) <= eps)
}

export function compareFederation(manifest: FederationManifestV1, current: CurrentModel[]): FederationCompareResult {
  const rec = reconcile(manifest, current.map((c) => ({ name: c.fileName, size: c.size, sha256: c.sha256 })))
  const byRef = new Map(manifest.models.map((m) => [m.refId, m]))
  const rows: ModelCompareRow[] = []

  for (const r of rec.refs) {
    const ref = byRef.get(r.refId)!
    if (r.status === 'missing' || r.fileIndex === undefined) {
      rows.push({ status: 'removed', baselineName: ref.fileName, baselineSize: ref.size, placementChanged: false, visibilityChanged: false })
      continue
    }
    const cur = current[r.fileIndex]
    const hashesDiffer = !!ref.sha256 && !!cur.sha256 && ref.sha256.toLowerCase() !== cur.sha256.toLowerCase()
    const unchanged = r.matchedBy === 'sha256' || (r.matchedBy === 'name+size' && !hashesDiffer)
    rows.push({
      status: unchanged ? 'unchanged' : 'changed',
      baselineName: ref.fileName, currentName: cur.fileName,
      baselineSize: ref.size, currentSize: cur.size,
      matchedBy: r.matchedBy, currentIndex: r.fileIndex,
      placementChanged: !sameTransform(ref.transform, cur.transform),
      visibilityChanged: ref.visible !== cur.visible || ref.parked !== cur.parked,
    })
  }
  for (const i of rec.unassigned) {
    const cur = current[i]
    rows.push({ status: 'added', currentName: cur.fileName, currentSize: cur.size, currentIndex: i, placementChanged: false, visibilityChanged: false })
  }

  const counts = { unchanged: 0, changed: 0, added: 0, removed: 0, placement: 0, visibility: 0 }
  for (const r of rows) {
    counts[r.status]++
    if (r.placementChanged) counts.placement++
    if (r.visibilityChanged) counts.visibility++
  }
  return { rows, counts }
}

/** Analytics bucket for a count — never the exact number. */
export type CountBucket = '0' | '1' | '2-5' | '6+'
export function countBucket(n: number): CountBucket {
  if (n <= 0) return '0'
  if (n === 1) return '1'
  return n <= 5 ? '2-5' : '6+'
}
