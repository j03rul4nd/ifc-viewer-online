// ─── src/lib/upload.utils.ts ──────────────────────────────────────────────────
// Pure functions — no side-effects, no React imports.
//
// Two layers live here:
//   • per-file checks (header sniff, `validateIfcFile`, `prepareUploadFile`);
//   • selection logic the dialog's reducer is built from (row statuses, what a
//     submit takes, whether the fast path applies). Keeping it out of the
//     reducer file is what lets it be tested without rendering anything.

import type {
  BatchDraft,
  SubmitScope,
  UploadCheck,
  UploadEntry,
  UploadEntryStatus,
  UploadError,
  UploadErrorCode,
} from '../types/upload.types'
import type { DuplicateMatch } from './loading/controller'
import { fingerprintBlob } from './loading/fingerprint'
import { inferBatchName } from './loading/discipline'
import {
  ACCEPTED_MIMES,
  ERROR_MESSAGES,
  HEADER_SNIFF_BYTES,
  LARGE_FILE_BYTES,
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_IFC_VERSIONS,
  VERY_LARGE_FILE_BYTES,
} from './upload.constants'

export function makeError(
  code: UploadErrorCode,
  technical?: string,
  retryable = false,
): UploadError {
  return { code, message: ERROR_MESSAGES[code], technical, retryable }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

// ── Header ────────────────────────────────────────────────────────────────────

export interface IfcHeaderInfo {
  /** Starts with the STEP Physical File signature "ISO-10303-21". */
  magic:   boolean
  /** FILE_SCHEMA, upper-cased ("IFC4"), or null when the header does not declare one. */
  version: string | null
}

const SCHEMA_RE = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i

/** Parse the head of a STEP file. `Blob.text()` has already dropped a UTF-8 BOM. */
export function parseIfcHeader(head: string): IfcHeaderInfo {
  const match = head.match(SCHEMA_RE)
  return {
    magic: head.startsWith('ISO-10303-21'),
    version: match ? match[1].toUpperCase() : null,
  }
}

/**
 * Read and parse the first `HEADER_SNIFF_BYTES`. Rejects when the file cannot
 * be read at all — which is NOT the same as a bad header, and deserves its own
 * message (a dropped Outlook attachment, a file moved since it was picked).
 *
 * 4 KB rather than the 512 bytes this used to read: exporters that write a long
 * FILE_DESCRIPTION / FILE_NAME (view definitions, author lists, tool strings)
 * push FILE_SCHEMA past 512 bytes, and the schema then silently read as unknown.
 */
export async function readIfcHeader(file: Blob): Promise<IfcHeaderInfo> {
  return parseIfcHeader(await file.slice(0, HEADER_SNIFF_BYTES).text())
}

/** FILE_SCHEMA from the header, or null (also when the file cannot be read). */
export async function readIfcVersion(file: File): Promise<string | null> {
  try {
    return (await readIfcHeader(file)).version
  } catch {
    return null
  }
}

/** STEP Physical File starts with "ISO-10303-21". */
export async function hasIfcMagicBytes(file: File): Promise<boolean> {
  try {
    return (await readIfcHeader(file)).magic
  } catch {
    return false
  }
}

export function isSupportedIfcVersion(version: string): boolean {
  return SUPPORTED_IFC_VERSIONS.some(v => version === v || version.startsWith(v))
}

export function isIfcFileName(name: string): boolean {
  return name.trim().toLowerCase().endsWith('.ifc')
}

export function isLargeFile(bytes: number): boolean {
  return bytes >= LARGE_FILE_BYTES
}

export function isVeryLargeFile(bytes: number): boolean {
  return bytes >= VERY_LARGE_FILE_BYTES
}

// ── Per-file checks ───────────────────────────────────────────────────────────

export type IfcValidationResult =
  | { ok: true; version: string | null }
  | { ok: false; error: UploadError }

/**
 * Everything that can be decided about an IFC before parsing it, cheapest
 * first: name, size and MIME cost nothing; the header read costs one 4 KB
 * slice. Never rejects.
 */
export async function validateIfcFile(file: File): Promise<IfcValidationResult> {
  // 1. Extension
  if (!isIfcFileName(file.name)) {
    return { ok: false, error: makeError('INVALID_EXTENSION') }
  }
  // 2. Empty
  if (file.size === 0) {
    return { ok: false, error: makeError('FILE_EMPTY') }
  }
  // 3. Size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: makeError('FILE_TOO_LARGE', `${file.size} bytes`) }
  }
  // 4. MIME hint (not strict — browsers return inconsistent values for .ifc;
  //    the empty string and octet-stream are accepted for that reason)
  if (file.type && !ACCEPTED_MIMES.has(file.type)) {
    return { ok: false, error: makeError('INVALID_MIME', file.type) }
  }
  // 5. Header: signature + schema, one read
  let header: IfcHeaderInfo
  try {
    header = await readIfcHeader(file)
  } catch (err) {
    const technical = err instanceof Error ? err.message : String(err)
    return { ok: false, error: makeError('READ_FAILED', technical, /* retryable */ true) }
  }
  if (!header.magic) {
    return { ok: false, error: makeError('CORRUPTED_FILE') }
  }
  // 6. Schema. An undeclared schema is let through: web-ifc will say more
  //    precisely what is wrong than a guess here could.
  if (header.version !== null && !isSupportedIfcVersion(header.version)) {
    return { ok: false, error: makeError('UNSUPPORTED_IFC_VERSION', `Detected: ${header.version}`) }
  }
  return { ok: true, version: header.version }
}

