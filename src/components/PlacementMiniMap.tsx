// ─── PlacementMiniMap ─────────────────────────────────────────────────────────
// A small Leaflet map for choosing and reviewing where a model sits on Earth.
// Typing coordinates into two boxes tells you nothing about whether you got it
// right; a map does. It serves three jobs from one component:
//   • manual placement — drag the pin (or click) to place a non-georeferenced model
//   • review — see where an IFC's own georeferencing actually landed
//   • multi-model — show every other loaded model's pin for context, so a
//     project whose files disagree is visible instead of silently wrong
//
// Privacy: this fetches map tiles, so it is mounted ONLY after the same consent
// gate the 3D map mode uses. Geolocation is strictly opt-in per click, the
// coordinates never leave the browser, and no analytics event carries them
// (INV-5). Leaflet and its CSS load lazily with the GeoPanel chunk.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createLogger } from '../lib/logger'

const log = createLogger('MiniMap')

/** OSM raster tiles — same source and attribution duty as the 3D basemap. */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '© OpenStreetMap'
/** Tile zoom used when focusing a single site. */
const SITE_ZOOM = 16

export interface MiniMapPin {
  id: string
  lat: number
  lon: number
  label: string
  /** Renders muted — a sibling model shown for context, not the edit target. */
  secondary?: boolean
}

interface PlacementMiniMapProps {
  lat: number
  lon: number
  /** Called on drag-end and on map click. Omit to make the map read-only. */
  onChange?: (lat: number, lon: number) => void
  /** Sibling models drawn muted for multi-model context. */
  otherPins?: MiniMapPin[]
  /** Fit the view to all pins instead of centring on the primary one. */
  fitAll?: boolean
  heightPx?: number
}

/**
 * Leaflet's default marker points at PNGs resolved relative to the CSS, which
 * bundlers routinely break. A divIcon is pure DOM: no extra requests, themeable
 * with our CSS variables, and it cannot 404.
 */
function pinIcon(secondary: boolean): L.DivIcon {
  const color = secondary ? 'var(--text-faint)' : 'var(--accent)'
  const size = secondary ? 12 : 16
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid rgba(255,255,255,0.85);
      box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  })
}

export function PlacementMiniMap({
  lat, lon, onChange, otherPins = [], fitAll = false, heightPx = 150,
}: PlacementMiniMapProps) {
  const { t } = useTranslation('geo')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const othersRef = useRef<L.Marker[]>([])
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  // ── Map lifecycle (created once; never re-created on coordinate changes) ─────
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, {
      center: [lat, lon],
      zoom: SITE_ZOOM,
      zoomControl: true,
      attributionControl: true,
      // The panel is narrow and lives inside a scrolling container: a scroll
      // gesture over the map should scroll the panel, not zoom the map.
      scrollWheelZoom: false,
    })
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map)

    const marker = L.marker([lat, lon], {
      icon: pinIcon(false),
      draggable: Boolean(onChangeRef.current),
      keyboard: true,
    }).addTo(map)

    marker.on('dragend', () => {
      const p = marker.getLatLng()
      onChangeRef.current?.(p.lat, p.lng)
    })
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!onChangeRef.current) return
      marker.setLatLng(e.latlng)
      onChangeRef.current(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map
    markerRef.current = marker

    // The panel animates in, so the map is measured before it has its final
    // size — Leaflet needs to be told once the layout has settled.
    const settle = setTimeout(() => map.invalidateSize(), 250)

    return () => {
      clearTimeout(settle)
      map.remove()
      mapRef.current = null
      markerRef.current = null
      othersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Follow externally-driven coordinate changes (typed input, 3D drag) ───────
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    const current = marker.getLatLng()
    // Skip when the change came from this map — re-centring mid-drag fights
    // the user's pointer.
    if (Math.abs(current.lat - lat) < 1e-9 && Math.abs(current.lng - lon) < 1e-9) return
    marker.setLatLng([lat, lon])
    if (!fitAll) map.panTo([lat, lon], { animate: true })
  }, [lat, lon, fitAll])

  // ── Sibling model pins (multi-model context) ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const m of othersRef.current) m.remove()
    othersRef.current = otherPins.map((p) =>
      L.marker([p.lat, p.lon], { icon: pinIcon(true), interactive: true })
        .bindTooltip(p.label, { direction: 'top' })
        .addTo(map),
    )

    // With several models loaded, framing all of them is the only view that
    // reveals a file placed in the wrong country.
    if (fitAll && otherPins.length > 0) {
      const bounds = L.latLngBounds([[lat, lon], ...otherPins.map((p) => [p.lat, p.lon] as [number, number])])
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: SITE_ZOOM })
    }
  }, [otherPins, fitAll, lat, lon])

  // ── "Use my current location" ───────────────────────────────────────────────
  const handleLocate = useCallback(() => {
    if (!onChangeRef.current) return
    if (!('geolocation' in navigator)) {
      setLocateError(t('placement.locateUnsupported'))
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const { latitude, longitude } = pos.coords
        onChangeRef.current?.(latitude, longitude)
        markerRef.current?.setLatLng([latitude, longitude])
        mapRef.current?.setView([latitude, longitude], SITE_ZOOM)
      },
      (err) => {
        setLocating(false)
        // Denied permission is a choice, not a failure — say so plainly.
        setLocateError(err.code === err.PERMISSION_DENIED
          ? t('placement.locateDenied')
          : t('placement.locateFailed'))
        log.debug('geolocation failed:', err.message)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [t])

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={containerRef}
        style={{ height: heightPx }}
        className="w-full rounded-[8px] overflow-hidden border border-[var(--border-strong)] geo-minimap"
        role="application"
        aria-label={t('placement.mapLabel')}
      />
      {onChange && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleLocate}
            disabled={locating}
            className="px-2 py-1 rounded-[6px] text-[10.5px] font-medium border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40"
          >
            {locating ? t('placement.locating') : t('placement.useMyLocation')}
          </button>
          <span className="text-[9.5px] text-[var(--text-faint)] leading-snug min-w-0">
            {t('placement.mapHint')}
          </span>
        </div>
      )}
      {locateError && (
        <div className="text-[10px] text-[var(--danger)] leading-snug">{locateError}</div>
      )}
    </div>
  )
}

export default PlacementMiniMap
