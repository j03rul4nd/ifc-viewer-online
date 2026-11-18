// ─── mesh-loader ──────────────────────────────────────────────────────────────
// Decode a user-supplied mesh: GLB, glTF and OBJ.
//
// ── Why this takes a LIST of files
// A .glb is self-contained, but the other two are not. A .gltf points at a .bin
// and at image files by relative path; an .obj points at a .mtl, which points at
// textures. Loading only the file the user clicked gets you grey geometry — and
// grey geometry is precisely the failure that makes an import worthless for the
// thing it is for, which is showing a client what a place looks like.
//
// So the whole selection is taken, and a LoadingManager URL modifier resolves
// every relative reference against it. That is the supported three.js hook for
// exactly this, and it means no server, no upload, and no path rewriting.
//
// ── Blob URLs are revoked, always
// Every object URL minted here is released in a finally block. They are the one
// resource in this module the garbage collector cannot reclaim on its own: an
// un-revoked blob URL pins the entire file in memory for the life of the
// document, and a few hundred-megabyte textures would never come back.
//
// ── Cancellation
// The decode runs on the main thread (see mesh-runner for why), so it cannot be
// interrupted mid-parse — but it can refuse to go on. The signal is checked
// after every await, and the one await that does no work of its own (waiting
// for textures to drain) races it outright. Whatever was built before the abort
// is disposed HERE, because the caller never sees it and so nothing else can.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { getDracoLoader, getKtx2Loader } from './mesh-decoders'
import type { MeshFormat, MeshStats } from './mesh-types'

export interface MeshLoadResult {
  object: THREE.Object3D
  format: MeshFormat
  stats: MeshStats
  /** Source-space bounds, before any unit scaling or placement. */
  box: THREE.Box3
  /** The file the others hang off — what the entry is named after. */
  entryFile: File
}

export interface MeshDecodeOptions {
  /** Prefer this file as the entry when the selection holds several (see findEntryFile). */
  entryName?: string | null
  /**
   * Stops the decode at its next await, and the texture-drain wait at once.
   * The promise then rejects with 'cancelled' and nothing built so far survives.
   */
  signal?: AbortSignal
}

/** How long to wait for textures before revoking their URLs. */
const TEXTURE_DRAIN_TIMEOUT_MS = 30_000

/**
 * How far into an OBJ to look for `mtllib`. It is a header statement — it has
 * to come before the `usemtl` lines that use it — so every exporter writes it
 * near the top, and bounding the scan keeps a 500 MB OBJ from paying a second
 * full pass for a line that was on line three.
 */
const MTLLIB_SCAN_CHARS = 64 * 1024

