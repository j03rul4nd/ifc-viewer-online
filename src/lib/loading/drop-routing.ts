// ─── Drop routing ─────────────────────────────────────────────────────────────
// One drop can carry a whole project folder: three discipline IFCs, the IDS the
// client sent, last week's BCF, a scan and a textured glTF with its .bin. Each of
// those has its own subsystem, and until now the viewer only looked at the FIRST
// file of a drop — so dropping four IFCs loaded one, and dropping an IFC next to
// an IDS loaded whichever the OS happened to list first.
//
// This module answers one question — "which subsystem does each file belong
// to?" — by extension, synchronously, without reading a byte. Content checks
// (magic bytes, schema, duplicates) happen later in the subsystem that owns the
// file; a wrong extension is caught there with a message that can name the
// actual problem.
//
// ── Why the extension lists are copied, not imported
// The source of truth for point clouds is `EXTENSION_FORMATS` in
// src/lib/pointcloud/pc-format.ts, and for meshes `MESH_EXTENSIONS` in
// src/lib/mesh/mesh-types.ts. pc-format imports every reader (LAZ pulls in its
// WASM loader), and the global drop handler lives in App — importing either
// module here would drag the point-cloud runtime into the entry chunk just to
// compare five-letter strings. drop-routing.test.ts imports both modules and
// fails the moment the lists drift, which is the cheap half of that trade.

// ── Extension tables ──────────────────────────────────────────────────────────

export const IFC_EXTENSIONS = ['.ifc'] as const

/** Only `.ids`. A bare `.xml` is far more often something else than an IDS. */
export const IDS_EXTENSIONS = ['.ids'] as const

export const BCF_EXTENSIONS = ['.bcf', '.bcfzip'] as const

/**
 * Mirror of `EXTENSION_FORMATS` (src/lib/pointcloud/pc-format.ts). COPC files
 * are named `*.copc.laz`, so they arrive here as `.laz` — which is correct: the
 * point-cloud runner re-reads the double extension itself (`isCopcName`).
 *
 * `.csv` / `.txt` are ambiguous by nature; they route to point clouds because
 * that is the only subsystem in the app that opens them, and its XYZ reader
 * sniffs the layout and rejects text that is not a point list.
 */
export const POINTCLOUD_EXTENSIONS = [
  '.las', '.laz', '.copc', '.ply', '.pcd', '.xyz', '.pts', '.csv', '.asc', '.txt',
] as const

/**
 * Mirror of `MESH_EXTENSIONS` (src/lib/mesh/mesh-types.ts), split by role.
 * Entry files are what the mesh loader decodes; sidecars only mean something
 * next to one, but they are unambiguous enough to route on their own (the mesh
 * loader then says "no GLB, glTF or OBJ in that selection", which is the right
 * message). Textures are NOT unambiguous — a screenshot dropped next to an IFC
 * is not a mesh texture — so they join the mesh bucket only when the same drop
 * carries an entry file.
 */
export const MESH_ENTRY_EXTENSIONS = ['.glb', '.gltf', '.obj'] as const
export const MESH_SIDECAR_EXTENSIONS = ['.mtl', '.bin'] as const
export const MESH_TEXTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const

// ── Routing ───────────────────────────────────────────────────────────────────

export interface FileRouting {
  ifc: File[]
  ids: File[]
  bcf: File[]
  pointcloud: File[]
  /** Entry files, sidecars and (when an entry is present) textures — one selection for the mesh loader. */
  mesh: File[]
  /** Anything no subsystem opens: the caller decides whether to say so. */
  other: File[]
}

type Bucket = Exclude<keyof FileRouting, 'other'>

const BY_EXTENSION: Record<string, Bucket> = {}
for (const ext of IFC_EXTENSIONS) BY_EXTENSION[ext] = 'ifc'
for (const ext of IDS_EXTENSIONS) BY_EXTENSION[ext] = 'ids'
for (const ext of BCF_EXTENSIONS) BY_EXTENSION[ext] = 'bcf'
for (const ext of POINTCLOUD_EXTENSIONS) BY_EXTENSION[ext] = 'pointcloud'
for (const ext of MESH_ENTRY_EXTENSIONS) BY_EXTENSION[ext] = 'mesh'
for (const ext of MESH_SIDECAR_EXTENSIONS) BY_EXTENSION[ext] = 'mesh'

const TEXTURES: ReadonlySet<string> = new Set(MESH_TEXTURE_EXTENSIONS)
const MESH_ENTRIES: ReadonlySet<string> = new Set(MESH_ENTRY_EXTENSIONS)

