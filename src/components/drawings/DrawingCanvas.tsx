// ─── The sheet canvas ─────────────────────────────────────────────────────────
// A 2D canvas in MODEL space (metres, IFC XY): every visible sheet is drawn
// through its placement, so a plan cut from the IFC and an aligned PDF coincide.
// Paths are cached per layer and rebuilt only when a sheet changes, relative to
// the sheet's centre, because a georeferenced DXF's coordinates would otherwise
// lose all precision in the browser's float paths.

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { useDrawingStore } from '../../stores/drawingStore'
import {
  drawingBounds, entityPolylines, placementFromPairs, robustBounds, shownEntities, toDrawing, toModel,
  type Drawing, type Entity, type NewEntity, type Pt, type TextEntity,
} from '../../lib/drawing/types'

export interface LiveMarker { x: number; y: number; label: string; color: string }

export interface CanvasHandle { fit(): void }

interface Props {
  markers?: readonly LiveMarker[]
  /** Where the 3D camera stands, in model XY, and which way it looks. */
  camera?: { x: number; y: number; dx: number; dy: number } | null
  /** Asks for a text or a length; the dock owns the small form. */
  onAskText(at: Pt): void
  onAskLength(unitsBetween: number, a: Pt, b: Pt): void
  formatLength(metres: number): string
}

interface LayerPaths { stroke: Map<string, Path2D>; fill: Map<string, Path2D>; texts: TextEntity[]; cx: number; cy: number }

const pathCache = new WeakMap<Entity[], Map<string, LayerPaths>>()

function pathsFor(d: Drawing): Map<string, LayerPaths> {
  let byLayer = pathCache.get(d.entities)
  if (byLayer) return byLayer
  byLayer = new Map()
  const b = drawingBounds(d)
  const cx = b ? (b.minX + b.maxX) / 2 : 0
  const cy = b ? (b.minY + b.maxY) / 2 : 0
  for (const e of d.entities) {
    let lp = byLayer.get(e.layer)
    if (!lp) { lp = { stroke: new Map(), fill: new Map(), texts: [], cx, cy }; byLayer.set(e.layer, lp) }
    const key = e.color ?? ''
    if (e.kind === 'text') { lp.texts.push(e); continue }
    if (e.kind === 'fill') {
      let p = lp.fill.get(key); if (!p) { p = new Path2D(); lp.fill.set(key, p) }
      e.points.forEach((q, i) => (i ? p!.lineTo(q.x - cx, q.y - cy) : p!.moveTo(q.x - cx, q.y - cy)))
      p.closePath()
      continue
    }
    let p = lp.stroke.get(key); if (!p) { p = new Path2D(); lp.stroke.set(key, p) }
    if (e.kind === 'circle') { p.moveTo(e.c.x - cx + e.r, e.c.y - cy); p.arc(e.c.x - cx, e.c.y - cy, e.r, 0, Math.PI * 2) } else if (e.kind === 'arc') {
      p.moveTo(e.c.x - cx + e.r * Math.cos(e.start), e.c.y - cy + e.r * Math.sin(e.start))
      p.arc(e.c.x - cx, e.c.y - cy, e.r, e.start, e.end)
    } else if (e.kind === 'point') { p.rect(e.at.x - cx, e.at.y - cy, 0, 0) } else {
      for (const pl of entityPolylines(e)) {
        pl.points.forEach((q, i) => (i ? p!.lineTo(q.x - cx, q.y - cy) : p!.moveTo(q.x - cx, q.y - cy)))
        if (pl.closed) p.closePath()
      }
    }
  }
  pathCache.set(d.entities, byLayer)
  return byLayer
}

const snapCache = new WeakMap<Entity[], { cell: number; grid: Map<string, Pt[]> }>()

