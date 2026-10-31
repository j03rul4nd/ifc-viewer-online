// ─── Vector export ────────────────────────────────────────────────────────────
// The drawing as seen from the current camera, each stroke a filled outline, so
// pressure survives into Illustrator, Inkscape or a layout. One group per layer.

import { BRUSH_ALPHA } from './ribbon'
import { strokeOutline, type Project } from './raster'
import type { SketchLayer, Stroke } from './types'

export type { Project } from './raster'

const n = (v: number): string => (Math.round(v * 100) / 100).toString()

function strokePath(stroke: Stroke, project: Project): string {
  const d = strokeOutline(stroke, project)
    .map((polygon) => polygon.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join('') + 'Z')
    .join('')
  if (!d) return ''
  const alpha = BRUSH_ALPHA[stroke.brush]
  return `<path d="${d}" fill="${stroke.color}"${alpha < 1 ? ` fill-opacity="${alpha}"` : ''}/>`
}

const escapeXml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export function exportSvg(layers: readonly SketchLayer[], width: number, height: number, background: string, project: Project): string {
  const body = layers
    .filter((l) => l.visible)
    .map((l) => `<g id="${escapeXml(`layer-${l.name}`)}">${l.strokes.map((s) => strokePath(s, project)).join('')}</g>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${background}"/>${body}</svg>`
}