export interface PrepareDeps {
  /** A loaded model or live job with this fingerprint (`loadingController.findDuplicate`). */
  findDuplicate: (fingerprint: string) => DuplicateMatch | null
  /** Injected for tests; defaults to the sampled SHA-256 fingerprint. */
  fingerprint?: (blob: Blob) => Promise<string>
}

/**
 * Validate, fingerprint and look up one file. Invalid files are not
 * fingerprinted (nothing will load them). A fingerprint that cannot be computed
 * leaves the file loadable with duplicate detection off — refusing a valid IFC
 * because a 192 KB sample could not be hashed would be the wrong trade.
 * Never rejects.
 */
export async function prepareUploadFile(file: File, deps: PrepareDeps): Promise<UploadCheck> {
  const validation = await validateIfcFile(file)
  if (!validation.ok) return validation

  let fingerprint: string | null = null
  try {
    fingerprint = await (deps.fingerprint ?? fingerprintBlob)(file)
  } catch {
    fingerprint = null
  }

  let existing: DuplicateMatch | null = null
  if (fingerprint) {
    try {
      existing = deps.findDuplicate(fingerprint)
    } catch {
      existing = null
    }
  }
  return { ok: true, version: validation.version, fingerprint, existing }
}

// ── Selection logic ───────────────────────────────────────────────────────────

/**
 * Each row's status. Derived on every render instead of stored, because a
 * row's duplicate status depends on the OTHER rows: the first file with a given
 * fingerprint is the original, later ones are "duplicate in selection" — and
 * checks finish in any order. A loaded duplicate wins over an in-selection one
 * (it comes with an action: Open existing).
 */
export function entryStatuses(entries: readonly UploadEntry[]): Map<string, UploadEntryStatus> {
  const out = new Map<string, UploadEntryStatus>()
  const firstByFingerprint = new Map<string, string>()
  for (const e of entries) {
    const c = e.check
    if (!c) { out.set(e.key, { kind: 'pending' }); continue }
    if (!c.ok) { out.set(e.key, { kind: 'invalid', error: c.error }); continue }
    const first = c.fingerprint ? firstByFingerprint.get(c.fingerprint) : undefined
    if (c.fingerprint && first === undefined) firstByFingerprint.set(c.fingerprint, e.key)
    if (c.existing) out.set(e.key, { kind: 'loaded-duplicate', match: c.existing })
    else if (first !== undefined) out.set(e.key, { kind: 'selection-duplicate', ofKey: first })
    else out.set(e.key, { kind: 'valid' })
  }
  return out
}

/** Valid, non-duplicate rows start checked; duplicates start unchecked; invalid never. */
export function isDefaultChecked(status: UploadEntryStatus | undefined): boolean {
  return status?.kind === 'valid'
}

/** Rows a user may check (duplicates included — "Load selected" honours them). */
export function isSelectable(status: UploadEntryStatus | undefined): boolean {
  return status !== undefined && status.kind !== 'pending' && status.kind !== 'invalid'
}

export function allPrepared(entries: readonly UploadEntry[]): boolean {
  return entries.every((e) => e.check !== null)
}

/** Fill the checkbox of rows checked in this round; rows the user already saw keep their state. */
export function applyDefaultChecks(entries: readonly UploadEntry[]): UploadEntry[] {
  const statuses = entryStatuses(entries)
  return entries.map((e) =>
    e.checked === null ? { ...e, checked: isDefaultChecked(statuses.get(e.key)) } : e,
  )
}

