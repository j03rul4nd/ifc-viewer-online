// ─── Surroundings (Advanced) ──────────────────────────────────────────────────
// The OpenStreetMap context around the model, in the order a user reaches for
// it: on/off, how it looks, which layers, the invented scenery, and how it
// yields to the model.
//
// Layer switches are grouped (Built / Mobility / Nature / Street furniture)
// with a show-all per group: thirteen switches in one column is a list nobody
// reads past the fifth. Each row carries its count, so an empty layer reads as
// "none mapped here" and not as a dead toggle — and its build status, so a
// layer the budget left out says so where the user is looking for it.

import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useGeoStore } from '../../../stores/geoStore'
import { PROP_ASSETS_KB } from '../../../lib/geo/props-assets'
import type { FeatureKind } from '../../../lib/geo/osm-features'
import type { SceneLayerStat } from '../../../lib/geo/scene-budget'
import { useGeoCtl } from '../useGeoController'
import { DETAIL_ONLY_KINDS, LAYER_GROUPS } from '../labels'
import { Caption, Choices, Group, Hint, MoreInfo, Notice, SwitchRow } from '../ui'

/** Shanghai's extra park kit is only fetched inside this box. */
function inShanghai(lat: number, lon: number): boolean {
  return lat >= 30.65 && lat <= 31.9 && lon >= 120.85 && lon <= 122.05
}

