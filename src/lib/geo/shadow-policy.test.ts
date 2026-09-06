// ─── shadow policy tests ──────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   the failure mode here is silence. A layer that never opts into the shadow
//   pass renders perfectly, looks plausible in isolation, and is only wrong
//   next to something that does cast. These tests assert the policy is total
//   and that its two deliberate exclusions stay deliberate.

import { describe, it, expect } from 'vitest'
import { FEATURE_KINDS } from './osm-features'
import {
  SHADOW_ROLES, shadowCameraPlan, MIN_SHADOW_HALF_EXTENT, MAX_USABLE_TEXEL,
} from './shadow-policy'

describe('SHADOW_ROLES', () => {
  it('covers every feature kind', () => {
    // A kind added to FEATURE_KINDS without a role here would silently fall
    // back to "no shadows" — the exact bug this module was written to end.
    for (const kind of FEATURE_KINDS) {
      expect(SHADOW_ROLES[kind], `no shadow role for "${kind}"`).toBeDefined()
    }
    expect(Object.keys(SHADOW_ROLES).length).toBe(FEATURE_KINDS.length)
  })

  it('makes standing volumes cast, so context meets the ground it stands on', () => {
    for (const kind of ['building', 'tree', 'pier', 'bridge', 'signal'] as const) {
      expect(SHADOW_ROLES[kind].cast, `"${kind}" must cast`).toBe(true)
    }
  })

  it('never lets a draped ground surface cast onto itself', () => {
    // Shadow acne at district scale is not fixable by bias. If one of these
    // ever flips to cast, the whole ground plane stripes.
    for (const kind of ['green', 'sand', 'rock', 'road', 'rail'] as const) {
      expect(SHADOW_ROLES[kind].cast, `"${kind}" must not cast`).toBe(false)
      expect(SHADOW_ROLES[kind].receive, `"${kind}" must receive`).toBe(true)
    }
  })

  it('keeps water out of the shadow pass while it is transparent', () => {
    expect(SHADOW_ROLES.water).toEqual({ cast: false, receive: false })
  })

  it('gives every kind that casts the ability to receive', () => {
    // A caster that does not receive is lit inconsistently against its own
    // neighbours: a building shadowed by nothing, standing beside one it
    // shadows itself.
    for (const kind of FEATURE_KINDS) {
      if (SHADOW_ROLES[kind].cast) expect(SHADOW_ROLES[kind].receive).toBe(true)
    }
  })
})

describe('shadowCameraPlan', () => {
  it('covers the scene radius with padding to spare', () => {
    const plan = shadowCameraPlan(400, 100, 2048)
    expect(plan.halfExtent).toBeGreaterThan(400)
  })

  it('does not shrink below the model-scale floor', () => {
    // A bare model with no context must not end up with a tighter shadow
    // camera than the viewer gave it.
    const plan = shadowCameraPlan(5, 100, 2048)
    expect(plan.halfExtent).toBe(MIN_SHADOW_HALF_EXTENT)
  })

  it('reaches past the far corner of its own frustum', () => {
    // A far plane set to the light distance clips the shadows of everything on
    // the far side of the scene — which is half of any oblique view.
    const plan = shadowCameraPlan(400, 100, 2048)
    expect(plan.far).toBeGreaterThan(100 + plan.halfExtent)
  })

  it('reports texel size honestly and flags a frustum its map cannot serve', () => {
    const fine = shadowCameraPlan(400, 100, 4096)
    expect(fine.texelSize).toBeCloseTo((400 * 1.15 * 2) / 4096, 5)
    expect(fine.degraded).toBe(false)

    // Same district, quarter the map: the contact shadow becomes a smear.
    const coarse = shadowCameraPlan(2000, 100, 1024)
    expect(coarse.texelSize).toBeGreaterThan(MAX_USABLE_TEXEL)
    expect(coarse.degraded).toBe(true)
  })

  it('degrades rather than throwing on a degenerate map size', () => {
    const plan = shadowCameraPlan(400, 100, 0)
    expect(Number.isFinite(plan.texelSize)).toBe(true)
    expect(plan.degraded).toBe(true)
  })
})
