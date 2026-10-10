// ─── flood capture overlay ────────────────────────────────────────────────────
// What a capture of the flood must carry to be read on its own: what the
// colours are (the view and its scale), which instant, and that it is an
// indicative simulation. Painted by the viewer into PNG snapshots, clip
// frames and the recording surface (addCapturePainter), so every capture tool
// — this panel's PNG and video, the capture toolbar, Clip Studio — gets it.
//
// A card in the bottom-left corner, sized in CSS pixels × s so it keeps its
// on-screen size at any capture scale.

import type { CapturePaint } from '../system'

export interface OverlayInfo {
  title: string
  /** "t = 1:05 / 2:20", or null. */
  subtitle: string | null
  stops: Array<[number, [number, number, number]]>
  format(v: number): string
  disclaimer: string
}

const rgb = (c: [number, number, number], a = 1): string => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`

function wrap(c: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && c.measureText(next).width > max) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  return lines
}

export function floodOverlay(get: () => OverlayInfo | null): CapturePaint {
  return (c, width, height, s) => {
    const o = get()
    if (!o || o.stops.length < 2) return false
    const font = (px: number, weight = 500): string => `${weight} ${Math.round(px * s)}px Inter, system-ui, sans-serif`
    const pad = 10 * s
    const margin = 14 * s
    const inner = Math.min(250 * s, width - 2 * margin - 2 * pad)
    if (inner < 80 * s) return false
    const barH = 8 * s

    c.save()
    c.font = font(9.5)
    const disclaimer = wrap(c, o.disclaimer, inner)
    const titleH = 15 * s
    const subH = o.subtitle ? 13 * s : 0
    const legendH = barH + 15 * s
    const discH = disclaimer.length * 12 * s
    const cardW = inner + 2 * pad
    const cardH = pad + titleH + subH + 6 * s + legendH + 6 * s + discH + pad * 0.8
    const x = margin
    const y = height - margin - cardH

    c.fillStyle = 'rgba(12,14,20,0.80)'
    c.strokeStyle = 'rgba(255,255,255,0.12)'
    c.lineWidth = Math.max(1, s)
    c.beginPath()
    c.roundRect(x, y, cardW, cardH, 10 * s)
    c.fill()
    c.stroke()

    let cy = y + pad
    c.textBaseline = 'top'
    c.fillStyle = '#ffffff'
    c.font = font(12, 600)
    c.fillText(o.title, x + pad, cy, inner)
    cy += titleH
    if (o.subtitle) {
      c.fillStyle = 'rgba(255,255,255,0.72)'
      c.font = font(10.5)
      c.fillText(o.subtitle, x + pad, cy, inner)
      cy += subH
    }
    cy += 6 * s

    // The colour scale: the stops spread evenly (the ramp is not linear in value).
    const n = o.stops.length
    const grad = c.createLinearGradient(x + pad, 0, x + pad + inner, 0)
    o.stops.forEach(([, col], k) => grad.addColorStop(k / (n - 1), rgb(col)))
    c.fillStyle = grad
    c.beginPath()
    c.roundRect(x + pad, cy, inner, barH, 3 * s)
    c.fill()
    c.font = font(9.5)
    c.fillStyle = 'rgba(255,255,255,0.8)'
    o.stops.forEach(([v], k) => {
      const tx = x + pad + (inner * k) / (n - 1)
      c.textAlign = k === 0 ? 'left' : k === n - 1 ? 'right' : 'center'
      c.fillText(o.format(v), tx, cy + barH + 3 * s)
    })
    c.textAlign = 'left'
    cy += legendH + 6 * s

    c.fillStyle = 'rgba(255,214,140,0.9)'
    c.font = font(9.5)
    for (const line of disclaimer) { c.fillText(line, x + pad, cy, inner); cy += 12 * s }
    c.restore()
    return true
  }
}
