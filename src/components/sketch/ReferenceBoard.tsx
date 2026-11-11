// ─── Reference board ──────────────────────────────────────────────────────────
// A free surface for a brainstorm, PureRef style: lay images out, group them by
// where they sit, zoom out to see it all. Where each one sits is saved with it.

import { useEffect, useRef, useState } from 'react'
import { togglePin, updateReference } from '../../hooks/sketch/actions'
import { pinchView, type Fingers } from '../../lib/sketch/pinch'
import type { ReferenceImage } from '../../lib/sketch/types'
import { useSketchStore } from '../../stores/sketchStore'
import type { Tx } from './SketchStudio'

const CELL = 240

/** New images start on a grid, not on top of each other. */
const placeOf = (image: ReferenceImage, index: number) => image.board ?? { x: (index % 3) * (CELL + 16), y: Math.floor(index / 3) * (CELL + 16), scale: 1 }

export default function ReferenceBoard({ tx }: { tx: Tx }) {
  const images = useSketchStore((s) => s.images)
  const [view, setView] = useState({ x: 8, y: 8, zoom: 0.5 })
  const pan = useRef<{ x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // Every finger on the board, seen before a card or the pan can claim it.
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<Fingers | null>(null)
  const local = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const fingers = (): Fingers | null => {
    const [a, b] = [...touches.current.values()]
    return a && b ? { a, b } : null
  }

  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setView((v) => ({ ...v, zoom: Math.max(0.1, Math.min(3, v.zoom * Math.exp(-e.deltaY * 0.0012))) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const fit = () => {
    const el = box.current
    if (!el || images.length === 0) return
    let maxX = 0, maxY = 0
    images.forEach((image, i) => { const p = placeOf(image, i); maxX = Math.max(maxX, p.x + CELL * p.scale); maxY = Math.max(maxY, p.y + (CELL * p.scale * image.height) / image.width) })
    setView({ x: 8, y: 8, zoom: Math.min(1, Math.min((el.clientWidth - 16) / maxX, (el.clientHeight - 56) / maxY)) })
  }

  if (images.length === 0) return <p className="h-full grid place-items-center px-6 text-center text-[12px]" style={{ color: 'var(--sk-dim)' }}>{tx('refs.boardEmpty')}</p>

  return (
    <div
      ref={box} className="relative h-full overflow-hidden" style={{ touchAction: 'none', background: 'var(--sk-soft)' }}
      onPointerDownCapture={(e) => {
        if (e.pointerType !== 'touch') return
        touches.current.set(e.pointerId, local(e))
        pinch.current = fingers()
        if (pinch.current) {
          pan.current = null
          e.stopPropagation()
        }
      }}
      onPointerMoveCapture={(e) => {
        if (!touches.current.has(e.pointerId)) return
        touches.current.set(e.pointerId, local(e))
        const now = fingers()
        if (!pinch.current || !now) return
        const from = pinch.current
        pinch.current = now
        setView((v) => pinchView(v, from, now))
        e.stopPropagation()
      }}
      onPointerUpCapture={(e) => { touches.current.delete(e.pointerId); pinch.current = fingers() }}
      onPointerCancelCapture={(e) => { touches.current.delete(e.pointerId); pinch.current = fingers() }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pan.current = { x: e.clientX, y: e.clientY } }}
      onPointerMove={(e) => {
        if (!pan.current) return
        const dx = e.clientX - pan.current.x, dy = e.clientY - pan.current.y
        pan.current = { x: e.clientX, y: e.clientY }
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
      }}
      onPointerUp={() => { pan.current = null }}
      onPointerCancel={() => { pan.current = null }}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {images.map((image, i) => <Card key={image.id} image={image} index={i} zoom={view.zoom} tx={tx} />)}
      </div>
      <div className="absolute right-2 bottom-2 flex gap-1 p-1 rounded-lg" style={{ background: 'var(--sk-panel)' }} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label={tx('refs.zoomOut')} title={tx('refs.zoomOut')} className="w-9 h-9 rounded-md text-[16px]" style={{ background: 'var(--sk-soft)' }} onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.1, v.zoom / 1.3) }))}>−</button>
        <button type="button" aria-label={tx('refs.zoomIn')} title={tx('refs.zoomIn')} className="w-9 h-9 rounded-md text-[16px]" style={{ background: 'var(--sk-soft)' }} onClick={() => setView((v) => ({ ...v, zoom: Math.min(3, v.zoom * 1.3) }))}>+</button>
        <button type="button" className="h-9 px-2 rounded-md text-[12px]" style={{ background: 'var(--sk-soft)' }} onClick={fit}>{tx('refs.fit')}</button>
      </div>
    </div>
  )
}

function Card({ image, index, zoom, tx }: { image: ReferenceImage; index: number; zoom: number; tx: Tx }) {
  const [place, setPlace] = useState(() => placeOf(image, index))
  const [url, setUrl] = useState('')
  const drag = useRef<{ x: number; y: number; mode: 'move' | 'size'; start: typeof place } | null>(null)
  useEffect(() => {
    const next = URL.createObjectURL(image.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [image.blob])
  const begin = (e: React.PointerEvent, mode: 'move' | 'size') => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, mode, start: place }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / zoom, dy = (e.clientY - d.y) / zoom
    setPlace(d.mode === 'move' ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, scale: Math.max(0.3, d.start.scale + dx / CELL) })
  }
  const end = () => {
    if (drag.current) updateReference(image.id, { board: place })
    drag.current = null
  }
  return (
    <figure
      className="absolute m-0 rounded overflow-hidden" style={{ left: place.x, top: place.y, width: CELL * place.scale, boxShadow: '0 1px 6px rgba(0,0,0,.25)', cursor: 'grab' }}
      onPointerDown={(e) => begin(e, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onDoubleClick={() => togglePin(image)} title={tx('refs.pin')}
    >
      <img src={url || undefined} alt={image.name} draggable={false} className="block w-full h-auto" />
      {image.pin && <span className="absolute left-1 top-1 px-1 rounded text-[10px]" style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}>{tx('refs.pin')}</span>}
      <span
        role="separator" aria-label={tx('refs.resize')} className="absolute right-0 bottom-0 w-8 h-8" style={{ cursor: 'nwse-resize', background: 'linear-gradient(135deg, transparent 60%, rgba(0,0,0,.45) 60%)' }}
        onPointerDown={(e) => begin(e, 'size')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      />
    </figure>
  )
}
