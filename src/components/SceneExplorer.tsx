// ─── SceneExplorer ────────────────────────────────────────────────────────────
// Exploring a digital twin from inside a figure — a blog article, a kiosk, a
// page that embeds a scene — where the app's panels are not there.
//
// What readers ran into, and what this answers:
//   • "I click an asset and see nothing." The canvas presets had no panel, so a
//     click selected an element and showed none of its data. The card on the
//     right shows what the last click picked: an IFC element (live twin values,
//     key data, every property set), a data-layer feature (its attributes), or
//     a building of the map.
//   • "Once something is selected I can barely move: the camera is stuck on
//     it." Clicking a live value fitted the camera to the element — a metre
//     from a 30 cm dock post, orbiting it — and the wheel did not zoom without
//     Ctrl. Moves now keep context (scene-explore/camera-moves), the wheel works
//     once you click in the view, and the buttons on the left zoom, turn, look
//     from above and go back to the overview without knowing any gesture.
//   • "Where are the interesting bits?" Explore lists the twin's live points,
//     with their values, and the scene's models: one click goes there and
//     opens its card.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI, IFCItemData } from '../lib/viewer'
import type { SelectedInfo } from '../types'
import { useTwinDeviceStore, selectShownReadings } from '../stores/twinDeviceStore'
import { useValidationStore } from '../stores/validationStore'
import { useSceneStore } from '../stores/sceneStore'
import { useVectorLayerStore } from '../stores/vectorLayerStore'
import { useInspectorStore } from '../lib/inspector'
import { buildCatalog, buildGuidIndex, resolveLocs } from '../lib/twin/devices'
import { flattenProperties } from '../lib/twin/flatten-props'
import { bindingItems, modelItems } from '../lib/scene-explore/explore-items'
import { isTopPose, orbitPose, topPose, zoomPose, type Pose } from '../lib/scene-explore/camera-moves'
import { currentPose, focusBox, focusElements, stepCamera } from '../lib/scene-explore/focus'
import { TwinLiveSection } from './TwinLiveSection'
import { ifcClassLabel } from '../lib/scene-explore/ifc-class-label'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** The IFC element picked last (App's selection). */
  selected: SelectedInfo | null
  /** Where "overview" goes: the scene's own camera, or null to fit every model. */
  homePose: Pose | null
}

type PickKind = 'element' | 'feature' | 'map'
/** A click that lands on a data-layer marker also selects the IFC element behind it; the marker is what was meant. */
const SAME_CLICK_MS = 400

export default function SceneExplorer({ viewerApiRef, selected, homePose }: Props) {
  const { t } = useTranslation('viewer')
  const featureSel = useVectorLayerStore((s) => s.selected)
  const mapTarget = useInspectorStore((s) => (s.target?.kind === 'map-feature' ? s.target : null))
  const [pick, setPick] = useState<{ kind: PickKind; at: number } | null>(null)
  const lastFeatureAt = useRef(0)

  useEffect(() => {
    if (featureSel) { lastFeatureAt.current = Date.now(); setPick({ kind: 'feature', at: Date.now() }) }
    else setPick((p) => (p?.kind === 'feature' ? null : p))
  }, [featureSel])
  useEffect(() => {
    if (selected) {
      if (Date.now() - lastFeatureAt.current < SAME_CLICK_MS && useVectorLayerStore.getState().selected) return
      setPick({ kind: 'element', at: Date.now() })
    } else setPick((p) => (p?.kind === 'element' ? null : p))
  }, [selected])
  useEffect(() => {
    if (mapTarget) setPick((p) => (p && Date.now() - p.at < SAME_CLICK_MS ? p : { kind: 'map', at: Date.now() }))
    else setPick((p) => (p?.kind === 'map' ? null : p))
  }, [mapTarget])

  const closeCard = (): void => {
    viewerApiRef.current?.clearSelection()
    useVectorLayerStore.getState().setSelected(null)
    useInspectorStore.getState().clear()
    setPick(null)
  }

  const goHome = (): void => {
    const v = viewerApiRef.current
    if (!v) return
    if (homePose) v.setCameraLookAt(homePose.position, homePose.target, true)
    else v.frameAllModels()
  }

  return (
    <>
      <div className="absolute left-2 top-2 z-[22] flex flex-col items-start gap-1.5 pointer-events-none" data-testid="scene-explorer">
        <ExploreMenu viewerApiRef={viewerApiRef} />
        <NavDock viewerApiRef={viewerApiRef} onHome={goHome} />
      </div>
      {pick && (
        <aside
          className="absolute z-[23] right-2 top-2 w-[330px] max-h-[calc(100%-3.5rem)] max-sm:left-2 max-sm:right-2 max-sm:top-auto max-sm:bottom-9 max-sm:w-auto max-sm:max-h-[52%]
            flex flex-col rounded-[12px] border border-[var(--border)] bg-[rgba(14,15,20,0.94)] backdrop-blur-[8px] shadow-2xl text-[var(--text)] overflow-hidden"
          aria-label={t('explorer.cardLabel')} data-testid="scene-explorer-card">
          {pick.kind === 'element' && selected && <ElementCard viewerApiRef={viewerApiRef} selected={selected} onClose={closeCard} />}
          {pick.kind === 'feature' && <FeatureCard onClose={closeCard} />}
          {pick.kind === 'map' && mapTarget && <MapFeatureCard target={mapTarget} onClose={closeCard} />}
        </aside>
      )}
    </>
  )
}

