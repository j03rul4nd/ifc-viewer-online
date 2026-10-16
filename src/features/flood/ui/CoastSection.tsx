// ─── Coast (flood panel) ──────────────────────────────────────────────────────
// The sea the rain falls next to: which kind of coast this is, the tide, a
// storm surge, the waves and a sea-level-rise horizon, and the still-water
// level and run-up they add up to (coastal.ts). The level is applied when the
// run starts; the report after it says how much land the sea took.

import { useShallow } from 'zustand/react/shallow'
import { LookSlider, Notice, Segmented, StatRow, SwitchRow } from '../../../components/geo/ui'
import {
  coastLevels, coastProfile, coastProfileAt,
  type CoastKind, type CoastProfile, type CoastScenario,
} from '../core/coastal'
import { useFloodStore, type FloodSettings } from '../store'
import { useGeoStore } from '../../../stores/geoStore'

const KINDS: CoastKind[] = [
  'mediterranean', 'adriatic', 'atlantic', 'macrotidal', 'north-sea', 'baltic', 'black-sea', 'estuary-east-asia', 'ocean',
]

type CoastSettings = Pick<FloodSettings, 'coast' | 'coastKind' | 'coastTide' | 'coastSurgeM' | 'coastWaveHsM' | 'coastExposure' | 'coastRiseM'>

function profileOf(s: CoastSettings, place: { lat: number; lon: number } | null): CoastProfile {
  if (s.coastKind) return coastProfile(s.coastKind)
  return place ? coastProfileAt(place.lat, place.lon) : coastProfile('ocean')
}

function scenarioOf(s: CoastSettings): CoastScenario {
  return { tide: s.coastTide, surgeM: s.coastSurgeM, waveHsM: s.coastWaveHsM, exposure: s.coastExposure, riseM: s.coastRiseM }
}

/** What the run should stand the sea at, or null when the coast is off. */
export function coastFor(
  s: CoastSettings, place: { lat: number; lon: number } | null,
): { profile: CoastProfile; scenario: CoastScenario } | null {
  return s.coast ? { profile: profileOf(s, place), scenario: scenarioOf(s) } : null
}

const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} m`

type T = (key: string, opts?: Record<string, unknown>) => string

export function CoastSection({ t, caption, selectCls, mapOn }: { t: T; caption: string; selectCls: string; mapOn: boolean }) {
  const s = useFloodStore(useShallow((st) => ({
    coast: st.coast, coastKind: st.coastKind, coastTide: st.coastTide, coastSurgeM: st.coastSurgeM,
    coastWaveHsM: st.coastWaveHsM, coastExposure: st.coastExposure, coastRiseM: st.coastRiseM,
    report: st.coastReport, set: st.set,
  })))
  const place = useFloodPlace()
  const profile = profileOf(s, place)
  const lv = coastLevels(profile, scenarioOf(s))
  const auto = place ? coastProfileAt(place.lat, place.lon).kind : null

  return (
    <section className="flex flex-col gap-2">
      <div className={caption}>{t('coast.title')}</div>
      <SwitchRow compact label={t('coast.switch')} checked={s.coast && mapOn} disabled={!mapOn}
        note={mapOn ? t('coast.note') : t('osm.mapOff')}
        onChange={(v) => s.set(v ? {
          coast: true,
          // Start from this coast's own severe storm, not from a number that
          // belongs to another sea.
          coastSurgeM: profile.surgeM, coastWaveHsM: Math.round(profile.stormHsM * 0.5 * 2) / 2,
        } : { coast: false })} />
      {s.coast && mapOn && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('coast.kind')}</span>
            <select
              value={s.coastKind ?? 'auto'}
              onChange={(e) => s.set({ coastKind: e.target.value === 'auto' ? null : e.target.value as CoastKind })}
              className={`flex-1 ${selectCls}`} aria-label={t('coast.kind')}
            >
              <option value="auto">{t('coast.auto', { kind: t(`coast.kinds.${auto ?? 'ocean'}`) })}</option>
              {KINDS.map((k) => <option key={k} value={k}>{t(`coast.kinds.${k}`)}</option>)}
            </select>
          </div>
          <div className="text-[10px] leading-snug text-[var(--text-faint)]">
            {t('coast.facts', { range: profile.springRangeM.toFixed(1), surge: profile.surgeM.toFixed(1), hs: profile.stormHsM.toFixed(0) })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('coast.tide')}</span>
            <Segmented label={t('coast.tide')} value={s.coastTide}
              options={(['low', 'mean', 'high', 'spring'] as const).map((id) => ({ id, label: t(`coast.tides.${id}`) }))}
              onChange={(v) => s.set({ coastTide: v })} />
          </div>
          <LookSlider label={t('coast.surge')} value={s.coastSurgeM} min={0} max={4} step={0.1} format={(v) => `${v.toFixed(1)} m`} onChange={(v) => s.set({ coastSurgeM: v })} />
          <LookSlider label={t('coast.waves')} value={s.coastWaveHsM} min={0} max={10} step={0.5} format={(v) => `${v.toFixed(1)} m`} onChange={(v) => s.set({ coastWaveHsM: v })} />
          <LookSlider label={t('coast.rise')} value={s.coastRiseM} min={0} max={1.5} step={0.05} format={(v) => `${v.toFixed(2)} m`} onChange={(v) => s.set({ coastRiseM: v })} />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-faint)] w-[54px]">{t('coast.exposure')}</span>
            <Segmented label={t('coast.exposure')} value={s.coastExposure}
              options={[{ id: 'open', label: t('coast.open') }, { id: 'harbour', label: t('coast.harbour') }]}
              onChange={(v) => s.set({ coastExposure: v })} />
          </div>
          <StatRow label={t('coast.still')} value={sign(lv.stillM)} />
          <StatRow label={t('coast.runup')} value={`${sign(lv.stillM + lv.runupM)} (${t('coast.runupAbove', { m: lv.runupM.toFixed(2) })})`} />
          <div className="text-[10px] leading-snug text-[var(--text-faint)]">{t('coast.typical')}</div>
          {s.report?.noSea && <Notice tone="warn">{t('coast.noSea')}</Notice>}
          {s.report && !s.report.noSea && (
            <Notice tone="info">
              {t('coast.result', {
                sea: Math.round(s.report.seaAreaM2).toLocaleString(),
                land: Math.round(s.report.landTakenM2).toLocaleString(),
                runup: Math.round(s.report.runupAreaM2).toLocaleString(),
              })}
            </Notice>
          )}
        </>
      )}
    </section>
  )
}

function useFloodPlace(): { lat: number; lon: number } | null {
  const p = useGeoStore((g) => g.placement)
  return p ? { lat: p.lat, lon: p.lon } : null
}
