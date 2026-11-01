// ─── useSketchInput ───────────────────────────────────────────────────────────
// Pen, finger, mouse and keyboard to strokes and camera moves.
//
// Under load this is the part that must not fall behind, so a pointer event only
// appends to an array. The GPU buffer is rebuilt at most once a frame, and a main
// thread that stalls costs frames, never samples: the browser hands the missed
// ones back through getCoalescedEvents.

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { pushRecent } from '../../lib/sketch/brushes'
import { activePage, addStrokes, mapLayerStrokes, newId, removeStrokes } from '../../lib/sketch/document'
import { eraseAround, mapStroke, mirrorMaps, recognizeShape, reshapeStroke, strokeInLasso, translateBy, type Point2 } from '../../lib/sketch/edit'
import { actionForKey } from '../../lib/sketch/keymap'
import { GestureArbiter, type Contact, type GestureAction } from '../../lib/sketch/gestures'
import { applyTip, findEndpointSnap, finishStroke, readTilt, sampleWeight, Stabilizer } from '../../lib/sketch/ink'
import { facingAxis } from '../../lib/sketch/filters'
import { add, dot, presetPlane, scale, sub } from '../../lib/sketch/plane'
import { pointInPolygon } from '../../lib/sketch/edit'
import type { SketchDoc, SketchPlane, Stroke, Vec3 } from '../../lib/sketch/types'
import { useSketchStore, type SketchTool } from '../../stores/sketchStore'
import { deleteSelection, endMeeting, orbitBy, rollBy, stepPage, panBy, pickColorAt, selectedStrokes, setPlane, syncSelection, zoomBy } from './actions'

const STRAIGHTEN_MS = 480
const STRAIGHTEN_SLOP_PX = 5
const ERASER_RADIUS_PX = 16
const SNAP_RADIUS_PX = 10
const ANCHOR_RADIUS_PX = 18
const RESHAPE_RADIUS_PX = 70
/** Touch and hold samples a colour, once fingers navigate. As in Procreate. */
const LONG_PRESS_MS = 520
const LONG_PRESS_SLOP_PX = 8
const AXIS_SNAP = Math.sin((5 * Math.PI) / 180)
/** A stroke this long is committed and carries on: one frame must stay cheap. */
const MAX_LIVE_POINTS = 12000
const PEN_INFO_MS = 120
/** The pencil widens as it lies down, like the side of a lead. */
const PENCIL_TILT_GAIN = 1.6

interface Live {
  samples: number[]
  tool: Exclude<SketchTool, 'eraser' | 'pick' | 'lasso' | 'picker' | 'reshape' | 'laser'>
  opacity: number
  /** A recognized shape: the pen no longer changes it. */
  frozen: boolean
  color: string
  width: number
  straight: boolean
  stabilizer: Stabilizer
  weight: number | null
  lastX: number
  lastY: number
  lastT: number
  /** Where the pen really is: the stabilized line catches up with it on lift. */
  penX: number
  penY: number
}

const store = useSketchStore

