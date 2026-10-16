// ─── Subsurface view ──────────────────────────────────────────────────────────
// Surface / x-ray / cut: how the map treats what is under it. Offered up front
// when the model is mostly under the ground — a tunnel or a metro station is
// invisible on the plain map, and nobody would think to look for this switch.

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useGeoStore } from '../../../stores/geoStore'
import type { SubsurfaceMode } from '../../../lib/geo/subsurface'
import { useGeoCtl } from '../useGeoController'
import { Caption, Hint, Notice, Segmented, SwitchRow } from '../ui'

export function SubsurfaceControl() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const s = useGeoStore(useShallow((st) => ({
    mapMode: st.mapMode,
    mode: st.subsurfaceMode,
    burial: st.burial,
    markers: st.subsurfaceMarkers,
    counts: st.undergroundCounts,
  })))
  const mapOn = s.mapMode === 'on'
  const { measureBurial } = ctl

  // The model may have arrived after the map did (a federated set loads file
  // by file): measure again whenever the panel comes up on a live map.
  useEffect(() => { if (mapOn) measureBurial() }, [mapOn, measureBurial])

  if (!mapOn) return null
  const buried = s.burial?.buried === true

  return (
    <>
      {buried && s.mode === 'surface' && (
        <Notice
          tone="info"
          action={{ label: t('subsurface.show'), onClick: () => ctl.setSubsurfaceMode('cut') }}
        >
          {t('subsurface.buriedNotice', { depth: Math.round(s.burial!.depthM) })}
        </Notice>
      )}
      <Caption>{t('subsurface.title')}</Caption>
      <Segmented<SubsurfaceMode>
        label={t('subsurface.title')}
        value={s.mode}
        onChange={ctl.setSubsurfaceMode}
        options={[
          { id: 'surface', label: t('subsurface.surface') },
          { id: 'xray', label: t('subsurface.xray') },
          { id: 'cut', label: t('subsurface.cut') },
        ]}
      />
      {s.mode !== 'surface' && <Hint>{t(s.mode === 'cut' ? 'subsurface.cutHint' : 'subsurface.xrayHint')}</Hint>}
      {s.mode !== 'surface' && s.counts && (s.counts.metro + s.counts.road + s.counts.rail + s.counts.platform) > 0 && (
        // Non-negotiable: estimated depth must say so (OSM maps no depth).
        <Notice tone="warn">
          {t('subsurface.osmEstimated', {
            metro: s.counts.metro, tunnels: s.counts.road + s.counts.rail, platforms: s.counts.platform,
          })}
        </Notice>
      )}
      <SwitchRow
        label={t('subsurface.markers')}
        checked={s.markers}
        onChange={ctl.setSubsurfaceMarkers}
        note={t('subsurface.markersNote')}
        compact
      />
    </>
  )
}
