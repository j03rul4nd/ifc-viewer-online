// ─── pc-format ────────────────────────────────────────────────────────────────
// Format detection + the reader registry. THIS is the extension point: adding
// LAZ, COPC, E57 or PCD means writing one reader module and adding one entry to
// `READERS` below. Nothing downstream (chunker, alignment, renderer, UI) needs
// to know a new format exists.

import { LasReader } from './las-reader'
import { LazReader } from './laz-reader'
import { CopcReader } from './copc-reader'
import { PlyReader } from './ply-reader'
import { XyzReader } from './xyz-reader'
import type { PointReader } from './pc-reader'
import { DEFERRED_EXTENSIONS, type PointCloudFormat } from './pc-types'

type ReaderFactory = (file: File) => PointReader

const READERS: Record<PointCloudFormat, ReaderFactory> = {
  las: (f) => new LasReader(f),
  laz: (f) => new LazReader(f),
  copc: (f) => new CopcReader(f),
  ply: (f) => new PlyReader(f),
  xyz: (f) => new XyzReader(f),
}

const EXTENSION_FORMATS: Record<string, PointCloudFormat> = {
  '.las': 'las',
  '.laz': 'laz',
  '.copc': 'copc',
  '.ply': 'ply',
  '.xyz': 'xyz',
  '.pts': 'xyz',
  '.csv': 'xyz',
  '.asc': 'xyz',
  '.txt': 'xyz',
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

/**
 * COPC files are conventionally named `something.copc.laz`, so the extension
 * alone reports ".laz". The double extension is the only hint available before
 * reading bytes; the COPC reader still verifies the `copc` info VLR and the LAZ
 * reader picks up anything that lied.
 */
export function isCopcName(fileName: string): boolean {
  return /\.copc\.la[sz]$/i.test(fileName.trim())
}

export interface FormatDetection {
  ok: boolean
  format?: PointCloudFormat
  /** i18n key (pointcloud namespace) when ok is false. */
  errorKey?: string
}

/**
 * Decide which reader handles a file, by extension first and magic bytes as the
 * tie-break. Deferred formats get their OWN reason key — telling someone their
 * .laz is "unsupported" when we know exactly what it is and what to do about it
 * would be a worse answer than saying so.
 */
export function detectFormat(fileName: string, magic?: Uint8Array): FormatDetection {
  const ext = extensionOf(fileName)

  const deferred = DEFERRED_EXTENSIONS[ext]
  if (deferred) return { ok: false, errorKey: deferred }

  const byExtension = EXTENSION_FORMATS[ext]
  const byMagic = magic ? sniffMagic(magic) : null

  // Magic wins when the two disagree and the magic is unambiguous: a .txt that
  // is really a PLY is common, a .ply that is really LAS is not. The exception
  // is LAZ, which shares LAS's signature — there the extension is the only hint
  // available this early, and the LAS reader re-checks the compression bit.
  let format = byExtension === 'laz' && byMagic === 'las' ? 'laz' : (byMagic ?? byExtension)
  // `.copc.laz` — the octree reader, which reads far less of the file.
  if (isCopcName(fileName)) format = 'copc'
  if (!format) return { ok: false, errorKey: 'unsupported.unknown' }
  return { ok: true, format }
}

/**
 * LASF / ply signatures. Returns null for anything text-shaped.
 *
 * LAS and LAZ share the "LASF" signature — the compression flag lives in the
 * point-format byte at offset 104, far past a magic-number sniff. So this
 * reports 'las' for both and the LAS reader, which reads that byte, redirects.
 * See detectFormat.
 */
export function sniffMagic(bytes: Uint8Array): PointCloudFormat | null {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x4c && bytes[1] === 0x41 && bytes[2] === 0x53 && bytes[3] === 0x46) return 'las'
    if (bytes[0] === 0x70 && bytes[1] === 0x6c && bytes[2] === 0x79) return 'ply'
  }
  return null
}

export function createReader(format: PointCloudFormat, file: File): PointReader {
  return READERS[format](file)
}

/** `accept` string for the file input. */
export function acceptAttribute(): string {
  return Object.keys(EXTENSION_FORMATS).join(',')
}
