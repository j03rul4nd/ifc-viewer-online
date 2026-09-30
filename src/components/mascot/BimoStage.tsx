// ─── Bimo stages ──────────────────────────────────────────────────────────────
// Large-format layouts built around the full rigged 3D Bimo, for the moments
// where the mascot is the point of the screen rather than a garnish:
//
//   <BimoStage>       the core: big 3D Bimo with the SVG as poster/fallback,
//                     an optional speech bubble, and a clip that can change
//   <BimoHero>        headline + copy + actions beside a big Bimo
//   <BimoCover>       a framed cover card (article header, docs landing, promo)
//   <BimoSection>     split content section; Bimo plays a moment when the
//                     section scrolls into view
//   <BimoState>       full empty/edge states with presets: notFound,
//                     unsupported, docs, offline, error, empty, comingSoon,
//                     success (copy in common.json → mascot.states.*)
//
// Performance contract (same as every Bimo, see bimoLoadPolicy.ts): the SVG
// paints first and is what crawlers see; the 3D chunk and the ~200 KB GLB load
// only after the page is idle, on a capable device, when the stage is on
// screen, and within the page's live-instance budget. Text is plain DOM, never
// inside the canvas, so headings stay indexable and selectable.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Bimo from './Bimo'
import BimoLive from './BimoLive'
import type { Bimo as BimoInstance } from './bimoRuntime'
import { isBimoEmotion, type BimoEmotion } from './bimo-face'
import './bimo.css'

// ── core stage ────────────────────────────────────────────────────────────────

export interface BimoStageProps {
  /** Any clip from mascot.json. Emotions also drive the SVG poster. */
  clip?: string
  /** Entrance clip when the 3D model appears. */
  entrance?: string
  /** Rendered box (px); the stage is square. */
  size?: number
  /** Speech bubble text (plain string, already translated). */
  say?: string | null
  bubbleSide?: 'left' | 'right'
  /** Eyes and head follow the pointer. */
  track?: boolean
  /** Clicking Bimo plays this one-shot (default 'celebrate'). */
  boopClip?: string
  onInstance?: (b: BimoInstance | null) => void
  className?: string
}

/** Clips that have no SVG face of their own map to the closest emotion. */
const POSTER: Record<string, BimoEmotion> = {
  listening: 'curious', talking: 'happy', loading: 'thinking', confused: 'curious',
  error: 'sad', point_left: 'happy', point_right: 'happy', shy: 'love', dance: 'excited',
  laugh: 'happy', hello: 'wave', celebrate: 'excited', nod: 'happy', shake: 'sad',
  wink: 'happy', jump: 'excited',
}
const posterFor = (clip: string): BimoEmotion => (isBimoEmotion(clip) ? clip : POSTER[clip] ?? 'idle')

