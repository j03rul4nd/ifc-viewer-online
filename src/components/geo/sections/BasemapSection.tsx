// ─── Basemap (Advanced) ───────────────────────────────────────────────────────
// Which tiles lie under the model. Satellite and custom sources go through
// their own sub-flows (terms, template) — see flows.tsx.
//
// "Vector" is OpenStreetMap as data, painted by our own style engine
// (lib/geo/basemap): sharp at every zoom and screen, and restyleable. The
// raster Streets/Topo maps stay for when a familiar OSM look is wanted, and as
// the fallback if the vector source is unreachable.

import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../../../stores/geoStore'
import { isVectorProviderId, VECTOR_STYLE_IDS, vectorProviderId } from '../../../lib/geo/providers'
import { SATELLITE_PROVIDERS, useGeoCtl } from '../useGeoController'
import { Caption, Choices, Group, Hint } from '../ui'
import { LookChoices, LookTuningSliders } from './LookChoices'
import { MapPrivacy } from './MapPrivacy'

export function useBasemapOptions(withCustom: boolean) {
  const { t } = useTranslation('geo')
  const baseLayerId = useGeoStore((s) => s.baseLayerId)
  const satellite = (SATELLITE_PROVIDERS as readonly string[]).includes(baseLayerId)
  return [
    { id: 'vector', label: t('layers.vector'), active: isVectorProviderId(baseLayerId) },
    { id: 'osm', label: t('layers.streets'), active: baseLayerId === 'osm' },
    { id: 'opentopomap', label: t('layers.topo'), active: baseLayerId === 'opentopomap' },
    { id: 'satellite', label: t('layers.satellite'), active: satellite },
    ...(withCustom ? [{ id: 'custom', label: t('layers.custom'), active: baseLayerId === 'custom' }] : []),
  ]
}

/** The cartographic style row — only while the vector basemap is active. */
export function MapStyleChoices() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const baseLayerId = useGeoStore((s) => s.baseLayerId)
  if (!isVectorProviderId(baseLayerId)) return null
  return (
    <>
      <Caption>{t('layers.mapStyle')}</Caption>
      <Choices
        label={t('layers.mapStyle')}
        minWidth={70}
        options={VECTOR_STYLE_IDS.map((id) => ({
          id: vectorProviderId(id),
          label: t(`layers.styles.${id}`),
          active: baseLayerId === vectorProviderId(id),
        }))}
        onSelect={ctl.selectBasemap}
      />
    </>
  )
}

export function BasemapSection() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const options = useBasemapOptions(true)
  const attributions = useGeoStore((s) => s.attributions)

  return (
    <Group>
      <Caption>{t('quick.basemap')}</Caption>
      <Choices label={t('quick.basemap')} options={options} onSelect={ctl.selectBasemap} />
      <MapStyleChoices />
      <LookChoices />
      <LookTuningSliders />
      {/* What the licence pill on the canvas says, readable at panel scale. */}
      {attributions.length > 0 && <Hint>{attributions.join(' · ')}</Hint>}
      <MapPrivacy />
    </Group>
  )
}