function snapGrid(d: Drawing) {
  let g = snapCache.get(d.entities)
  if (g) return g
  const b = robustBounds(d)
  const cell = Math.max(((b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) : 1) || 1) / 128, 1e-6)
  const grid = new Map<string, Pt[]>()
  const add = (p: Pt) => {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
    const l = grid.get(k); if (l) l.push(p); else grid.set(k, [p])
  }
  for (const e of d.entities) {
    if (e.kind === 'line') { add(e.a); add(e.b) } else if (e.kind === 'polyline' || e.kind === 'fill') e.points.forEach(add)
    else if (e.kind === 'circle') add(e.c)
    else if (e.kind === 'arc') {
      add(e.c)
      add({ x: e.c.x + e.r * Math.cos(e.start), y: e.c.y + e.r * Math.sin(e.start) })
      add({ x: e.c.x + e.r * Math.cos(e.end), y: e.c.y + e.r * Math.sin(e.end) })
    } else if (e.kind === 'point' || e.kind === 'text') add(e.at)
  }
  g = { cell, grid }
  snapCache.set(d.entities, g)
  return g
}

const images = new Map<string, HTMLImageElement>()

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x; const dy = b.y - a.y
  const l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/** The nearest unlocked entity within `tol` drawing units. */
export function hitEntity(d: Pick<Drawing, 'entities' | 'layers'>, p: Pt, tol: number): Entity | null {
  const open = new Set(d.layers.filter((l) => l.visible && !l.locked).map((l) => l.name))
  let best: Entity | null = null
  let bestD = tol
  for (let i = d.entities.length - 1; i >= 0; i--) {
    const e = d.entities[i]
    if (!open.has(e.layer)) continue
    let dist = Infinity
    if (e.kind === 'text') {
      const w = e.text.length * e.height * 0.6
      const c = Math.cos(-e.rotation); const s = Math.sin(-e.rotation)
      const x = c * (p.x - e.at.x) - s * (p.y - e.at.y); const y = s * (p.x - e.at.x) + c * (p.y - e.at.y)
      const x0 = e.align === 'center' ? -w / 2 : e.align === 'right' ? -w : 0
      if (x >= x0 - tol && x <= x0 + w + tol && y >= -tol && y <= e.height + tol) dist = 0
    } else if (e.kind === 'point') dist = Math.hypot(p.x - e.at.x, p.y - e.at.y)
    else if (e.kind === 'circle') dist = Math.abs(Math.hypot(p.x - e.c.x, p.y - e.c.y) - e.r)
    else {
      for (const pl of entityPolylines(e)) {
        const n = pl.points.length
        for (let k = 0; k < (pl.closed ? n : n - 1); k++) dist = Math.min(dist, distToSeg(p, pl.points[k], pl.points[(k + 1) % n]))
      }
    }
    if (dist < bestD) { bestD = dist; best = e }
  }
  return best
}

/** The same entity moved by (dx, dy). */
export function moved(e: Entity, dx: number, dy: number): Entity {
  const m = (q: Pt) => ({ x: q.x + dx, y: q.y + dy })
  switch (e.kind) {
    case 'line': return { ...e, a: m(e.a), b: m(e.b) }
    case 'polyline': case 'fill': return { ...e, points: e.points.map(m) }
    case 'circle': case 'arc': return { ...e, c: m(e.c) }
    case 'text': case 'point': return { ...e, at: m(e.at) }
  }
}

