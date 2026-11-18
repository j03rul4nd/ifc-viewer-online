import { describe, it, expect } from 'vitest'
import { SCENE_PRESETS, matchPreset, presetById } from './scene-presets'

describe('scene-presets', () => {
  it('round-trips: every preset is recognised from its own settings', () => {
    for (const p of SCENE_PRESETS) {
      expect(matchPreset({
        terrainEnabled: p.terrain,
        buildingsEnabled: p.buildings,
        contextDetail: p.detail,
        vehicles: p.vehicles,
      })).toBe(p.id)
    }
  })

  it('reads a hand-tuned combination as custom', () => {
    expect(matchPreset({
      terrainEnabled: true, buildingsEnabled: true, contextDetail: 'detailed', vehicles: false,
    })).toBeNull()
  })

  it('ignores detail and scenery while the surroundings are off', () => {
    // A leftover Showcase preference with no buildings is still the flat map.
    expect(matchPreset({
      terrainEnabled: false, buildingsEnabled: false, contextDetail: 'showcase', vehicles: true,
    })).toBe('plan')
  })

  it('orders presets from light to heavy', () => {
    const costs = SCENE_PRESETS.map((p) => p.cost)
    expect([...costs].sort()).toEqual(costs)
  })

  it('falls back to the lightest preset for an unknown id', () => {
    expect(presetById('nope' as never).id).toBe('plan')
  })
})
