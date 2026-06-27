// ─── overlay-controller.ts ────────────────────────────────────────────────────
// Owns the 3D highlight *overlay layer* — the isolate-issues view that paints
// validation problems / IDS failures in colour and ghosts everything else.
//
// WHY THIS EXISTS (design intent):
//   The overlay used to live as loose state + fire-and-forget `void model.highlight()`
//   calls inside the viewer closure. That made it (a) impossible to unit-test
//   without WebGL, (b) silent on failure, and (c) wasteful — the React effect
//   that drives it re-fires on every validation result and would re-paint ~10k
//   elements each time. This controller fixes all three:
//
//   • Decoupled + typed — depends only on a tiny `OverlayTarget` interface and an
//     injected material set, so it's driven by a fake in tests (no @thatopen).
//   • Robust — every model op is wrapped; one model throwing or a sync/async
//     failure never aborts the others, never throws to the caller, and is logged
//     with enough context to debug. Missing models / missing type maps degrade
//     gracefully instead of crashing.
//   • Idempotent — each apply is keyed by a content signature; re-requesting the
//     same overlay is a no-op (no re-paint, no flicker), so the driving effect
//     can run as often as React likes.
//
// LAYERING: this controller owns ONE layer (overlay). Selection/hover are higher
// layers the viewer manages; it calls `materialFor()` to know what overlay colour
// an element should return to after a transient hover/selection highlight clears.

import {
  planValidationOverlay,
  planIdsOverlay,
  planOverlayGhost,
  type TypeMap,
  type IdsFailureRef,
} from './overlay-plan'
import type { ValidationIssue } from '../types'
import { createLogger } from './logger'

// ── Public interfaces ───────────────────────────────────────────────────────────

export type OverlayChannel = 'validation' | 'ids'

/** The minimal slice of a fragments model the overlay touches. Both methods may be
 *  sync or async; the controller tolerates either and swallows rejections safely. */
export interface OverlayTarget<M> {
  highlight(localIds: number[], material: M): Promise<void> | void
  resetHighlight(localIds?: number[]): Promise<void> | void
}

/** The colour set the overlay paints with. Materials must be referentially stable
 *  (the controller compares them by identity to build idempotency signatures). */
export interface OverlayMaterials<M> {
  error: M
  warning: M
  info: M
  idsFail: M
  ghost: M
}

/** Just the logger surface the controller uses — easy to stub/spy in tests. */
export interface OverlayLogger {
  debug: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
}

export interface OverlayControllerDeps<M> {
  /** Resolve a model's highlight target, or undefined when it isn't loaded. */
  getTarget: (modelId: string) => OverlayTarget<M> | undefined
  /** Live per-model type maps (localId → IFC class) used to compute ghosting.
   *  Read at apply time, so the reference may mutate between calls. */
  typeMaps: ReadonlyMap<string, TypeMap>
  materials: OverlayMaterials<M>
  logger?: OverlayLogger
}

/** A plain, serialisable view of what the overlay currently shows — for debugging
 *  (`overlay.inspect()` in devtools) and assertions in tests. */
export interface OverlaySnapshot {
  channel: OverlayChannel | null
  models: Array<{ modelId: string; flagged: number; ghosted: boolean }>
}

