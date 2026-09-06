// ─── deck-profile ─────────────────────────────────────────────────────────────
// HOW THE EDGE OF A WAY IS BUILT, which depends on whether there is ground
// under it.
//
// ── The mistake this corrects ─────────────────────────────────────────────────
//
// The linear layer gives every way a KERB: a small vertical lip at each edge so
// the ribbon reads as a surface rather than a tint painted on the map. The
// values are right for what they were chosen for — 16 cm for a carriageway,
// 5 cm for a footpath, because "dropping a footpath 16 cm like a road carved a
// trench through every park".
//
// They are applied to elevated ways too, and there they are absurd. Lujiazui's
// pedestrian circle stands about twelve metres above the street, and it was
// being drawn as a ribbon five centimetres thick — a sheet of paper in the air,
// with nothing underneath it and nothing along its edges. No amount of colour
// or lighting rescues that, because the shape itself is wrong.
//
// A kerb is what a surface has when the ground holds it up. A way with air
// under it has a STRUCTURE instead: a deck with real depth, an underside you
// can see from below, and — if people walk on it — something at the edge to
// stop them falling off. That last one is not decoration: a raised walkway
// without a parapet does not read as a walkway, it reads as a mistake.
//
// PURE: a classification in, dimensions out. No THREE, no scene.

import type { RoadClass } from './osm-features'
import type { StructureType } from './vertical'

/**
 * Depth of a deck edge, metres, by what the way carries.
 *
 * Structural depths, not exaggerated ones: a footbridge is a shallow box or a
 * truss about this deep, a road viaduct needs considerably more, and the
 * difference between them is visible from the street. Using one value for both
 * makes every elevated thing read as the same object.
 */
export const DECK_DEPTH_M: Record<RoadClass, number> = {
  vehicular: 1.10,
  pedestrian: 0.65,
  track: 0.45,
}

/**
 * Height of the parapet on a raised deck, metres.
 *
 * A real handrail is about 1.1 m. Drawn at full height on a 3 m-wide walkway it
 * closes the section into a tube from every oblique view, so this is the height
 * that reads as an edge protection without hiding what it protects.
 */
export const PARAPET_H_M = 0.95

/** How thick the parapet is, metres. Enough to catch light on one side. */
export const PARAPET_T_M = 0.12

export interface DeckProfile {
  /** Vertical face at each edge, metres — a kerb on the ground, a deck in the air. */
  edgeDropM: number
  /** Whether to close the underside. Only meaningful when there is air below. */
  soffit: boolean
  /** Parapet height, metres; 0 for none. */
  parapetM: number
}

/**
 * Which structures have air beneath them.
 *
 * `covered` is at grade with a roof and `trench` is a cutting with its own
 * walls — both sit ON something. Only these two are held clear of the ground,
 * and only they need a structure rather than a kerb.
 */
export function isCarriedClear(structure: StructureType): boolean {
  return structure === 'bridge' || structure === 'floating'
}

/**
 * The edge treatment for one way.
 *
 * `kerbM` is passed in rather than looked up so this module does not duplicate
 * the ground-level table it must agree with: on the ground the answer IS the
 * kerb, unchanged, and that is the case that must not regress.
 */
export function deckProfile(
  structure: StructureType, roadClass: RoadClass, kerbM: number,
): DeckProfile {
  if (!isCarriedClear(structure)) {
    // On the ground. Exactly what it was before: a lip, no underside to draw,
    // and no parapet — a parapet along every pavement in the city would be
    // both wrong and ruinous.
    return { edgeDropM: kerbM, soffit: false, parapetM: 0 }
  }
  return {
    edgeDropM: DECK_DEPTH_M[roadClass],
    // Without it the deck is invisible from underneath on the unlit path, and
    // looking up at a walkway from the street is most of how it is seen.
    soffit: true,
    // Only where people walk. A road viaduct has a barrier too, but it is low
    // and solid and reads as part of the deck edge at this scale, whereas a
    // walkway's is the thing that says "walkway".
    parapetM: roadClass === 'pedestrian' ? PARAPET_H_M : 0,
  }
}