export function BimoStage({
  clip = 'idle', entrance = 'hello', size = 320, say, bubbleSide = 'left', track = true,
  boopClip = 'celebrate', onInstance, className = '',
}: BimoStageProps) {
  const [is3D, setIs3D] = useState(false)
  const [boop, setBoop] = useState(0)
  const inst = useRef<BimoInstance | null>(null)
  const setInst = useCallback((b: BimoInstance | null) => { inst.current = b; onInstance?.(b) }, [onInstance])

  // Advanced interactions, by body part (ray-cast against the skinned mesh):
  // antenna → boing, face → giggle, head → tilt, body → squish,
  // arm → wave, foot → jump. Keyboard/SVG fall back to the one-shot boop.
  const onPoke = (e: React.MouseEvent) => {
    const b = inst.current
    if (!b || e.detail === 0) { setBoop((n) => n + 1); return }
    const part = b.pick(e.clientX, e.clientY)
    switch (part) {
      case 'antenna': b.micro('boing'); break
      case 'face': b.micro('giggle'); b.micro('blink'); break
      case 'head': b.micro('tilt'); b.micro('giggle', 0.6); break
      case 'body': b.micro('squish'); break
      case 'arm': b.play('wave'); break
      case 'foot': b.play('jump'); break
      default: setBoop((n) => n + 1)
    }
  }
  // Petting: stroke the head/face back and forth and he melts.
  const rub = useRef({ dist: 0, t: 0, x: 0, y: 0 })
  const onRub = (e: React.PointerEvent) => {
    const b = inst.current
    if (!b) return
    const r = rub.current, now = performance.now()
    if (now - r.t > 400) r.dist = 0
    const part = b.pick(e.clientX, e.clientY)
    if (part === 'head' || part === 'face') r.dist += Math.hypot(e.clientX - r.x, e.clientY - r.y)
    r.x = e.clientX; r.y = e.clientY; r.t = now
    if (r.dist > 260) { r.dist = -600; b.micro('heart'); b.micro('squish', 0.5) }
  }

  // lip-flap while a bubble is showing
  useEffect(() => { if (say && is3D) inst.current?.say(Math.min(2600, 700 + say.length * 35)) }, [say, is3D])

  return (
    <div
      className={`bimo-stage relative shrink-0 select-none ${className}`}
      style={{ width: size, height: size, maxWidth: '100%', aspectRatio: '1 / 1' }}
    >
      {/* Poster: the SVG twin, centred on the same footprint as the 3D body. */}
      <div
        className="absolute inset-0 grid place-items-center transition-opacity duration-500"
        style={{ opacity: is3D ? 0 : 1 }}
      >
        <Bimo emotion={posterFor(clip)} size={Math.round(size * 0.62)} live={false} />
      </div>
      <BimoLive
        clip={clip}
        entrance={entrance}
        boopKey={boop}
        boopClip={boopClip}
        distance={2.9}
        targetY={0.5}
        track={track}
        onReady={setIs3D}
        onInstance={setInst}
        className="absolute inset-0"
      />
      <button
        type="button"
        aria-label="Bimo"
        onClick={onPoke}
        onPointerEnter={() => inst.current?.micro('perk', 0.6)}
        onPointerMove={onRub}
        className="absolute left-[18%] right-[18%] top-[4%] bottom-[4%] rounded-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
      {say && (
        <div
          role="status"
          className={`bimo-bubble absolute top-[4%] ${bubbleSide === 'left' ? 'right-[74%] rounded-br-md' : 'left-[74%] rounded-bl-md'} w-max max-w-[min(260px,60vw)] rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-[13px] leading-snug text-[var(--text)] shadow-[0_14px_40px_-14px_rgba(94,106,210,0.5)]`}
        >
          {say}
        </div>
      )}
    </div>
  )
}

// ── shared bits ───────────────────────────────────────────────────────────────

