// ─── Document store ───────────────────────────────────────────────────────────
// Project documents that arrive with the models — the specification PDF, the
// quantities spreadsheet, site photos, a DWG — when someone drops a whole
// project folder or zip. Nothing draws them in 3D; keeping them next to the
// scene is what makes "drop the folder" mean "the project is here".
//
// Files stay in this tab's memory (never uploaded, never persisted); cleared
// with the scene.

import { create } from 'zustand'

export interface ProjectDocument {
  id: string
  name: string
  /** Path inside the dropped folder or archive, when known. */
  path: string
  size: number
  type: string
  addedAt: number
  file: File
}

interface DocumentStore {
  docs: ProjectDocument[]
  /** Adds files, skipping ones already kept (same path and size). Returns how many were new. */
  add: (files: File[]) => number
  remove: (id: string) => void
  clear: () => void
}

const pathOf = (f: File): string =>
  (f as File & { sourcePath?: string }).sourcePath || f.webkitRelativePath || f.name

export const useDocumentStore = create<DocumentStore>()((set, get) => ({
  docs: [],
  add: (files) => {
    const have = new Set(get().docs.map((d) => `${d.path}|${d.size}`))
    const fresh: ProjectDocument[] = []
    for (const f of files) {
      const path = pathOf(f)
      const key = `${path}|${f.size}`
      if (have.has(key)) continue
      have.add(key)
      fresh.push({
        id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        name: f.name, path, size: f.size, type: f.type, addedAt: Date.now(), file: f,
      })
    }
    if (fresh.length > 0) set((s) => ({ docs: [...s.docs, ...fresh] }))
    return fresh.length
  },
  remove: (id) => set((s) => ({ docs: s.docs.filter((d) => d.id !== id) })),
  clear: () => set({ docs: [] }),
}))

/** Coarse kind for the icon and the "can the browser show it?" decision. */
export function documentKind(name: string): 'pdf' | 'image' | 'sheet' | 'text' | 'cad' | 'other' {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'sheet'
  if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'html', 'htm'].includes(ext)) return 'text'
  if (['dwg', 'dxf', 'rvt', 'rfa', 'nwd', 'nwc', 'skp', '3dm', 'pln'].includes(ext)) return 'cad'
  return 'other'
}

/** Kinds a browser tab can display directly; the rest are downloaded. */
export const opensInBrowser = (name: string): boolean => ['pdf', 'image', 'text'].includes(documentKind(name))
