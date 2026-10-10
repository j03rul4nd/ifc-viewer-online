// ─── vector-painter ───────────────────────────────────────────────────────────
// Paints OpenMapTiles vector data into one basemap tile texture, following a
// MapStyle (map-styles.ts). One call = one 3D surface tile.
//
// Geometry is converted ONCE per vector tile into flat Float32Arrays with a
// bbox per feature (`toPaintTile`), so the many redraws an overzoomed z14 tile
// serves (every z15–z20 surface tile under it) cull and stroke without
// re-decoding protobuf.
//
// Labels are placed per surface tile with a greedy, priority-ordered collision
// pass. A label is only drawn when it fits ENTIRELY inside the tile: a label
// cut by the tile edge (the most "rendered, not designed" artefact a tiled map
// can show) is never produced. The cost is that a name straddling an edge
// waits for the next zoom, where it fits.

import { zoomValue, type FillLayer, type LabelLayer, type LineLayer, type MapStyle, type Props } from './map-styles'

export interface PaintFeature {
  type: 1 | 2 | 3
  props: Props
  /** Rings / lines / points as [x0, y0, x1, y1, …] in tile extent units. */
  parts: Float32Array[]
  minX: number; minY: number; maxX: number; maxY: number
}

export interface PaintTile {
  extent: number
  layers: ReadonlyMap<string, readonly PaintFeature[]>
}

/** Where a content tile lands on the canvas (pixels, already rounded). */
export interface TileFrame {
  tile: PaintTile
  left: number; top: number; right: number; bottom: number
}

export interface PaintOptions {
  width: number
  height: number
  /** Map zoom of the surface tile being painted. */
  zoom: number
  /** Canvas pixels per authored CSS pixel (tile-quality.stylePixelScale). */
  pixelScale: number
  language: string
  fontFamily?: string
  /** Raster sources mixed in: `under` after the background, `over` before labels. */
  rasters?: RasterDraw[]
  /**
   * When set, POINT labels (places, water, POIs, house numbers) are not baked
   * into the tile: they are handed here — budgeted per layer, best first — for
   * the screen-space label layer. Line labels (streets) stay on the ground.
   */
  collectPoints?: (cands: LabelCandidate[]) => void
  /**
   * Bake line labels (street names) into the tile. Default true. The relief
   * drape turns it off: it is painted at ~2 m per pixel, so a 12 px street
   * name lies on the ground 20 m tall, a smear across a street near the
   * camera (Chuo-dori across Tochōmae), and no smaller size would be legible.
   */
  groundLabels?: boolean
}

/** One raster source's pieces for this tile, positioned in canvas fractions. */
export interface RasterDraw {
  placement: 'under' | 'relief' | 'over'
  opacity: number
  blend?: GlobalCompositeOperation
  pieces: Array<{ image: CanvasImageSource; fx: number; fy: number; fw: number; fh: number }>
}

