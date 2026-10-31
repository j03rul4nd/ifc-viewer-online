// ─── Stroke geometry ──────────────────────────────────────────────────────────
// A stroke becomes a ribbon the vertex shader widens in screen space: two
// vertices per point, each knowing its neighbours. Pure arrays, so it can be
// tested and appended to a batch without touching the GPU.

import type { BrushKind, Stroke } from './types'

export const BRUSH_ALPHA: Record<BrushKind, number> = { pen: 1, pencil: 0.82, marker: 0.34 }
/** The marker is broad by nature; the width control means the same click for all. */
const BRUSH_WIDTH: Record<BrushKind, number> = { pen: 1, pencil: 0.9, marker: 3.2 }
/** Marker weight is nearly even: pressure mostly belongs to pen and pencil. */
const PRESSURE_SHARE: Record<BrushKind, number> = { pen: 0.85, pencil: 0.7, marker: 0.15 }

export interface RibbonBuffers {
  /** position (3) + previous (3) + next (3) + side (1) + width px (1) */
  vertices: Float32Array
  /** rgba, 0..255 */
  colors: Uint8Array
  indices: Uint32Array
  vertexCount: number
}

export const VERTEX_STRIDE = 11

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function strokeWidthAt(stroke: Pick<Stroke, 'brush' | 'width'>, pressure: number): number {
  const share = PRESSURE_SHARE[stroke.brush]
  return stroke.width * BRUSH_WIDTH[stroke.brush] * (1 - share + share * pressure)
}

/** How many vertices and indices a stroke of `points` values takes. */
export function ribbonSize(pointValues: number): { vertices: number; indices: number } {
  const n = pointValues / 4
  // A lone tap still has to leave a dot, drawn as a tiny segment.
  const count = Math.max(n, 2)
  return { vertices: count * 2, indices: (count - 1) * 6 }
}

export function writeRibbon(stroke: Stroke, out: RibbonBuffers, indexOffset: number): number {
  const src = stroke.points
  const n = src.length / 4
  if (n === 0) return 0
  const count = Math.max(n, 2)
  const [r, g, b] = hexToRgb(stroke.color)
  const a = Math.round(BRUSH_ALPHA[stroke.brush] * 255)
  const base = out.vertexCount

  const read = (i: number): [number, number, number, number] => {
    const k = Math.min(n - 1, Math.max(0, i)) * 4
    // A dot: nudge the second point so the ribbon has a direction to widen across.
    const nudge = n === 1 && i >= 1 ? 1e-4 : 0
    return [src[k] + nudge, src[k + 1], src[k + 2], src[k + 3]]
  }

  for (let i = 0; i < count; i++) {
    const p = read(i)
    const before = read(i - 1)
    const after = read(i + 1)
    const width = strokeWidthAt(stroke, p[3])
    for (const side of [-1, 1]) {
      const v = (base + (i * 2) + (side > 0 ? 1 : 0))
      const at = v * VERTEX_STRIDE
      out.vertices[at] = p[0]; out.vertices[at + 1] = p[1]; out.vertices[at + 2] = p[2]
      out.vertices[at + 3] = before[0]; out.vertices[at + 4] = before[1]; out.vertices[at + 5] = before[2]
      out.vertices[at + 6] = after[0]; out.vertices[at + 7] = after[1]; out.vertices[at + 8] = after[2]
      out.vertices[at + 9] = side
      out.vertices[at + 10] = width
      const c = v * 4
      out.colors[c] = r; out.colors[c + 1] = g; out.colors[c + 2] = b; out.colors[c + 3] = a
    }
  }
  for (let i = 0; i < count - 1; i++) {
    const v = base + i * 2
    const at = indexOffset + i * 6
    out.indices[at] = v; out.indices[at + 1] = v + 1; out.indices[at + 2] = v + 2
    out.indices[at + 3] = v + 2; out.indices[at + 4] = v + 1; out.indices[at + 5] = v + 3
  }
  out.vertexCount = base + count * 2
  return (count - 1) * 6
}

/** The strokes already drawn are the start of `next`, so only the tail needs adding. */
export function isAppendOf(previous: readonly Stroke[], next: readonly Stroke[]): boolean {
  if (next.length < previous.length) return false
  for (let i = 0; i < previous.length; i++) if (previous[i] !== next[i]) return false
  return true
}
