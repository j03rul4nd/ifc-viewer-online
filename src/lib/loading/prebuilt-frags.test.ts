import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { warmPrebuiltForUrl, findPrebuiltFragments, __resetPrebuiltManifest } from './prebuilt-frags'

const FP = 'f1:abc'
const manifest = { version: 1, entries: { [FP]: { frag: 'aa.frag', fragBytes: 3, ifc: 'models/tower.ifc', tree: 'bb.tree.json' } } }

function stubFetch(): string[] {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url)
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest))
    return new Response(new Uint8Array([1, 2, 3]))
  }))
  return calls
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('warmPrebuiltForUrl', () => {
  beforeEach(() => __resetPrebuiltManifest())
  afterEach(() => vi.unstubAllGlobals())

  it('starts the fragments and tree of a shipped IFC, and the lookup reuses them', async () => {
    const calls = stubFetch()
    warmPrebuiltForUrl(`${location.origin}/models/tower.ifc`)
    await flush(); await flush()
    expect(calls.filter((c) => c.includes('aa.frag'))).toHaveLength(1)
    expect(calls.some((c) => c.includes('bb.tree.json'))).toBe(true)
    const buf = await findPrebuiltFragments(FP, new AbortController().signal)
    expect(buf?.byteLength).toBe(3)
    expect(calls.filter((c) => c.includes('aa.frag'))).toHaveLength(1)
  })

  it('ignores URLs we do not ship and other origins', async () => {
    const calls = stubFetch()
    warmPrebuiltForUrl(`${location.origin}/models/other.ifc`)
    warmPrebuiltForUrl('https://example.com/models/tower.ifc')
    await flush(); await flush()
    expect(calls.some((c) => c.includes('.frag'))).toBe(false)
  })
})
