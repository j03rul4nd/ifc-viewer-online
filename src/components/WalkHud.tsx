// ─── WalkHud ──────────────────────────────────────────────────────────────────
// The heads-up display for first-person walk mode: what the keys are, how fast
// you are walking, whether the cursor is captured, and — on a touch screen —
// the stick that stands in for the keys that are not there.
//
// It is a separate component from CameraControls because it answers to a
// different thing. CameraControls is a popover you open, choose from and close;
// this is only ever on screen while a MODE is running, it must not be closable
// (there would be no way to know how to leave), and it has to stay out of the
// way of the model at the same time. Same corner, opposite lifecycle.
//
// It subscribes to the viewer rather than taking props: walk state changes from
// the keyboard (G), from the wheel (speed), and from the browser itself
// (pointer lock released by Escape), none of which pass through React.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import type { WalkState } from '../lib/camera-walk'

interface WalkHudProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

const IDLE: WalkState = { active: false, speed: 0, pointerLocked: false }

/** Touch needs a stick; a mouse and keyboard do not, and one drawn for them is
 *  just a thing covering the model. Matched once — a device does not sprout a
 *  touchscreen mid-session, and re-querying on every render costs a layout. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(pointer: coarse)')
    setCoarse(mq.matches)
    const onChange = (e: MediaQueryListEvent): void => setCoarse(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return coarse
}

/**
 * The on-screen stick.
 *
 * Absolute, not relative: the knob follows the finger inside a fixed ring, so
 * the deflection is readable as a picture of what you asked for. A relative
 * stick (origin wherever you touched) is better for games and worse here, where
 * people look at it while they use it.
 */
function Stick({ onChange }: { onChange: (forward: number, right: number) => void }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const pointerId = useRef<number | null>(null)

  const apply = useCallback((clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const radius = rect.width / 2
    let dx = clientX - (rect.left + radius)
    let dy = clientY - (rect.top + radius)
    const dist = Math.hypot(dx, dy)
    if (dist > radius) { dx = (dx / dist) * radius; dy = (dy / dist) * radius }
    setKnob({ x: dx, y: dy })
    // Up on the pad is forward; the screen's Y grows downward.
    onChange(-dy / radius, dx / radius)
  }, [onChange])

  const release = useCallback(() => {
    pointerId.current = null
    setKnob({ x: 0, y: 0 })
    onChange(0, 0)
  }, [onChange])

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        pointerId.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        apply(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (pointerId.current !== e.pointerId) return
        e.preventDefault()
        apply(e.clientX, e.clientY)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="relative w-[112px] h-[112px] rounded-full bg-[rgba(12,12,16,0.72)] backdrop-blur-[14px] border border-[var(--border)] touch-none"
      style={{ pointerEvents: 'auto' }}
      aria-hidden
    >
      <div
        className="absolute w-[46px] h-[46px] rounded-full bg-[rgba(120,160,255,0.35)] border border-[rgba(150,180,255,0.6)]"
        style={{
          left: `calc(50% - 23px + ${knob.x}px)`,
          top:  `calc(50% - 23px + ${knob.y}px)`,
          transition: pointerId.current === null ? 'left 120ms ease, top 120ms ease' : 'none',
        }}
      />
    </div>
  )
}

