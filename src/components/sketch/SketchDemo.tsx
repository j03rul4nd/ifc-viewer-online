// ─── SketchDemo ───────────────────────────────────────────────────────────────
// The studio's engine in an article: a drawing replays itself, the reader turns it
// and adds to it. It keeps nothing; "open" hands the drawing over in the read-only
// link the studio already understands. Loaded lazily, on the reader's press, by the
// poster in blog/SketchDemoBlock.tsx. The words come with the post.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_INK, finishStroke } from '../../lib/sketch/ink'
import { FILTER_PRESETS, type LayerFilters } from '../../lib/sketch/filters'
import { presetPlane, type PlanePreset } from '../../lib/sketch/plane'
import { SketchRenderer } from '../../lib/sketch/renderer'
import { encodeSketchLink } from '../../lib/sketch/share-link'
import { SHOWCASES, type ShowcaseId } from '../../lib/sketch/showcase'
import type { OrbitState, SketchLayer, Stroke } from '../../lib/sketch/types'
import { useReducedMotion } from 'framer-motion'

export interface SketchDemoLabels {
  orbit: string
  draw: string
  replay: string
  undo: string
  open: string
  plane: string
  ground: string
  front: string
  side: string
  filter: string
  original: string
  blueprint: string
  wash: string
  chalk: string
  neon: string
  faded: string
  hintOrbit: string
  hintDraw: string
  noGpu: string
}

const REPLAY_MS = 7000
const INK: Record<ShowcaseId, string> = { pavilion: '#d6432b', tower: '#ffb02e', bridge: '#ffc23c', city: '#35f0ff', markup: '#1d6fd8' }
const FILTERS = ['original', 'blueprint', 'wash', 'chalk', 'neon', 'faded'] as const

