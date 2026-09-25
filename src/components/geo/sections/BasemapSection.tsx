// ─── Basemap (Advanced) ───────────────────────────────────────────────────────
// Which tiles lie under the model. Satellite and custom sources go through
// their own sub-flows (terms, template) — see flows.tsx.

import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../../../stores/geoStore'
import { SATELLITE_PROVIDERS, useGeoCtl } from '../useGeoController'
import { Caption, Choices, Group, Hint } from '../ui'

export function BasemapSection() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const baseLayerId = useGeoStore((s) => s.baseLayerId)
  const attributions = useGeoStore((s) => s.attributions)
  const satellite = (SATELLITE_PROVIDERS as readonly string[]).includes(baseLayerId)

  return (
    <Group>
      <Caption>{t('quick.basemap')}</Caption>
      <Choices
        label={t('quick.basemap')}
        options={[
          { id: 'osm', label: t('layers.streets'), active: baseLayerId === 'osm' },
          { id: 'opentopomap', label: t('layers.topo'), active: baseLayerId === 'opentopomap' },
          { id: 'satellite', label: t('layers.satellite'), active: satellite },
          { id: 'custom', label: t('layers.custom'), active: baseLayerId === 'custom' },
        ]}
        onSelect={ctl.selectBasemap}
      />
      {/* What the licence pill on the canvas says, readable at panel scale. */}
      {attributions.length > 0 && <Hint>{attributions.join(' · ')}</Hint>}
    </Group>
  )
}
