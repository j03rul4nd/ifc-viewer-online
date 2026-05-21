// ─── Particles ────────────────────────────────────────────────────────────────
// Canvas with N floating particles that are repelled by the cursor and spring
// back to their origin positions.

import React, { useRef, useEffect } from 'react'

export interface ParticlesProps {
  /** Number of particles. Default 80. */
  quantity?: number
  /** Particle colour as a hex string e.g. '#5E6AD2'. Default '#5E6AD2'. */
  color?: string
  /** Spring return strength (higher = slower return / more elastic). Default 40. */
  ease?: number
  /** Cursor influence damping (higher = less repulsion). Default 60. */
  staticity?: number
  /** Particle radius in CSS pixels. Default 0.5. */
  size?: number
  className?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): readonly [number, number, number] {
  const h   = hex.replace('#', '')
  const len = h.length === 3 ? 1 : 2
  const r   = parseInt(h.slice(0,         len), 16) * (h.length === 3 ? 17 : 1)
  const g   = parseInt(h.slice(len,     2*len), 16) * (h.length === 3 ? 17 : 1)
  const b   = parseInt(h.slice(2*len,   3*len), 16) * (h.length === 3 ? 17 : 1)
  return [r || 94, g || 106, b || 210] as const
}

// ── Particle state (mutable, not React state) ─────────────────────────────────

interface Particle {
  x:       number   // current pixel position
  y:       number
  ox:      number   // origin pixel position
  oy:      number
  vx:      number   // velocity
  vy:      number
  alpha:   number   // base alpha for this particle (0.2–0.7)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Particles({
  quantity  = 80,
  color     = '#5E6AD2',
  ease      = 40,
  staticity = 60,
  size      = 0.5,
  className,
}: ParticlesProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const mouseRef   = useRef<{ x: number; y: number } | null>(null)

  // Keep latest prop values accessible inside the animation loop without
  // restarting the loop on every render.
  const easeRef      = useRef(ease)
  const staticityRef = useRef(staticity)
  useEffect(() => { easeRef.current      = ease      }, [ease])
  useEffect(() => { staticityRef.current = staticity }, [staticity])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const [r, g, b] = hexToRgb(color)

    // Particles array — rebuilt on resize via `init()`
    let particles: Particle[] = []

    const init = (): void => {
      const { width, height } = canvas
      particles = Array.from({ length: quantity }, (): Particle => {
        const ox = Math.random() * width
        const oy = Math.random() * height
        return {
          x:     ox,
          y:     oy,
          ox,
          oy,
          vx:    0,
          vy:    0,
          alpha: 0.2 + Math.random() * 0.5,
        }
      })
    }

    const resize = (): void => {
      const prevW = canvas.width
      const prevH = canvas.height
      canvas.width  = canvas.offsetWidth  || canvas.clientWidth  || 1
      canvas.height = canvas.offsetHeight || canvas.clientHeight || 1

      if (prevW > 0 && prevH > 0 && particles.length > 0) {
        // Scale existing particle origins proportionally
        const sx = canvas.width  / prevW
        const sy = canvas.height / prevH
        for (const p of particles) {
          p.ox *= sx; p.x *= sx
          p.oy *= sy; p.y *= sy
        }
      } else {
        init()
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    // Cursor tracking relative to canvas
    const onMouseMove = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: (e.clientX - rect.left) * (canvas.width  / rect.width),
        y: (e.clientY - rect.top)  * (canvas.height / rect.height),
      }
    }
    const onMouseLeave = (): void => { mouseRef.current = null }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)
    // Also track at document level so particles react even without hover
    document.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top  && e.clientY <= rect.bottom) {
        mouseRef.current = {
          x: (e.clientX - rect.left) * (canvas.width  / rect.width),
          y: (e.clientY - rect.top)  * (canvas.height / rect.height),
        }
      }
    })

    const MOUSE_RADIUS = 100

    let animId = 0
    const draw = (): void => {
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      const mouse     = mouseRef.current
      const easeVal   = easeRef.current
      const staticVal = staticityRef.current

      for (const p of particles) {
        // Cursor repulsion
        if (mouse) {
          const dx   = mouse.x - p.x
          const dy   = mouse.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MOUSE_RADIUS && dist > 0) {
            const force = (MOUSE_RADIUS - dist) / (staticVal + dist)
            p.vx -= (dx / dist) * force * 5
            p.vy -= (dy / dist) * force * 5
          }
        }

        // Spring toward origin
        p.vx += (p.ox - p.x) / easeVal
        p.vy += (p.oy - p.y) / easeVal

        // Friction
        p.vx *= 0.92
        p.vy *= 0.92

        // Integrate
        p.x += p.vx
        p.y += p.vy

        // Render
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      observer.disconnect()
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity, color, size]) // restart only when structure changes

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        position:      'absolute',
        inset:         0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
      }}
    />
  )
}
