// ─── vertical-frame ───────────────────────────────────────────────────────────
// How high a georeferenced model stands above the map it is placed on.
//
// A file states the height of its own origin above the vertical datum
// (IfcMapConversion.OrthogonalHeight, or IfcSite.RefElevation): H. The ground
// at the site has a height too, which a DEM reports: E. The model's floor
// belongs H − E above the ground under it.
//
// The map used to raise every model by H above its plane, as if the ground
// everywhere were at sea level. Measured consequences:
//
//   Hotel Vela (Port Vell)        H 2.5, ground ≈ 0       right, by luck: the beach IS at sea level
//   Pl. Catalunya (eight models)  H 16.6–23.2, ground 17–23 every model floating 15–19 m over the terrain
//
// The DEM is not always right either. The global mosaic measures roofs in a
// dense city — 7 to 15 m high over Pl. Catalunya, against the ICGC's survey
// within a metre — so a DEM that disagrees with the file by more than a few
// metres is the one not believed, and the model is stood on the terrain.
// A model is never sunk: a negative difference (DEM above the stated floor:
// a bare-earth model interpolated under the building, a slope) stands it on
// the ground rather than burying its ground floor.
//
// Pure.

import type { GeoPlacement } from './geo-types'

/** Beyond this disagreement between a file and the DEM, the DEM is not trusted at the site. */
export const DEM_AGREEMENT_M = 5

export type LiftReason =
  /** Placed by hand or by a stand-in: its height offset is the user's own lift. */
  | 'manual'
  /** The file states no height (0 / missing): stood on the ground. */
  | 'unstated'
  /** No ground height known yet: the stated height above the plane, as before. */
  | 'no-ground'
  /** H − E, the DEM agreeing with the file. */
  | 'stated'
  /** The DEM is above the stated floor (within the agreement band): stood on the ground. */
  | 'ground-above'
  /** File and DEM disagree beyond the band: the DEM is distrusted, stood on the ground. */
  | 'disagree'

  /** The height reads as ground level in the city's own datum or the map's: stood on the ground. */
  | 'local-datum'

export interface Lift {
  /** Metres the model's floor stands above the ground under it. */
  liftM: number
  reason: LiftReason
}

/**
 * A city whose drawings state heights in a datum of their own.
 *
 * Shanghai's is the Wusong datum: 1.680 m under the national 1985 datum
 * (municipal figure, 2022), which is itself about 0.25 m under EGM2008 on this
 * coast — so a Wusong height is about 1.43 m more than the map's for the same
 * point. The city's streets stand at 3 to 4 m Wusong, and a building's ±0.000
 * is typically 4.0 to 4.8 m: read as the map's datum, every such file would
 * float a metre and a half to three metres over ground that is at 1.9 m.
 *
 * A file does not say which datum its height is in, so both readings are kept:
 * a height that is ground level in either one is ground level.
 */
export interface LocalDatum {
  id: string
  /** Metres the local datum's heights are above the map's, for the same point. */
  offsetM: number
  /** Within this of the ground, in either reading, the floor is on the ground. */
  toleranceM: number
}

export const WUSONG_DATUM: LocalDatum = { id: 'wusong', offsetM: 1.43, toleranceM: 1.5 }

/** Shanghai municipality (the delta box of lower-envelope's flat ground). */
const WUSONG_BOX = [30.65, 120.85, 31.9, 122.05] as const

/** The local height datum in use at a position, if the city has one. */
export function localDatumAt(lat: number, lon: number): LocalDatum | null {
  const [s, w, n, e] = WUSONG_BOX
  return lat >= s && lat <= n && lon >= w && lon <= e ? WUSONG_DATUM : null
}

/**
 * The lift for a model whose file states `heightM` where the ground is
 * `groundM` (both absolute metres; null = unknown). With a `datum`, the height
 * may be in it instead: the reading nearer the ground is the one taken.
 */
export function liftAboveGround(heightM: number, groundM: number | null, datum: LocalDatum | null = null): Lift {
  if (!Number.isFinite(heightM) || heightM === 0) return { liftM: 0, reason: 'unstated' }
  if (groundM === null || !Number.isFinite(groundM)) return { liftM: heightM, reason: 'no-ground' }
  let d = heightM - groundM
  if (datum) {
    const local = d - datum.offsetM
    // Ground level in one datum, in the other, or anywhere between the two.
    if (local <= datum.toleranceM && d >= -datum.toleranceM) return { liftM: 0, reason: 'local-datum' }
    if (Math.abs(local) < Math.abs(d)) d = local
  }
  if (Math.abs(d) > DEM_AGREEMENT_M) return { liftM: 0, reason: 'disagree' }
  if (d < 0) return { liftM: 0, reason: 'ground-above' }
  return { liftM: d, reason: 'stated' }
}

/**
 * The placement as the map should apply it: same position, with its height
 * offset meaning "metres above the ground at the anchor". A manual placement
 * keeps its offset — that IS a lift, chosen by a person.
 */
export function placementOverGround(p: GeoPlacement, groundM: number | null): { placement: GeoPlacement; lift: Lift } {
  if (p.source !== 'ifc') return { placement: p, lift: { liftM: p.heightOffsetM, reason: 'manual' } }
  const lift = liftAboveGround(p.heightOffsetM, groundM, localDatumAt(p.lat, p.lon))
  return { placement: lift.liftM === p.heightOffsetM ? p : { ...p, heightOffsetM: lift.liftM }, lift }
}

/**
 * Ground height in absolute metres under a scene point, from the terrain as
 * drawn: the terrain mesh is relative to its anchor's elevation, so a scene
 * height maps back through the plane and the exaggeration.
 */
export function absoluteGroundM(groundSceneY: number, planeY: number, anchorElevationM: number, exaggeration: number): number {
  return anchorElevationM + (groundSceneY - planeY) / (exaggeration > 0 ? exaggeration : 1)
}
