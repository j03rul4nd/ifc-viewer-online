// ─── BimoMascot ───────────────────────────────────────────────────────────────
// Bimo perched on the edge of the landing's hero preview card.
//
// Cost control: three.js and the 2 MB GLB load only once the perch scrolls
// into view (dynamic import), rendering pauses when it leaves the viewport or
// the tab is hidden, and the canvas is small. Under prefers-reduced-motion he
// still reacts, but without jumps or spins (handled in the runtime).
//
// Behaviour, so he feels like a character rather than a looping GIF:
//   enter → 'hello' pop + greeting bubble; cursor → eyes then head follow;
//   hover → happy; click → a short rotation of reactions with a tip bubble;
//   left alone → an occasional idle beat (curious, listen, wink…).

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Bimo } from './bimoRuntime'

const IDLE_BEATS = ['curious', 'listening', 'wink', 'nod', 'point_left', 'thinking']
const CLICK_BEATS = ['celebrate', 'laugh', 'wink', 'love', 'nod']

export default function BimoMascot({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bimo = useRef<Bimo | null>(null)
  const [ready, setReady] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const clicks = useRef(0)

  const tips = [
    t('mascot.tip1', { defaultValue: 'Drop an .ifc file and I’ll open it right in your browser.' }),
    t('mascot.tip2', { defaultValue: 'Nothing gets uploaded. Your model stays on your machine.' }),
    t('mascot.tip3', { defaultValue: 'Try the validator. I love a clean IDS report.' }),
  ]

  // mount lazily once visible
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    let cancelled = false
    let started = false
    const io = new IntersectionObserver(async ([e]) => {
      if (bimo.current) bimo.current.setPaused(!e.isIntersecting || document.hidden)
      if (!e.isIntersecting || started) return
      started = true
      try {
        const { createBimo } = await import('./bimoRuntime')
        if (cancelled || !canvas.current) return
        bimo.current = await createBimo({ canvas: canvas.current, distance: 3.0, targetY: 0.52 })
        if (cancelled) { bimo.current.dispose(); bimo.current = null; return }
        setReady(true)
        window.setTimeout(() => say(t('mascot.hello', { defaultValue: 'Hi, I’m Bimo! Drop an IFC and I’ll show you around.' }), 3800), 700)
      } catch {
        // WebGL unavailable or asset failed: the landing works fine without him.
      }
    }, { rootMargin: '120px' })
    io.observe(el)
    const onVis = () => bimo.current?.setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      bimo.current?.dispose(); bimo.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // gaze follows the cursor anywhere on the page
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = canvas.current?.getBoundingClientRect()
      if (!r || !bimo.current) return
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.45
      bimo.current.lookAt((e.clientX - cx) / (innerWidth * 0.35), -(e.clientY - cy) / (innerHeight * 0.35))
    }
    const onResize = () => bimo.current?.resize()
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('resize', onResize)
    return () => { removeEventListener('pointermove', onMove); removeEventListener('resize', onResize) }
  }, [])

  // occasional idle beats so he's never a frozen loop
  useEffect(() => {
    if (!ready) return
    let id = 0
    const schedule = () => {
      id = window.setTimeout(() => {
        const b = bimo.current
        if (b && (b.state === 'idle' || IDLE_BEATS.includes(b.state))) {
          const beat = IDLE_BEATS[Math.floor(Math.random() * IDLE_BEATS.length)]
          b.play(beat)
          if (!b.meta.oneshots.includes(beat)) window.setTimeout(() => bimo.current?.state === beat && bimo.current.play('idle'), 2600)
        }
        schedule()
      }, 7000 + Math.random() * 6000)
    }
    schedule()
    return () => window.clearTimeout(id)
  }, [ready])

  const bubbleTimer = useRef(0)
  function say(text: string, ms = 3200) {
    setBubble(text)
    bimo.current?.say(Math.min(ms, 2200))
    window.clearTimeout(bubbleTimer.current)
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms)
  }

  function onClick() {
    const b = bimo.current
    if (!b) return
    const i = clicks.current++
    b.play(CLICK_BEATS[i % CLICK_BEATS.length])
    window.setTimeout(() => say(tips[i % tips.length]), 900)
  }

  return (
    <div ref={wrap} className={`pointer-events-none select-none ${className}`}>
      {bubble && (
        <div
          role="status"
          className="absolute right-[70%] top-[6%] w-[200px] sm:w-[230px] rounded-2xl rounded-br-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[12px] sm:text-[12.5px] leading-snug text-[var(--text)] shadow-[0_12px_40px_-12px_rgba(94,106,210,0.45)] animate-[bimoBubble_.35s_cubic-bezier(.2,1.4,.4,1)]"
        >
          {bubble}
        </div>
      )}
      <canvas
        ref={canvas}
        onClick={onClick}
        onPointerEnter={() => bimo.current?.state === 'idle' && bimo.current.play('happy')}
        onPointerLeave={() => bimo.current?.state === 'happy' && bimo.current.play('idle')}
        aria-label={t('mascot.label', { defaultValue: 'Bimo, the IFC Viewer mascot' })}
        role="img"
        className={`pointer-events-auto cursor-pointer w-full h-full transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
      <style>{`@keyframes bimoBubble{from{opacity:0;transform:translateY(6px) scale(.9)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}
