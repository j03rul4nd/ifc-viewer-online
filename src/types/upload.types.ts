// ─── src/types/upload.types.ts ────────────────────────────────────────────────

export type UploadStateId =
  | 'idle'
  | 'dragging'
  | 'validating'
  | 'queued'
  | 'parsing'
  | 'building-scene'
  | 'success'
  | 'error'
  | 'cancelled'

export type ParseStage =
  | 'wasm-init'
  | 'file-read'
  | 'ifc-parse'
  | 'geometry'
  | 'scene'
  | 'finalising'

export interface UploadError {
  code:       UploadErrorCode
  message:    string
  technical?: string
  retryable:  boolean
}

export type UploadErrorCode =
  | 'INVALID_EXTENSION'
  | 'INVALID_MIME'
  | 'FILE_TOO_LARGE'
  | 'FILE_EMPTY'
  | 'UNSUPPORTED_IFC_VERSION'
  | 'CORRUPTED_FILE'
  | 'WASM_INIT_FAILED'
  | 'PARSE_FAILED'
  | 'GEOMETRY_ERROR'
  | 'SCENE_BUILD_FAILED'
  | 'VIEWER_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN'

export type UploadState =
  | { id: 'idle' }
  | { id: 'dragging' }
  | { id: 'validating';     file: File }
  | { id: 'queued';         file: File }
  | { id: 'parsing';        file: File; progress: number; stage: ParseStage }
  | { id: 'building-scene'; file: File; progress: number }
  | { id: 'success';        file: File; durationMs: number }
  | { id: 'error';          file: File | null; error: UploadError }
  | { id: 'cancelled';      file: File | null }

export type UploadEvent =
  | { type: 'DRAG_ENTER' }
  | { type: 'DRAG_LEAVE' }
  | { type: 'FILE_PICKED';    file: File }
  | { type: 'VALIDATION_OK';  file: File }
  | { type: 'VALIDATION_ERR'; file: File; error: UploadError }
  | { type: 'PARSE_START' }
  | { type: 'PARSE_PROGRESS'; progress: number }
  | { type: 'SCENE_BUILD_START' }
  | { type: 'SCENE_PROGRESS';  progress: number }
  | { type: 'SUCCESS';         durationMs: number }
  | { type: 'ERROR';           error: UploadError }
  | { type: 'CANCEL' }
  | { type: 'RETRY' }
  | { type: 'RESET' }

// Props for UploadOverlay — backward-compatible with App.tsx
export interface UploadOverlayProps {
  onClose:      () => void
  onLoad:       (file: File) => void
  /** Opens the demo model gallery (closes this overlay first). Optional. */
  onOpenDemoGallery?: () => void
  isLoading:    boolean
  loadProgress: number
  loadError?:   string | null
  /** Set to true once the viewer has fully built the scene */
  loadDone?:    boolean
  onCancel?:    () => void
}