// ─── Sketch studio: references ────────────────────────────────────────────────
// What you draw from, on the other half of the screen: your images, and the
// sketch itself from above and from the front. The live views have their own
// small renderer, created only while they show and redrawn only when the
// drawing has changed.

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { placeReference } from '../../hooks/sketch/actions'
import { activePage, forgetImage, newId, patchPlaced, removePlaced } from '../../lib/sketch/document'
import { fitOrtho, PAPER } from '../../lib/sketch/renderer'
import { deleteImage, readImageFile, saveImage } from '../../lib/sketch/storage'
import type { PlacedImage, ReferenceImage } from '../../lib/sketch/types'
import { useSketchStore } from '../../stores/sketchStore'
import type { Tx } from './SketchStudio'

export default function ReferencePane({ tx }: { tx: Tx }) {
  const [view, setView] = useState<'images' | 'live'>('images')
  const set = useSketchStore((s) => s.set)
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
        <button
          type="button" aria-label={tx('refs.window')} title={tx('refs.window')} className="w-9 h-9 shrink-0 grid place-items-center rounded-lg"
          onClick={() => { window.open('/sketch?pane=refs', '_blank'); set({ refsOpen: false }) }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 3H3v10h10V9M9 3h4v4M13 3L8 8" /></svg>
        </button>
        <button type="button" aria-label={tx('refs.close')} title={tx('refs.close')} onClick={() => set({ refsOpen: false })} className="w-9 h-9 shrink-0 rounded-lg text-[16px]">×</button>
      </header>
      <div className="flex-1 min-h-0">{view === 'images' ? <StudioImages tx={tx} /> : <LiveViews tx={tx} />}</div>
    </div>
  )
}

function StudioImages({ tx }: { tx: Tx }) {
  const images = useSketchStore((s) => s.images)
  const placed = useSketchStore((s) => activePage(s.history.present).placed)
  const add = useCallback(async (files: Iterable<File>) => {
    const s = useSketchStore.getState()
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const image = await readImageFile(file, newId())
      if (!image) { s.flash(tx('refs.tooMany')); continue }
      s.set({ saveFailed: !(await saveImage(image)) })
      s.set({ images: [...useSketchStore.getState().images, image] })
    }
  }, [tx])
  return (
    <ImageList
      tx={tx} images={images} placed={placed} onAdd={add}
      onPlace={(image) => placeReference(image, tx)}
      onDelete={(image) => {
        const s = useSketchStore.getState()
        void deleteImage(image.id)
        s.set({ images: s.images.filter((i) => i.id !== image.id) })
        s.edit((doc) => forgetImage(doc, image.id))
      }}
    />
  )
}

interface ListProps {
  tx: Tx
  images: readonly ReferenceImage[]
  placed: readonly PlacedImage[]
  onAdd: (files: Iterable<File>) => void | Promise<void>
  onPlace: (image: ReferenceImage) => void
  onDelete: (image: ReferenceImage) => void
}

export function ImageList({ tx, images, placed, onAdd, onPlace, onDelete }: ListProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) void onAdd(files)
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { if (e.clipboardData?.files.length) void onAdd(Array.from(e.clipboardData.files)) }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onAdd])
  return (
    <div
      className="h-full overflow-y-auto overscroll-contain p-2 flex flex-col gap-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); void onAdd(Array.from(e.dataTransfer.files)) }}
    >
      <div className="flex gap-1 shrink-0">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 min-w-0 h-10 rounded-lg text-[12px] font-medium truncate" style={{ background: 'var(--sk-active)', color: 'var(--sk-on-active)' }}>{tx('refs.add')}</button>
        <button type="button" onClick={() => cameraRef.current?.click()} className="flex-1 min-w-0 h-10 rounded-lg text-[12px] font-medium truncate" style={{ background: 'var(--sk-soft)' }}>{tx('refs.camera')}</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      </div>
      {images.length === 0 && <p className="m-auto max-w-[240px] px-3 text-center text-[12px]" style={{ color: 'var(--sk-dim)' }}>{tx('refs.empty')}</p>}
      {images.map((image) => <ImageCard key={image.id} tx={tx} image={image} placed={placed} onPlace={onPlace} onDelete={onDelete} />)}
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

function ImageCard({ tx, image, placed, onPlace, onDelete }: { image: ReferenceImage } & Pick<ListProps, 'tx' | 'placed' | 'onPlace' | 'onDelete'>) {
  const url = useObjectUrl(image.blob)
  const inScene = placed.filter((item) => item.imageId === image.id)
  const s = useSketchStore.getState()
  return (
    <figure className="m-0 rounded-lg overflow-hidden border shrink-0" style={{ borderColor: 'var(--sk-line)' }}>
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
              onChange={(e) => s.touch((doc) => patchPlaced(doc, item.id, { opacity: Number(e.target.value) }))}
            />
          </label>
          <button type="button" className="h-8 px-2 rounded-md underline truncate max-w-[45%]" onClick={() => s.edit((doc) => removePlaced(doc, item.id))}>{tx('refs.removePlaced')}</button>
        </div>
      ))}
    </figure>
  )
}

function LiveViews({ tx }: { tx: Tx }) {
  const empty = useSketchStore((s) => activePage(s.history.present).layers.every((l) => l.strokes.length === 0))
  if (empty) return <p className="h-full grid place-items-center px-6 text-center text-[12px]" style={{ color: 'var(--sk-dim)' }}>{tx('refs.liveEmpty')}</p>
  return (
    <div className="h-full flex flex-col">
      <LiveView axis="top" label={tx('refs.top')} />
      <LiveView axis="front" label={tx('refs.front')} />
    </div>
  )
}

function LiveView({ axis, label }: { axis: 'top' | 'front'; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engine = useSketchStore((s) => s.engine)
  const layers = useSketchStore((s) => activePage(s.history.present).layers)
  const paper = useSketchStore((s) => s.history.present.paper)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !engine) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(new THREE.Color(PAPER[paper].bg), 1)
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
  }, [engine, axis, paper, layers])
  return (
    <figure className="relative m-0 flex-1 min-h-0 border-b last:border-b-0" style={{ borderColor: 'var(--sk-line)' }}>
      <canvas ref={canvasRef} className="w-full h-full block" />
      <figcaption className="absolute left-2 top-2 px-1.5 py-0.5 rounded text-[11px]" style={{ background: 'var(--sk-panel)', color: 'var(--sk-dim)' }}>{label}</figcaption>
    </figure>
  )
}
