// ─── VectorLayersPanel ────────────────────────────────────────────────────────
// "Data layers": connect GeoJSON files, GeoJSON URLs and WFS feature types, and
// style what came in — routes, zones, areas with height, points.
//
// Loaded via React.lazy. Everything spatial goes through lib/layers/vector-runner,
// which places every layer against the scene's one geographic anchor.

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TmbArrivals } from './TmbPanels'
import { FeatureHistory } from './FeatureHistory'
import { tmbStopCode } from '../lib/layers/tmb'
import { ViewportPanel } from './ViewportPanel'
import { useIsMobile } from '../hooks/useIsMobile'
import { useVectorLayerStore, type VectorLayer } from '../stores/vectorLayerStore'
import { useSceneAnchorStore } from '../stores/sceneAnchorStore'
import { useGeoStore } from '../stores/geoStore'
import { toast } from '../stores/toastStore'
import {
  attachVectorHost, addGeoJsonFile, addGeoJsonUrl, addGeoJsonText, loadWfsCapabilities, addWfsLayer,
  frameVectorLayer, removeVectorLayer, layerDistanceKm, pickVectorAt, restoreVectorLayers, addSimulatedLiveLayer, followFeature,
  exportLayersFile, importLayersFile, importLayersFromUrl, isLayersFile,
} from '../lib/layers/vector-runner'
import { flattenProperties } from '../lib/twin/flatten-props'
import { TwinSearch } from './TwinSearch'
import { LayerStyleEditor } from './LayerStyleEditor'
import { PresetSources, LiveControls, ProxySetting, JoinForm } from './LiveSources'
import type { TwinHost } from '../lib/twin/twin-sources'
import { SAMPLE_GEOJSON, SAMPLE_LAYER_NAME } from '../lib/layers/sample-layers'
import type { WfsCapabilities } from '../lib/layers/wfs'
import type { HeightMode } from '../lib/layers/geojson'
import type { ViewerAPI } from '../lib/viewer'

interface Props {
  viewerApiRef: React.RefObject<ViewerAPI | null>
  onClose: () => void
}

const RADII = [250, 500, 1000, 2000, 5000]

const inputCls =
  'w-full min-w-0 px-2 py-1.5 max-md:py-2.5 rounded-[7px] text-[11px] max-md:text-[13px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]'
const btnCls =
  'shrink-0 px-2.5 py-1.5 max-md:py-2.5 rounded-[7px] text-[11px] max-md:text-[13px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-colors disabled:opacity-40'

