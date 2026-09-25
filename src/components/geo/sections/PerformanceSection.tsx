// ─── Performance (Advanced) ───────────────────────────────────────────────────
// What the scene costs and what protects it: the live frame rate, the triangle
// budget and how much of it is spent, per-layer build results, and the two
// guards (adaptive quality, the budget itself) with their switches.
//
// The numbers are here so a heavy view is a trade the user can SEE, not a
// mystery — "it got slow when I turned trees on" is a sentence this tab lets
// anyone check in one glance.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useGeoStore } from '../../../stores/geoStore'
import { formatTriangles } from '../../../lib/geo/scene-budget'
import { useGeoCtl } from '../useGeoController'
import { layerLabel } from '../labels'
import { IconRefresh } from '../icons'
import { Button, Caption, Group, Hint, Notice, ProgressBar, StatRow, SwitchRow } from '../ui'

/** How often the GPU tile estimate is re-read while this tab is open. */
const TILE_POLL_MS = 2000

export function PerformanceSection() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const s = useGeoStore(useShallow((st) => ({
    mapMode: st.mapMode,
    report: st.sceneReport,
    perf: st.perf,
    adaptiveQuality: st.adaptiveQuality,
    budgetLifted: st.budgetLifted,
    buildingsEnabled: st.buildingsEnabled,
    setAdaptiveQuality: st.setAdaptiveQuality,
  })))
  const mapOn = s.mapMode === 'on'
  const tileBytes = useTileBytes(mapOn)

  if (!mapOn) return <Group><Notice tone="muted">{t('perf.mapOff')}</Notice></Group>

  const report = s.report
  const budget = report?.budget ?? Number.POSITIVE_INFINITY
  const finite = Number.isFinite(budget)
  const used = report?.triangles ?? 0
  const ratio = finite && budget > 0 ? used / budget : 0
  const fps = s.perf?.fps

  return (
    <Group>
      <div className="flex flex-col gap-1">
        <StatRow
          label={t('perf.fps')}
          value={fps === undefined ? t('perf.measuring') : t('perf.fpsValue', { fps })}
          tone={fps === undefined ? 'normal' : fps < 20 ? 'danger' : fps < 30 ? 'warn' : 'normal'}
        />
        <StatRow
          label={t('perf.triangles')}
          value={`${formatTriangles(used)} ${finite ? t('perf.budgetOf', { budget: formatTriangles(budget) }) : `· ${t('perf.unlimited')}`}`}
          tone={ratio > 0.9 ? 'warn' : 'normal'}
        />
        {finite && <ProgressBar value={Math.min(1, ratio)} />}
        {report && report.buildMs > 0 && (
          <StatRow label={t('perf.lastBuild')} value={`${Math.round(report.buildMs)} ms`} tone={report.buildMs > 1500 ? 'warn' : 'normal'} />
        )}
        {tileBytes !== null && (
          <StatRow label={t('perf.tiles')} value={`${(tileBytes / (1024 * 1024)).toFixed(1)} MB`} />
        )}
        {report && <StatRow label={t('perf.device')} value={t(`perf.tier.${report.tier}`)} />}
      </div>

      {s.buildingsEnabled && report && report.layers.length > 0 ? (
        <>
          <Caption>{t('perf.layers')}</Caption>
          <div className="flex flex-col rounded-[9px] border border-[var(--border)] overflow-hidden">
            {report.layers.map((l, i) => (
              <div
                key={l.key}
                className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-2 px-2 py-1 text-[10px] ${i % 2 ? 'bg-[var(--surface-2)]' : ''}`}
              >
                <span className="truncate text-[var(--text-dim)]">{layerLabel(t, l.key)}</span>
                <span className="font-mono tabular-nums text-[var(--text-faint)] text-right">
                  {l.status === 'failed' ? '—' : formatTriangles(l.triangles)}
                </span>
                <span
                  className="font-mono tabular-nums text-right w-[52px]"
                  style={{ color: l.status === 'failed' ? 'var(--danger)' : l.status === 'skipped' ? 'var(--warn)' : 'var(--text-faint)' }}
                >
                  {l.status === 'ok' ? `${Math.round(l.ms)} ms` : t(`perf.status.${l.status}`)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Hint>{t('perf.empty')}</Hint>
      )}

      <SwitchRow label={t('perf.adaptive')} checked={s.adaptiveQuality} onChange={s.setAdaptiveQuality} />
      <Hint>{t('perf.adaptiveHint')}</Hint>

      <SwitchRow label={t('perf.lift')} checked={s.budgetLifted} onChange={ctl.setBudgetLifted} />
      <Hint active={s.budgetLifted}>{t('perf.liftHint')}</Hint>

      <Button variant="secondary" onClick={ctl.rebuildScene} disabled={!s.buildingsEnabled || report?.phase === 'building'}>
        <IconRefresh size={12} /> {t('perf.rebuild')}
      </Button>
    </Group>
  )
}

/** The basemap's GPU estimate, polled while the tab is on screen. */
function useTileBytes(active: boolean): number | null {
  const ctl = useGeoCtl()
  const [bytes, setBytes] = useState<number | null>(null)
  const { getGeo } = ctl
  useEffect(() => {
    if (!active) { setBytes(null); return }
    let cancelled = false
    const read = (): void => {
      void getGeo()?.then((geo) => {
        if (!cancelled) setBytes(geo.getGpuBytesEstimate())
      }).catch(() => { /* a missing estimate is not worth a message */ })
    }
    read()
    const id = setInterval(read, TILE_POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [active, getGeo])
  return bytes
}