/** Only where text goes do keys belong to the field: a slider must not kill the shortcuts. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT') return true
  return el?.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'file'].includes((el as HTMLInputElement).type)
}

function snapToAxes(start: Vec3, end: Vec3, p: SketchPlane): Vec3 {
  const d = sub(end, start)
  const a = dot(d, p.u)
  const b = dot(d, p.v)
  const len = Math.hypot(a, b)
  if (len < 1e-6) return end
  if (Math.abs(b) / len < AXIS_SNAP) return add(start, scale(p.u, a))
  if (Math.abs(a) / len < AXIS_SNAP) return add(start, scale(p.v, b))
  return end
}

export interface SketchInputHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerLeave: () => void
}

export function useSketchInput(boxRef: RefObject<HTMLElement>, ringRef: RefObject<HTMLElement>, lassoRef: RefObject<SVGPolylineElement>, tx: (key: string) => string): SketchInputHandlers {
  const arbiter = useRef(new GestureArbiter())
  const live = useRef<Live | null>(null)
  const liveDirty = useRef(false)
  /** The document before a sweep or a move: the whole gesture is one undo step. */
  const sweepBase = useRef<SketchDoc | null>(null)
  const lastEnd = useRef<Vec3 | null>(null)
  const lasso = useRef<Point2[] | null>(null)
  const moveFrom = useRef<Vec3 | null>(null)

  /**
   * Before a stroke lands: the plane the user would have chosen. The axis most
   * facing them if on auto, and through the line end the pen started on, so the
   * next wall grows out of the corner instead of floating somewhere behind it.
   */
  const alignPlaneForStroke = (x: number, y: number): void => {
    const { engine, autoPlane, anchorStart, plane } = store.getState()
    if (!engine) return
    let next = plane
    if (autoPlane) next = presetPlane(facingAxis(engine.viewDirection()), next.origin)
    if (anchorStart) {
      const hit = findEndpointSnap(x, y, engine.endpointCandidates(), ANCHOR_RADIUS_PX)
      if (hit) next = { ...next, origin: hit.world }
    }
    if (next !== plane) setPlane(next)
  }
  const reshaping = useRef<{ id: string; index: number } | null>(null)
  const longPress = useRef(0)

  /** The stroke point closest on screen, on a layer that may be edited. */
  const nearestStrokePoint = (x: number, y: number): { id: string; index: number } | null => {
    const { engine, history } = store.getState()
    if (!engine) return null
    let best: { id: string; index: number } | null = null
    let bestDistance = 28
    for (const layer of activePage(history.present).layers) {
      if (!layer.visible || layer.locked) continue
      for (const st of layer.strokes) {
        for (let i = 0; i < st.points.length; i += 4) {
          const p = engine.project([st.points[i], st.points[i + 1], st.points[i + 2]])
          if (!p) continue
          const d = Math.hypot(p.x - x, p.y - y)
          if (d < bestDistance) { bestDistance = d; best = { id: st.id, index: i / 4 } }
        }
      }
    }
    return best
  }
  const straighten = useRef(0)
  const modifier = useRef<'orbit' | 'pan' | 'zoom' | null>(null)

  const drawLasso = () => {
    const path = lassoRef.current
    if (path) path.setAttribute('points', (lasso.current ?? []).map((p) => `${p.x},${p.y}`).join(' '))
  }

  /** Is this point within the box around what is selected? */
  const overSelection = (x: number, y: number): boolean => {
    const { engine } = store.getState()
    if (!engine) return false
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const st of selectedStrokes()) {
      for (let i = 0; i < st.points.length; i += 4) {
        const p = engine.project([st.points[i], st.points[i + 1], st.points[i + 2]])
        if (!p) continue
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
      }
    }
    const box = [{ x: minX - 12, y: minY - 12 }, { x: maxX + 12, y: minY - 12 }, { x: maxX + 12, y: maxY + 12 }, { x: minX - 12, y: maxY + 12 }]
    return pointInPolygon({ x, y }, box)
  }
  const lastPenInfo = useRef(0)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const activeTouches = useRef(0)

  // The finger setting lives in the store; the arbiter also turns it off on a pen.
  useEffect(() => {
    arbiter.current.fingerDraw = store.getState().fingerDraw
    return store.subscribe((s, prev) => {
      if (s.fingerDraw !== prev.fingerDraw) arbiter.current.fingerDraw = s.fingerDraw
    })
  }, [])

  const contactOf = useCallback((e: PointerEvent): Contact => {
    const r = boxRef.current!.getBoundingClientRect()
    return {
      id: e.pointerId,
      kind: e.pointerType === 'pen' ? 'pen' : e.pointerType === 'mouse' ? 'mouse' : 'touch',
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      timeMs: e.timeStamp,
      size: Math.max(e.width || 0, e.height || 0),
      button: e.button,
      buttons: e.buttons,
      modifier: modifier.current ?? undefined,
    }
  }, [boxRef])

  /** Rebuilt once a frame at most, whatever the input rate. */
  const flushLive = useCallback(() => {
    const engine = store.getState().engine
    if (!engine || !liveDirty.current) return
    liveDirty.current = false
    const l = live.current
    if (!l || l.samples.length === 0) { engine.setLive([]); return }
    const stroke: Stroke = { id: 'live', brush: l.tool === 'line' ? 'pen' : l.tool, color: l.color, width: l.width, opacity: l.opacity, points: Float32Array.from(l.samples) }
    const { plane, symmetry } = store.getState()
    engine.setLive([stroke, ...mirrorMaps(plane, symmetry).map((f, i) => mapStroke(stroke, f, `live-${i}`))], false)
  }, [])

  useEffect(() => {
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.engine !== prev.engine && s.engine) s.engine.onBeforeFrame = flushLive
    })
    const engine = store.getState().engine
    if (engine) engine.onBeforeFrame = flushLive
    return unsubscribe
  }, [flushLive])

  const markLive = () => {
    liveDirty.current = true
    store.getState().engine?.invalidate()
  }

  const extend = useCallback((x: number, y: number, t: number, e: PointerEvent) => {
    const l = live.current
    const { engine, ink, plane } = store.getState()
    if (!l || !engine || l.frozen) return
    l.penX = x
    l.penY = y
    const at = l.straight ? { x, y } : l.stabilizer.push(x, y)
    const hit = engine.hitPlane(at.x, at.y)
    if (!hit) return
    const speed = Math.hypot(x - l.lastX, y - l.lastY) / Math.max(1, t - l.lastT)
    l.lastT = t
    l.weight = sampleWeight(e.pointerType, e.pressure, speed, ink.curve, l.weight, ink.curvePoint)
    const weight = l.tool === 'pencil' ? l.weight * (1 + readTilt(e) * PENCIL_TILT_GAIN) : l.weight
    if (l.straight && l.samples.length >= 4) {
      const start: Vec3 = [l.samples[0], l.samples[1], l.samples[2]]
      const end = snapToAxes(start, hit, plane)
      l.samples = [start[0], start[1], start[2], l.samples[3], end[0], end[1], end[2], weight]
      return
    }
    l.samples.push(hit[0], hit[1], hit[2], weight)
  }, [])

  const armStraighten = useCallback(() => {
    window.clearTimeout(straighten.current)
    straighten.current = window.setTimeout(() => {
      const l = live.current
      if (!l || l.straight || l.samples.length < 8) return
      const { plane } = store.getState()
      const shape = recognizeShape(l.samples, plane)
      l.straight = true
      if (shape.kind === 'line') {
        const start: Vec3 = [l.samples[0], l.samples[1], l.samples[2]]
        const n = l.samples.length
        const end = snapToAxes(start, [l.samples[n - 4], l.samples[n - 3], l.samples[n - 2]], plane)
        l.samples = [start[0], start[1], start[2], l.samples[3], end[0], end[1], end[2], l.samples[n - 1]]
      } else {
        l.samples = shape.points
        l.frozen = true
      }
      markLive()
      navigator.vibrate?.(8)
    }, STRAIGHTEN_MS)
  }, [])

  /** Join the ends to nearby endpoints, or close the shape on its own start. */
  const snapEnds = (samples: Float32Array): void => {
    const { engine, snapEnds: enabled } = store.getState()
    if (!engine || !enabled || samples.length < 8) return
    const n = samples.length / 4
    const candidates = engine.endpointCandidates()
    const startWorld: Vec3 = [samples[0], samples[1], samples[2]]
    const write = (i: number, world: Vec3) => { samples[i * 4] = world[0]; samples[i * 4 + 1] = world[1]; samples[i * 4 + 2] = world[2] }
    const startScreen = engine.project(startWorld)
    if (startScreen) {
      const hit = findEndpointSnap(startScreen.x, startScreen.y, candidates, SNAP_RADIUS_PX)
      if (hit) write(0, hit.world)
    }
    const endScreen = engine.project([samples[(n - 1) * 4], samples[(n - 1) * 4 + 1], samples[(n - 1) * 4 + 2]])
    if (endScreen) {
      // A tiny mark is not a shape to close.
      const own = n > 12 && startScreen ? [{ x: startScreen.x, y: startScreen.y, world: [samples[0], samples[1], samples[2]] as const }] : []
      const hit = findEndpointSnap(endScreen.x, endScreen.y, [...candidates, ...own], SNAP_RADIUS_PX)
      if (hit) write(n - 1, hit.world)
    }
  }

  const commitLive = useCallback((restart = false) => {
    window.clearTimeout(straighten.current)
    const l = live.current
    const { engine, ink, edit, flash } = store.getState()
    if (!engine) return
    live.current = null
    liveDirty.current = false
    if (!l || l.samples.length === 0) { engine.setLive([]); return }
    // The stabilizer trails the pen: finish where the pen actually lifted.
    if (!l.straight && !restart) {
      const hit = engine.hitPlane(l.penX, l.penY)
      if (hit) l.samples.push(hit[0], hit[1], hit[2], l.samples[l.samples.length - 1])
    }
    const raw = Float32Array.from(l.samples)
    if (!l.frozen) snapEnds(raw)
    const points = finishStroke(raw, engine.worldPerPixel(), restart ? { ...ink, exitTaper: 0 } : ink, l.straight)
    const { plane, symmetry, recent, setPrefs } = store.getState()
    const tipped = l.frozen ? [points] : applyTip(points, ink.tip ?? 'round', plane, engine.worldPerPixel(), l.width)
    const base = tipped.map((p): Stroke => ({ id: newId(), brush: l.tool === 'line' ? 'pen' : l.tool as Stroke['brush'], color: l.color, width: l.width, opacity: l.opacity, points: p }))
    const all = [...base, ...base.flatMap((stroke) => mirrorMaps(plane, symmetry).map((f) => mapStroke(stroke, f, newId())))]
    if (edit((doc) => addStrokes(doc, all))) {
      lastEnd.current = [points[points.length - 4], points[points.length - 3], points[points.length - 2]]
      if (recent[0] !== l.color) setPrefs({ recent: pushRecent(recent, l.color) })
    } else flash(tx('layers.locked'))
    engine.setLive([])
    if (restart) {
      const n = l.samples.length
      live.current = { ...l, samples: l.samples.slice(n - 4) }
    }
  }, [tx])

  const eraseAt = useCallback((x: number, y: number) => {
    const { engine, touch, eraser } = store.getState()
    if (!engine) return
    if (engine.strokesAt(x, y, ERASER_RADIUS_PX).length === 0) return
    if (eraser === 'stroke') {
      const ids = engine.strokesAt(x, y, ERASER_RADIUS_PX)
      touch((doc) => removeStrokes(doc, new Set(ids)))
    } else {
      touch((doc) => mapLayerStrokes(doc, (strokes) => eraseAround(strokes, x, y, ERASER_RADIUS_PX, (p) => engine.project(p))))
    }
  }, [])

  const run = useCallback((actions: GestureAction[], event?: PointerEvent) => {
    const s = store.getState()
    const { engine } = s
    const box = boxRef.current
    if (!engine || !box) return
    for (const action of actions) {
      switch (action.type) {
        case 'pen-detected':
          s.set({ usingPen: true })
          s.setPrefs({ fingerDraw: false })
          break
        case 'draw-start': {
          const { x, y, buttons, button } = action.contact
          // The other end of the pen is an eraser, whatever tool is in hand.
          const eraserEnd = action.contact.kind === 'pen' && (button === 5 || ((buttons ?? 0) & 32) !== 0)
          const current = eraserEnd ? 'eraser' : s.tool
          if (current === 'pick') {
            const result = engine.pick(x, y, s.plane)
            if (result) {
              setPlane(result.plane)
              s.flash(tx(result.kind === 'surface' ? 'plane.pickedSurface' : 'plane.picked'))
              s.setPrefs({ tool: 'pen' })
            } else s.flash(tx('plane.pickNothing'))
            break
          }
          if (current === 'laser') {
            s.set({ laser: { x: x / box.clientWidth, y: y / box.clientHeight } })
            break
          }
          if (current === 'reshape') {
            const found = nearestStrokePoint(x, y)
            const hit = engine.hitPlane(x, y)
            if (found && hit) {
              sweepBase.current = s.history.present
              moveFrom.current = hit
              reshaping.current = found
            }
            break
          }
          if (current === 'picker') {
            pickColorAt(x, y)
            break
          }
          if (current === 'lasso') {
            const hit = engine.hitPlane(x, y)
            if (s.selection.length && hit && overSelection(x, y)) {
              // Inside the selection: this drag moves it, as one undo step.
              sweepBase.current = s.history.present
              moveFrom.current = hit
            } else {
              s.set({ selection: [] })
              syncSelection()
              lasso.current = [{ x, y }]
              drawLasso()
            }
            break
          }
          s.set({ drawing: true })
          if (current !== 'eraser') alignPlaneForStroke(x, y)
          if (current === 'eraser') {
            sweepBase.current = s.history.present
            eraseAt(x, y)
            break
          }
          const t = action.contact.timeMs
          live.current = {
            samples: [], tool: current, color: s.color, width: s.width, opacity: s.opacity, frozen: false, straight: current === 'line',
            stabilizer: new Stabilizer(s.ink.stabilizer), weight: null, lastX: x, lastY: y, lastT: t, penX: x, penY: y,
          }
          // Shift: a straight line from where the last stroke ended.
          if (event?.shiftKey && lastEnd.current) {
            const e = lastEnd.current
            live.current.samples.push(e[0], e[1], e[2], 0.7)
            live.current.straight = true
          }
          if (event) extend(x, y, t, event)
          if (current === 'line' && live.current.samples.length === 4) live.current.samples.push(...live.current.samples)
          markLive()
          if (current !== 'line') armStraighten()
          break
        }
        case 'draw-move': {
          const { x, y, timeMs } = action.contact
          if (store.getState().tool === 'laser' && s.laser) {
            s.set({ laser: { x: x / box.clientWidth, y: y / box.clientHeight } })
            break
          }
          if (reshaping.current && moveFrom.current) {
            const hit = engine.hitPlane(x, y)
            if (hit) {
              const delta = sub(hit, moveFrom.current)
              moveFrom.current = hit
              const { id, index } = reshaping.current
              const radius = engine.worldPerPixel() * RESHAPE_RADIUS_PX
              s.touch((doc) => mapLayerStrokes(doc, (strokes) => (strokes.some((st) => st.id === id) ? strokes.map((st) => (st.id === id ? reshapeStroke(st, index, delta, radius) : st)) : strokes)))
            }
            break
          }
          if (lasso.current) { lasso.current.push({ x, y }); drawLasso(); break }
          if (moveFrom.current) {
            const hit = engine.hitPlane(x, y)
            if (hit) {
              const delta = sub(hit, moveFrom.current)
              moveFrom.current = hit
              const ids = new Set(s.selection)
              s.touch((doc) => mapLayerStrokes(doc, (strokes) => (strokes.some((st) => ids.has(st.id)) ? strokes.map((st) => (ids.has(st.id) ? mapStroke(st, translateBy(delta)) : st)) : strokes)))
              syncSelection()
            }
            break
          }
          if (sweepBase.current) { eraseAt(x, y); break }
          const l = live.current
          if (!l || !event) break
          const samples = event.getCoalescedEvents?.() ?? []
          const r = box.getBoundingClientRect()
          if (samples.length > 1) for (const c of samples) extend(c.clientX - r.left, c.clientY - r.top, c.timeStamp, c)
          else extend(x, y, timeMs, event)
          if (Math.hypot(x - l.lastX, y - l.lastY) > STRAIGHTEN_SLOP_PX) {
            l.lastX = x
            l.lastY = y
            if (!l.straight) armStraighten()
          }
          if (l.samples.length / 4 > MAX_LIVE_POINTS) commitLive(true)
          markLive()
          break
        }
        case 'draw-end': {
          s.set({ drawing: false })
          if (s.laser) s.set({ laser: null })
          reshaping.current = null
          if (lasso.current) {
            const polygon = lasso.current
            lasso.current = null
            drawLasso()
            const page = activePage(s.history.present)
            const ids = page.layers.filter((l) => l.visible && !l.locked).flatMap((l) => l.strokes).filter((st) => strokeInLasso(st, polygon, (p) => engine.project(p))).map((st) => st.id)
            s.set({ selection: ids })
            syncSelection()
            break
          }
          moveFrom.current = null
          const base = sweepBase.current
          if (base) {
            sweepBase.current = null
            const swept = store.getState().history
            if (swept.present !== base) {
              // The whole sweep is one undo step, back to before it started.
              s.set({ history: { past: [...swept.past, base], present: swept.present, future: [] } })
            }
            break
          }
          commitLive()
          break
        }
        case 'draw-cancel':
          window.clearTimeout(straighten.current)
          s.set({ drawing: false })
          if (sweepBase.current) {
            const base = sweepBase.current
            sweepBase.current = null
            s.touch(() => base)
          }
          lasso.current = null
          moveFrom.current = null
          drawLasso()
          live.current = null
          liveDirty.current = false
          engine.setLive([])
          break
        case 'orbit': orbitBy(action.dx, action.dy); break
        case 'pan': panBy(action.dx, action.dy); break
        case 'zoom': zoomBy(action.factor, action.x, action.y, box.clientWidth, box.clientHeight); break
        case 'undo': s.undo(); break
        case 'redo': s.redo(); break
        case 'toggle-ui': s.set({ uiHidden: !s.uiHidden }); break
      }
    }
  }, [armStraighten, boxRef, commitLive, eraseAt, extend, tx])

  const report = (e: PointerEvent) => {
    if (e.timeStamp - lastPenInfo.current < PEN_INFO_MS) return
    lastPenInfo.current = e.timeStamp
    const previous = store.getState().pen
    store.getState().set({
      pen: {
        kind: e.pointerType, pressure: e.pressure, tilt: readTilt(e),
        // A driver in mouse mode reports exactly 0.5 for ever: that is no sensor.
        hasPressure: (previous?.kind === e.pointerType && previous.hasPressure) || (e.pointerType === 'pen' && e.pressure > 0 && e.pressure !== 0.5),
      },
    })
  }

  /** Where the brush will land, for a pen that hovers (tablets, some Pencils). */
  const moveRing = (e: PointerEvent, visible: boolean) => {
    const ring = ringRef.current
    const box = boxRef.current
    if (!ring || !box) return
    if (!visible) { ring.style.opacity = '0'; return }
    const r = box.getBoundingClientRect()
    const size = store.getState().tool === 'eraser' ? ERASER_RADIUS_PX * 2 : Math.max(6, store.getState().width + 4)
    ring.style.opacity = '1'
    ring.style.width = ring.style.height = `${size}px`
    ring.style.transform = `translate(${e.clientX - r.left - size / 2}px, ${e.clientY - r.top - size / 2}px)`
  }

  // Navigation and shortcuts from a keyboard: desk tablets, folios, laptops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = store.getState()
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase()
        if (key === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo() }
        if (key === 'y') { e.preventDefault(); s.redo() }
        if (key === 'd') { e.preventDefault(); s.set({ selection: [] }); syncSelection() }
        return
      }
      if (e.altKey) return
      if (s.meeting) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') stepPage(1)
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') stepPage(-1)
        if (e.key === 'Escape') endMeeting()
      }
      // Photoshop, Clip Studio and Krita all set opacity from the number row.
      if (/^[0-9]$/.test(e.key)) s.setPrefs({ opacity: e.key === '0' ? 1 : Number(e.key) / 10 })
      // Tab still walks the controls for anyone on them: it only hides from the drawing.
      if (e.key === 'Tab' && document.activeElement === document.body) { e.preventDefault(); s.set({ uiHidden: !s.uiHidden }) }
      if (e.key === 'Escape') { s.set({ selection: [] }); syncSelection() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection.length) deleteSelection()
      if (e.key === '?') s.setPrefs({ tab: 'file', railOpen: true })
      const action = actionForKey(e.key, s.keys)
      switch (action) {
        case null: break
        case 'swap': s.setPrefs({ color: s.colorB, colorB: s.color }); break
        case 'defaults': s.setPrefs({ color: '#17130F', colorB: '#FFFFFF' }); break
        case 'sizeDown': s.setPrefs({ width: Math.max(0.5, s.width - (s.width > 10 ? 2 : 0.5)) }); break
        case 'sizeUp': s.setPrefs({ width: Math.min(60, s.width + (s.width >= 10 ? 2 : 0.5)) }); break
        case 'rollLeft': rollBy(-Math.PI / 24); break
        case 'rollRight': rollBy(Math.PI / 24); break
        default: s.setPrefs({ tool: action })
      }
    }
    const onModifier = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      // Space pans, as everywhere. With Shift it turns, as Krita rotates its canvas;
      // with Ctrl it zooms, as in Clip Studio and Photoshop.
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest?.('button,a,[role=slider]')) {
        e.preventDefault()
        modifier.current = e.type === 'keydown' ? (e.shiftKey ? 'orbit' : e.ctrlKey || e.metaKey ? 'zoom' : 'pan') : null
      }
      if (e.key === 'Alt') e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onModifier)
    window.addEventListener('keyup', onModifier)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onModifier)
      window.removeEventListener('keyup', onModifier)
    }
  }, [])

  return {
    onPointerDown: (e) => {
      e.preventDefault()
      // Capture can refuse a pointer that has just gone; the stroke still has to start.
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* moves stay on the box */ }
      // Back to the drawing: a control keeping focus would swallow Space and Tab.
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      store.getState().set({ sheetOpen: false })
      report(e.nativeEvent)
      moveRing(e.nativeEvent, false)
      // Alt samples a colour in Clip Studio and Photoshop, whatever tool is in hand.
      if (e.altKey) {
        const r = boxRef.current!.getBoundingClientRect()
        pickColorAt(e.clientX - r.left, e.clientY - r.top)
        return
      }
      window.clearTimeout(longPress.current)
      if (e.pointerType === 'touch' && !arbiter.current.fingerDraw) {
        const r = boxRef.current!.getBoundingClientRect()
        const x = e.clientX - r.left, y = e.clientY - r.top
        pressStart.current = { x: e.clientX, y: e.clientY }
        longPress.current = window.setTimeout(() => { pickColorAt(x, y); navigator.vibrate?.(8) }, LONG_PRESS_MS)
      } else if (e.pointerType === 'touch') pressStart.current = null
      // A second contact is a gesture, not a held finger.
      if (activeTouches.current++ > 0) window.clearTimeout(longPress.current)
      run(arbiter.current.down(contactOf(e.nativeEvent)), e.nativeEvent)
    },
    onPointerMove: (e) => {
      const n = e.nativeEvent
      if (pressStart.current && Math.hypot(n.clientX - pressStart.current.x, n.clientY - pressStart.current.y) > LONG_PRESS_SLOP_PX) window.clearTimeout(longPress.current)
      if (n.pointerType === 'pen') report(n)
      moveRing(n, n.pointerType === 'pen' && n.buttons === 0)
      run(arbiter.current.move(contactOf(n)), n)
    },
    onPointerUp: (e) => { activeTouches.current = Math.max(0, activeTouches.current - 1); window.clearTimeout(longPress.current); run(arbiter.current.up(contactOf(e.nativeEvent)), e.nativeEvent) },
    onPointerCancel: (e) => { activeTouches.current = Math.max(0, activeTouches.current - 1); window.clearTimeout(longPress.current); run(arbiter.current.cancel({ id: e.pointerId })) },
    onPointerLeave: () => { const ring = ringRef.current; if (ring) ring.style.opacity = '0' },
  }
}

