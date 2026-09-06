// ─── deck-supports ────────────────────────────────────────────────────────────
// WHAT HOLDS AN ELEVATED DECK UP.
//
// ── The honesty line, because this one is genuinely awkward ───────────────────
//
// `props-scene.ts` draws the line this file has to sit on: traffic signals are
// DATA (somebody surveyed that junction), cars are SCENERY (OpenStreetMap does
// not record where cars park, and never could). Piers are neither, exactly.
//
// Measured over Lujiazui — 137 layered ways around the Oriental Pearl — the
// survey carries no pier anywhere: no `bridge:support`, no `bridge:structure`,
// not one `width`, one `height` in 137, and zero `ele`. So every pier we draw
// is invented. But a deck standing twelve metres above a street with nothing
// under it is not neutral the way an empty car park is neutral: the structure's
// own existence states that something carries it. Drawing nothing is a claim
// too, and it is the false one.
//
// So: the EXISTENCE of support is implied by the deck and is drawn. The
// SPACING is regular and invented. The FORM is a plain shaft — deliberately not
// a truss, an arch, a cable stay or a specific pier type, because those are
// recognisable engineering and we would be making them up. A regular row of
// plain columns reads as "this is held up" without claiming to know how.
//
// ── Why spacing is not a constant ─────────────────────────────────────────────
//
// A footbridge and a road viaduct are built to different spans, and using one
// number makes every elevated thing read as the same object — the same mistake
// the deck depth had before `deck-profile`.
//
// PURE: a sampled profile in, pier placements out. No THREE, no scene.

import type { RoadClass } from './osm-features'

/**
 * Target distance between piers, metres, by what the deck carries.
 *
 * Chosen as ordinary spans for the type rather than as record ones: a concrete
 * footbridge sits comfortably here, and a road viaduct's box girder runs
 * further between supports. The point is the RHYTHM being different, which is
 * what tells the two apart from a distance.
 */
export const PIER_SPACING_M: Record<RoadClass, number> = {
  vehicular: 34,
  pedestrian: 24,
  track: 20,
}

/** Shaft width, metres, by what it carries. Square in plan. */
export const PIER_WIDTH_M: Record<RoadClass, number> = {
  vehicular: 1.6,
  pedestrian: 0.75,
  track: 0.6,
}

/**
 * Least clearance a pier is worth drawing under, metres.
 *
 * Below this the deck is on its ramp, or it is a kerb-height platform, and a
 * pier would be a stub poking out of the ground into the underside — visible,
 * wrong, and worse than nothing. It also keeps supports off the ends of a span,
 * where the deck meets its abutment and is carried by the ground anyway.
 */
export const MIN_SUPPORTED_CLEARANCE_M = 3.0

export interface ProfilePoint {
  /** Plan position, in whatever units the caller works in. */
  x: number
  y: number
  /** Distance along the way, metres. */
  stationM: number
  /** Deck elevation, metres. */
  elevationM: number
  /** Ground below, metres. */
  groundM: number
}

export interface Pier {
  x: number
  y: number
  /** Ground elevation at the pier, metres. */
  baseM: number
  /** Deck underside elevation at the pier, metres. */
  topM: number
  /** Shaft width, metres. */
  widthM: number
}

/**
 * Place piers under a deck.
 *
 * Walks the profile in station order and drops a shaft whenever the running
 * distance since the last one has passed the target spacing AND there is enough
 * air under the deck to justify it. Interpolation between samples is deliberate
 * — a way's own vertices can be 80 m apart, and taking only those would put
 * piers wherever the surveyor happened to click.
 *
 * `deckDepthM` is subtracted so the shaft stops at the SOFFIT rather than
 * running up into the deck it carries.
 */
export function placePiers(
  profile: ReadonlyArray<ProfilePoint>,
  roadClass: RoadClass,
  deckDepthM: number,
): Pier[] {
  if (profile.length < 2) return []
  const spacing = PIER_SPACING_M[roadClass]
  const widthM = PIER_WIDTH_M[roadClass]
  const piers: Pier[] = []

  // Start half a bay in, so a span does not open with a pier jammed against its
  // abutment and does not end with one either.
  let nextAt = profile[0].stationM + spacing / 2

  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]
    const b = profile[i + 1]
    const span = b.stationM - a.stationM
    if (span <= 0) continue

    while (nextAt <= b.stationM) {
      const t = (nextAt - a.stationM) / span
      const elevationM = a.elevationM + (b.elevationM - a.elevationM) * t
      const groundM = a.groundM + (b.groundM - a.groundM) * t
      const clearance = elevationM - deckDepthM - groundM
      if (clearance >= MIN_SUPPORTED_CLEARANCE_M) {
        piers.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          baseM: groundM,
          topM: elevationM - deckDepthM,
          widthM,
        })
      }
      nextAt += spacing
    }
  }

  return piers
}
