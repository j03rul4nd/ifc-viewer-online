import { describe, it, expect, vi } from 'vitest'

vi.mock('../model-registry', () => ({ modelRegistry: { get: () => null } }))
vi.mock('../cache-repository', () => ({ cacheRepo: { isAvailable: () => false } }))

import { askWorker, geometryProfiles, type WorkerLike } from './profiles-run'

type Fake = WorkerLike & { posted: Array<{ msg: { id: string; buffer: ArrayBuffer }; transfer: Transferable[] }>; terminated: number }

function fakeWorker(): Fake {
  const w: Fake = {
    onmessage: null, onerror: null, onmessageerror: null,
    posted: [] as Array<{ msg: { id: string; buffer: ArrayBuffer }; transfer: Transferable[] }>,
    terminated: 0,
    postMessage(msg: unknown, transfer: Transferable[]) { this.posted.push({ msg: msg as { id: string; buffer: ArrayBuffer }, transfer }) },
    terminate() { this.terminated++ },
  }
  return w
}

describe('askWorker', () => {
  it('transfers a copy, never the original buffer', async () => {
    const w = fakeWorker()
    const buf = new ArrayBuffer(8)
    const p = askWorker(buf, undefined, () => w)
    const { msg, transfer } = w.posted[0]
    expect(transfer).toEqual([msg.buffer])
    expect(msg.buffer).not.toBe(buf)
    w.onmessage!({ data: { id: msg.id, ok: true, entries: [[1, { profile: 'X', length: 1, area: null }]] } } as MessageEvent)
    expect((await p)!.get(1)!.profile).toBe('X')
    expect(w.terminated).toBe(1)
  })

  it('abort terminates the worker, resolves null and removes the listener', async () => {
    const w = fakeWorker()
    const ac = new AbortController()
    const remove = vi.spyOn(ac.signal, 'removeEventListener')
    const p = askWorker(new ArrayBuffer(8), ac.signal, () => w)
    ac.abort()
    expect(await p).toBeNull()
    expect(w.terminated).toBe(1)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(w.onmessage).toBeNull()
  })

  it('already aborted: no worker at all', async () => {
    const ac = new AbortController(); ac.abort()
    const create = vi.fn(fakeWorker)
    expect(await askWorker(new ArrayBuffer(8), ac.signal, create)).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('messageerror and error terminate and resolve null', async () => {
    for (const k of ['onmessageerror', 'onerror'] as const) {
      const w = fakeWorker()
      const p = askWorker(new ArrayBuffer(8), undefined, () => w)
      w[k]!(new Event('x'))
      expect(await p).toBeNull()
      expect(w.terminated).toBe(1)
    }
  })

  it('a model with no IFC bytes (.frag) gives null without error', async () => {
    expect(await geometryProfiles('missing')).toBeNull()
  })
})
