// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createResourcePolicy, probeEnvironment, readHeap, type EnvironmentProbe } from './resource-policy'

const MB = 1024 * 1024
const GB = 1024 * MB

function env(over: Partial<EnvironmentProbe> = {}): EnvironmentProbe {
  return { cores: 8, deviceMemoryGB: 8, crossOriginIsolated: false, mobile: false, heapLimitBytes: null, ...over }
}

describe('probeEnvironment', () => {
  it('reads cores, memory, isolation and heap limit', () => {
    const g = {
      navigator: { hardwareConcurrency: 12, deviceMemory: 4 },
      crossOriginIsolated: true,
      performance: { memory: { usedJSHeapSize: 1, jsHeapSizeLimit: 4 * GB } },
    }
    expect(probeEnvironment(g)).toEqual({
      cores: 12, deviceMemoryGB: 4, crossOriginIsolated: true, mobile: false, heapLimitBytes: 4 * GB,
    })
  })

  it('returns nulls for a bare global (node, workers, Safari)', () => {
    expect(probeEnvironment({})).toEqual({
      cores: null, deviceMemoryGB: null, crossOriginIsolated: false, mobile: false, heapLimitBytes: null,
    })
    expect(probeEnvironment(null).cores).toBeNull()
  })

  it('detects mobile from userAgentData or a coarse pointer on a small screen', () => {
    expect(probeEnvironment({ navigator: { userAgentData: { mobile: true } } }).mobile).toBe(true)
    const coarse = (w: number, h: number) => ({
      matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' }),
      screen: { width: w, height: h },
    })
    expect(probeEnvironment(coarse(390, 844)).mobile).toBe(true)
    expect(probeEnvironment(coarse(1920, 1080)).mobile).toBe(false)
    expect(probeEnvironment({ matchMedia: () => ({ matches: false }), screen: { width: 390, height: 844 } }).mobile).toBe(false)
  })

  it('never throws on hostile getters', () => {
    const g = {
      get navigator(): never { throw new Error('nope') },
      matchMedia: () => { throw new Error('nope') },
    }
    expect(() => probeEnvironment(g)).not.toThrow()
    expect(probeEnvironment(g).cores).toBeNull()
  })
})

describe('readHeap', () => {
  it('reads performance.memory when present', () => {
    expect(readHeap({ performance: { memory: { usedJSHeapSize: 10, jsHeapSizeLimit: 100 } } })).toEqual({ used: 10, limit: 100 })
    expect(readHeap({ performance: {} })).toBeNull()
    expect(readHeap({})).toBeNull()
  })
})

describe('createResourcePolicy', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  // Measured, not derived: concurrent web-ifc conversions are each slower than
  // running them in turn (see the table in resource-policy.ts), so the default
  // is one conversion at a time whatever the core count.
  it('converts one file at a time by default, on any device', () => {
    for (const cores of [1, 2, 4, 8, 11, 32, null]) {
      expect(createResourcePolicy(env({ cores })).maxConcurrentConverts()).toBe(1)
      expect(createResourcePolicy(env({ cores, mobile: true })).maxConcurrentConverts()).toBe(1)
    }
  })

  it('derives the memory budget from deviceMemory, capped at 3.2 GB', () => {
    expect(createResourcePolicy(env({ deviceMemoryGB: 8 })).memoryBudgetBytes()).toBe(3.2 * GB)
    expect(createResourcePolicy(env({ deviceMemoryGB: 4 })).memoryBudgetBytes()).toBe(1.6 * GB)
    expect(createResourcePolicy(env({ deviceMemoryGB: null })).memoryBudgetBytes()).toBe(2 * GB)
    expect(createResourcePolicy(env({ deviceMemoryGB: null, mobile: true })).memoryBudgetBytes()).toBe(1 * GB)
    // The main heap limit never caps the convert budget (conversions run in workers).
    expect(createResourcePolicy(env({ heapLimitBytes: 512 * MB })).memoryBudgetBytes()).toBe(3.2 * GB)
  })

  it('estimates peak as size × 5 + 100 MB and flags large files exclusive', () => {
    const p = createResourcePolicy(env())
    expect(p.estimate(10 * MB)).toEqual({ peakBytes: 150 * MB, exclusive: false })
    expect(p.estimate(150 * MB).exclusive).toBe(true)
    expect(p.estimate(0)).toEqual({ peakBytes: 100 * MB, exclusive: false })
    // Peak above 60 % of a small budget makes even a mid file exclusive.
    const small = createResourcePolicy(env({ deviceMemoryGB: 2 }))   // 0.8 GB budget
    expect(small.estimate(100 * MB).exclusive).toBe(true)            // 600 MB > 480 MB
  })

  it('follows heap pressure and drops to one conversion', () => {
    const p = createResourcePolicy(env({ cores: 11 }), { maxConcurrentConverts: 3 })
    expect(p.sample({ used: 85, limit: 100 })).toBe('elevated')
    expect(p.maxConcurrentConverts()).toBe(1)
    expect(p.sample({ used: 95, limit: 100 })).toBe('critical')
    expect(p.maxConcurrentConverts()).toBe(1)
    expect(p.sample({ used: 50, limit: 100 })).toBe('normal')
    expect(p.maxConcurrentConverts()).toBe(3)
    expect(p.sample(null)).toBe('normal')
    expect(p.sample({ used: 1, limit: 0 })).toBe('normal')
  })

  it('an OOM keeps the session elevated', () => {
    const p = createResourcePolicy(env({ cores: 11 }))
    p.reportOom()
    expect(p.pressure()).toBe('elevated')
    expect(p.sample({ used: 10, limit: 100 })).toBe('elevated')
    expect(p.sample({ used: 95, limit: 100 })).toBe('critical')
    expect(p.sample({ used: 10, limit: 100 })).toBe('elevated')
    expect(p.snapshot().maxConcurrentConverts).toBe(1)
  })

  it('snapshot mirrors the inputs and the derived numbers', () => {
    const s = createResourcePolicy(env({ cores: 11, crossOriginIsolated: true })).snapshot()
    expect(s).toEqual({
      cores: 11, deviceMemoryGB: 8, crossOriginIsolated: true, mobile: false,
      maxConcurrentConverts: 1, maxConcurrentDownloads: 2, memoryBudgetBytes: 3.2 * GB,
      largeFileBytes: 150 * MB, pressure: 'normal',
    })
  })

  it('overrides win', () => {
    const p = createResourcePolicy(env(), { maxConcurrentConverts: 5, memoryBudgetBytes: 500 * MB, largeFileBytes: 10 * MB })
    expect(p.maxConcurrentConverts()).toBe(5)
    expect(p.memoryBudgetBytes()).toBe(500 * MB)
    expect(p.estimate(10 * MB).exclusive).toBe(true)
  })

  it('the DEV localStorage override wins over the computed max', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'ifc:load-max-converts' ? '3' : null) })
    expect(createResourcePolicy(env({ cores: 4 })).maxConcurrentConverts()).toBe(3)
    vi.stubGlobal('localStorage', { getItem: () => 'garbage' })
    expect(createResourcePolicy(env({ cores: 4 })).maxConcurrentConverts()).toBe(1)
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') } })
    expect(createResourcePolicy(env({ cores: 8 })).maxConcurrentConverts()).toBe(1)
  })
})
