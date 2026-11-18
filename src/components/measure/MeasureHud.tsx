// ─── MeasureHud ───────────────────────────────────────────────────────────────
// What the person needs to see WHERE they are looking, not in a side panel:
//
//   • An instruction bar at the top of the viewport — the tool, the step it is
//     waiting for ("Click the second point") and the keys that do something
//     right now. The old tools hid "Enter closes the area" in a tooltip.
//
//   • A snap marker on the point a click would place, whose SHAPE says what it
//     locked onto (square vertex, triangle midpoint, diamond edge, ring face),
//     with the live value beside it. Seeing the lock before clicking is what
//     makes a measurement trustworthy.
//
// Rendered into <body> with fixed positioning: the engine reports client
// pixels, and the panel it belongs to is inside a transformed, animated card.

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { MeasureHover, MeasureSnapshot, SnapKind } from '../../lib/measure/measure-types'
import { formatAngle, formatArea, formatLength } from '../../lib/measure/measure-math'
import { AngleIcon, AreaIcon, DistanceIcon, PathIcon, PointIcon } from './icons'

const SNAP_COLOR: Record<SnapKind, string> = {
  vertex: '#3DD68C',
  midpoint: '#6CE0FF',
  edge: '#FFB224',
  face: '#ECEDEE',
  surface: '#ECEDEE',
  cloud: '#B49CFF',
}
const AXIS_COLOR = { x: '#FF5A5A', y: '#4CD964', z: '#4C8DFF' } as const

export const TOOL_ICON = {
  distance: DistanceIcon,
  path: PathIcon,
  area: AreaIcon,
  angle: AngleIcon,
  point: PointIcon,
} as const

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-[4px] border border-white/15 bg-white/[0.07] text-[10px] font-mono font-semibold text-white/85 leading-none">
      {children}
    </kbd>
  )
}

function SnapGlyph({ kind, color, closing }: { kind: SnapKind; color: string; closing: boolean }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 2 }
  const halo = { fill: 'none', stroke: 'rgba(0,0,0,0.65)', strokeWidth: 4.5 }
  let shape: React.ReactNode
  if (closing) {
    shape = <><circle cx="12" cy="12" r="7" {...halo} /><circle cx="12" cy="12" r="7" {...common} /><path d="M8.5 12.2l2.4 2.3 4.6-4.8" {...common} /></>
  } else if (kind === 'vertex') {
    shape = <><rect x="6" y="6" width="12" height="12" {...halo} /><rect x="6" y="6" width="12" height="12" {...common} /></>
  } else if (kind === 'midpoint') {
    shape = <><path d="M12 5l7.5 13h-15z" {...halo} /><path d="M12 5l7.5 13h-15z" {...common} /></>
  } else if (kind === 'edge') {
    shape = <><path d="M12 5l7 7-7 7-7-7z" {...halo} /><path d="M12 5l7 7-7 7-7-7z" {...common} /></>
  } else if (kind === 'cloud') {
    shape = <>{[[8, 9], [15, 8], [11, 15]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill={color} stroke="rgba(0,0,0,0.6)" strokeWidth="1" />)}</>
  } else {
    shape = <><circle cx="12" cy="12" r="6" {...halo} /><circle cx="12" cy="12" r="6" {...common} /><circle cx="12" cy="12" r="1.6" fill={color} /></>
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">{shape}</svg>
}

function useCanvasRect(canvas: HTMLCanvasElement | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(() => canvas?.getBoundingClientRect() ?? null)
  useEffect(() => {
    if (!canvas) return
    const update = () => setRect(canvas.getBoundingClientRect())
    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(canvas)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [canvas])
  return rect
}

interface MeasureHudProps {
  snapshot: MeasureSnapshot
  hover: MeasureHover | null
  canvas: HTMLCanvasElement | null
  /** On touch there is no cursor to follow: the bar is all the guidance. */
  showMarker?: boolean
}

export function MeasureHud({ snapshot, hover, canvas, showMarker = true }: MeasureHudProps) {
  const { t } = useTranslation('measurement')
  const rect = useCanvasRect(canvas)
  if (snapshot.tool === 'none' || typeof document === 'undefined') return null

  const tool = snapshot.tool
  const Icon = TOOL_ICON[tool]
  const step = tool === 'point' ? 'point' : tool === 'angle' && snapshot.step === 'first-point' ? 'angle-first' : snapshot.step
  const s = snapshot.settings
  const live = hover?.live
  const liveText = live
    ? live.kind === 'length' ? formatLength(live.value, s) : live.kind === 'area' ? formatArea(live.value, s) : formatAngle(live.value, s)
    : null
  const lockable = snapshot.draftPoints > 0 && (tool === 'path' || tool === 'angle'
    || (tool === 'distance' && snapshot.distanceMode === 'point') || (tool === 'area' && snapshot.areaMode === 'polygon'))
  const color = hover ? (hover.axis ? AXIS_COLOR[hover.axis] : SNAP_COLOR[hover.kind]) : '#fff'
  const snapLabel = hover
    ? hover.closing ? t('snap.close') : hover.axis ? t('snap.axis', { axis: hover.axis.toUpperCase() }) : t(`snap.${hover.kind}`)
    : null

  const bar = rect && (
    <div
      className="fixed z-[35] pointer-events-none select-none"
      style={{ top: rect.top + 12, left: rect.left + rect.width / 2, transform: 'translateX(-50%)', maxWidth: Math.max(240, rect.width - 24) }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-full bg-[rgba(10,10,14,0.88)] border border-white/10 shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur-md text-white">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold whitespace-nowrap">
          <span className="text-[var(--accent-2)]"><Icon size={15} /></span>
          {t(`tools.${tool}`)}
        </span>
        <span className="w-px h-3.5 bg-white/15" />
        <span className="text-[11.5px] text-white/90 whitespace-nowrap truncate">{t(`steps.${step}`)}</span>
        <span className="hidden sm:flex items-center gap-2 text-[10.5px] text-white/55 whitespace-nowrap">
          {lockable && <span className="flex items-center gap-1"><Kbd>Shift</Kbd>{t('keys.axisLock')}</span>}
          {snapshot.canFinish && <span className="flex items-center gap-1"><Kbd>↵</Kbd>{t('keys.finish')}</span>}
          {snapshot.draftPoints > 0 && <span className="flex items-center gap-1"><Kbd>⌫</Kbd>{t('keys.undo')}</span>}
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd>{snapshot.draftPoints > 0 ? t('keys.cancel') : t('keys.exit')}</span>
        </span>
      </div>
    </div>
  )

  const marker = showMarker && hover && (
    <div className="fixed z-[35] pointer-events-none select-none" style={{ left: hover.clientX, top: hover.clientY }}>
      <div className="absolute -translate-x-1/2 -translate-y-1/2"><SnapGlyph kind={hover.kind} color={color} closing={hover.closing} /></div>
      <div className="absolute left-[16px] top-[10px] flex flex-col items-start gap-1">
        {snapLabel && (
          <span className="px-1.5 py-[1px] rounded-[5px] text-[10px] font-semibold whitespace-nowrap bg-[rgba(10,10,14,0.82)] border border-white/10" style={{ color }}>
            {snapLabel}
          </span>
        )}
        {liveText && (
          <span className="px-2 py-[2px] rounded-[6px] text-[12px] font-semibold tabular-nums whitespace-nowrap text-white bg-[rgba(10,10,14,0.9)] border border-white/15 shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
            {liveText}
          </span>
        )}
      </div>
    </div>
  )

  return createPortal(<>{bar}{marker}</>, document.body)
}
