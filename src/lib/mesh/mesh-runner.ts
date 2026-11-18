// ─── mesh-runner ──────────────────────────────────────────────────────────────
// Orchestration for importing a mesh: decode, budget check, initial placement,
// store updates, hand-off to the 3D system.
//
// No worker here, unlike the point cloud path, and that is a decision rather
// than an omission. GLTFLoader and OBJLoader build textures through Image and
// createImageBitmap, which are not available in a plain module worker — the
// parse would run there and the materials would arrive blank. So the decode
// happens on the main thread, which is why the budget is enforced BEFORE
// anything reaches the GPU rather than after.
//
// ── Staleness is per import
// An import is stale when its own signal aborted, when its own row is gone
// (panel X, SDK remove, the loading watcher), or when clearMeshes() swept
// everything. Nothing else. It used to be a store-wide epoch bumped by EVERY
// removal, so deleting one finished model threw away a sibling that was still
// decoding — and threw it away without touching its row, which then said
// 'loading' forever. Checked after every await; the waits that do no work of
// their own (texture drain, resolvePlacement) race it, so a cancel settles now
// rather than whenever the thing being waited on gets round to it. The decode
// itself is NOT raced: it is main-thread work that cannot be interrupted, and
// settling early would free a decode slot while the CPU is still busy with the
// abandoned parse. Its ROW is not held hostage to it, though: a cancel removes
// the row the moment it arrives, and the promise follows when the parse ends.
//
// ── Every exit settles the row
// 'ready', 'error' with a key, or REMOVED (cancelled). Never 'loading'. A
// cancelled import has no row because there is nothing for the user to act on:
// they asked for it to go away, or it already did.

import { useMeshStore, pendingEntry, registerMeshPersistence } from '../../stores/meshStore'
import { createLogger } from '../logger'
import { loadMeshFiles, findEntryFile, disposeObject } from './mesh-loader'
import {
  inferUnitScale, inferUpAxis, initialPlacement, meshFileKey,
  savePlacement, loadPlacement, saveMeshUpAxis, loadMeshUpAxis,
  saveMeshUnit, loadMeshUnit,
} from './mesh-align'
import type { Object3D } from 'three'
import type { MeshFrame } from './mesh-types'
import type { MeshSystemAPI } from './mesh-system'

const log = createLogger('MeshRunner')

registerMeshPersistence({
  placement: savePlacement,
  upAxis: saveMeshUpAxis,
  unit: saveMeshUnit,
})

export interface MeshLoadOptions {
  files: File[]
  system: MeshSystemAPI
  modelBounds: {
    center: { x: number; y: number; z: number }
    size: { x: number; y: number; z: number }
  } | null
  /** Where the bytes came from, when fetched. The identity across sessions. */
  sourceUrl?: string | null
}

/** What the initial placement is fitted against, read at placement time. */
export interface MeshPlacementInputs {
  modelBounds: MeshLoadOptions['modelBounds']
}

export interface MeshRunOptions {
  /** Entry + sidecars (the loader resolves references by basename). */
  files: File[]
  /** Pick this file as the entry when the selection holds several entry files. */
  entryName?: string
  system: MeshSystemAPI
  sourceUrl?: string | null
  /**
   * Cancels this import only: object disposed, row REMOVED, resolves
   * { ok:false, errorKey:'error.cancelled' }.
   */
  signal?: AbortSignal
  /** The store row exists (id minted) — first thing after the pre-checks. */
  onEntry?(meshId: string): void
  onStage?(stage: 'decode' | 'place'): void
  /**
   * Called after the decode, before the budget check and placement. Resolves
   * the placement inputs at that moment (the adapter waits for the attach lane
   * here, so a mesh lands after the IFC that anchors the scene).
   */
  resolvePlacement?(): MeshPlacementInputs | Promise<MeshPlacementInputs>
}

export interface MeshLoadResult {
  ok: boolean
  meshId?: string
  /** i18n key (mesh namespace) when ok is false. */
  errorKey?: string
}

const ERROR_KEYS: Record<string, string> = {
  noEntryFile: 'error.noEntryFile',
  noGeometry: 'error.noGeometry',
  parseFailed: 'error.parseFailed',
  cancelled: 'error.cancelled',
}

