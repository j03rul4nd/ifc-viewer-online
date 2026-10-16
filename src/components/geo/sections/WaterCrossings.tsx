// ─── Water crossings (Surroundings) ───────────────────────────────────────────
// How the site's river or sea is crossed — bridge, tunnel, ferry, ford — with
// the span over water and what a rising level does to each. Read from the OSM
// the City view already fetched (water-crossings); clicking one flies there.
// Between Puxi and Pudong this is the list a reader actually wants: which way
// across still works when the Huangpu is up.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WaterCrossing } from '../../../lib/geo/water-crossings'
import { useGeoCtl } from '../useGeoController'
import { Caption, Hint } from '../ui'

const MODE_ICON: Record<WaterCrossing['mode'], string> = {
  bridge: '⌒', tunnel: '◡', ferry: '⛴', pontoon: '▭', 'at-grade': '≈',
}
const SHOWN = 8

export function WaterCrossings({ revision }: { revision: unknown }) {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const [list, setList] = useState<WaterCrossing[]>([])
  const [all, setAll] = useState(false)

  useEffect(() => {
    let live = true
    void ctl.getGeo()?.then((geo) => { if (live) setList(geo.getWaterCrossings()) }).catch(() => {})
    return () => { live = false }
  }, [ctl, revision])

  if (list.length === 0) return null
  const shown = all ? list : list.slice(0, SHOWN)
  const fly = (c: WaterCrossing) => {
    void ctl.getGeo()?.then((geo) => geo.flyToLatLon(c.at.lat, c.at.lon, c.spanM)).catch(() => {})
  }

  return (
    <>
      <Caption trailing={<span className="font-mono tabular-nums text-[9.5px] text-[var(--text-faint)]">{list.length}</span>}>
        {t('crossings.title')}
      </Caption>
      <Hint>{t('crossings.hint')}</Hint>
      <ul className="flex flex-col rounded-[9px] border border-[var(--border)] py-0.5">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => fly(c)}
              title={t(`crossings.risk.${c.floodRisk}`)}
              className="w-full flex items-center gap-2 px-2 py-1 text-left rounded-[7px] hover:bg-[var(--surface-2)] transition-colors"
            >
              <span aria-hidden className="w-4 text-center text-[11px] text-[var(--text-dim)]">{MODE_ICON[c.mode]}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[10.5px] text-[var(--text)]">
                  {c.name ?? t(`crossings.mode.${c.mode}`)}
                </span>
                <span className="block truncate text-[9.5px] text-[var(--text-faint)]">
                  {t(`crossings.mode.${c.mode}`)} · {c.carries.map((k) => t(`crossings.carries.${k}`)).join(', ')}
                  {c.water && <>{' · '}{t('crossings.over', { water: c.water })}</>}
                  {c.clearanceM !== undefined && ` · ${t('crossings.clearance', { m: Math.round(c.clearanceM) })}`}
                </span>
              </span>
              <span className="font-mono tabular-nums text-[9.5px] text-[var(--text-faint)]">{Math.round(c.spanM)} m</span>
            </button>
          </li>
        ))}
      </ul>
      {list.length > SHOWN && (
        <button
          onClick={() => setAll((v) => !v)}
          className="self-start px-1.5 py-0.5 rounded-[5px] text-[9.5px] text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
        >
          {all ? t('crossings.less') : t('crossings.more', { count: list.length - SHOWN })}
        </button>
      )}
    </>
  )
}