export function ContextSection() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const s = useGeoStore(useShallow((st) => ({
    mapMode: st.mapMode,
    buildingsEnabled: st.buildingsEnabled,
    buildingsStatus: st.buildingsStatus,
    buildingsCounts: st.buildingsCounts,
    buildingsEstimated: st.buildingsEstimated,
    buildingsTruncated: st.buildingsTruncated,
    buildingsOverture: st.buildingsOverture,
    featureLayers: st.featureLayers,
    contextDetail: st.contextDetail,
    contextTone: st.contextTone,
    vehicles: st.vehicles,
    suppressContext: st.suppressContext,
    hiddenFeatures: st.hiddenFeatures,
    hideMode: st.hideMode,
    placement: st.placement,
    report: st.sceneReport,
    setHideMode: st.setHideMode,
    showFeature: st.showFeature,
    showAllFeatures: st.showAllFeatures,
  })))
  const mapOn = s.mapMode === 'on'
  const ready = s.buildingsEnabled && s.buildingsStatus === 'ready'
  const statByKey = new Map<string, SceneLayerStat>((s.report?.layers ?? []).map((l) => [l.key, l]))

  const buildingsNote =
    s.buildingsStatus === 'loading' ? t('layers.buildingsLoading')
    : s.buildingsStatus === 'error' ? t('layers.buildingsFailed')
    : s.buildingsStatus === 'empty' ? t('layers.buildingsEmpty')
    : ready
      // Once footprints from the Overture extract are in the count, crediting
      // all of them to OpenStreetMap is a small untruth in the one line that
      // says where the buildings came from.
      ? (s.buildingsOverture > 0
        ? t('layers.buildingsCountMixed', { count: s.buildingsCounts.building, overture: s.buildingsOverture })
        : t('layers.buildingsCount', { count: s.buildingsCounts.building }))
        + (s.buildingsEstimated > 0 ? ` · ${t('layers.buildingsEstimated', { count: s.buildingsEstimated })}` : '')
      : undefined

  return (
    <Group>
      {!mapOn && <Notice tone="muted">{t('panel.mapOff')}</Notice>}

      <SwitchRow
        label={t('layers.buildings')}
        checked={s.buildingsEnabled}
        onChange={(v) => { void ctl.toggleBuildings(v) }}
        busy={s.buildingsStatus === 'loading'}
        note={buildingsNote}
        tone={s.buildingsStatus === 'error' ? 'danger' : 'muted'}
      />
      {s.buildingsTruncated && <Notice tone="warn">{t('layers.buildingsTruncated')}</Notice>}

      {/* ── Appearance: how much is modelled, and how loud it is ──────────── */}
      <Caption>{t('context.appearance')}</Caption>
      <Choices
        label={t('layers.detailLevel')}
        options={([
          ['simple', t('layers.detailSimple')],
          ['detailed', t('layers.detailRich')],
          ['showcase', t('layers.facadeShowcase')],
        ] as const).map(([id, label]) => ({ id, label, active: s.contextDetail === id }))}
        onSelect={(level) => ctl.setContextDetail(level)}
      />
      <Hint>{t(`quick.qualityHint.${s.contextDetail}`, { kb: PROP_ASSETS_KB })}</Hint>
      <MoreInfo label={t('context.whatIsIt')}>
        {s.contextDetail === 'showcase'
          ? t('layers.facadeShowcaseHint', { kb: PROP_ASSETS_KB })
          : t('layers.detailHint')}
      </MoreInfo>
      {s.contextDetail === 'showcase' && s.placement && inShanghai(s.placement.lat, s.placement.lon) && (
        <Hint>{t('layers.shanghaiParkHint')}</Hint>
      )}

      {/* Orthogonal to the level above: how much the context is allowed to
          compete with the model, not how much of it is modelled. */}
      <Choices
        label={t('layers.contextTone')}
        options={([
          ['natural', t('layers.contextToneNatural')],
          ['neutral', t('layers.contextToneNeutral')],
        ] as const).map(([id, label]) => ({ id, label, active: s.contextTone === id }))}
        onSelect={ctl.setContextTone}
      />
      {s.contextTone === 'neutral' && <Hint>{t('layers.contextToneHint')}</Hint>}

      {/* ── Layers, grouped ───────────────────────────────────────────────── */}
      {ready && (
        <>
          <Caption>{t('context.layers')}</Caption>
          {LAYER_GROUPS.map((group) => (
            <LayerGroup
              key={group.id}
              title={t(`context.groups.${group.id}`)}
              kinds={group.kinds}
              counts={s.buildingsCounts}
              visible={s.featureLayers}
              detailOnlyBlocked={s.contextDetail === 'simple'}
              stats={statByKey}
              onToggle={ctl.setFeatureLayer}
              onToggleAll={ctl.setFeatureLayers}
            />
          ))}
        </>
      )}

      {/* ── Scenery: kept apart from the mapped layers — the distinction is
          the point, not a detail. ─────────────────────────────────────────── */}
      <Caption>{t('context.scenery')}</Caption>
      <SwitchRow
        label={t('layers.vehicles')}
        checked={s.vehicles}
        onChange={ctl.setVehicles}
        disabled={!mapOn}
        trailing={statByKey.get('scenery')?.status === 'failed' || statByKey.get('scenery')?.status === 'skipped'
          ? <LayerStatusBadge status={statByKey.get('scenery')!.status} />
          : undefined}
      />
      <MoreInfo label={t('context.whatIsIt')}>{t('layers.vehiclesHint')}</MoreInfo>

      {/* ── Where the model and the map describe the same ground ───────────── */}
      <Caption>{t('context.yield')}</Caption>
      <SwitchRow
        label={t('layers.suppress')}
        checked={s.suppressContext}
        onChange={ctl.setSuppressContext}
        disabled={!mapOn}
      />
      <MoreInfo label={t('context.whatIsIt')}>{t('layers.suppressHint')}</MoreInfo>

      {/* The MANUAL half of the same decision. The rule above reasons from
          geometry and is right most of the time; this is where the user
          overrules it, which is the only honest way to ship a rule that
          cannot be right always. */}
      <SwitchRow
        label={t('layers.hidePick')}
        checked={s.hideMode}
        onChange={s.setHideMode}
        // Gated on the surroundings being ON, not on the query having
        // reported 'ready': the status is a report about the last fetch and
        // it is not always delivered. A dead control over a full
        // neighbourhood is the failure that matters.
        disabled={!mapOn || !s.buildingsEnabled}
      />
      <Hint active={s.hideMode}>{s.hideMode ? t('layers.hidePickActive') : t('layers.hidePickHint')}</Hint>

      {s.hiddenFeatures.length > 0 && (
        <div className="flex flex-col gap-1">
          <Caption>{t('layers.hidden')}</Caption>
          {s.hiddenFeatures.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded-[7px] border border-[var(--border)] bg-[var(--surface-2)]"
            >
              <div className="min-w-0 flex-1 flex flex-col">
                {/* Whatever OSM actually said, in order of usefulness. The id is
                    shown either way: two unnamed blocks on one street are
                    indistinguishable without it. */}
                <span className="truncate text-[10.5px] text-[var(--text-dim)]">
                  {h.name ?? h.label ?? t(`layers.osm.${h.kind}`)}
                </span>
                <span className="truncate font-mono text-[9px] text-[var(--text-faint)]">{h.id}</span>
              </div>
              <button
                onClick={() => s.showFeature(h.id)}
                title={t('layers.hiddenRestore')}
                className="shrink-0 px-1.5 py-0.5 rounded-[6px] text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
              >
                {t('layers.hiddenRestore')}
              </button>
            </div>
          ))}
          <button
            onClick={s.showAllFeatures}
            className="self-start px-1 py-0.5 -mx-1 rounded-[6px] text-[10px] text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"
          >
            {t('layers.hiddenRestoreAll')}
          </button>
        </div>
      )}
    </Group>
  )
}