const EXT_FORMATS: Record<string, MeshFormat> = {
  '.glb': 'glb', '.gltf': 'gltf', '.obj': 'obj',
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/** Last path segment, lower-cased — the identity every reference resolves by. */
function baseNameOf(name: string): string {
  return (name.split(/[\\/]/).pop() ?? '').toLowerCase()
}

/** The basename without its extension: `Site Model.OBJ` → `site model`. */
function stemOf(name: string): string {
  const base = baseNameOf(name)
  const dot = base.lastIndexOf('.')
  return dot < 0 ? base : base.slice(0, dot)
}

/**
 * Pick the file everything else refers to.
 *
 * Users select a folder's worth of things and the entry point is rarely first
 * alphabetically. Guessing wrong here means parsing a .bin as a model.
 *
 * `entryName` settles it when the caller knows — a fetched source whose main
 * file came with sidecars, or a selection holding both the .gltf and the .glb
 * export of one model. It is matched by basename, case-insensitively, like
 * every other reference in this module. A name that is not an entry file in the
 * selection falls back to the first one rather than failing: the caller's hint
 * was wrong, not the files.
 */
export function findEntryFile(
  files: File[], entryName?: string | null,
): { file: File; format: MeshFormat } | null {
  if (entryName) {
    const wanted = baseNameOf(entryName)
    for (const f of files) {
      const format = EXT_FORMATS[extensionOf(f.name)]
      if (format && baseNameOf(f.name) === wanted) return { file: f, format }
    }
  }
  for (const f of files) {
    const format = EXT_FORMATS[extensionOf(f.name)]
    if (format) return { file: f, format }
  }
  return null
}

/**
 * Map the names a model asks for onto the files the user actually picked.
 *
 * References inside these formats are relative paths written on someone else's
 * machine — `textures/wall.jpg`, `./model.bin`, sometimes with a drive letter
 * still attached. Matching on the BASENAME is what makes a flat selection work,
 * and it is what every viewer that accepts drag-and-drop does.
 */
export function buildUrlMap(files: File[]): Map<string, File> {
  const map = new Map<string, File>()
  for (const f of files) {
    const base = baseNameOf(f.name)
    // First one wins: two files with the same basename in different folders is
    // ambiguous, and silently preferring the last is worse than preferring the
    // first, which at least matches selection order.
    if (!map.has(base)) map.set(base, f)
  }
  return map
}

/**
 * The material libraries an OBJ names in its own header, most specific first.
 *
 * The statement is `mtllib a.mtl b.mtl`, space-separated by the letter of the
 * format — but "Site Model.mtl" is far commoner in the wild than a list, so the
 * whole remainder of the line is tried before its pieces.
 */
export function mtllibNames(objText: string): string[] {
  const head = objText.length > MTLLIB_SCAN_CHARS ? objText.slice(0, MTLLIB_SCAN_CHARS) : objText
  const names: string[] = []
  const re = /^[ \t]*mtllib[ \t]+([^\r\n]+)/gm
  for (let m = re.exec(head); m; m = re.exec(head)) {
    const rest = m[1].trim()
    if (!rest) continue
    names.push(rest)
    const parts = rest.split(/\s+/)
    if (parts.length > 1) names.push(...parts)
  }
  return names
}

/**
 * Which .mtl belongs to this OBJ.
 *
 * "The first .mtl in the selection" was right until someone selected two
 * models' worth of files at once — then half of them wore the other model's
 * materials, every `usemtl` missed, and the geometry came in grey with nothing
 * to say why. In order of evidence:
 *   1. the library the OBJ itself names in `mtllib`;
 *   2. the .mtl sharing the OBJ's name, which is what every exporter writes;
 *   3. the first .mtl, which is still better than none.
 */
export function pickMtlFile(obj: File, files: File[], objText = ''): File | null {
  const mtls = files.filter((f) => extensionOf(f.name) === '.mtl')
  if (mtls.length === 0) return null

  const byBase = new Map<string, File>()
  for (const f of mtls) {
    const base = baseNameOf(f.name)
    if (!byBase.has(base)) byBase.set(base, f)
  }
  for (const name of mtllibNames(objText)) {
    const named = byBase.get(baseNameOf(name))
    if (named) return named
  }

  const stem = stemOf(obj.name)
  return mtls.find((f) => stemOf(f.name) === stem) ?? mtls[0]
}

/** Count what arrived, for the budget and for the panel. */
export function collectStats(root: THREE.Object3D): MeshStats {
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  let meshes = 0
  let triangles = 0

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    meshes++
    const geo = mesh.geometry
    const index = geo.getIndex()
    const position = geo.getAttribute('position')
    if (index) triangles += index.count / 3
    else if (position) triangles += position.count / 3

    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!m) continue
      materials.add(m)
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        const tex = value as THREE.Texture | null
        if (tex && (tex as THREE.Texture).isTexture) textures.add(tex)
      }
    }
  })

  let textureBytes = 0
  for (const t of textures) {
    const img = t.image as { width?: number; height?: number } | undefined
    // 4 bytes per texel, and mipmaps add a third. Close enough to keep a
    // presentation from silently exhausting the GPU.
    if (img?.width && img?.height) textureBytes += img.width * img.height * 4 * 1.33
  }

  return {
    meshes,
    triangles: Math.round(triangles),
    materials: materials.size,
    textures: textures.size,
    textureBytes: Math.round(textureBytes),
  }
}