export type PreparedPlan =
  | 'fast'       // one valid, new, small file: submit without a review step
  | 'review'
  | 'duplicate'  // one file, already loaded or loading
  | 'error'      // nothing in the selection can load

/**
 * Where a fully checked selection goes next. The fast path needs the WHOLE
 * selection to be that one file: with two files dropped and one invalid, the
 * user should see why one of them did not load rather than have it vanish.
 */
export function planAfterPrepare(entries: readonly UploadEntry[]): PreparedPlan {
  const statuses = entryStatuses(entries)
  if (entries.length === 0 || entries.every((e) => statuses.get(e.key)?.kind === 'invalid')) return 'error'
  if (entries.length === 1) {
    const only = entries[0]
    const status = statuses.get(only.key)
    if (status?.kind === 'loaded-duplicate') return 'duplicate'
    if (status?.kind === 'valid' && !isLargeFile(only.file.size)) return 'fast'
  }
  return 'review'
}

/** The rows a submit takes, in selection order (the first IFC anchors the federation). */
export function selectForSubmit(entries: readonly UploadEntry[], scope: SubmitScope): UploadEntry[] {
  const statuses = entryStatuses(entries)
  switch (scope) {
    case 'all':
      return entries.filter((e) => statuses.get(e.key)?.kind === 'valid')
    case 'selected':
      return entries.filter((e) => e.checked === true && isSelectable(statuses.get(e.key)))
    case 'duplicate':
      return entries.length === 1 && isSelectable(statuses.get(entries[0].key)) ? [entries[0]] : []
  }
}

/**
 * The batch name a submit uses: what the user typed, else the name inferred
 * from the files actually submitted. null = neither (the dialog then falls back
 * to its localised "N models"). A single file is not a batch.
 */
export function resolveBatchName(draft: BatchDraft, submitted: readonly UploadEntry[]): string | null {
  if (submitted.length < 2) return null
  const typed = draft.name?.trim()
  if (typed) return typed
  return inferBatchName(submitted.map((e) => e.file.name))
}

/**
 * The name the batch field shows while untouched: inferred from what "Load
 * selected" would take, or from every valid row when nothing is checked.
 */
export function suggestedBatchName(entries: readonly UploadEntry[]): string | null {
  const statuses = entryStatuses(entries)
  const checked = entries.filter((e) => e.checked === true && isSelectable(statuses.get(e.key)))
  const basis = checked.length > 0
    ? checked
    : entries.filter((e) => isSelectable(statuses.get(e.key)))
  return basis.length > 0 ? inferBatchName(basis.map((e) => e.file.name)) : null
}

export interface SelectionSummary {
  /** Rows in the dialog. */
  total: number
  /** Valid, non-duplicate rows: "Load all (k)" as the primary, "Load new only (k)" beside a changed selection. */
  allCount: number
  /** "Load selected (k)". */
  selectedCount: number
  selectedBytes: number
  totalBytes: number
  /** The checked set is exactly the "all" set (one button is enough). */
  selectionIsAll: boolean
  /** A loadable row is ≥ LARGE_FILE_BYTES. */
  hasLarge: boolean
  /** A loadable row is ≥ VERY_LARGE_FILE_BYTES. */
  hasVeryLarge: boolean
}

export function summarizeSelection(entries: readonly UploadEntry[]): SelectionSummary {
  const statuses = entryStatuses(entries)
  let allCount = 0
  let selectedCount = 0
  let selectedBytes = 0
  let totalBytes = 0
  let selectionIsAll = true
  let hasLarge = false
  let hasVeryLarge = false
  for (const e of entries) {
    const status = statuses.get(e.key)
    const inAll = status?.kind === 'valid'
    const selected = e.checked === true && isSelectable(status)
    totalBytes += e.file.size
    if (inAll) allCount++
    if (selected) { selectedCount++; selectedBytes += e.file.size }
    if (inAll !== selected) selectionIsAll = false
    if (isSelectable(status)) {
      if (isLargeFile(e.file.size)) hasLarge = true
      if (isVeryLargeFile(e.file.size)) hasVeryLarge = true
    }
  }
  return {
    total: entries.length,
    allCount, selectedCount, selectedBytes, totalBytes,
    selectionIsAll, hasLarge, hasVeryLarge,
  }
}
