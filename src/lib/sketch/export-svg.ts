// ─── Vector export ────────────────────────────────────────────────────────────
// The drawing as seen from the current camera, as real paths: it goes on into a
// layout or a presentation at any size. Pure, so it is tested without a renderer.

import { BRUSH_ALPHA, strokeWidthAt } from './ribbon'
import type { SketchLayer, Stroke, Vec3 } from './types'

/** World to CSS pixels. Null when the point is behind the camera. */
export type Project = (point: Vec3) => { x: number; y: number } | null

const n = (v: number): string => (Math.round(v * 100) / 100).toString()

function strokePath(stroke: Stroke, project: Project): string {
  const parts: string[] = []
  let pen = false
  let widthSum = 0
  let count = 0
  for (let i = 0; i < stroke.points.length; i += 4) {
    const p = project([stroke.points[i], stroke.points[i + 1], stroke.points[i + 2]])
    if (!p) { pen = false; continue }
    parts.push(`${pen ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`)
    pen = true
    widthSum += strokeWidthAt(stroke, stroke.points[i + 3])
    count++
  }
  if (count === 0) return ''
  const alpha = BRUSH_ALPHA[stroke.brush]
  return `<path d="${parts.join('')}" stroke="${stroke.color}" stroke-width="${n(widthSum / count)}"${alpha < 1 ? ` stroke-opacity="${alpha}"` : ''}/>`
}

export function exportSvg(layers: readonly SketchLayer[], width: number, height: number, background: string, project: Project): string {
  const body = layers
    .filter((l) => l.visible)
    .map((l) => `<g>${l.strokes.map((s) => strokePath(s, project)).join('')}</g>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect width="100%" height="100%" fill="${background}"/>${body}</svg>`
}
