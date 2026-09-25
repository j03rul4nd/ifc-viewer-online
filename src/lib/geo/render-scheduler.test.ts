// ─── render-scheduler tests ───────────────────────────────────────────────────
// The cascade must hand the main thread back with the best primitive there is,
// fall back cleanly where it is not, classify weak devices without punishing
// browsers that simply do not say, and never let a pre-compile hang a build.

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  yieldToMain, deviceBudget, __resetDeviceBudget, precompile, mapLimited, slice, runSliced,
} from './render-scheduler'
import { runToEnd, type Steps } from './steps'
import * as THREE from 'three'

const g = globalThis as unknown as { scheduler?: unknown; navigator: Record<string, unknown> }

afterEach(() => {
  delete g.scheduler
  __resetDeviceBudget()
  vi.restoreAllMocks()
})

describe('yieldToMain', () => {
  it('prefers scheduler.yield, then scheduler.postTask', async () => {
    const y = vi.fn(() => Promise.resolve())
    g.scheduler = { yield: y, postTask: vi.fn() }
    await yieldToMain()
    expect(y).toHaveBeenCalledTimes(1)

    const post = vi.fn((cb: () => void) => { cb(); return Promise.resolve() })
    g.scheduler = { postTask: post }
    await yieldToMain('background')
    expect(post).toHaveBeenCalledWith(expect.any(Function), { priority: 'background' })
  })

  it('resolves with no scheduler at all', async () => {
    await expect(yieldToMain()).resolves.toBeUndefined()
  })
})

describe('deviceBudget', () => {
  const setNav = (extra: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(extra)) {
      Object.defineProperty(globalThis.navigator, k, { value: v, configurable: true })
    }
  }

  it('assumes a capable device when the browser says nothing', () => {
    setNav({ deviceMemory: undefined, hardwareConcurrency: undefined, connection: undefined })
    expect(deviceBudget().tier).toBe('high')
  })

  it('marks a small-memory, dual-core device on a data saver as low', () => {
    setNav({ deviceMemory: 2, hardwareConcurrency: 2, connection: { saveData: true } })
    const b = deviceBudget()
    expect(b.tier).toBe('low')
    expect(b.heavyScenery).toBe(false)
    expect(b.fetchConcurrency).toBeLessThan(4)
    expect(b.reasons.length).toBeGreaterThan(0)
  })

  it('treats a software rasteriser as low whatever else the device claims', () => {
    setNav({ deviceMemory: 16, hardwareConcurrency: 16, connection: undefined })
    const gl = {
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
      getParameter: () => 'Google SwiftShader',
      RENDERER: 2,
    } as unknown as WebGLRenderingContext
    expect(deviceBudget(gl).tier).toBe('low')
  })
})

describe('precompile', () => {
  it('uses compileAsync when the renderer has it', async () => {
    const compileAsync = vi.fn(() => Promise.resolve())
    const obj = new THREE.Object3D()
    const cam = new THREE.PerspectiveCamera()
    await precompile({ compileAsync } as unknown as THREE.WebGLRenderer, obj, cam, null)
    expect(compileAsync).toHaveBeenCalledWith(obj, cam, null)
  })

  it('never waits past its timeout, and never throws', async () => {
    const hung = { compileAsync: () => new Promise(() => {}) } as unknown as THREE.WebGLRenderer
    const t0 = performance.now()
    await precompile(hung, new THREE.Object3D(), new THREE.PerspectiveCamera(), null, 30)
    expect(performance.now() - t0).toBeLessThan(1000)
    const broken = { compileAsync: () => Promise.reject(new Error('no')) } as unknown as THREE.WebGLRenderer
    await expect(precompile(broken, new THREE.Object3D(), new THREE.PerspectiveCamera(), null)).resolves.toBeUndefined()
  })

  it('is a no-op without the method or a camera', async () => {
    await expect(precompile({} as THREE.WebGLRenderer, new THREE.Object3D(), null, null)).resolves.toBeUndefined()
  })
})

describe('mapLimited', () => {
  it('keeps order and never exceeds its limit', async () => {
    let inFlight = 0
    let peak = 0
    const out = await mapLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(peak).toBe(3)
  })
})

describe('slice', () => {
  it('comes due once its budget is spent', () => {
    const s = slice(0)
    const until = performance.now() + 2
    while (performance.now() < until) { /* spin */ }
    expect(s.due()).toBe(true)
    s.reset()
    expect(slice(1e6).due()).toBe(false)
  })
})

describe('runSliced', () => {
  /** Ten steps that spin for `ms` each, then return what they counted. */
  function* spinning(ms: number, log: string[]): Steps<number> {
    let n = 0
    try {
      for (let i = 0; i < 10; i++) {
        const until = performance.now() + ms
        while (performance.now() < until) { /* spin */ }
        n++
        yield
      }
      return n
    } finally {
      log.push('closed')
    }
  }

  it('returns what the steps return, and what runToEnd returns', async () => {
    const yieldTo = vi.fn(() => Promise.resolve())
    await expect(runSliced(spinning(0, []), { budgetMs: 1e6, yieldTo })).resolves.toBe(10)
    expect(runToEnd(spinning(0, []))).toBe(10)
    // Never due, so it never had to give way.
    expect(yieldTo).not.toHaveBeenCalled()
  })

  it('gives way whenever a slice is spent', async () => {
    const yieldTo = vi.fn(() => Promise.resolve())
    await expect(runSliced(spinning(1, []), { budgetMs: 0, yieldTo })).resolves.toBe(10)
    expect(yieldTo).toHaveBeenCalledTimes(10)
  })

  it('stops, and closes the steps, when the build is no longer wanted', async () => {
    const log: string[] = []
    let calls = 0
    const out = await runSliced(spinning(1, log), {
      budgetMs: 0, yieldTo: () => Promise.resolve(), alive: () => ++calls < 3,
    })
    expect(out).toBeUndefined()
    expect(calls).toBe(3)
    // `finally` ran: nothing the generator held is left half-open.
    expect(log).toEqual(['closed'])
  })
})
