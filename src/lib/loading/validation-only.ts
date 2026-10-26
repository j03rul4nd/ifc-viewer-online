// ─── Validate a model whose 3D failed ─────────────────────────────────────────
// A 300–400 MB IFC can parse and still not fit as geometry: "scene@setup",
// "parse@geometry", "Fragments: Memory overflow!". The geometry is what costs
// the memory; the validator reads the same file without building any. So when
// the 3D fails, the file is registered under its own id with no scene model and
// run through the ordinary validator: Health Score, issues, fixes, report — all
// of it except jumping to an element in 3D.

import { GEOMETRY_FAILURE_CODES, type LoadErrorCode, type LoadSource } from './types'
import { modelRegistry } from '../model-registry'
import { runValidation } from '../validator'
import { useValidationStore } from '../../stores/validationStore'
import { useUIStore } from '../../stores/uiStore'

/** Pure: whether a failed IFC load is worth offering "validate without 3D". */
export function canValidateWithout3d(code: LoadErrorCode, source: LoadSource | null): boolean {
  return source !== null && GEOMETRY_FAILURE_CODES.has(code)
}

async function readSource(source: LoadSource): Promise<ArrayBuffer> {
  if (source.type === 'file') return source.file.arrayBuffer()
  if (source.type === 'bytes') {
    const b = source.bytes
    return b instanceof ArrayBuffer ? b : b.slice().buffer as ArrayBuffer
  }
  const res = await fetch(source.url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.arrayBuffer()
}

/**
 * Register the file without geometry and validate it. Resolves with the id the
 * result is stored under; rejects when the file cannot be read again.
 */
export async function validateWithout3d(source: LoadSource, fileName: string): Promise<string> {
  const bytes = await readSource(source)
  const modelId = `validation-only-${Date.now().toString(36)}`
  modelRegistry.register({
    modelId,
    fileName,
    ifcBuffer:       bytes,
    opfsCacheKey:    '',
    expressIDToType: new Map(),
    loadedAt:        Date.now(),
  })
  useValidationStore.getState().setActiveValidationModelId(modelId)
  useUIStore.getState().setValidationPanelOpen(true)
  await runValidation(modelId, undefined, true)
  // runValidation reports its own failures in the store rather than throwing.
  const { validationStatus, validationError } = useValidationStore.getState()
  if (validationStatus === 'error') throw new Error(validationError ?? 'Validation failed')
  return modelId
}
