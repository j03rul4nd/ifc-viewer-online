import { describe, it, expect, afterEach, vi } from 'vitest'
import { useVectorLayerStore, trackWait, hostLabel } from './vectorLayerStore'

/** A promise the test settles by hand. */
function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const waiting = () => useVectorLayerStore.getState().waiting

describe('slow-load waits', () => {
  afterEach(() => { vi.useRealTimers() })

  it('names the server while the load is pending, and clears when it settles', async () => {
    const d = deferred<number>()
    const done = trackWait('ovc.catastro.meh.es', d.promise)
    expect(waiting()?.label).toBe('ovc.catastro.meh.es')
    d.resolve(7)
    await expect(done).resolves.toBe(7)
    expect(waiting()).toBeNull()
  })

  it('clears on failure too, and passes the failure on', async () => {
    const d = deferred()
    const done = trackWait('slow.example', d.promise)
    d.reject(new Error('timeout'))
    await expect(done).rejects.toThrow('timeout')
    expect(waiting()).toBeNull()
  })

  it('with two at once, moves on to the slow one when the fast one answers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const fast = deferred(), slow = deferred()
    const a = trackWait('fast.example', fast.promise)
    vi.setSystemTime(1_500)
    const b = trackWait('slow.example', slow.promise)
    // The oldest pending one is shown, with its own start.
    expect(waiting()).toEqual({ label: 'fast.example', since: 1_000 })
    fast.resolve()
    await a
    // Not still naming the server that already answered.
    expect(waiting()).toEqual({ label: 'slow.example', since: 1_500 })
    slow.resolve()
    await b
    expect(waiting()).toBeNull()
  })
})

describe('hostLabel', () => {
  it('takes the host of an absolute URL, port included', () => {
    expect(hostLabel('https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?service=WFS')).toBe('ovc.catastro.meh.es')
    expect(hostLabel('http://localhost:8080/data.geojson')).toBe('localhost:8080')
  })

  it("reads a relative URL as this site's", () => {
    expect(hostLabel('/scenes/x.json')).toBe(location.host)
  })

  it('gives the generic wording for nothing usable', () => {
    expect(hostLabel('')).toBe('')
    expect(hostLabel(undefined)).toBe('')
    expect(hostLabel('http://')).toBe('')
  })
})
