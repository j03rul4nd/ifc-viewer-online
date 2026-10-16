// ─── Coast (flood panel) ──────────────────────────────────────────────────────
// The sea the rain falls next to: which kind of coast this is, the tide, a
// storm surge, the waves and a sea-level-rise horizon, and the still-water
// level and run-up they add up to (coastal.ts). The level is applied when the
// run starts; the report after it says how much land the sea took.

import { useShallow } from 'zustand/react/shallow'
import { LookSlider, Notice, Segmented, StatRow, SwitchRow } from '../../../components/geo/ui'
import {
  coastLevels, coastProfile, coastProfileAt, tideCurve,
  type CoastKind, type CoastProfile, type CoastScenario,
} from '../core/coastal'
import { useFloodStore, type FloodSettings } from '../store'
import { rainDurationS, type Hyetograph } from '../core/hyetograph'
import type { CoastRequest } from '../system'
import { useGeoStore } from '../../../stores/geoStore'

const KINDS: CoastKind[] = [
  'mediterranean', 'adriatic', 'atlantic', 'macrotidal', 'north-sea', 'baltic', 'black-sea', 'estuary-east-asia', 'ocean',
]

type CoastSettings = Pick<FloodSettings, 'coast' | 'coastKind' | 'coastTide' | 'coastSurgeM' | 'coastWaveHsM' | 'coastExposure' | 'coastRiseM' | 'coastTidal' | 'coastPeakOffsetH' | 'coastRangeM'>

function profileOf(s: CoastSettings, place: { lat: number; lon: number } | null): CoastProfile {
  if (s.coastKind) return coastProfile(s.coastKind)
  return place ? coastProfileAt(place.lat, place.lon) : coastProfile('ocean')
}

function scenarioOf(s: CoastSettings): CoastScenario {
  return { tide: s.coastTide, surgeM: s.coastSurgeM, waveHsM: s.coastWaveHsM, exposure: s.coastExposure, riseM: s.coastRiseM, rangeM: s.coastRangeM }
}

/** The run's length and where its worst moment falls, s. */
function runTiming(s: CoastSettings & { hyetograph: Hyetograph; drainMin: number }): { durationS: number; peakAtS: number } {
  const durationS = rainDurationS(s.hyetograph) + s.drainMin * 60
  const peak = s.hyetograph.intensityMmH.indexOf(Math.max(...s.hyetograph.intensityMmH))
  const rainPeakS = (Math.max(0, peak) + 0.5) * s.hyetograph.intervalS
  return { durationS, peakAtS: rainPeakS + s.coastPeakOffsetH * 3600 }
}

const PEAK_OFFSETS = [-2, 0, 2, 4] as const

/** What the run should stand the sea at, or null when the coast is off. */
/**
 * What the run should do with the sea, or null when the coast is off. With the
 * tide on, the worst moment — high water and the top of the surge — is put on
 * the rain's peak: the case of a storm that hits at high tide.
 */
export function coastFor(
  s: CoastSettings & { hyetograph: Hyetograph; drainMin: number },
  place: { lat: number; lon: number } | null,
): CoastRequest | null {
  if (!s.coast) return null
  return {
    profile: profileOf(s, place), scenario: scenarioOf(s),
    timeline: s.coastTidal ? runTiming(s) : null,
  }
}

