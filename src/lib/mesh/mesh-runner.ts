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

import { useMeshStore, pendingEntry, registerMeshPersistence } from '../../stores/meshStore'
import { createLogger } from '../logger'
import { loadMeshFiles, findEntryFile } from './mesh-loader'
import {
  inferUnitScale, inferUpAxis, initialPlacement, meshFileKey,
  savePlacement, loadPlacement, saveMeshUpAxis, loadMeshUpAxis,
  saveMeshUnit, loadMeshUnit,
} from './mesh-align'
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
}

export async function loadMesh(opts: MeshLoadOptions): Promise<MeshLoadResult> {
  const { files, system, modelBounds } = opts
  if (files.length === 0) return { ok: false, errorKey: 'error.noEntryFile' }

  const entry = findEntryFile(files)
  if (!entry) return { ok: false, errorKey: 'error.noEntryFile' }
  if (entry.file.size === 0) return { ok: false, errorKey: 'error.emptyFile' }

  const meshId = `mesh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const fileKey = meshFileKey(entry.file, opts.sourceUrl)
  const epoch = useMeshStore.getState().epoch

  useMeshStore.getState().addMesh(pendingEntry(meshId, entry.file, entry.format, fileKey))

  const stale = (): boolean => useMeshStore.getState().epoch !== epoch

  try {
    const result = await loadMeshFiles(files)
    if (stale()) {
      // Removed while decoding. Free it here — the system never saw it, so
      // nothing else will.
      const { disposeObject } = await import('./mesh-loader')
      disposeObject(result.object)
      return { ok: false, errorKey: 'error.cancelled' }
    }

    // INV-M3: checked BEFORE the object reaches the scene. Past the budget a
    // browser does not slow down, it loses the WebGL context — which blacks out
    // the IFC model too, and that is not a trade an import gets to make.
    const store = useMeshStore.getState()
    if (system.triangleCount() + result.stats.triangles > store.maxTriangles) {
      const { disposeObject } = await import('./mesh-loader')
      disposeObject(result.object)
      store.updateMesh(meshId, { status: 'error', errorKey: 'error.budgetExhausted' })
      return { ok: false, errorKey: 'error.budgetExhausted' }
    }

    const box = { min: result.box.min, max: result.box.max }
    const unit = inferUnitScale(box)
    const up = inferUpAxis(result.format, box)

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

    system.add(meshId, result.object, frame, placement, result.stats)
    useMeshStore.getState().updateMesh(meshId, {
      status: 'ready', stats: result.stats, frame, placement,
    })
    return { ok: true, meshId }
  } catch (e) {
    const key = e instanceof Error ? (ERROR_KEYS[e.message] ?? 'error.parseFailed') : 'error.parseFailed'
    log.warn('mesh import failed:', e)
    useMeshStore.getState().updateMesh(meshId, { status: 'error', errorKey: key })
    return { ok: false, errorKey: key }
  }
}

/** Re-apply the current frame + placement to the scene. */
export function reapply(meshId: string, system: MeshSystemAPI): void {
  const mesh = useMeshStore.getState().meshes.find((m) => m.id === meshId)
  if (!mesh?.frame) return
  system.setPlacement(meshId, mesh.frame, mesh.placement)
}

/** Drop an import and free every resource it owns. */
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
