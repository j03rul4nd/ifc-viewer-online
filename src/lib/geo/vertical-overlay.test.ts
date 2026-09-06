// ─── vertical overlay tests ───────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   an instrument that lies is worse than no instrument. If the overlay can
//   hide a guess — by filtering it, by burying it behind geometry, or by
//   drawing it at the ground instead of at its solved height — then a clean
//   overlay stops meaning "clean scene" and starts meaning nothing at all.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildVerticalOverlay, disposeVerticalOverlay, CONFIDENCE_COLORS,
} from './vertical-overlay'
import type { SolvedProfile } from './vertical-network'
import type { VerticalConfidence } from './vertical'

const OPTS = { zAtElevationM: (m: number) => m / 100 }

function profile(
  wayId: string, confidence: VerticalConfidence, elevations: number[],
): SolvedProfile {
  return {
    wayId,
    points: elevations.map((_, i) => new THREE.Vector2(i, 0)),
    stationM: elevations.map((_, i) => i * 10),
    elevationM: elevations,
    groundM: elevations.map(() => 0),
    phase: elevations.map(() => 'deck'),
    breakpoints: [],
    structure: 'bridge',
    functional: 'road',
    confidence,
    relaxed: false,
  } as unknown as SolvedProfile
}

describe('buildVerticalOverlay', () => {
  it('draws the unevidenced ways and leaves the rest out by default', () => {
    // The question asked is "what is a guess". Drawing the 90 % that are fine
    // over the top of it is how an instrument becomes wallpaper.
    const built = buildVerticalOverlay([
      profile('guess', 'assumed', [0, 5]),
      profile('order', 'tagged', [0, 5]),
      profile('measured', 'surveyed', [0, 5]),
      profile('crossing', 'inferred', [0, 5]),
    ], OPTS)!
    expect(built.count).toBe(2)
    expect(built.assumedCount).toBe(1)
  })

  it('can show the whole network when asked', () => {
    const built = buildVerticalOverlay([
      profile('guess', 'assumed', [0, 5]),
      profile('measured', 'surveyed', [0, 5]),
    ], { ...OPTS, includeConfident: true })!
    expect(built.count).toBe(2)
  })

  it('draws each way at its SOLVED height, not on the ground', () => {
    // The whole point is to see a road floating. An overlay draped on the
    // terrain would render every scene identically clean.
    const built = buildVerticalOverlay([profile('w', 'assumed', [0, 800])], OPTS)!
    const pos = built.object.geometry.getAttribute('position')
    const zs = Array.from({ length: pos.count }, (_, i) => pos.getZ(i))
    expect(Math.max(...zs)).toBeCloseTo(8, 6)
  })

  it('gives a way ONE colour, so confidence reads as a property of the way', () => {
    const built = buildVerticalOverlay([profile('w', 'assumed', [0, 3, 6])], OPTS)!
    const c = built.object.geometry.getAttribute('color')
    const seen = new Set<string>()
    for (let i = 0; i < c.count; i++) seen.add([c.getX(i), c.getY(i), c.getZ(i)].join())
    expect(seen.size).toBe(1)

    const expected = new THREE.Color(CONFIDENCE_COLORS.assumed)
    expect(c.getX(0)).toBeCloseTo(expected.r, 5)
  })

  it('stays readable through solid geometry', () => {
    // The road worth looking at is usually the one buried inside a building.
    const built = buildVerticalOverlay([profile('w', 'assumed', [0, 5])], OPTS)!
    const material = built.object.material as THREE.LineBasicMaterial
    expect(material.depthTest).toBe(false)
    expect(built.object.renderOrder).toBeGreaterThan(0)
  })

  it('takes no part in lighting and answers no clicks', () => {
    // An instrument that casts shadows would change the picture it measures,
    // and one that swallows a raycast would break selection while it is on.
    const built = buildVerticalOverlay([profile('w', 'assumed', [0, 5])], OPTS)!
    expect(built.object.castShadow).toBe(false)
    expect(built.object.receiveShadow).toBe(false)
    const hits: unknown[] = []
    built.object.raycast(new THREE.Raycaster(), hits as never)
    expect(hits).toHaveLength(0)
  })

  it('skips a degenerate profile rather than emitting a zero-length segment', () => {
    expect(buildVerticalOverlay([profile('dot', 'assumed', [5])], OPTS)).toBeNull()
  })

  it('returns null when there is nothing to report', () => {
    expect(buildVerticalOverlay([], OPTS)).toBeNull()
    // A scene where everything is well evidenced is a clean bill of health, and
    // must not cost a draw call.
    expect(buildVerticalOverlay([profile('m', 'surveyed', [0, 5])], OPTS)).toBeNull()
  })

  it('disposes without throwing', () => {
    const built = buildVerticalOverlay([profile('w', 'assumed', [0, 5])], OPTS)!
    expect(() => disposeVerticalOverlay(built)).not.toThrow()
  })
})