export default forwardRef<CanvasHandle, Props>(function DrawingCanvas({ markers, camera, onAskText, onAskLength, formatLength }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const view = useRef({ x: 0, y: 0, zoom: 1 }) // model point at the canvas centre; px per metre
  const size = useRef({ w: 1, h: 1, dpr: 1 })
  const pending = useRef<Pt[]>([])
  const hover = useRef<Pt | null>(null)
  const snapped = useRef(false)
  const frame = useRef(0)
  const [cursorText, setCursorText] = useState('')

  const drawings = useDrawingStore((s) => s.drawings)
  const activeId = useDrawingStore((s) => s.activeId)
  const tool = useDrawingStore((s) => s.tool)
  const selectedId = useDrawingStore((s) => s.selectedId)
  const paper = useDrawingStore((s) => s.paper)

  const latest = useRef({ drawings, activeId, tool, selectedId, paper, markers, camera })
  latest.current = { drawings, activeId, tool, selectedId, paper, markers, camera }

  const toScreen = (q: Pt): Pt => ({
    x: size.current.w / 2 + (q.x - view.current.x) * view.current.zoom,
    y: size.current.h / 2 - (q.y - view.current.y) * view.current.zoom,
  })
  const fromScreen = (sx: number, sy: number): Pt => ({
    x: view.current.x + (sx - size.current.w / 2) / view.current.zoom,
    y: view.current.y - (sy - size.current.h / 2) / view.current.zoom,
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h, dpr } = size.current
    const L = latest.current
    const bg = L.paper ? '#ffffff' : '#1e2230'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    const ink = (c: string) => (L.paper && /^#(f[0-9a-f]|e[0-9a-f])(f[0-9a-f]|e[0-9a-f])(f[0-9a-f]|e[0-9a-f])$/i.test(c) ? '#111111' : c)
    const v = view.current
    // Active sheet last: what you edit is on top.
    const order = [...L.drawings.filter((d) => d.visible && d.id !== L.activeId), ...L.drawings.filter((d) => d.visible && d.id === L.activeId)]
    for (const d of order) {
      const p = d.placement
      const paths = pathsFor(d)
      const first = paths.values().next().value as LayerPaths | undefined
      const cx = first?.cx ?? 0; const cy = first?.cy ?? 0
      const k = v.zoom * p.scale
      const cos = Math.cos(p.rotation) * k; const sin = Math.sin(p.rotation) * k
      const o = toScreen({ x: p.x, y: p.y })
      // drawing → screen (y flips); `cx,cy` is added where a path is relative.
      const base: [number, number, number, number, number, number] = [cos * dpr, -sin * dpr, -sin * dpr, -cos * dpr, o.x * dpr, o.y * dpr]
      ctx.setTransform(...base)
      if (d.page) {
        let img = images.get(d.page.url)
        if (!img) {
          img = new Image(); img.src = d.page.url; images.set(d.page.url, img)
          img.onload = () => schedule()
        }
        if (img.complete && img.naturalWidth) {
          ctx.save()
          ctx.translate(0, d.page.height); ctx.scale(1, -1)
          if (d.id !== L.activeId) ctx.globalAlpha = 0.6
          ctx.drawImage(img, 0, 0, d.page.width, d.page.height)
          ctx.restore()
        }
      }
      ctx.transform(1, 0, 0, 1, cx, cy)
      ctx.lineWidth = 1 / k
      ctx.globalAlpha = d.id === L.activeId ? 1 : 0.75
      for (const layer of d.layers) {
        if (!layer.visible) continue
        const lp = paths.get(layer.name)
        if (!lp) continue
        for (const [c, path] of lp.fill) { ctx.fillStyle = ink(c || layer.color); ctx.fill(path) }
        for (const [c, path] of lp.stroke) { ctx.strokeStyle = ink(c || layer.color); ctx.stroke(path) }
      }
      ctx.setTransform(...base)
      for (const layer of d.layers) {
        if (!layer.visible) continue
        for (const t of paths.get(layer.name)?.texts ?? []) {
          const px = t.height * k
          if (px < 4) continue
          const s = toScreen(toModel(p, t.at))
          if (s.x < -2000 || s.x > w + 2000 || s.y < -200 || s.y > h + 200) continue
          ctx.save()
          // A fixed font size scaled down: browsers misrender fonts under a pixel, and metres make them that small.
          const fs = (t.height * 1.35) / 100
          ctx.translate(t.at.x, t.at.y); ctx.rotate(t.rotation); ctx.scale(fs, -fs)
          ctx.font = '100px Arial, sans-serif'
          ctx.textAlign = t.align
          ctx.fillStyle = ink(t.color ?? layer.color)
          ctx.fillText(t.text, 0, 0)
          ctx.restore()
        }
      }
      ctx.globalAlpha = 1
    }

    // Screen-space overlays.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const active = L.drawings.find((d) => d.id === L.activeId)
    if (active && L.selectedId !== null) {
      const e = active.entities.find((x) => x.id === L.selectedId)
      if (e) {
        ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2.5
        ctx.beginPath()
        const pls = e.kind === 'text' || e.kind === 'point'
          ? [{ points: [e.at, { x: e.at.x + (e.kind === 'text' ? e.text.length * e.height * 0.6 : 0.001), y: e.at.y }], closed: false }]
          : entityPolylines(e)
        for (const pl of pls) {
          pl.points.forEach((q, i) => { const s = toScreen(toModel(active.placement, q)); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y) })
          if (pl.closed) ctx.closePath()
        }
        ctx.stroke()
      }
    }
    const pend = pending.current
    const hv = hover.current
    if (pend.length && hv) {
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4])
      ctx.beginPath()
      if (L.tool === 'circle') { const c = toScreen(pend[0]); ctx.arc(c.x, c.y, Math.hypot(hv.x - pend[0].x, hv.y - pend[0].y) * v.zoom, 0, Math.PI * 2) } else if (L.tool === 'rect') {
        const a = toScreen(pend[0]); const b = toScreen(hv); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y)
      } else if (L.tool === 'align') {
        const a = toScreen(pend[pend.length - 1]); const b = toScreen(hv); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      } else {
        [...pend, hv].forEach((q, i) => { const s = toScreen(q); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y) })
      }
      ctx.stroke(); ctx.setLineDash([])
    }
    pend.forEach((q, i) => {
      const s = toScreen(q)
      ctx.fillStyle = L.tool === 'align' ? (i % 2 ? '#4cc38a' : '#ff5a5a') : '#ffb020'
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill()
    })
    if (hv && snapped.current) {
      const s = toScreen(hv)
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 1.5
      ctx.strokeRect(s.x - 5, s.y - 5, 10, 10)
    }
    // Live data, then the camera: they sit on top of every sheet.
    ctx.font = '11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    for (const m of L.markers ?? []) {
      const s = toScreen(m)
      ctx.fillStyle = m.color
      ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = L.paper ? '#000' : '#fff'; ctx.lineWidth = 1; ctx.stroke()
      if (m.label) {
        const tw = ctx.measureText(m.label).width
        ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(s.x + 8, s.y - 8, tw + 8, 16)
        ctx.fillStyle = '#fff'; ctx.fillText(m.label, s.x + 12, s.y + 4)
      }
    }
    if (L.camera) {
      const s = toScreen(L.camera)
      const a = Math.atan2(-L.camera.dy, L.camera.dx)
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a)
      ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-6, 6); ctx.lineTo(-3, 0); ctx.lineTo(-6, -6); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
  }, [])

  const schedule = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => { frame.current = 0; draw() })
  }, [draw])

  const fit = useCallback(() => {
    const { drawings: all, activeId: id } = latest.current
    const list = all.filter((d) => d.visible && (id ? d.id === id : true))
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
    for (const d of list.length ? list : all) {
      const b = robustBounds({ entities: shownEntities(d.entities, d.layers), page: d.page })
      if (!b) continue
      for (const q of [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]) {
        const m = toModel(d.placement, q)
        minX = Math.min(minX, m.x); minY = Math.min(minY, m.y); maxX = Math.max(maxX, m.x); maxY = Math.max(maxY, m.y)
      }
    }
    if (minX === Infinity) return
    view.current = {
      x: (minX + maxX) / 2, y: (minY + maxY) / 2,
      zoom: Math.min(size.current.w / Math.max(maxX - minX, 1e-6), size.current.h / Math.max(maxY - minY, 1e-6)) * 0.92,
    }
    schedule()
  }, [schedule])

  useImperativeHandle(ref, () => ({ fit }), [fit])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = box.getBoundingClientRect()
      size.current = { w: Math.max(r.width, 1), h: Math.max(r.height, 1), dpr }
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      draw()
    })
    ro.observe(box)
    return () => { ro.disconnect(); cancelAnimationFrame(frame.current); frame.current = 0 }
  }, [draw])

  useEffect(schedule, [drawings, activeId, selectedId, paper, tool, markers, camera, schedule])
  useEffect(() => { pending.current = []; schedule() }, [tool, activeId, schedule])
  useEffect(() => { fit() }, [activeId, fit]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Nearest endpoint of any visible sheet within 10 px, in model space. */
  const snapPoint = (m: Pt): { p: Pt; hit: boolean } => {
    const radius = 10 / view.current.zoom
    let best: Pt | null = null
    let bestD = radius
    for (const d of latest.current.drawings) {
      if (!d.visible || !d.entities.length) continue
      const local = toDrawing(d.placement, m)
      const g = snapGrid(d)
      const reach = Math.ceil(radius / d.placement.scale / g.cell)
      const cx = Math.floor(local.x / g.cell); const cy = Math.floor(local.y / g.cell)
      if (reach > 4) continue
      for (let i = -reach; i <= reach; i++) {
        for (let j = -reach; j <= reach; j++) {
          for (const q of g.grid.get(`${cx + i},${cy + j}`) ?? []) {
            const w = toModel(d.placement, q)
            const dist = Math.hypot(w.x - m.x, w.y - m.y)
            if (dist < bestD) { bestD = dist; best = w }
          }
        }
      }
    }
    return best ? { p: best, hit: true } : { p: m, hit: false }
  }

  const activeSheet = () => latest.current.drawings.find((d) => d.id === latest.current.activeId)

  /** Finish a multi-click shape in model space, written in the sheet's own units. */
  const commit = (points: Pt[], closed = false) => {
    const s = useDrawingStore.getState()
    const d = activeSheet()
    if (!d) return
    const layer = s.activeLayer ?? d.layers[0]?.name ?? '0'
    const local = points.map((q) => toDrawing(d.placement, q))
    const base = { layer, color: null }
    const list: NewEntity[] = []
    switch (s.tool) {
      case 'line': list.push({ ...base, kind: 'line', a: local[0], b: local[1] }); break
      case 'polyline': if (local.length >= 2) list.push({ ...base, kind: 'polyline', points: local, closed }); break
      case 'rect': {
        const [a, b] = local
        list.push({ ...base, kind: 'polyline', closed: true, points: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] })
        break
      }
      case 'circle': list.push({ ...base, kind: 'circle', c: local[0], r: Math.hypot(local[1].x - local[0].x, local[1].y - local[0].y) }); break
      case 'dimension': {
        const [a, b] = local
        const real = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
        const tick = len * 0.015
        const h = len * 0.03
        let rot = Math.atan2(b.y - a.y, b.x - a.x)
        if (rot > Math.PI / 2 || rot < -Math.PI / 2) rot += Math.PI
        list.push({ ...base, kind: 'line', a, b })
        list.push({ ...base, kind: 'line', a: { x: a.x - n.x * tick, y: a.y - n.y * tick }, b: { x: a.x + n.x * tick, y: a.y + n.y * tick } })
        list.push({ ...base, kind: 'line', a: { x: b.x - n.x * tick, y: b.y - n.y * tick }, b: { x: b.x + n.x * tick, y: b.y + n.y * tick } })
        list.push({ ...base, kind: 'text', at: { x: (a.x + b.x) / 2 + n.x * tick, y: (a.y + b.y) / 2 + n.y * tick }, height: h, rotation: rot, text: formatLength(real), align: 'center' })
        break
      }
    }
    if (list.length) s.addEntities(d.id, list)
  }

  const dragging = useRef<{ kind: 'pan' | 'move'; sx: number; sy: number; vx: number; vy: number; origin?: Pt; moved?: boolean } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const lastClick = useRef(0)

  const localXY = (e: React.PointerEvent | React.WheelEvent | React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId)
    boxRef.current?.focus({ preventScroll: true })
    const { x, y } = localXY(e)
    pointers.current.set(e.pointerId, { x, y })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.current.zoom }
      dragging.current = null
      return
    }
    const s = useDrawingStore.getState()
    const panIt = s.tool === 'pan' || e.button === 1 || e.button === 2
    if (panIt) { dragging.current = { kind: 'pan', sx: x, sy: y, vx: view.current.x, vy: view.current.y }; return }
    const d = activeSheet()
    const raw = fromScreen(x, y)
    if (s.tool === 'select') {
      const hit = d ? hitEntity(d, toDrawing(d.placement, raw), 8 / view.current.zoom / d.placement.scale) : null
      s.select(hit?.id ?? null)
      dragging.current = hit
        ? { kind: 'move', sx: x, sy: y, vx: 0, vy: 0, origin: raw }
        : { kind: 'pan', sx: x, sy: y, vx: view.current.x, vy: view.current.y }
      return
    }
    if (!d) return
    const { p } = snapPoint(raw)
    if (s.tool === 'text') { onAskText(toDrawing(d.placement, p)); return }
    pending.current = [...pending.current, p]
    const pend = pending.current
    if (s.tool === 'calibrate' && pend.length === 2) {
      const units = Math.hypot(pend[1].x - pend[0].x, pend[1].y - pend[0].y) / d.placement.scale
      pending.current = []
      onAskLength(units, toDrawing(d.placement, pend[0]), toDrawing(d.placement, pend[1]))
    } else if (s.tool === 'align' && pend.length === 4) {
      // Red on this sheet, green on the target: 1, target 1, 2, target 2.
      const next = placementFromPairs(toDrawing(d.placement, pend[0]), toDrawing(d.placement, pend[2]), pend[1], pend[3])
      pending.current = []
      if (next) s.edit(d.id, () => ({ placement: next }))
      s.setTool('select')
    } else if (['line', 'rect', 'circle', 'dimension'].includes(s.tool) && pend.length === 2) {
      commit(pend)
      pending.current = []
    } else if (s.tool === 'polyline' && performance.now() - lastClick.current < 350) {
      // Pointer events carry no click count: a double click is two quick downs.
      commit(pend.slice(0, -1))
      pending.current = []
    }
    lastClick.current = performance.now()
    schedule()
  }

  const onMove = (e: React.PointerEvent) => {
    const { x, y } = localXY(e)
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x, y })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      view.current.zoom = pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(pinch.current.dist, 1))
      schedule()
      return
    }
    const drag = dragging.current
    if (drag?.kind === 'pan') {
      view.current.x = drag.vx - (x - drag.sx) / view.current.zoom
      view.current.y = drag.vy + (y - drag.sy) / view.current.zoom
      schedule()
      return
    }
    if (drag?.kind === 'move') { if (Math.hypot(x - drag.sx, y - drag.sy) > 3) drag.moved = true; hover.current = fromScreen(x, y); return }
    const s = useDrawingStore.getState()
    const raw = fromScreen(x, y)
    const needSnap = s.tool !== 'select' && s.tool !== 'pan'
    const r = needSnap ? snapPoint(raw) : { p: raw, hit: false }
    hover.current = needSnap ? r.p : null
    snapped.current = r.hit
    setCursorText(`${raw.x.toFixed(3)}, ${raw.y.toFixed(3)}`)
    if (needSnap) schedule()
  }

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const drag = dragging.current
    dragging.current = null
    if (drag?.kind === 'move' && drag.moved && drag.origin) {
      const s = useDrawingStore.getState()
      const d = activeSheet()
      const { x, y } = localXY(e)
      if (d && s.selectedId !== null) {
        const a = toDrawing(d.placement, drag.origin)
        const b = toDrawing(d.placement, fromScreen(x, y))
        const id = s.selectedId
        s.edit(d.id, (cur) => ({ entities: cur.entities.map((en) => (en.id === id ? moved(en, b.x - a.x, b.y - a.y) : en)) }))
      }
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    const { x, y } = localXY(e)
    const before = fromScreen(x, y)
    view.current.zoom *= Math.exp(-e.deltaY * 0.0015)
    const after = fromScreen(x, y)
    view.current.x += before.x - after.x
    view.current.y += before.y - after.y
    schedule()
  }

  // A native listener: these keys must not reach the 3D viewer's shortcuts on window.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onKey = (e: KeyboardEvent) => {
      const s = useDrawingStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (e.shiftKey) s.redoEdit(); else s.undoEdit(); e.preventDefault() } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { s.redoEdit(); e.preventDefault() } else if (e.key === 'Escape') {
        pending.current = []; s.select(null); if (s.tool !== 'select') s.setTool('select'); schedule()
      } else if (e.key === 'Enter' && s.tool === 'polyline' && pending.current.length >= 2) {
        commit(pending.current); pending.current = []; schedule()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId !== null && s.activeId) {
        const id = s.selectedId
        s.edit(s.activeId, (d) => ({ entities: d.entities.filter((x) => x.id !== id) }))
        s.select(null)
      } else return
      e.stopPropagation()
    }
    box.addEventListener('keydown', onKey)
    return () => box.removeEventListener('keydown', onKey)
  }, [schedule]) // eslint-disable-line react-hooks/exhaustive-deps

  const cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'
  return (
    <div ref={boxRef} tabIndex={0} className="relative flex-1 min-h-0 min-w-0 outline-none overflow-hidden" data-testid="drawing-canvas">
      <canvas
        ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ cursor, touchAction: 'none' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}
      />
      {cursorText && <span className="absolute left-2 bottom-1.5 text-[10px] font-mono pointer-events-none" style={{ color: paper ? '#555' : '#9aa3b5' }}>{cursorText}</span>}
    </div>
  )
})
