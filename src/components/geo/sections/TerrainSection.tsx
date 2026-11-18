// ─── Terrain (Advanced) ───────────────────────────────────────────────────────
// Real elevation under the model: style, exaggeration, and the relief look.
// Everything past the switch re-bakes from data already in memory — dragging a
// slider never refetches.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useGeoStore } from '../../../stores/geoStore'
import { CONTOUR_INTERVALS } from '../../../lib/geo/terrain-look'
import { useGeoCtl } from '../useGeoController'
import { Caption, Choices, Expander, Group, Hint, LookSlider, Notice, SwitchRow } from '../ui'

export function TerrainSection() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const [reliefOpen, setReliefOpen] = useState(false)
  const s = useGeoStore(useShallow((st) => ({
    terrainEnabled: st.terrainEnabled,
    terrainStatus: st.terrainStatus,
    terrainStyle: st.terrainStyle,
    terrainExaggeration: st.terrainExaggeration,
    terrainLook: st.terrainLook,
    contextDetail: st.contextDetail,
  })))

  return (
    <Group>
      <SwitchRow
        label={t('layers.terrain')}
        checked={s.terrainEnabled}
        onChange={ctl.toggleTerrain}
        busy={s.terrainStatus === 'loading'}
        note={
          s.terrainStatus === 'loading' ? t('layers.terrainLoading')
          : s.terrainStatus === 'error' ? t('errors.terrainFailed')
          : undefined
        }
        tone={s.terrainStatus === 'error' ? 'danger' : 'muted'}
      />

      {!s.terrainEnabled && <Hint>{t('panel.terrainHint')}</Hint>}

      {s.terrainEnabled && (
        <>
          <Caption>{t('layers.style')}</Caption>
          <Choices
            label={t('layers.style')}
            options={([
              ['imagery', t('layers.styleImagery')],
              ['shaded', t('layers.styleShaded')],
              ['hypsometric', t('layers.styleHypso')],
              ['slope', t('layers.styleSlope')],
              ['ecosystem', t('layers.styleEcosystem')],
            ] as const).map(([id, label]) => ({ id, label, active: s.terrainStyle === id }))}
            onSelect={ctl.setTerrainStyle}
          />
          {/* This style INFERS vegetation belts from altitude — it is not
              observed land cover, and must never be read as such. */}
          {s.terrainStyle === 'ecosystem' && <Notice tone="warn">{t('layers.styleEcosystemNote')}</Notice>}
          {/* Procedural ground only bites on this style, and the switch for it
              lives in another tab — so say so here rather than let it look broken. */}
          {s.terrainStyle === 'ecosystem' && s.contextDetail === 'simple' && (
            <Hint>{t('layers.styleEcosystemDetailHint')}</Hint>
          )}

          <LookSlider
            label={t('layers.exaggeration')}
            value={s.terrainExaggeration}
            min={1} max={3} step={0.25}
            format={(v) => `×${v}`}
            onChange={ctl.setExaggeration}
          />

          <Expander open={reliefOpen} onToggle={() => setReliefOpen((v) => !v)} label={t('layers.advancedRelief')}>
            <LookSlider label={t('layers.sunAzimuth')} value={s.terrainLook.sunAzimuth} min={0} max={359} step={5} format={(v) => `${v}°`} onChange={(v) => ctl.setTerrainLook({ sunAzimuth: v })} />
            <LookSlider label={t('layers.sunAltitude')} value={s.terrainLook.sunAltitude} min={5} max={90} step={5} format={(v) => `${v}°`} onChange={(v) => ctl.setTerrainLook({ sunAltitude: v })} />
            <LookSlider label={t('layers.softness')} value={s.terrainLook.softness} min={0} max={1} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => ctl.setTerrainLook({ softness: v })} />
            <LookSlider label={t('layers.occlusion')} value={s.terrainLook.occlusion} min={0} max={1} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => ctl.setTerrainLook({ occlusion: v })} />
            <LookSlider label={t('layers.detail')} value={s.terrainLook.detail} min={0} max={1} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => ctl.setTerrainLook({ detail: v })} />
            {/* Non-negotiable: invented geometry must say so. */}
            {s.terrainLook.detail > 0 && <Notice tone="warn">{t('layers.detailWarning')}</Notice>}

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-faint)] w-[54px] shrink-0">{t('layers.contours')}</span>
              <select
                value={s.terrainLook.contourInterval}
                onChange={(e) => ctl.setTerrainLook({ contourInterval: parseFloat(e.target.value) })}
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-[6px] px-1.5 h-[24px] text-[10.5px] outline-none focus:border-[var(--accent)]"
                aria-label={t('layers.contours')}
              >
                {CONTOUR_INTERVALS.map((m) => (
                  <option key={m} value={m}>{m === 0 ? t('layers.contoursOff') : `${m} m`}</option>
                ))}
              </select>
            </div>

            <button
              onClick={ctl.resetTerrainLook}
              className="self-start text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] underline underline-offset-2"
            >
              {t('layers.resetRelief')}
            </button>
          </Expander>

          {s.terrainStatus === 'ready' && (
            <p className="text-[9.5px] text-[var(--text-faint)] leading-snug pt-1">{t('attribution.vertical')}</p>
          )}
        </>
      )}
    </Group>
  )
}
