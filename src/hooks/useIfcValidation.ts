// ─── src/hooks/useIfcValidation.ts ───────────────────────────────────────────
// Async validation pipeline with AbortController so a second file pick
// automatically cancels any in-flight read.

import { useCallback, useRef } from 'react'
import type { UploadEvent } from '../types/upload.types'
import {
  MAX_FILE_SIZE_BYTES,
  ACCEPTED_MIMES,
} from '../lib/upload.constants'
import {
  makeError,
  hasIfcMagicBytes,
  readIfcVersion,
  isSupportedIfcVersion,
} from '../lib/upload.utils'

type Dispatch = (event: UploadEvent) => void

export function useIfcValidation(dispatch: Dispatch) {
  const abortRef = useRef<AbortController | null>(null)

  const validate = useCallback(async (file: File): Promise<void> => {
    // Cancel any previous in-flight validation
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    dispatch({ type: 'FILE_PICKED', file })

    // 1. Extension
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      dispatch({ type: 'VALIDATION_ERR', file, error: makeError('INVALID_EXTENSION') })
      return
    }

    // 2. Empty
    if (file.size === 0) {
      dispatch({ type: 'VALIDATION_ERR', file, error: makeError('FILE_EMPTY') })
      return
    }

    // 3. Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      dispatch({ type: 'VALIDATION_ERR', file, error: makeError('FILE_TOO_LARGE') })
      return
    }

    // 4. MIME hint (not strict — browsers return inconsistent values for .ifc)
    if (file.type && !ACCEPTED_MIMES.has(file.type)) {
      dispatch({ type: 'VALIDATION_ERR', file, error: makeError('INVALID_MIME', file.type) })
      return
    }

    if (signal.aborted) return

    // 5. Magic bytes — ISO-10303-21 (STEP Physical File)
    const hasMagic = await hasIfcMagicBytes(file)
    if (signal.aborted) return
    if (!hasMagic) {
      dispatch({ type: 'VALIDATION_ERR', file, error: makeError('CORRUPTED_FILE') })
      return
    }

    // 6. IFC schema version
    const version = await readIfcVersion(file)
    if (signal.aborted) return
    if (version !== null && !isSupportedIfcVersion(version)) {
      dispatch({
        type: 'VALIDATION_ERR', file,
        error: makeError('UNSUPPORTED_IFC_VERSION', `Detected: ${version}`),
      })
      return
    }

    dispatch({ type: 'VALIDATION_OK', file })
  }, [dispatch])

  return { validate }
}