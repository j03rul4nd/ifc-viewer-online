import { describe, it, expect } from 'vitest'
import { armMapCrashGuard, disarmMapCrashGuard, consumeMapCrashFlag, safeMapOverrides, CRASH_FLAG_KEY } from './map-crash-guard'
import { isLowMemoryDevice, tileLruMax, propCapScale } from './scene-budget'

function mem() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m }
}

describe('map crash guard', () => {
  it('no flag → normal start', () => { expect(consumeMapCrashFlag(mem())).toBe(false) })
  it('armed and never disarmed → safe mode once', () => {
    const s = mem(); armMapCrashGuard(s)
    expect(s.m.has(CRASH_FLAG_KEY)).toBe(true)
    expect(consumeMapCrashFlag(s)).toBe(true)
    expect(consumeMapCrashFlag(s)).toBe(false)
  })
  it('disarmed (stable / pagehide) → normal start', () => {
    const s = mem(); armMapCrashGuard(s); disarmMapCrashGuard(s)
    expect(consumeMapCrashFlag(s)).toBe(false)
  })
  it('null/throwing storage is harmless', () => {
    const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(() => armMapCrashGuard(bad)).not.toThrow()
    expect(consumeMapCrashFlag(bad)).toBe(false)
    expect(consumeMapCrashFlag(null)).toBe(false)
  })
  it('safe overrides turn every heavy layer off', () => {
    const o = safeMapOverrides({ building: true, road: true, signal: false })
    expect(o).toEqual({ terrainEnabled: false, buildingsEnabled: false, vehicles: false, contextDetail: 'simple', featureLayers: { building: false, road: false, signal: false } })
  })
})

describe('low-memory tiering', () => {
  it('a constrained phone is low-memory, a desktop never is', () => {
    expect(isLowMemoryDevice({ mobile: true, constrained: true })).toBe(true)
    expect(isLowMemoryDevice({ mobile: false, constrained: true })).toBe(false)
    expect(isLowMemoryDevice({ mobile: false, constrained: false })).toBe(false)
  })
  it('caps', () => {
    expect(tileLruMax(true)).toBe(80)
    expect(tileLruMax(false)).toBe(300)
    expect(propCapScale(true)).toBe(0.25)
    expect(propCapScale(false)).toBe(1)
  })
})