export interface OverlayController<M> {
  /** Paint the validation overlay (error/warning/info + isolate ghosting). No-op
   *  when the requested overlay equals what's already on screen. */
  applyValidation(issues: readonly ValidationIssue[], activeModelId: string | null): void
  /** Paint the IDS-failure overlay (+ isolate ghosting). No-op when unchanged. */
  applyIds(failures: readonly IdsFailureRef[], activeModelId: string | null): void
  /** Remove the overlay from every model (issues resetHighlight) and drop state. */
  clear(): void
  /** The overlay material an element should display (issue/fail colour, or ghost),
   *  or null. The viewer uses this to restore the overlay under a hover/selection. */
  materialFor(modelId: string, localId: number): M | null
  /** Drop one model's tracking WITHOUT touching the GPU — call when a model is
   *  removed/disposed (its geometry is going away anyway). */
  forget(modelId: string): void
  /** Drop all tracking without touching the GPU — call on full teardown. */
  forgetAll(): void
  /** The flagged (coloured) elements per model — e.g. so the viewer can frame the
   *  camera on the problems across the whole federation when the overlay turns on. */
  flaggedTargets(): Array<{ modelId: string; localIds: number[] }>
  /** Snapshot of current overlay state for debugging/tests. */
  inspect(): OverlaySnapshot
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const isThenable = (v: unknown): v is Promise<unknown> =>
  v != null &&
  (typeof v === 'object' || typeof v === 'function') &&
  typeof (v as { then?: unknown }).then === 'function'

// ── Factory ───────────────────────────────────────────────────────────────────

export function createOverlayController<M>(deps: OverlayControllerDeps<M>): OverlayController<M> {
  const log = deps.logger ?? createLogger('Overlay')
  const { materials } = deps

  // What is currently painted: modelId → (flagged localId → its material).
  // Ghosting is a per-model FLAG (not 10k map entries) — materialFor() resolves
  // the ghost colour for any non-flagged element of a ghosted model.
  const applied = new Map<string, Map<number, M>>()
  const ghosted = new Set<string>()
  let activeChannel: OverlayChannel | null = null
  // Content key of what's painted; equal key ⇒ skip re-paint (idempotency).
  // NOTE: a model's typeMap is stable for a given modelId (reloads mint a new id),
  // so the signature need not encode ghost ids — they're implied by the flagged
  // set + the model identity.
  let appliedSignature: string | null = null

  /** Stable single-char key per material (by identity) for the signature. */
  function materialKey(m: M): string {
    if (m === materials.error) return 'e'
    if (m === materials.warning) return 'w'
    if (m === materials.info) return 'i'
    if (m === materials.idsFail) return 'f'
    if (m === materials.ghost) return 'g'
    return '?'
  }

  /** True when at least one model has a geometric element to flag. */
  function hasAnyFlags(flaggedByModel: Map<string, Map<number, M>>): boolean {
    for (const f of flaggedByModel.values()) if (f.size > 0) return true
    return false
  }

  /**
   * Content key of the overlay. Encodes the channel, every flagged element (id +
   * colour), AND every *loaded* model that will be ghosted — so adding/removing a
   * model in a federation changes the key and forces a repaint. Stays O(models +
   * flags): ghost membership is decided by `typeMap.size > flaggedCount`, never by
   * enumerating the (potentially huge) ghost id list.
   */
  function signatureOf(channel: OverlayChannel, flaggedByModel: Map<string, Map<number, M>>): string {
    if (!hasAnyFlags(flaggedByModel)) return `${channel}|empty`
    const parts: string[] = [channel]
    for (const modelId of [...deps.typeMaps.keys()].sort()) {
      const flagged = flaggedByModel.get(modelId)
      const typeMap = deps.typeMaps.get(modelId)!
      const ids = flagged ? [...flagged.keys()].sort((a, b) => a - b) : []
      const ghosts = typeMap.size > ids.length // would this model dim anything?
      const flags = flagged ? ids.map((id) => `${id}${materialKey(flagged.get(id)!)}`).join(',') : ''
      parts.push(`${modelId}:${flags}${ghosts ? ':g' : ''}`)
    }
    return parts.join('|')
  }

  /** Run a target op, catching both synchronous throws and async rejections so a
   *  single bad model never breaks the batch or escapes to the caller. */
  function safeCall(label: string, modelId: string, run: () => Promise<void> | void): void {
    try {
      const r = run()
      if (isThenable(r)) r.catch((e) => log.warn(`${label} failed (model ${modelId}):`, errMsg(e)))
    } catch (e) {
      log.warn(`${label} threw (model ${modelId}):`, errMsg(e))
    }
  }

  /** Remove the currently-applied overlay from the GPU and forget it. */
  function clearInternal(): void {
    for (const [modelId, flagged] of applied) {
      const target = deps.getTarget(modelId)
      if (!target) continue
      if (ghosted.has(modelId)) {
        // Ghosting recoloured ~every element → reset all of this model's highlights.
        safeCall('resetHighlight(all)', modelId, () => target.resetHighlight())
      } else if (flagged.size > 0) {
        const ids = [...flagged.keys()]
        safeCall('resetHighlight', modelId, () => target.resetHighlight(ids))
      }
    }
    applied.clear()
    ghosted.clear()
    activeChannel = null
    appliedSignature = null
  }

  function groupByMaterial(flagged: Map<number, M>): Map<M, number[]> {
    const groups = new Map<M, number[]>()
    for (const [id, mat] of flagged) {
      const arr = groups.get(mat)
      if (arr) arr.push(id)
      else groups.set(mat, [id])
    }
    return groups
  }

  /**
   * The single reconcile path. Diffs against what's painted and, if it changed,
   * clears the old overlay and paints the new one.
   *
   * FEDERATED ISOLATE: as long as *any* model has a flag, EVERY loaded model is
   * dimmed (a model with its own flags keeps them in colour and ghosts the rest;
   * a model with no flags is ghosted whole). This is what makes the overlay read
   * correctly with several models in the scene — problems pop across the entire
   * federation instead of one model staying bright next to another's highlights.
   */
  function reconcile(channel: OverlayChannel, flaggedByModel: Map<string, Map<number, M>>): void {
    const signature = signatureOf(channel, flaggedByModel)
    if (signature === appliedSignature) {
      log.debug(`${channel}: unchanged — skipped re-paint`)
      return
    }

    clearInternal()

    if (!hasAnyFlags(flaggedByModel)) {
      // No geometric flags anywhere (e.g. every issue is file-level) — leave the
      // scene clean rather than dimming a whole federation to show nothing.
      appliedSignature = signature
      log.debug(`${channel}: no geometric flags — nothing to paint`)
      return
    }

    let totalFlagged = 0
    let totalGhosted = 0
    // The planner only ever flags ids that exist in a model's type map, so every
    // flagged model is among deps.typeMaps — iterating it covers flagged + unflagged.
    for (const [modelId, typeMap] of deps.typeMaps) {
      const target = deps.getTarget(modelId)
      if (!target) {
        log.debug(`${channel}: model "${modelId}" not loaded — skipped`)
        continue
      }
      const flagged = flaggedByModel.get(modelId) ?? new Map<number, M>()

      // Dim everything that isn't flagged in this model.
      const ghostIds = planOverlayGhost(typeMap, flagged.keys())
      if (ghostIds.length) {
        ghosted.add(modelId)
        totalGhosted += ghostIds.length
        safeCall('highlight(ghost)', modelId, () => target.highlight(ghostIds, materials.ghost))
      }

      // Paint this model's flags (batched by colour: ≤3 calls validation, 1 IDS).
      for (const [material, ids] of groupByMaterial(flagged)) {
        safeCall('highlight', modelId, () => target.highlight(ids, material))
      }

      if (flagged.size > 0 || ghostIds.length > 0) applied.set(modelId, flagged)
      totalFlagged += flagged.size
    }

    activeChannel = applied.size > 0 ? channel : null
    appliedSignature = signature
    log.debug(`${channel}: ${applied.size} model(s), ${totalFlagged} flagged, ${totalGhosted} ghosted`)
  }

  function validationToPerModel(
    plan: ReturnType<typeof planValidationOverlay>,
  ): Map<string, Map<number, M>> {
    const out = new Map<string, Map<number, M>>()
    for (const [modelId, buckets] of plan) {
      const flagged = new Map<number, M>()
      for (const id of buckets.error) flagged.set(id, materials.error)
      for (const id of buckets.warning) flagged.set(id, materials.warning)
      for (const id of buckets.info) flagged.set(id, materials.info)
      out.set(modelId, flagged)
    }
    return out
  }

  function idsToPerModel(plan: Map<string, number[]>): Map<string, Map<number, M>> {
    const out = new Map<string, Map<number, M>>()
    for (const [modelId, ids] of plan) {
      const flagged = new Map<number, M>()
      for (const id of ids) flagged.set(id, materials.idsFail)
      out.set(modelId, flagged)
    }
    return out
  }

  return {
    applyValidation(issues, activeModelId) {
      try {
        const plan = planValidationOverlay(issues, deps.typeMaps, activeModelId)
        reconcile('validation', validationToPerModel(plan))
      } catch (e) {
        log.warn('applyValidation failed — overlay left unchanged:', errMsg(e))
      }
    },

    applyIds(failures, activeModelId) {
      try {
        const plan = planIdsOverlay(failures, deps.typeMaps, activeModelId)
        reconcile('ids', idsToPerModel(plan))
      } catch (e) {
        log.warn('applyIds failed — overlay left unchanged:', errMsg(e))
      }
    },

    clear() {
      clearInternal()
    },

    materialFor(modelId, localId) {
      const m = applied.get(modelId)?.get(localId)
      if (m !== undefined) return m
      if (ghosted.has(modelId)) return materials.ghost
      return null
    },

    forget(modelId) {
      applied.delete(modelId)
      ghosted.delete(modelId)
      appliedSignature = null // applied set changed — force the next apply to repaint
    },

    forgetAll() {
      applied.clear()
      ghosted.clear()
      activeChannel = null
      appliedSignature = null
    },

    flaggedTargets() {
      const out: Array<{ modelId: string; localIds: number[] }> = []
      for (const [modelId, flagged] of applied) {
        if (flagged.size > 0) out.push({ modelId, localIds: [...flagged.keys()] })
      }
      return out
    },

    inspect() {
      return {
        channel: activeChannel,
        models: [...applied].map(([modelId, flagged]) => ({
          modelId,
          flagged: flagged.size,
          ghosted: ghosted.has(modelId),
        })),
      }
    },
  }
}
