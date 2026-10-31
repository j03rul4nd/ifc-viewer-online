// ─── /sketch ──────────────────────────────────────────────────────────────────
// Draw in 3D with a pen on a phone: strokes land on a plane you can move, turn
// and take from the drawing, with references beside you. Everything runs and
// stays in this browser. docs/SKETCH_STUDIO.md.
//
// The layout is read from the studio's own box on every resize, never from the
// device: closing a foldable, entering Split View and turning it around are all
// just a new size, and the camera and the drawing carry on untouched.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  activeLayer, activePage, addStroke, commit, createDoc, forgetImage, newId, placeImage, redo, removeStrokes,
  replacePresent, setPageThumb, startHistory, undo, type History,
} from '../../lib/sketch/document'
import { GestureArbiter, type Contact, type GestureAction } from '../../lib/sketch/gestures'
import { RAIL_CLEARANCE_PX, resolveStudioLayout } from '../../lib/sketch/layout'
import { add, dot, isEdgeOn, planeFromNormal, planeNormal, presetPlane, scale, sub } from '../../lib/sketch/plane'
import { DEFAULT_ORBIT, PAPER, SketchRenderer } from '../../lib/sketch/renderer'
import { OneEuro, resolvePressure, simplifyStroke } from '../../lib/sketch/stroke'
import { deleteImage, loadDoc, loadImages, readImageFile, saveDoc, saveImage } from '../../lib/sketch/storage'
import type { BrushKind, OrbitState, ReferenceImage, SketchDoc, SketchPlane, Stroke, Vec3 } from '../../lib/sketch/types'
import { readSegments, resolveDualLayout } from '../../lib/ui/display-segments'
import { StudioControls, TopBar, PageStrip, type SketchTool } from './SketchPanels'
import ReferencePane from './ReferencePane'

const SIDE_KEY = 'ifc-sketch:side'
const SWATCHES = ['#17130F', '#FFFFFF', '#C8322B', '#1F5FBF']
/** Holding still this long at the end of a stroke straightens it. */
const STRAIGHTEN_MS = 480
const STRAIGHTEN_SLOP_PX = 5
const ERASER_RADIUS_PX = 16
const AXIS_SNAP = Math.sin((5 * Math.PI) / 180)

interface LiveStroke {
  samples: number[]
  brush: BrushKind
  color: string
  width: number
  straight: boolean
  filterX: OneEuro
  filterY: OneEuro
  lastX: number
  lastY: number
  index: number
}

const contactOf = (e: PointerEvent, rect: DOMRect): Contact => ({
  id: e.pointerId,
  kind: e.pointerType === 'pen' ? 'pen' : e.pointerType === 'mouse' ? 'mouse' : 'touch',
  x: e.clientX - rect.left,
  y: e.clientY - rect.top,
  timeMs: e.timeStamp,
  size: Math.max(e.width || 0, e.height || 0),
  button: e.button,
})

