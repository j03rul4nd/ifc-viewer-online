// ─── Expand a drop: folders and archives into plain files ────────────────────
// People hand over a project the way it sits on their disk: a folder with
// sub-folders per discipline, or the zip the CDE exported — IFCs, the scan, the
// site GeoJSON, a glTF with its textures, the IDS. drop-routing decides where
// each FILE goes; this module first turns that folder or archive into files, so
// one drop can assemble the whole scene.
//
// Everything runs in the browser (fflate, already a dependency, lazy-loaded):
// nothing is uploaded. Supported containers: folders, .zip (nested too),
// .ifczip, .gz/.tgz, .tar, and .rar/.7z through 7-Zip in WASM (sevenzip.ts,
// loaded only when one is dropped). xz / bz2 / zst come back in
// `unsupportedArchives` so the caller can say so instead of "unsupported file".

import { fileExtensionOf, isWeatherZipName } from './drop-routing'

/** Archives this module opens. `.bcfzip` is NOT here: a BCF is opened whole. */
const ZIP_EXT = new Set(['.zip', '.ifczip'])
const GZ_EXT = new Set(['.gz', '.tgz'])
const TAR_EXT = new Set(['.tar'])
const SEVENZIP_EXT = new Set(['.rar', '.7z'])
/** Archives recognised but not opened in the browser. */
export const UNSUPPORTED_ARCHIVE_EXT = new Set(['.xz', '.bz2', '.zst'])

/** Stop before a hostile or huge archive takes the tab down. */
export const MAX_EXPANDED_BYTES = 4 * 1024 ** 3
const MAX_DEPTH = 3
const MAX_FILES = 5000

export interface ExpandResult {
  files: File[]
  /** Archives that were opened, with how many files each gave. */
  opened: Array<{ name: string; count: number }>
  /** xz / bz2 / zst — recognised, not opened. */
  unsupportedArchives: File[]
  /** Archives that failed to open (corrupt, or password-protected: `encrypted`). */
  failed: Array<{ name: string; reason: string; encrypted?: boolean }>
  /** True when a size or count cap cut the expansion short. */
  truncated: boolean
}

/** Junk every OS and zip tool leaves behind. */
export function isJunkPath(path: string): boolean {
  const parts = path.split('/')
  const base = parts[parts.length - 1]
  return parts.some((p) => p === '__MACOSX' || p === '.git' || p === 'node_modules')
    || base === '' || base.startsWith('.') || base === 'Thumbs.db' || base === 'desktop.ini'
}

