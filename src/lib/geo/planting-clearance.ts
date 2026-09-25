import type { OsmFeature, LatLonPoint } from './osm-features'
import { keepOutSteps } from './tree-seeding'
import { runToEnd, type Steps } from './steps'

type Point = { x: number; y: number }

/** Excludes procedural trunks, not surveyed trees or overhanging crowns. */
export function plantingClearance(
  features: ReadonlyArray<OsmFeature>, toMetres: (p: LatLonPoint) => Point,
): (x: number, y: number) => boolean {
  return runToEnd(plantingClearanceSteps(features, toMetres))
}

/** `plantingClearance`, pausable between features and rings — see `steps`. */
export function* plantingClearanceSteps(
  features: ReadonlyArray<OsmFeature>, toMetres: (p: LatLonPoint) => Point,
): Steps<(x: number, y: number) => boolean> {
  const polygons: Point[][] = []
  for (const f of features) {
    if (!f.ring || f.ring.length < 2) continue
    // Underground infrastructure does not occupy the park above it.
    if (f.vertical?.structure === 'tunnel') continue
    yield
    const line = f.ring.map(toMetres)
    if (f.kind === 'building' || f.kind === 'water'
      || ((f.kind === 'road' || f.kind === 'rail') && f.widthM === undefined)) {
      if (line.length >= 3) polygons.push(line)
      continue
    }
    if ((f.kind !== 'road' && f.kind !== 'rail') || !f.widthM) continue
    const radius = f.widthM / 2 + (f.kind === 'rail' ? 1 : 0.5)
    // Segment rectangles plus end discs avoid gaps at bends. The existing
    // polygon grid makes each planting query local, even for large rail yards.
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length < 1e-6) continue
      const nx = -(b.y - a.y) / length * radius, ny = (b.x - a.x) / length * radius
      polygons.push([
        { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny },
      ])
    }
    for (const p of line) polygons.push(Array.from({ length: 12 }, (_, i) => ({
      x: p.x + radius * Math.cos(i * Math.PI / 6),
      y: p.y + radius * Math.sin(i * Math.PI / 6),
    })))
  }
  return yield* keepOutSteps(polygons)
}
