// ─── grips ────────────────────────────────────────────────────────────────────
// Editing a measurement by dragging its points, as CAD grips do: select it,
// grab a point, drop it somewhere else — the value follows.
//
// What a drag means for each kind is decided here, pure and testable:
//
//   • The value is recomputed from the new points, exactly as when the item
//     was created — never kept from before.
//   • Anything that only held for the ORIGINAL points is dropped rather than
//     carried over as a lie: a distance found "between elements" or as a clear
//     height is now a plain point-to-point distance; a route found along the
//     streets is now a path drawn by hand; an area traced from a face is now
//     a polygon.
//   • Requirements, notes and names stay: they describe what the measurement
//     is FOR, which a moved point does not change.
//
// Point items are re-read in their model's coordinates by the system (it needs
// the model under the point), so they are not handled here.

import { layoutDimension } from './dimension-math'
import * as M from './measure-math'
import type { MeasureItem, Vec3 } from './measure-types'

/** Screen radius, px, within which a press grabs a point of the selected item. */
export const GRIP_PX = 10

/** The item with point `index` moved to `p`, its value recomputed. Null when the new points make no measurement. */
export function movePoint(item: MeasureItem, index: number, p: Vec3): MeasureItem | null {
  if (index < 0 || index >= item.points.length) return null
  const points = item.points.map((q, i) => (i === index ? { x: p.x, y: p.y, z: p.z } : { ...q }))
  switch (item.kind) {
    case 'distance': {
      const { source: _s, clash: _c, approximate: _a, ...rest } = item
      return {
        ...rest, points, perpendicular: false,
        value: M.distance(points[0], points[1]),
        components: M.distanceComponents(points[0], points[1]),
      }
    }
    case 'path': {
      const r = M.pathLength(points)
      const { route: _r, ...rest } = item
      return { ...rest, points, value: r.total, segments: r.segments }
    }
    case 'area':
      return {
        ...item, points, source: 'polygon',
        value: M.polygonArea(points), perimeter: M.polygonPerimeter(points), planar: M.isPlanar(points),
      }
    case 'angle':
      return { ...item, points, value: M.angleAt(points[0], points[1], points[2]) }
    case 'dimension': {
      const d = layoutDimension(item.mode, points, { toward: item.facing ?? null })
      if (!d) return null
      return { ...item, points, value: d.value, parts: d.parts, center: d.center ?? null }
    }
    case 'point':
      return null
  }
}

/** Index of the point of `screen` (projected points, null = off screen) nearest (x, y) within GRIP_PX. */
export function gripAt(screen: ReadonlyArray<{ x: number; y: number } | null>, x: number, y: number, radius = GRIP_PX): number | null {
  let best: number | null = null
  let bestD = radius
  screen.forEach((s, i) => {
    if (!s) return
    const d = Math.hypot(s.x - x, s.y - y)
    if (d <= bestD) { bestD = d; best = i }
  })
  return best
}
