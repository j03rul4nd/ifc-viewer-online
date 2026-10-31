// ─── useSketchInput ───────────────────────────────────────────────────────────
// Pen, finger, mouse and keyboard to strokes and camera moves.
//
// Under load this is the part that must not fall behind, so a pointer event only
// appends to an array. The GPU buffer is rebuilt at most once a frame, and a main
// thread that stalls costs frames, never samples: the browser hands the missed
// ones back through getCoalescedEvents.

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { addStroke, newId, removeStrokes } from '../../lib/sketch/document'
import { GestureArbiter, type Contact, type GestureAction } from '../../lib/sketch/gestures'
import { findEndpointSnap, finishStroke, readTilt, sampleWeight, Stabilizer } from '../../lib/sketch/ink'
import { add, dot, scale, sub } from '../../lib/sketch/plane'
import type { SketchDoc, SketchPlane, Stroke, Vec3 } from '../../lib/sketch/types'
import { useSketchStore, type SketchTool } from '../../stores/sketchStore'
import { orbitBy, panBy, setPlane, zoomBy } from './actions'

const STRAIGHTEN_MS = 480
const STRAIGHTEN_SLOP_PX = 5
const ERASER_RADIUS_PX = 16
const SNAP_RADIUS_PX = 10
const AXIS_SNAP = Math.sin((5 * Math.PI) / 180)
/** A stroke this long is committed and carries on: one frame must stay cheap. */
const MAX_LIVE_POINTS = 12000
const PEN_INFO_MS = 120
/** The pencil widens as it lies down, like the side of a lead. */
const PENCIL_TILT_GAIN = 1.6

interface Live {
  samples: number[]
  tool: Exclude<SketchTool, 'eraser' | 'pick'>
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

export function useSketchInput(boxRef: RefObject<HTMLElement>, ringRef: RefObject<HTMLElement>, tx: (key: string) => string): SketchInputHandlers {
  const arbiter = useRef(new GestureArbiter())
  const live = useRef<Live | null>(null)
  const liveDirty = useRef(false)
  const eraseBase = useRef<SketchDoc | null>(null)
  const straighten = useRef(0)
  const modifier = useRef<'orbit' | 'pan' | null>(null)
  const lastPenInfo = useRef(0)

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
    if (!l || l.samples.length === 0) { engine.setLive(null); return }
    engine.setLive({ id: 'live', brush: l.tool === 'line' ? 'pen' : l.tool, color: l.color, width: l.width, points: Float32Array.from(l.samples) }, false)
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
    if (!l || !engine) return
    l.penX = x
    l.penY = y
    const at = l.straight ? { x, y } : l.stabilizer.push(x, y)
    const hit = engine.hitPlane(at.x, at.y)
    if (!hit) return
    const speed = Math.hypot(x - l.lastX, y - l.lastY) / Math.max(1, t - l.lastT)
    l.lastT = t
    l.weight = sampleWeight(e.pointerType, e.pressure, speed, ink.curve, l.weight)
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
      const n = l.samples.length
      l.straight = true
      const start: Vec3 = [l.samples[0], l.samples[1], l.samples[2]]
      const end = snapToAxes(start, [l.samples[n - 4], l.samples[n - 3], l.samples[n - 2]], store.getState().plane)
      l.samples = [start[0], start[1], start[2], l.samples[3], end[0], end[1], end[2], l.samples[n - 1]]
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
    if (!l || l.samples.length === 0) { engine.setLive(null); return }
    // The stabilizer trails the pen: finish where the pen actually lifted.
    if (!l.straight && !restart) {
      const hit = engine.hitPlane(l.penX, l.penY)
      if (hit) l.samples.push(hit[0], hit[1], hit[2], l.samples[l.samples.length - 1])
    }
    const raw = Float32Array.from(l.samples)
    snapEnds(raw)
    const points = finishStroke(raw, engine.worldPerPixel(), restart ? { ...ink, exitTaper: 0 } : ink, l.straight)
    const stroke: Stroke = { id: newId(), brush: l.tool === 'line' ? 'pen' : l.tool, color: l.color, width: l.width, points }
    if (!edit((doc) => addStroke(doc, stroke))) flash(tx('layers.locked'))
    engine.setLive(null)
    if (restart) {
      const n = l.samples.length
      live.current = { ...l, samples: l.samples.slice(n - 4) }
    }
  }, [tx])

  const eraseAt = useCallback((x: number, y: number) => {
    const { engine, touch } = store.getState()
    if (!engine) return
    const ids = engine.strokesAt(x, y, ERASER_RADIUS_PX)
    if (ids.length) touch((doc) => removeStrokes(doc, new Set(ids)))
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
          s.set({ drawing: true })
          if (current === 'eraser') {
            eraseBase.current = s.history.present
            eraseAt(x, y)
            break
          }
          const t = action.contact.timeMs
          live.current = {
            samples: [], tool: current, color: s.color, width: s.width, straight: current === 'line',
            stabilizer: new Stabilizer(s.ink.stabilizer), weight: null, lastX: x, lastY: y, lastT: t, penX: x, penY: y,
          }
          if (event) extend(x, y, t, event)
          if (current === 'line' && live.current.samples.length === 4) live.current.samples.push(...live.current.samples)
          markLive()
          if (current !== 'line') armStraighten()
          break
        }
        case 'draw-move': {
          const { x, y, timeMs } = action.contact
          if (eraseBase.current) { eraseAt(x, y); break }
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
          const base = eraseBase.current
          if (base) {
            eraseBase.current = null
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
          if (eraseBase.current) {
            const base = eraseBase.current
            eraseBase.current = null
            s.touch(() => base)
          }
          live.current = null
          liveDirty.current = false
          engine.setLive(null)
          break
        case 'orbit': orbitBy(action.dx, action.dy); break
        case 'pan': panBy(action.dx, action.dy); break
        case 'zoom': zoomBy(action.factor, action.x, action.y, box.clientWidth, box.clientHeight); break
        case 'undo': s.undo(); break
        case 'redo': s.redo(); break
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
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return
      const s = store.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') s.setPrefs({ width: Math.max(0.5, s.width - 0.5) })
      if (e.key === ']') s.setPrefs({ width: Math.min(40, s.width + 0.5) })
      const map: Record<string, SketchTool> = { p: 'pen', b: 'pencil', m: 'marker', l: 'line', e: 'eraser' }
      const next = map[e.key.toLowerCase()]
      if (next) s.setPrefs({ tool: next })
    }
    const onModifier = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return
      if (e.code === 'Space') { e.preventDefault(); modifier.current = e.type === 'keydown' ? 'pan' : null }
      if (e.key === 'Alt') { e.preventDefault(); modifier.current = e.type === 'keydown' ? 'orbit' : null }
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
      store.getState().set({ sheetOpen: false })
      report(e.nativeEvent)
      moveRing(e.nativeEvent, false)
      run(arbiter.current.down(contactOf(e.nativeEvent)), e.nativeEvent)
    },
    onPointerMove: (e) => {
      const n = e.nativeEvent
      if (n.pointerType === 'pen') report(n)
      moveRing(n, n.pointerType === 'pen' && n.buttons === 0)
      run(arbiter.current.move(contactOf(n)), n)
    },
    onPointerUp: (e) => { run(arbiter.current.up(contactOf(e.nativeEvent)), e.nativeEvent) },
    onPointerCancel: (e) => { run(arbiter.current.cancel({ id: e.pointerId })) },
    onPointerLeave: () => { const ring = ringRef.current; if (ring) ring.style.opacity = '0' },
  }
}

