import React from 'react'
import { faceFor, gazeOffset, mouthPath, type BimoEmotion, type BimoFace } from './bimo-face'
import './bimo.css'

// ─── Bimo ────────────────────────────────────────────────────────────────────
// Vector twin of the 3D mascot (public/mascot, scripts/blender/build-mascot.py):
// pearl body, glass visor, lavender eyes with catchlights, periwinkle limbs.
// It is an SVG on purpose — a few KB instead of the 2.3 MB GLB, crisp at any
// size, and cheap enough to sit inside a blog paragraph or an empty state.
//
// Life, in order of cost:
//   • face   — spring-eased between emotions (rAF, stops when settled)
//   • body   — one CSS keyframe loop per emotion (bob, bounce, droop, shake…)
//   • blink  — random 2.5–6 s, skipped while the eyes are closed anyway
//   • gaze   — pupils follow the pointer when `interactive`
//   • boop   — click/tap: squash, a burst, and a brief happy face
// prefers-reduced-motion freezes the loops and snaps the face (bimo.css).

export type BimoProps = {
  emotion?: BimoEmotion
  /** Rendered width in px (height follows the 120×132 artboard). */
  size?: number
  /** Pupils follow the pointer and the body reacts to clicks. */
  interactive?: boolean
  /** Called on boop (click / Enter / Space). */
  onBoop?: () => void
  /** Accessible name; decorative (aria-hidden) when omitted. */
  label?: string
  className?: string
  style?: React.CSSProperties
}

const EYE_L = { x: 45, y: 56 }
const EYE_R = { x: 75, y: 56 }
const EYE_COLOR = '#A9B0FF'

function lerpFace(a: BimoFace, b: BimoFace, k: number): BimoFace {
  const out = { ...b }
  for (const key of Object.keys(b) as (keyof BimoFace)[]) {
    if (key === 'tint') continue
    const av = a[key] as number, bv = b[key] as number
    ;(out[key] as number) = av + (bv - av) * k
  }
  return out
}