export default function WalkHud({ viewerApiRef }: WalkHudProps): React.ReactElement | null {
  const { t } = useTranslation('viewer')
  const coarse = useCoarsePointer()
  const [state, setState] = useState<WalkState>(IDLE)

  // The viewer is the source of truth: G, the wheel and the browser's own
  // Escape all change this without React ever hearing about it. The viewer can
  // also be a frame behind this component on first paint, so a missed
  // subscription retries rather than leaving a HUD that never lights up.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const api = viewerApiRef.current
    if (!api) {
      const retry = window.setTimeout(() => setAttempt((n) => n + 1), 250)
      return () => window.clearTimeout(retry)
    }
    setState(api.getWalkState())
    return api.onWalkStateChange(setState)
  }, [viewerApiRef, attempt])

  // One input vector, assembled here. The stick and the height keys are two
  // controls writing to the same three numbers, and sending each on its own
  // would have whichever moved last zero the other one.
  const input = useRef({ forward: 0, right: 0, up: 0 })
  const send = useCallback(() => {
    const { forward, right, up } = input.current
    viewerApiRef.current?.setWalkMoveInput(forward, right, up)
  }, [viewerApiRef])

  const move = useCallback((forward: number, right: number) => {
    input.current.forward = forward
    input.current.right = right
    send()
  }, [send])

  // Held, not tapped: a storey is a few seconds of holding, and a tap that
  // moved you a fixed amount would be a lift button, not a control.
  const hold = useCallback((up: number) => {
    input.current.up = up
    send()
  }, [send])

  // Leaving walk mode with a finger still on the stick would otherwise hand the
  // next session a camera that walks on its own.
  useEffect(() => {
    if (state.active) return
    input.current = { forward: 0, right: 0, up: 0 }
    viewerApiRef.current?.setWalkMoveInput(0, 0, 0)
  }, [state.active, viewerApiRef])

  if (!state.active) return null

  const speed = state.speed
  const speedLabel = speed >= 10 ? speed.toFixed(0) : speed.toFixed(1)

  return (
    <>
      {/* Under Pointer Lock there is no cursor, and the viewer aims from the
          centre of the canvas — so the centre has to be drawn, or clicking to
          inspect an element becomes guesswork about where "here" is. Two thin
          strokes with a hole in the middle: enough to aim with, not enough to
          sit in front of the model. */}
      {state.pointerLocked && (
        <div className="absolute inset-0 z-[21] pointer-events-none flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
            <g stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" strokeLinecap="round">
              <path d="M11 3v5M11 14v5M3 11h5M14 11h5" />
            </g>
            <circle cx="11" cy="11" r="1.1" fill="rgba(255,255,255,0.9)" />
          </svg>
        </div>
      )}

      {/* Keys, speed and the way out — one row, bottom centre, clear of both
          the side panels and the mobile nav bar. */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[92px] sm:bottom-5 z-[22] flex items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(12,12,16,0.88)] backdrop-blur-[14px] border border-[var(--border)] text-[11px] text-[var(--text-dim)] whitespace-nowrap">
          <span>{coarse ? t('walk.hintTouch') : t('walk.hint')}</span>
          <span className="w-px h-3 bg-[var(--border)]" />
          {/* The wheel sets this, so it has to be visible while the wheel turns
              — a speed you cannot see is a speed you cannot trust. */}
          <span className="tabular-nums text-[var(--text)]" title={t('walk.speedHint')}>
            {speedLabel} m/s
          </span>
          {!coarse && (
            <>
              <span className="w-px h-3 bg-[var(--border)]" />
              <span className={state.pointerLocked ? 'text-[var(--text)]' : ''}>
                {state.pointerLocked ? t('walk.locked') : t('walk.unlocked')}
              </span>
            </>
          )}
        </div>
        <button
          onClick={() => viewerApiRef.current?.setWalkMode(false)}
          className="px-2.5 py-1.5 rounded-lg bg-[rgba(12,12,16,0.88)] backdrop-blur-[14px] border border-[var(--border)] text-[11px] font-medium text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
          style={{ pointerEvents: 'auto' }}
        >
          {t('walk.exit')}
        </button>
      </div>

      {/* Touch: the stick replaces WASD, and the two side keys replace Q/E.
          Without these, walk mode on a phone is a mode you can enter and not
          use — there is no keyboard to hold down. */}
      {coarse && (
        <div className="absolute left-4 bottom-[150px] z-[22] flex items-end gap-2 pointer-events-none">
          <Stick onChange={move} />
          <div className="flex flex-col gap-1.5" style={{ pointerEvents: 'auto' }}>
            {([['↑', 1], ['↓', -1]] as const).map(([glyph, dir]) => (
              <button
                key={glyph}
                onPointerDown={(e) => { e.preventDefault(); hold(dir) }}
                onPointerUp={() => hold(0)}
                onPointerCancel={() => hold(0)}
                onPointerLeave={() => hold(0)}
                aria-label={dir > 0 ? t('walk.up') : t('walk.down')}
                className="w-9 h-9 rounded-lg bg-[rgba(12,12,16,0.82)] backdrop-blur-[14px] border border-[var(--border)] text-[var(--text-dim)] text-[13px] touch-none"
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