function LayerGroup({ title, kinds, counts, visible, detailOnlyBlocked, stats, onToggle, onToggleAll }: {
  title: string
  kinds: readonly FeatureKind[]
  counts: Record<FeatureKind, number>
  visible: Record<FeatureKind, boolean>
  detailOnlyBlocked: boolean
  stats: Map<string, SceneLayerStat>
  onToggle: (kind: FeatureKind, v: boolean) => void
  onToggleAll: (kinds: ReadonlyArray<FeatureKind>, v: boolean) => void
}) {
  const { t } = useTranslation('geo')
  const usable = kinds.filter((k) => counts[k] > 0)
  const allOn = usable.length > 0 && usable.every((k) => visible[k])
  const total = kinds.reduce((n, k) => n + counts[k], 0)

  return (
    <div className="flex flex-col rounded-[9px] border border-[var(--border)] px-2 py-1">
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-[10.5px] font-medium text-[var(--text-dim)]">{title}</span>
        <span className="font-mono tabular-nums text-[9.5px] text-[var(--text-faint)]">{total}</span>
        {usable.length > 1 && (
          <button
            onClick={() => onToggleAll(usable, !allOn)}
            className="ml-auto px-1.5 py-0.5 -mr-1 rounded-[5px] text-[9.5px] text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"
          >
            {allOn ? t('context.hideAll') : t('context.showAll')}
          </button>
        )}
      </div>
      {kinds.map((kind) => {
        const blocked = detailOnlyBlocked && DETAIL_ONLY_KINDS.has(kind)
        const stat = stats.get(kind)
        return (
          <SwitchRow
            key={kind}
            compact
            label={t(`layers.osm.${kind}`)}
            note={blocked ? t('context.detailOnly') : undefined}
            trailing={
              <span className="flex items-center gap-1.5">
                {stat && (stat.status === 'failed' || stat.status === 'skipped') && visible[kind] && !blocked && (
                  <LayerStatusBadge status={stat.status} />
                )}
                <span className="font-mono tabular-nums text-[9.5px] text-[var(--text-faint)]">{counts[kind]}</span>
              </span>
            }
            checked={visible[kind]}
            disabled={counts[kind] === 0 || blocked}
            onChange={(v) => onToggle(kind, v)}
          />
        )
      })}
    </div>
  )
}

function LayerStatusBadge({ status }: { status: SceneLayerStat['status'] }) {
  const { t } = useTranslation('geo')
  const color = status === 'failed' ? 'var(--danger)' : 'var(--warn)'
  return (
    <span className="text-[9px] font-medium uppercase tracking-[0.06em]" style={{ color }}>
      {t(`perf.status.${status}`)}
    </span>
  )
}
