// ─── One captured view in the studio's shot list ───────────────────────────────
// Promote to hero, rename (the caption), reorder (the deck order), remove, and
// frame it: drag the picture or use the sliders to choose which part survives
// the crop and how far to punch in. The framing travels with the shot to every
// template and slide it lands in.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { coverSourceRect } from '../../lib/cover/draw'
import type { CoverShot, ShotCrop } from '../../lib/cover/types'
import { Slider, cls } from './ui'

const W = 240
const H = 150
const DEFAULT_CROP: ShotCrop = { x: 0.5, y: 0.45, zoom: 1 }

interface Props {
  shot: CoverShot
  index: number
  count: number
  onHero: () => void
  onRemove: () => void
  onRename: (label: string) => void
  onCrop: (crop: ShotCrop | undefined) => void
  onMove: (dir: -1 | 1) => void
}

export default function ShotTile({ shot, index, count, onHero, onRemove, onRename, onCrop, onMove }: Props) {
  const { t } = useTranslation('capture')
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [editing, setEditing] = useState(false)
  const drag = useRef<{ x: number; y: number; crop: ShotCrop } | null>(null)
  const crop = shot.crop ?? DEFAULT_CROP
  const hero = index === 0

  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')
    if (!ctx) return
    const s = coverSourceRect(shot.image.width, shot.image.height, W, H, crop.y, crop.x, crop.zoom)
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(shot.image, s.x, s.y, s.w, s.h, 0, 0, W, H)
  }, [shot.image, crop.x, crop.y, crop.zoom])

  const set = (patch: Partial<ShotCrop>) => onCrop({ ...crop, ...patch })

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editing) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, crop }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const r = e.currentTarget.getBoundingClientRect()
    // Dragging the picture right reveals more of its left side.
    const k = 1.6 / Math.max(1, d.crop.zoom)
    set({
      x: Math.min(1, Math.max(0, d.crop.x - ((e.clientX - d.x) / r.width) * k)),
      y: Math.min(1, Math.max(0, d.crop.y - ((e.clientY - d.y) / r.height) * k)),
    })
  }
  const onPointerUp = () => { drag.current = null }

  return (
    <div className={`rounded-[7px] border overflow-hidden ${hero ? 'border-[var(--accent)]' : 'border-[var(--border)]'} ${editing ? 'col-span-2' : ''}`}>
      <div className="relative group">
        <canvas
          ref={ref}
          className={`w-full h-auto block ${editing ? 'cursor-move touch-none' : 'cursor-pointer'}`}
          onClick={() => { if (!editing) onHero() }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title={editing ? t('cover.cropDrag') : hero ? undefined : t('cover.makeHero')}
        />
        {hero && <span className="absolute top-1 left-1 px-1.5 py-[1px] rounded-[4px] bg-[var(--accent)] text-white text-[10px] font-semibold">{t('cover.hero')}</span>}
        <div className="absolute top-1 right-1 flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onMove(-1)} disabled={index === 0} title={t('cover.moveEarlier')} aria-label={t('cover.moveEarlier')} className="p-1 rounded-[4px] bg-black/55 text-white disabled:opacity-30"><Icons.Chevron size={11} style={{ transform: 'rotate(180deg)' }} /></button>
          <button onClick={() => onMove(1)} disabled={index === count - 1} title={t('cover.moveLater')} aria-label={t('cover.moveLater')} className="p-1 rounded-[4px] bg-black/55 text-white disabled:opacity-30"><Icons.Chevron size={11} /></button>
        </div>
      </div>
      <div className="flex items-center gap-1 p-1">
        <input value={shot.label} onChange={(e) => onRename(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--text)] outline-none" aria-label={t('cover.caption')} />
        <button onClick={() => setEditing((v) => !v)} title={t('cover.crop')} aria-label={t('cover.crop')} aria-pressed={editing}
          className={`p-0.5 ${editing || shot.crop ? 'text-[var(--accent)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}><Icons.Sliders size={12} /></button>
        <button onClick={onRemove} title={t('cover.removeShot')} aria-label={t('cover.removeShot')} className="p-0.5 text-[var(--text-dim)] hover:text-[var(--danger)]"><Icons.X size={12} /></button>
      </div>
      {editing && (
        <div className="px-2 pb-2 space-y-1">
          <Slider label={t('cover.cropX')} value={crop.x} min={0} max={1} step={0.01} onChange={(x) => set({ x })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={t('cover.cropY')} value={crop.y} min={0} max={1} step={0.01} onChange={(y) => set({ y })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={t('cover.cropZoom')} value={crop.zoom} min={1} max={3} step={0.01} onChange={(zoom) => set({ zoom })} format={(v) => `${v.toFixed(1)}×`} />
          <div className="flex justify-end">
            <button className={cls.btnSm} onClick={() => onCrop(undefined)} disabled={!shot.crop}>{t('cover.cropReset')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
