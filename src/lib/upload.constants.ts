// ─── src/lib/upload.constants.ts ─────────────────────────────────────────────

import type { UploadErrorCode } from '../types/upload.types'

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB

/**
 * From here a file is "large" in the dialog: no fast path (the user confirms
 * before minutes of background work start), a per-row note and a banner.
 * Deliberately not the scheduler's `largeFileBytes` (which decides when a
 * conversion runs alone): this one is about setting expectations, that one
 * about memory, and they are tuned for different reasons.
 */
export const LARGE_FILE_BYTES = 200 * 1024 * 1024 // 200 MB

/**
 * From here the dialog also warns about the WebAssembly memory ceiling. web-ifc
 * parses inside a single 32-bit WASM heap (4 GB at most), and the file's bytes
 * and the parsed model have to fit in it together — so past a point the load
 * fails however much RAM the machine has (around 2.5 GB of IFC in practice).
 * The 2 GB hard limit sits below that; this threshold is where the risk starts
 * being worth a sentence.
 */
export const VERY_LARGE_FILE_BYTES = 1024 * 1024 * 1024 // 1 GB

/** Bytes read from the head of a file to check the signature and FILE_SCHEMA. */
export const HEADER_SNIFF_BYTES = 4096

/** Files checked in parallel while preparing a selection. */
export const PREPARE_CONCURRENCY = 4

export const ACCEPTED_MIMES = new Set([
  'application/x-step',
  'application/step',
  'model/step',
  'application/octet-stream',
  '', // many OS/browsers return empty string for .ifc
])

export const SUPPORTED_IFC_VERSIONS = ['IFC2X3', 'IFC4', 'IFC4X1', 'IFC4X3'] as const

/** English, for logs and `UploadError.message`. The UI localises by code (`upload.errors.*`). */
export const ERROR_MESSAGES: Record<UploadErrorCode, string> = {
  INVALID_EXTENSION:       'File must have a .ifc extension.',
  INVALID_MIME:            'File type not recognised as IFC.',
  FILE_TOO_LARGE:          'File exceeds the 2 GB limit.',
  FILE_EMPTY:              'File appears to be empty.',
  UNSUPPORTED_IFC_VERSION: 'IFC version not supported. Accepted: IFC2x3, IFC4, IFC4x3.',
  CORRUPTED_FILE:          'File header is invalid — the file may be corrupted.',
  READ_FAILED:             'The file could not be read. It may have been moved or its permission revoked.',
  UNKNOWN:                 'An unexpected error occurred.',
}
