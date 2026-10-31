// ─── Sketch studio: references ────────────────────────────────────────────────
// What you draw from, on the other half of the screen. Two views: your images,
// and the sketch itself seen from above and from the front while you draw it in
// perspective. Sharing the main renderer's geometry would tie the two contexts
// together, so the live view has its own small renderer, created only while it
// shows and drawn only when the main view has drawn.

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { commit, patchPlaced, removePlaced, type History } from '../../lib/sketch/document'
import { fitOrtho, type SketchRenderer } from '../../lib/sketch/renderer'
import type { PlacedImage, ReferenceImage, SketchLayer } from '../../lib/sketch/types'

type Tx = (key: string, o?: Record<string, unknown>) => string

interface Props {
  images: ReferenceImage[]
  placed: readonly PlacedImage[]
  tx: Tx
  onClose: () => void
  onAddFiles: (files: Iterable<File>) => void | Promise<void>
  onPlace: (image: ReferenceImage) => void
  onDelete: (image: ReferenceImage) => void
  setHistory: (next: History | ((h: History) => History)) => void
  engine: SketchRenderer | null
  revision: readonly SketchLayer[]
  paperBg: string
}

export default function ReferencePane(p: Props) {
  const { tx } = p
  const [view, setView] = useState<'images' | 'live'>('images')
  return (
    <div className="h-full flex flex-col min-h-0" style={{ background: 'var(--sk-panel)', touchAction: 'pan-y' }}>
      <header className="flex items-center gap-1 p-1.5 shrink-0 border-b" style={{ borderColor: 'var(--sk-line)' }}>
        <div role="tablist" aria-label={tx('refs.label')} className="flex flex-1 min-w-0 gap-1">
          {(['images', 'live'] as const).map((v) => (
            <button
              key={v} role="tab" type="button" aria-selected={view === v} onClick={() => setView(v)}
              className="flex-1 min-w-0 h-9 px-2 rounded-lg text-[12px] font-medium truncate"
              style={{ background: view === v ? 'var(--sk-active)' : 'var(--sk-soft)', color: view === v ? 'var(--sk-on-active)' : 'var(--sk-text)' }}
            >{tx(`refs.${v}`)}</button>
          ))}
        </div>
        <button type="button" aria-label={tx('refs.close')} title={tx('refs.close')} onClick={p.onClose} className="w-9 h-9 shrink-0 rounded-lg text-[16px]">×</button>
      </header>
      <div className="flex-1 min-h-0">{view === 'images' ? <ImageBoard {...p} /> : <LiveViews {...p} />}</div>
    </div>
  )
}

function useObjectUrl(blob: Blob): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function ImageCard({ image, tx, placed, onPlace, onDelete, setHistory }: Props & { image: ReferenceImage }) {
  const url = useObjectUrl(image.blob)
  const inScene = placed.filter((item) => item.imageId === image.id)
  return (
    <figure className="m-0 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--sk-line)' }}>
      <img src={url || undefined} alt={image.name} className="block w-full h-auto" draggable={false} style={{ WebkitTouchCallout: 'none' }} />
      <figcaption className="flex items-center gap-1 p-1">
        <button type="button" onClick={() => onPlace(image)} className="flex-1 min-w-0 h-9 px-2 rounded-lg text-[12px] font-medium truncate" style={{ background: 'var(--sk-soft)' }}>{tx('refs.place')}</button>
        <button type="button" aria-label={tx('refs.delete')} title={tx('refs.delete')} onClick={() => onDelete(image)} className="w-9 h-9 shrink-0 rounded-lg text-[15px]">×</button>
      </figcaption>
      {inScene.map((item) => (
        <div key={item.id} className="flex items-center gap-2 px-2 pb-2 text-[11px]" style={{ color: 'var(--sk-dim)' }}>
          <label className="flex-1 flex items-center gap-2 min-w-0">
            {tx('refs.opacity')}
            <input
              type="range" min={0.1} max={1} step={0.05} defaultValue={item.opacity} className="flex-1 min-w-0" style={{ touchAction: 'none' }}
              onChange={(e) => setHistory((h) => ({ ...h, present: patchPlaced(h.present, item.id, { opacity: Number(e.target.value) }) }))}
            />
          </label>
          <button type="button" className="h-8 px-2 rounded-md underline truncate max-w-[45%]" onClick={() => setHistory((h) => commit(h, removePlaced(h.present, item.id)))}>{tx('refs.removePlaced')}</button>
        </div>
      ))}
    </figure>
  )
}

function ImageBoard(p: Props) {
  const { tx, images, onAddFiles } = p
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) void onAddFiles(files)
  }
  return (
    <div className="h-full overflow-y-auto overscroll-contain p-2 flex flex-col gap-2">
      <div className="flex gap-1 shrink-0">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 min-w-0 h-10 rounded-lg text-[12px] font-medium truncate" style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}>{tx('refs.add')}</button>
        <button type="button" onClick={() => cameraRef.current?.click()} className="flex-1 min-w-0 h-10 rounded-lg text-[12px] font-medium truncate" style={{ background: 'var(--sk-soft)' }}>{tx('refs.camera')}</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      </div>
      {images.length === 0 && <p className="m-auto max-w-[240px] px-3 text-center text-[12px]" style={{ color: 'var(--sk-dim)' }}>{tx('refs.empty')}</p>}
      {images.map((image) => <ImageCard key={image.id} {...p} image={image} />)}
    </div>
  )
}

function LiveViews({ tx, engine, revision, paperBg }: Props) {
  const empty = revision.every((l) => l.strokes.length === 0)
  if (empty || !engine) return <p className="h-full grid place-items-center px-6 text-center text-[12px]" style={{ color: 'var(--sk-dim)' }}>{tx('refs.liveEmpty')}</p>
  return (
    <div className="h-full flex flex-col">
      <LiveView engine={engine} axis="top" label={tx('refs.top')} revision={revision} paperBg={paperBg} />
      <LiveView engine={engine} axis="front" label={tx('refs.front')} revision={revision} paperBg={paperBg} />
    </div>
  )
}

function LiveView({ engine, axis, label, revision, paperBg }: { engine: SketchRenderer; axis: 'top' | 'front'; label: string; revision: readonly SketchLayer[]; paperBg: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(new THREE.Color(paperBg), 1)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const bounds = engine.bounds()
      if (!bounds || w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      fitOrtho(camera, axis, bounds.center, bounds.radius, w / h)
      engine.renderInto(renderer, camera, w, h)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      renderer.dispose()
    }
  }, [engine, axis, paperBg, revision])
  return (
    <figure className="relative m-0 flex-1 min-h-0 border-b last:border-b-0" style={{ borderColor: 'var(--sk-line)' }}>
      <canvas ref={canvasRef} className="w-full h-full block" />
      <figcaption className="absolute left-2 top-2 px-1.5 py-0.5 rounded text-[11px]" style={{ background: 'var(--sk-panel)', color: 'var(--sk-dim)' }}>{label}</figcaption>
    </figure>
  )
}