// ── Popovers close like popovers: a press outside, or Escape ─────────────────

function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey) }
  }, [ref, open, close])
}

// ── Navigation ────────────────────────────────────────────────────────────────

const btn = 'pointer-events-auto w-8 h-8 max-md:w-10 max-md:h-10 flex items-center justify-center rounded-[8px] text-[var(--text)] hover:bg-white/[0.08] active:bg-white/[0.14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'
const svg = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

function NavDock({ viewerApiRef, onHome }: { viewerApiRef: React.MutableRefObject<ViewerAPI | null>; onHome: () => void }) {
  const { t } = useTranslation('viewer')
  const [top, setTop] = useState(false)
  const [help, setHelp] = useState(false)
  const dockRef = useRef<HTMLDivElement>(null)
  const closeHelp = React.useCallback(() => setHelp(false), [])
  useDismiss(dockRef, help, closeHelp)
  const lastPerspective = useRef<Pose | null>(null)
  const step = (fn: (p: Pose) => Pose): void => { const v = viewerApiRef.current; if (v) stepCamera(v, fn) }
  const toggleTop = (): void => {
    const v = viewerApiRef.current
    const p = v && currentPose(v)
    if (!v || !p) return
    if (isTopPose(p)) {
      // Back to the angle it had before going overhead, re-aimed at where it looks now.
      const prev = lastPerspective.current
      const off = prev ? { x: prev.position.x - prev.target.x, y: prev.position.y - prev.target.y, z: prev.position.z - prev.target.z } : { x: 0, y: 0.6, z: 0.8 }
      const d = Math.hypot(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z)
      const k = d / Math.max(1e-9, Math.hypot(off.x, off.y, off.z))
      v.setCameraLookAt({ x: p.target.x + off.x * k, y: p.target.y + off.y * k, z: p.target.z + off.z * k }, p.target, true)
      setTop(false)
    } else {
      lastPerspective.current = p
      v.setCameraLookAt(topPose(p).position, p.target, true)
      setTop(true)
    }
  }

  return (
    <div ref={dockRef} className="relative pointer-events-auto flex flex-col gap-0.5 p-1 rounded-[11px] border border-[var(--border)] bg-[rgba(14,15,20,0.88)] backdrop-blur-[8px] shadow-lg" role="toolbar" aria-label={t('explorer.navLabel')} data-testid="scene-nav">
      <button type="button" className={btn} onClick={onHome} title={t('explorer.home')} aria-label={t('explorer.home')}>
        <svg {...svg}><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></svg>
      </button>
      <span className="h-px mx-1 bg-[var(--border)]" aria-hidden />
      <button type="button" className={btn} onClick={() => step((p) => zoomPose(p, 0.6))} title={t('explorer.zoomIn')} aria-label={t('explorer.zoomIn')}>
        <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <button type="button" className={btn} onClick={() => step((p) => zoomPose(p, 1.65))} title={t('explorer.zoomOut')} aria-label={t('explorer.zoomOut')}>
        <svg {...svg}><path d="M5 12h14" /></svg>
      </button>
      {/* On a phone a one-finger drag already turns; the column stays short enough to clear the card. */}
      <span className="h-px mx-1 bg-[var(--border)] max-sm:hidden" aria-hidden />
      <button type="button" className={`${btn} max-sm:hidden`} onClick={() => step((p) => orbitPose(p, Math.PI / 6))} title={t('explorer.turnLeft')} aria-label={t('explorer.turnLeft')}>
        <svg {...svg}><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></svg>
      </button>
      <button type="button" className={`${btn} max-sm:hidden`} onClick={() => step((p) => orbitPose(p, -Math.PI / 6))} title={t('explorer.turnRight')} aria-label={t('explorer.turnRight')}>
        <svg {...svg}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4h-4" /></svg>
      </button>
      <button type="button" className={btn} onClick={toggleTop} aria-pressed={top}
        title={t(top ? 'explorer.perspective' : 'explorer.top')} aria-label={t(top ? 'explorer.perspective' : 'explorer.top')}>
        {top
          ? <svg {...svg}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></svg>
          : <svg {...svg}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></svg>}
      </button>
      <span className="h-px mx-1 bg-[var(--border)]" aria-hidden />
      <button type="button" className={btn} onClick={() => setHelp((h) => !h)} aria-expanded={help} title={t('explorer.help')} aria-label={t('explorer.help')}>
        <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></svg>
      </button>
      {help && (
        <div className="absolute left-full top-0 ml-2 w-[250px] p-3 rounded-[11px] border border-[var(--border)] bg-[rgba(14,15,20,0.96)] shadow-2xl text-[11.5px] leading-snug" role="note" data-testid="scene-nav-help">
          <div className="text-[12px] font-semibold mb-1.5">{t('explorer.helpTitle')}</div>
          <ul className="flex flex-col gap-1 text-[var(--text-dim)]">
            <li>{t('explorer.helpClick')}</li>
            <li>{t('explorer.helpDrag')}</li>
            <li>{t('explorer.helpPan')}</li>
            <li>{t('explorer.helpWheel')}</li>
            <li>{t('explorer.helpDouble')}</li>
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Explore: the twin's live points and the scene's models ───────────────────

function ExploreMenu({ viewerApiRef }: { viewerApiRef: React.MutableRefObject<ViewerAPI | null> }) {
  const { t } = useTranslation('viewer')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = React.useCallback(() => setOpen(false), [])
  useDismiss(menuRef, open, close)
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const readings = useTwinDeviceStore(selectShownReadings)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const models = useSceneStore((s) => s.models)
  const trees = useValidationStore((s) => s.spatialTrees)
  const now = timeAt ?? Date.now()
  const live = useMemo(() => bindingItems(bindings, readings, now), [bindings, readings, now])
  const modelRows = useMemo(() => modelItems(models), [models])
  if (live.length === 0 && modelRows.length < 2) return null

  const goToBinding = async (id: string): Promise<void> => {
    const v = viewerApiRef.current
    const b = bindings.find((x) => x.id === id)
    if (!v || !b) return
    const locs = resolveLocs(b, buildGuidIndex(trees), buildCatalog(trees))
    if (!locs.length) return
    const modelId = locs[0].modelId
    const ids = locs.filter((l) => l.modelId === modelId).map((l) => l.expressId).slice(0, 500)
    setOpen(false)
    await focusElements(v, ids, modelId)
    v.selectElement(ids[0], modelId)
  }
  const goToModel = (id: string): void => {
    const v = viewerApiRef.current
    const b = v?.getModelBounds(id)
    if (!v || !b) return
    setOpen(false)
    const h = { x: b.size.x / 2, y: b.size.y / 2, z: b.size.z / 2 }
    focusBox(v, { min: { x: b.center.x - h.x, y: b.center.y - h.y, z: b.center.z - h.z }, max: { x: b.center.x + h.x, y: b.center.y + h.y, z: b.center.z + h.z } })
  }
  const liveCount = live.filter((r) => r.state === 'live').length

  return (
    <div ref={menuRef} className="relative pointer-events-auto">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="scene-explore-button"
        className="flex items-center gap-1.5 h-8 max-md:h-10 px-2.5 rounded-[10px] border border-[var(--border)] bg-[rgba(14,15,20,0.88)] backdrop-blur-[8px] shadow-lg text-[12px] font-medium text-[var(--text)] hover:border-[var(--accent)]">
        <svg {...svg}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
        {t('explorer.explore')}
        {liveCount > 0 && (
          <span className="flex items-center gap-1 pl-1 text-[10.5px] text-[var(--text-dim)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" aria-hidden />{t('explorer.liveCount', { count: liveCount })}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-[300px] max-w-[calc(100vw-1rem)] max-h-[min(420px,calc(100vh-4rem))] overflow-y-auto overscroll-contain rounded-[11px] border border-[var(--border)] bg-[rgba(14,15,20,0.97)] shadow-2xl p-1.5 z-[24]"
          data-testid="scene-explore-list">
          {live.length > 0 && (
            <>
              <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('explorer.live')}</div>
              {live.map((r) => (
                <button key={r.id} type="button" onClick={() => void goToBinding(r.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 max-md:py-2.5 rounded-[8px] text-left hover:bg-white/[0.06]">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20" style={{ background: r.color ?? 'transparent' }} aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] truncate">{r.name}</span>
                    <span className="block text-[10.5px] text-[var(--text-faint)] truncate">
                      {r.state === 'live' ? (r.ruleName ?? t('explorer.state.live')) : t(`explorer.state.${r.state}`)}
                    </span>
                  </span>
                  {r.value !== null && <span className="shrink-0 font-mono tabular-nums text-[12px]">{r.value}</span>}
                </button>
              ))}
            </>
          )}
          {modelRows.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('explorer.models')}</div>
              {modelRows.map((m) => (
                <button key={m.id} type="button" onClick={() => goToModel(m.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 max-md:py-2.5 rounded-[8px] text-left hover:bg-white/[0.06]">
                  <svg {...svg} width={14} height={14}><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /></svg>
                  <span className="flex-1 min-w-0 text-[12px] truncate">{m.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function CardHeader({ badge, title, subtitle, onClose, children }: {
  badge: React.ReactNode; title: string; subtitle?: string | null; onClose: () => void; children?: React.ReactNode
}) {
  const { t } = useTranslation('viewer')
  return (
    <div className="shrink-0 flex items-start gap-2 pl-3 pr-1.5 pt-2.5 pb-2 border-b border-[var(--border)]">
      <div className="flex-1 min-w-0">
        <div className="mb-1">{badge}</div>
        <h2 className="text-[14px] font-semibold leading-snug break-words">{title}</h2>
        {subtitle && <p className="text-[11.5px] text-[var(--text-dim)] leading-snug mt-0.5 break-words">{subtitle}</p>}
        {children}
      </div>
      <button type="button" onClick={onClose} aria-label={t('elementCard.close')} title={t('elementCard.close')}
        className="w-8 h-8 shrink-0 rounded-[8px] flex items-center justify-center text-[var(--text-dim)] hover:bg-white/[0.08]">
        <svg {...svg} width={14} height={14}><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}

const chip = (text: string, cls = 'bg-[rgba(94,106,210,0.18)] text-[var(--accent-2)]') =>
  <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${cls}`}>{text}</span>

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,42%)_1fr] gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
      <dt className="text-[11.5px] text-[var(--text-faint)] break-words">{label}</dt>
      <dd className="text-[12px] text-[var(--text)] break-words">{children}</dd>
    </div>
  )
}

function fmtValue(v: unknown, locale: string): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  if (typeof v === 'number') return v.toLocaleString(locale, { maximumFractionDigits: 3 })
  return String(v)
}

function ElementCard({ viewerApiRef, selected, onClose }: {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>; selected: SelectedInfo; onClose: () => void
}) {
  const { t, i18n } = useTranslation('viewer')
  const locale = i18n.language || 'en'
  const models = useSceneStore((s) => s.models)
  const [data, setData] = useState<IFCItemData | null>(null)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [copied, setCopied] = useState(false)
  const id = parseInt(selected.id, 10)
  const modelId = selected.modelId

  useEffect(() => {
    let cancelled = false
    setStatus('loading'); setData(null); setCopied(false)
    viewerApiRef.current?.getItemData(id, modelId)
      .then((d) => { if (!cancelled) { setData(d); setStatus(d ? 'loaded' : 'error') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [id, modelId, viewerApiRef])

  const modelName = modelItems(models.filter((m) => m.id === modelId))[0]?.name
  const title = data?.name || selected.name
  const subtitle = data ? (data.longName || data.description || data.objectType) : null
  const quantities = useMemo(() => {
    const rows: Array<{ name: string; value: string }> = []
    for (const set of data?.quantitySets ?? []) for (const q of set.quantities) {
      if (q.value === null || rows.some((r) => r.name === q.name)) continue
      rows.push({ name: q.name, value: `${q.value.toLocaleString(locale, { maximumFractionDigits: 2 })}${q.unit ? ` ${q.unit}` : ''}` })
    }
    return rows.slice(0, 8)
  }, [data, locale])
  // The asset-management set first (owner, condition, maintenance — what a twin
  // is opened for), then the common one, then the rest as the file has them.
  const psets = useMemo(() => {
    const sets = (data?.effectivePropertySets ?? []).filter((s) => s.properties.length > 0)
    const rank = (n: string): number => (/asset|management|maintenance|cde/i.test(n) ? 0 : /common$/i.test(n) ? 1 : 2)
    return [...sets].sort((a, b) => rank(a.name) - rank(b.name))
  }, [data])

  const focus = (): void => { const v = viewerApiRef.current; if (v && Number.isFinite(id)) void focusElements(v, [id], modelId) }

  return (
    <>
      <CardHeader onClose={onClose} title={title} subtitle={subtitle}
        badge={<span className="flex flex-wrap items-center gap-1">{chip(ifcClassLabel(data?.ifcClass ?? selected.type))}{modelName && <span className="text-[10.5px] text-[var(--text-faint)] truncate">{modelName}</span>}</span>}>
        <div className="flex gap-1.5 mt-2">
          <button type="button" onClick={focus} className="px-2 py-1 rounded-[7px] text-[11px] font-medium border border-[var(--border)] hover:border-[var(--accent)]">{t('explorer.focus')}</button>
        </div>
      </CardHeader>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-testid="scene-explorer-element">
        {/* Live twin data for this element — renders nothing when it has no binding. */}
        <TwinLiveSection globalId={data?.globalId} modelId={modelId} expressId={Number.isFinite(id) ? id : null} />
        <div className="px-3 py-2">
          {status === 'loading' && <p className="text-[12px] text-[var(--text-faint)] py-2" role="status">{t('elementCard.loading')}</p>}
          {status === 'error' && <p className="text-[12px] text-[var(--text-faint)] py-2">{t('elementCard.noData')}</p>}
          {status === 'loaded' && data && (
            <>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] mb-0.5">{t('elementCard.keyData')}</h3>
              <dl className="mb-2.5">
                {data.globalId && (
                  <Row label="GlobalId">
                    <button type="button" className="font-mono text-[11px] underline decoration-dotted underline-offset-2 break-all text-left"
                      onClick={() => { void navigator.clipboard?.writeText(data.globalId!).then(() => setCopied(true)).catch(() => {}) }}
                      aria-label={`${t('elementCard.copyGlobalId')}: ${data.globalId}`}>
                      {copied ? `✓ ${t('explorer.copied')}` : data.globalId}
                    </button>
                  </Row>
                )}
                {(data.typeName || data.objectType) && <Row label={t('elementCard.type')}>{data.typeName || data.objectType}</Row>}
                {data.storey && <Row label={t('elementCard.storey')}>{data.storey}</Row>}
                {data.materials.length > 0 && <Row label={t('elementCard.material')}>{data.materials.map((m) => m.name).filter(Boolean).join(', ')}</Row>}
                {data.tag && <Row label="Tag">{data.tag}</Row>}
              </dl>
              {quantities.length > 0 && (
                <>
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] mb-1">{t('elementCard.quantities')}</h3>
                  <dl className="grid grid-cols-2 gap-1 mb-2.5">
                    {quantities.map((q) => (
                      <div key={q.name} className="rounded-[8px] bg-white/[0.04] border border-[var(--border)] px-2 py-1 min-w-0">
                        <dt className="text-[10px] text-[var(--text-faint)] truncate" title={q.name}>{q.name}</dt>
                        <dd className="text-[12.5px] font-semibold font-mono tabular-nums">{q.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              {psets.length > 0 && (
                <>
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] mb-1">{t('explorer.properties')}</h3>
                  {psets.map((s, i) => (
                    <details key={s.name} open={i === 0} className="group mb-1 rounded-[8px] border border-[var(--border)] overflow-hidden">
                      <summary className="cursor-pointer select-none flex items-center gap-1.5 px-2 py-1.5 text-[11.5px] font-medium bg-white/[0.03] hover:bg-white/[0.06]">
                        <span className="flex-1 min-w-0 truncate">{s.name}</span>
                        <span className="text-[10px] text-[var(--text-faint)]">{s.properties.length}</span>
                      </summary>
                      <dl className="px-2">
                        {s.properties.map((p) => (
                          <Row key={`${p.source}:${p.expressId}:${p.name}`} label={p.name}>
                            {fmtValue(p.value, locale)}{p.unit ? ` ${p.unit}` : ''}
                            {p.source === 'type' && <span className="ml-1 text-[10px] text-[var(--text-faint)]">({t('explorer.fromType')})</span>}
                          </Row>
                        ))}
                      </dl>
                    </details>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function FeatureCard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('layers')
  const { t: tv } = useTranslation('viewer')
  const sel = useVectorLayerStore((s) => s.selected)
  const layer = useVectorLayerStore((s) => (s.selected ? s.layers.find((l) => l.id === s.selected!.layerId) : undefined))
  const following = useVectorLayerStore((s) => !!s.following && s.following.layerId === sel?.layerId)
  const feature = sel && layer?.data ? layer.data.features[sel.featureIndex] : undefined
  if (!sel || !layer || !feature) return null
  const rows = flattenProperties(feature.properties)
  const name = rows.find((r) => /^(name|nom|nombre|title|label)$/i.test(r.field))?.display
  const canFollow = !!layer.live?.enabled && feature.geometry.type === 'point'
  return (
    <>
      <CardHeader onClose={onClose} title={name ?? layer.name} subtitle={name ? layer.name : null}
        badge={<span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: layer.style.color }} aria-hidden />{chip(t(`kind.${feature.geometry.type}`), 'bg-white/[0.08] text-[var(--text-dim)]')}</span>}>
        {canFollow && (
          <div className="flex gap-1.5 mt-2">
            <button type="button" onClick={() => { void import('../lib/layers/vector-runner').then((m) => m.followFeature(layer.id, following ? null : sel.featureIndex)) }} aria-pressed={following}
              className={`px-2 py-1 rounded-[7px] text-[11px] font-medium border ${following ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)] hover:border-[var(--accent)]'}`}>
              {following ? `◉ ${t('follow.on')}` : `◎ ${t('follow.start')}`}
            </button>
          </div>
        )}
      </CardHeader>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2" data-testid="scene-explorer-feature">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] mb-0.5">{tv('explorer.attributes')}</h3>
        {rows.length === 0
          ? <p className="text-[12px] text-[var(--text-faint)] py-2">{t('selected.noProps')}</p>
          : <dl>{rows.slice(0, 200).map((r) => <Row key={r.path} label={r.path}>{r.display}</Row>)}</dl>}
        {layer.attribution && <p className="mt-2 text-[10px] text-[var(--text-faint)]">{layer.attribution}</p>}
      </div>
    </>
  )
}

function MapFeatureCard({ target, onClose }: {
  target: { id: string; name?: string; label?: string; featureKind: string; heightM?: number; heightEstimated?: boolean; storeys?: number }
  onClose: () => void
}) {
  const { t } = useTranslation('sidebar')
  return (
    <>
      <CardHeader onClose={onClose} title={target.name ?? target.label ?? t('inspector.map.unnamed')} subtitle={target.name && target.label ? target.label : null}
        badge={chip(`OpenStreetMap · ${target.featureKind}`, 'bg-white/[0.08] text-[var(--text-dim)]')} />
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        <dl>
          {target.heightM !== undefined && (
            <Row label={t('inspector.map.height')}>
              {target.heightM.toFixed(1)} m{target.heightEstimated && <span className="ml-1 text-[10px] text-[var(--text-faint)]">{t('inspector.map.estimated')}</span>}
            </Row>
          )}
          {target.storeys !== undefined && <Row label={t('inspector.map.storeys')}>{String(target.storeys)}</Row>}
          <Row label={t('inspector.map.osmId')}>{target.id}</Row>
        </dl>
        <p className="pt-2 text-[10.5px] text-[var(--text-faint)] leading-relaxed">{t('inspector.map.contextNote')}</p>
      </div>
    </>
  )
}
