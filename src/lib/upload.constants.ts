// ─── src/lib/upload.constants.ts ─────────────────────────────────────────────

import type { ParseStage, UploadErrorCode } from '../types/upload.types'

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB

export const ACCEPTED_MIMES = new Set([
  'application/x-step',
  'application/step',
  'model/step',
  'application/octet-stream',
  '', // many OS/browsers return empty string for .ifc
])

export const SUPPORTED_IFC_VERSIONS = ['IFC2X3', 'IFC4', 'IFC4X1', 'IFC4X3'] as const

export const STAGE_THRESHOLDS: Record<ParseStage, { min: number; max: number; label: string }> = {
  'wasm-init':  { min: 0,  max: 10,  label: 'Initialising WebAssembly engine' },
  'file-read':  { min: 10, max: 25,  label: 'Reading file buffer'             },
  'ifc-parse':  { min: 25, max: 55,  label: 'Parsing STEP entities'           },
  'geometry':   { min: 55, max: 80,  label: 'Building geometry meshes'        },
  'scene':      { min: 80, max: 95,  label: 'Composing Three.js scene'        },
  'finalising': { min: 95, max: 100, label: 'Finalising viewer'               },
}

export function progressToStage(pct: number): ParseStage {
  for (const [stage, { min, max }] of Object.entries(STAGE_THRESHOLDS)) {
    if (pct >= min && pct < max) return stage as ParseStage
  }
  return 'finalising'
}

export const ERROR_MESSAGES: Record<UploadErrorCode, string> = {
  INVALID_EXTENSION:       'File must have a .ifc extension.',
  INVALID_MIME:            'File type not recognised as IFC.',
  FILE_TOO_LARGE:          'File exceeds the 2 GB limit.',
  FILE_EMPTY:              'File appears to be empty.',
  UNSUPPORTED_IFC_VERSION: 'IFC version not supported. Accepted: IFC2x3, IFC4, IFC4x3.',
  CORRUPTED_FILE:          'File header is invalid — the file may be corrupted.',
  WASM_INIT_FAILED:        'WebAssembly engine failed to initialise. Try reloading the page.',
  PARSE_FAILED:            'Failed to parse IFC file. The model may be malformed.',
  GEOMETRY_ERROR:          'Geometry processing error. Some elements may be missing.',
  SCENE_BUILD_FAILED:      'Failed to build the 3D scene.',
  VIEWER_ERROR:            'Viewer encountered an unexpected error.',
  CANCELLED:               'Load was cancelled.',
  UNKNOWN:                 'An unexpected error occurred.',
}