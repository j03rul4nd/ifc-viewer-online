// ─── Map panel chrome ─────────────────────────────────────────────────────────
// The part of the panel that never scrolls: title and mode switch, the one
// primary action, and the scene status strip. Pinned because each answers a
// question you should never have to scroll for — "which view is this?", "is
// the map on and where?", "is the scene still building, or in trouble?".

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useGeoStore } from '../../stores/geoStore'
import { useSceneStore } from '../../stores/sceneStore'
import { normalizeDeg } from '../../lib/geo/geo-math'
import { formatTriangles, lowerDetail } from '../../lib/geo/scene-budget'
import { useGeoCtl } from './useGeoController'
import { layerList } from './labels'
import { IconClose, IconMap, IconPin } from './icons'
import { Button, Hint, ModeChip, Notice, ProgressBar, SECTION_X, Segmented, Spinner, StatusDot } from './ui'

export function PanelHeader({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('geo')
  const mapMode = useGeoStore((s) => s.mapMode)
  const panelMode = useGeoStore((s) => s.panelMode)
  const setPanelMode = useGeoStore((s) => s.setPanelMode)
  const modeKey = mapMode === 'on' ? 'on' : mapMode === 'starting' ? 'starting' : mapMode === 'error' ? 'error' : 'off'

  return (
    <div className={`${SECTION_X} pt-2.5 pb-2 flex items-center gap-2 shrink-0`}>
      <span className="text-[var(--text-dim)]"><IconMap size={13} /></span>
      <span className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">
        {t('panel.title')}
      </span>
      <ModeChip mode={mapMode} label={t(`panel.mode.${modeKey}`)} />
      <div className="ml-auto flex items-center gap-1.5">
        <Segmented
          size="xs"
          label={t('panel.modeLabel')}
          value={panelMode}
          onChange={setPanelMode}
          options={[
            { id: 'basic', label: t('panel.modeBasic') },
            { id: 'advanced', label: t('panel.modeAdvanced') },
          ]}
        />
        <button
          onClick={onClose}
          className="-mr-1 p-1 rounded-[6px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          title={t('panel.close')}
          aria-label={t('panel.close')}
        >
          <IconClose size={11} />
        </button>
      </div>
    </div>
  )
}

/**
 * The primary action, and what it did.
 *
 * Off: what the map is for, one button, and — once the file has been read —
 * whether the model will land by itself or need placing, BEFORE the user
 * commits. On: where the model is, how sure we are, and the two things you do
 * next (adjust, or hide).
 */
export function MapHero() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const activeModelId = useSceneStore((s) => s.activeModelId)
  const { mapMode, mapErrorKey, placement, degraded, editing, extraction } = useGeoStore(useShallow((s) => ({
    mapMode: s.mapMode,
    mapErrorKey: s.mapErrorKey,
    placement: s.placement,
    degraded: s.degraded,
    editing: s.editing,
    extraction: activeModelId ? s.georefByModel[activeModelId] : undefined,
  })))
  const starting = mapMode === 'starting'

  if (mapMode === 'on' && placement) {
    return (
      <div className={`${SECTION_X} pb-2.5 flex flex-col gap-1.5 shrink-0`}>
        <div className="flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)]">
          <span className="text-[var(--accent-2)] shrink-0"><IconPin size={14} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono tabular-nums text-[var(--text-dim)] truncate">
              {placement.lat.toFixed(5)}, {placement.lon.toFixed(5)} · {normalizeDeg(placement.rotationDeg).toFixed(0)}°
            </div>
            <div className="text-[9.5px] text-[var(--text-faint)] truncate">
              {placement.source === 'ifc' ? t('placement.sourceIfc') : t('placement.sourceManual')}
              {' · '}
              {placement.confidence === 'high' ? t('status.confidenceHigh') : t('status.confidenceApproximate')}
            </div>
          </div>
          {!editing && (
            <Button variant="ghost" className="!h-[24px] !px-2 !text-[10.5px]" onClick={ctl.beginEditPlacement}>
              {t('panel.adjust')}
            </Button>
          )}
        </div>
        <Button variant="secondary" onClick={() => { void ctl.disable() }}>{t('enable.hide')}</Button>
        {degraded && (
          <Notice tone="danger" action={{ label: t('degraded.switch'), onClick: ctl.switchProviderAfterFailure }}>
            {t('degraded.banner')}
          </Notice>
        )}
      </div>
    )
  }

  // Resolved but not started: say where the model will land before asking.
  const georefKey = extraction && (extraction.status === 'found' || extraction.status === 'partial'
    || extraction.status === 'none' || extraction.status === 'invalid') ? extraction.status : null

  return (
    <div className={`${SECTION_X} pb-2.5 flex flex-col gap-2 shrink-0`}>
      {mapMode === 'off' && (
        <div className="flex flex-col gap-0.5">
          <div className="text-[12px] font-semibold text-[var(--text)] leading-snug">{t('panel.introTitle')}</div>
          <p className="text-[10.5px] text-[var(--text-faint)] leading-snug">{t('panel.introBody')}</p>
        </div>
      )}
      <Button
        variant="primary"
        size="lg"
        onClick={() => { void ctl.showOnMap() }}
        disabled={!activeModelId || starting}
      >
        {starting && <Spinner size={11} />}
        {starting ? t('enable.starting') : mapMode === 'error' ? t('enable.retry') : t('enable.show')}
      </Button>
      {starting && (
        <button
          onClick={() => { void ctl.disable() }}
          className="self-center text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text-dim)] underline underline-offset-2"
        >
          {t('panel.cancel')}
        </button>
      )}
      {!activeModelId && <Hint>{t('enable.noModel')}</Hint>}
      {georefKey && extraction && mapMode === 'off' && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)] leading-snug">
          <StatusDot status={extraction.status} />
          <span>{t(`georef.${georefKey}`)}</span>
        </div>
      )}
      {mapMode === 'error' && (
        <Notice tone="danger">{t(mapErrorKey ?? 'errors.enableFailed', { defaultValue: mapErrorKey ?? '' })}</Notice>
      )}
    </div>
  )
}