export function isArchiveName(name: string): boolean {
  const ext = fileExtensionOf(name)
  if (ext === '.zip' && isWeatherZipName(name)) return false // the solar panel opens those itself
  return ZIP_EXT.has(ext) || GZ_EXT.has(ext) || TAR_EXT.has(ext) || SEVENZIP_EXT.has(ext)
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** A File named by its base name, remembering where it came from. */
function makeFile(bytes: Uint8Array, path: string, lastModified: number): File {
  const f = new File([bytes as BlobPart], baseName(path), { lastModified })
  try { Object.defineProperty(f, 'sourcePath', { value: path }) } catch { /* frozen */ }
  return f
}

/** Minimal ustar reader: regular files only. */
export function readTar(bytes: Uint8Array): Array<{ path: string; data: Uint8Array }> {
  const out: Array<{ path: string; data: Uint8Array }> = []
  const dec = new TextDecoder()
  const str = (o: number, n: number): string => dec.decode(bytes.subarray(o, o + n)).replace(/\0.*$/s, '').trim()
  let off = 0
  let longName: string | null = null
  while (off + 512 <= bytes.length) {
    const name = str(off, 100)
    if (!name) break
    const size = parseInt(str(off + 124, 12), 8) || 0
    const type = String.fromCharCode(bytes[off + 156] || 48)
    const prefix = str(off + 345, 155)
    const dataStart = off + 512
    const data = bytes.subarray(dataStart, dataStart + size)
    if (type === 'L') longName = dec.decode(data).replace(/\0.*$/s, '')
    else {
      const path = longName ?? (prefix ? `${prefix}/${name}` : name)
      longName = null
      if (type === '0' || type === '\0' || type === '7') out.push({ path, data })
    }
    off = dataStart + Math.ceil(size / 512) * 512
  }
  return out
}

/**
 * Replace every archive in `files` by what it contains (recursively), drop
 * OS junk, and keep everything else as is, in order.
 */
export async function expandArchives(files: readonly File[], onProgress?: (name: string) => void): Promise<ExpandResult> {
  const res: ExpandResult = { files: [], opened: [], unsupportedArchives: [], failed: [], truncated: false }
  let total = 0

  const push = (f: File): boolean => {
    if (res.files.length >= MAX_FILES || total + f.size > MAX_EXPANDED_BYTES) { res.truncated = true; return false }
    total += f.size
    res.files.push(f)
    return true
  }

  const visit = async (file: File, depth: number): Promise<void> => {
    if (isJunkPath((file as File & { sourcePath?: string }).sourcePath ?? file.name)) return
    const ext = fileExtensionOf(file.name)
    if (UNSUPPORTED_ARCHIVE_EXT.has(ext)) { res.unsupportedArchives.push(file); return }
    if (!isArchiveName(file.name) || depth >= MAX_DEPTH) { push(file); return }
    onProgress?.(file.name)
    let entries: Array<{ path: string; data: Uint8Array }>
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (SEVENZIP_EXT.has(ext)) {
        const { extractWith7z } = await import('./sevenzip')
        entries = (await extractWith7z(bytes)).filter((e) => !isJunkPath(e.path))
      } else {
        const fflate = await import('fflate')
        if (ZIP_EXT.has(ext)) {
          const map = await new Promise<Record<string, Uint8Array>>((ok, ko) =>
            fflate.unzip(bytes, { filter: (f) => !f.name.endsWith('/') && !isJunkPath(f.name) }, (err, data) => (err ? ko(err) : ok(data))))
          entries = Object.entries(map).map(([path, data]) => ({ path, data }))
        } else if (GZ_EXT.has(ext)) {
          const raw = fflate.gunzipSync(bytes)
          const inner = file.name.replace(/\.t?gz$/i, ext === '.tgz' ? '.tar' : '')
          entries = fileExtensionOf(inner) === '.tar' ? readTar(raw) : [{ path: inner, data: raw }]
        } else {
          entries = readTar(bytes)
        }
      }
    } catch (err) {
      const encrypted = err instanceof Error && err.name === 'EncryptedArchiveError'
      res.failed.push({ name: file.name, reason: err instanceof Error ? err.message : String(err), ...(encrypted ? { encrypted } : {}) })
      return
    }
    const before = res.files.length
    // An .ifczip holds one IFC under any name; name it after the archive so
    // the row reads like the file the user picked.
    const ifcInside = ext === '.ifczip' ? entries.filter((e) => fileExtensionOf(e.path) === '.ifc') : []
    for (const e of entries) {
      if (res.truncated) break
      const path = ext === '.ifczip' && ifcInside.length === 1 && e === ifcInside[0]
        ? file.name.replace(/\.ifczip$/i, '.ifc')
        : e.path
      await visit(makeFile(e.data, path, file.lastModified), depth + 1)
    }
    res.opened.push({ name: file.name, count: res.files.length - before })
  }

  for (const f of files) {
    if (res.truncated) break
    await visit(f, 0)
  }
  return res
}

// ── Folders ──────────────────────────────────────────────────────────────────

interface FsEntry { isFile: boolean; isDirectory: boolean; name: string; fullPath: string }
interface FsFileEntry extends FsEntry { file: (ok: (f: File) => void, ko: (e: unknown) => void) => void }
interface FsDirEntry extends FsEntry { createReader: () => { readEntries: (ok: (e: FsEntry[]) => void, ko: (e: unknown) => void) => void } }

/**
 * The entries of a drop, captured SYNCHRONOUSLY — DataTransfer items are only
 * readable inside the event handler, so call this there and walk them later.
 * Null when the browser gives no entry API (then use dataTransfer.files).
 */
export function captureDropEntries(dt: DataTransfer | null | undefined): FsEntry[] | null {
  if (!dt?.items || dt.items.length === 0) return null
  const out: FsEntry[] = []
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.()
    if (!entry) return null
    out.push(entry)
  }
  return out.length > 0 ? out : null
}

/** True when any captured entry is a folder — worth a "reading folder…" note. */
export const hasDirectory = (entries: FsEntry[] | null): boolean => !!entries?.some((e) => e.isDirectory)

/** Walk captured entries into files (folders recursively, junk skipped). */
export async function filesFromEntries(entries: FsEntry[]): Promise<File[]> {
  const out: File[] = []
  const walk = async (entry: FsEntry): Promise<void> => {
    const path = entry.fullPath.replace(/^\//, '')
    if (isJunkPath(path)) return
    if (entry.isFile) {
      const f = await new Promise<File | null>((ok) => (entry as FsFileEntry).file(ok, () => ok(null)))
      if (f) {
        try { Object.defineProperty(f, 'sourcePath', { value: path }) } catch { /* frozen */ }
        out.push(f)
      }
      return
    }
    if (!entry.isDirectory || out.length >= MAX_FILES) return
    const reader = (entry as FsDirEntry).createReader()
    // readEntries returns at most ~100 per call; keep calling until empty.
    for (;;) {
      const batch = await new Promise<FsEntry[]>((ok) => reader.readEntries(ok, () => ok([])))
      if (batch.length === 0) break
      for (const e of batch) await walk(e)
    }
  }
  for (const e of entries) await walk(e)
  return out
}
