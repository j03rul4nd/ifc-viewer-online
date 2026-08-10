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

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
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

const EXT_FORMATS: Record<string, MeshFormat> = {
  '.glb': 'glb', '.gltf': 'gltf', '.obj': 'obj',
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Pick the file everything else refers to.
 *
 * Users select a folder's worth of things and the entry point is rarely first
 * alphabetically. Guessing wrong here means parsing a .bin as a model.
 */
export function findEntryFile(files: File[]): { file: File; format: MeshFormat } | null {
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
    const base = f.name.split(/[\\/]/).pop()!.toLowerCase()
    // First one wins: two files with the same basename in different folders is
    // ambiguous, and silently preferring the last is worse than preferring the
    // first, which at least matches selection order.
    if (!map.has(base)) map.set(base, f)
  }
  return map
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
export async function loadMeshFiles(files: File[]): Promise<MeshLoadResult> {
  const entry = findEntryFile(files)
  if (!entry) throw new Error('noEntryFile')

  const urlMap = buildUrlMap(files)
  const minted: string[] = []

  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    // Already a blob or data URL — one of ours, or embedded in the file.
    if (url.startsWith('blob:') || url.startsWith('data:')) return url
    const base = decodeURIComponent(url.split(/[\\/]/).pop() ?? '').toLowerCase()
    const file = urlMap.get(base)
    if (!file) return url
    const objectUrl = URL.createObjectURL(file)
    minted.push(objectUrl)
    return objectUrl
  })

  try {
    const object = entry.format === 'obj'
      ? await loadObj(entry.file, files, manager)
      : await loadGltf(entry.file, manager)

    const stats = collectStats(object)
    if (stats.meshes === 0) throw new Error('noGeometry')

    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) throw new Error('noGeometry')

    return { object, format: entry.format, stats, box, entryFile: entry.file }
  } finally {
    // Released even when the parse threw. The decoded textures have already been
    // copied into GPU-bound images by this point; the URLs are only the route in.
    for (const url of minted) URL.revokeObjectURL(url)
  }
}

async function loadGltf(file: File, manager: THREE.LoadingManager): Promise<THREE.Object3D> {
  const loader = new GLTFLoader(manager)
  const buffer = await file.arrayBuffer()
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      // Resource path: the URL modifier resolves by basename, so the prefix is
      // irrelevant — but it must not be empty, or relative paths resolve against
      // the document and fetch the app's own HTML.
      './',
      (gltf) => resolve(gltf.scene),
      () => reject(new Error('parseFailed')),
    )
  })
}

async function loadObj(
  file: File, files: File[], manager: THREE.LoadingManager,
): Promise<THREE.Object3D> {
  const loader = new OBJLoader(manager)

  // Materials are optional. An OBJ with no .mtl beside it is a perfectly valid
  // import, it just arrives untextured — which is worth doing rather than
  // refusing, because the geometry is often all someone wants.
  const mtl = files.find((f) => extensionOf(f.name) === '.mtl')
  if (mtl) {
    try {
      const mtlLoader = new MTLLoader(manager)
      mtlLoader.setResourcePath('./')
      const materials = mtlLoader.parse(await mtl.text(), './')
      materials.preload()
      loader.setMaterials(materials)
    } catch {
      // A broken .mtl must not lose the geometry. Untextured beats nothing.
    }
  }

  return loader.parse(await file.text())
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
