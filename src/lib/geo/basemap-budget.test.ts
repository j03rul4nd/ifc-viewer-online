import { describe, it, expect } from 'vitest'
import { basemapBudget } from './basemap-engine'

describe('basemapBudget', () => {
  it('keeps 3d-tiles-renderer\'s own byte limits on a desktop', () => {
    const d = basemapBudget(false)
    expect(d.minBytes).toBe(300 * 1024 * 1024)
    expect(d.maxBytes).toBe(400 * 1024 * 1024)
  })

  it('keeps a phone\'s map to a fraction of that, evicting before it can grow', () => {
    const m = basemapBudget(true)
    const d = basemapBudget(false)
    expect(m.maxBytes).toBeLessThanOrEqual(128 * 1024 * 1024)
    expect(m.minBytes).toBeLessThan(m.maxBytes)
    expect(m.unloadBytes).toBeLessThanOrEqual(m.maxBytes)
    expect(m.minTiles).toBeLessThan(m.maxTiles)
    expect(m.maxTiles).toBeLessThan(d.maxTiles)
  })
})
