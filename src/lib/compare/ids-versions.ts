// ─── compare/ids-versions.ts ──────────────────────────────────────────────────
// Run one IDS against both versions of a set and say what moved. The existing
// ids-diff.ts keys failures by express id, which is right for two runs of the
// SAME loaded file and wrong across versions (every export renumbers). Here the
// key is spec name + GlobalId, and the checks run on the snapshots themselves —
// no second parse of any file, and a saved baseline can be re-checked against
// an IDS it never saw.

import { runIdsChecks } from '../ids/ids-engine'
import type { IdsDocument, IdsResult } from '../ids/ids-types'
import type { ModelSnapshot, SetDiff } from './types'

export interface IdsSetRun {
  /** Per file: the IDS result of that snapshot. */
  byFile: Record<string, IdsResult>
  /** Element-weighted score across the set (0–100). */
  score: number
  checks: number
  passed: number
}

export function runIdsOnSet(doc: IdsDocument, snaps: readonly ModelSnapshot[]): IdsSetRun {
  const byFile: Record<string, IdsResult> = {}
  let checks = 0, passed = 0
  for (const s of snaps) {
    const r = runIdsChecks(doc, s.elements, { modelSchema: s.schema ?? undefined })
    byFile[s.fileName] = r
    for (const spec of r.specs) { checks += spec.applicableCount; passed += spec.passedCount }
  }
  return { byFile, score: checks ? Math.round((passed / checks) * 1000) / 10 : 100, checks, passed }
}

export interface IdsFailureDelta {
  spec: string
  globalId: string
  ifcClass: string
  name: string
  file: string
  /** Human-readable reasons from the side where it fails (head for introduced, base for resolved). */
  reasons: string[]
  /** The element also changed between versions — the likely cause. */
  elementChanged: boolean
}

export interface IdsSpecDelta {
  spec: string
  baseFailed: number
  headFailed: number
  baseApplicable: number
  headApplicable: number
}

export interface IdsVersionDiff {
  baseScore: number
  headScore: number
  resolved: IdsFailureDelta[]
  introduced: IdsFailureDelta[]
  persistent: number
  bySpec: IdsSpecDelta[]
}

type FailRec = Omit<IdsFailureDelta, 'elementChanged'>

function failures(run: IdsSetRun): Map<string, FailRec> {
  const out = new Map<string, FailRec>()
  for (const [file, r] of Object.entries(run.byFile)) {
    for (const s of r.specs) {
      for (const f of s.failures) {
        // A failure with no GlobalId cannot be followed across versions; key it
        // by class+name so at least an unchanged one does not flip-flop.
        const gid = f.globalId ?? `${f.ifcClass}:${f.name}:${f.expressId}`
        out.set(`${s.name}\u0000${gid}`, {
          spec: s.name, globalId: gid, ifcClass: f.ifcClass, name: f.name, file,
          reasons: f.reasons.map((x) => [x.code, ...Object.values(x.params ?? {})].join(' ')),
        })
      }
    }
  }
  return out
}

function specTotals(run: IdsSetRun): Map<string, { failed: number; applicable: number }> {
  const m = new Map<string, { failed: number; applicable: number }>()
  for (const r of Object.values(run.byFile)) for (const s of r.specs) {
    const t = m.get(s.name) ?? { failed: 0, applicable: 0 }
    t.failed += s.failedCount; t.applicable += s.applicableCount
    m.set(s.name, t)
  }
  return m
}

export function diffIdsAcrossVersions(base: IdsSetRun, head: IdsSetRun, diff?: SetDiff): IdsVersionDiff {
  const changed = new Set(diff?.elements.filter((e) => e.status !== 'unchanged').map((e) => e.globalId) ?? [])
  const bf = failures(base), hf = failures(head)
  const resolved: IdsFailureDelta[] = [], introduced: IdsFailureDelta[] = []
  let persistent = 0
  for (const [k, f] of bf) {
    if (hf.has(k)) persistent++
    else resolved.push({ ...f, elementChanged: changed.has(f.globalId) })
  }
  for (const [k, f] of hf) if (!bf.has(k)) introduced.push({ ...f, elementChanged: changed.has(f.globalId) })

  const bt = specTotals(base), ht = specTotals(head)
  const names = [...new Set([...bt.keys(), ...ht.keys()])].sort()
  const bySpec = names.map((spec) => ({
    spec,
    baseFailed: bt.get(spec)?.failed ?? 0, headFailed: ht.get(spec)?.failed ?? 0,
    baseApplicable: bt.get(spec)?.applicable ?? 0, headApplicable: ht.get(spec)?.applicable ?? 0,
  }))

  return { baseScore: base.score, headScore: head.score, resolved, introduced, persistent, bySpec }
}
