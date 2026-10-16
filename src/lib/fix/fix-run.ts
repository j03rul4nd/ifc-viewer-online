// ─── Export and check the fixed file ──────────────────────────────────────────
// After a batch rename is applied: write the model's IFC with every pending
// edit, validate those exact bytes in isolation, and keep both for the card.
// One model at a time (one IfcAPI in memory at a time), never through the
// normal validation path — see validate-bytes.ts for why that matters.

import type { EditDiff, RulesConfig, ValidationResult } from '../../types'
import { modelRegistry } from '../model-registry'
import {
  commandSignatureForModel, exportAsIfcDetailed, getDiffsForModel,
  type IfcExportOptions, type IfcExportResult,
} from '../diffStore'
import { loadExportPrefs, prefsToExportOptions } from '../ifc-export-prefs'
import { trackFixRevalidated } from '../analytics'
import { AppError } from '../errors'
import { useBatchFixStore, type FixBatch, type FixRun, type FixRunErrorCode } from '../../stores/batchFixStore'
import { useValidationStore } from '../../stores/validationStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useWaiverStore } from '../../stores/waiverStore'
import type { BatchRenameRule } from './batch-rename'
import { validateBytes, type ValidateBytesOptions } from './validate-bytes'
import { headerChecksChanged, measuredDelta, type FixSummary } from './score-delta'

export interface FixCheckArgs {
  modelId: string
  batchId: string
  ruleId: BatchRenameRule
  /** The model's file name as loaded; the run's is `${stem}-fixed.ifc`. */
  fileName: string
}

export interface FixCheckDeps {
  getBuffer?: (modelId: string) => ArrayBuffer | null
  exportFn?: (buffer: ArrayBuffer, diffs: EditDiff[], options: IfcExportOptions) => Promise<IfcExportResult>
  validateFn?: (bytes: Uint8Array, opts: ValidateBytesOptions) => Promise<ValidationResult>
  now?: () => number
  /** The rules to check with; defaults to the validation store's current ones. */
  rules?: RulesConfig
  /** The original result to compare against; defaults to cachedResultsByModel[modelId]. */
  before?: ValidationResult
}

/** `model.ifc` → `model-fixed.ifc`. */
export function fixedFileName(fileName: string): string {
  return `${fileName.replace(/\.ifc$/i, '')}-fixed.ifc`
}

/**
 * Fixed-file GlobalId → the original file's, for every element a pending GUID
 * fix gives a new GlobalId in the export. A chain (G → G1, then G1 → G2) maps
 * the last GUID straight back to the first. Undefined when no GUID changes.
 */
