// ─── Signature pad ────────────────────────────────────────────────────────────
// Pointer events on a canvas: finger, pen or mouse. Emits a PNG data URL after
// each stroke (null when cleared). touch-action:none so the page doesn't scroll
// while the buyer signs on a phone.

import React, { useEffect, useRef } from 'react'

interface Props {
  label: string
  clearLabel: string
  placeholder: string
  value?: string
  onChange: (dataUrl: string | null) => void
  disabled?: boolean
}

const W = 600
const H = 240

export default function SignaturePad({ label, clearLabel, placeholder, value, onChange, disabled }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const dirty = useRef(false)

  // Paint the stored signature (e.g. after reload) once.
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, W, H)
    dirty.current = false
    if (!value) return
    const im = new Image()
    im.onload = () => { ctx.drawImage(im, 0, 0, W, H); dirty.current = true }
    im.src = value
    // value changes only when the stroke we emitted comes back; repainting it is harmless.
  }, [value])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * W, y: ((e.clientY - r.top) / Math.max(1, r.height)) * H }
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 1.6, 0, Math.PI * 2); ctx.fill() }
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return
    const ctx = e.currentTarget.getContext('2d')
    const p = pos(e)
    if (ctx && last.current) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    }
    last.current = p
    dirty.current = true
  }
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    dirty.current = true
    onChange(e.currentTarget.toDataURL('image/png'))
  }
  const clear = () => {
    const c = ref.current
    c?.getContext('2d')?.clearRect(0, 0, W, H)
    dirty.current = false
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        {!disabled && <button type="button" className="rounded border border-white/15 px-2 py-0.5 text-xs" onClick={clear}>{clearLabel}</button>}
      </div>
      <div className="relative">
        <canvas
          ref={ref} width={W} height={H} aria-label={label} role="img"
          className="w-full rounded border border-white/20 bg-white"
          style={{ touchAction: 'none', aspectRatio: `${W} / ${H}` }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        />
        {!value && !disabled && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-black/35">{placeholder}</span>}
      </div>
    </div>
  )
}
