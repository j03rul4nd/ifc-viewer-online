// ─── src/hooks/useIfcUploadFlow.ts ───────────────────────────────────────────
// Orchestrator. Connects the state machine with:
//   - the per-file checks (useIfcValidation: validate + fingerprint + duplicates)
//   - the drag-and-drop handlers (useDragAndDrop)
//   - the loading system (loadingController.submitFiles / openExisting); a
//     submitted load is followed in the FirstLoadCard (empty scene) and the
//     toolbar indicator, which opens the Loading Center on demand
//
// This is the ONLY hook UploadOverlay.tsx calls.
//
// What changed with the loading system: the dialog used to hand ONE file to
// App (`onLoad`) and then mirror App's progress flags until the model was in the
// scene — with a Cancel button that could not cancel anything. It now accepts
// any number of files, checks them, and hands them over in one submission; the
// loads are background jobs, so the dialog closes and the viewer stays usable.

import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUploadStateMachine }  from './useUploadStateMachine'
import { useIfcValidation }       from './useIfcValidation'
import { useDragAndDrop }         from './useDragAndDrop'
import { createLogger }           from '../lib/logger'
import { loadingController, type DuplicateMatch } from '../lib/loading/controller'
import { useLoadingStore }        from '../stores/loadingStore'
import { isIfcFileName }          from '../lib/upload.utils'
import type {
  SubmitScope,
  UploadEntry,
  UploadOrigin,
  UploadOverlayProps,
  UploadState,
} from '../types/upload.types'

const log = createLogger('UploadFlow')

type FlowInput = Pick<
  UploadOverlayProps,
  'onClose' | 'onSubmitted' | 'initialFiles' | 'initialOrigin' | 'onNonIfcFiles'
>

// Row keys are unique for the page's lifetime, so a check that finishes after
// a reset can never land on a newer row that happens to reuse a key.
let entrySeq = 0
const nextEntryKey = (): string => `u${++entrySeq}`

