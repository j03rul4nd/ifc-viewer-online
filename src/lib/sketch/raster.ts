// ─── Strokes without the GPU ──────────────────────────────────────────────────
// A variable-width outline per stroke. SVG writes it as a path, and Canvas 2D
// fills it for layered and transparent exports at any size. WebGL's canvas has
// a paper background and the viewport's size, so it cannot serve those.

import { BRUSH_ALPHA, strokeWidthAt } from './ribbon'
import type { SketchLayer, Stroke, Vec3 } from './types'

export type Project = (point: Vec3) => { x: number; y: number } | null

export interface Point2 { x: number; y: number }

/** Closed polygon around a screen-space stroke, with rounded ends. Empty if off camera. */
export function strokeOutline(stroke: Stroke, project: Project, scale = 1): Point2[][] {
  const runs: { p: Point2; r: number }[][] = [[]]
  for (let i = 0; i < stroke.points.length; i += 4) {
    const s = project([stroke.points[i], stroke.points[i + 1], stroke.points[i + 2]])
    if (!s) { runs.push([]); continue }
    runs[runs.length - 1].push({ p: { x: s.x * scale, y: s.y * scale }, r: Math.max(0.2, strokeWidthAt(stroke, stroke.points[i + 3]) * scale / 2) })
  }
  return runs.filter((r) => r.length > 0).map(outlineRun)
}

function capPoints(c: Point2, r: number, from: number): Point2[] {
  const out: Point2[] = []
  for (let k = 1; k < 6; k++) {
    const a = from + (Math.PI * k) / 6
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r })
  }
  return out
}

function outlineRun(run: { p: Point2; r: number }[]): Point2[] {
  if (run.length === 1) {
    const { p, r } = run[0]
    return Array.from({ length: 12 }, (_, k) => ({ x: p.x + Math.cos((k * Math.PI) / 6) * r, y: p.y + Math.sin((k * Math.PI) / 6) * r }))
  }
  const left: Point2[] = []
  const right: Point2[] = []
  let first = 0
  let last = 0
  for (let i = 0; i < run.length; i++) {
    const a = run[Math.max(0, i - 1)].p
    const b = run[Math.min(run.length - 1, i + 1)].p
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    if (i === 0) first = angle
    if (i === run.length - 1) last = angle
    const nx = -Math.sin(angle), ny = Math.cos(angle)
    const { p, r } = run[i]
    left.push({ x: p.x + nx * r, y: p.y + ny * r })
    right.push({ x: p.x - nx * r, y: p.y - ny * r })
  }
  const end = run[run.length - 1]
  return [
    ...left,
    ...capPoints(end.p, end.r, last + Math.PI / 2 - Math.PI).reverse(),
    ...right.reverse(),
    ...capPoints(run[0].p, run[0].r, first + Math.PI / 2).reverse(),
  ]
}

/** Paint one layer onto a 2D context, leaving everything else transparent. */
export function paintLayer(ctx: CanvasRenderingContext2D, layer: SketchLayer, project: Project, scale: number): void {
  for (const stroke of layer.strokes) {
    ctx.fillStyle = stroke.color
    ctx.globalAlpha = BRUSH_ALPHA[stroke.brush]
    for (const polygon of strokeOutline(stroke, project, scale)) {
      ctx.beginPath()
      polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

export function renderLayerCanvas(layer: SketchLayer, width: number, height: number, project: Project, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (ctx) paintLayer(ctx, layer, project, scale)
  return canvas
}
