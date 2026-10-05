// ─── MapOverlays ──────────────────────────────────────────────────────────────
// What map mode draws over the canvas itself, independent of the panel: the
// attribution pill (a licence obligation — it must stay up whenever the map
// is, whatever the panel is doing), the hover tooltip over the surroundings,
// and the status bar: graphic scale + cursor coordinates, the two readouts
// every GIS tool keeps on screen.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLatLon, scaleBar, type ScaleBar } from '../../lib/geo/basemap/map-readout'
import { useGeoStore } from '../../stores/geoStore'
import type { ContextHover, GeoSystemAPI } from '../../lib/geo/geo-system'
import { useGeoCtl } from './useGeoController'

export function MapOverlays() {
  const mapMode = useGeoStore((s) => s.mapMode)
  const attributions = useGeoStore((s) => s.attributions)
  const hover = useContextHover(mapMode === 'on')

  if (mapMode !== 'on') return null
  return (
    <>
      <MapStatusBar />
      {attributions.length > 0 && (
        <div
          className="absolute bottom-2 right-2 z-20 pointer-events-auto max-w-[60%] px-2 py-1 rounded-[6px] text-[9.5px] leading-tight text-[var(--text-dim)] bg-[rgba(10,10,14,0.72)] border border-[var(--border)]"
          data-testid="geo-attribution"
        >
          {attributions.join(' · ')}
        </div>
      )}

      {/* What am I looking at? Follows the pointer, says only what OSM knows. */}
      {hover && (
        <div
          className="absolute z-30 pointer-events-none px-2 py-1.5 rounded-[7px] max-w-[220px] bg-[rgba(10,10,14,0.88)] border border-[var(--border-strong)] shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {hover.name && (
            <div className="text-[11.5px] font-medium text-[var(--text)] leading-snug truncate">{hover.name}</div>
          )}
          {hover.label && <div className="text-[10px] text-[var(--text-faint)] leading-snug">{hover.label}</div>}
        </div>
      )}
    </>
  )
}

/**
 * Identify the surroundings on hover. Subscribed only while the map is on, so
 * nothing raycasts in the ordinary viewer.
 */
function useContextHover(active: boolean): ContextHover | null {
  const { getGeo } = useGeoCtl()
  const [hover, setHover] = useState<ContextHover | null>(null)
  useEffect(() => {
    if (!active) { setHover(null); return }
    let cancelled = false
    let api: GeoSystemAPI | null = null
    void getGeo()?.then((geo) => {
      if (cancelled) return
      api = geo
      geo.setContextHoverCallback(setHover)
    })
    return () => {
      cancelled = true
      api?.setContextHoverCallback(null)
      setHover(null)
    }
  }, [active, getGeo])
  return hover
}

/** Scale is re-measured this often even without pointer input (camera flights). */
const SCALE_POLL_MS = 400
/** Half the baseline the scale is measured over, CSS px. */
const SCALE_PROBE_PX = 50

/**
 * Bottom-left readout. The scale is measured on the GROUND at the centre of
 * the view (two picks 100 px apart): in a tilted 3D view no single scale is
 * true everywhere, so it says where it is true. Coordinates follow the
 * pointer; a click on them copies "lat, lon".
 */
function MapStatusBar() {
  const { t } = useTranslation('geo')
  const { getGeo } = useGeoCtl()
  const anchor = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<ScaleBar | null>(null)
  const [coord, setCoord] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const host = anchor.current?.parentElement
    if (!host) return
    let api: GeoSystemAPI | null = null
    let cancelled = false
    let frame = 0
    let pointer: { x: number; y: number } | null = null

    const measure = (): void => {
      frame = 0
      if (!api) return
      const r = host.getBoundingClientRect()
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const a = api.pickGroundScene(cx - SCALE_PROBE_PX, cy)
      const b = api.pickGroundScene(cx + SCALE_PROBE_PX, cy)
      setBar(a && b ? scaleBar(Math.hypot(b.x - a.x, b.z - a.z) / (2 * SCALE_PROBE_PX)) : null)
      if (pointer) {
        const ll = api.pickGround(pointer.x, pointer.y)
        setCoord(ll ? formatLatLon(ll.lat, ll.lon) : null)
      }
    }
    const schedule = (): void => { if (!frame) frame = requestAnimationFrame(measure) }
    const onMove = (e: PointerEvent): void => { pointer = { x: e.clientX, y: e.clientY }; schedule() }
    const onLeave = (): void => { pointer = null; setCoord(null) }

    void getGeo()?.then((geo) => {
      if (cancelled) return
      api = geo
      schedule()
    })
    host.addEventListener('pointermove', onMove, { passive: true })
    host.addEventListener('pointerleave', onLeave)
    host.addEventListener('wheel', schedule, { passive: true })
    const poll = setInterval(schedule, SCALE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(poll)
      if (frame) cancelAnimationFrame(frame)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('wheel', schedule)
    }
  }, [getGeo])

  const copy = (): void => {
    if (!coord) return
    void navigator.clipboard?.writeText(coord).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => { /* clipboard blocked — the text is still on screen */ })
  }

  return (
    <div
      ref={anchor}
      className="absolute bottom-2 left-2 z-20 flex items-center gap-2 px-2 py-1 rounded-[6px] text-[10px] leading-none tabular-nums text-[var(--text-dim)] bg-[rgba(10,10,14,0.72)] border border-[var(--border)]"
      data-testid="geo-status-bar"
    >
      {bar && (
        <span className="flex items-center gap-1.5" title={t('readout.scaleHint')}>
          <span
            aria-hidden
            className="block h-[5px] border-x border-b border-[var(--text-dim)]"
            style={{ width: Math.round(bar.px) }}
          />
          <span>≈ {bar.label}</span>
        </span>
      )}
      {bar && coord && <span aria-hidden className="w-px h-3 bg-[var(--border-strong)]" />}
      {coord && (
        <button
          type="button"
          onClick={copy}
          title={t('readout.copy')}
          className="pointer-events-auto font-mono hover:text-[var(--text)] transition-colors"
        >
          {copied ? t('readout.copied') : coord}
        </button>
      )}
    </div>
  )
}
