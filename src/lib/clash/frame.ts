// ─── framing a clash ──────────────────────────────────────────────────────────
// Where to put the camera so both elements read in one picture. Scene axes
// (Y up). The smaller element is the one people look for (the pipe, not the
// slab it crosses), or the strip where two big ones meet, so the shot is sized on it and taken across its long
// side, from 30° above, aimed at the clash point. A huge host (a slab, a
// facade) only adds context; it never pushes the camera kilometres away.

export interface Box3Like { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
type P = [number, number, number]

const size = (b: Box3Like): P => [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]
const diag = (s: P) => Math.hypot(s[0], s[1], s[2])

export interface ClashShot { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }

export function clashShot(point: P, a: Box3Like | null, b: Box3Like | null): ClashShot {
  const target = { x: point[0], y: point[1], z: point[2] }
  const boxes = [a, b].filter((x): x is Box3Like => !!x && isFinite(x.min.x) && x.max.x >= x.min.x)
  if (!boxes.length) return { target, position: { x: point[0] + 4.5, y: point[1] + 3.5, z: point[2] + 4.5 } }
  // Two big elements (a facade against a slab): what matters is where they
  // meet, so the overlap of their boxes competes as the "small" thing.
  if (boxes.length === 2) {
    const [p, q] = boxes
    const pad = 0.15
    const o: Box3Like = {
      min: { x: Math.max(p.min.x, q.min.x) - pad, y: Math.max(p.min.y, q.min.y) - pad, z: Math.max(p.min.z, q.min.z) - pad },
      max: { x: Math.min(p.max.x, q.max.x) + pad, y: Math.min(p.max.y, q.max.y) + pad, z: Math.min(p.max.z, q.max.z) + pad },
    }
    if (o.max.x >= o.min.x && o.max.y >= o.min.y && o.max.z >= o.min.z) boxes.push(o)
  }
  const small = boxes.reduce((p, c) => (diag(size(c)) < diag(size(p)) ? c : p))
  const s = size(small)
  // Across the small element's long horizontal side; for a vertical riser or a
  // square-ish element, from the diagonal.
  let hx = 0.7071, hz = 0.7071
  if (s[0] > s[2] * 1.5) { hx = 0.25; hz = 0.97 } else if (s[2] > s[0] * 1.5) { hx = 0.97; hz = 0.25 }
  // Size on the small element, but not on its full length when it is a long run:
  // the clash is a spot on it, so cap at a few metres of context.
  const spot = Math.min(diag(s), Math.max(Math.min(s[0], s[1], s[2]) * 4, 3))
  const dist = Math.min(18, Math.max(2.2, spot * 1.3 + 1.2))
  const up = Math.sin(Math.PI / 6), flat = Math.cos(Math.PI / 6)
  return { target, position: { x: point[0] + hx * flat * dist, y: point[1] + up * dist, z: point[2] + hz * flat * dist } }
}