function Glow({ className = '' }: { className?: string }) {
  // brand-palette halo behind the stage; pure CSS, no extra requests
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full blur-3xl ${className}`}
      style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 38%, transparent), transparent)' }}
    />
  )
}

export interface BimoAction { label: string; onClick?: () => void; href?: string; primary?: boolean }

function Actions({ actions }: { actions?: BimoAction[] }) {
  if (!actions?.length) return null
  return (
    <div className="mt-6 flex flex-wrap gap-2.5">
      {actions.map((a) => {
        const cls = `inline-flex items-center h-10 px-4 rounded-xl text-[13.5px] font-semibold transition-all ${a.primary
          ? 'bg-[var(--accent)] text-white hover:brightness-110'
          : 'border border-[var(--border-strong)] text-[var(--text)] hover:border-[var(--accent)]'}`
        return a.href
          ? <a key={a.label} href={a.href} onClick={a.onClick} className={cls}>{a.label}</a>
          : <button key={a.label} type="button" onClick={a.onClick} className={cls}>{a.label}</button>
      })}
    </div>
  )
}

// ── hero ──────────────────────────────────────────────────────────────────────

export interface BimoHeroProps {
  eyebrow?: string
  title: React.ReactNode
  body?: React.ReactNode
  actions?: BimoAction[]
  clip?: string
  say?: string
  /** Bimo on the right (default) or left. */
  side?: 'left' | 'right'
  size?: number
  className?: string
}

export function BimoHero({ eyebrow, title, body, actions, clip = 'wave', say, side = 'right', size = 380, className = '' }: BimoHeroProps) {
  return (
    <section className={`relative overflow-hidden px-4 sm:px-8 py-14 sm:py-20 ${className}`}>
      <div className={`relative mx-auto max-w-[1120px] flex flex-col items-center gap-8 md:gap-14 ${side === 'right' ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
        <div className="min-w-0 flex-1 text-center md:text-left">
          {eyebrow && <p className="mb-3 text-[11.5px] font-medium uppercase tracking-[0.14em] text-[var(--accent-2)]">{eyebrow}</p>}
          <h1 className="text-[clamp(32px,5vw,56px)] font-semibold leading-[1.04] tracking-[-0.03em] text-[var(--text)] [text-wrap:balance]">{title}</h1>
          {body && <p className="mt-4 max-w-[52ch] mx-auto md:mx-0 text-[16px] leading-relaxed text-[var(--text-dim)]">{body}</p>}
          <div className="flex justify-center md:justify-start"><Actions actions={actions} /></div>
        </div>
        <div className="relative grid place-items-center">
          <Glow className="inset-[-10%]" />
          <BimoStage clip={clip} size={size} say={say} bubbleSide={side === 'right' ? 'left' : 'right'} />
        </div>
      </div>
    </section>
  )
}

// ── cover ─────────────────────────────────────────────────────────────────────

export interface BimoCoverProps {
  kicker?: string
  title: React.ReactNode
  meta?: React.ReactNode
  clip?: string
  /** Cover proportions: wide banner or 1.91:1 social-card shape. */
  shape?: 'banner' | 'card'
  className?: string
}

export function BimoCover({ kicker, title, meta, clip = 'curious', shape = 'banner', className = '' }: BimoCoverProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[var(--border)] ${className}`}
      style={{
        aspectRatio: shape === 'card' ? '1.91 / 1' : '3 / 1',
        background: 'radial-gradient(120% 140% at 85% 20%, color-mix(in srgb, var(--accent) 28%, var(--surface)) 0%, var(--surface) 55%, var(--bg) 100%)',
        minHeight: 220,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.35]"
        style={{ backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '32px 32px', maskImage: 'radial-gradient(80% 90% at 80% 40%, black, transparent)' }}
      />
      <div className="relative h-full flex items-center gap-4 px-5 sm:px-10">
        <div className="min-w-0 flex-1">
          {kicker && <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent-2)]">{kicker}</p>}
          <h2 className="text-[clamp(20px,3.2vw,40px)] font-semibold leading-[1.08] tracking-[-0.025em] text-[var(--text)] [text-wrap:balance]">{title}</h2>
          {meta && <div className="mt-3 text-[12.5px] text-[var(--text-dim)]">{meta}</div>}
        </div>
        <BimoStage clip={clip} size={shape === 'card' ? 260 : 220} track={false} className="-mb-6 self-end" />
      </div>
    </div>
  )
}

// ── section ───────────────────────────────────────────────────────────────────

export interface BimoSectionProps {
  eyebrow?: string
  title: React.ReactNode
  children?: React.ReactNode
  /** Loop while in view. */
  clip?: string
  /** One-shot played the first time the section scrolls into view. */
  onEnter?: string
  say?: string
  side?: 'left' | 'right'
  size?: number
  className?: string
}

export function BimoSection({ eyebrow, title, children, clip = 'idle', onEnter = 'hello', say, side = 'left', size = 280, className = '' }: BimoSectionProps) {
  const ref = useRef<HTMLElement>(null)
  const [entered, setEntered] = useState(false)
  const inst = useRef<BimoInstance | null>(null)
  const [bubble, setBubble] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || entered) return
    const io = new IntersectionObserver(([e]) => { if (e.intersectionRatio > 0.45) setEntered(true) }, { threshold: [0, 0.45] })
    io.observe(el)
    return () => io.disconnect()
  }, [entered])

  useEffect(() => {
    if (!entered) return
    inst.current?.play(onEnter)
    if (say) { setBubble(say); const t = window.setTimeout(() => setBubble(null), 4200); return () => window.clearTimeout(t) }
  }, [entered, onEnter, say])

  return (
    <section ref={ref} className={`relative px-4 sm:px-8 py-12 sm:py-16 ${className}`}>
      <div className={`mx-auto max-w-[1040px] flex flex-col items-center gap-8 md:gap-12 ${side === 'left' ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
        <div className="relative grid place-items-center">
          <Glow className="inset-[5%]" />
          <BimoStage
            clip={clip}
            entrance={clip}
            size={size}
            say={bubble}
            bubbleSide={side === 'left' ? 'right' : 'left'}
            onInstance={(b) => { inst.current = b; if (b && entered) b.play(onEnter) }}
          />
        </div>
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.14em] text-[var(--accent-2)]">{eyebrow}</p>}
          <h2 className="text-[clamp(22px,3vw,34px)] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--text)] [text-wrap:balance]">{title}</h2>
          {children && <div className="mt-3 text-[15px] leading-relaxed text-[var(--text-dim)]">{children}</div>}
        </div>
      </div>
    </section>
  )
}