const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} m`

type T = (key: string, opts?: Record<string, unknown>) => string

export function CoastSection({ t, caption, selectCls, mapOn }: { t: T; caption: string; selectCls: string; mapOn: boolean }) {
  const s = useFloodStore(useShallow((st) => ({
    coast: st.coast, coastKind: st.coastKind, coastTide: st.coastTide, coastSurgeM: st.coastSurgeM,
    coastWaveHsM: st.coastWaveHsM, coastExposure: st.coastExposure, coastRiseM: st.coastRiseM, coastTidal: st.coastTidal,
    coastPeakOffsetH: st.coastPeakOffsetH, coastRangeM: st.coastRangeM, hyetograph: st.hyetograph, drainMin: st.drainMin,
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
            {profile.port && <> · {t('coast.port', { port: profile.port })}</>}
          </div>
          <LookSlider label={t('coast.rangeLabel')} value={s.coastRangeM ?? profile.springRangeM} min={0} max={15} step={0.1}
            format={(v) => `${v.toFixed(1)} m`} onChange={(v) => s.set({ coastRangeM: v })} />
          {s.coastRangeM !== null && (
            <button className="self-start text-[10px] text-[var(--accent-2)] hover:underline" onClick={() => s.set({ coastRangeM: null })}>
              {t('coast.rangeAuto', { m: profile.springRangeM.toFixed(1) })}
            </button>
          )}
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
          <SwitchRow compact label={t('coast.tidal')} checked={s.coastTidal}
            note={t('coast.tidalNote')} onChange={(v) => s.set({ coastTidal: v })} />
          {s.coastTidal && (
            <>
              <div className="flex items-center gap-2 max-md:flex-col max-md:items-stretch">
                <span className="text-[10px] max-md:text-[12px] text-[var(--text-faint)] w-[54px] max-md:w-auto">{t('coast.highWater')}</span>
                <Segmented label={t('coast.highWater')} value={String(s.coastPeakOffsetH) as `${(typeof PEAK_OFFSETS)[number]}`}
                  options={PEAK_OFFSETS.map((h) => ({ id: String(h) as `${typeof h}`, label: h === 0 ? t('coast.withRain') : `${h > 0 ? '+' : '−'}${Math.abs(h)} h` }))}
                  onChange={(v) => s.set({ coastPeakOffsetH: Number(v) })} />
              </div>
              <TidePreview profile={profile} scenario={scenarioOf(s)} timing={runTiming(s)} label={t('coast.preview')} />
            </>
          )}
          <StatRow label={t('coast.still')} value={sign(lv.stillM)} />
          <StatRow label={t('coast.runup')} value={`${sign(lv.stillM + lv.runupM)} (${t('coast.runupAbove', { m: lv.runupM.toFixed(2) })})`} />
          <div className="text-[10px] leading-snug text-[var(--text-faint)]">{t('coast.typical')}</div>
          {s.report?.noSea && <Notice tone="warn">{t('coast.noSea')}</Notice>}
          {s.report && !s.report.noSea && (
            <Notice tone="info">
              {s.report.tidal && <>{t('coast.range', { min: sign(s.report.rangeM.min), max: sign(s.report.rangeM.max) })}<br /></>}
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

/** The sea over the run before it is run: where high water falls against the rain. */
function TidePreview({ profile, scenario, timing, label }: {
  profile: CoastProfile; scenario: CoastScenario; timing: { durationS: number; peakAtS: number }; label: string
}) {
  const stepS = Math.max(60, Math.round(timing.durationS / 120))
  const curve = tideCurve(profile, scenario, { ...timing, stepS })
  const lo = Math.min(...curve), hi = Math.max(...curve)
  const span = Math.max(hi - lo, 0.05)
  const W = 100, H = 28
  const d = curve.map((v, k) => `${k ? 'L' : 'M'}${((k * stepS) / timing.durationS * W).toFixed(2)},${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(2)}`).join('')
  const px = Math.min(W, Math.max(0, (timing.peakAtS / timing.durationS) * W))
  return (
    <figure className="flex flex-col gap-0.5" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[36px] max-md:h-[48px] rounded-[6px] bg-[var(--surface-2)]">
        <line x1={px} x2={px} y1={0} y2={H} stroke="var(--text-faint)" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="rgb(56,189,248)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[9.5px] font-mono tabular-nums text-[var(--text-faint)]">
        <span>{sign(curve[0])}</span><span>{label}</span><span>{sign(hi)}</span>
      </figcaption>
    </figure>
  )
}

function useFloodPlace(): { lat: number; lon: number } | null {
  const p = useGeoStore((g) => g.placement)
  return p ? { lat: p.lat, lon: p.lon } : null
}