/** Decode a selection into a scene object. Throws with an i18n-ready key. */
export async function loadMeshFiles(
  files: File[], opts: MeshDecodeOptions = {},
): Promise<MeshLoadResult> {
  const { signal } = opts
  const entry = findEntryFile(files, opts.entryName)
  if (!entry) throw new Error('noEntryFile')
  throwIfAborted(signal)

  const urlMap = buildUrlMap(files)
  const minted: string[] = []

  const manager = new THREE.LoadingManager()

  // Whether the manager has loads in flight, and a way to hear it go quiet.
  //
  // This exists because of a race that fails INVISIBLY. `MTLLoader.preload()`
  // kicks off texture loads asynchronously, and `OBJLoader.parse()` returns
  // synchronously — so without waiting, the `finally` below revokes the blob
  // URLs while the textures are still being fetched, and the model arrives with
  // black or missing maps depending on timing. Nothing throws. It just looks
  // wrong sometimes, which is the worst kind of wrong.
  //
  // Tracked as a state rather than a one-shot promise: the manager goes
  // busy → idle → busy whenever one loader finishes before the next starts, and
  // a promise that resolved on the first idle would wave the second batch
  // through undrained.
  let busy = false
  let onIdle: (() => void) | null = null
  manager.onStart = () => { busy = true }
  manager.onLoad = () => {
    busy = false
    const wake = onIdle
    onIdle = null
    wake?.()
  }
  // A texture that 404s must not hang the import. three ends the item after
  // reporting it, so the drain still completes; the model arrives untextured.
  manager.onError = () => { /* reported by three */ }

  manager.setURLModifier((url) => {
    // Already a blob or data URL — one of ours, or embedded in the file.
    if (url.startsWith('blob:') || url.startsWith('data:')) return url
    const base = safeDecode(url.split(/[\\/]/).pop() ?? '').toLowerCase()
    const file = urlMap.get(base)
    if (!file) return url
    const objectUrl = URL.createObjectURL(file)
    minted.push(objectUrl)
    return objectUrl
  })

  // The decoded object until the moment it is handed back. Anything that throws
  // while this is set — an abort, an empty model — frees it on the way out,
  // because the caller never saw it and so nothing else ever will.
  let object: THREE.Object3D | null = null
  try {
    object = entry.format === 'obj'
      ? await loadObj(entry.file, files, manager, signal)
      : await loadGltf(entry.file, manager, signal)
    throwIfAborted(signal)

    // Yield once so anything MTLLoader queued has registered with the manager
    // before asking whether there is anything to wait for.
    await Promise.resolve()

    // Drain BEFORE counting, not after. An OBJ's textures have no image until
    // they have loaded, so stats taken first reported 0 texture bytes for a
    // model carrying 60 MB of them — the one number the budget panel exists to
    // show. Bounded, because a hung request must cost a texture, not the whole
    // import; and cut short by an abort, because it is a wait with no work in
    // it and a cancelled import must not sit in it for thirty seconds.
    if (busy) await drain(new Promise<void>((r) => { onIdle = () => r() }), signal)
    throwIfAborted(signal)

    const stats = collectStats(object)
    if (stats.meshes === 0) throw new Error('noGeometry')

    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) throw new Error('noGeometry')

    const result: MeshLoadResult = { object, format: entry.format, stats, box, entryFile: entry.file }
    object = null // handed over — the caller owns it now
    return result
  } finally {
    if (object) disposeObject(object)
    // On a failure this may pull URLs out from under textures still loading.
    // That is fine: the model they belong to has just been thrown away, and a
    // failed import must not wait thirty seconds to say so.
    for (const url of minted) URL.revokeObjectURL(url)
  }
}

