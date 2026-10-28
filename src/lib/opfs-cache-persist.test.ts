import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requestPersistence, __resetPersistence } from './opfs-cache'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('requestPersistence', () => {
  beforeEach(() => __resetPersistence())

  it('asks once, and only when not already persisted', async () => {
    const persist = vi.fn(async () => true)
    const nav = { storage: { persisted: async () => false, persist } }
    requestPersistence(nav)
    requestPersistence(nav)
    await flush()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('skips the prompt when storage is already persistent', async () => {
    const persist = vi.fn(async () => true)
    requestPersistence({ storage: { persisted: async () => true, persist } })
    await flush()
    expect(persist).not.toHaveBeenCalled()
  })

  it('tolerates browsers without the API or that throw', async () => {
    expect(() => requestPersistence(undefined)).not.toThrow()
    __resetPersistence()
    requestPersistence({ storage: { persist: async () => { throw new Error('denied') } } })
    await flush()
  })
})
