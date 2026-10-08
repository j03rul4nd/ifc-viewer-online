// ─── vector-assets ────────────────────────────────────────────────────────────
// What point symbols are drawn WITH: icon textures (canvas-drawn from the
// built-in artwork) and 3D models the user brings (a GLB of a substation, a
// signal, an exit sign…).
//
// Models are stored in IndexedDB as their original bytes, so a layer styled
// with "substations → my_substation.glb" looks the same after a reload. They
// stay on this device, like the layers themselves.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ICON_PATHS, type IconId } from './symbology'
import { createLogger } from '../logger'

const log = createLogger('VectorAssets')

// ── Icons ──────────────────────────────────────────────────────────────────────

const iconCache = new Map<string, THREE.Texture | null>()

/**
 * A round badge in `color` with the icon in white, as a texture. Null where
 * there is no 2D canvas (headless tests) — callers fall back to a primitive.
 */
export function iconTexture(icon: IconId, color: string): THREE.Texture | null {
  const key = `${icon}|${color}`
  if (iconCache.has(key)) return iconCache.get(key) ?? null
  let tex: THREE.Texture | null = null
  try {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (ctx && typeof Path2D !== 'undefined') {
      // Badge with a dark rim: readable over satellite imagery AND a dark scene.
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.lineWidth = 6
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.stroke()
      ctx.save()
      const k = (size * 0.56) / 24
      ctx.translate(size / 2 - 12 * k, size / 2 - 12 * k)
      ctx.scale(k, k)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2.1
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke(new Path2D(ICON_PATHS[icon]))
      ctx.restore()
      tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
    }
  } catch (e) {
    log.debug('icon texture unavailable', e)
  }
  iconCache.set(key, tex)
  return tex
}

/** Same artwork as a data URL, for the panel's pickers. */
export function iconDataUrl(icon: IconId, color: string): string | null {
  const tex = iconTexture(icon, color)
  const img = tex?.image as HTMLCanvasElement | undefined
  try { return img?.toDataURL?.() ?? null } catch { return null }
}

// ── User models ────────────────────────────────────────────────────────────────

export interface VectorAsset {
  id: string
  name: string
  bytes: number
}

const templates = new Map<string, THREE.Object3D>()
const meta = new Map<string, VectorAsset>()
const listeners = new Set<() => void>()

export function onAssetsChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
const emit = (): void => listeners.forEach((cb) => cb())

export function listAssets(): VectorAsset[] { return [...meta.values()] }
export function assetTemplates(): Map<string, THREE.Object3D> { return templates }
/** Changes whenever a model is added or removed — part of the layer rebuild key. */
export function assetsVersion(): string { return [...meta.keys()].sort().join(',') }

async function parseGlb(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  const root = gltf.scene
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true } })
  return root
}

/** Import a .glb as a symbol model. Resolves to its id. */
export async function addAssetFile(file: File): Promise<VectorAsset> {
  const buffer = await file.arrayBuffer()
  const object = await parseGlb(buffer)
  const id = `glb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const a: VectorAsset = { id, name: file.name, bytes: buffer.byteLength }
  templates.set(id, object)
  meta.set(id, a)
  await idbPut({ ...a, data: buffer })
  emit()
  return a
}

export async function removeAsset(id: string): Promise<void> {
  templates.delete(id)
  meta.delete(id)
  await idbDelete(id)
  emit()
}

let restoring: Promise<void> | null = null
/** Load the models saved on this device (once). */
export function restoreAssets(): Promise<void> {
  restoring ??= (async () => {
    for (const rec of await idbAll()) {
      try {
        templates.set(rec.id, await parseGlb(rec.data))
        meta.set(rec.id, { id: rec.id, name: rec.name, bytes: rec.bytes })
      } catch (e) {
        log.warn(`saved model ${rec.name} could not be read`, e)
      }
    }
    if (meta.size) emit()
  })()
  return restoring
}

// ── IndexedDB (tiny, no dependency) ────────────────────────────────────────────

interface AssetRecord extends VectorAsset { data: ArrayBuffer }

const DB = 'ifc-vector-assets'
const STORE = 'glb'

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

const idbPut = (r: AssetRecord): Promise<unknown> => tx('readwrite', (s) => s.put(r))
const idbDelete = (id: string): Promise<unknown> => tx('readwrite', (s) => s.delete(id))
const idbAll = async (): Promise<AssetRecord[]> => (await tx<AssetRecord[]>('readonly', (s) => s.getAll())) ?? []
