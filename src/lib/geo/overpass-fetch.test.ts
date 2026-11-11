import { afterEach, describe, expect, it, vi } from 'vitest'
import { OVERPASS_ENDPOINTS, fetchOverpassWithMirrors, resetOverpassMirrorForTest } from './buildings'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

afterEach(() => {
  vi.unstubAllGlobals()
  resetOverpassMirrorForTest()
})

describe('fetchOverpassWithMirrors', () => {
  it('moves to the next mirror when the first cannot even connect', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok({ elements: [{ id: 1 }] }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchOverpassWithMirrors('q', 1000)).resolves.toEqual({ elements: [{ id: 1 }] })
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(OVERPASS_ENDPOINTS.slice(0, 2))
  })

  it('treats a busy remark as a failure of that mirror, not as an empty city', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ elements: [], remark: 'runtime error: Query timed out' }))
      .mockResolvedValueOnce(ok({ elements: [{ id: 2 }] }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchOverpassWithMirrors('q', 1000)).resolves.toEqual({ elements: [{ id: 2 }] })
  })

  it('starts from the mirror that last answered', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(async () => ok({ elements: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchOverpassWithMirrors('q', 1000)
    await fetchOverpassWithMirrors('q', 1000)
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      OVERPASS_ENDPOINTS[0], OVERPASS_ENDPOINTS[1], OVERPASS_ENDPOINTS[1],
    ])
  })

  it('reports the last failure once every mirror has failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 504 })))
    await expect(fetchOverpassWithMirrors('q', 1000)).rejects.toThrow('Overpass HTTP 504')
  })
})
