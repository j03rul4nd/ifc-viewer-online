// ─── GeoPanel ─────────────────────────────────────────────────────────────────
// GIS / Map mode UI: the floating panel, the overlays it owns on the canvas,
// and the long-lived subscriptions (SDK bridge, scene health, canvas picking).
//
// TWO FACES, ONE STATE. 'Basic' is four ready-made views, the basemap, two
// switches and a quality choice — everything that changes the picture a lot,
// for someone who wants to see their building in its street. 'Advanced' is
// every control, in five tabs, including what the scene costs. Both drive the
// same controller (geo/useGeoController.ts) and read the same store, so a
// preset and the advanced switches can never disagree about what is on screen.
//
// This file only COMPOSES. The logic lives in geo/useGeoController.ts and
// geo/useGeoEffects.ts; the pieces live in geo/ (chrome, flows, QuickSetup,
// AdvancedTabs, sections/). Each section sits behind its own error boundary:
// the panel is also where the map is turned OFF and where the licence
// attribution is kept alive, so a render error in one table must not cost
// either.
//
// Loaded via React.lazy — it statically imports placement, crs (proj4) and the
// geo runners, which must all stay out of the entry chunk. Product state lives
// in geoStore; GPU state lives in the viewer's GeoSystem.

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../stores/geoStore'
import { ViewportPanel } from './ViewportPanel'
import { GeoControllerProvider, useGeoController } from './geo/useGeoController'
import { useGeoEffects } from './geo/useGeoEffects'
import { MapHero, PanelHeader, SceneFootnote, SceneStatus } from './geo/chrome'
import { QuickSetup } from './geo/QuickSetup'
import { AdvancedTabs, type AdvancedTabId } from './geo/AdvancedTabs'
import { ConsentDialog, CrsStep, CustomSourceSheet, ManualStep, PlacementEditor, TermsSheet } from './geo/flows'
import { MapOverlays } from './geo/MapOverlays'
import { SECTION_X, SectionBoundary } from './geo/ui'
import type { ViewerAPI } from '../lib/viewer'

interface GeoPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

/** Below this much room for the body, the panel scrolls as one piece. */
const COMPACT_BELOW_PX = 360

/** True while the element is shorter than `px`. */
function useShortHeight(ref: React.RefObject<HTMLElement>, px: number): boolean {
  const [short, setShort] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => setShort(el.clientHeight > 0 && el.clientHeight < px)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  })
  return short
}

export default function GeoPanel({ viewerApiRef }: GeoPanelProps) {
  const { t } = useTranslation('geo')
  const ctl = useGeoController(viewerApiRef)
  useGeoEffects(ctl, viewerApiRef)

  const panelOpen = useGeoStore((s) => s.panelOpen)
  const panelMode = useGeoStore((s) => s.panelMode)
  const editing = useGeoStore((s) => s.editing)
  const setPanelOpen = useGeoStore((s) => s.setPanelOpen)
  /**
   * Which Advanced tab is showing. Four (now five) tabs make the whole option
   * space visible at a glance and keep each body short — the old single column
   * was ~1500px of scroll in a 304px well.
   */
  const [tab, setTab] = useState<AdvancedTabId>('base')
  const close = (): void => setPanelOpen(false)
  const boundary = { message: t('panel.sectionFailed'), retryLabel: t('panel.sectionRetry') }
  const bodyRef = useRef<HTMLDivElement>(null)
  const compact = useShortHeight(bodyRef, COMPACT_BELOW_PX)
  const scrollBody = compact ? 'border-t border-[var(--border)]' : 'border-t border-[var(--border)] flex-1 overflow-y-auto overscroll-contain'

  // A sub-flow takes the whole body — one question at a time, with a way back.
  const flow = ctl.flow
  const sheet: React.ReactNode =
    editing ? <PlacementEditor />
    : flow?.kind === 'crs' ? <CrsStep key={flow.epsg} epsg={flow.epsg} />
    : flow?.kind === 'manual' ? <ManualStep />
    : flow?.kind === 'terms' ? <TermsSheet />
    : flow?.kind === 'custom' ? <CustomSourceSheet />
    : null

  return (
    <GeoControllerProvider value={ctl}>
      <MapOverlays />

      <ViewportPanel
        id="map"
        open={panelOpen}
        onClose={close}
        label={t('panel.title')}
        mobile="sheet"
        widthPx={panelMode === 'advanced' ? 352 : 332}
        anchor="top"
      >
        <PanelHeader onClose={close} />
        {/* Pinned chrome above a scrolling body — while there is room for it.
            On a short viewport (a laptop with the validation drawer open, a
            phone in landscape) the pinned part alone could fill the card and
            leave the body unreachable, so the whole thing becomes one scroller
            and only the tab bar stays stuck. */}
        <div
          ref={bodyRef}
          className={`flex-1 min-h-0 flex flex-col ${compact ? 'overflow-y-auto overscroll-contain' : ''}`}
        >
          <SectionBoundary {...boundary}>
            <MapHero />
          </SectionBoundary>
          <SectionBoundary {...boundary}>
            <SceneStatus />
          </SectionBoundary>

          {sheet ? (
            <div className={scrollBody}>
              <SectionBoundary {...boundary}>{sheet}</SectionBoundary>
            </div>
          ) : panelMode === 'basic' ? (
            <div className={scrollBody}>
              <SectionBoundary {...boundary}>
                <QuickSetup />
              </SectionBoundary>
            </div>
          ) : (
            <>
              <div className={`${SECTION_X} -mt-1 pb-1.5 shrink-0 empty:hidden`}>
                <SceneFootnote />
              </div>
              <AdvancedTabs tab={tab} onTab={setTab} scroll={!compact} />
            </>
          )}
        </div>
      </ViewportPanel>

      <ConsentDialog />
    </GeoControllerProvider>
  )
}