export default function SketchStudio() {
  const { t, ready } = useTranslation('sketch' as never)
  const tx = t as unknown as (key: string, o?: Record<string, unknown>) => string
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<SketchRenderer | null>(null)
  const arbiterRef = useRef(new GestureArbiter())
  const liveRef = useRef<LiveStroke | null>(null)
  const eraseBaseRef = useRef<SketchDoc | null>(null)
  const straightenRef = useRef(0)

  const [history, setHistoryState] = useState<History>(() => startHistory(createDoc()))
  const historyRef = useRef(history)
  const setHistory = useCallback((next: History | ((h: History) => History)) => {
    historyRef.current = typeof next === 'function' ? next(historyRef.current) : next
    setHistoryState(historyRef.current)
  }, [])

  const [images, setImages] = useState<ReferenceImage[]>([])
  const imagesRef = useRef(images)
  imagesRef.current = images
  const [loaded, setLoaded] = useState(false)
  const [tool, setTool] = useState<SketchTool>('pen')
  const toolRef = useRef(tool)
  toolRef.current = tool
  const [color, setColor] = useState(SWATCHES[0])
  const [width, setWidth] = useState(3)
  const brushRef = useRef({ color, width })
  brushRef.current = { color, width }
  const [plane, setPlaneState] = useState<SketchPlane>(() => presetPlane('front'))
  const planeRef = useRef(plane)
  const [orbit, setOrbitState] = useState<OrbitState>(DEFAULT_ORBIT)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [panelOpen, setPanelOpen] = useState(false)
  const [refsOpen, setRefsOpen] = useState(false)
  const [railSide, setRailSide] = useState<'left' | 'right'>(() => {
    try { return localStorage.getItem(SIDE_KEY) === 'right' ? 'right' : 'left' } catch { return 'left' }
  })
  const [fingerDraw, setFingerDraw] = useState(true)
  const [usingPen, setUsingPen] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const [webglFailed, setWebglFailed] = useState(false)
  const [recording, setRecording] = useState(false)
  const [hasContext, setHasContext] = useState(false)

  const doc = history.present
  const page = activePage(doc)

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((n) => (n === message ? '' : n)), 3200)
  }, [])

  useEffect(() => { document.title = 'Sketch in 3D on your phone, free in the browser' }, [])

  // ── Bring-up ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let engine: SketchRenderer
    try {
      engine = new SketchRenderer(canvas, planeRef.current)
    } catch {
      setWebglFailed(true)
      return
    }
    engineRef.current = engine
    let alive = true
    void Promise.all([loadDoc(), loadImages()]).then(([savedDoc, savedImages]) => {
      if (!alive) return
      if (savedDoc) setHistory(startHistory(savedDoc))
      setImages(savedImages)
      setLoaded(true)
    })
    return () => {
      alive = false
      engine.dispose()
      engineRef.current = null
    }
  }, [setHistory])

  // A fold, a Split View or a rotation arrives here as a new size, nothing more.
  useEffect(() => {
    const root = rootRef.current
    const box = canvasBoxRef.current
    if (!root || !box) return
    const measure = () => {
      setSize({ width: root.clientWidth, height: root.clientHeight })
      engineRef.current?.resize(box.clientWidth, box.clientHeight)
      engineRef.current?.renderNow()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // Safari's page pinch ignores touch-action in places; the drawing surface owns gestures.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    const root = rootRef.current
    root?.addEventListener('gesturestart', stop)
    return () => root?.removeEventListener('gesturestart', stop)
  }, [])

  // ── Document to renderer ───────────────────────────────────────────────────
  useEffect(() => { engineRef.current?.syncLayers(page.layers) }, [page.layers])
  useEffect(() => { engineRef.current?.setPaper(doc.paper) }, [doc.paper])
  useEffect(() => {
    void engineRef.current?.syncPlaced(page.placed, (id) => imagesRef.current.find((i) => i.id === id)?.blob)
  }, [page.placed, images])

  // ── Saving ─────────────────────────────────────────────────────────────────
  const channelRef = useRef<BroadcastChannel | null>(null)

  const flush = useCallback(async () => {
    const ok = await saveDoc(historyRef.current.present)
    setSaveFailed(!ok)
    if (ok) channelRef.current?.postMessage('saved')
  }, [])

  useEffect(() => {
    if (!loaded) return
    const timer = window.setTimeout(() => { void flush() }, 700)
    return () => window.clearTimeout(timer)
  }, [doc, loaded, flush])

  // The system may close a window in Split View without warning: write on the way out.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && loaded) void flush() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [flush, loaded])

  // A second window of the studio: last save shows here, unless a stroke is under way.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('ifc-sketch')
    channelRef.current = channel
    channel.onmessage = () => {
      if (liveRef.current) return
      void Promise.all([loadDoc(), loadImages()]).then(([savedDoc, savedImages]) => {
        if (savedDoc) setHistory((h) => replacePresent(h, savedDoc))
        setImages(savedImages)
      })
    }
    return () => {
      channelRef.current = null
      channel.close()
    }
  }, [setHistory])

  // The strip's thumbnail follows the drawing, after it has settled.
  const pageId = page.id
  const strokeTotal = page.layers.reduce((n, l) => n + l.strokes.length, 0)
  useEffect(() => {
    if (!loaded) return
    const timer = window.setTimeout(() => {
      const engine = engineRef.current
      if (!engine || liveRef.current) return
      const thumb = engine.thumbnail()
      setHistory((h) => replacePresent(h, setPageThumb(h.present, pageId, thumb)))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [strokeTotal, pageId, doc.paper, loaded, setHistory])

  // ── Camera and plane ───────────────────────────────────────────────────────
  const applyOrbit = useCallback((next: OrbitState) => {
    engineRef.current?.setOrbit(next)
    setOrbitState(next)
  }, [])

  const setPlane = useCallback((next: SketchPlane) => {
    planeRef.current = next
    engineRef.current?.setPlane(next)
    setPlaneState(next)
  }, [])

  const orbitBy = useCallback((dx: number, dy: number) => {
    const o = engineRef.current?.orbitState
    if (!o) return
    const limit = Math.PI / 2 - 0.01
    applyOrbit({ ...o, azimuth: o.azimuth - dx * 0.0065, elevation: Math.max(-limit, Math.min(limit, o.elevation + dy * 0.0065)) })
  }, [applyOrbit])

  const cameraAxes = (o: OrbitState): { right: Vec3; up: Vec3 } => {
    const right: Vec3 = [Math.cos(o.azimuth), 0, -Math.sin(o.azimuth)]
    const up: Vec3 = [-Math.sin(o.elevation) * Math.sin(o.azimuth), Math.cos(o.elevation), -Math.sin(o.elevation) * Math.cos(o.azimuth)]
    return { right, up }
  }

  const panBy = useCallback((dx: number, dy: number) => {
    const engine = engineRef.current
    if (!engine) return
    const o = engine.orbitState
    const k = engine.worldPerPixel()
    const { right, up } = cameraAxes(o)
    applyOrbit({ ...o, target: add(add(o.target, scale(right, -dx * k)), scale(up, dy * k)) })
  }, [applyOrbit])

  const zoomBy = useCallback((factor: number, x: number, y: number) => {
    const engine = engineRef.current
    const box = canvasBoxRef.current
    if (!engine || !box) return
    const o = engine.orbitState
    const distance = Math.max(0.05, Math.min(2000, o.distance / factor))
    const before = engine.worldPerPixel()
    const after = before * (distance / o.distance)
    // Zoom about the fingers: what is under them stays under them.
    const ox = x - box.clientWidth / 2
    const oy = y - box.clientHeight / 2
    const { right, up } = cameraAxes(o)
    const shift = add(scale(right, ox * (before - after)), scale(up, -oy * (before - after)))
    applyOrbit({ ...o, distance, target: add(o.target, shift) })
  }, [applyOrbit])

  // ── Drawing ────────────────────────────────────────────────────────────────
  const showLive = useCallback(() => {
    const live = liveRef.current
    const engine = engineRef.current
    if (!engine) return
    if (!live || live.samples.length === 0) { engine.setLive(null); return }
    engine.setLive({ id: 'live', brush: live.brush, color: live.color, width: live.width, points: Float32Array.from(live.samples) })
  }, [])

  /** Snap a straight line to the plane's own axes when it is nearly along one. */
  const snapToAxes = (start: Vec3, end: Vec3, p: SketchPlane): Vec3 => {
    const d = sub(end, start)
    const a = dot(d, p.u)
    const b = dot(d, p.v)
    const len = Math.hypot(a, b)
    if (len < 1e-6) return end
    if (Math.abs(b) / len < AXIS_SNAP) return add(start, scale(p.u, a))
    if (Math.abs(a) / len < AXIS_SNAP) return add(start, scale(p.v, b))
    return end
  }

  const extendLive = useCallback((c: Contact, pressure: number, pointerType: string) => {
    const live = liveRef.current
    const engine = engineRef.current
    if (!live || !engine) return
    const x = live.straight ? c.x : live.filterX.filter(c.x, c.timeMs)
    const y = live.straight ? c.y : live.filterY.filter(c.y, c.timeMs)
    const hit = engine.hitPlane(x, y)
    if (!hit) return
    const p = resolvePressure(pointerType, pressure, live.index++)
    if (live.straight && live.samples.length >= 4) {
      const start: Vec3 = [live.samples[0], live.samples[1], live.samples[2]]
      const end = snapToAxes(start, hit, planeRef.current)
      live.samples = [start[0], start[1], start[2], live.samples[3], end[0], end[1], end[2], p]
      return
    }
    live.samples.push(hit[0], hit[1], hit[2], p)
  }, [])

  const armStraighten = useCallback(() => {
    window.clearTimeout(straightenRef.current)
    if (toolRef.current === 'eraser' || toolRef.current === 'pick') return
    straightenRef.current = window.setTimeout(() => {
      const live = liveRef.current
      if (!live || live.straight || live.samples.length < 8) return
      const n = live.samples.length
      live.straight = true
      const start: Vec3 = [live.samples[0], live.samples[1], live.samples[2]]
      const end = snapToAxes(start, [live.samples[n - 4], live.samples[n - 3], live.samples[n - 2]], planeRef.current)
      live.samples = [start[0], start[1], start[2], live.samples[3], end[0], end[1], end[2], live.samples[n - 1]]
      showLive()
      navigator.vibrate?.(8)
    }, STRAIGHTEN_MS)
  }, [showLive])

  const eraseAt = useCallback((x: number, y: number) => {
    const engine = engineRef.current
    if (!engine) return
    const ids = engine.strokesAt(x, y, ERASER_RADIUS_PX)
    if (ids.length === 0) return
    setHistory((h) => replacePresent(h, removeStrokes(h.present, new Set(ids))))
  }, [setHistory])

  const commitLive = useCallback(() => {
    window.clearTimeout(straightenRef.current)
    const live = liveRef.current
    const engine = engineRef.current
    liveRef.current = null
    if (!live || !engine || live.samples.length === 0) { engine?.setLive(null); return }
    // Half a pixel at the zoom it was drawn: invisible, and most points gone.
    const points = simplifyStroke(Float32Array.from(live.samples), engine.worldPerPixel() * 0.5)
    const stroke: Stroke = { id: newId(), brush: live.brush, color: live.color, width: live.width, points }
    const next = addStroke(historyRef.current.present, stroke)
    engine.setLive(null)
    if (next) setHistory((h) => commit(h, next))
    else flash(tx('layers.locked'))
  }, [flash, setHistory, tx])

  const run = useCallback((actions: GestureAction[], event?: PointerEvent) => {
    const engine = engineRef.current
    if (!engine) return
    for (const action of actions) {
      switch (action.type) {
        case 'pen-detected':
          setUsingPen(true)
          setFingerDraw(false)
          break
        case 'draw-start': {
          const { x, y } = action.contact
          const current = toolRef.current
          if (current === 'pick') {
            const result = engine.pick(x, y, planeRef.current)
            if (result) {
              setPlane(result.plane)
              flash(tx(result.kind === 'surface' ? 'plane.pickedSurface' : 'plane.picked'))
              setTool('pen')
            } else flash(tx('plane.pickNothing'))
            break
          }
          if (current === 'eraser') {
            eraseBaseRef.current = historyRef.current.present
            eraseAt(x, y)
            break
          }
          const { color: c, width: w } = brushRef.current
          liveRef.current = {
            samples: [], brush: current === 'line' ? 'pen' : current, color: c, width: w, straight: current === 'line',
            filterX: new OneEuro(), filterY: new OneEuro(), lastX: x, lastY: y, index: 0,
          }
          const hit = engine.hitPlane(x, y)
          const p = resolvePressure(event?.pointerType ?? 'mouse', event?.pressure ?? 0, 0)
          if (hit) {
            liveRef.current.filterX.filter(x, action.contact.timeMs)
            liveRef.current.filterY.filter(y, action.contact.timeMs)
            liveRef.current.samples.push(hit[0], hit[1], hit[2], p)
            // A line needs its far end from the first move on.
            if (current === 'line') liveRef.current.samples.push(hit[0], hit[1], hit[2], p)
          }
          showLive()
          if (current !== 'line') armStraighten()
          break
        }
        case 'draw-move': {
          const { x, y } = action.contact
          if (toolRef.current === 'eraser') { eraseAt(x, y); break }
          const live = liveRef.current
          if (!live) break
          // Pen hardware reports faster than the display: use every sample it sent.
          const samples = event?.getCoalescedEvents?.() ?? []
          const box = canvasBoxRef.current!.getBoundingClientRect()
          if (samples.length > 1 && event) {
            for (const s of samples) extendLive(contactOf(s, box), s.pressure, s.pointerType)
          } else {
            extendLive(action.contact, event?.pressure ?? 0, event?.pointerType ?? 'mouse')
          }
          if (Math.hypot(x - live.lastX, y - live.lastY) > STRAIGHTEN_SLOP_PX) {
            live.lastX = x
            live.lastY = y
            if (toolRef.current !== 'line') armStraighten()
          }
          showLive()
          break
        }
        case 'draw-end': {
          if (eraseBaseRef.current) {
            const base = eraseBaseRef.current
            eraseBaseRef.current = null
            // The whole sweep is one undo step, back to before it started.
            setHistory((h) => (h.present === base ? h : commit({ ...h, present: base }, h.present)))
            break
          }
          commitLive()
          break
        }
        case 'draw-cancel':
          window.clearTimeout(straightenRef.current)
          if (eraseBaseRef.current) {
            const base = eraseBaseRef.current
            eraseBaseRef.current = null
            setHistory((h) => replacePresent(h, base))
          }
          liveRef.current = null
          engine.setLive(null)
          break
        case 'orbit': orbitBy(action.dx, action.dy); break
        case 'pan': panBy(action.dx, action.dy); break
        case 'zoom': zoomBy(action.factor, action.x, action.y); break
        case 'undo': setHistory(undo); break
        case 'redo': setHistory(redo); break
      }
    }
  }, [armStraighten, commitLive, eraseAt, extendLive, flash, orbitBy, panBy, setHistory, setPlane, showLive, tx, zoomBy])

  const rectOf = () => canvasBoxRef.current!.getBoundingClientRect()
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    // Capture can refuse a pointer that has just gone; the stroke still has to start.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* moves stay on the canvas box */ }
    setPanelOpen(false)
    run(arbiterRef.current.down(contactOf(e.nativeEvent, rectOf())), e.nativeEvent)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    run(arbiterRef.current.move(contactOf(e.nativeEvent, rectOf())), e.nativeEvent)
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    run(arbiterRef.current.up(contactOf(e.nativeEvent, rectOf())), e.nativeEvent)
  }
  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    run(arbiterRef.current.cancel({ id: e.pointerId }))
  }

  useEffect(() => {
    const box = canvasBoxRef.current
    if (!box) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = box.getBoundingClientRect()
      zoomBy(Math.exp(-e.deltaY * 0.0012), e.clientX - r.left, e.clientY - r.top)
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  // Keyboard, for the same studio on a laptop or a folio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        setHistory(e.shiftKey ? redo : undo)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const map: Record<string, SketchTool> = { p: 'pen', b: 'pencil', m: 'marker', l: 'line', e: 'eraser' }
      const next = map[e.key.toLowerCase()]
      if (next) setTool(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setHistory])

  const toggleFingerDraw = (on: boolean) => {
    arbiterRef.current.fingerDraw = on
    setFingerDraw(on)
  }

  // ── References ─────────────────────────────────────────────────────────────
  const addImageFiles = useCallback(async (files: Iterable<File>) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const image = await readImageFile(file, newId())
      if (!image) { flash(tx('refs.tooMany')); continue }
      const ok = await saveImage(image)
      setSaveFailed(!ok)
      setImages((list) => [...list, image])
    }
    setRefsOpen(true)
  }, [flash, tx])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files
      if (files?.length) void addImageFiles(Array.from(files))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addImageFiles])

  const placeOnPlane = useCallback((image: ReferenceImage) => {
    const engine = engineRef.current
    if (!engine) return
    const height = engine.orbitState.distance * 0.45
    const width = height * (image.width / image.height)
    setHistory((h) => commit(h, placeImage(h.present, { id: newId(), imageId: image.id, plane: planeRef.current, width, height, opacity: 0.6 })))
    flash(tx('refs.placed'))
  }, [flash, setHistory, tx])

  const removeImage = useCallback((image: ReferenceImage) => {
    void deleteImage(image.id)
    setImages((list) => list.filter((i) => i.id !== image.id))
    setHistory((h) => commit(h, forgetImage(h.present, image.id)))
  }, [setHistory])

  // ── Replay ─────────────────────────────────────────────────────────────────
  const recordReplay = useCallback(async () => {
    const engine = engineRef.current
    const canvas = canvasRef.current
    if (!engine || !canvas || recording) return
    const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported?.(m))
    if (typeof MediaRecorder === 'undefined' || !mime || !canvas.captureStream) { flash(tx('export.noVideo')); return }
    setRecording(true)
    const stream = canvas.captureStream(30)
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream, { mimeType: mime })
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
    engine.setGuides(false)
    engine.reveal(0)
    engine.renderNow()
    recorder.start()
    const total = activePage(historyRef.current.present).layers.reduce((n, l) => n + l.strokes.length, 0)
    const started = performance.now()
    const duration = Math.max(2500, Math.min(12000, total * 90))
    await new Promise<void>((resolve) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - started) / duration)
        engine.reveal(Math.ceil(k * total))
        engine.renderNow()
        if (k < 1) requestAnimationFrame(step)
        else window.setTimeout(resolve, 900)
      }
      requestAnimationFrame(step)
    })
    recorder.stop()
    await stopped
    stream.getTracks().forEach((tr) => tr.stop())
    engine.reveal(null)
    engine.setGuides(true)
    setRecording(false)
    downloadBlob(new Blob(chunks, { type: mime }), `sketch-replay.${mime.includes('mp4') ? 'mp4' : 'webm'}`)
  }, [flash, recording, tx])

  // ── Layout ─────────────────────────────────────────────────────────────────
  const hardware = useMemo(() => {
    if (size.width === 0) return null
    return resolveDualLayout({
      segments: readSegments(window as unknown as Parameters<typeof readSegments>[0]),
      viewportWidth: size.width, viewportHeight: size.height, pref: 'auto', coarsePointer: false, swap: railSide === 'right',
    })
  }, [size, railSide])
  const layout = resolveStudioLayout(size.width || 390, size.height || 700, hardware)
  const docked = refsOpen && layout.paneMode !== 'floating'
  const regular = layout.density === 'regular'

  const lookAtPlane = () => {
    const engine = engineRef.current
    if (!engine) return
    const n = planeNormal(planeRef.current)
    const o = engine.orbitState
    // Come round to the side of the plane already facing us.
    const facing = dot(n, scale(engine.viewDirection(), -1)) >= 0 ? n : scale(n, -1)
    applyOrbit({
      ...o,
      target: planeRef.current.origin,
      azimuth: Math.atan2(facing[0], facing[2]),
      elevation: Math.asin(Math.max(-0.999, Math.min(0.999, facing[1]))),
    })
  }

  const planeFacingMe = () => {
    const engine = engineRef.current
    if (!engine) return
    const view = engine.viewDirection()
    setPlane(planeFromNormal(planeRef.current.origin, scale(view, -1)))
  }

  const fitAll = () => {
    const engine = engineRef.current
    const bounds = engine?.bounds()
    if (!engine || !bounds) return
    applyOrbit({ ...engine.orbitState, target: bounds.center, distance: bounds.radius * 3.4 })
  }

  const edgeOn = engineRef.current ? isEdgeOn(plane, engineRef.current.viewDirection()) : false
  const paper = PAPER[doc.paper]
  const night = doc.paper === 'night'

  // Scoped chrome colours: the tools sit on paper here, not on the viewer's dark.
  const chrome = night
    ? { '--sk-panel': 'rgba(24,25,32,.9)', '--sk-line': 'rgba(255,255,255,.1)', '--sk-text': '#ECEDEE', '--sk-dim': '#9A9CA8', '--sk-active': '#ECEDEE', '--sk-on-active': '#15161C', '--sk-soft': 'rgba(255,255,255,.08)' }
    : { '--sk-panel': 'rgba(250,246,242,.9)', '--sk-line': 'rgba(50,35,25,.14)', '--sk-text': '#241C16', '--sk-dim': '#6D5F55', '--sk-active': '#241C16', '--sk-on-active': '#FAF6F2', '--sk-soft': 'rgba(50,35,25,.07)' }

  const rootStyle = { ...chrome, background: paper.bg, color: 'var(--sk-text)', touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties

  const paneProps = {
    images, tx, onClose: () => setRefsOpen(false), onAddFiles: addImageFiles, onPlace: placeOnPlane, onDelete: removeImage,
    placed: page.placed, setHistory, engine: engineRef.current, revision: page.layers, paperBg: paper.bg,
  }

  // Docked sizes: from the hinge when there is one, from the share otherwise.
  const paneSize = layout.paneMode === 'docked-side'
    ? (hardware ? hardware.pane.width : Math.round(size.width * layout.paneShare))
    : (hardware ? hardware.pane.height : Math.round(size.height * layout.paneShare))
  const hingeGap = hardware ? (layout.paneMode === 'docked-side' ? hardware.hinge.width : hardware.hinge.height) : 0
  const paneFirst = hardware ? (layout.paneMode === 'docked-side' ? hardware.pane.x < hardware.viewer.x : hardware.pane.y < hardware.viewer.y) : railSide === 'right' && layout.paneMode === 'docked-side'
  const paneStyle = docked ? {
    flex: `0 0 ${paneSize}px`,
    [layout.paneMode === 'docked-side' ? (paneFirst ? 'marginRight' : 'marginLeft') : (paneFirst ? 'marginBottom' : 'marginTop')]: hingeGap,
    order: paneFirst ? 0 : 2,
  } : undefined

  if (webglFailed) {
    return <div className="absolute inset-0 grid place-items-center p-6 text-center bg-[var(--bg)] text-[var(--text)]">{tx('webgl')}</div>
  }

  return (
    <div
      ref={rootRef}
      data-sketch-density={layout.density}
      data-sketch-pane={layout.paneMode}
      className="absolute inset-0 overflow-hidden flex"
      style={{ ...rootStyle, flexDirection: layout.paneMode === 'docked-stack' ? 'column' : 'row' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
        if (files.length) void addImageFiles(files)
      }}
    >
      <div className="relative flex-1 min-w-0 min-h-0 order-1">
        <div
          ref={canvasBoxRef}
          className="absolute inset-0"
          style={{ touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          role="application"
          aria-label={ready ? tx('title') : undefined}
        >
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>

        <TopBar
          tx={tx} compact={!regular} refsOpen={refsOpen} onToggleRefs={() => {
            // Without room to dock, the window and the sheet would land on each other.
            if (layout.paneMode === 'floating' || !regular) setPanelOpen(false)
            setRefsOpen((o) => !o)
          }}
          canUndo={history.past.length > 0} canRedo={history.future.length > 0}
          onUndo={() => setHistory(undo)} onRedo={() => setHistory(redo)}
          saveFailed={saveFailed}
        />

        <StudioControls
          tx={tx} regular={regular} railSide={railSide} open={panelOpen} setOpen={(next) => {
            setPanelOpen(next)
            if (!docked) setRefsOpen(false)
          }}
          short={layout.short}
          tool={tool} setTool={setTool} color={color} setColor={setColor} swatches={SWATCHES} width={width} setWidth={setWidth}
          plane={plane} setPlane={setPlane} planeFacingMe={planeFacingMe} lookAtPlane={lookAtPlane}
          orbit={orbit} setOrbit={applyOrbit} orbitBy={orbitBy} fitAll={fitAll}
          doc={doc} setHistory={setHistory} activeLayerId={activeLayer(page).id}
          engine={engineRef.current} fingerDraw={fingerDraw} setFingerDraw={toggleFingerDraw}
          setRailSide={(side) => {
            setRailSide(side)
            try { localStorage.setItem(SIDE_KEY, side) } catch { /* private mode */ }
          }}
          flash={flash} recording={recording} onRecord={recordReplay} hasContext={hasContext} setHasContext={setHasContext}
          onSaveView={() => {
            const engine = engineRef.current
            if (!engine) return
            return { id: newId(), orbit: engine.orbitState, plane: planeRef.current, thumb: engine.thumbnail(120) }
          }}
        />

        {regular && !layout.short && <PageStrip tx={tx} doc={doc} setHistory={setHistory} railSide={railSide} />}

        {/* Gesture legend: what the hands do now. Not shown once the panel covers it. */}
        <div className="absolute pointer-events-none flex flex-col items-center gap-2" style={{ left: regular && railSide === 'left' ? RAIL_CLEARANCE_PX : 0, right: regular && railSide === 'right' ? RAIL_CLEARANCE_PX : 0, bottom: regular ? (layout.short ? 12 : 84) : 72 }}>
          {edgeOn && (
            <div className="pointer-events-auto flex items-center gap-2 pl-3 pr-1 h-10 rounded-full text-[12px] border" style={{ background: 'var(--sk-panel)', borderColor: 'var(--sk-line)' }}>
              {tx('plane.edgeOn')}
              <button onClick={planeFacingMe} className="h-8 px-3 rounded-full text-[12px] font-medium" style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}>{tx('plane.fix')}</button>
            </div>
          )}
          {notice && <div role="status" className="px-3 py-2 rounded-lg text-[12px] border max-w-[90%] text-center" style={{ background: 'var(--sk-panel)', borderColor: 'var(--sk-line)' }}>{notice}</div>}
          {recording && <div role="status" className="px-3 py-2 rounded-lg text-[12px] border" style={{ background: 'var(--sk-panel)', borderColor: 'var(--sk-line)' }}>{tx('export.recording')}</div>}
          {!notice && !edgeOn && !recording && regular && (
            <div className="px-3 h-7 rounded-full flex items-center gap-2 text-[11px]" style={{ background: 'var(--sk-panel)', color: 'var(--sk-dim)' }}>
              <span>{tx(usingPen ? 'status.pen' : fingerDraw ? 'status.finger' : 'status.fingerOff')}</span>
              <span aria-hidden>·</span><span>{tx('status.orbit')}</span>
              <span aria-hidden>·</span><span>{tx('status.pan')}</span>
            </div>
          )}
        </div>

        {refsOpen && !docked && (
          <FloatingWindow bounds={size} short={layout.short}>
            <ReferencePane {...paneProps} />
          </FloatingWindow>
        )}
      </div>

      {docked && (
        <div className="min-w-0 min-h-0" style={{ ...paneStyle, borderLeft: layout.paneMode === 'docked-side' && !paneFirst ? '1px solid var(--sk-line)' : undefined, borderRight: layout.paneMode === 'docked-side' && paneFirst ? '1px solid var(--sk-line)' : undefined, borderTop: layout.paneMode === 'docked-stack' && !paneFirst ? '1px solid var(--sk-line)' : undefined, borderBottom: layout.paneMode === 'docked-stack' && paneFirst ? '1px solid var(--sk-line)' : undefined }}>
          <ReferencePane {...paneProps} />
        </div>
      )}
    </div>
  )
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** The references as a window you can move, for when there is no room to dock. */
function FloatingWindow({ bounds, short, children }: { bounds: { width: number; height: number }; short: boolean; children: React.ReactNode }) {
  const width = Math.min(300, bounds.width - 24)
  const height = Math.min(short ? bounds.height - 24 : 400, bounds.height - 120)
  const [pos, setPos] = useState({ x: Math.max(12, bounds.width - width - 12), y: 60 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  // The space can shrink under it: a fold must not leave the window out of reach.
  const x = Math.max(0, Math.min(pos.x, bounds.width - width))
  const y = Math.max(0, Math.min(pos.y, bounds.height - height))
  return (
    <div className="absolute z-30 rounded-xl overflow-hidden border shadow-xl flex flex-col" style={{ left: x, top: y, width, height, borderColor: 'var(--sk-line)', background: 'var(--sk-panel)' }}>
      <div
        className="h-6 shrink-0 grid place-items-center cursor-grab"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { dx: e.clientX - x, dy: e.clientY - y } }}
        onPointerMove={(e) => { if (drag.current) setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }) }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
      >
        <span className="w-10 h-1 rounded-full" style={{ background: 'var(--sk-line)' }} />
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
