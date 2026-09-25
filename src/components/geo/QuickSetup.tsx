// ─── QuickSetup (the Basic face of the map panel) ─────────────────────────────
// Four ready-made views, the basemap, two switches and a quality choice. That
// is everything that changes the PICTURE a lot; the rest of the map's twenty
// controls live in Advanced, and are the same controls underneath — a preset
// only writes the preferences the advanced switches read.

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useGeoStore } from '../../stores/geoStore'
import { PROP_ASSETS_KB } from '../../lib/geo/props-assets'
import { SCENE_PRESETS, matchPreset, type ScenePreset, type ScenePresetId } from '../../lib/geo/scene-presets'
import { SATELLITE_PROVIDERS, useGeoCtl } from './useGeoController'
import { IconBuildings, IconPlan, IconSparkle, IconTerrain } from './icons'
import { Caption, Choices, CostDots, Group, Hint, SwitchRow } from './ui'

const PRESET_ICON: Record<ScenePresetId, (p: { size?: number }) => ReactElement> = {
  plan: IconPlan,
  relief: IconTerrain,
  city: IconBuildings,
  showcase: IconSparkle,
}

export function QuickSetup() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const s = useGeoStore(useShallow((st) => ({
    mapMode: st.mapMode,
    baseLayerId: st.baseLayerId,
    terrainEnabled: st.terrainEnabled,
    terrainStatus: st.terrainStatus,
    buildingsEnabled: st.buildingsEnabled,
    buildingsStatus: st.buildingsStatus,
    buildingCount: st.buildingsCounts.building,
    contextDetail: st.contextDetail,
    vehicles: st.vehicles,
    setPanelMode: st.setPanelMode,
  })))
  const mapOn = s.mapMode === 'on'
  const active = matchPreset(s)
  const satellite = (SATELLITE_PROVIDERS as readonly string[]).includes(s.baseLayerId)

  return (
    <Group>
      <Caption trailing={active === null
        ? <span className="text-[9.5px] text-[var(--accent-2)]">{t('quick.custom')}</span>
        : undefined}
      >
        {t('quick.view')}
      </Caption>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('quick.view')}>
        {SCENE_PRESETS.map((p) => (
          <PresetCard key={p.id} preset={p} active={active === p.id} onSelect={() => ctl.applyPreset(p.id)} />
        ))}
      </div>
      {active === 'showcase' && <Hint>{t('quick.showcaseNote')}</Hint>}
      {!mapOn && <Hint>{t('quick.offHint')}</Hint>}

      <Caption>{t('quick.basemap')}</Caption>
      <Choices
        label={t('quick.basemap')}
        minWidth={80}
        options={[
          { id: 'osm', label: t('layers.streets'), active: s.baseLayerId === 'osm' },
          { id: 'opentopomap', label: t('layers.topo'), active: s.baseLayerId === 'opentopomap' },
          { id: 'satellite', label: t('layers.satellite'), active: satellite },
        ]}
        onSelect={ctl.selectBasemap}
      />

      <Caption>{t('quick.show')}</Caption>
      <div className="flex flex-col">
        <SwitchRow
          icon={<IconTerrain size={13} />}
          label={t('quick.terrain')}
          checked={s.terrainEnabled}
          onChange={ctl.toggleTerrain}
          busy={s.terrainStatus === 'loading'}
          note={s.terrainStatus === 'error' ? t('errors.terrainFailed') : undefined}
          tone={s.terrainStatus === 'error' ? 'danger' : 'muted'}
        />
        <SwitchRow
          icon={<IconBuildings size={13} />}
          label={t('quick.context')}
          checked={s.buildingsEnabled}
          onChange={(v) => { void ctl.toggleBuildings(v) }}
          busy={s.buildingsStatus === 'loading'}
          note={
            s.buildingsStatus === 'error' ? t('layers.buildingsFailed')
            : s.buildingsStatus === 'empty' ? t('layers.buildingsEmpty')
            : s.buildingsEnabled && s.buildingsStatus === 'ready'
              ? t('layers.buildingsCount', { count: s.buildingCount })
              : undefined
          }
          tone={s.buildingsStatus === 'error' ? 'danger' : 'muted'}
        />
      </div>

      <Caption>{t('quick.quality')}</Caption>
      <Choices
        label={t('quick.quality')}
        minWidth={80}
        options={([
          ['simple', t('layers.detailSimple')],
          ['detailed', t('layers.detailRich')],
          ['showcase', t('layers.facadeShowcase')],
        ] as const).map(([id, label]) => ({ id, label, active: s.contextDetail === id }))}
        onSelect={(level) => ctl.setContextDetail(level)}
      />
      <Hint>{t(`quick.qualityHint.${s.contextDetail}`, { kb: PROP_ASSETS_KB })}</Hint>

      <button
        onClick={() => s.setPanelMode('advanced')}
        className="self-start mt-0.5 -mx-1 px-1 py-0.5 rounded-[6px] text-[10.5px] text-[var(--accent-2)] hover:bg-[var(--surface-2)] transition-colors"
      >
        {t('panel.moreControls')} →
      </button>
    </Group>
  )
}

function PresetCard({ preset, active, onSelect }: { preset: ScenePreset; active: boolean; onSelect: () => void }) {
  const { t } = useTranslation('geo')
  const Icon = PRESET_ICON[preset.id]
  const costKey = preset.cost === 3 ? 'heavy' : preset.cost === 2 ? 'medium' : 'light'
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={[
        'text-left p-2 rounded-[9px] border flex flex-col gap-1 min-h-[70px] transition-colors active:scale-[0.99]',
        active
          ? 'border-[var(--accent)] bg-[rgba(94,106,210,0.12)]'
          : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={active ? 'text-[var(--accent-2)]' : 'text-[var(--text-faint)]'}><Icon size={13} /></span>
        <span className={`text-[11px] font-semibold truncate ${active ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
          {t(`quick.presets.${preset.id}.name`)}
        </span>
        <span className="ml-auto shrink-0"><CostDots level={preset.cost} label={t(`quick.cost.${costKey}`)} /></span>
      </span>
      <span className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t(`quick.presets.${preset.id}.desc`)}</span>
    </button>
  )
}
