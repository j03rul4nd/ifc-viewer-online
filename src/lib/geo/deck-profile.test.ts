// ─── deck-profile tests ───────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   the ground case must not move, and the elevated case must stop being the
//   ground case.
//
// Both halves have teeth. The kerb values were chosen against a real symptom —
// a 16 cm drop on footpaths "carved a trench through every park" — so a change
// that improves bridges by disturbing pavements is not an improvement. And the
// elevated case is the bug: a walkway twelve metres up was being drawn five
// centimetres thick.

import { describe, it, expect } from 'vitest'
import { deckProfile, isCarriedClear, DECK_DEPTH_M, PARAPET_H_M } from './deck-profile'
import { ROAD_CLASS_KERB_M } from './osm-features'
import type { StructureType } from './vertical'

const GROUNDED: StructureType[] = ['ground', 'covered', 'trench', 'tunnel']
const AIRBORNE: StructureType[] = ['bridge', 'floating']

describe('isCarriedClear', () => {
  it('counts only the structures with air underneath', () => {
    for (const s of AIRBORNE) expect(isCarriedClear(s), s).toBe(true)
    // A covered street is at grade with a roof; a trench is a cutting with its
    // own walls. Both sit ON something, so both keep a kerb.
    for (const s of GROUNDED) expect(isCarriedClear(s), s).toBe(false)
  })
})

describe('deckProfile', () => {
  it('leaves a way on the ground exactly as it was', () => {
    // THE REGRESSION GUARD. These numbers were tuned against a visible symptom;
    // this module must not have an opinion about them.
    for (const s of GROUNDED) {
      for (const cls of ['vehicular', 'pedestrian', 'track'] as const) {
        const p = deckProfile(s, cls, ROAD_CLASS_KERB_M[cls])
        expect(p.edgeDropM, `${s}/${cls}`).toBe(ROAD_CLASS_KERB_M[cls])
        expect(p.soffit).toBe(false)
        expect(p.parapetM).toBe(0)
      }
    }
  })

  it('gives an elevated way a structural depth, not a lip', () => {
    // The bug, in one assertion: a pedestrian deck was 5 cm thick in mid-air.
    const p = deckProfile('bridge', 'pedestrian', ROAD_CLASS_KERB_M.pedestrian)
    expect(p.edgeDropM).toBe(DECK_DEPTH_M.pedestrian)
    expect(p.edgeDropM).toBeGreaterThan(ROAD_CLASS_KERB_M.pedestrian * 10)
  })

  it('builds a road viaduct deeper than a footbridge', () => {
    // They are different objects and the difference is visible from the street.
    // One depth for both makes every elevated thing read as the same thing.
    const road = deckProfile('bridge', 'vehicular', ROAD_CLASS_KERB_M.vehicular)
    const foot = deckProfile('bridge', 'pedestrian', ROAD_CLASS_KERB_M.pedestrian)
    expect(road.edgeDropM).toBeGreaterThan(foot.edgeDropM)
  })

  it('closes the underside of anything held clear of the ground', () => {
    // Looking up at a walkway from the street is most of how it is seen, and
    // an unlit front-side-only material is transparent from below.
    for (const s of AIRBORNE) {
      expect(deckProfile(s, 'pedestrian', 0.05).soffit, s).toBe(true)
    }
  })

  it('puts a parapet only where people walk', () => {
    // A raised walkway without one reads as a mistake rather than a walkway.
    expect(deckProfile('bridge', 'pedestrian', 0.05).parapetM).toBe(PARAPET_H_M)
    // And never along a pavement, which would fence every street in the city.
    expect(deckProfile('ground', 'pedestrian', 0.05).parapetM).toBe(0)
    // A carriageway's barrier is low and solid and reads as the deck edge.
    expect(deckProfile('bridge', 'vehicular', 0.16).parapetM).toBe(0)
  })

  it('keeps the parapet below the height that would close the section', () => {
    // A real handrail is ~1.1 m. On a 3 m walkway, drawn full height, it turns
    // the deck into a tube from every oblique view.
    expect(PARAPET_H_M).toBeLessThan(1.1)
    expect(PARAPET_H_M).toBeGreaterThan(0.6)
  })

  it('covers every road class', () => {
    for (const cls of ['vehicular', 'pedestrian', 'track'] as const) {
      expect(DECK_DEPTH_M[cls], cls).toBeGreaterThan(0)
    }
  })
})
