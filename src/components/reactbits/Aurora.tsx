// ─── Aurora ───────────────────────────────────────────────────────────────────
// Animated canvas aurora effect with moving colour blobs.
// Canvas is rendered with mix-blend-mode:screen + a heavy CSS blur so the
// blobs look like soft, glowing aurora waves.

import React, { useRef, useEffect } from 'react'

export interface AuroraProps {
  /** Gradient stop colours (hex/rgb/hsl). Min 2. */
  colorStops?: string[]
  /** Max vertical/horizontal deviation as a 0–1 fraction of the container. */
  amplitude?: number
  /** CSS mix-blend-mode applied to the canvas element. */
  blend?: string
  /** Animation speed multiplier (1 = normal). */
  speed?: number
  className?: string
}

interface _Blob {
  baseX:  number   // 0–1 fractional position
  baseY:  number
  phaseX: number   // sine phase for X drift
  phaseY: number   // cosine phase for Y drift
  freqX:  number   // angular frequency for X
  freqY:  number
  color:  string
  radius: number   // fraction of max(w,h)
}

export default function Aurora({
  colorStops = ['#5E6AD2', '#7C3AED', '#3B82F6'],
  amplitude  = 0.25,
  blend      = 'screen',
  speed      = 1,
  className,
}: AuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Keep mutable refs so the animation loop always reads current values without
  // needing to restart when props change.
  const ampRef   = useRef(amplitude)
  const speedRef = useRef(speed)
  useEffect(() => { ampRef.current   = amplitude }, [amplitude])
  useEffect(() => { speedRef.current = speed      }, [speed])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Build blobs — one per colour stop plus some extras for depth
    const blobs: _Blob[] = colorStops.flatMap<_Blob>((color, i) => {
      const t = colorStops.length
      return [
        {
          color,
          baseX:  0.15 + (i / t) * 0.7,
          baseY:  0.35,
          phaseX: i * 2.1,
          phaseY: i * 1.7 + 1.0,
          freqX:  0.38 + i * 0.14,
          freqY:  0.27 + i * 0.11,
          radius: 0.38 + (i % 2) * 0.12,
        },
        // mirrored ghost for richer coverage
        {
          color,
          baseX:  0.85 - (i / t) * 0.7,
          baseY:  0.65,
          phaseX: i * 1.5 + 3.0,
          phaseY: i * 2.2 + 0.5,
          freqX:  0.22 + i * 0.09,
          freqY:  0.33 + i * 0.13,
          radius: 0.28 + (i % 3) * 0.08,
        },
      ]
    })

    let animId = 0
    let t = 0

    const resize = (): void => {
      canvas.width  = canvas.offsetWidth  || canvas.clientWidth
      canvas.height = canvas.offsetHeight || canvas.clientHeight
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const draw = (): void => {
      const { width, height } = canvas
      if (width === 0 || height === 0) { animId = requestAnimationFrame(draw); return }

      t += 0.005 * speedRef.current

      ctx.clearRect(0, 0, width, height)

      const maxDim = Math.max(width, height)

      for (const blob of blobs) {
        const cx = (blob.baseX + Math.sin(blob.phaseX + t * blob.freqX) * ampRef.current) * width
        const cy = (blob.baseY + Math.cos(blob.phaseY + t * blob.freqY) * ampRef.current) * height
        const r  = blob.radius * maxDim

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        // colour stop to fully transparent — alpha CC ≈ 80%
        grad.addColorStop(0,   blob.color + 'CC')
        grad.addColorStop(0.5, blob.color + '55')
        grad.addColorStop(1,   blob.color + '00')

        ctx.fillStyle = grad
        ctx.beginPath()
        // Slightly squash vertically for a more horizon-like aurora shape
        ctx.save()
        ctx.scale(1, 0.75)
        ctx.arc(cx, cy / 0.75, r, 0, Math.PI * 2)
        ctx.restore()
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      observer.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorStops]) // restart only if colour palette changes

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        position:    'absolute',
        inset:       0,
        width:       '100%',
        height:      '100%',
        mixBlendMode: blend as React.CSSProperties['mixBlendMode'],
        filter:      'blur(72px) saturate(1.4)',
        pointerEvents: 'none',
      }}
    />
  )
}
