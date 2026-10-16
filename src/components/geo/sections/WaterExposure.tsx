// ─── Water by the model (Surroundings) ────────────────────────────────────────
// What kind of water the model stands next to — a river, a lake, an estuary,
// the open ocean, a Mediterranean beach — and the typical current, tide, waves
// and salinity of that kind, with what a designer has to watch for there
// (water-exposure). Read from the OSM the City view already fetched.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WaterExposure as Exposure } from '../../../lib/geo/water-exposure'
import type { GeoSystemAPI } from '../../../lib/geo/geo-system'
import { useGeoCtl } from '../useGeoController'
import { Caption, Hint } from '../ui'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function WaterExposure({ revision }: { revision: unknown }) {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const [e, setE] = useState<Exposure | null>(null)
  const [now, setNow] = useState<ReturnType<GeoSystemAPI['getMarineNow']>>(null)

  useEffect(() => {
    let live = true
    const read = () => void ctl.getGeo()?.then((geo) => {
      if (!live) return
      setE(geo.getWaterExposure())
      setNow(geo.getMarineNow())
    }).catch(() => {})
    read()
    // The live sea arrives after the map and moves with the hours.
    const timer = setInterval(read, 60_000)
    const first = setTimeout(read, 4000)
    return () => { live = false; clearInterval(timer); clearTimeout(first) }
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
        {now && (e.cls === 'sea' || e.cls === 'ocean' || e.cls === 'beach' || e.cls === 'estuary' || e.cls === 'lagoon') && (
          <div className="mt-1 rounded-[7px] bg-[var(--surface-2)] px-1.5 py-1 flex flex-col gap-0.5">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.08em] text-[rgb(56,189,248)]">{t('waterExposure.liveTitle')}</div>
            {row(t('waterExposure.current'), `${now.currentMS.toFixed(2)} m/s · ${t('waterExposure.towards', { dir: COMPASS[Math.round(now.currentToDeg / 45) % 8] })}`)}
            {Number.isFinite(now.waveHsM) && row(t('waterExposure.wavesNow'), `${now.waveHsM.toFixed(1)} m`)}
            <div className="text-[9.5px] leading-snug text-[var(--text-faint)]">
              {t('waterExposure.liveCell', { km: Math.round(now.cell.distanceKm) })}
            </div>
          </div>
        )}
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
