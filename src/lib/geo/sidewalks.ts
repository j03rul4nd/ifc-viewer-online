// ─── sidewalks ────────────────────────────────────────────────────────────────
// The pavement either side of a carriageway, as a paved floor.
//
// OSM draws a street as one centreline. The road builder gives it its
// carriageway width, and between that ribbon and the façades there was nothing:
// the basemap showing through where Barcelona has its widest pavements. An
// Eixample street is 20 m between façades and about half of it is pavement.
//
// The pavement is emitted as a paved AREA around the centreline, so the scene
// draws it under the carriageway (PAVED_AREA_LIFT_M) and the carriageway lies
// on top of it. Explicit tags are read anywhere; the defaults apply only where
// the city is known to pave its streets (Barcelona), so a country road does not
// grow a kerb.

const DEFAULT_SIDEWALK_M: Record<string, number> = {
  primary: 5, secondary: 5, tertiary: 4, unclassified: 3, residential: 3,
}

function metres(v: string | undefined): number | null {
  const n = v === undefined ? NaN : parseFloat(v)
  return Number.isFinite(n) && n > 0 && n < 30 ? n : null
}

/**
 * Width of the pavement on EACH side, metres, or null for none. Tags first:
 * `sidewalk=no|none` says none; `sidewalk:width` / `sidewalk:both:width` give
 * the width. Otherwise the class default, and only when `urbanDefaults`.
 */
export function sidewalkWidthM(tags: Record<string, string> | undefined, urbanDefaults: boolean): number | null {
  const t = tags ?? {}
  const highway = (t['highway'] ?? '').replace(/_link$/, '')
  if (!(highway in DEFAULT_SIDEWALK_M)) return null
  const side = t['sidewalk'] ?? t['sidewalk:both']
  if (side === 'no' || side === 'none') return null
  const tagged = metres(t['sidewalk:both:width']) ?? metres(t['sidewalk:width'])
  if (tagged !== null) return tagged
  if (side === 'both' || side === 'left' || side === 'right' || side === 'separate' || side === 'yes') {
    return DEFAULT_SIDEWALK_M[highway]
  }
  return urbanDefaults ? DEFAULT_SIDEWALK_M[highway] : null
}

/** Pavement tone: Barcelona's grey panot, a little lighter than the tarmac. */
export const SIDEWALK_TONE: [number, number, number] = [0.6, 0.58, 0.55]