export default function VectorLayersPanel({ viewerApiRef, onClose }: Props) {
  const { t } = useTranslation('layers')
  const { t: tc } = useTranslation('common')
  const isMobile = useIsMobile()
  const open = useVectorLayerStore((s) => s.panelOpen)
  const layers = useVectorLayerStore((s) => s.layers)
  const anchor = useSceneAnchorStore((s) => s.anchor)
  const placement = useGeoStore((s) => s.placement)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const [wfsUrl, setWfsUrl] = useState('')
  const [caps, setCaps] = useState<WfsCapabilities | null>(null)
  const [wfsType, setWfsType] = useState('')
  const [radius, setRadius] = useState(1000)
  const [expanded, setExpanded] = useState<string | null>(null)

  // The runner lives as long as the panel's chunk; layers keep rendering when
  // the panel is closed because the component stays mounted (open just hides).
  useEffect(() => attachVectorHost({
    getSystem: () => {
      const v = viewerApiRef.current
      return v ? v.getVectorLayers() : Promise.reject(new Error('no viewer'))
    },
    getModelBounds: () => viewerApiRef.current?.getModelBounds() ?? null,
    mapGroundAt: (x, z) => viewerApiRef.current?.mapGroundAt(x, z) ?? null,
  }), [viewerApiRef])

  // Dropped .geojson files and the layers saved on this device are taken over
  // here, AFTER the runner is attached — so they anchor against the model.
  const pendingCount = useVectorLayerStore((s) => s.pendingFiles.length)
  useEffect(() => {
    if (pendingCount === 0) return
    const files = useVectorLayerStore.getState().takePendingFiles()
    void run(async () => { for (const f of files) report(await addGeoJsonFile(f)) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount])
  useEffect(() => {
    const setup = useVectorLayerStore.getState().setupUrl
    if (setup) {
      useVectorLayerStore.getState().setSetupUrl(null)
      void run(async () => reportImport(await importLayersFromUrl(setup)))
      return
    }
    if (!useVectorLayerStore.getState().restorePending) return
    useVectorLayerStore.getState().setRestorePending(false)
    void restoreVectorLayers().then(({ failed }) => {
      if (failed > 0) toast(t('restore.failed', { count: failed }), 'warning')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Click a route, zone or point to read its attributes. Never swallows the
  // click: the IFC selection behind it still happens, the two just coexist.
  useEffect(() => {
    const canvas = viewerApiRef.current?.getCanvas()
    if (!canvas) return
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent): void => { down = { x: e.clientX, y: e.clientY } }
    const onClick = (e: MouseEvent): void => {
      // An orbit drag ends in a click too; only a still click picks.
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
      void pickVectorAt(e.clientX, e.clientY)
    }
    canvas.addEventListener('pointerdown', onDown, true)
    canvas.addEventListener('click', onClick)
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true)
      canvas.removeEventListener('click', onClick)
    }
  }, [viewerApiRef])

  const twinHost = React.useMemo<TwinHost>(() => ({
    getModelBounds: (id) => viewerApiRef.current?.getModelBounds(id) ?? null,
    getCloudBounds: (id) => {
      const b = viewerApiRef.current?.peekPointClouds()?.getBounds(id)
      return b ? { min: b.min, max: b.max } : null
    },
    getElementsDetail: (ids, modelId) => {
      const v = viewerApiRef.current
      return v ? v.getElementsDetail(ids, modelId) : Promise.resolve([])
    },
    selectIfcElement: (modelId, expressId) => {
      const v = viewerApiRef.current
      if (!v) return
      v.selectElement(expressId, modelId)
      v.focusElement(expressId, modelId)
    },
  }), [viewerApiRef])

  const report = (r: { ok: true; id: string } | { ok: false; errorKey: string }, frame = true): void => {
    if (!r.ok) { toast(t(r.errorKey as never), 'error'); return }
    if (frame) setTimeout(() => void frameVectorLayer(r.id), 200)
  }

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  const onFiles = (files: FileList): void => void run(async () => {
    for (const f of Array.from(files)) {
      // A shared layer setup (exported from here) opens as layers, not as data.
      if (/\.json$/i.test(f.name) && f.size < 20_000_000) {
        const text = await f.text()
        if (isLayersFile(text)) { reportImport(await importLayersFile(text)); continue }
      }
      report(await addGeoJsonFile(f))
    }
  })

  const reportImport = (r: Awaited<ReturnType<typeof importLayersFile>>): void => {
    if (!r.ok) { toast(t(r.errorKey as never), 'error'); return }
    toast(t('share.imported', { n: r.restored }) + (r.failed ? ' ' + t('share.importFailed', { n: r.failed }) : ''), r.failed ? 'warning' : 'success')
  }

  const exportSetup = (): void => {
    const r = exportLayersFile()
    const url = URL.createObjectURL(new Blob([r.json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `data-layers-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast(t('share.exported', { n: r.layers }) + (r.secretsRemoved ? ' ' + t('share.secretsRemoved', { n: r.secretsRemoved }) : ''), 'success')
  }

  const anchorLabel = anchor
    ? t('anchor.by', { label: anchor.label, source: t(`anchor.source.${anchor.source}` as never) })
    : placement ? t('anchor.map') : t('anchor.none')

  return (
    <ViewportPanel
      id="layers"
      open={open}
      onClose={onClose}
      label={t('title')}
      mobile="sheet"
      peek
      widthPx={310}
      anchor="top"
    >
      {isMobile && (
        <div className="shrink-0 flex items-center gap-2 pl-3.5 pr-1.5 pb-1">
          <span className="flex-1 text-[14px] font-semibold text-[var(--text)] truncate">{t('title')}</span>
          <button type="button" onClick={onClose} aria-label={tc('actions.close')}
            className="w-10 h-10 rounded-[11px] bg-white/[0.05] text-[var(--text-dim)] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 max-md:pt-1 overflow-y-auto overscroll-contain" data-testid="layers-panel">
        <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('intro')}</div>

        <TwinSearch host={twinHost} />

        {/* Anchor */}
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-[7px] bg-[var(--surface-2)] text-[10px] text-[var(--text-dim)] leading-snug">
          <span aria-hidden>⌖</span><span data-testid="layers-anchor">{anchorLabel}</span>
        </div>

        {/* File */}
        <div className="flex flex-col gap-1">
          <input ref={fileRef} type="file" multiple accept=".geojson,.json,.csv,.tsv,.txt,application/geo+json,application/json,text/csv" className="hidden"
            onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
          <button disabled={busy} onClick={() => fileRef.current?.click()}
            className="w-full px-2 py-2 max-md:py-3 max-md:text-[13px] rounded-[7px] text-[11px] font-medium border border-dashed border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50">
            {busy ? t('working') : t('file.drop')}
          </button>
          <button disabled={busy} className="text-left text-[10px] text-[var(--accent)] hover:underline disabled:opacity-40"
            onClick={() => report(addGeoJsonText(SAMPLE_LAYER_NAME, JSON.stringify(SAMPLE_GEOJSON), { type: 'url', url: 'sample:passeig-de-gracia', format: 'geojson' }))}>
            {t('file.sample')}
          </button>
          <button disabled={busy} className="text-left text-[10px] text-[var(--accent)] hover:underline disabled:opacity-40"
            onClick={() => report(addSimulatedLiveLayer(t('file.sampleLiveName')))}>
            {t('file.sampleLive')}
          </button>
        </div>

        {/* Share the setup */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]" data-testid="layers-share">
          <div className="text-[11px] font-medium">{t('share.title')}</div>
          <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('share.hint')}</div>
          <div className="flex gap-1">
            <button disabled={busy || layers.length === 0} onClick={exportSetup}
              className="flex-1 px-2 py-1 max-md:py-2 rounded-[6px] text-[10px] max-md:text-[12px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] disabled:opacity-40">
              {t('share.export')}
            </button>
            <button disabled={busy} onClick={() => fileRef.current?.click()}
              className="flex-1 px-2 py-1 max-md:py-2 rounded-[6px] text-[10px] max-md:text-[12px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] disabled:opacity-40">
              {t('share.import')}
            </button>
          </div>
        </div>

        <PresetSources />

        {/* URL */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]">
          <div className="text-[11px] font-medium">{t('url.title')}</div>
          <div className="flex gap-1.5">
            <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/data.geojson" />
            <button className={btnCls} disabled={busy || !url.trim()}
              onClick={() => void run(async () => { const r = await addGeoJsonUrl(url.trim()); report(r); if (r.ok) setUrl('') })}>
              {t('url.add')}
            </button>
          </div>
        </div>

        {/* WFS */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]">
          <div className="text-[11px] font-medium">{t('wfs.title')}</div>
          <div className="flex gap-1.5">
            <input className={inputCls} value={wfsUrl} onChange={(e) => { setWfsUrl(e.target.value); setCaps(null) }} placeholder="https://…/wfs" />
            <button className={btnCls} disabled={busy || !wfsUrl.trim()}
              onClick={() => void run(async () => {
                const r = await loadWfsCapabilities(wfsUrl.trim())
                if (!r.ok) { toast(t(r.errorKey as never), 'error'); return }
                setCaps(r.caps)
                setWfsType(r.caps.featureTypes.find((f) => f.supportsJson)?.name ?? r.caps.featureTypes[0].name)
              })}>
              {t('wfs.connect')}
            </button>
          </div>
          {caps && (
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="text-[10px] text-[var(--text-faint)]">{t('wfs.found', { count: caps.featureTypes.length, title: caps.title || wfsUrl })}</div>
              <select className={inputCls} value={wfsType} onChange={(e) => setWfsType(e.target.value)}>
                {caps.featureTypes.map((f) => (
                  <option key={f.name} value={f.name}>{f.title}{f.supportsJson ? '' : ` — ${t('wfs.noJson')}`}</option>
                ))}
              </select>
              <div className="flex gap-1.5 items-center">
                <span className="text-[10px] text-[var(--text-dim)]">{t('wfs.radius')}</span>
                <select className={inputCls} value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                  {RADII.map((r) => <option key={r} value={r}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</option>)}
                </select>
                <button className={btnCls} disabled={busy || !wfsType}
                  onClick={() => void run(async () => report(await addWfsLayer(wfsUrl.trim(), caps, wfsType, radius, 5000)))}>
                  {t('wfs.load')}
                </button>
              </div>
              <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('wfs.hint')}</div>
            </div>
          )}
        </div>

        <SelectedFeature />
        <ProxySetting />

        {/* Layers */}
        {layers.length > 0 && (
          <div className={`flex flex-col gap-1.5 pt-2 border-t border-[var(--border)] ${isMobile ? 'order-first' : ''}`}>
            <div className="text-[11px] font-medium">{t('list.title', { count: layers.length })}</div>
            {layers.map((l) => (
              <LayerRow key={l.id} layer={l} expanded={expanded === l.id}
                onToggleExpand={() => setExpanded(expanded === l.id ? null : l.id)} />
            ))}
          </div>
        )}
      </div>
    </ViewportPanel>
  )
}

function LayerRow({ layer, expanded, onToggleExpand }: { layer: VectorLayer; expanded: boolean; onToggleExpand: () => void }) {
  const { t } = useTranslation('layers')
  const store = useVectorLayerStore.getState()
  const d = layer.data
  const far = layerDistanceKm(layer)

  return (
    <div className="rounded-[7px] border border-[var(--border)] px-2 py-1.5" data-testid="layers-row">
      <div className="flex items-center gap-1.5">
        <input type="color" value={layer.style.color} aria-label={t('style.color')}
          onChange={(e) => store.setStyle(layer.id, { color: e.target.value })}
          className="w-5 h-5 shrink-0 rounded cursor-pointer bg-transparent border-0 p-0" />
        <button className="flex-1 min-w-0 text-left" onClick={onToggleExpand}>
          <div className="text-[11px] truncate text-[var(--text)]">{layer.name}</div>
          {d && (
            <div className="text-[10px] text-[var(--text-faint)] truncate">
              {[
                d.counts.line && t('count.lines', { count: d.counts.line }),
                d.counts.polygon && t('count.polygons', { count: d.counts.polygon }),
                d.counts.point && t('count.points', { count: d.counts.point }),
              ].filter(Boolean).join(' · ')}
              {d.sourceCrs !== 'CRS84' ? ` · ${d.sourceCrs}` : ''}
            </div>
          )}
        </button>
        <IconBtn label={layer.visible ? t('action.hide') : t('action.show')}
          onClick={() => store.update(layer.id, { visible: !layer.visible })}>
          {layer.visible ? '◉' : '○'}
        </IconBtn>
        <IconBtn label={t('action.frame')} onClick={() => void frameVectorLayer(layer.id)}>⤢</IconBtn>
        <IconBtn label={t('action.remove')} onClick={() => removeVectorLayer(layer.id)}>✕</IconBtn>
      </div>

      {far !== null && far > 20 && (
        <div className="mt-1 text-[10px] text-[var(--warning,#f5a524)] leading-snug">{t('warn.far', { km: Math.round(far) })}</div>
      )}

      {expanded && d && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-[var(--text-dim)]">{t('height.title')}</span>
            <select className={inputCls} value={layer.heightMode}
              onChange={(e) => store.update(layer.id, { heightMode: e.target.value as HeightMode })}>
              {(['relative', 'absolute', 'ignore'] as const).map((m) => <option key={m} value={m}>{t(`height.${m}`)}</option>)}
            </select>
            <span className="text-[10px] text-[var(--text-faint)] leading-snug">
              {t(`height.source.${d.heightSource}`, { prop: d.heightProperty ?? '' })}
            </span>
          </label>
          <LiveControls layer={layer} />
          <JoinForm layer={layer} />
          <LayerStyleEditor layer={layer} />
          {d.skipped > 0 && <div className="text-[10px] text-[var(--text-faint)]">{t('warn.skipped', { count: d.skipped })}</div>}
          {layer.attribution && <div className="text-[10px] text-[var(--text-faint)]">© {layer.attribution}</div>}
        </div>
      )}
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="w-6 h-6 max-md:w-9 max-md:h-9 shrink-0 rounded-[6px] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center justify-center">
      {children}
    </button>
  )
}

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex justify-between text-[10px] text-[var(--text-dim)]">
        <span>{label}</span><span className="font-mono">{unit ? `${value} ${unit}` : value.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </label>
  )
}

function SelectedFeature() {
  const { t } = useTranslation('layers')
  const sel = useVectorLayerStore((s) => s.selected)
  const layer = useVectorLayerStore((s) => (s.selected ? s.layers.find((l) => l.id === s.selected!.layerId) : undefined))
  const feature = sel && layer?.data ? layer.data.features[sel.featureIndex] : undefined
  const following = useVectorLayerStore((s) => !!s.following && s.following.layerId === sel?.layerId)
  if (!sel || !layer || !feature) return null
  const rows = flattenProperties(feature.properties)
  const stopCode = tmbStopCode(feature.properties)
  const canFollow = !!layer.live?.enabled && feature.geometry.type === 'point'
  return (
    <div className="rounded-[7px] border border-[var(--accent)] px-2 py-1.5 flex flex-col gap-1" data-testid="layers-selected">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: layer.style.color }} />
        <span className="flex-1 min-w-0 text-[11px] font-medium truncate">{layer.name} · {t(`kind.${feature.geometry.type}`)}</span>
        {canFollow && (
          <button onClick={() => followFeature(layer.id, following ? null : sel.featureIndex)} aria-pressed={following}
            title={t(following ? 'follow.stop' : 'follow.start')}
            className={`shrink-0 px-1.5 py-0.5 rounded-[5px] text-[10px] font-medium border ${following ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'}`}>
            {following ? '◉ ' : '◎ '}{t(following ? 'follow.on' : 'follow.start')}
          </button>
        )}
        <IconBtn label={t('action.close')} onClick={() => useVectorLayerStore.getState().setSelected(null)}>✕</IconBtn>
      </div>
      {rows.length === 0
        ? <div className="text-[10px] text-[var(--text-faint)]">{t('selected.noProps')}</div>
        : (
          <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-2 gap-y-0.5 max-h-56 overflow-y-auto text-[10px]">
            {rows.slice(0, 200).map((r) => (
              <React.Fragment key={r.path}>
                <dt className="font-mono text-[var(--text-faint)] truncate" title={r.path}>{r.path}</dt>
                <dd className="text-[var(--text)] break-words">{r.display}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      {stopCode && <TmbArrivals stopCode={stopCode} />}
      {layer.history?.enabled && <FeatureHistory layerId={layer.id} featureIndex={sel.featureIndex} refreshKey={layer.fetchedAt} />}
    </div>
  )
}
