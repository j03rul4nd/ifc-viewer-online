// ─── References floating over the drawing ─────────────────────────────────────
// Looking at a reference should not cost a trip to a panel, nor the drawing's
// space. Each pin moves, resizes and fades on its own; with Trace through, the pen
// passes straight through it to the drawing.

import { useEffect, useRef, useState } from 'react'
import { togglePin, updateReference } from '../../hooks/sketch/actions'
import type { ReferenceImage } from '../../lib/sketch/types'
import { useSketchStore } from '../../stores/sketchStore'
import type { Tx } from './SketchStudio'

export default function ReferencePins({ tx }: { tx: Tx }) {
  const images = useSketchStore((s) => s.images)
  const pinned = images.filter((i) => i.pin)
  const drawing = useSketchStore((s) => s.drawing)
  return (
    <>
      {pinned.map((image) => <Pin key={image.id} image={image} tx={tx} drawing={drawing} />)}
    </>
  )
}

function Pin({ image, tx, drawing }: { image: ReferenceImage; tx: Tx; drawing: boolean }) {
  const pin = image.pin!
  const [url, setUrl] = useState('')
  // Local while dragging: the record is written once, on release.
  const [live, setLive] = useState(pin)
  useEffect(() => setLive(pin), [pin])
  const drag = useRef<{ dx: number; dy: number; mode: 'move' | 'size' } | null>(null)
  useEffect(() => {
    const next = URL.createObjectURL(image.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [image.blob])
  const height = Math.round((live.width * image.height) / image.width)
  const start = (e: React.PointerEvent, mode: 'move' | 'size') => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = mode === 'move' ? { dx: e.clientX - live.x, dy: e.clientY - live.y, mode } : { dx: e.clientX - live.width, dy: 0, mode }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    setLive(d.mode === 'move' ? { ...live, x: e.clientX - d.dx, y: e.clientY - d.dy } : { ...live, width: Math.max(120, Math.min(900, e.clientX - d.dx)) })
  }
  const end = () => {
    if (drag.current) updateReference(image.id, { pin: live })
    drag.current = null
  }
  return (
    <div
      className="absolute z-20 rounded-lg overflow-hidden border shadow-lg"
      // Keep it reachable: a fold can shrink the space under it.
      style={{ left: `max(0px, min(${live.x}px, calc(100% - ${live.width}px)))`, top: `max(0px, min(${live.y}px, calc(100% - 60px)))`, width: `min(${live.width}px, 100%)`, borderColor: 'var(--sk-line)', background: 'var(--sk-panel)', opacity: drawing ? Math.min(live.opacity, 0.5) : 1, pointerEvents: drawing ? 'none' : undefined }}
    >
      <div className="flex items-center gap-1 h-8 px-1" style={{ touchAction: 'none', cursor: 'grab' }} onPointerDown={(e) => start(e, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <input
          type="range" aria-label={tx('refs.opacity')} min={0.15} max={1} step={0.05} value={live.opacity} className="flex-1 min-w-0" style={{ touchAction: 'none' }}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => { const opacity = Number(e.target.value); setLive({ ...live, opacity }); updateReference(image.id, { pin: { ...live, opacity } }) }}
        />
        <button
          type="button" aria-pressed={live.through} className="h-6 px-1.5 rounded text-[10px] shrink-0" style={{ background: live.through ? 'var(--sk-active)' : 'var(--sk-soft)', color: live.through ? 'var(--sk-on-active)' : undefined }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => updateReference(image.id, { pin: { ...live, through: !live.through } })}
        >{tx('refs.through')}</button>
        <button type="button" aria-label={tx('refs.unpin')} title={tx('refs.unpin')} className="w-6 h-6 shrink-0 text-[14px]" onPointerDown={(e) => e.stopPropagation()} onClick={() => togglePin(image)}>×</button>
      </div>
      <div className="relative" style={{ height, pointerEvents: live.through ? 'none' : undefined }}>
        <img src={url || undefined} alt={image.name} draggable={false} className="block w-full h-full" style={{ opacity: live.opacity }} />
      </div>
      <div
        role="separator" aria-label={tx('refs.resize')} className="absolute right-0 bottom-0 w-6 h-6 cursor-nwse-resize" style={{ touchAction: 'none', background: 'linear-gradient(135deg, transparent 60%, var(--sk-dim) 60%)' }}
        onPointerDown={(e) => start(e, 'size')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      />
    </div>
  )
}
