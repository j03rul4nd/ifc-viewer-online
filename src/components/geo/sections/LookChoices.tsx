// ─── LookChoices ──────────────────────────────────────────────────────────────
// The art-direction picker: six curated looks (lib/geo/map-look.ts), each shown
// as what it IS — its sky, its sun and the colour of its buildings — rather
// than as a name to decode. One click sets light, finish and basemap together.

import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../../../stores/geoStore'
import { BUILDING_FINISHES, LIGHT_PRESETS, MAP_LOOKS, type MapLook } from '../../../lib/geo/map-look'
import { useGeoCtl } from '../useGeoController'
import { Caption, LookSlider } from '../ui'

function Swatch({ look }: { look: MapLook }) {
  const light = LIGHT_PRESETS[look.light]
  const finish = BUILDING_FINISHES[look.finish]
  // Natural has no single colour; show a warm render tone for it.
  const building = finish.tintMix > 0 ? finish.tint : '#d9b99b'
  // Sun disc placed by altitude, so dawn/dusk sit on the horizon.
  const sunTop = 70 - Math.min(60, light.sunAltitude * 1.1)
  return (
    <span
      aria-hidden
      className="relative block h-9 w-full overflow-hidden rounded-[5px] border border-[var(--border)]"
      style={{ background: `linear-gradient(180deg, ${light.sky.zenith}, ${light.sky.horizon} 78%, ${light.fog})` }}
    >
      <span
        className="absolute h-2 w-2 rounded-full"
        style={{ left: '22%', top: `${sunTop}%`, background: light.sky.sunLow, boxShadow: `0 0 8px ${light.sky.sunLow}` }}
      />
      <span className="absolute bottom-0 right-[18%] w-[14%] h-[62%]" style={{ background: building }} />
      <span className="absolute bottom-0 right-[34%] w-[11%] h-[42%]" style={{ background: building, filter: 'brightness(0.85)' }} />
      {light.windowGlow > 0.5 && (
        <span className="absolute bottom-[30%] right-[22%] h-[3px] w-[5%]" style={{ background: light.glowColor }} />
      )}
    </span>
  )
}

/** Advanced only: exposure and how lit the city is, on top of the look. */
export function LookTuningSliders() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const tuning = useGeoStore((s) => s.lookTuning)
  return (
    <div className="flex flex-col gap-1 pt-1">
      <LookSlider
        label={t('looks.exposure')} value={tuning.exposure} min={0.6} max={1.6} step={0.05}
        format={(v) => `×${v.toFixed(2)}`} onChange={(v) => ctl.tuneLook({ exposure: v })}
      />
      <LookSlider
        label={t('looks.glow')} value={tuning.glow} min={0} max={2} step={0.05}
        format={(v) => `×${v.toFixed(2)}`} onChange={(v) => ctl.tuneLook({ glow: v })}
      />
    </div>
  )
}

export function LookChoices() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const active = useGeoStore((s) => s.mapLook)
  return (
    <>
      <Caption>{t('looks.title')}</Caption>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('looks.title')}>
        {MAP_LOOKS.map((look) => {
          const on = look.id === active
          return (
            <button
              key={look.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => ctl.applyMapLook(look.id)}
              className={`flex flex-col gap-1 p-1 rounded-[7px] border text-left transition-colors ${
                on ? 'border-[var(--accent)] bg-[var(--accent-soft,rgba(99,102,241,0.12))]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
              }`}
            >
              <Swatch look={look} />
              <span className={`text-[10.5px] leading-tight px-0.5 ${on ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
                {t(`looks.${look.id}`)}
              </span>
            </button>
          )
        })}
      </div>
      {/* Time-lapse: the light travels to night (or back to day) in six
          seconds — made for screen recordings and client presentations. */}
      <button
        type="button"
        onClick={() => ctl.playLookTransition(active === 'night' ? 'daylight' : 'night')}
        className="mt-1 self-start text-[10.5px] px-2 py-1 rounded-[6px] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors"
      >
        {active === 'night' ? t('looks.playToDay') : t('looks.playToNight')}
      </button>
    </>
  )
}
