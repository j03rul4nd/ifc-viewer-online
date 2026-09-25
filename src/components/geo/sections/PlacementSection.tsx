// ─── Placement (Advanced) ─────────────────────────────────────────────────────
// Where the model is and why: the effective placement, the other models of a
// federated set, writing the location back into the IFC, and the provenance of
// the georeference — which rung of the ladder it came from and what was wrong
// with the ones above it.

import React, { Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useGeoStore } from '../../../stores/geoStore'
import { useSceneStore } from '../../../stores/sceneStore'
import { useGeoCtl } from '../useGeoController'
import { useModelSites } from '../useModelSites'
import { Button, Caption, Expander, Group, Hint, Notice, StatusDot } from '../ui'

const PlacementMiniMap = React.lazy(() => import('../../PlacementMiniMap'))

export function PlacementSection() {
  const { t } = useTranslation('geo')
  // Reason codes from the extraction ladder arrive as plain strings — valid
  // geo-namespace keys by construction, but not provable to the typed t().
  const tDynamic = (key: string): string => t(key, { defaultValue: key })
  const ctl = useGeoCtl()
  const activeModelId = useSceneStore((s) => s.activeModelId)
  const s = useGeoStore(useShallow((st) => ({
    mapMode: st.mapMode,
    placement: st.placement,
    consentGiven: st.consentGiven,
    editing: st.editing,
    extraction: activeModelId ? st.georefByModel[activeModelId] : undefined,
  })))
  const { modelSites, otherPins } = useModelSites(ctl.viewerApiRef)
  const [debugOpen, setDebugOpen] = useState(false)
  const mapOn = s.mapMode === 'on'
  const extraction = s.extraction

  return (
    <Group>
      {mapOn && s.placement && (
        <>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
            <span>{s.placement.source === 'ifc' ? t('placement.sourceIfc') : t('placement.sourceManual')}</span>
            <span>·</span>
            <span>{s.placement.confidence === 'high' ? t('status.confidenceHigh') : t('status.confidenceApproximate')}</span>
          </div>

          {s.consentGiven && (
            <Suspense fallback={<div className="h-[150px] rounded-[8px] bg-[var(--surface-2)] animate-pulse" />}>
              <PlacementMiniMap
                lat={s.placement.lat}
                lon={s.placement.lon}
                otherPins={otherPins}
                fitAll={modelSites.farApart}
              />
            </Suspense>
          )}

          {modelSites.located.length > 1 && <Hint>{t('placement.anchorHint')}</Hint>}
          {modelSites.farApart && (
            <Notice tone="warn">
              {t('placement.modelsFarApart', {
                count: modelSites.located.length,
                km: Math.round(modelSites.spreadM / 1000),
              })}
            </Notice>
          )}
          {modelSites.sites.length > 1 && (
            <ul className="flex flex-col gap-0.5">
              {modelSites.sites.map((site) => (
                <li key={site.modelId} className="flex items-center gap-1.5 text-[10px] min-w-0">
                  <span
                    className="w-[6px] h-[6px] rounded-full shrink-0"
                    style={{ background: site.lat === null ? 'var(--text-faint)' : site.anchor ? 'var(--accent)' : 'var(--text-dim)' }}
                  />
                  <span className="truncate text-[var(--text-dim)]" title={site.label}>{site.label}</span>
                  {site.anchor && <span className="shrink-0 text-[9px] text-[var(--accent-2)]">{t('placement.anchorModel')}</span>}
                  {site.lat === null && <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{t('placement.noGeoref')}</span>}
                </li>
              ))}
            </ul>
          )}

          <Button variant="secondary" onClick={ctl.beginEditPlacement} disabled={s.editing}>
            {t('placement.edit')}
          </Button>
          {extraction?.siteExpressId ? (
            <>
              <Button variant="accent-outline" onClick={ctl.saveGeorefToIfc}>{t('placement.saveToIfc')}</Button>
              <span className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('placement.saveToIfcHint')}</span>
            </>
          ) : (
            <span className="text-[9.5px] text-[var(--text-faint)] leading-snug">{t('placement.saveToIfcNoSite')}</span>
          )}
        </>
      )}

      {/* Georeferencing provenance — why the model landed here. */}
      {extraction && (
        <>
          <Caption>{t('status.title')}</Caption>
          <div className="flex items-center gap-1.5 text-[11px] font-medium min-w-0">
            <StatusDot status={extraction.status} />
            <span className="truncate">{t(`status.${extraction.status}`)}</span>
          </div>
          {extraction.rung !== null && <Hint>{t(`status.rung${extraction.rung}`)}</Hint>}
          {extraction.epsgCode && (
            <p className="text-[10.5px] font-mono text-[var(--text-dim)] break-words">
              {t('status.crs')}: {extraction.epsgCode}
            </p>
          )}
          {extraction.largeWcsOffset && <Notice tone="warn">{t('status.largeOffset')}</Notice>}
          {extraction.reasons.length > 0 && (
            <ul className="flex flex-col gap-1">
              {extraction.reasons.map((r) => (
                <li key={r} className="text-[10px] text-[var(--text-faint)] leading-snug break-words">• {tDynamic(`reasons.${r}`)}</li>
              ))}
            </ul>
          )}
          {!mapOn && (extraction.status === 'none' || extraction.status === 'invalid') && (
            <button
              onClick={() => ctl.setFlow({ kind: 'manual' })}
              className="self-start text-[11px] text-[var(--accent-2)] hover:underline underline-offset-2"
            >
              {t('placement.manualShow')}
            </button>
          )}
          <Expander open={debugOpen} onToggle={() => setDebugOpen((v) => !v)} label={t('status.debug')}>
            <pre className="text-[9px] font-mono text-[var(--text-faint)] whitespace-pre-wrap break-all leading-snug max-h-[120px] overflow-y-auto">
              {Object.entries(extraction.raw).map(([k, v]) => `${k}: ${String(v)}`).join('\n') || '—'}
            </pre>
          </Expander>
        </>
      )}
      {!extraction && !mapOn && <Hint>{t('status.unknown')}</Hint>}
    </Group>
  )
}