/** Lower-cased last extension including the dot (`'.ifc'`), or `''`. */
export function fileExtensionOf(fileName: string): string {
  const name = fileName.trim()
  const dot = name.lastIndexOf('.')
  // A leading dot is a hidden file's name, not an extension (".DS_Store").
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Split a drop (or a multi-file pick) by the subsystem that opens each file.
 * Order inside every bucket is the order the files arrived in — batch naming
 * and the anchor rule (first-submitted IFC sets the coordinate base) rely on it.
 */
export function classifyFiles(files: readonly File[]): FileRouting {
  const out: FileRouting = { ifc: [], ids: [], bcf: [], pointcloud: [], mesh: [], other: [] }
  const textures: File[] = []
  let hasMeshEntry = false

  for (const file of files) {
    const ext = fileExtensionOf(file.name)
    if (TEXTURES.has(ext)) { textures.push(file); continue }
    const bucket = BY_EXTENSION[ext]
    if (!bucket) { out.other.push(file); continue }
    if (bucket === 'mesh' && MESH_ENTRIES.has(ext)) hasMeshEntry = true
    out[bucket].push(file)
  }

  if (hasMeshEntry) out.mesh.push(...textures)
  else out.other.push(...textures)

  // `.txt` / `.csv` are point lists only when nothing else says otherwise. In
  // a project folder dropped next to its IFCs they are the README and the
  // issue export — each one used to become a failed scan and a toast. They
  // stay scans when the drop is only them, or carries other scans.
  const ambiguous = out.pointcloud.filter((f) => AMBIGUOUS_TEXT.has(fileExtensionOf(f.name)))
  const hasRealScan = out.pointcloud.length > ambiguous.length
  if (ambiguous.length > 0 && !hasRealScan && (out.ifc.length > 0 || hasMeshEntry)) {
    out.pointcloud = out.pointcloud.filter((f) => !AMBIGUOUS_TEXT.has(fileExtensionOf(f.name)))
    out.other.push(...ambiguous)
  }
  return out
}

/** Text extensions that are a point list only in context (see classifyFiles). */
const AMBIGUOUS_TEXT: ReadonlySet<string> = new Set(['.txt', '.csv'])

/** One mesh import: the file the loader decodes, and everything it may reference. */
export interface MeshImportGroup {
  entry: File
  /** Every non-entry file of the selection (.bin, .mtl, textures). */
  sidecars: File[]
}

/**
 * Split a mesh bucket into one import per entry file.
 *
 * The mesh loader decodes ONE entry file per call, so handing it a drop of
 * chair.glb + table.glb imported the chair and silently ignored the table.
 * Each entry now becomes its own import. The sidecars are shared by all of
 * them rather than guessed apart: the loader resolves a reference by basename
 * and only mints a URL for a file that is actually referenced, so an unrelated
 * texture in the list costs nothing — while guessing wrong would lose a
 * texture. (Pairing an OBJ with its own .mtl is the loader's job; it prefers
 * the .mtl whose name matches.)
 *
 * No entry at all → no group: the caller reports "nothing to import".
 */
export function groupMeshFiles(files: readonly File[]): MeshImportGroup[] {
  const entries: File[] = []
  const sidecars: File[] = []
  for (const file of files) {
    if (MESH_ENTRIES.has(fileExtensionOf(file.name))) entries.push(file)
    else sidecars.push(file)
  }
  return entries.map((entry) => ({ entry, sidecars }))
}

/** Total number of files that some subsystem will open. */
export function routedCount(routing: FileRouting): number {
  return routing.ifc.length + routing.ids.length + routing.bcf.length
    + routing.pointcloud.length + routing.mesh.length
}

// ── DataTransfer ──────────────────────────────────────────────────────────────

/** The part of a DataTransfer this module reads — plain objects work in tests. */
export interface DataTransferLike {
  types?: ArrayLike<string> | null
  items?: ArrayLike<{ kind: string }> | null
}

/**
 * Does this drag carry files from the OS?
 *
 * During `dragenter`/`dragover` the browser hides `files` (it is empty until
 * the drop, for privacy), so the only honest signal is `types` containing
 * `'Files'`. `items[].kind` is the fallback for engines that populate it
 * earlier. Internal drags — the scene tree's own row DnD, a text selection —
 * never carry `'Files'`, which is exactly why a drop target must check this
 * before it highlights or calls `preventDefault()`.
 */
export function hasFilePayload(dataTransfer: DataTransferLike | null | undefined): boolean {
  if (!dataTransfer) return false
  const types = dataTransfer.types
  if (types) {
    for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true
  }
  const items = dataTransfer.items
  if (items) {
    for (let i = 0; i < items.length; i++) if (items[i]?.kind === 'file') return true
  }
  return false
}
