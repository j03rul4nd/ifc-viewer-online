// ─── the model's georeference, for the flood grid ────────────────────────────
// The IfcMapConversion of the model the grid is built around, reduced to what
// the flood feature needs: scene ⇄ projected grid (E, N), the grid rotation
// that aligns cells to grid north, and absolute elevation ⇄ scene Y. Same
// conventions as placement.ts / pc-align.ts: scene = project with Y up
// (x = xP, y = zP, z = −yP) plus the display shift for far coordinates.
//
// Pure, except reprojection between two projected CRSs (proj4, already in the
// geo chunk), which is linearised over the grid's extent: across a site of a
// couple of kilometres two projected grids are affine to well under a
// centimetre, and 250 000 proj4 calls are not.

export interface FloodGeoref {
  eastings: number
  northings: number
  /** IfcMapConversion rotation (XAxisAbscissa / Ordinate), degrees. */
  rotationDeg: number
  scale: number
  /** OrthogonalHeight / RefElevation of the project origin, metres; null when unstated. */
  heightM: number | null
  epsg: string | null
  /** Display shift of far-coordinate models (drawn = real + coordination). */
  coordination: { x: number; y: number; z: number }
}

const DEG = Math.PI / 180

/** Rotation of the flood grid's i axis that aligns cells with grid east / north. */
export const gridRotation = (g: FloodGeoref): number => -g.rotationDeg * DEG

export function sceneToGrid(g: FloodGeoref, x: number, z: number): { e: number; n: number } {
  const gamma = g.rotationDeg * DEG
  const xP = x - g.coordination.x
  const yP = -(z - g.coordination.z)
  return {
    e: g.eastings + g.scale * (xP * Math.cos(gamma) - yP * Math.sin(gamma)),
    n: g.northings + g.scale * (xP * Math.sin(gamma) + yP * Math.cos(gamma)),
  }
}

export function gridToScene(g: FloodGeoref, e: number, n: number): { x: number; z: number } {
  const gamma = g.rotationDeg * DEG
  const dE = e - g.eastings
  const dN = n - g.northings
  const xP = (dE * Math.cos(gamma) + dN * Math.sin(gamma)) / g.scale
  const yP = (-dE * Math.sin(gamma) + dN * Math.cos(gamma)) / g.scale
  return { x: xP + g.coordination.x, z: -yP + g.coordination.z }
}

/** Scene Y of an absolute elevation; null when the file states no height datum. */
export function elevationToSceneY(g: FloodGeoref, elevationM: number): number | null {
  if (g.heightM === null) return null
  return g.coordination.y + (elevationM - g.heightM) / g.scale
}

/**
 * An affine map fitted through three corners of a box: exact for an affine
 * transform, and what reprojecting between two projected CRSs is, at site scale.
 */
export function affineFrom(
  f: (x: number, y: number) => { x: number; y: number },
  box: { minX: number; minY: number; maxX: number; maxY: number },
): (x: number, y: number) => { x: number; y: number } {
  const o = f(box.minX, box.minY)
  const ex = f(box.maxX, box.minY)
  const ey = f(box.minX, box.maxY)
  const w = Math.max(box.maxX - box.minX, 1e-9)
  const h = Math.max(box.maxY - box.minY, 1e-9)
  const ax = { x: (ex.x - o.x) / w, y: (ex.y - o.y) / w }
  const ay = { x: (ey.x - o.x) / h, y: (ey.y - o.y) / h }
  return (x, y) => {
    const u = x - box.minX
    const v = y - box.minY
    return { x: o.x + ax.x * u + ay.x * v, y: o.y + ax.y * u + ay.y * v }
  }
}
