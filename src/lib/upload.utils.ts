// ─── src/lib/upload.utils.ts ──────────────────────────────────────────────────
// Pure functions — no side-effects, no React imports.

import type { UploadError, UploadErrorCode } from '../types/upload.types'
import { ERROR_MESSAGES, SUPPORTED_IFC_VERSIONS } from './upload.constants'

export function makeError(
  code: UploadErrorCode,
  technical?: string,
  retryable = false,
): UploadError {
  return { code, message: ERROR_MESSAGES[code], technical, retryable }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

/** Reads the first 512 bytes to extract the FILE_SCHEMA IFC version. */
export async function readIfcVersion(file: File): Promise<string | null> {
  try {
    const text  = await file.slice(0, 512).text()
    const match = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)
    return match ? match[1].toUpperCase() : null
  } catch {
    return null
  }
}

/** STEP Physical File starts with "ISO-10303-21". */
export async function hasIfcMagicBytes(file: File): Promise<boolean> {
  try {
    const text = await file.slice(0, 16).text()
    return text.startsWith('ISO-10303-21')
  } catch {
    return false
  }
}

export function isSupportedIfcVersion(version: string): boolean {
  return SUPPORTED_IFC_VERSIONS.some(v => version === v || version.startsWith(v))
}