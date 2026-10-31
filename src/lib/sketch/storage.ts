// ─── Keeping the sketch ───────────────────────────────────────────────────────
// IndexedDB in this browser, nothing on a server. Float32Arrays and Blobs are
// stored as they are, so a save is cheap enough to run after every few strokes.
// Failures resolve to null or false: the studio must keep drawing in a private
// window, and says so instead of pretending the work was saved.

import { isSketchDoc } from './document'
import type { ReferenceImage, SketchDoc } from './types'

const DB = 'ifc-sketch-studio'
const DOCS = 'docs'
const IMAGES = 'images'
const CURRENT = 'current'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DOCS)
      req.result.createObjectStore(IMAGES, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const req = op(tx.objectStore(store))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function loadDoc(): Promise<SketchDoc | null> {
  try {
    const raw = await run<unknown>(DOCS, 'readonly', (s) => s.get(CURRENT))
    return isSketchDoc(raw) ? raw : null
  } catch {
    return null
  }
}

export async function saveDoc(doc: SketchDoc): Promise<boolean> {
  try {
    await run(DOCS, 'readwrite', (s) => s.put(doc, CURRENT))
    return true
  } catch {
    return false
  }
}

/** The models under the sketch: a page of a sketch is meaningless without them. */
export interface ContextModel { name: string; blob: Blob }

const CONTEXT = 'context'

export async function loadContextModels(): Promise<ContextModel[]> {
  try {
    return (await run<ContextModel[] | undefined>(DOCS, 'readonly', (s) => s.get(CONTEXT))) ?? []
  } catch {
    return []
  }
}

export async function saveContextModels(models: ContextModel[]): Promise<boolean> {
  try {
    await run<unknown>(DOCS, 'readwrite', (s) => (models.length ? s.put(models, CONTEXT) : s.delete(CONTEXT)) as IDBRequest<unknown>)
    return true
  } catch {
    return false
  }
}

export async function loadImages(): Promise<ReferenceImage[]> {
  try {
    return await run<ReferenceImage[]>(IMAGES, 'readonly', (s) => s.getAll() as IDBRequest<ReferenceImage[]>)
  } catch {
    return []
  }
}

export async function saveImage(image: ReferenceImage): Promise<boolean> {
  try {
    await run(IMAGES, 'readwrite', (s) => s.put(image))
    return true
  } catch {
    return false
  }
}

export async function deleteImage(id: string): Promise<void> {
  try {
    await run(IMAGES, 'readwrite', (s) => s.delete(id))
  } catch { /* it stays in the store; the document no longer points at it */ }
}

/** The longest side a reference keeps: sharp on any phone, and small enough to store many. */
const MAX_IMAGE_SIDE = 2048

export async function readImageFile(file: File, id: string): Promise<ReferenceImage | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * k)
    const height = Math.round(bitmap.height * k)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    return blob ? { id, name: file.name, width, height, blob } : null
  } catch {
    return null
  }
}