export default function SketchDemo({ scene, labels, onOpen }: { scene: ShowcaseId; labels: SketchDemoLabels; onOpen?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<SketchRenderer | null>(null)
  const orbit = useRef<OrbitState | null>(null)
  const base = useRef<readonly SketchLayer[]>([])
  const mine = useRef<Stroke[]>([])
  const look = useRef<LayerFilters | null>(null)
  const replayFrame = useRef(0)
  const gesture = useRef<{ x: number; y: number } | null>(null)
  const samples = useRef<number[] | null>(null)
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<'orbit' | 'draw'>('orbit')
  const [plane, setPlane] = useState<PlanePreset>('front')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('original')
  const [count, setCount] = useState(0)
  const [failed, setFailed] = useState(false)

  const show = () => {
    const layers = base.current.map((l) => (look.current ? { ...l, filters: look.current } : l))
    const own: SketchLayer = { id: 'reader', name: 'reader', visible: true, locked: false, strokes: mine.current, filters: look.current ?? undefined }
    engine.current?.syncLayers([...layers, own])
  }

  const replay = () => {
    const e = engine.current
    if (!e) return
    cancelAnimationFrame(replayFrame.current)
    const total = base.current.reduce((n, l) => n + l.strokes.length, 0)
    if (reduced) {
      e.reveal(null)
      return
    }
    const from = orbit.current!
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / REPLAY_MS)
      if (t >= 1) {
        e.reveal(null)
        return
      }
      e.reveal(Math.ceil(t * t * (3 - 2 * t) * total))
      const next = { ...from, azimuth: from.azimuth + (t - 1) * 0.5 }
      e.setOrbit(next)
      orbit.current = next
      replayFrame.current = requestAnimationFrame(tick)
    }
    orbit.current = from
    replayFrame.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    const el = canvas.current, holder = box.current
    if (!el || !holder) return
    const showcase = SHOWCASES[scene]()
    let e: SketchRenderer
    try {
      e = new SketchRenderer(el, presetPlane('front', showcase.drawAt))
    } catch {
      setFailed(true)
      return
    }
    engine.current = e
    orbit.current = showcase.orbit
    base.current = showcase.doc.pages[0].layers
    e.setGuides(false)
    e.setBackground(showcase.doc.paper, showcase.doc.background)
    e.setOrbit(showcase.orbit)
    const resize = () => {
      e.resize(holder.clientWidth, holder.clientHeight)
      e.renderNow()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(holder)
    show()
    replay()
    return () => {
      cancelAnimationFrame(replayFrame.current)
      observer.disconnect()
      engine.current = null
      e.dispose()
    }
    // One engine per mounted scene; everything else reaches it through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useEffect(() => {
    const e = engine.current
    if (!e) return
    e.setPlane(presetPlane(plane, SHOWCASES[scene]().drawAt))
    e.setGuides(mode === 'draw')
  }, [mode, plane, scene])

  const applyFilter = (next: (typeof FILTERS)[number]) => {
    setFilter(next)
    look.current = next === 'original' ? null : FILTER_PRESETS[next]
    show()
  }

  const at = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: ReactPointerEvent) => {
    cancelAnimationFrame(replayFrame.current)
    engine.current?.reveal(null)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (mode === 'orbit') {
      gesture.current = { x: e.clientX, y: e.clientY }
      return
    }
    samples.current = []
    move(e)
  }
  const move = (e: ReactPointerEvent) => {
    const engineNow = engine.current
    if (!engineNow) return
    if (gesture.current && orbit.current) {
      const next = {
        ...orbit.current,
        azimuth: orbit.current.azimuth - (e.clientX - gesture.current.x) * 0.006,
        elevation: Math.max(0.03, Math.min(1.45, orbit.current.elevation + (e.clientY - gesture.current.y) * 0.005)),
      }
      gesture.current = { x: e.clientX, y: e.clientY }
      orbit.current = next
      engineNow.setOrbit(next)
      return
    }
    if (!samples.current) return
    const p = at(e)
    const hit = engineNow.hitPlane(p.x, p.y)
    if (!hit) return
    samples.current.push(hit[0], hit[1], hit[2], e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.65)
    engineNow.setLive([{ id: 'live', brush: 'pen', color: INK[scene], width: 5, points: new Float32Array(samples.current) }])
  }
  const up = () => {
    gesture.current = null
    const e = engine.current, raw = samples.current
    samples.current = null
    if (!e || !raw) return
    e.setLive([])
    if (raw.length < 8) return
    mine.current = [...mine.current, { id: `reader-${mine.current.length}`, brush: 'pen', color: INK[scene], width: 5, points: finishStroke(new Float32Array(raw), e.worldPerPixel(), DEFAULT_INK, false) }]
    setCount(mine.current.length)
    show()
  }

  const open = async () => {
    onOpen?.()
    const showcase = SHOWCASES[scene]()
    const page = showcase.doc.pages[0]
    const own: SketchLayer = { id: 'reader', name: 'reader', visible: true, locked: false, strokes: mine.current }
    const code = await encodeSketchLink({ ...showcase.doc, pages: [{ ...page, layers: [...base.current, own], activeLayerId: 'reader' }] })
    window.open(`/sketch#s=${code}`, '_blank', 'noopener')
  }

  const chip = (active: boolean) => `min-h-[36px] rounded-lg px-3 text-[12px] font-medium transition-colors ${active ? 'bg-[var(--accent)] text-[var(--accent-contrast,#04121a)]' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)]'}`

  if (failed) return <p className="p-6 text-[14px] text-[var(--text-dim)]">{labels.noGpu}</p>

  return (
    <div>
      <div ref={box} className="relative aspect-[16/10] w-full overflow-hidden bg-black">
        <canvas
          ref={canvas} className="absolute inset-0 h-full w-full"
          // Orbiting leaves vertical swipes to the page, so the demo is no scroll trap.
          style={{ touchAction: mode === 'draw' ? 'none' : 'pan-y', cursor: mode === 'draw' ? 'crosshair' : 'grab' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        />
        <p className="pointer-events-none absolute left-3 top-3 max-w-[80%] rounded-md bg-black/60 px-2 py-1 text-[11px] text-white">{mode === 'draw' ? labels.hintDraw : labels.hintOrbit}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] p-2">
        <div role="group" aria-label={labels.draw} className="flex gap-1">
          <button type="button" aria-pressed={mode === 'orbit'} className={chip(mode === 'orbit')} onClick={() => setMode('orbit')}>{labels.orbit}</button>
          <button type="button" aria-pressed={mode === 'draw'} className={chip(mode === 'draw')} onClick={() => setMode('draw')}>{labels.draw}</button>
        </div>
        {mode === 'draw' && (
          <div role="group" aria-label={labels.plane} className="flex gap-1">
            {(['front', 'ground', 'side'] as const).map((p) => <button key={p} type="button" aria-pressed={plane === p} className={chip(plane === p)} onClick={() => setPlane(p)}>{labels[p]}</button>)}
          </div>
        )}
        <button type="button" className={chip(false)} onClick={replay}>{labels.replay}</button>
        {count > 0 && <button type="button" className={chip(false)} onClick={() => { mine.current = mine.current.slice(0, -1); setCount(mine.current.length); show() }}>{labels.undo}</button>}
        <button type="button" className={`${chip(true)} ml-auto`} onClick={() => { void open() }}>{labels.open}</button>
      </div>
      <div role="group" aria-label={labels.filter} className="flex gap-1 overflow-x-auto border-t border-[var(--border)] p-2">
        {FILTERS.map((f) => <button key={f} type="button" aria-pressed={filter === f} className={`${chip(filter === f)} shrink-0`} onClick={() => applyFilter(f)}>{labels[f]}</button>)}
      </div>
    </div>
  )
}
