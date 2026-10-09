// ─── DataLegend ───────────────────────────────────────────────────────────────
// What the colours and symbols on screen MEAN — for data layers (trains,
// bikes, chargers, zones). Built to help without getting in the way:
//
//   • Off by default. A small "Legend" chip appears in the corner only while
//     there are visible data layers; nothing at all otherwise.
//   • Opens when the viewer asks, and remembers that choice on this device.
//   • Shows what is ON SCREEN: visible layers, their groups with the exact
//     symbol and a live count — or, when the camera is far enough that the
//     layer is drawn as a heatmap / hexagons, the colour scale with the real
//     values it spans. It follows the zoom on its own.
//   • Is a control, not a poster: click a group to hide/show it in the scene,
//     Alt/⌘-click to show only that group. Each layer folds, or leaves the
//     legend, from its own header.
//   • What you see is what you capture: while open, the same card is painted
//     into screenshots, clips and GIFs (bottom-left, same size); minimised, it
//     is not. No extra setting to learn.
//
// Mounted as a viewport overlay (App), lazily, only while data layers exist.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVectorLayerStore, type VectorLayer } from '../stores/vectorLayerStore'
import { layerRows, displayData } from '../lib/layers/vector-runner'
import { buildLegendLayer, forCapture, type LegendLayer, type LegendSwatch, type LegendStrings } from '../lib/layers/legend-model'
import { paintLegend, type LegendExtrasPaint } from '../lib/layers/legend-paint'
import { northScreenAngle, scaleBar, type ScaleBar } from '../lib/layers/map-furniture'
import { useSceneAnchorStore } from '../stores/sceneAnchorStore'
import { useGeoStore } from '../stores/geoStore'
import type { LayerStyle } from '../lib/layers/style-groups'
import { iconDataUrl } from '../lib/layers/vector-assets'
import type { ViewerAPI } from '../lib/viewer'
import { useTwinDeviceStore, selectShownReadings } from '../stores/twinDeviceStore'
import { twinLegendLayer, TWIN_LEGEND_ID } from '../lib/twin/twin-legend'

type T = (k: string, o?: Record<string, unknown>) => string

