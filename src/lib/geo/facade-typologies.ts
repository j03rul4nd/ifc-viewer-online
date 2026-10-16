// ─── facade typologies ────────────────────────────────────────────────────────
// THE PROCEDURAL FACADE FOR EVERY CITY, NOT ONLY BARCELONA.
//
// The facade shader draws a building's openings per pixel: a ground floor of
// its own height, storeys fitted to the building, windows in bays, frames,
// shutters, balconies with railings, and blank party walls where two buildings
// touch. Until now only Barcelona's barri typologies could switch it on, so
// every other city fell back to banded glazing strips that read the same on a
// cottage and on a tower block.
//
// This hands that shader a typology for any building it suits, decided from
// what the building IS (its use and its height) and WHERE it is (the region):
//
//   - a house:        low storeys, wide bays, no balconies;
//   - an apartment block, or an unnamed mid-rise: the street building of the
//                     region — tall storeys and shutters in the Mediterranean,
//                     brick and wide sashes in the north, tight bays in East
//                     Asia;
//   - civic / retail low-rise: tall ground floor, generous storeys.
//
// And it says "not this one" (null) for what the shader is the wrong tool for:
// glass towers, industrial sheds, temples, and anything taller than a street
// building, which keep their own facades. A wrong typology confidently drawn
// is worse than the plain one.
//
// PURE: a use, a height and a region in; a typology or null out.

import type { FacadeTypology } from './building-mesh'
import type { BuildingRegion } from './feature-variation'
import type { BuildingUse } from './osm-features'

type RGB = readonly [number, number, number]

/** Above this, a building is a tower or a slab, not a street building. */
export const STREET_BUILDING_MAX_M = 36

interface RegionStyle {
  /** Render plaster / brick tones of the street buildings, light to dark. */
  palette: RGB[]
  roofTones: RGB[]
  shutter: RGB
  storeyM: number
  groundFloorM: number
  bayM: number
  windowWidthM: number
  balcony: number
}

const REGION_STYLE: Record<BuildingRegion, RegionStyle> = {
  // Plaster in ochres and creams, green and brown shutters, tall storeys and
  // balconies on half the fronts.
  mediterranean: {
    palette: [[0.86, 0.80, 0.68], [0.82, 0.72, 0.58], [0.88, 0.84, 0.76], [0.78, 0.66, 0.52], [0.84, 0.76, 0.66]],
    roofTones: [[0.62, 0.38, 0.28], [0.56, 0.52, 0.48], [0.66, 0.44, 0.32]],
    shutter: [0.27, 0.38, 0.30], storeyM: 3.1, groundFloorM: 4.2, bayM: 3.4, windowWidthM: 1.25, balcony: 0.5,
  },
  // Brick and render, sash windows, no shutters to speak of (the tone is the
  // frame), balconies rare.
  'northern-europe': {
    palette: [[0.60, 0.38, 0.30], [0.70, 0.55, 0.45], [0.82, 0.78, 0.72], [0.54, 0.34, 0.27], [0.76, 0.70, 0.62]],
    roofTones: [[0.32, 0.32, 0.35], [0.45, 0.30, 0.25], [0.38, 0.36, 0.36]],
    shutter: [0.30, 0.33, 0.31], storeyM: 3.0, groundFloorM: 3.8, bayM: 3.0, windowWidthM: 1.3, balcony: 0.15,
  },
  // Clapboard and brick, wide double-hung windows.
  'north-america': {
    palette: [[0.78, 0.74, 0.68], [0.62, 0.42, 0.34], [0.86, 0.84, 0.80], [0.70, 0.66, 0.60]],
    roofTones: [[0.30, 0.30, 0.32], [0.40, 0.38, 0.36]],
    shutter: [0.22, 0.24, 0.26], storeyM: 3.1, groundFloorM: 4.0, bayM: 3.6, windowWidthM: 1.4, balcony: 0.1,
  },
  // Tile-clad and render in pale greys, tight bays, balconies on most slabs.
  'east-asia': {
    palette: [[0.84, 0.84, 0.82], [0.76, 0.76, 0.74], [0.88, 0.86, 0.80], [0.70, 0.72, 0.72]],
    roofTones: [[0.36, 0.38, 0.40], [0.50, 0.50, 0.50]],
    shutter: [0.55, 0.58, 0.60], storeyM: 2.9, groundFloorM: 3.6, bayM: 2.8, windowWidthM: 1.5, balcony: 0.55,
  },
  generic: {
    palette: [[0.80, 0.77, 0.72], [0.72, 0.68, 0.62], [0.86, 0.84, 0.80], [0.66, 0.60, 0.54]],
    roofTones: [[0.40, 0.40, 0.42], [0.55, 0.42, 0.34]],
    shutter: [0.35, 0.36, 0.38], storeyM: 3.0, groundFloorM: 4.0, bayM: 3.2, windowWidthM: 1.3, balcony: 0.25,
  },
}

const cache = new Map<string, FacadeTypology>()

/**
 * The typology for one building, or null when the procedural facade is the
 * wrong tool for it (see the file note).
 */
export function genericFacadeTypology(
  use: BuildingUse | undefined, heightM: number, region: BuildingRegion,
): FacadeTypology | null {
  const u = use ?? 'generic'
  if (u === 'tower' || u === 'industrial' || u === 'shed' || u === 'temple' || u === 'shrine') return null
  if (!(heightM > 0) || heightM > STREET_BUILDING_MAX_M) return null
  const kind = u === 'house' ? 'house' : u === 'civic' || u === 'retail' ? 'civic' : 'street'
  const key = `${region}|${kind}`
  const hit = cache.get(key)
  if (hit) return hit
  const r = REGION_STYLE[region]
  const t: FacadeTypology = kind === 'house'
    ? {
        palette: r.palette, roofTones: r.roofTones, shutterTone: r.shutter,
        groundFloorM: 3.0, storeyM: 2.8, bayM: r.bayM + 0.8, windowWidthM: r.windowWidthM * 0.95,
        balconyProbability: 0,
      }
    : kind === 'civic'
      ? {
          palette: r.palette, roofTones: r.roofTones, shutterTone: r.shutter,
          groundFloorM: r.groundFloorM + 1.2, storeyM: r.storeyM + 0.8, bayM: r.bayM + 0.6,
          windowWidthM: r.windowWidthM * 1.25, balconyProbability: 0,
        }
      : {
          palette: r.palette, roofTones: r.roofTones, shutterTone: r.shutter,
          groundFloorM: r.groundFloorM, storeyM: r.storeyM, bayM: r.bayM,
          windowWidthM: r.windowWidthM, balconyProbability: r.balcony,
        }
  cache.set(key, t)
  return t
}
