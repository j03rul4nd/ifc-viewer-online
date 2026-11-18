import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveToLibrary, listLibrary, deleteFromLibrary, setLibraryBackend, memoryBackend, overCap, LIBRARY_CAP,
  type LibraryBackend,
} from './federation-library'
import { buildManifest } from './federation-manifest'

const manifest = (id: string, n = 2) => buildManifest({
  id, name: `Fed ${id}`,
  models: Array.from({ length: n }, (_, i) => ({ key: `k${i}`, fileName: `m${i}.ifc`, size: 10, visible: true, parked: false, opacity: 1 })),
  colorByDiscipline: false,
})

describe('federation library', () => {
  beforeEach(() => setLibraryBackend(memoryBackend()))

  it('saves, lists newest first with name/date/count, deletes', async () => {
    await saveToLibrary(manifest('a', 2), 1000)
    await saveToLibrary(manifest('b', 3), 2000)
    const list = await listLibrary()
    expect(list.map((e) => [e.id, e.name, e.savedAt, e.modelCount])).toEqual([['b', 'Fed b', 2000, 3], ['a', 'Fed a', 1000, 2]])
    await deleteFromLibrary('b')
    expect((await listLibrary()).map((e) => e.id)).toEqual(['a'])
  })

  it('same manifest id replaces the old copy', async () => {
    await saveToLibrary(manifest('a', 2), 1000)
    await saveToLibrary(manifest('a', 4), 3000)
    const list = await listLibrary()
    expect(list).toHaveLength(1)
    expect(list[0].modelCount).toBe(4)
  })

  it('caps the library, dropping the oldest', async () => {
    for (let i = 0; i < LIBRARY_CAP + 3; i++) await saveToLibrary(manifest(`m${i}`), i)
    const list = await listLibrary()
    expect(list).toHaveLength(LIBRARY_CAP)
    expect(list.some((e) => e.id === 'm0')).toBe(false)
    expect(overCap(list, 49)).toEqual([list[49].id])
  })

  it('stores manifests only (no bytes)', async () => {
    await saveToLibrary(manifest('a'), 1)
    const [e] = await listLibrary()
    expect(Object.keys(e).sort()).toEqual(['id', 'manifest', 'modelCount', 'name', 'savedAt'])
    expect(JSON.stringify(e)).not.toMatch(/ArrayBuffer|data:/)
  })

  it('falls back to memory when storage is blocked', async () => {
    const blocked: LibraryBackend = {
      getAll: () => Promise.reject(new Error('SecurityError')),
      put: () => Promise.reject(new Error('SecurityError')),
      delete: () => Promise.reject(new Error('SecurityError')),
    }
    setLibraryBackend(blocked)
    expect(await saveToLibrary(manifest('a'), 1)).toBe(true)
    expect((await listLibrary()).map((e) => e.id)).toEqual(['a'])
  })
})
