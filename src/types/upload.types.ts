// ─── src/types/upload.types.ts ────────────────────────────────────────────────
// The import dialog's vocabulary. Since the loading system landed (see
// docs/MODEL_LOADING.md) the dialog no longer shows load progress: loads are
// background jobs and the Loading Center shows them. What remains here is the
// part only a dialog can do — take 1..N files, check each one, flag duplicates,
// let the user confirm, and hand the batch over.

import type { DuplicateMatch } from '../lib/loading/controller'

export type UploadStateId =
  | 'idle'
  | 'dragging'
  | 'preparing'
  | 'review'
  | 'duplicate'
  | 'error'
  | 'submitting'

export interface UploadError {
  code:       UploadErrorCode
  /** English, for logs and the technical-details box. The UI shows the i18n text for `code`. */
  message:    string
  technical?: string
  retryable:  boolean
}

/**
 * Validation outcomes. Load-time failures (parse, geometry, scene…) used to be
 * listed here because the dialog tracked the load; they now belong to the
 * loading system's `LoadErrorCode` and the Loading Center.
 */
export type UploadErrorCode =
  | 'INVALID_EXTENSION'
  | 'INVALID_MIME'
  | 'FILE_TOO_LARGE'
  | 'FILE_EMPTY'
  | 'UNSUPPORTED_IFC_VERSION'
  | 'CORRUPTED_FILE'
  | 'READ_FAILED'
  | 'UNKNOWN'

/** How a file reached the dialog. Mirrors `ImportOptions.origin`. */
export type UploadOrigin = 'upload' | 'drop'

/** What checking one file found. */
export type UploadCheck =
  | {
      ok: true
      /** FILE_SCHEMA from the header ("IFC4"), null when the header does not say. */
      version: string | null
      /** Sampled content fingerprint (`f1:…`), null when it could not be computed. */
      fingerprint: string | null
      /** A loaded model or live job with the same content, found at check time. */
      existing: DuplicateMatch | null
    }
  | { ok: false; error: UploadError }

/** One file in the dialog's selection. */
export interface UploadEntry {
  /** Unique for the page's lifetime — results of a stale check can never land on a newer row. */
  key:    string
  file:   File
  origin: UploadOrigin
  /** null while the file is still being checked. */
  check:  UploadCheck | null
  /**
   * The row's checkbox. null until the whole round of checks settles: whether a
   * file is a duplicate of ANOTHER file in the selection is only known once
   * every fingerprint is in, so its default cannot be decided per file.
   */
  checked: boolean | null
}

/** A row's status as the review list shows it (derived, never stored). */
export type UploadEntryStatus =
  | { kind: 'pending' }
  | { kind: 'valid' }
  | { kind: 'invalid'; error: UploadError }
  | { kind: 'loaded-duplicate'; match: DuplicateMatch }
  | { kind: 'selection-duplicate'; ofKey: string }

/** Batch settings the review step edits. */
export interface BatchDraft {
  /** What the user typed; null = untouched (the inferred name is used). */
  name: string | null
  /** Put the batch in a new scene group ("Group as one project"). */
  createGroup: boolean
}

/** Which files a submit takes. */
export type SubmitScope =
  | 'all'        // every valid, non-duplicate file
  | 'selected'   // the checked rows (duplicates only when the user checked them)
  | 'duplicate'  // the single file of the duplicate prompt ("Load duplicate anyway")

interface SelectionState {
  entries:  UploadEntry[]
  batch:    BatchDraft
  /** Files are being dragged over the dialog (highlight only). */
  dragOver: boolean
}

export type UploadState =
  | { id: 'idle' }
  | { id: 'dragging' }
  /** Checking (validate + fingerprint + duplicate lookup) at least one entry. */
  | ({ id: 'preparing' } & SelectionState)
  /** Everything checked; waiting for the user to confirm. */
  | ({ id: 'review' } & SelectionState)
  /** A single file that is already loaded (or loading). */
  | ({ id: 'duplicate' } & SelectionState)
  /** Every file in the selection is invalid. */
  | { id: 'error'; entries: UploadEntry[] }
  /**
   * Handed to the loading controller; the dialog closes. A state of its own so
   * the submit side effect runs exactly once, whether the user clicked Load or
   * the single-small-file fast path fired on its own.
   */
  | {
      id: 'submitting'
      entries: UploadEntry[]
      /** User-typed or inferred; null = neither (the caller falls back to "N models"). */
      batchName: string | null
      createGroup: boolean
      origin: UploadOrigin
    }

export type UploadEvent =
  | { type: 'DRAG_ENTER' }
  | { type: 'DRAG_LEAVE' }
  /** New rows (already de-duplicated by File identity against the current ones). */
  | { type: 'FILES_ADDED';    entries: UploadEntry[] }
  | { type: 'ENTRY_PREPARED'; key: string; check: UploadCheck }
  | { type: 'TOGGLE';         key: string }
  | { type: 'SET_BATCH_NAME'; name: string }
  | { type: 'SET_CREATE_GROUP'; value: boolean }
  | { type: 'SUBMIT';         scope: SubmitScope }
  | { type: 'RESET' }

// Props for UploadOverlay — backward-compatible with App.tsx
export interface UploadOverlayProps {
  onClose:      () => void
  /** Opens the demo model gallery (closes this overlay first). Optional. */
  onOpenDemoGallery?: () => void
  /**
   * Called after the dialog handed `count` files to the loading controller,
   * right before it asks to close. For analytics / first-load UI.
   */
  onSubmitted?: (count: number) => void
  /**
   * Files to start with (a global drop over the viewer). Checked on mount like
   * a drop inside the dialog, so a single small file still loads without a
   * review step.
   */
  initialFiles?: readonly File[]
  /** Origin reported for `initialFiles`. Default: 'drop'. */
  initialOrigin?: UploadOrigin
  /**
   * Non-IFC files that reached the dialog (an IDS, a scan, a glTF…). When set,
   * they are handed here — route them with `classifyFiles` — and only the IFCs
   * are checked. When not set, they appear as invalid rows ("not an IFC file").
   */
  onNonIfcFiles?: (files: File[]) => void

  /** @deprecated Unused. Loads go through `loadingController.submitFiles`. */
  onLoad?:       (file: File) => void
  /** @deprecated Unused. Progress lives in the Loading Center. */
  isLoading?:    boolean
  /** @deprecated Unused. Progress lives in the Loading Center. */
  loadProgress?: number
  /** @deprecated Unused. Load failures are shown by the Loading Center. */
  loadError?:    string | null
  /** @deprecated Unused. */
  loadDone?:     boolean
  /** @deprecated Unused. Cancel a load from the Loading Center (`loadingController.cancel`). */
  onCancel?:     () => void
}