export function guidRemapOf(diffs: readonly EditDiff[]): Record<string, string> | undefined {
  let remap: Record<string, string> | undefined
  for (const d of diffs) {
    if (d.type !== 'FIX_GUID' || d.newGuid === d.oldGuid) continue
    remap ??= {}
    remap[d.newGuid] = Object.prototype.hasOwnProperty.call(remap, d.oldGuid) ? remap[d.oldGuid] : d.oldGuid
  }
  return remap
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * The latest attempt per model, and the switch that stops its check. Retry
 * and Check again start a new attempt while an older one may still be
 * running; only the latest may write its outcome, and the older check is
 * stopped rather than left to finish. A check is a dedicated worker holding
 * its own web-ifc heap and a full copy of the fixed bytes: two at once on a
 * large model is how a tab runs out of memory.
 */
const inFlight = new Map<string, { attempt: symbol; controller: AbortController }>()

/** Export options for the fixed file: the user's header settings, always stamped. */
function fixExportOptions(): IfcExportOptions {
  // Stamped even when the user turned stamping off. The fixed file is new
  // output from this app, so the stamp is true, and it is what keeps the file
  // out of the public benchmark when it is opened here again (benchmark-guard).
  return { ...prefsToExportOptions(loadExportPrefs()), stampHeader: true }
}

/**
 * Export one model with all its pending edits, check the bytes, and record
 * the outcome on the model's run in useBatchFixStore. Never throws: every
 * failure ends as an `error` run the card can show and retry.
 *
 * The check stops (its worker is terminated) as soon as it can no longer be
 * shown: a newer attempt for the model, or the batch undone, dismissed or
 * replaced. The export itself is short and runs to the end.
 */
export async function startFixCheck(args: FixCheckArgs, deps: FixCheckDeps = {}): Promise<void> {
  const { modelId, batchId, ruleId } = args
  const now = deps.now ?? Date.now
  const store = useBatchFixStore.getState
  const fileName = fixedFileName(args.fileName)

  // A retry keeps the snapshot taken when the batch was applied.
  const previous = store().runs[modelId]
  const before = deps.before
    ?? (previous?.batchId === batchId ? previous.before : undefined)
    ?? useValidationStore.getState().cachedResultsByModel[modelId]
  const historySig = commandSignatureForModel(modelId)
  const attempt = Symbol(modelId)
  const controller = new AbortController()
  inFlight.get(modelId)?.controller.abort()
  inFlight.set(modelId, { attempt, controller })

  if (!before) {
    // No original result to compare with: nothing honest to show, and Retry
    // cannot help (the card offers none). The entry points are disabled
    // without a result, so this is a guard, not a path.
    const empty: ValidationResult = { issues: [], stats: { total: 0, errors: 0, warnings: 0, info: 0, byRule: {} }, durationMs: 0 }
    store().startRun({ modelId, batchId, ruleId, fileName, before: empty, historySig, startedAt: now() })
    store().failRun(modelId, batchId, { code: 'no_result', message: 'This model has no validation result to compare with.' })
    inFlight.delete(modelId)
    return
  }

  store().startRun({ modelId, batchId, ruleId, fileName, before, historySig, startedAt: now() })
  const fail = (code: FixRunErrorCode, message: string): void => store().failRun(modelId, batchId, { code, message })
  const superseded = (): boolean =>
    inFlight.get(modelId)?.attempt !== attempt || store().runs[modelId]?.batchId !== batchId

  // Undo, Dismiss, Ctrl+Z or a newer batch drop this run from the store:
  // stop the check then, instead of letting it finish for nobody.
  const unsubscribe = useBatchFixStore.subscribe((s) => {
    if (s.runs[modelId]?.batchId !== batchId) controller.abort()
  })
  try {
    // The store refused the run (its batch is no longer the current one).
    if (superseded()) return
    const buffer = (deps.getBuffer ?? ((id: string) => modelRegistry.getBuffer(id)))(modelId)
    if (!buffer || buffer.byteLength === 0) {
      fail('no_buffer', 'The original IFC is not in memory.')
      return
    }

    const diffs = getDiffsForModel(modelId)
    let exported: IfcExportResult
    try {
      exported = await (deps.exportFn ?? exportAsIfcDetailed)(buffer, diffs, fixExportOptions())
    } catch (err) {
      if (!superseded()) fail('export_failed', messageOf(err))
      return
    }
    if (superseded()) return

    store().setProgress(modelId, batchId, 0)
    let checked: ValidationResult
    try {
      checked = await (deps.validateFn ?? validateBytes)(exported.bytes, {
        modelId,
        rules: deps.rules ?? useValidationStore.getState().rules,
        signal: controller.signal,
        onProgress: (pct) => { if (!superseded()) store().setProgress(modelId, batchId, pct) },
      })
    } catch (err) {
      if (superseded()) return
      const stalled = err instanceof AppError && err.code === 'WORKER_TIMEOUT'
      fail(stalled ? 'stalled' : 'check_failed', messageOf(err))
      return
    }
    if (superseded()) return
    finishCheck(modelId, batchId, historySig, diffs, exported, checked)
  } finally {
    unsubscribe()
    if (inFlight.get(modelId)?.attempt === attempt) inFlight.delete(modelId)
  }
}

/** Record a finished check: done, or stale when the edits moved while it ran. */
function finishCheck(
  modelId: string,
  batchId: string,
  historySig: string,
  diffs: EditDiff[],
  exported: IfcExportResult,
  checked: ValidationResult,
): void {
  const store = useBatchFixStore.getState

  // The honesty stamp: this result was measured on edited bytes.
  const after: ValidationResult = {
    ...checked,
    metadata: { ...checked.metadata, edits: Math.max(0, diffs.length - exported.skippedDiffs) },
  }
  const guidRemap = guidRemapOf(diffs)
  const out = {
    bytes: exported.bytes, after, skippedDiffs: exported.skippedDiffs, totalDiffs: diffs.length,
    ...(guidRemap ? { guidRemap } : {}),
  }

  if (commandSignatureForModel(modelId) !== historySig) {
    // The edits moved while we worked: these bytes no longer match them.
    store().markStale(modelId, batchId, { after, skippedDiffs: out.skippedDiffs, totalDiffs: out.totalDiffs })
    return
  }
  store().finishRun(modelId, batchId, out)
}

/**
 * Before → after for the current batch, over the batch's models that are
 * still in the scene (the ones the card shows). Measured once each of those
 * is done; until then the batch's prediction, flagged `measured: false`. A
 * model that left the scene mid-batch no longer holds the measurement back.
 * With no scene at all (a caller without one), every batch model counts.
 */
export function summarizeFixBatch(
  batch: FixBatch,
  runs: Record<string, FixRun>,
  sceneModelIds: readonly string[],
  cachedByModel: Record<string, ValidationResult | undefined>,
  muted: ReadonlySet<string>,
): FixSummary {
  const inScene = new Set(sceneModelIds)
  const shown = sceneModelIds.length > 0 ? batch.modelIds.filter((id) => inScene.has(id)) : batch.modelIds
  const mine = shown.map((id) => runs[id]).filter((r): r is FixRun => !!r && r.batchId === batch.batchId)
  const allDone = shown.length > 0 && mine.length === shown.length && mine.every((r) => r.status === 'done' && r.after)
  if (!allDone) {
    return { before: batch.predictedBefore, after: batch.predictedAfter, resolved: batch.cleared, added: 0, measured: false }
  }
  // Each model's original as it was at apply time, not whatever the cache holds now.
  const originals: Record<string, ValidationResult | undefined> = { ...cachedByModel }
  const afters: Record<string, ValidationResult | undefined> = {}
  const remaps: Record<string, Record<string, string> | undefined> = {}
  for (const r of mine) { originals[r.modelId] = r.before; afters[r.modelId] = r.after; remaps[r.modelId] = r.guidRemap }
  const ids = sceneModelIds.length > 0 ? sceneModelIds : batch.modelIds
  return measuredDelta(ids, originals, afters, muted, remaps)
}

/** Some done run's header-only checks came out differently on the fixed file (see HEADER_RULES). */
export function fixHeaderChanged(runs: readonly FixRun[]): boolean {
  return runs.some((r) => r.status === 'done' && !!r.after && headerChecksChanged(r.before, r.after))
}

/**
 * Check every model of a batch, one after the other, then report the outcome
 * once (`fix_revalidated`). Models are taken in the batch's order.
 */
export async function runFixChecks(
  batch: FixBatch,
  fileNames: Record<string, string>,
  deps: FixCheckDeps = {},
): Promise<void> {
  const now = deps.now ?? Date.now
  for (const modelId of batch.modelIds) {
    if (useBatchFixStore.getState().batch?.batchId !== batch.batchId) return // superseded or undone
    await startFixCheck({ modelId, batchId: batch.batchId, ruleId: batch.ruleId, fileName: fileNames[modelId] ?? 'model.ifc' }, deps)
  }

  const { batch: current, runs } = useBatchFixStore.getState()
  if (current?.batchId !== batch.batchId) return
  const statuses = batch.modelIds.map((id) => runs[id]?.status)
  const status: 'ok' | 'error' | 'stale' =
    statuses.some((s) => s === 'error' || s === undefined) ? 'error'
    : statuses.some((s) => s === 'stale') ? 'stale'
    : 'ok'

  const summary = summarizeFixBatch(
    batch,
    runs,
    useSceneStore.getState().models.map((m) => m.id),
    useValidationStore.getState().cachedResultsByModel,
    new Set(useWaiverStore.getState().muted),
  )
  // Counts only: no names, no pattern, no file names.
  trackFixRevalidated({
    rule_id:        batch.ruleId,
    fix_type:       'batch_name',
    count:          batch.renamed,
    score_before:   summary.before,
    score_after:    summary.after,
    resolved:       summary.resolved,
    added:          summary.added,
    duration_ms:    Math.max(0, now() - batch.startedAt),
    model_count:    batch.modelIds.length,
    status,
    // resolved/added include header checks the export settings changed.
    header_changed: fixHeaderChanged(Object.values(runs).filter((r) => r.batchId === batch.batchId)),
  })
}