// ── states (404, unsupported, docs…) ─────────────────────────────────────────

export const BIMO_STATES = {
  notFound:    { clip: 'confused',    entrance: 'shake' },
  unsupported: { clip: 'sad',         entrance: 'shake' },
  docs:        { clip: 'point_right', entrance: 'hello' },
  offline:     { clip: 'sleepy',      entrance: 'sleepy' },
  error:       { clip: 'error',       entrance: 'surprised' },
  empty:       { clip: 'curious',     entrance: 'hello' },
  comingSoon:  { clip: 'loading',     entrance: 'wink' },
  success:     { clip: 'happy',       entrance: 'celebrate' },
} as const

export type BimoStateKind = keyof typeof BIMO_STATES

export interface BimoStateProps {
  kind: BimoStateKind
  /** Override the preset copy (already translated). */
  title?: React.ReactNode
  body?: React.ReactNode
  /** Small monospace detail, e.g. the missing path or the error code. */
  detail?: string
  actions?: BimoAction[]
  size?: number
  /** Fill the viewport height (page-level states like a 404). */
  fullPage?: boolean
  className?: string
}

export function BimoState({ kind, title, body, detail, actions, size = 260, fullPage = false, className = '' }: BimoStateProps) {
  const { t } = useTranslation('common', { keyPrefix: 'mascot.states' })
  const tx = t as unknown as (k: string) => string
  const preset = BIMO_STATES[kind]
  return (
    <section
      className={`relative flex flex-col items-center justify-center text-center px-4 py-12 ${fullPage ? 'min-h-[80vh]' : ''} ${className}`}
      aria-labelledby={`bimo-state-${kind}`}
    >
      <div className="relative grid place-items-center">
        <Glow className="inset-[8%]" />
        <BimoStage clip={preset.clip} entrance={preset.entrance} size={size} />
      </div>
      <p className="mt-2 text-[11.5px] font-medium uppercase tracking-[0.14em] text-[var(--accent-2)]">{tx(`${kind}.eyebrow`)}</p>
      <h2 id={`bimo-state-${kind}`} className="mt-2 text-[clamp(22px,3.4vw,34px)] font-semibold tracking-[-0.025em] text-[var(--text)] [text-wrap:balance]">
        {title ?? tx(`${kind}.title`)}
      </h2>
      <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[var(--text-dim)]">{body ?? tx(`${kind}.body`)}</p>
      {detail && (
        <code className="mt-4 max-w-full overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-mono text-[var(--text-dim)]">
          {detail}
        </code>
      )}
      <div className="flex justify-center"><Actions actions={actions} /></div>
    </section>
  )
}