export default function DataLegend({ viewerApiRef }: { viewerApiRef: React.RefObject<ViewerAPI | null> }) {
  const { t: tRaw } = useTranslation('layers')
  const t = tRaw as unknown as T
  const layers = useVectorLayerStore((s) => s.layers)
  const open = useVectorLayerStore((s) => s.legendOpen)
  const excluded = useVectorLayerStore((s) => s.legendExcluded)
  const folded = useVectorLayerStore((s) => s.legendFolded)
  const lod = useVectorLayerStore((s) => s.lodState)
  const live = useVectorLayerStore((s) => s.liveStatus)
  const timeTravel = useVectorLayerStore((s) => s.timeTravel)
  const historyData = useVectorLayerStore((s) => s.historyData)
  const extras = useVectorLayerStore((s) => s.legendExtras)
  // True north needs a site: the scene anchor, or the map's placement.
  const anchorRot = useSceneAnchorStore((s) => s.anchor?.rotationDeg ?? null)
  const placementRot = useGeoStore((s) => s.placement?.rotationDeg ?? null)
  const siteRotation = anchorRot ?? placementRot
  const shown = layers.filter((l) => l.visible && l.status === 'ready' && l.data && !excluded[l.id])
  // The operational twin explains its colours here too (a block like a layer's).
  const twinActive = useTwinDeviceStore((s) => s.active)
  const twinBindings = useTwinDeviceStore((s) => s.bindings)
  const twinReadings = useTwinDeviceStore(selectShownReadings)
  const twinTimeAt = useTwinDeviceStore((s) => s.timeAt)
  const twinPresent = twinActive && twinBindings.length > 0
  const hiddenCount = layers.filter((l) => l.visible && l.status === 'ready' && excluded[l.id]).length
    + (twinPresent && excluded[TWIN_LEGEND_ID] ? 1 : 0)

  const strings: LegendStrings = useMemo(() => ({
    rest: t('groups.rest'), density: t('legend.density'), less: t('legend.less'), more: t('legend.more'),
    count: t('agg.count'), fn: (f) => t(`agg.fn.${f}`),
    asOf: (ms) => {
      const d = new Date(ms)
      const sameDay = d.toDateString() === new Date().toDateString()
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      return t('legend.asOf', { when: sameDay ? time : `${d.toLocaleDateString()} ${time}` })
    },
  }), [t])

  const model: LegendLayer[] = useMemo(() => shown.map((l) => buildLegendLayer({
    id: l.id, name: l.name, live: !!l.live?.enabled, style: l.layerStyle,
    // Counts and time of what is DRAWN: the past while rewinding.
    rows: layerRows(displayData(l) ?? l.data!),
    kinds: (displayData(l) ?? l.data!).counts, aggregateOn: !!lod[l.id]?.aggregateOn,
    aggMin: lod[l.id]?.aggMin ?? null, aggMax: lod[l.id]?.aggMax ?? null, folded: !!folded[l.id],
    // The SOURCE's timestamp when the feed states one; else when we fetched it.
    dataAt: timeTravel && historyData[l.id] ? historyData[l.id]!.at : live[l.id]?.dataAt ?? live[l.id]?.lastAt ?? null,
  }, strings)), [shown, lod, folded, strings, live, timeTravel, historyData]) // eslint-disable-line react-hooks/exhaustive-deps

  const twin = useMemo(() => (twinPresent && !excluded[TWIN_LEGEND_ID]
    ? twinLegendLayer(twinBindings, twinReadings, twinTimeAt ?? Date.now(), {
      title: t('devices.title'), stale: t('devices.stale'), nodata: t('devices.nodata'), asOf: strings.asOf,
    }, !!folded[TWIN_LEGEND_ID])
    : null), [twinPresent, twinBindings, twinReadings, twinTimeAt, excluded, folded, strings, t])
  const allLayers = twin ? [...model, twin] : model

  // North / scale follow the camera — polled only while one of them is on.
  const furniture = (cssHeight: number): LegendExtrasPaint | null => {
    if (!extras.north && !extras.scale) return null
    const v = viewerApiRef.current?.getCameraViewpoint()
    if (!v) return null
    return {
      northRad: extras.north && siteRotation !== null ? northScreenAngle(v, siteRotation) : null,
      scale: extras.scale ? scaleBar(v, cssHeight, 96) : null,
    }
  }
  const [onScreen, setOnScreen] = useState<LegendExtrasPaint | null>(null)
  useEffect(() => {
    if (!open || (!extras.north && !extras.scale)) { setOnScreen(null); return }
    const tick = (): void => {
      const h = viewerApiRef.current?.getCanvas()?.clientHeight ?? 0
      setOnScreen(furniture(h))
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [open, extras.north, extras.scale, siteRotation]) // eslint-disable-line react-hooks/exhaustive-deps

  // Captures: the painter reads the latest model through a ref, so it is
  // registered once per open/close rather than on every live refresh.
  const captureRef = useRef<{ layers: LegendLayer[]; title: string; furniture: (h: number) => LegendExtrasPaint | null }>(
    { layers: [], title: '', furniture: () => null })
  captureRef.current = { layers: forCapture(allLayers), title: t('legend.title'), furniture }
  useEffect(() => {
    const v = viewerApiRef.current
    if (!open || !v) return
    return v.addCapturePainter((ctx, w, h, s) => {
      const c = captureRef.current
      // Computed now, from the camera that rendered THIS frame.
      return paintLegend(ctx, w, h, s, c.layers, c.title, c.furniture(h / s), useVectorLayerStore.getState().legendExtras.corner)
    })
  }, [open, viewerApiRef])

  // No visible data, no legend, no chip: nothing to explain.
  if (shown.length === 0 && !twin && hiddenCount === 0) return null

  // Each corner leaves room for what already lives there: camera controls
  // (bottom-right), the floating tool rail (top-right), the breadcrumb (top-left).
  const POS: Record<typeof extras.corner, string> = {
    bl: 'left-4 bottom-[76px] sm:bottom-4',
    br: 'right-4 bottom-[132px] sm:bottom-[64px]',
    tl: 'left-4 top-14',
    tr: 'right-16 top-3',
  }
  const pos = `absolute ${POS[extras.corner]} z-[20] select-none`
  const NEXT = { bl: 'br', br: 'tr', tr: 'tl', tl: 'bl' } as const

  if (!open) {
    return (
      <button type="button" className={`${pos} flex items-center gap-1.5 px-2.5 py-1.5 max-md:py-2 rounded-full text-[11px] font-medium
        bg-[rgba(16,18,24,0.72)] text-[var(--text-dim)] hover:text-[var(--text)] border border-white/10 backdrop-blur-md shadow-lg`}
        onClick={() => useVectorLayerStore.getState().setLegendOpen(true)}
        title={t('legend.openHint')} data-testid="legend-chip">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <rect x="1.5" y="2" width="3" height="3" rx="0.6" /><path d="M7 3.5h5.5" />
          <rect x="1.5" y="8.5" width="3" height="3" rx="1.5" /><path d="M7 10h5.5" />
        </svg>
        {t('legend.title')}
      </button>
    )
  }

  const anyClickable = model.some((l) => !l.folded && !l.scale && l.rows.length > 0)
  return (
    <div className={`${pos} w-[224px] max-w-[calc(100%-32px)] max-h-[min(46vh,calc(100%-120px))] flex flex-col rounded-[10px]
      bg-[rgba(16,18,24,0.82)] border border-white/10 backdrop-blur-md shadow-xl text-[var(--text)]`}
      role="region" aria-label={t('legend.title')} data-testid="data-legend">
      <div className="shrink-0 flex items-center gap-1.5 pl-2.5 pr-1 pt-1.5 pb-1">
        <span className="flex-1 text-[11px] font-semibold">{t('legend.title')}</span>
        <span className="text-[9px] text-[var(--text-faint)]" title={t('legend.inCapturesHint')}>{t('legend.inCaptures')}</span>
        <button type="button" className="w-6 h-6 rounded-[6px] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/5"
          onClick={() => useVectorLayerStore.getState().setLegendExtras({ corner: NEXT[extras.corner] })}
          aria-label={t('legend.move')} title={t('legend.move')} data-testid="legend-move">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" className="mx-auto">
            <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="2" opacity="0.5" />
            <rect x={extras.corner.endsWith('r') ? 6.5 : 2} y={extras.corner.startsWith('t') ? 2 : 6.5} width="3.5" height="3.5" rx="0.8" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="w-6 h-6 rounded-[6px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/5"
          onClick={() => useVectorLayerStore.getState().setLegendOpen(false)} aria-label={t('legend.close')} title={t('legend.close')}>—</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2 flex flex-col gap-2">
        {model.map((m) => {
          const layer = shown.find((l) => l.id === m.id)!
          return <LayerBlock key={m.id} m={m} layer={layer} t={t} />
        })}
        {twin && <TwinBlock m={twin} t={t} />}
        {hiddenCount > 0 && (
          <button type="button" className="self-start text-[10px] text-[var(--text-faint)] hover:text-[var(--text)]"
            onClick={() => {
              const st = useVectorLayerStore.getState()
              for (const id of Object.keys(st.legendExcluded)) st.toggleLegendExcluded(id)
            }}>
            {t('legend.restore', { n: hiddenCount })}
          </button>
        )}
        {onScreen && (onScreen.northRad !== null || onScreen.scale) && (
          <div className="flex items-center gap-3 pt-1 border-t border-white/10" data-testid="legend-furniture">
            {onScreen.northRad !== null && <NorthArrow rad={onScreen.northRad} />}
            {onScreen.scale && <ScaleBarView bar={onScreen.scale} />}
          </div>
        )}
        {extras.scale && onScreen && !onScreen.scale && (
          <div className="text-[9px] text-[var(--text-faint)] leading-snug">{t('legend.scaleNeedsTopDown')}</div>
        )}
        <div className="flex items-center gap-1 pt-0.5">
          <ExtraToggle on={extras.north} disabled={siteRotation === null}
            title={siteRotation === null ? t('legend.northNeedsSite') : t('legend.northHint')}
            onClick={() => useVectorLayerStore.getState().setLegendExtras({ north: !extras.north })}>
            N↑
          </ExtraToggle>
          <ExtraToggle on={extras.scale} title={t('legend.scaleHint')}
            onClick={() => useVectorLayerStore.getState().setLegendExtras({ scale: !extras.scale })}>
            {t('legend.scale')}
          </ExtraToggle>
        </div>
        {anyClickable && <div className="text-[9px] text-[var(--text-faint)] leading-snug">{t('legend.tip')}</div>}
      </div>
    </div>
  )
}

function LayerBlock({ m, layer, t }: { m: LegendLayer; layer: VectorLayer; t: T }) {
  const ls = layer.layerStyle
  const set = (next: LayerStyle): void => useVectorLayerStore.getState().setLayerStyle(layer.id, next)
  /** Click: toggle. Alt/⌘-click: only this one (again: everything back). */
  const onGroup = (i: number, e: React.MouseEvent): void => {
    if (!(e.altKey || e.metaKey)) {
      if (i < 0) set({ ...ls, fallback: { ...ls.fallback, visible: !ls.fallback.visible } })
      else set({ ...ls, groups: ls.groups.map((g, k) => (k === i ? { ...g, visible: !g.visible } : g)) })
      return
    }
    const alreadySolo = ls.groups.every((g, k) => g.visible === (k === i)) && ls.fallback.visible === (i < 0)
    set({
      ...ls,
      groups: ls.groups.map((g, k) => ({ ...g, visible: alreadySolo || k === i })),
      fallback: { ...ls.fallback, visible: alreadySolo || i < 0 },
    })
  }

  return (
    <section className="flex flex-col gap-0.5" data-testid="legend-layer">
      <div className="flex items-center gap-1">
        <button type="button" className="flex-1 min-w-0 flex items-center gap-1 text-left"
          onClick={() => useVectorLayerStore.getState().toggleLegendFolded(layer.id)} aria-expanded={!m.folded}>
          <span className="text-[8px] text-[var(--text-faint)] w-2">{m.folded ? '▸' : '▾'}</span>
          <span className="truncate text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-wide">{m.name}</span>
          {m.live && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#5ce27a] animate-pulse" title={t('live.toggle')} />}
        </button>
        {m.asOf && <span className="shrink-0 text-[9px] text-[var(--text-faint)]" data-testid="legend-asof">{m.asOf}</span>}
        <button type="button" className="shrink-0 w-5 h-5 text-[9px] text-[var(--text-faint)] hover:text-[var(--text)]"
          onClick={() => useVectorLayerStore.getState().toggleLegendExcluded(layer.id)}
          title={t('legend.exclude')} aria-label={t('legend.exclude')}>✕</button>
      </div>
      {!m.folded && (m.scale
        ? (
          <div className="flex flex-col gap-0.5 px-1" data-testid="legend-scale">
            <div className="text-[10px] text-[var(--text-dim)] truncate">{m.scale.caption}</div>
            <div className="h-2.5 rounded-[3px]" style={{
              opacity: m.scale.opacity,
              background: (() => {
                const st = m.scale.stops
                const span = (st[st.length - 1]?.at ?? 1) - (st[0]?.at ?? 0) || 1
                return `linear-gradient(90deg, ${st.map((x) => `${x.color} ${((x.at - st[0].at) / span) * 100}%`).join(', ')})`
              })(),
            }} />
            <div className="flex justify-between text-[9px] font-mono text-[var(--text-faint)]"><span>{m.scale.lo}</span><span>{m.scale.hi}</span></div>
            <div className="text-[9px] text-[var(--text-faint)]">{t('legend.zoomInForDetail')}</div>
          </div>
        )
        : (
          <ul className="flex flex-col">
            {m.rows.map((r) => (
              <li key={r.groupIndex}>
                <button type="button" onClick={(e) => onGroup(r.groupIndex, e)}
                  title={r.visible ? t('legend.hideGroup') : t('legend.showGroup')}
                  className={`w-full flex items-center gap-1.5 px-1 py-[3px] max-md:py-1.5 rounded-[5px] hover:bg-white/5 text-left ${r.visible ? '' : 'opacity-40'}`}>
                  <Swatch sw={r.swatch} />
                  <span className={`flex-1 min-w-0 truncate text-[11px] ${r.visible ? '' : 'line-through'}`}>{r.name}</span>
                  <span className="font-mono text-[10px] text-[var(--text-faint)]">{r.count}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      {!m.folded && m.aggregatesFar && (
        <div className="text-[9px] text-[var(--text-faint)] pl-1">{t('legend.aggregateFar')}</div>
      )}
    </section>
  )
}

/**
 * The twin's block: one row per state that changes how elements look. Rows are
 * not toggles (a state is not a layer group: hiding "Occupied" would lie about
 * the building); the block folds and leaves the legend like any layer's.
 */
function TwinBlock({ m, t }: { m: LegendLayer; t: T }) {
  return (
    <section className="flex flex-col gap-0.5" data-testid="legend-twin">
      <div className="flex items-center gap-1">
        <button type="button" className="flex-1 min-w-0 flex items-center gap-1 text-left"
          onClick={() => useVectorLayerStore.getState().toggleLegendFolded(m.id)} aria-expanded={!m.folded}>
          <span className="text-[8px] text-[var(--text-faint)] w-2">{m.folded ? '▸' : '▾'}</span>
          <span className="truncate text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-wide">{m.name}</span>
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#5ce27a] animate-pulse" />
        </button>
        {m.asOf && <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{m.asOf}</span>}
        <button type="button" className="shrink-0 w-5 h-5 max-md:w-8 max-md:h-8 text-[9px] text-[var(--text-faint)] hover:text-[var(--text)]"
          onClick={() => useVectorLayerStore.getState().toggleLegendExcluded(m.id)}
          title={t('legend.exclude')} aria-label={t('legend.exclude')}>✕</button>
      </div>
      {!m.folded && (
        <ul className="flex flex-col">
          {m.rows.map((r) => (
            <li key={r.groupIndex} className="flex items-center gap-1.5 px-1 py-[3px] max-md:py-1.5">
              <Swatch sw={r.swatch} />
              <span className="flex-1 min-w-0 truncate text-[11px]">{r.name}</span>
              <span className="font-mono text-[10px] text-[var(--text-faint)]">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The symbol as drawn: icon, dot, a stroke for lines, a tile for areas. */
function Swatch({ sw }: { sw: LegendSwatch }) {
  if (sw.kind === 'icon') {
    const url = iconDataUrl(sw.icon, sw.color)
    if (url) return <img src={url} alt="" className="w-4 h-4 shrink-0" />
  }
  if (sw.kind === 'icon' || sw.kind === 'dot') {
    return <span className="w-3 h-3 m-0.5 shrink-0 rounded-full border border-black/40" style={{ background: sw.color }} />
  }
  if (sw.kind === 'line') return <span className="w-4 h-[3px] shrink-0 rounded-full" style={{ background: sw.color, opacity: sw.opacity }} />
  return (
    <span className="w-4 h-3 shrink-0 rounded-[2px]"
      style={{ background: hexA(sw.color, sw.fill), border: sw.outline ? `1.5px solid ${sw.color}` : undefined }} />
  )
}

function hexA(hex: string, a: number): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex
}

function ExtraToggle({ on, disabled, title, onClick, children }: {
  on: boolean; disabled?: boolean; title: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={on}
      className={`px-1.5 py-0.5 rounded-[5px] text-[9px] font-semibold border transition-colors disabled:opacity-30 ${on
        ? 'border-[var(--accent)] text-[var(--text)] bg-white/5'
        : 'border-white/10 text-[var(--text-faint)] hover:text-[var(--text)]'}`}>
      {children}
    </button>
  )
}

function NorthArrow({ rad }: { rad: number }) {
  return (
    <svg width="26" height="30" viewBox="-13 -17 26 30" aria-label="N" className="shrink-0">
      <circle r="11" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" />
      <g transform={`rotate(${(rad * 180) / Math.PI})`}>
        <path d="M0 -9 L4.5 4 L0 1 L-4.5 4 Z" fill="#f25c54" />
        <text y="-13" textAnchor="middle" fontSize="7" fontWeight="700" fill="#f2f4f8">N</text>
      </g>
    </svg>
  )
}

function ScaleBarView({ bar }: { bar: ScaleBar }) {
  return (
    <div className="flex items-end gap-1.5" title={bar.label}>
      <div className="h-[6px] border-x-2 border-b-2 border-[#f2f4f8]" style={{ width: `${bar.px}px` }} />
      <span className="text-[10px] text-[var(--text-dim)] leading-none">{bar.label}</span>
    </div>
  )
}
