import React from 'react'
import * as Icons from '../Icons'
import { Modal } from '../Modal'
import './editorial.css'

// ─── Image viewer ────────────────────────────────────────────────────────────
// Blog images are mostly diagrams and screenshots drawn for a 720px column; on
// a phone their labels are unreadable. Two things fix that:
//
//   AnnotatedImage — numbered hotspots on the image, each with its own text,
//                    mirrored by a legend list below (the accessible, always-
//                    readable version; hotspots are a shortcut into it).
//   Lightbox       — tap to open full-screen; zoom with buttons, wheel, pinch
//                    or double-tap; drag to pan; keyboard +/−/0/arrows/Esc.
//
// No library: one transform on one <img>, driven by pointer events.

export interface Annotation {
  /** Position in % of the image (0–100), measured from top-left. */
  x: number
  y: number
  label: string
  text?: string
}

export interface ViewerCopy {
  enlarge: string
  close: string
  zoomIn: string
  zoomOut: string
  reset: string
  hint: string
}

const MIN = 1
const MAX = 6

// ── AnnotatedImage ──────────────────────────────────────────────────────────

export function AnnotatedImage({ image, annotations = [], copy, caption }: {
  image: React.ReactElement<React.ImgHTMLAttributes<HTMLImageElement>>
  annotations?: Annotation[]
  copy: ViewerCopy
  caption?: React.ReactNode
}) {
  const [active, setActive] = React.useState<number | null>(null)
  const [openAt, setOpenAt] = React.useState<Annotation | null | undefined>(undefined)
  const src = image.props.src as string
  const alt = (image.props.alt as string) ?? ''
  const legendId = React.useId()
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  return (
    <figure className="my-8">
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpenAt(null)}
          className="ed-focus group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[var(--border)] text-left"
          aria-label={`${copy.enlarge}: ${alt}`}
        >
          {image}
          <span
            aria-hidden="true"
            className="absolute left-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"
          >
            <Icons.Search size={16} />
          </span>
        </button>
        {/* Hotspots sit OVER the zoom button, as siblings — never nested buttons. */}
        {annotations.map((a, i) => (
          <Hotspot
            key={i}
            n={i + 1}
            a={a}
            active={active === i}
            describedBy={legendId}
            onToggle={() => setActive((cur) => (cur === i ? null : i))}
          />
        ))}
      </div>

      {annotations.length > 0 && (
        <ol id={legendId} className="mt-3 grid gap-1.5 sm:grid-cols-2" role="list">
          {annotations.map((a, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setActive((cur) => (cur === i ? null : i))}
                aria-pressed={active === i}
                className="ed-focus flex w-full min-h-[44px] gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface)] aria-pressed:bg-[var(--surface)]"
              >
                <span className="ed-hotspot-num" data-active={active === i} aria-hidden="true">{i + 1}</span>
                <span className="min-w-0 text-[13.5px] leading-[1.55]">
                  <span className="font-semibold text-[var(--text)]">{a.label}</span>
                  {a.text && <span className="text-[var(--text-dim)]"> — {a.text}</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {caption && (
        <figcaption className="mt-2.5 text-center text-[12px] text-[var(--text-faint)]">{caption}</figcaption>
      )}

      {openAt !== undefined && (
        <Lightbox src={src} alt={alt} annotations={annotations} copy={copy} returnFocusTo={triggerRef} onClose={() => setOpenAt(undefined)} />
      )}
    </figure>
  )
}

function Hotspot({ n, a, active, onToggle, describedBy }: {
  n: number
  a: Annotation
  active: boolean
  onToggle: () => void
  describedBy: string
}) {
  // Card opens toward the image centre so it never spills off-screen.
  const right = a.x > 55
  const below = a.y < 45
  return (
    <div className="absolute z-10" style={{ left: `${a.x}%`, top: `${a.y}%` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        aria-describedby={describedBy}
        aria-label={`${n}. ${a.label}`}
        className="ed-focus ed-hotspot -translate-x-1/2 -translate-y-1/2"
        data-active={active}
      >
        {n}
      </button>
      {/* Phone: the image is too small to host a card — the legend right below
          is the card (it highlights). Larger screens: the note opens in place. */}
      {active && (
        <div
          role="status"
          className={`ed-fade-in absolute hidden sm:block w-[min(260px,70vw)] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 py-3 text-[13px] leading-[1.55] shadow-[0_12px_32px_-10px_rgba(0,0,0,0.6)] ${right ? 'right-3' : 'left-3'} ${below ? 'top-4' : 'bottom-4'}`}
        >
          <p className="font-semibold text-[var(--text)]">{a.label}</p>
          {a.text && <p className="mt-0.5 text-[var(--text-dim)]">{a.text}</p>}
        </div>
      )}
    </div>
  )
}

// ── Lightbox ────────────────────────────────────────────────────────────────

type View = { s: number; x: number; y: number }

function clampView(v: View, box: DOMRect | undefined, img: HTMLImageElement | null): View {
  const s = Math.min(MAX, Math.max(MIN, v.s))
  if (!box || !img || s === 1) return { s, x: s === 1 ? 0 : v.x, y: s === 1 ? 0 : v.y }
  // Keep at least the image's own edges inside the viewport when zoomed in.
  const w = img.offsetWidth * s
  const h = img.offsetHeight * s
  const mx = Math.max(0, (w - box.width) / 2)
  const my = Math.max(0, (h - box.height) / 2)
  return { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) }
}

export function Lightbox({ src, alt, annotations = [], copy, onClose, returnFocusTo }: {
  returnFocusTo?: React.RefObject<HTMLElement>
  src: string
  alt: string
  annotations?: Annotation[]
  copy: ViewerCopy
  onClose: () => void
}) {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)
  const [view, setView] = React.useState<View>({ s: 1, x: 0, y: 0 })
  const pointers = React.useRef(new Map<number, { x: number; y: number }>())
  const gesture = React.useRef<{ dist: number; s: number; x: number; y: number; cx: number; cy: number } | null>(null)
  const lastTap = React.useRef(0)

  const apply = React.useCallback((next: View | ((v: View) => View)) => {
    setView((cur) => clampView(typeof next === 'function' ? next(cur) : next, stageRef.current?.getBoundingClientRect(), imgRef.current))
  }, [])

  /** Zoom by `factor` keeping the point (px, py) — viewport coords — fixed. */
  const zoomAt = React.useCallback((factor: number, px?: number, py?: number) => {
    apply((v) => {
      const box = stageRef.current?.getBoundingClientRect()
      const s = Math.min(MAX, Math.max(MIN, v.s * factor))
      if (!box || px === undefined || py === undefined) return { s, x: v.x * (s / v.s), y: v.y * (s / v.s) }
      const ox = px - (box.left + box.width / 2)
      const oy = py - (box.top + box.height / 2)
      const k = s / v.s
      return { s, x: ox - (ox - v.x) * k, y: oy - (oy - v.y) * k }
    })
  }, [apply])

  // Radix (via Modal) owns focus trap, Escape and scroll lock. Focus goes back
  // to the image explicitly: Safari doesn't focus a button on click, so
  // "whatever was focused before" would be the page body.
  React.useEffect(() => {
    const back = returnFocusTo?.current
    return () => { window.setTimeout(() => back?.focus?.(), 0) }
  }, [returnFocusTo])

  // Wheel needs a non-passive listener to stop the page from scrolling.
  React.useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 60
    if (e.key === '+' || e.key === '=') zoomAt(1.4)
    else if (e.key === '-') zoomAt(1 / 1.4)
    else if (e.key === '0') apply({ s: 1, x: 0, y: 0 })
    else if (e.key === 'ArrowLeft') apply((v) => ({ ...v, x: v.x + step }))
    else if (e.key === 'ArrowRight') apply((v) => ({ ...v, x: v.x - step }))
    else if (e.key === 'ArrowUp') apply((v) => ({ ...v, y: v.y + step }))
    else if (e.key === 'ArrowDown') apply((v) => ({ ...v, y: v.y - step }))
    else return
    e.preventDefault()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      gesture.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        s: view.s, x: view.x, y: view.y,
        cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2,
      }
    } else if (pts.length === 1) {
      // Double-tap / double-click: toggle between fit and 2.5× at that point.
      const now = e.timeStamp
      if (now - lastTap.current < 300) {
        if (view.s > 1.05) apply({ s: 1, x: 0, y: 0 })
        else zoomAt(2.5, e.clientX, e.clientY)
        lastTap.current = 0
      } else lastTap.current = now
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 2 && gesture.current) {
      const g = gesture.current
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const s = Math.min(MAX, Math.max(MIN, g.s * (dist / g.dist)))
      const box = stageRef.current!.getBoundingClientRect()
      const ox = g.cx - (box.left + box.width / 2)
      const oy = g.cy - (box.top + box.height / 2)
      const cx = (pts[0].x + pts[1].x) / 2
      const cy = (pts[0].y + pts[1].y) / 2
      const k = s / g.s
      apply({ s, x: ox - (ox - g.x) * k + (cx - g.cx), y: oy - (oy - g.y) * k + (cy - g.cy) })
    } else if (pts.length === 1 && view.s > 1) {
      apply((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }))
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current = null
  }

  const ctrl = 'inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-35'
  const zoomed = view.s > 1.01

  return (
    <Modal
      open
      onClose={onClose}
      title={alt}
      size="full"
      bare
      // Full-bleed: an image viewer is all canvas, no card around it.
      className="!h-[100dvh] !w-screen !rounded-none !border-0 !bg-black/95 !shadow-none text-white"
    >
    <div className="relative h-full" onKeyDown={onKeyDown}>
      <div
        ref={stageRef}
        className="absolute inset-0 touch-none select-none overflow-hidden"
        style={{ cursor: zoomed ? 'grab' : 'zoom-in' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.s})`, transition: pointers.current.size ? 'none' : 'transform 160ms ease-out' }}
        >
          <div className="relative">
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              draggable={false}
              className="block h-auto max-h-[calc(100dvh-120px)] w-auto max-w-[calc(100vw-24px)] sm:max-w-[calc(100vw-96px)]"
            />
            {annotations.map((a, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="ed-hotspot pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${a.x}%`, top: `${a.y}%`, transform: `translate(-50%, -50%) scale(${1 / view.s})` }}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-end p-3" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <button type="button" data-close onClick={onClose} aria-label={copy.close} className={`${ctrl} pointer-events-auto`}>
          <Icons.X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
        <div role="toolbar" aria-label={alt} className="flex items-center gap-1.5 rounded-full bg-black/60 p-1.5 backdrop-blur">
          <button type="button" onClick={() => zoomAt(1 / 1.5)} disabled={!zoomed} aria-label={copy.zoomOut} className={ctrl}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          <button type="button" onClick={() => apply({ s: 1, x: 0, y: 0 })} disabled={!zoomed} aria-label={copy.reset} className="min-w-[64px] h-11 rounded-full px-3 text-[13px] font-mono tabular-nums text-white hover:bg-white/10 disabled:opacity-60">
            {Math.round(view.s * 100)}%
          </button>
          <button type="button" onClick={() => zoomAt(1.5)} disabled={view.s >= MAX} aria-label={copy.zoomIn} className={ctrl}>
            <Icons.Plus size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="text-[11.5px] text-white/60" aria-hidden="true">{copy.hint}</p>
      </div>
    </div>
    </Modal>
  )
}
