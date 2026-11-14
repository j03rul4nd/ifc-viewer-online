// Guided tour overlay: dims the page, cuts a spotlight around the step's
// `data-tour` anchor and shows a small card next to it (docked to the bottom
// on phones). Steps whose anchor isn't on screen are skipped, so one tour
// works on an empty account, a phone and a desktop. Keyboard: ← → to move,
// Esc to leave. The page underneath is not clickable while the tour runs —
// a tour explains, it doesn't act.

import type React from 'react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { placeCard, type Placement, type Rect, type TourStep } from '../../lib/workspace-tours/tours'
import { createPortal } from 'react-dom'
import { useTx, type Tx } from './i18n'

const PAD = 6

const sameRect = (a: Rect | null, b: Rect | null): boolean =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5)
const samePlace = (a: Placement, b: Placement): boolean =>
  a.mode === b.mode && (a.mode === 'docked' || (b.mode === 'float' && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && a.side === b.side))

/** The part of `el` its scrolling ancestors actually show (a wide table in a narrow panel). */
function visibleRect(el: HTMLElement): { top: number; left: number; width: number; height: number } {
  const r = el.getBoundingClientRect()
  let top = r.top, left = r.left, right = r.right, bottom = r.bottom
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (!/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) continue
    const c = p.getBoundingClientRect()
    if (c.width <= 0 || c.height <= 0) continue
    top = Math.max(top, c.top); left = Math.max(left, c.left); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom)
  }
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** Click shields covering everything but `r`. */
function shieldsAround(r: Rect): React.CSSProperties[] {
  const bottom = r.top + r.height
  const right = r.left + r.width
  return [
    { top: 0, left: 0, right: 0, height: Math.max(0, r.top) },
    { top: bottom, left: 0, right: 0, bottom: 0 },
    { top: r.top, left: 0, width: Math.max(0, r.left), height: r.height },
    { top: r.top, left: right, right: 0, height: r.height },
  ]
}

function findTarget(id?: string): HTMLElement | null {
  if (!id) return null
  // The same anchor can exist twice (phone select + desktop tabs): take the visible one.
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el
  }
  return null
}

interface TourProps {
  title: string
  steps: TourStep[]
  onClose: (finished: boolean) => void
  /** Each step shown (index among the live steps, the step itself). */
  onStep?: (index: number, step: TourStep) => void
  /** Stacking order; the default sits over the workspace pages. */
  zIndex?: number
}

/** The workspace tour: texts through the workspace catalogue. */
export default function GuidedTour(props: TourProps) {
  const tx = useTx()
  return <GuidedTourView {...props} tx={tx} />
}

/**
 * The overlay itself with the translator passed in, so a tour outside the
 * workspace (revision compare) uses its own namespace and never loads the
 * workspace one. `tx` also receives the card's own strings: "Skip", "Back",
 * "Next", "Done" and "{{title}} · {{n}} of {{total}}".
 */
