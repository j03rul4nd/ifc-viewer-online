// ─── Pinching a flat view ─────────────────────────────────────────────────────
// Two fingers zoom and carry the surface: what was under them stays under them.

export interface FlatView { x: number; y: number; zoom: number }
export interface Fingers { a: { x: number; y: number }; b: { x: number; y: number } }

const spread = (f: Fingers) => Math.hypot(f.a.x - f.b.x, f.a.y - f.b.y)
const middle = (f: Fingers) => ({ x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 })

/** Positions are relative to the view's box. */
export function pinchView(view: FlatView, from: Fingers, to: Fingers, minZoom = 0.1, maxZoom = 3): FlatView {
  const zoom = Math.max(minZoom, Math.min(maxZoom, view.zoom * spread(to) / Math.max(spread(from), 1)))
  const start = middle(from), end = middle(to)
  const worldX = (start.x - view.x) / view.zoom, worldY = (start.y - view.y) / view.zoom
  return { x: end.x - worldX * zoom, y: end.y - worldY * zoom, zoom }
}