async function loadGltf(
  file: File, manager: THREE.LoadingManager, signal: AbortSignal | undefined,
): Promise<THREE.Object3D> {
  const loader = new GLTFLoader(manager)
  // Draco is what every "optimise for web" export button produces, and KTX2 is
  // where texture compression is heading. Without these a compressed glTF does
  // not arrive degraded — it fails to parse, and the user cannot tell that from
  // a corrupt file. Both decoders are shared and fetched only when a file
  // actually uses them.
  loader.setDRACOLoader(getDracoLoader())
  loader.setKTX2Loader(getKtx2Loader(null))
  const buffer = await file.arrayBuffer()
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    // The user reads 'parseFailed' either way; the cause is the only record of
    // what three objected to — "Unsupported asset", a missing Draco extension,
    // bad JSON — and it used to be dropped on the floor right here.
    const fail = (cause: unknown): void => reject(keyedError('parseFailed', cause))
    try {
      loader.parse(
        buffer,
        // Resource path: the URL modifier resolves by basename, so the prefix is
        // irrelevant — but it must not be empty, or relative paths resolve
        // against the document and fetch the app's own HTML.
        './',
        // A glTF may legally carry no scene at all. That is an empty import,
        // not a crash in collectStats.
        (gltf) => (gltf.scene ? resolve(gltf.scene) : reject(new Error('noGeometry'))),
        fail,
      )
    } catch (e) {
      // parse() throws synchronously on malformed JSON rather than calling
      // onError. Same failure, same key.
      fail(e)
    }
  })
}

async function loadObj(
  file: File, files: File[], manager: THREE.LoadingManager, signal: AbortSignal | undefined,
): Promise<THREE.Object3D> {
  const loader = new OBJLoader(manager)

  // The OBJ first: its own `mtllib` line is the best evidence of which .mtl is
  // its own, and the text has to be read anyway.
  const text = await file.text()
  throwIfAborted(signal)

  // Materials are optional. An OBJ with no .mtl beside it is a perfectly valid
  // import, it just arrives untextured — which is worth doing rather than
  // refusing, because the geometry is often all someone wants.
  const mtl = pickMtlFile(file, files, text)
  if (mtl) {
    let mtlText: string | null = null
    try { mtlText = await mtl.text() } catch { /* unreadable: untextured beats nothing */ }
    // Outside the try: a cancellation must not be swallowed as a broken .mtl.
    throwIfAborted(signal)
    if (mtlText !== null) {
      try {
        const mtlLoader = new MTLLoader(manager)
        mtlLoader.setResourcePath('./')
        const materials = mtlLoader.parse(mtlText, './')
        materials.preload()
        loader.setMaterials(materials)
      } catch {
        // A broken .mtl must not lose the geometry. Untextured beats nothing.
      }
    }
  }

  return loader.parse(text)
}

/**
 * Resolve when the manager goes idle, when the signal aborts, or when the
 * timeout runs out — whichever is first. Never rejects: every way out leads to
 * the same revoke, and the caller checks the signal itself. The timer and the
 * listener are released on every path, so a cancelled import leaves nothing
 * ticking behind it.
 */
function drain(idle: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) { resolve(); return }
    const done = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, TEXTURE_DRAIN_TIMEOUT_MS)
    signal?.addEventListener('abort', done, { once: true })
    void idle.then(done)
  })
}

/** An abort, in this module's own vocabulary: an Error named by its i18n key. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error('cancelled')
}

/**
 * `new Error(key, { cause })`, spelled for the ES2020 lib this project compiles
 * against (ErrorOptions arrived in ES2022). Same observable shape at runtime.
 */
function keyedError(key: string, cause: unknown): Error {
  const err = new Error(key)
  ;(err as Error & { cause?: unknown }).cause = cause
  return err
}

/**
 * decodeURIComponent throws on a stray `%` — and "100% white.png" is a real
 * texture name. A reference that cannot be decoded is matched as written.
 */
function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

/**
 * Release every GPU resource an imported object owns.
 *
 * Textures are the reason this is not a one-liner. A mesh import can carry tens
 * of megabytes of them, they are not reachable from the geometry, and three
 * disposes none of it on removal from the scene — the WebGL objects simply stay
 * allocated until the context is lost.
 */
export function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const m = mesh.material
    if (!m) return
    for (const one of Array.isArray(m) ? m : [m]) if (one) materials.add(one)
  })

  for (const m of materials) {
    for (const value of Object.values(m as unknown as Record<string, unknown>)) {
      const tex = value as THREE.Texture | null
      if (tex && (tex as THREE.Texture).isTexture) tex.dispose()
    }
    m.dispose()
  }
  root.removeFromParent()
}
