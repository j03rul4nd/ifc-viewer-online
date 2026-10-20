// ─── Feature sheet for /msp-global ────────────────────────────────────────────
// Every picture on the event page opens the real thing. A tap on a capture, an
// idea or the hero opens that feature live, full screen, with one way out that
// moves the deal forward: "I want this", which carries the feature into the
// contact form. Nothing here is a mock: each entry is a deep link into the app.

import React, { useEffect } from 'react'

// The warehouse twin is its own three.js scene, not the app in a frame: lazy,
// so the event page does not carry it until someone opens it.
const LazyAgvTwin = React.lazy(() => import('./agv/AgvTwin'))
const LazyImportTracker = React.lazy(() => import('./supply/ImportTracker'))

export type FeatureId = 'imports' | 'agv' | 'itops' | 'barcelona' | 'hotel' | 'solar' | 'helsinki' | 'tokyo' | 'quality'

export interface Feature {
  title: string
  /** What the visitor is looking at, in one line. */
  line: string
  /** Loads map tiles or live data from other servers when opened. */
  external?: boolean
  /** Builds the app URL (needs the origin for model links). Absent for an inline scene. */
  url?: (origin: string) => string
  /** Rendered in the sheet itself instead of a frame of the app. */
  inline?: 'agv' | 'imports'
}

const VELA = (o: string) => `${o}/models/hotel-vela`

export const FEATURES: Record<FeatureId, Feature> = {
  imports: {
    title: 'Imports from China, live',
    line: 'Every order from factory to your warehouse: QC, sea, air or rail, customs, ETA. Simulated.',
    inline: 'imports',
    external: true,
  },
  agv: {
    title: 'Warehouse AGVs, live',
    line: 'Six carts pick, deliver and charge. Every order closes itself in your ERP. Simulated.',
    inline: 'agv',
  },
  itops: {
    title: 'Office IT, live',
    line: 'Tap a coloured window or a label to read its device live. Wi-Fi, server room, CCTV, badges. Simulated feed.',
    url: (o) => `/?model=${o}/Ifc2x3_Duplex_Architecture.ifc&name=Demo%20office&twin=itops&validate=0&ui=article&explore=1&lang=en`,
  },
  barcelona: {
    external: true,
    title: 'Barcelona, live',
    line: 'Eight buildings on the real city. Bikes, chargers and traffic, live.',
    url: () => '/?scene=/scenes/barcelona-placa-catalunya.scene.json&ui=article&lang=en',
  },
  hotel: {
    external: true,
    title: 'A building in its real city',
    line: 'Hotel Vela on Barcelona’s map, terrain and coast.',
    url: (o) => `/?model=${VELA(o)}/BCN-IVO-ZZ-XX-M3-A-0002.ifc,${VELA(o)}/BCN-IVO-ZZ-XX-M3-S-0002.ifc,${VELA(o)}/BCN-IVO-ZZ-XX-M3-M-0002.ifc&map=terrain,buildings,showcase&validate=0&ui=article&lang=en`,
  },
  solar: {
    external: true,
    title: 'Sun and heat, real climate',
    line: 'A full year of sun on every facade, from ten years of real weather.',
    url: (o) => `/?model=${VELA(o)}/BCN-IVO-ZZ-XX-M3-A-0002.ifc&analysis=year:passive&validate=0&ui=kiosk&lang=en`,
  },
  helsinki: {
    external: true,
    title: 'Helsinki, live',
    line: 'The central station and its bus bays, updated as buses arrive.',
    url: () => '/?scene=/scenes/helsinki-rautatientori.scene.json&ui=article&lang=en',
  },
  tokyo: {
    external: true,
    title: 'Tokyo, live transit',
    line: 'Live transit around a site, on the 3D city.',
    url: () => '/?scene=/scenes/tokyo-tochomae.scene.json&ui=article&lang=en',
  },
  quality: {
    title: 'File health check',
    line: 'A building file checked in seconds. Every problem listed.',
    url: (o) => `/?model=${o}/Ifc2x3_Duplex_Architecture.ifc&name=Duplex%20house&embed=1&ui=minimal&lang=en`,
  },
}

export function FeatureSheet({ id, onClose, onWant, onSwitch }: { id: FeatureId; onClose: () => void; onWant: () => void; onSwitch?: (id: FeatureId) => void }) {
  const f = FEATURES[id]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const src = f.url ? f.url(window.location.origin) : null

  return (
    <div role="dialog" aria-modal="true" aria-label={f.title} className="fixed inset-0 z-50 flex flex-col overscroll-contain bg-[var(--bg)]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-2 sm:py-3">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-[var(--text)]">{f.title}</p>
          <p className="line-clamp-2 text-[12.5px] leading-snug text-[var(--text-dim)] sm:line-clamp-none sm:text-[13px]">{f.line}</p>
          {f.external && <p className="mt-0.5 truncate text-[10.5px] leading-snug text-[var(--text-faint)] sm:whitespace-normal sm:text-[11px]">Loads live map and city data from public servers. Nothing you have is sent.</p>}
        </div>
        <div className="flex flex-none items-center gap-1">
          {src && <a href={src} target="_blank" rel="noopener" className="hidden rounded-md px-2.5 py-1.5 text-[13px] text-[var(--text-dim)] hover:bg-[var(--surface)] sm:inline">Full screen ↗</a>}
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-3 py-1.5 text-[22px] leading-none text-[var(--text-dim)] hover:bg-[var(--surface)]">×</button>
        </div>
      </div>
      {f.inline === 'imports' ? (
        <div className="relative min-h-0 flex-1">
          <React.Suspense fallback={<div className="flex h-full items-center justify-center text-[14px] text-[var(--text-dim)]">Opening the map…</div>}>
            <LazyImportTracker onWant={onWant} onOpenWarehouse={onSwitch ? () => onSwitch('agv') : undefined} />
          </React.Suspense>
        </div>
      ) : f.inline === 'agv' ? (
        <div className="relative min-h-0 flex-1">
          <React.Suspense fallback={<div className="flex h-full items-center justify-center text-[14px] text-[var(--text-dim)]">Opening the warehouse…</div>}>
            <LazyAgvTwin onWant={onWant} />
          </React.Suspense>
        </div>
      ) : (
        <iframe src={src ?? undefined} title={f.title} className="min-h-0 flex-1 border-0 bg-black" allow="fullscreen" />
      )}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2 sm:py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <p className="min-w-0 text-[14px] leading-snug text-[var(--text-dim)]">Want this for your clients?</p>
        <button type="button" onClick={onWant} className="flex-none rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[15px] font-semibold text-white hover:brightness-110">
          I want this
        </button>
      </div>
    </div>
  )
}