export function GuidedTourView({ title, steps, onClose, onStep, zIndex = 60, tx }: TourProps & { tx: Tx }) {
  // Resolve once on open: only steps that point at something visible (or at nothing on purpose).
  const live = useMemo(() => steps.filter((s) => !s.target || findTarget(s.target)), [steps])
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [place, setPlace] = useState<Placement>({ mode: 'docked' })
  const card = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const step = live[i]
  const last = i === live.length - 1

  const measure = useCallback(() => {
    const el = findTarget(step?.target)
    const r = el ? visibleRect(el) : undefined
    const tr = r ? { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null
    setRect((old) => (sameRect(old, tr) ? old : tr))
    const c = card.current?.getBoundingClientRect()
    const p = placeCard(tr, { width: c?.width ?? 340, height: c?.height ?? 180 }, { width: innerWidth, height: innerHeight })
    setPlace((old) => (samePlace(old, p) ? old : p))
  }, [step])

  // Bring the target into view, then measure once it has settled.
  useLayoutEffect(() => {
    const el = findTarget(step?.target)
    // Phones dock the card at the bottom, so the target goes to the top half.
    el?.scrollIntoView?.({ block: innerWidth < 640 ? 'start' : 'center', behavior: 'auto' })
    measure()
    // Keep following the target: a panel that opens or slides (Properties,
    // a sheet settling) moves it without any resize or scroll event.
    let raf = 0
    const loop = (): void => { measure(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    next.current?.focus()
    return () => cancelAnimationFrame(raf)
  }, [step, measure])

  useEffect(() => {
    addEventListener('resize', measure)
    addEventListener('scroll', measure, true)
    return () => { removeEventListener('resize', measure); removeEventListener('scroll', measure, true) }
  }, [measure])

  useEffect(() => { if (step) onStep?.(i, step) }, [i, step]) // eslint-disable-line react-hooks/exhaustive-deps

  // An interactive step moves on once its target was clicked.
  const goRef = useRef<(d: number) => void>(() => {})
  useEffect(() => {
    if (!step?.interactive) return
    const el = findTarget(step.target)
    if (!el) return
    let t = 0
    const onClick = (): void => { t = window.setTimeout(() => goRef.current(1), 400) }
    el.addEventListener('click', onClick)
    return () => { el.removeEventListener('click', onClick); window.clearTimeout(t) }
  }, [step])

  const go = useCallback((d: number) => {
    if (d > 0 && last) return onClose(true)
    setI((x) => Math.max(0, Math.min(live.length - 1, x + d)))
  }, [last, live.length, onClose])
  goRef.current = go

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(false) }
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [go, onClose])

  if (!step) { queueMicrotask(() => onClose(false)); return null }

  // Phone: a target in the lower half (a bottom sheet) gets the card on top.
  const dockTop = place.mode === 'docked' && !!rect && rect.top + rect.height / 2 > innerHeight / 2
  const floatStyle = place.mode === 'float' ? { top: place.top, left: place.left } : undefined
  // Portalled to <body>: inside a panel with a transform, `position: fixed`
  // would be relative to that panel and every highlight would land off target.
  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }} aria-live="polite">
      {/* Click shield + dim. With a target, the dim is the spotlight's shadow instead. */}
      {rect && step.interactive ? (
        // Four shields around the target: the click it asks for goes through.
        shieldsAround(rect).map((st, k) => <div key={k} data-tour-shield className="absolute pointer-events-auto" style={st} onClick={(e) => e.stopPropagation()} />)
      ) : (
        <div data-tour-shield className="absolute inset-0 pointer-events-auto" style={{ background: rect ? 'transparent' : 'color-mix(in srgb, var(--scrim) 55%, transparent)' }} onClick={(e) => e.stopPropagation()} />
      )}
      {rect && (
        <div aria-hidden className="absolute rounded-[10px] pointer-events-none transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: '0 0 0 9999px color-mix(in srgb, var(--scrim) 55%, transparent), 0 0 0 2px var(--accent)' }} />
      )}
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={place.mode === 'docked'
          ? (dockTop ? 'absolute pointer-events-auto inset-x-3 top-[max(12px,env(safe-area-inset-top))] rounded-[14px]' : 'absolute pointer-events-auto inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] rounded-[14px]')
          : 'absolute pointer-events-auto w-[340px] max-w-[calc(100vw-32px)] rounded-[12px]'}
        style={floatStyle}>
        <div className="border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl rounded-[inherit] p-4 max-h-[calc(100dvh-32px)] overflow-y-auto overscroll-contain">
          <p className="text-[11px] text-[var(--text-faint)] tabular-nums">{tx('{{title}} · {{n}} of {{total}}', { title: tx(title), n: i + 1, total: live.length })}</p>
          <h2 id={titleId} className="mt-1 text-[14.5px] font-semibold [overflow-wrap:anywhere]">{tx(step.title)}</h2>
          <p className="mt-1 text-[13px] text-[var(--text-dim)] leading-[1.5] [overflow-wrap:anywhere]">{tx(step.body)}</p>
          <div className="mt-3 flex items-center gap-2">
            <div aria-hidden className="flex gap-1 mr-auto">
              {live.map((_, k) => <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: k === i ? 'var(--text)' : 'var(--border)' }} />)}
            </div>
            {!last && <button onClick={() => onClose(false)} className="h-[32px] px-2 text-[12.5px] text-[var(--text-faint)] hover:text-[var(--text)]">{tx("Skip")}</button>}
            {i > 0 && <button onClick={() => go(-1)} className="h-[32px] px-3 rounded-[7px] border border-[var(--border)] text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)]">{tx("Back")}</button>}
            <button ref={next} onClick={() => go(1)} className="h-[32px] px-3.5 rounded-[7px] bg-[var(--accent)] text-[var(--accent-contrast)] text-[12.5px] font-medium hover:brightness-110">{last ? tx("Done") : tx("Next")}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
