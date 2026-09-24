// ─── meshStore tests ──────────────────────────────────────────────────────────
// The store half of per-import cancellation: a removal is one row's business,
// and only a clear invalidates everything in flight.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMeshStore, pendingEntry } from './meshStore'

const s = () => useMeshStore.getState()

const row = (id: string, status: 'loading' | 'ready' | 'error' = 'ready') => ({
  ...pendingEntry(id, new File(['x'], `${id}.glb`), 'glb', id),
  status,
})

beforeEach(() => {
  useMeshStore.setState({ meshes: [], activeMeshId: null, epoch: 0 })
})

describe('meshStore epoch', () => {
  it('removeMesh does not bump it — a removal cancels nothing but its own row', () => {
    s().addMesh(row('a'))
    s().addMesh(row('b', 'loading'))
    s().removeMesh('a')
    expect(s().epoch).toBe(0)
    expect(s().meshes.map((m) => m.id)).toEqual(['b'])
  })

  it('clearMeshes does, because it really does invalidate every import in flight', () => {
    s().addMesh(row('a', 'loading'))
    s().clearMeshes()
    expect(s().epoch).toBe(1)
    expect(s().meshes).toEqual([])
    expect(s().activeMeshId).toBeNull()
  })
})

describe('meshStore.removeMesh', () => {
  it('is a true no-op for an id that is not there', () => {
    // Not a fresh array: every subscriber diffing the list — the loading
    // mirror, an import watching its own row — would wake to nothing.
    s().addMesh(row('a'))
    const before = s().meshes
    const listener = vi.fn()
    const unsubscribe = useMeshStore.subscribe(listener)
    s().removeMesh('ghost')
    unsubscribe()
    expect(s().meshes).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('hands the active selection to the last remaining row', () => {
    s().addMesh(row('a'))
    s().addMesh(row('b'))
    s().setActiveMesh('b')
    s().removeMesh('b')
    expect(s().activeMeshId).toBe('a')
    s().removeMesh('a')
    expect(s().activeMeshId).toBeNull()
  })

  it('leaves the selection alone when another row goes', () => {
    s().addMesh(row('a'))
    s().addMesh(row('b'))
    s().setActiveMesh('a')
    s().removeMesh('b')
    expect(s().activeMeshId).toBe('a')
  })
})
