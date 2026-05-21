// ─── ShapeGrid ────────────────────────────────────────────────────────────────
// Canvas-based infinite-scrolling grid of squares with cursor-hover fill trail.
//
// The grid scrolls continuously in the chosen `direction`.  On hover the cell
// under the cursor fills with `hoverFillColor`, and up to `hoverTrailAmount`
// neighbouring cells (by Manhattan distance) also fill with decreasing alpha.
//
// All rendering is on a single <canvas> — ResizeObserver keeps it crisp on
// any DPR, rAF drives the animation, and cleanup is comprehensive.
//
// Usage:
//   <ShapeGrid
//     direction="diagonal"
//     speed={0.3}
//     borderColor="rgba(94,106,210,0.08)"
//     squareSize={48}
//     hoverFillColor="rgba(94,106,210,0.06)"
//     shape="square"
//     hoverTrailAmount={3}
//   />

import React, { useRef, useEffect } from 'react'

type Direction = 'horizontal' | 'vertical' | 'diagonal'
type Shape     = 'square' | 'circle' | 'diamond'

export interface ShapeGridProps {
  /** Scroll direction. Default: 'horizontal'. */
  direction?: Direction
  /** Scroll speed in px per frame. Default: 0.5. */
  speed?: number
  /** CSS colour for grid lines. Default: 'rgba(255,255,255,0.08)'. */
  borderColor?: string
  /** Cell size in CSS pixels. Default: 48. */
  squareSize?: number
  /** Fill colour applied to hovered cells and their neighbours. */
  hoverFillColor?: string
  /** Number of cell layers around the cursor that also fill (trail). Default: 3. */
  hoverTrailAmount?: number
  /** Shape drawn inside each cell. Default: 'square'. */
  shape?: Shape
  className?: string
  style?: React.CSSProperties
}

export default function ShapeGrid({
  direction       = 'horizontal',
  speed           = 0.5,
  borderColor     = 'rgba(255,255,255,0.08)',
  squareSize      = 48,
  hoverFillColor  = 'rgba(94,106,210,0.06)',
  hoverTrailAmount = 3,
  shape           = 'square',
  className       = '',
  style,
}: ShapeGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── State ──────────────────────────────────────────────────────────
    let rafId  = 0
    let offsetX = 0
    let offsetY = 0
    let mouseCol = -1
    let mouseRow = -1
    let dpr = window.devicePixelRatio || 1

    // ── Resize ─────────────────────────────────────────────────────────
    const resize = (): void => {
      dpr = window.devicePixelRatio || 1
      const { offsetWidth: w, offsetHeight: h } = canvas
      canvas.width  = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.scale(dpr, dpr)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    // ── Mouse tracking ─────────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const lx   = e.clientX - rect.left
      const ly   = e.clientY - rect.top
      // Map CSS pixels → grid cell, accounting for current scroll offset
      mouseCol = Math.floor((lx + ((offsetX % squareSize) + squareSize) % squareSize - squareSize) / squareSize)
      mouseRow = Math.floor((ly + ((offsetY % squareSize) + squareSize) % squareSize - squareSize) / squareSize)
    }
    const onMouseLeave = (): void => { mouseCol = -1; mouseRow = -1 }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)

    // ── Parse hoverFillColor once ──────────────────────────────────────
    // We need to vary the alpha for trail cells, so extract base colour.
    // We do this by drawing it in an off-screen canvas and reading back RGBA.
    let baseR = 94, baseG = 106, baseB = 210, baseA = 0.06
    const tmp = document.createElement('canvas')
    tmp.width = tmp.height = 1
    const tc = tmp.getContext('2d')!
    tc.fillStyle = hoverFillColor
    tc.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = tc.getImageData(0, 0, 1, 1).data
    baseR = r; baseG = g; baseB = b; baseA = a / 255

    // ── Draw one cell shape ────────────────────────────────────────────
    const drawCell = (cx: number, cy: number, sz: number, fillStyle: string): void => {
      ctx.fillStyle = fillStyle
      if (shape === 'circle') {
        ctx.beginPath()
        ctx.arc(cx + sz / 2, cy + sz / 2, sz * 0.38, 0, Math.PI * 2)
        ctx.fill()
      } else if (shape === 'diamond') {
        ctx.beginPath()
        ctx.moveTo(cx + sz / 2, cy + sz * 0.1)
        ctx.lineTo(cx + sz * 0.9, cy + sz / 2)
        ctx.lineTo(cx + sz / 2, cy + sz * 0.9)
        ctx.lineTo(cx + sz * 0.1, cy + sz / 2)
        ctx.closePath()
        ctx.fill()
      } else {
        // square — inset slightly from the border
        const pad = sz * 0.1
        ctx.fillRect(cx + pad, cy + pad, sz - pad * 2, sz - pad * 2)
      }
    }

    // ── Main draw loop ─────────────────────────────────────────────────
    const draw = (): void => {
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight

      ctx.clearRect(0, 0, W, H)

      // Advance scroll offset
      if (direction === 'horizontal' || direction === 'diagonal') offsetX += speed
      if (direction === 'vertical'   || direction === 'diagonal') offsetY += speed
      // Wrap offset to avoid float drift
      offsetX = offsetX % squareSize
      offsetY = offsetY % squareSize

      const startX = -squareSize + (((offsetX % squareSize) + squareSize) % squareSize)
      const startY = -squareSize + (((offsetY % squareSize) + squareSize) % squareSize)
      const cols = Math.ceil((W - startX) / squareSize) + 1
      const rows = Math.ceil((H - startY) / squareSize) + 1

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = startX + col * squareSize
          const cy = startY + row * squareSize

          // Hover trail: col / row index in the virtual grid
          const gc = col - 1  // offset -1 because startX starts one cell back
          const gr = row - 1
          const mdist = Math.abs(gc - mouseCol) + Math.abs(gr - mouseRow)

          if (mouseCol >= 0 && mdist <= hoverTrailAmount) {
            const t     = 1 - mdist / (hoverTrailAmount + 1)   // 1 at cursor, fades
            const alpha = baseA * t * t
            drawCell(cx, cy, squareSize, `rgba(${baseR},${baseG},${baseB},${alpha})`)
          }
        }
      }

      // Draw grid lines on top
      ctx.strokeStyle = borderColor
      ctx.lineWidth   = 1 / dpr   // 1 physical pixel

      // Vertical lines
      ctx.beginPath()
      for (let col = 0; col <= cols; col++) {
        const x = startX + col * squareSize
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
      }
      // Horizontal lines
      for (let row = 0; row <= rows; row++) {
        const y = startY + row * squareSize
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
      }
      ctx.stroke()

      rafId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [direction, speed, borderColor, squareSize, hoverFillColor, hoverTrailAmount, shape])

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
        display:       'block',
        pointerEvents: 'auto',   // needs pointer events for hover trail
        ...style,
      }}
    />
  )
}
