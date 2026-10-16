// ─── Water by the model (Surroundings) ────────────────────────────────────────
// What kind of water the model stands next to — a river, a lake, an estuary,
// the open ocean, a Mediterranean beach — and the typical current, tide, waves
// and salinity of that kind, with what a designer has to watch for there
// (water-exposure). Read from the OSM the City view already fetched.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WaterExposure as Exposure } from '../../../lib/geo/water-exposure'
import { useGeoCtl } from '../useGeoController'
import { Caption, Hint } from '../ui'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function WaterExposure({ revision }: { revision: unknown }) {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const [e, setE] = useState<Exposure | null>(null)

  useEffect(() => {
    let live = true
    void ctl.getGeo()?.then((geo) => { if (live) setE(geo.getWaterExposure()) }).catch(() => {})
    return () => { live = false }
  }, [ctl, revision])

  if (!e) return null
  const row = (label: string, value: string) => (
    <div className="flex items-baseline gap-2 text-[10px]">
      <span className="w-[86px] shrink-0 text-[var(--text-faint)]">{label}</span>
      <span className="text-[var(--text-dim)] tabular-nums">{value}</span>
    </div>
  )

  return (
    <>
      <Caption>{t('waterExposure.title')}</Caption>
      <div className="flex flex-col gap-1 rounded-[9px] border border-[var(--border)] px-2 py-1.5">
        <div className="text-[10.5px] text-[var(--text)]">
          {t(`waterExposure.cls.${e.cls}`)}{e.name ? ` · ${e.name}` : ''}
          <span className="text-[var(--text-faint)]"> · {e.distanceM === 0 ? t('waterExposure.over') : t('waterExposure.away', { m: e.distanceM })}</span>
        </div>
        {row(t('waterExposure.current'), t('waterExposure.currentValue', { typ: e.currentMS.typical, max: e.currentMS.severe })
          + (e.flowBearingDeg !== undefined ? ` · ${t('waterExposure.towards', { dir: COMPASS[Math.round(e.flowBearingDeg / 45) % 8] })}` : ''))}
        {e.slope !== undefined && row(t('waterExposure.slope'), `${(e.slope * 1000).toFixed(1)} ‰`)}
        {row(t('waterExposure.tide'), e.tideRangeM > 0 ? `${e.tideRangeM.toFixed(1)} m` : '—')}
        {row(t('waterExposure.waves'), e.waveHsM > 0 ? `${e.waveHsM.toFixed(1)} m` : '—')}
        {row(t('waterExposure.salinity'), t(`waterExposure.salt.${e.salinity}`))}
        {e.coast && e.cls !== 'river' && e.cls !== 'stream' && e.cls !== 'canal' && e.cls !== 'lake' && e.cls !== 'pond'
          && row(t('waterExposure.coast'), t(`waterExposure.coasts.${e.coast}`))}
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {e.issues.map((k) => (
            <li key={k} className="text-[10px] leading-snug text-[var(--text-dim)]">· {t(`waterExposure.issue.${k}`)}</li>
          ))}
        </ul>
      </div>
      <Hint>{t('waterExposure.hint')}</Hint>
    </>
  )
}
