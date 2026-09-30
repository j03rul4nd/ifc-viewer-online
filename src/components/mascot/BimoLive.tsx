// ─── BimoLive ─────────────────────────────────────────────────────────────────
// The upgrade layer: mounts the real rigged GLB over an SVG Bimo once the load
// policy allows it (capable device, page idle, on screen, a free live slot),
// and tells the parent when the first 3D frame is up so it can fade the SVG.
// Until then — and forever on devices that fail the policy — it renders
// nothing, so the SVG stays the whole story for crawlers and slow devices.
//
// Used by Bimo.tsx (inline sizes) and BimoStage (heroes, covers, sections).

import { useEffect, useRef, useState } from 'react'
import type { Bimo as BimoInstance } from './bimoRuntime'
import { canRender3D, claimSlot, markSlot, releaseSlot, whenIdle } from './bimoLoadPolicy'

export interface BimoLiveProps {
  /** Clip to hold (any name from mascot.json: emotions, states, moments). */
  clip: string
  /** Bump to play `boopClip` once. */
  boopKey?: number
  boopClip?: string
  /** First clip when the model appears (default: 'hello'). */
  entrance?: string
  /** Camera distance and look-at height; defaults frame the full body. */
  distance?: number
  targetY?: number
  /** Eyes/head follow the pointer. */
  track?: boolean
  onReady?: (ready: boolean) => void
  /** Imperative access for stage components (say, play, lookAt). */
  onInstance?: (b: BimoInstance | null) => void
  className?: string
}

export default function BimoLive({
  clip, boopKey = 0, boopClip = 'wink', entrance = 'hello', distance = 3.0, targetY = 0.52,
  track = true, onReady, onInstance, className = '',
}: BimoLiveProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const inst = useRef<BimoInstance | null>(null)
  const [ready, setReady] = useState(false)
  const [eligible, setEligible] = useState(false)
  const clipRef = useRef(clip)
  clipRef.current = clip

  useEffect(() => { if (canRender3D()) whenIdle().then(() => setEligible(true)) }, [])

  useEffect(() => {
    if (!eligible || !host.current) return
    let slot: ReturnType<typeof claimSlot> = null
    let mounting = false
    let alive = true

    const release = () => {
      inst.current?.dispose(); inst.current = null
      onInstance?.(null)
      setReady(false); onReady?.(false)
      slot = null
    }
    const mount = async () => {
      if (mounting || inst.current) return
      slot = claimSlot(release)
      if (!slot) return
      mounting = true
      try {
        const { createBimo } = await import('./bimoRuntime')
        if (!alive || !canvas.current || !slot) return
        const b = await createBimo({ canvas: canvas.current, distance, targetY, initial: entrance })
        if (!alive || !slot) { b.dispose(); return }
        inst.current = b
        onInstance?.(b)
        if (entrance !== clipRef.current) window.setTimeout(() => inst.current?.play(clipRef.current), 1500)
        // two frames: the first real render has landed before we swap
        requestAnimationFrame(() => requestAnimationFrame(() => { if (alive) { setReady(true); onReady?.(true) } }))
      } catch {
        releaseSlot(slot); slot = null   // stay on the SVG
      } finally {
        mounting = false
      }
    }

    const io = new IntersectionObserver(([e]) => {
      if (slot) markSlot(slot, e.isIntersecting)
      inst.current?.setPaused(!e.isIntersecting || document.hidden)
      if (e.isIntersecting) void mount()
    }, { rootMargin: '160px' })
    io.observe(host.current)
    const onVis = () => inst.current?.setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      releaseSlot(slot)
      inst.current?.dispose(); inst.current = null
      onInstance?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible])

  useEffect(() => { if (ready) inst.current?.play(clip) }, [clip, ready])
  useEffect(() => { if (ready && boopKey) inst.current?.play(boopClip) }, [boopKey, ready, boopClip])

  useEffect(() => {
    if (!ready || !track) return
    let raf = 0, last: PointerEvent | null = null
    const apply = () => {
      raf = 0
      const r = canvas.current?.getBoundingClientRect()
      if (!r || !last || !inst.current) return
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.45
      inst.current.lookAt((last.clientX - cx) / (innerWidth * 0.35), -(last.clientY - cy) / (innerHeight * 0.35))
    }
    const onMove = (e: PointerEvent) => { last = e; if (!raf) raf = requestAnimationFrame(apply) }
    const onResize = () => inst.current?.resize()
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('resize', onResize)
    return () => { removeEventListener('pointermove', onMove); removeEventListener('resize', onResize); cancelAnimationFrame(raf) }
  }, [ready, track])

  if (!eligible) return null
  return (
    <div ref={host} aria-hidden="true" className={`pointer-events-none ${className}`}>
      <canvas
        ref={canvas}
        className="block w-full h-full transition-opacity duration-500"
        style={{ opacity: ready ? 1 : 0 }}
      />
    </div>
  )
}