const cancelledResult = (): MeshLoadResult => ({ ok: false, errorKey: 'error.cancelled' })

/**
 * The unmanaged entry point, kept for callers that read the model bounds
 * themselves when the user acted. Placement is fitted against exactly those
 * bounds — there is no lane to wait for, so there is nothing newer to read.
 */
export function loadMesh(opts: MeshLoadOptions): Promise<MeshLoadResult> {
  const modelBounds = opts.modelBounds ?? null
  return runMeshLoad({
    files: opts.files,
    system: opts.system,
    sourceUrl: opts.sourceUrl,
    resolvePlacement: () => ({ modelBounds }),
  })
}

export async function runMeshLoad(opts: MeshRunOptions): Promise<MeshLoadResult> {
  const { system, signal } = opts
  // Defensive rather than paranoid: this is reachable from the SDK, where the
  // caller is someone else's code and `files` has already been through a
  // postMessage round trip. A non-array here would throw inside the loader with
  // a stack that says nothing about what the host did wrong.
  const files = Array.isArray(opts.files) ? opts.files.filter((f) => f instanceof File) : []
  if (files.length === 0) return { ok: false, errorKey: 'error.noEntryFile' }
  if (!system || typeof system.add !== 'function') {
    log.warn('runMeshLoad called without a mesh system')
    return { ok: false, errorKey: 'error.parseFailed' }
  }

  const entry = findEntryFile(files, opts.entryName)
  if (!entry) return { ok: false, errorKey: 'error.noEntryFile' }
  if (entry.file.size === 0) return { ok: false, errorKey: 'error.emptyFile' }
  // Cancelled before it began: no row to flash up and vanish again.
  if (signal?.aborted) return cancelledResult()

  const meshId = `mesh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const fileKey = meshFileKey(entry.file, opts.sourceUrl)
  const clearEpoch = useMeshStore.getState().epoch

  useMeshStore.getState().addMesh(pendingEntry(meshId, entry.file, entry.format, fileKey))

  const rowExists = (): boolean => useMeshStore.getState().meshes.some((m) => m.id === meshId)
  const stale = (): boolean =>
    signal?.aborted === true || useMeshStore.getState().epoch !== clearEpoch || !rowExists()

  // One signal for the waits, tripped by any of the three conditions above. The
  // caller's signal alone would miss the other two: a row deleted from the
  // panel mid-import would otherwise sit out the full thirty-second texture
  // drain before noticing it had nowhere to land. Every condition is monotonic
  // (a signal never un-aborts, the epoch only grows, ids are never reused), so
  // once tripped it stays true.
  const stop = new AbortController()
  const trip = (): void => {
    if (stop.signal.aborted || !stale()) return
    stop.abort()
    // Monotonic, so nothing the store does from here on can make this import
    // any MORE stale: the listeners have done their one job. Released now, not
    // only in the finally — a .gltf whose absolute buffer URI stalls never
    // calls back, the finally is never reached, and a subscription left behind
    // would re-check a dead import on every store change for the life of the
    // page.
    detach()
    // The row goes NOW, not when the runner returns. The glTF parse is the one
    // await nothing can race, and a Draco + texture decode can hold it for tens
    // of seconds — or forever, on that stalled URI — while the Loading Center,
    // which marked the job cancelled the moment it aborted, already says so. A
    // row still spinning beside it is exactly the stuck 'loading' this module
    // promises never to show. Removing it does NOT settle the import: the
    // abandoned parse still owns the CPU, so the runner returns — and the
    // adapter releases its lanes — only when the parse does, and the late
    // result is freed then, by the loader's own abort check or by `stale()`
    // below. Guarded because a trip from the store means the row is gone.
    if (rowExists()) useMeshStore.getState().removeMesh(meshId)
  }
  signal?.addEventListener('abort', trip)
  const unsubscribe = useMeshStore.subscribe(trip)
  // Idempotent — both halves are no-ops the second time — because it runs from
  // up to three places: the trip, the end of the last await, the finally.
  const detach = (): void => {
    unsubscribe()
    signal?.removeEventListener('abort', trip)
  }

  // The decoded object until the system owns it. Every early exit below frees
  // it, because until system.add() accepts it nothing else holds a reference —
  // and its textures are exactly the memory the garbage collector cannot see.
  let object: Object3D | null = null
  const release = (): void => {
    if (object) disposeObject(object)
    object = null
  }
  const cancelled = (): MeshLoadResult => {
    release()
    if (rowExists()) useMeshStore.getState().removeMesh(meshId)
    return cancelledResult()
  }
  const failed = (errorKey: string): MeshLoadResult => {
    release()
    // A real failure keeps its row: the error is shown there, and the user
    // dismisses it. Only a cancel takes the row away.
    useMeshStore.getState().updateMesh(meshId, { status: 'error', errorKey })
    return { ok: false, errorKey }
  }

  try {
    notify('onEntry', () => opts.onEntry?.(meshId))
    notify('onStage', () => opts.onStage?.('decode'))

    // The entry is passed by name so the loader decodes the very file the row
    // was just named after, whatever else the selection holds.
    const decoded = await loadMeshFiles(files, { entryName: entry.file.name, signal: stop.signal })
    object = decoded.object
    if (stale()) return cancelled()

    notify('onStage', () => opts.onStage?.('place'))
    let modelBounds: MeshPlacementInputs['modelBounds'] = null
    if (opts.resolvePlacement) {
      const read = opts.resolvePlacement
      // Wrapped so a synchronous throw lands in the same place as a rejection.
      const pending = new Promise<MeshPlacementInputs>((r) => r(read()))
      const outcome = await raceAbort(pending, stop.signal)
      if (stale()) return cancelled()
      if (outcome.kind === 'value') {
        modelBounds = outcome.value?.modelBounds ?? null
      } else if (outcome.kind === 'error') {
        // Not worth losing the import over: the initial fit is a guess either
        // way, and without the model's bounds it is the same identity placement
        // an import into an empty scene gets. The user places it from there.
        log.warn('resolvePlacement failed — placing without the model bounds:', outcome.error)
      }
    }

    // Past the last await: from here to the return is one synchronous step, so
    // a cancel can no longer be acted on — and must not be half-acted on. A
    // re-entrant abort (a store subscriber reacting to the 'ready' update
    // below) would otherwise trip, and the trip would take the row out from
    // under an object the system already owns: a model in the scene with no
    // row to remove it by.
    detach()

    // No await between here and system.add(). That is what makes the budget
    // check safe with two decodes in flight: the check and the add are one
    // synchronous step, so no sibling can land in between and push the scene
    // past the budget.
    //
    // INV-M3: checked BEFORE the object reaches the scene. Past the budget a
    // browser does not slow down, it loses the WebGL context — which blacks out
    // the IFC model too, and that is not a trade an import gets to make.
    const store = useMeshStore.getState()
    if (system.triangleCount() + decoded.stats.triangles > store.maxTriangles) {
      return failed('error.budgetExhausted')
    }

    const box = { min: decoded.box.min, max: decoded.box.max }
    const unit = inferUnitScale(box)
    const up = inferUpAxis(decoded.format, box)

    // Anything the user already decided for this file outranks both guesses.
    const savedUnit = loadMeshUnit(fileKey)
    const savedUp = loadMeshUpAxis(fileKey)

    const frame: MeshFrame = {
      unitScale: savedUnit ?? unit.scale,
      unitSource: savedUnit !== null ? 'user' : 'assumed',
      upAxis: savedUp ?? up.axis,
      upAxisSource: savedUp !== null ? 'user' : up.source,
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    }

    const placement = loadPlacement(fileKey) ?? initialPlacement({ frame, modelBounds })

    // A refusal here means the system was disposed mid-import (the scene was
    // torn down while we decoded). Reporting 'ready' would leave the store
    // claiming a model that is in no scene and whose textures nothing will free.
    // It is a cancel like any other — the scene it was for is gone — so it
    // leaves no row either: an 'error' row saying "cancelled" beside a job the
    // Loading Center reports as cancelled would be two answers to one question.
    if (!system.add(meshId, decoded.object, frame, placement, decoded.stats)) {
      return cancelled()
    }
    object = null // the system owns it now; its remove() frees it
    useMeshStore.getState().updateMesh(meshId, {
      status: 'ready', stats: decoded.stats, frame, placement,
    })
    return { ok: true, meshId }
  } catch (e) {
    // Whatever the loader threw after the import went stale — its own
    // 'cancelled', or a parse error that raced the abort — is a cancel.
    if (stale()) return cancelled()
    const raw = e instanceof Error ? e.message : String(e)
    const cause = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined
    const key = ERROR_KEYS[raw] ?? 'error.parseFailed'
    // All three matter. The key is what the user reads; `raw` and its cause are
    // the only record of what three.js actually objected to, and an unmapped
    // one is a gap in ERROR_KEYS that should be visible rather than flattened.
    log.warn(
      `mesh import failed (${entry.file.name}, ${entry.format}): ${raw}` +
      (cause !== undefined ? ` — cause: ${describe(cause)}` : '') +
      (ERROR_KEYS[raw] ? '' : ' — unmapped, shown as a generic failure'),
      cause ?? e,
    )
    return failed(key)
  } finally {
    detach()
    // The structural half of "never left at 'loading'". Every path above
    // settles the row itself; this catches the one somebody adds later and
    // forgets to, before it becomes a Loading Center row that runs forever.
    const row = useMeshStore.getState().meshes.find((m) => m.id === meshId)
    if (row?.status === 'loading') {
      log.error(`mesh import ${meshId} exited without settling its row`)
      release()
      useMeshStore.getState().updateMesh(meshId, { status: 'error', errorKey: 'error.parseFailed' })
    }
  }
}

/** Re-apply the current frame + placement to the scene. */
export function reapply(meshId: string, system: MeshSystemAPI): void {
  const mesh = useMeshStore.getState().meshes.find((m) => m.id === meshId)
  if (!mesh?.frame) return
  system.setPlacement(meshId, mesh.frame, mesh.placement)
}

/**
 * Drop an import and free every resource it owns.
 *
 * Safe on a row still loading: the in-flight import sees its own row gone at
 * its next check, frees what it decoded and settles as cancelled. Siblings are
 * untouched.
 */
export function removeMesh(meshId: string, system: MeshSystemAPI): void {
  const mesh = useMeshStore.getState().meshes.find((m) => m.id === meshId)
  if (mesh) clearSaved(mesh.fileKey)
  system.remove(meshId)
  useMeshStore.getState().removeMesh(meshId)
}

/**
 * Removing an import does NOT forget where the user put it.
 *
 * Only the placement is kept — re-importing the same file should land it back
 * where it was, which is the whole reason the placement is per file. This
 * function exists so that intent is written down rather than inferred from the
 * absence of a call.
 */
function clearSaved(_fileKey: string): void {
  // Intentionally empty. See the doc comment.
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Raced<T> =
  | { kind: 'value'; value: T }
  | { kind: 'error'; error: unknown }
  | { kind: 'aborted' }

/**
 * Wait for `work` unless the signal aborts first. Never rejects. A late result
 * after an abort is simply dropped — both handlers stay attached, so a late
 * rejection is not an unhandled one either.
 */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<Raced<T>> {
  return new Promise((resolve) => {
    const onAbort = (): void => resolve({ kind: 'aborted' })
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    work.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve({ kind: 'value', value }) },
      (error: unknown) => { signal.removeEventListener('abort', onAbort); resolve({ kind: 'error', error }) },
    )
  })
}

/**
 * Run a caller's callback without letting it break the import. They report
 * progress to someone else; a bug in the listener must cost the listener, not
 * leave a decoded model with no row state.
 */
function notify(name: string, fn: () => void): void {
  try { fn() } catch (e) { log.warn(`${name} callback threw:`, e) }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  // three's image loaders report a DOM Event, which stringifies to nothing useful.
  if (cause && typeof cause === 'object' && 'type' in cause) return `event "${String((cause as Event).type)}"`
  return String(cause)
}