export function useIfcUploadFlow({
  onClose,
  onSubmitted,
  initialFiles,
  initialOrigin,
  onNonIfcFiles,
}: FlowInput) {
  const { t } = useTranslation('common')
  const { state, dispatch, canClose, isActive } = useUploadStateMachine()
  const { prepare, abort } = useIfcValidation(dispatch)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // The latest state for callbacks that must not be re-created on every
  // render (the drag handlers, the file input).
  const stateRef = useRef<UploadState>(state)
  stateRef.current = state

  const resetInput = (): void => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Add files (pick, drop, initial) ───────────────────────────────────────
  const addFiles = useCallback((incoming: readonly File[], origin: UploadOrigin): void => {
    const current = stateRef.current
    if (current.id === 'submitting' || incoming.length === 0) return

    let candidates = Array.from(incoming)
    if (onNonIfcFiles) {
      const foreign = candidates.filter((f) => !isIfcFileName(f.name))
      if (foreign.length > 0) {
        log.debug('Routing non-IFC files to the host:', foreign.map((f) => f.name))
        candidates = candidates.filter((f) => isIfcFileName(f.name))
        onNonIfcFiles(foreign)
      }
    }

    // Identical File objects are one row (the same drop delivered twice, a
    // re-drop while the first is still being checked). The same file picked
    // twice from the OS dialog is two File objects — its fingerprint catches it
    // as "duplicate in selection" instead.
    const known = new Set<File>(
      current.id === 'preparing' || current.id === 'review' || current.id === 'duplicate'
        ? current.entries.map((e) => e.file)
        : [],
    )
    const entries: UploadEntry[] = []
    for (const file of candidates) {
      if (known.has(file)) continue
      known.add(file)
      entries.push({ key: nextEntryKey(), file, origin, check: null, checked: null })
    }
    if (entries.length === 0) return

    log.debug(`${origin === 'drop' ? 'Dropped' : 'Picked'} ${entries.length} file(s)`)
    dispatch({ type: 'FILES_ADDED', entries })
    prepare(entries)
  }, [dispatch, prepare, onNonIfcFiles])

  // ── Files the dialog was opened with (global drop over the viewer) ───────
  // Guarded by a ref, not by effect cleanup: StrictMode runs this effect twice
  // on mount and the files must be added exactly once.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    if (initialFiles && initialFiles.length > 0) addFiles(initialFiles, initialOrigin ?? 'drop')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Hand-over ─────────────────────────────────────────────────────────────
  // One effect for both ways into `submitting` (a Load click, the fast path),
  // so the submission happens exactly once per selection.
  const submittedRef = useRef<UploadState | null>(null)
  useEffect(() => {
    if (state.id !== 'submitting' || submittedRef.current === state) return
    submittedRef.current = state

    const files = state.entries.map((e) => e.file)
    const fingerprints: Record<number, string> = {}
    state.entries.forEach((e, i) => {
      if (e.check?.ok && e.check.fingerprint) fingerprints[i] = e.check.fingerprint
    })
    const isBatch = files.length > 1
    const batchName = isBatch
      ? (state.batchName ?? t('upload.review.defaultBatchName', { count: files.length }))
      : null

    log.info(`Submitting ${files.length} file(s)`, { origin: state.origin, batch: batchName, group: state.createGroup })
    loadingController.submitFiles(files, {
      origin: state.origin,
      batchName,
      createGroup: isBatch && state.createGroup,
      fingerprints,
    })
    onSubmitted?.(files.length)
    // The Loading Center is NOT opened here. It is a popover over the scene:
    // opening it on every submit hid the FirstLoadCard of an empty scene and
    // sat on the model the user was about to orbit. The card and the toolbar
    // indicator carry the hand-over; the center is one click away.
    onClose()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onDroppedFiles = useCallback((files: File[]) => addFiles(files, 'drop'), [addFiles])
  const dragHandlers = useDragAndDrop(dispatch, onDroppedFiles, state.id === 'submitting')

  // ── Close ──────────────────────────────────────────────────────────────────
  // No RESET here: the parent unmounts the dialog behind an exit animation, and
  // resetting first would flash the empty drop zone while it fades out.
  const handleClose = useCallback(() => {
    if (!canClose) return
    abort()
    onClose()
  }, [canClose, abort, onClose])

  // ── Retry (error view) ────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    log.debug('User triggered retry')
    abort()
    dispatch({ type: 'RESET' })
    resetInput()
  }, [abort, dispatch])

  // ── Review actions ────────────────────────────────────────────────────────
  const toggleEntry = useCallback((key: string) => dispatch({ type: 'TOGGLE', key }), [dispatch])
  const setBatchName = useCallback((name: string) => dispatch({ type: 'SET_BATCH_NAME', name }), [dispatch])
  const setCreateGroup = useCallback((value: boolean) => dispatch({ type: 'SET_CREATE_GROUP', value }), [dispatch])
  const submit = useCallback((scope: SubmitScope) => dispatch({ type: 'SUBMIT', scope }), [dispatch])

  /**
   * The duplicate's own model: activate and frame it — or, while it is still
   * loading, show its row in the Loading Center. Either way this dialog is done.
   */
  const openExisting = useCallback((match: DuplicateMatch) => {
    if (match.modelId) loadingController.openExisting(match.modelId)
    else useLoadingStore.getState().openCenter(match.jobId)
    abort()
    onClose()
  }, [abort, onClose])

  // ── Input change ──────────────────────────────────────────────────────────
  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    addFiles(files, 'upload')
  }, [addFiles])

  return {
    state,
    fileInputRef,
    canClose,
    isActive,
    dragHandlers,
    handleClose,
    handleRetry,
    toggleEntry,
    setBatchName,
    setCreateGroup,
    submit,
    openExisting,
    onFileInputChange,
    openFilePicker: () => fileInputRef.current?.click(),
  }
}