/**
 * The scene's health, in one strip: building, failed, left out, slow.
 *
 * Every line here carries its own remedy. A warning without a button is a
 * complaint; with one, it is a decision the user can make in place.
 */
export function SceneStatus() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const s = useGeoStore(useShallow((st) => ({
    mapMode: st.mapMode,
    buildingsEnabled: st.buildingsEnabled,
    buildingsStatus: st.buildingsStatus,
    report: st.sceneReport,
    perf: st.perf,
    autoDowngrade: st.autoDowngrade,
    contextDetail: st.contextDetail,
    budgetLifted: st.budgetLifted,
    featureLayers: st.featureLayers,
  })))
  if (s.mapMode !== 'on') return null

  const report = s.report
  const downloading = s.buildingsEnabled && s.buildingsStatus === 'loading'
  const building = report?.phase === 'building'
  const failed = s.buildingsEnabled ? report?.failed ?? [] : []
  const skipped = s.buildingsEnabled && !s.budgetLifted ? report?.skipped ?? [] : []
  const canLower = lowerDetail(s.contextDetail) !== null || s.featureLayers.tree || s.featureLayers.furniture
  const slow = s.perf?.slow && !s.autoDowngrade && s.buildingsEnabled && canLower

  const lines: ReactNode[] = []
  if (downloading) {
    lines.push(
      <div key="dl" className="flex flex-col gap-1">
        <ProgressBar value={null} />
        <Hint>{t('scene.downloading')}</Hint>
      </div>,
    )
  } else if (building) {
    lines.push(
      <div key="build" className="flex flex-col gap-1">
        <ProgressBar value={report!.progress} />
        <Hint>{t('scene.building', { pct: Math.round(report!.progress * 100) })}</Hint>
      </div>,
    )
  }
  if (failed.length > 0) {
    lines.push(
      <Notice key="failed" tone="warn" action={{ label: t('scene.retry'), onClick: ctl.rebuildScene }}>
        {t('scene.failed', { layers: layerList(t, failed) })}
      </Notice>,
    )
  }
  if (skipped.length > 0) {
    lines.push(
      <Notice key="skipped" tone="warn" action={{ label: t('scene.loadAnyway'), onClick: () => ctl.setBudgetLifted(true) }}>
        {t('scene.skipped', { layers: layerList(t, skipped) })}
      </Notice>,
    )
  }
  if (report && report.contextLosses > 0) {
    lines.push(<Notice key="lost" tone="info">{t('scene.contextLost')}</Notice>)
  }
  if (s.autoDowngrade) {
    const level = s.autoDowngrade.to === 'simple' ? t('layers.detailSimple') : t('layers.detailRich')
    lines.push(
      <Notice key="auto" tone="info" action={{ label: t('scene.restore'), onClick: ctl.restoreQuality }}>
        {t('scene.autoLowered', { level })}
      </Notice>,
    )
  }
  if (slow) {
    lines.push(
      <Notice key="slow" tone="warn" action={{ label: t('scene.lowerQuality'), onClick: ctl.lowerQuality }}>
        {t('scene.slow', { fps: s.perf!.fps })}
      </Notice>,
    )
  }
  if (lines.length === 0) return null
  return <div className={`${SECTION_X} pb-2.5 flex flex-col gap-1.5 shrink-0`} aria-live="polite">{lines}</div>
}

/** One quiet line of numbers, for the Advanced face: what the scene costs. */
export function SceneFootnote() {
  const { t } = useTranslation('geo')
  const report = useGeoStore((s) => s.sceneReport)
  const perf = useGeoStore((s) => s.perf)
  if (!report || report.phase !== 'ready' || report.triangles === 0) return null
  return (
    <div className="text-[9.5px] font-mono tabular-nums text-[var(--text-faint)] truncate">
      {t('scene.stats', { triangles: formatTriangles(report.triangles), ms: Math.round(report.buildMs) })}
      {perf ? ` · ${t('perf.fpsValue', { fps: perf.fps })}` : ''}
    </div>
  )
}
