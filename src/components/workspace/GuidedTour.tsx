// Guided tour overlay: dims the page, cuts a spotlight around the step's
// `data-tour` anchor and shows a small card next to it (docked to the bottom
// on phones). Steps whose anchor isn't on screen are skipped, so one tour
// works on an empty account, a phone and a desktop. Keyboard: ← → to move,
// Esc to leave. The page underneath is not clickable while the tour runs —
// a tour explains, it doesn't act.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { placeCard, type Placement, type Rect, type TourStep } from '../../lib/workspace-tours/tours'
import { useTx } from './i18n'

const PAD = 6

function findTarget(id?: string): HTMLElement | null {
  if (!id) return null
  // The same anchor can exist twice (phone select + desktop tabs): take the visible one.
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el
  }
  return null
}

export default function GuidedTour({ title, steps, onClose }: { title: string; steps: TourStep[]; onClose: (finished: boolean) => void }) {
  const tx = useTx()
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
    const r = el?.getBoundingClientRect()
    const tr = r ? { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null
    setRect(tr)
    const c = card.current?.getBoundingClientRect()
    setPlace(placeCard(tr, { width: c?.width ?? 340, height: c?.height ?? 180 }, { width: innerWidth, height: innerHeight }))
  }, [step])

  // Bring the target into view, then measure once it has settled.
  useLayoutEffect(() => {
    const el = findTarget(step?.target)
    // Phones dock the card at the bottom, so the target goes to the top half.
    el?.scrollIntoView?.({ block: innerWidth < 640 ? 'start' : 'center', behavior: 'auto' })
    measure()
    const raf = requestAnimationFrame(measure)
    next.current?.focus()
    return () => cancelAnimationFrame(raf)
  }, [step, measure])

  useEffect(() => {
    addEventListener('resize', measure)
    addEventListener('scroll', measure, true)
    return () => { removeEventListener('resize', measure); removeEventListener('scroll', measure, true) }
  }, [measure])

  const go = useCallback((d: number) => {
    if (d > 0 && last) return onClose(true)
    setI((x) => Math.max(0, Math.min(live.length - 1, x + d)))
  }, [last, live.length, onClose])

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

  const floatStyle = place.mode === 'float' ? { top: place.top, left: place.left } : undefined
  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* Click shield + dim. With a target, the dim is the spotlight's shadow instead. */}
      <div className="absolute inset-0" style={{ background: rect ? 'transparent' : 'rgba(0,0,0,0.55)' }} onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div aria-hidden className="absolute rounded-[10px] pointer-events-none transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 2px var(--accent)' }} />
      )}
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={place.mode === 'docked'
          ? 'absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] rounded-[14px]'
          : 'absolute w-[340px] rounded-[12px]'}
        style={floatStyle}>
        <div className="border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl rounded-[inherit] p-4">
          <p className="text-[11px] text-[var(--text-faint)] tabular-nums">{tx('{{title}} · {{n}} of {{total}}', { title: tx(title), n: i + 1, total: live.length })}</p>
          <h2 id={titleId} className="mt-1 text-[14.5px] font-semibold [overflow-wrap:anywhere]">{tx(step.title)}</h2>
          <p className="mt-1 text-[13px] text-[var(--text-dim)] leading-[1.5] [overflow-wrap:anywhere]">{tx(step.body)}</p>
          <div className="mt-3 flex items-center gap-2">
            <div aria-hidden className="flex gap-1 mr-auto">
              {live.map((_, k) => <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: k === i ? 'var(--text)' : 'var(--border)' }} />)}
            </div>
            {!last && <button onClick={() => onClose(false)} className="h-[32px] px-2 text-[12.5px] text-[var(--text-faint)] hover:text-[var(--text)]">{tx("Skip")}</button>}
            {i > 0 && <button onClick={() => go(-1)} className="h-[32px] px-3 rounded-[7px] border border-[var(--border)] text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)]">{tx("Back")}</button>}
            <button ref={next} onClick={() => go(1)} className="h-[32px] px-3.5 rounded-[7px] bg-[var(--accent)] text-white text-[12.5px] font-medium hover:brightness-110">{last ? tx("Done") : tx("Next")}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