function settled(a: BimoFace, b: BimoFace): boolean {
  return (Object.keys(b) as (keyof BimoFace)[]).every((k) =>
    k === 'tint' || Math.abs((a[k] as number) - (b[k] as number)) < 0.004)
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    setReduce(mq.matches)
    const on = () => setReduce(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduce
}

export default function Bimo({
  emotion = 'idle', size = 96, interactive = false, onBoop, label, className = '', style,
}: BimoProps) {
  const reduce = usePrefersReducedMotion()
  const uid = "bimo" + React.useId().replace(/[^a-zA-Z0-9]/g, "")
  const [booping, setBooping] = React.useState(false)
  const [boopKey, setBoopKey] = React.useState(0)
  const shown: BimoEmotion = booping ? (emotion === 'sad' || emotion === 'angry' ? 'surprised' : 'love') : emotion

  // Face spring.
  const target = React.useMemo(() => faceFor(shown), [shown])
  const [face, setFace] = React.useState<BimoFace>(target)
  const faceRef = React.useRef(face)
  React.useEffect(() => {
    if (reduce) { faceRef.current = target; setFace(target); return }
    let raf = 0
    const step = () => {
      const next = lerpFace(faceRef.current, target, 0.2)
      if (settled(next, target)) { faceRef.current = target; setFace(target); return }
      faceRef.current = next
      setFace(next)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduce])

  // Blink.
  const [blinking, setBlinking] = React.useState(false)
  React.useEffect(() => {
    if (reduce) return
    let t = 0
    const schedule = () => {
      t = window.setTimeout(() => {
        setBlinking(true)
        t = window.setTimeout(() => { setBlinking(false); schedule() }, 130)
      }, 2500 + Math.random() * 3500)
    }
    schedule()
    return () => window.clearTimeout(t)
  }, [reduce])

  // Gaze.
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [gaze, setGaze] = React.useState({ x: 0, y: 0 })
  React.useEffect(() => {
    if (!interactive || reduce) return
    let raf = 0
    let last: PointerEvent | null = null
    const apply = () => {
      raf = 0
      const el = svgRef.current
      if (!el || !last) return
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.42
      setGaze(gazeOffset(last.clientX - cx, last.clientY - cy, 3.2))
    }
    const onMove = (e: PointerEvent) => { last = e; if (!raf) raf = requestAnimationFrame(apply) }
    const onLeave = () => setGaze({ x: 0, y: 0 })
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [interactive, reduce])

  const boop = React.useCallback(() => {
    setBooping(true)
    setBoopKey((k) => k + 1)
    onBoop?.()
    window.setTimeout(() => setBooping(false), 1100)
  }, [onBoop])

  const f = face
  const lid = Math.min(1, blinking ? 1 : f.blink)
  const eyeColor = f.tint ?? EYE_COLOR
  const pupil = { x: gaze.x, y: gaze.y - f.lookUp * 2.4 }
  const eyeR = 7.2 * f.eyeScale
  const eyeRy = Math.max(0.6, eyeR * (1 - lid))
  const roundOpacity = 1 - f.happyEye
  const decorative = !label

  const body = (
    <svg
      ref={svgRef}
      viewBox="0 0 120 132"
      width={size}
      height={size * 1.1}
      className="bimo-svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={label}
      focusable="false"
    >
      <defs>
        <radialGradient id={`${uid}-body`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#EEF0FB" />
          <stop offset="100%" stopColor="#B9BEEA" />
        </radialGradient>
        <linearGradient id={`${uid}-visor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A1C2E" />
          <stop offset="100%" stopColor="#07080F" />
        </linearGradient>
        <radialGradient id={`${uid}-limb`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#B7BEFF" />
          <stop offset="100%" stopColor="#5E6AD2" />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <ellipse className="bimo-shadow" cx="60" cy="124" rx="30" ry="4.5" fill="#5E6AD2" opacity="0.28" />

      <g className="bimo-rig">
        {/* feet */}
        <ellipse cx="45" cy="112" rx="11" ry="6.5" fill={`url(#${uid}-limb)`} />
        <ellipse cx="75" cy="112" rx="11" ry="6.5" fill={`url(#${uid}-limb)`} />

        <g className="bimo-upper">
          {/* arms */}
          <ellipse className="bimo-arm-l" cx="14" cy="72" rx="7" ry="10.5" fill={`url(#${uid}-limb)`} />
          <ellipse className="bimo-arm-r" cx="106" cy="72" rx="7" ry="10.5" fill={`url(#${uid}-limb)`} />

          {/* antenna */}
          <g className="bimo-antenna">
            <path d="M60 22 C60 16 62 13 61 7" stroke="#8B93E8" strokeWidth="3.2" fill="none" strokeLinecap="round" />
            <rect x="56.5" y="1" width="8" height="8" rx="2" transform="rotate(45 60.5 5)" fill="#DCE0FF" />
            <rect x="56.5" y="1" width="8" height="8" rx="2" transform="rotate(45 60.5 5)" fill="#A9B0FF"
              opacity={0.35 * f.glow} filter={`url(#${uid}-glow)`} />
          </g>

          {/* body */}
          <ellipse cx="60" cy="66" rx="46" ry="44" fill={`url(#${uid}-body)`} />
          <ellipse cx="44" cy="36" rx="16" ry="7" fill="#FFFFFF" opacity="0.55" transform="rotate(-18 44 36)" />

          {/* visor */}
          <rect x="21" y="36" width="78" height="46" rx="19" fill={`url(#${uid}-visor)`} />
          <rect x="21" y="36" width="78" height="46" rx="19" fill="none" stroke={eyeColor}
            strokeOpacity={0.12 * f.glow} strokeWidth="1.2" />
          <path d="M80 41 h9 a6 6 0 0 1 6 6 v5" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="3" fill="none" strokeLinecap="round" />

          {/* face */}
          <g className="bimo-face">
            {/* blush */}
            <ellipse cx="33" cy="68" rx="6" ry="3.4" fill="#FF8FB1" opacity={f.blush * 0.85} />
            <ellipse cx="87" cy="68" rx="6" ry="3.4" fill="#FF8FB1" opacity={f.blush * 0.85} />

            {/* eyes: round (with lid) cross-fading into a happy arc */}
            {[EYE_L, EYE_R].map((e, i) => (
              <g key={i}>
                <g opacity={roundOpacity}>
                  <ellipse cx={e.x} cy={e.y} rx={eyeR + 2.5} ry={eyeRy + 2.5} fill={eyeColor} opacity={0.18 * f.glow} filter={`url(#${uid}-glow)`} />
                  <ellipse cx={e.x} cy={e.y + lid * eyeR * 0.6} rx={eyeR} ry={eyeRy} fill={eyeColor} />
                  {lid < 0.6 && (
                    <>
                      <circle cx={e.x + pupil.x - 2.2} cy={e.y + pupil.y - 2.4} r={2.4 * f.eyeScale} fill="#FFFFFF" />
                      <circle cx={e.x + pupil.x + 2.4} cy={e.y + pupil.y + 2.2} r={1.1 * f.eyeScale} fill="#FFFFFF" opacity="0.85" />
                    </>
                  )}
                </g>
                <path
                  d={`M${e.x - 6.5} ${e.y + 2} Q${e.x} ${e.y - 6} ${e.x + 6.5} ${e.y + 2}`}
                  stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round"
                  opacity={f.happyEye}
                />
                {Math.abs(f.brow) > 0.05 && (
                  <path
                    d={i === 0
                      ? `M${e.x - 7} ${e.y - 11 + f.brow * 2.5} L${e.x + 6} ${e.y - 11 - f.brow * 2.5}`
                      : `M${e.x - 6} ${e.y - 11 - f.brow * 2.5} L${e.x + 7} ${e.y - 11 + f.brow * 2.5}`}
                    stroke={eyeColor} strokeWidth="2.4" strokeLinecap="round" opacity={Math.min(1, Math.abs(f.brow))}
                  />
                )}
              </g>
            ))}

            {/* mouth */}
            <path d={mouthPath(f, 60, 71, 6)} stroke={eyeColor} strokeWidth="2.4" fill="none" strokeLinecap="round"
              opacity={Math.max(0, 1 - f.mouthO * 1.4)} />
            <ellipse cx="60" cy={72 + f.mouthOpen} rx={2.4 + f.mouthOpen * 2.2} ry={f.mouthOpen * 3.2 + f.mouthO * 3}
              fill={eyeColor} opacity={Math.min(1, f.mouthOpen + f.mouthO)} />
          </g>
        </g>
      </g>

      {/* emotion props */}
      {shown === 'sleepy' && (
        <g className="bimo-fx bimo-fx-z" fill="#A9B0FF" fontFamily="inherit" fontWeight="700">
          <text x="92" y="28" fontSize="10">z</text>
          <text x="100" y="18" fontSize="7">z</text>
        </g>
      )}
      {shown === 'thinking' && (
        <g className="bimo-fx bimo-fx-dots" fill="#A9B0FF">
          <circle cx="94" cy="26" r="2" /><circle cx="101" cy="20" r="2.6" /><circle cx="109" cy="12" r="3.2" />
        </g>
      )}
      {shown === 'love' && (
        <g className="bimo-fx bimo-fx-hearts" fill="#FF8FB1">
          <path d="M96 24 c-3-4-9-1-6 4 l6 5 6-5 c3-5-3-8-6-4z" />
          <path d="M20 18 c-2-3-6-1-4 3 l4 3 4-3 c2-4-2-6-4-3z" opacity="0.8" />
        </g>
      )}
      {(shown === 'excited' || shown === 'happy') && (
        <g className="bimo-fx bimo-fx-spark" fill="#FFD66B">
          <path d="M100 20 l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <path d="M16 26 l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z" opacity="0.8" />
        </g>
      )}
      {shown === 'angry' && (
        <g className="bimo-fx bimo-fx-steam" stroke="#FF8A8A" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M96 22 l6-6 M100 26 l7-3 M94 16 l2-7" />
        </g>
      )}
      {shown === 'surprised' && (
        <text className="bimo-fx bimo-fx-bang" x="98" y="26" fontSize="16" fontWeight="800" fill="#FFD66B">!</text>
      )}
    </svg>
  )

  const classes = `bimo bimo-${shown}${booping ? ' bimo-booping' : ''}${interactive ? ' bimo-interactive' : ''} ${className}`

  if (!interactive) return <span className={classes} style={style}>{body}</span>

  return (
    <button
      type="button"
      className={classes}
      style={style}
      onClick={boop}
      aria-label={label ?? 'Bimo'}
      data-boop={boopKey}
    >
      {body}
      {booping && (
        <span key={boopKey} className="bimo-burst" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--a': `${i * 60}deg` } as React.CSSProperties} />)}
        </span>
      )}
    </button>
  )
}
