// ─── MapOverlays ──────────────────────────────────────────────────────────────
// What map mode draws over the canvas itself, independent of the panel: the
// attribution pill (a licence obligation — it must stay up whenever the map
// is, whatever the panel is doing) and the hover tooltip over the
// surroundings.

import { useEffect, useState } from 'react'
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
