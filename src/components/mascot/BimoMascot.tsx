// ─── BimoMascot ───────────────────────────────────────────────────────────────
// Bimo, the product mascot, as a React component. Two placements:
//
//   variant="landing"  perched on the hero preview card (parent positions it)
//   variant="blog"     a small reading companion fixed to the bottom-right
//                      corner of blog posts; reacts to scrolling, celebrates
//                      when the reader reaches the end, and can be hidden
//                      (remembered per browser)
//
// Cost control: three.js and the 2 MB GLB load only once the canvas is near
// the viewport (dynamic import), rendering pauses when it leaves it or the
// tab is hidden, and the canvas is small. Under prefers-reduced-motion he
// still reacts, but without jumps or spins (handled in the runtime).
//
// Copy lives in the `common` namespace under `mascot.*` (all 10 locales).

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Bimo } from './bimoRuntime'

type Variant = 'landing' | 'blog'

const IDLE_BEATS: Record<Variant, string[]> = {
  landing: ['curious', 'listening', 'wink', 'nod', 'point_left', 'thinking'],
  blog: ['listening', 'thinking', 'curious', 'nod', 'point_left'],
}
const CLICK_BEATS = ['celebrate', 'laugh', 'wink', 'love', 'nod']
const HIDE_KEY = 'bimo-hidden'

function readHidden() {
  try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
}

export default function BimoMascot({ className = '', variant = 'landing' }: { className?: string; variant?: Variant }) {
  const { t } = useTranslation('common', { keyPrefix: 'mascot' })
  const blog = variant === 'blog'
  const [hidden, setHidden] = useState(() => blog && readHidden())
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bimo = useRef<Bimo | null>(null)
  const [ready, setReady] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const clicks = useRef(0)
  const tRef = useRef(t)
  tRef.current = t

  const tips = () => blog
    ? [tRef.current('blogTip1'), tRef.current('blogTip2'), tRef.current('blogTip3')]
    : [tRef.current('tip1'), tRef.current('tip2'), tRef.current('tip3')]

  const bubbleTimer = useRef(0)
  function say(text: string, ms = 3400) {
    setBubble(text)
    bimo.current?.say(Math.min(ms, 2200))
    window.clearTimeout(bubbleTimer.current)
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms)
  }

  // mount lazily once visible
  useEffect(() => {
    const el = wrap.current
    if (!el || hidden) return
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
        window.setTimeout(() => say(tRef.current(blog ? 'blogHello' : 'hello'), 3800), 700)
      } catch {
        // WebGL unavailable or asset failed: the page works fine without him.
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
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden])

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

  // blog: glance at the text while scrolling, celebrate at the end
  useEffect(() => {
    if (!blog || !ready) return
    let settle = 0, done = false
    const onScroll = () => {
      const b = bimo.current
      if (!b) return
      b.lookAt(-0.9, -0.5)                     // eyes toward the article column
      window.clearTimeout(settle)
      settle = window.setTimeout(() => bimo.current?.lookAt(0, 0), 700)
      const max = document.documentElement.scrollHeight - innerHeight
      if (!done && max > 400 && scrollY / max > 0.97) {
        done = true
        b.play('celebrate')
        window.setTimeout(() => say(tRef.current('blogDone'), 4500), 900)
      }
    }
    addEventListener('scroll', onScroll, { passive: true })
    return () => { removeEventListener('scroll', onScroll); window.clearTimeout(settle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blog, ready])

  // occasional idle beats so he's never a frozen loop
  useEffect(() => {
    if (!ready) return
    const beats = IDLE_BEATS[variant]
    let id = 0
    const schedule = () => {
      id = window.setTimeout(() => {
        const b = bimo.current
        if (b && (b.state === 'idle' || beats.includes(b.state))) {
          const beat = beats[Math.floor(Math.random() * beats.length)]
          b.play(beat)
          if (!b.meta.oneshots.includes(beat)) window.setTimeout(() => bimo.current?.state === beat && bimo.current.play('idle'), 2600)
        }
        schedule()
      }, 7000 + Math.random() * 6000)
    }
    schedule()
    return () => window.clearTimeout(id)
  }, [ready, variant])

  function onClick() {
    const b = bimo.current
    if (!b) return
    const i = clicks.current++
    b.play(CLICK_BEATS[i % CLICK_BEATS.length])
    const list = tips()
    window.setTimeout(() => say(list[i % list.length]), 900)
  }

  function hide() {
    try { localStorage.setItem(HIDE_KEY, '1') } catch { /* private mode: hide for this visit only */ }
    setHidden(true)
  }

  if (hidden) return null

  const placement = blog
    ? 'fixed z-30 right-3 sm:right-5 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] w-[96px] h-[96px] sm:w-[124px] sm:h-[124px]'
    : ''

  return (
    <div ref={wrap} className={`pointer-events-none select-none group ${placement} ${className}`}>
      {bubble && (
        <div
          role="status"
          className={`absolute right-[70%] ${blog ? 'bottom-[78%]' : 'top-[6%]'} w-[190px] sm:w-[230px] rounded-2xl rounded-br-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[12px] sm:text-[12.5px] leading-snug text-[var(--text)] shadow-[0_12px_40px_-12px_rgba(94,106,210,0.45)] animate-[bimoBubble_.35s_cubic-bezier(.2,1.4,.4,1)]`}
        >
          {bubble}
        </div>
      )}
      {blog && ready && (
        <button
          type="button"
          onClick={hide}
          aria-label={t('hide')}
          title={t('hide')}
          className="pointer-events-auto absolute right-0 top-0 w-6 h-6 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] text-[13px] leading-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
      <canvas
        ref={canvas}
        onClick={onClick}
        onPointerEnter={() => bimo.current?.state === 'idle' && bimo.current.play('happy')}
        onPointerLeave={() => bimo.current?.state === 'happy' && bimo.current.play('idle')}
        aria-label={t('label')}
        role="img"
        className={`pointer-events-auto cursor-pointer w-full h-full transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
      <style>{`@keyframes bimoBubble{from{opacity:0;transform:translateY(6px) scale(.9)}to{opacity:1;transform:none}}@media (prefers-reduced-motion: reduce){[role=status]{animation:none!important}}`}</style>
    </div>
  )
}