function drawRasters(ctx: CanvasRenderingContext2D, o: PaintOptions, placement: RasterDraw['placement']): void {
  for (const r of o.rasters ?? []) {
    if (r.placement !== placement || r.opacity <= 0) continue
    ctx.globalAlpha = r.opacity
    ctx.globalCompositeOperation = r.blend ?? 'source-over'
    for (const p of r.pieces) {
      // Integer edges, same rule as the vector frames: pieces meet on a pixel.
      const x0 = Math.round(p.fx * o.width), y0 = Math.round(p.fy * o.height)
      const x1 = Math.round((p.fx + p.fw) * o.width), y1 = Math.round((p.fy + p.fh) * o.height)
      ctx.drawImage(p.image, x0, y0, x1 - x0, y1 - y0)
    }
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

// ── Conversion ────────────────────────────────────────────────────────────────

interface VTFeatureLike {
  type: number
  properties: Record<string, unknown>
  loadGeometry(): Array<Array<{ x: number; y: number }>>
}
interface VTLayerLike { length: number; extent?: number; feature(i: number): VTFeatureLike }
interface VectorTileLike { layers: Record<string, VTLayerLike> }

const converted = new WeakMap<object, PaintTile>()

/** Flatten a parsed @mapbox/vector-tile once; cached by identity. */
export function toPaintTile(vt: VectorTileLike): PaintTile {
  const hit = converted.get(vt)
  if (hit) return hit
  const layers = new Map<string, PaintFeature[]>()
  let extent = 4096
  for (const name of Object.keys(vt.layers)) {
    const layer = vt.layers[name]
    if (layer.extent) extent = layer.extent
    const out: PaintFeature[] = []
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      const type = f.type as 1 | 2 | 3
      if (type !== 1 && type !== 2 && type !== 3) continue
      const geom = f.loadGeometry()
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      const parts: Float32Array[] = []
      for (const ring of geom) {
        const a = new Float32Array(ring.length * 2)
        for (let k = 0; k < ring.length; k++) {
          const { x, y } = ring[k]
          a[k * 2] = x; a[k * 2 + 1] = y
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
        parts.push(a)
      }
      out.push({ type, props: f.properties, parts, minX, minY, maxX, maxY })
    }
    layers.set(name, out)
  }
  const tile = { extent, layers }
  converted.set(vt, tile)
  return tile
}

// ── Painting ──────────────────────────────────────────────────────────────────

interface Xf { s: number; ox: number; oy: number; vx0: number; vy0: number; vx1: number; vy1: number }

function frameTransform(fr: TileFrame, width: number, height: number, padPx: number): Xf {
  const s = (fr.right - fr.left) / fr.tile.extent
  return {
    s, ox: fr.left, oy: fr.top,
    // Visible window in tile units, padded so thick strokes entering from
    // just outside still reach the edge.
    vx0: (-fr.left - padPx) / s, vy0: (-fr.top - padPx) / s,
    vx1: (width - fr.left + padPx) / s, vy1: (height - fr.top + padPx) / s,
  }
}

function visible(f: PaintFeature, x: Xf): boolean {
  return f.maxX >= x.vx0 && f.minX <= x.vx1 && f.maxY >= x.vy0 && f.minY <= x.vy1
}

/**
 * No closePath(), deliberately: fill() closes subpaths by itself and
 * @mapbox/vector-tile already repeats a ring's first vertex, so outlines close
 * too. Chrome's closePath() is linear in the length of the current path — on
 * a dense z14 district it measured 749 ms of a 831 ms tile.
 */
function tracePath(ctx: CanvasRenderingContext2D, f: PaintFeature, x: Xf): void {
  for (const a of f.parts) {
    if (a.length < 2) continue
    ctx.moveTo(a[0] * x.s + x.ox, a[1] * x.s + x.oy)
    for (let k = 2; k < a.length; k += 2) ctx.lineTo(a[k] * x.s + x.ox, a[k + 1] * x.s + x.oy)
  }
}

function resolveColor(c: string | ((p: Props) => string | null), p: Props): string | null {
  return typeof c === 'string' ? c : c(p)
}

/** Polygons per fill() call — see paintFill. */
const FILL_CHUNK = 256

function paintFill(ctx: CanvasRenderingContext2D, layer: FillLayer, frames: TileFrame[], o: PaintOptions): void {
  const alpha = layer.opacity === undefined ? 1 : zoomValue(layer.opacity, o.zoom)
  if (alpha <= 0) return
  ctx.globalAlpha = alpha
  const outline = layer.outline && o.zoom >= layer.outline.minzoom ? layer.outline : null
  for (const fr of frames) {
    const feats = fr.tile.layers.get(layer.source)
    if (!feats) continue
    const x = frameTransform(fr, o.width, o.height, 0)
    // Batch by colour: one fill() per run instead of one per feature.
    let current: string | null = null
    let open = false
    let inPath = 0
    const flush = (): void => {
      if (!open || !current) return
      ctx.fillStyle = current
      // Nonzero is exact for MVT (holes are wound opposite to their shell).
      ctx.fill('nonzero')
      if (outline) { ctx.strokeStyle = outline.color; ctx.lineWidth = zoomValue(outline.width, o.zoom) * o.pixelScale; ctx.stroke() }
      open = false
    }
    for (const f of feats) {
      if (f.type !== 3 || !visible(f, x)) continue
      if (layer.filter && !layer.filter(f.props, o.zoom)) continue
      const color = resolveColor(layer.color, f.props)
      if (!color) continue
      // Short paths: rasterising one path of 20k footprints measured ~900 ms
      // against ~50 ms in chunks of 256. Fills here never overlap on
      // purpose, so chunking changes nothing on screen.
      if (color !== current || inPath >= FILL_CHUNK) { flush(); current = color; inPath = 0 }
      if (!open) { ctx.beginPath(); open = true }
      tracePath(ctx, f, x)
      inPath++
    }
    flush()
  }
  ctx.globalAlpha = 1
}

function paintLine(ctx: CanvasRenderingContext2D, layer: LineLayer, frames: TileFrame[], o: PaintOptions): void {
  const alpha = layer.opacity === undefined ? 1 : zoomValue(layer.opacity, o.zoom)
  if (alpha <= 0) return
  ctx.globalAlpha = alpha
  ctx.lineJoin = 'round'
  ctx.lineCap = layer.cap ?? 'round'
  ctx.setLineDash([])
  for (const fr of frames) {
    const feats = fr.tile.layers.get(layer.source)
    if (!feats) continue
    const x = frameTransform(fr, o.width, o.height, 40)
    const picked: PaintFeature[] = []
    for (const f of feats) {
      if (f.type !== 2 || !visible(f, x)) continue
      if (layer.filter && !layer.filter(f.props, o.zoom)) continue
      picked.push(f)
    }
    if (layer.sortKey) { const k = layer.sortKey; picked.sort((a, b) => k(a.props) - k(b.props)) }
    let key = ''
    let open = false
    const flush = (): void => { if (open) { ctx.stroke(); open = false } }
    for (const f of picked) {
      const color = resolveColor(layer.color, f.props)
      if (!color) continue
      const wRaw = typeof layer.width === 'function' ? layer.width(f.props, o.zoom) : zoomValue(layer.width, o.zoom)
      const w = wRaw * o.pixelScale
      if (w < 0.25) continue
      const k = `${color}|${w.toFixed(2)}`
      if (k !== key) {
        flush()
        key = k
        ctx.strokeStyle = color
        ctx.lineWidth = w
        if (layer.dash) ctx.setLineDash(layer.dash.map((d) => d * Math.max(w, o.pixelScale)))
      }
      if (!open) { ctx.beginPath(); open = true }
      tracePath(ctx, f, x)
    }
    flush()
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

// ── Labels ────────────────────────────────────────────────────────────────────

/**
 * Ground-baked text is seen in perspective: most of the view is farther, and
 * so smaller, than the texel band the pixel scale is computed for. Measured on
 * the Poblenou fixture, a nominal 11 px street name read ~8–9 px; this brings
 * it back without touching line widths, which do not suffer the same way.
 */
const LABEL_BOOST = 1.25

export interface Box { x0: number; y0: number; x1: number; y1: number }

export interface LabelCandidate {
  text: string
  priority: number
  layer: LabelLayer
  props: Props
  /** Anchor (canvas px) and rotation (radians, already kept upright). */
  x: number; y: number; angle: number
  /** Axis-aligned box the label occupies, padding included. */
  box: Box
  fontSize: number
  /** Most labels of this layer one tile may keep (undefined = no cap). */
  budget?: number
  /** Authored size in CSS px, before the texel scale (for screen labels). */
  cssSize?: number
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

/**
 * Greedy placement: highest priority first; a candidate is kept when it is
 * fully inside the canvas (minus `margin`), hits no kept box, respects its
 * layer's per-tile budget and is not a repeat of the same text nearby.
 */
export function placeLabels(cands: LabelCandidate[], width: number, height: number, margin: number, pixelScale: number): LabelCandidate[] {
  const sorted = [...cands].sort((a, b) => b.priority - a.priority)
  const kept: LabelCandidate[] = []
  const perLayer = new Map<string, number>()
  for (const c of sorted) {
    const b = c.box
    if (b.x0 < margin || b.y0 < margin || b.x1 > width - margin || b.y1 > height - margin) continue
    const used = perLayer.get(c.layer.id) ?? 0
    if (c.budget !== undefined && used >= c.budget) continue
    if (kept.some((k) => boxesOverlap(k.box, b))) continue
    const rep = (c.layer.repeatDistance ?? 0) * pixelScale
    if (rep > 0 && kept.some((k) => k.text === c.text && Math.hypot(k.x - c.x, k.y - c.y) < rep)) continue
    kept.push(c)
    perLayer.set(c.layer.id, used + 1)
  }
  return kept
}

function fontOf(layer: LabelLayer, size: number, family: string): string {
  return `${layer.italic ? 'italic ' : ''}${layer.weight} ${size.toFixed(1)}px ${family}`
}

function measure(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  return ctx.measureText(text).width + Math.max(0, text.length - 1) * spacing
}

function collectLabels(
  ctx: CanvasRenderingContext2D, layer: LabelLayer, frames: TileFrame[], o: PaintOptions, family: string,
): LabelCandidate[] {
  const out: LabelCandidate[] = []
  const budget = layer.maxCount ? layer.maxCount(o.zoom) : undefined
  if (budget === 0) return out
  for (const fr of frames) {
    const feats = fr.tile.layers.get(layer.source)
    if (!feats) continue
    const x = frameTransform(fr, o.width, o.height, 0)
    for (const f of feats) {
      if (!visible(f, x)) continue
      if (layer.filter && !layer.filter(f.props, o.zoom)) continue
      let text = layer.text(f.props, o.language)
      if (!text) continue
      if (layer.uppercase) text = text.toLocaleUpperCase(o.language)
      const sizeCss = typeof layer.size === 'function' ? layer.size(f.props, o.zoom) : zoomValue(layer.size, o.zoom)
      const size = sizeCss * o.pixelScale * LABEL_BOOST
      const spacing = (layer.letterSpacing ?? 0) * o.pixelScale
      ctx.font = fontOf(layer, size, family)
      const w = measure(ctx, text, spacing)
      const pad = 2 * o.pixelScale
      if (layer.placement === 'point') {
        if (f.type !== 1 && f.type !== 3) continue
        const a = f.parts[0]
        if (!a || a.length < 2) continue
        let px = a[0], py = a[1]
        if (f.type === 3) { px = (f.minX + f.maxX) / 2; py = (f.minY + f.maxY) / 2 }
        const cx = px * x.s + x.ox
        const dotR = layer.dot ? 3 * o.pixelScale : 0
        // POIs: text sits right of the marker; everything else is centred.
        const cy = py * x.s + x.oy
        const x0 = dotR ? cx - dotR : cx - w / 2
        const x1 = dotR ? cx + dotR + 4 * o.pixelScale + w : cx + w / 2
        const c: LabelCandidate = {
          text, priority: layer.priority(f.props, o.zoom), layer, props: f.props,
          x: cx, y: cy, angle: 0, fontSize: size, cssSize: sizeCss,
          box: { x0: x0 - pad, y0: cy - size * 0.6 - pad, x1: x1 + pad, y1: cy + size * 0.6 + pad },
          budget,
        }
        out.push(c)
      } else {
        if (f.type !== 2) continue
        // Longest straight segment that can carry the text: never bent text
        // over a corner, never text longer than its street.
        let best = -1, bx = 0, by = 0, bAngle = 0
        for (const a of f.parts) {
          for (let k = 2; k < a.length; k += 2) {
            const x0 = a[k - 2] * x.s + x.ox, y0 = a[k - 1] * x.s + x.oy
            const x1 = a[k] * x.s + x.ox, y1 = a[k + 1] * x.s + x.oy
            const len = Math.hypot(x1 - x0, y1 - y0)
            if (len > best) { best = len; bx = (x0 + x1) / 2; by = (y0 + y1) / 2; bAngle = Math.atan2(y1 - y0, x1 - x0) }
          }
        }
        if (best < w + 8 * o.pixelScale) continue
        if (bAngle > Math.PI / 2) bAngle -= Math.PI
        else if (bAngle < -Math.PI / 2) bAngle += Math.PI
        const hw = w / 2 + pad, hh = size * 0.6 + pad
        const cos = Math.abs(Math.cos(bAngle)), sin = Math.abs(Math.sin(bAngle))
        const ex = hw * cos + hh * sin, ey = hw * sin + hh * cos
        const c: LabelCandidate = {
          text, priority: layer.priority(f.props, o.zoom), layer, props: f.props,
          x: bx, y: by, angle: bAngle, fontSize: size,
          box: { x0: bx - ex, y0: by - ey, x1: bx + ex, y1: by + ey },
          budget,
        }
        out.push(c)
      }
    }
  }
  return out
}

function drawLabel(ctx: CanvasRenderingContext2D, c: LabelCandidate, o: PaintOptions, family: string): void {
  const l = c.layer
  const spacing = (l.letterSpacing ?? 0) * o.pixelScale
  ctx.save()
  ctx.translate(c.x, c.y)
  if (c.angle) ctx.rotate(c.angle)
  ctx.font = fontOf(l, c.fontSize, family)
  ctx.textBaseline = 'middle'
  const color = typeof l.color === 'string' ? l.color : l.color(c.props)
  let tx = 0
  if (l.dot) {
    const dc = l.dot(c.props)
    const r = 3 * o.pixelScale
    if (dc) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = dc; ctx.fill()
      ctx.lineWidth = o.pixelScale; ctx.strokeStyle = l.halo; ctx.stroke()
    }
    ctx.textAlign = 'left'
    tx = r + 4 * o.pixelScale
  } else {
    ctx.textAlign = 'center'
  }
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px` } catch { /* older engines */ }
  ctx.lineJoin = 'round'
  ctx.lineWidth = l.haloWidth * 2 * o.pixelScale
  ctx.strokeStyle = l.halo
  ctx.strokeText(c.text, tx, 0)
  ctx.fillStyle = color
  ctx.fillText(c.text, tx, 0)
  ctx.restore()
}

/** Paint one surface tile. `frames` are the content tiles covering it. */
export function paintTile(ctx: CanvasRenderingContext2D, style: MapStyle, frames: TileFrame[], o: PaintOptions): void {
  const family = o.fontFamily ?? "Geist, 'Inter', system-ui, sans-serif"
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = style.palette.background
  ctx.fillRect(0, 0, o.width, o.height)
  drawRasters(ctx, o, 'under')

  const labelLayers: LabelLayer[] = []
  let reliefDone = false
  for (const layer of style.layers) {
    if (layer.minzoom !== undefined && o.zoom < layer.minzoom) continue
    if (layer.maxzoom !== undefined && o.zoom > layer.maxzoom) continue
    // Relief goes on the ground, under everything that is built on it.
    if (!reliefDone && layer.type !== 'fill') { drawRasters(ctx, o, 'relief'); reliefDone = true }
    if (layer.type === 'fill') paintFill(ctx, layer, frames, o)
    else if (layer.type === 'line') paintLine(ctx, layer, frames, o)
    else labelLayers.push(layer)
  }

  if (!reliefDone) drawRasters(ctx, o, 'relief')
  drawRasters(ctx, o, 'over')

  const cands: LabelCandidate[] = []
  for (const l of labelLayers) cands.push(...collectLabels(ctx, l, frames, o, family))
  let onGround = cands
  if (o.collectPoints) {
    onGround = cands.filter((c) => c.layer.placement !== 'point')
    // Per-layer budget, best first — the density rule still holds; the
    // collisions are left to the screen, which sees every tile at once.
    const byLayer = new Map<string, LabelCandidate[]>()
    for (const c of cands) {
      if (c.layer.placement !== 'point') continue
      const list = byLayer.get(c.layer.id) ?? []
      list.push(c)
      byLayer.set(c.layer.id, list)
    }
    const out: LabelCandidate[] = []
    for (const list of byLayer.values()) {
      list.sort((a, b) => b.priority - a.priority)
      const n = list[0]?.budget ?? list.length
      out.push(...list.slice(0, n))
    }
    o.collectPoints(out)
  }
  const kept = o.groundLabels === false ? [] : placeLabels(onGround, o.width, o.height, 2, o.pixelScale)
  for (const c of kept) drawLabel(ctx, c, o, family)
}
