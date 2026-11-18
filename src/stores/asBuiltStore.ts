/**
 * As-Built session state (T-404): which cloud is being checked, the IFC<->cloud
 * point pairs the user has picked, and the rigid fit derived from them.
 *
 * Every change to the pairs refits synchronously (a fit over a handful of pairs
 * is microseconds), so `fit`, `fitError` and `gate` are always consistent with
 * `pairs`. Running the worker and the panel live elsewhere (T-405).
 */
import { create } from 'zustand'
import {
  fitRigid, isFitError, scoringGate, MIN_PAIRS,
  type FitError, type FitMode, type FitResult, type PointPair, type Vec3,
} from '../lib/asbuilt/rigid-fit'

export interface PairDraft { model?: Vec3; cloud?: Vec3 }

export type AsBuiltPhase = 'idle' | 'picking-model' | 'picking-cloud' | 'running' | 'done' | 'error'

export interface ScoringGateState { ok: boolean; reason?: 'alignment-too-coarse' | 'too-few-pairs-to-score' }

interface AsBuiltState {
  cloudId: string | null
  pairs: PairDraft[]
  mode: FitMode
  fit: FitResult | null
  fitError: FitError | null
  /** Scoring gate for the current fit; null while there is no fit. */
  gate: ScoringGateState | null
  declaredMm: number
  precisionMm: number
  phase: AsBuiltPhase
  /** Worker output (T-405 decides its shape); opaque here. */
  result: unknown

  setCloudId: (id: string | null) => void
  addPair: (pair: PairDraft) => void
  removePair: (index: number) => void
  /** Replace the pairs wholesale (e.g. cloud ends re-projected after an apply). */
  setPairs: (pairs: PairDraft[]) => void
  setMode: (mode: FitMode) => void
  setDeclaredMm: (mm: number) => void
  setPrecisionMm: (mm: number) => void
  setPhase: (phase: AsBuiltPhase) => void
  setResult: (result: unknown) => void
  reset: () => void
}

export function completePairs(pairs: readonly PairDraft[]): PointPair[] {
  const out: PointPair[] = []
  for (const p of pairs) if (p.model && p.cloud) out.push({ model: p.model, cloud: p.cloud })
  return out
}

/** Pure: fit + gate for a set of drafts. Fewer than MIN_PAIRS complete -> no fit, no error. */
export function deriveFit(
  pairs: readonly PairDraft[], mode: FitMode, declaredMm: number,
): Pick<AsBuiltState, 'fit' | 'fitError' | 'gate'> {
  const complete = completePairs(pairs)
  if (complete.length < MIN_PAIRS) return { fit: null, fitError: null, gate: null }
  const r = fitRigid(complete, mode)
  if (isFitError(r)) return { fit: null, fitError: r, gate: null }
  const gate = scoringGate({ declaredM: declaredMm / 1000, alignmentRmseM: r.alignmentRmseM, pairs: complete.length })
  return { fit: r, fitError: null, gate }
}

const INITIAL = {
  cloudId: null as string | null,
  pairs: [] as PairDraft[],
  mode: '4dof' as FitMode,
  fit: null as FitResult | null,
  fitError: null as FitError | null,
  gate: null as ScoringGateState | null,
  declaredMm: 25,
  precisionMm: 5,
  phase: 'idle' as AsBuiltPhase,
  result: null as unknown,
}

export const useAsBuiltStore = create<AsBuiltState>()((set, get) => {
  const refit = (patch: Partial<AsBuiltState>) => {
    const s = { ...get(), ...patch }
    set({ ...patch, ...deriveFit(s.pairs, s.mode, s.declaredMm) })
  }
  return {
    ...INITIAL,
    setCloudId: (cloudId) => {
      if (cloudId === get().cloudId) return
      // Pairs belong to one cloud: switching clouds starts over.
      set({ ...INITIAL, cloudId, mode: get().mode, declaredMm: get().declaredMm, precisionMm: get().precisionMm })
    },
    addPair: (pair) => refit({ pairs: [...get().pairs, { ...pair }] }),
    removePair: (index) => refit({ pairs: get().pairs.filter((_, i) => i !== index) }),
    setPairs: (pairs) => refit({ pairs: pairs.map((p) => ({ ...p })) }),
    setMode: (mode) => refit({ mode }),
    setDeclaredMm: (declaredMm) => refit({ declaredMm }),
    setPrecisionMm: (precisionMm) => set({ precisionMm }),
    setPhase: (phase) => set({ phase }),
    setResult: (result) => set({ result }),
    reset: () => set({ ...INITIAL }),
  }
})
