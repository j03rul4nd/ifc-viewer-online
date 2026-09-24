// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { fingerprintBlob, fingerprintBytes } from './fingerprint'

const KB = 1024

function bytes(size: number, seed = 1): Uint8Array {
  const out = new Uint8Array(size)
  let x = seed >>> 0 || 1
  for (let i = 0; i < size; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    out[i] = x & 0xff
  }
  return out
}

describe('fingerprint', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('has the f1:<size>:<hex> shape', async () => {
    const fp = await fingerprintBytes(bytes(1000))
    expect(fp).toMatch(/^f1:1000:[0-9a-f]{32}$/)
  })

  it('same bytes → same fingerprint; different content → different', async () => {
    const a = bytes(500 * KB, 7)
    expect(await fingerprintBytes(a)).toBe(await fingerprintBytes(a.slice()))
    const b = a.slice()
    b[10] ^= 1   // head
    const c = a.slice()
    c[c.length - 5] ^= 1   // tail
    const d = a.slice()
    d[Math.floor(d.length / 2)] ^= 1   // middle sample
    const fa = await fingerprintBytes(a)
    expect(await fingerprintBytes(b)).not.toBe(fa)
    expect(await fingerprintBytes(c)).not.toBe(fa)
    expect(await fingerprintBytes(d)).not.toBe(fa)
  })

  it('same samples but different length → different', async () => {
    const small = bytes(100)
    const padded = new Uint8Array(101)
    padded.set(small)
    expect(await fingerprintBytes(small)).not.toBe(await fingerprintBytes(padded))
  })

  it('fingerprintBytes === fingerprintBlob for the same data, small and large', async () => {
    for (const size of [0, 1, 64 * KB, 192 * KB, 192 * KB + 1, 1024 * KB + 333]) {
      const data = bytes(size, size + 3)
      expect(await fingerprintBytes(data)).toBe(await fingerprintBlob(new Blob([data])))
    }
  })

  it('accepts ArrayBuffer and offset views', async () => {
    const data = bytes(300 * KB, 11)
    expect(await fingerprintBytes(data.buffer)).toBe(await fingerprintBytes(data))
    const backing = new Uint8Array(1000)
    backing.set(bytes(200, 5), 400)
    const view = backing.subarray(400, 600)
    expect(await fingerprintBytes(view)).toBe(await fingerprintBytes(bytes(200, 5)))
  })

  it('falls back to FNV without SubtleCrypto, deterministically', async () => {
    vi.stubGlobal('crypto', undefined)
    const data = bytes(4000, 9)
    const fp = await fingerprintBytes(data)
    expect(fp).toMatch(/^f1:4000:[0-9a-f]{16}$/)
    expect(await fingerprintBlob(new Blob([data]))).toBe(fp)
  })
})
