// ─── Import tracker (simulated) ──────────────────────────────────────────────
// For buyers who source from China through an agent: every purchase order on
// one map, and behind each one its whole file — dated timeline against what
// was promised, the agent's QC inspection, the landed cost line by line, the
// payments, the documents, the container it shares — plus the decision a buyer
// actually takes (fly it instead?). Containers and a supplier scorecard sit
// beside the orders. Simulated (supply.ts) and labelled so.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  createTracker, advance, stageOf, positionOf, configureSupply, applyUpdates, etaH, totalH, trackKpis, agentUpdate, erpReceipt,
  milestones, landedCost, expediteOption, payments, containers, supplierScores, attention, summary,
  PLACES, LANES, STAGE_LABEL, SIM_HOURS_PER_S,
  type AgentUpdateRow, type Tracker, type Shipment, type Mode, type Stage, type TrackEvent, type TrackKpis, type Container, type SupplierScore, type Attention,
} from './supply'
import { updatesFromJson, type ImportsTwinConfig } from './config'

const MODE_COLOR: Record<Mode, string> = { sea: '#38bdf8', air: '#f59e0b', rail: '#a78bfa' }
const MODE_LABEL: Record<Mode, string> = { sea: 'Sea', air: 'Air', rail: 'Rail' }
const STAGE_COLOR: Record<Stage, string> = {
  production: '#94a3b8', qc: '#a78bfa', toOrigin: '#5e6ad2', mainLeg: '#38bdf8', customs: '#f59e0b', lastMile: '#22c55e', delivered: '#22c55e',
}
const LEVEL_DOT: Record<TrackEvent['level'], string> = { info: '#94a3b8', ok: '#22c55e', warn: '#f59e0b', alert: '#ef4444' }
const MODE_GLYPH: Record<Mode, string> = {
  sea: '<path d="M3 13h14l-2 4H5zM6 13V8h8v5M9 8V5h2v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  air: '<path d="M10 2l1.5 6 6.5 3v1.6l-6.5-1.4L11 16l2 1.3V18l-3-.8-3 .8v-.7L9 16l-.5-4.8L2 12.6V11l6.5-3z" fill="currentColor"/>',
  rail: '<rect x="5" y="3" width="10" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 9h10M7 17l1.5-3M13 17l-1.5-3" stroke="currentColor" stroke-width="1.6"/>',
}

const fmtD = (h: number) => (h >= 48 ? `${Math.round(h / 24)} d` : `${Math.round(h)} h`)
const fmtEur = (v: number) => (Math.abs(v) >= 1e6 ? `€${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e4 ? `€${Math.round(v / 1000)}k` : `€${Math.round(v).toLocaleString('en')}`)
const eur2 = (v: number) => `€${v.toFixed(2)}`

interface Row { s: Shipment; stage: Stage; eta: number; late: boolean }
interface Snap { h: number; k: TrackKpis; rows: Row[]; events: TrackEvent[]; boxes: Container[]; scores: SupplierScore[]; needs: Attention[] }

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: color + '2e', color }}>{children}</span>
}

export default function ImportTracker({ onWant, onOpenWarehouse, config, updates }: {
  onWant?: () => void; onOpenWarehouse?: () => void
  /** A user's own setup (the builder). Read once, on mount: remount to change it. */
  config?: ImportsTwinConfig
  /** Agent updates to apply (a spreadsheet the user loaded); new ones are applied as they come. */
  updates?: AgentUpdateRow[]
}) {
  const mapEl = useRef<HTMLDivElement>(null)
  const trackerRef = useRef<Tracker | null>(null)
  const selRef = useRef<string | null>(null)
  const followRef = useRef(false)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [tab, setTab] = useState<'needs' | 'orders' | 'boxes' | 'suppliers' | 'feeds'>('needs')
  const [detailTab, setDetailTab] = useState<'timeline' | 'qc' | 'costs' | 'docs'>('timeline')
  // Desktop: the panel is a column. Phone: a bottom sheet that starts as a
  // peek (the map stays readable) and opens to read an order.
  const [panelOpen, setPanelOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 768)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const [expedited, setExpedited] = useState<Set<string>>(new Set())
  const [feedStatus, setFeedStatus] = useState<{ ok: boolean; text: string } | null>(null)

  // Updates the user loaded from a spreadsheet: applied once each.
  const appliedRef = useRef(0)
  useEffect(() => {
    const t = trackerRef.current
    if (!t || !updates?.length || appliedRef.current >= updates.length) return
    applyUpdates(t, updates.slice(appliedRef.current))
    appliedRef.current = updates.length
  }, [updates, snap])

  // The agent's portal, polled from this browser.
  useEffect(() => {
    const f = config?.feed
    if (!f?.enabled || !f.url) return
    let stop = false, timer = 0
    const poll = async () => {
      try {
        const res = await fetch(f.url, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const rows = updatesFromJson(await res.json(), f.listPath)
        const t = trackerRef.current
        const n = t ? applyUpdates(t, rows) : 0
        if (!stop) setFeedStatus({ ok: true, text: `Agent feed · ${n} updates · ${new Date().toLocaleTimeString()}` })
      } catch (e) {
        if (!stop) setFeedStatus({ ok: false, text: `Agent feed: ${(e as Error).message || 'failed'} (CORS?)` })
      }
      if (!stop) timer = window.setTimeout(poll, f.everyS * 1000)
    }
    void poll()
    return () => { stop = true; window.clearTimeout(timer) }
  }, [config?.feed])

  useEffect(() => { selRef.current = sel; if (sel) setDetailTab('timeline') }, [sel])
  useEffect(() => { followRef.current = follow }, [follow])

  useEffect(() => {
    const el = mapEl.current
    if (!el) return
    const narrow = el.clientWidth < 768
    const map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 1, zoomSnap: 0.25 })
    configureSupply(config?.setup)
    const bounds = L.latLngBounds([...LANES.sea, ...LANES.rail, ...LANES.cape, ...Object.values(PLACES).map((p) => p.at)])
    // Frame everything; again when the box first gets a real size (it can mount hidden or tiny).
    const frame = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (w < 50 || h < 50) return false
      const n = w < 768
      map.fitBounds(bounds, { paddingTopLeft: [20, Math.min(130, h * 0.2)], paddingBottomRight: [n ? 20 : Math.min(400, w * 0.4), n ? Math.round(h * 0.4) : 30] })
      return true
    }
    let framed = frame()
    if (!framed) map.setView([30, 60], 2)
    // Phones pinch; the buttons would sit on the panel.
    if (!narrow) L.control.zoom({ position: 'bottomleft' }).addTo(map)
    // OpenStreetMap's own tiles, darkened in CSS (.it-tiles); CARTO's dark set wants a key.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, className: 'it-tiles',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    L.polyline(LANES.sea, { color: MODE_COLOR.sea, weight: 2, opacity: 0.45 }).addTo(map)
    L.polyline(LANES.cape, { color: MODE_COLOR.sea, weight: 2, opacity: 0.35, dashArray: '3 7' }).bindTooltip('Cape of Good Hope routing (Red Sea risk)').addTo(map)
    L.polyline(LANES.air, { color: MODE_COLOR.air, weight: 2, opacity: 0.45, dashArray: '2 6' }).addTo(map)
    L.polyline(LANES.rail, { color: MODE_COLOR.rail, weight: 2, opacity: 0.45, dashArray: '8 5' }).addTo(map)
    for (const p of Object.values(PLACES)) {
      const color = p.kind === 'warehouse' ? '#22c55e' : p.kind === 'hub' ? '#a78bfa' : p.kind === 'supplier' ? '#e2e8f0' : '#94a3b8'
      L.circleMarker(p.at, { radius: p.kind === 'warehouse' || p.kind === 'hub' ? 7 : 4.5, color, weight: 2, fillColor: color, fillOpacity: 0.35 })
        .bindTooltip(p.name, { direction: 'top', offset: [0, -6] }).addTo(map)
    }

    const t = createTracker(21)
    if (!t.live) advance(t, 24 * 4)
    trackerRef.current = t

    const markers = new Map<string, L.Marker>()
    const trail = L.polyline([], { color: '#ffffff', weight: 2.5, opacity: 0, dashArray: '1 6' }).addTo(map)
    for (const s of t.shipments) {
      const icon = L.divIcon({
        className: '', iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div class="it-pin" style="--c:${MODE_COLOR[s.mode]}"><svg viewBox="0 0 20 20" width="15" height="15" style="color:#0b0d10">${MODE_GLYPH[s.mode]}</svg></div>`,
      })
      const m = L.marker(positionOf(t, s).at, { icon }).addTo(map)
      m.on('click', () => setSel(s.id))
      markers.set(s.id, m)
    }

    let raf = 0, last = performance.now(), lastSnap = 0, trailFor: string | null = null
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      advance(t, dt * SIM_HOURS_PER_S)
      for (const s of t.shipments) {
        const p = positionOf(t, s)
        const m = markers.get(s.id)!
        m.setLatLng(p.at)
        const elm = m.getElement()
        if (elm) {
          elm.style.opacity = stageOf(t, s) === 'delivered' ? '0.35' : '1'
          elm.dataset.sel = selRef.current === s.id ? '1' : '0'
          elm.dataset.risk = totalH(s) > s.promisedH + 24 ? '1' : '0'
        }
        if (followRef.current && selRef.current === s.id) map.panTo(p.at, { animate: false })
      }
      if (trailFor !== selRef.current) {
        trailFor = selRef.current
        const s = t.shipments.find((x) => x.id === trailFor)
        trail.setLatLngs(s ? s.route : []); trail.setStyle({ opacity: s ? 0.85 : 0 })
      }
      if (now - lastSnap > 300) {
        lastSnap = now
        setSnap({
          h: t.h, k: trackKpis(t), events: t.events.slice(0, 40), boxes: containers(t), scores: supplierScores(t), needs: attention(t),
          rows: t.shipments.map((s) => ({ s: { ...s, docs: s.docs.map((d) => ({ ...d })) }, stage: stageOf(t, s), eta: etaH(t, s), late: totalH(s) > s.promisedH + 24 })),
        })
      }
    }
    raf = requestAnimationFrame(loop)
    let touched = false
    map.on('zoomstart movestart', (e) => { if ((e as L.LeafletEvent & { originalEvent?: Event }).originalEvent) touched = true })
    map.on('mousedown touchstart', () => { touched = true })
    const ro = new ResizeObserver(() => { map.invalidateSize(); if (!touched) framed = frame() || framed })
    ro.observe(el)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); map.remove() }
  }, [])

  const t = trackerRef.current
  const row = useMemo(() => snap?.rows.find((r) => r.s.id === sel) ?? null, [snap, sel])
  const live = t && sel ? t.shipments.find((s) => s.id === sel) ?? null : null
  const detail = useMemo(() => {
    if (!t || !live || !row) return null
    return { ms: milestones(t, live), lc: landedCost(live), exp: expediteOption(t, live), pay: payments(live, row.stage), sum: summary(t, live) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, sel])
  const feed = useMemo(() => {
    const s = (t && (t.shipments.find((x) => x.id === sel) ?? t.shipments[0])) || null
    return t && s ? { agent: agentUpdate(t, s), erp: erpReceipt(s), id: s.id } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, sel])

  const expedite = (s: Shipment, e: { extraEur: number; daysSaved: number }) => {
    if (!t) return
    t.events.unshift({ h: t.h, level: 'info', text: `${s.id} expedite requested: agent re-quoting by air · +${fmtEur(e.extraEur)}, ~${e.daysSaved} d sooner (demo)`, po: s.id })
    setExpedited((x) => new Set(x).add(s.id))
  }

  const tabBtn = <T extends string>(cur: T, set: (v: T) => void, id: T, label: string) => (
    <button key={id} type="button" onClick={() => set(id)} className={`flex-none whitespace-nowrap rounded-lg px-2.5 py-1.5 md:flex-1 text-[12.5px] font-medium ${cur === id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}>{label}</button>
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0d10] text-white">
      <style>{`
        .it-pin{width:30px;height:30px;border-radius:999px;background:var(--c);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px rgba(11,13,16,.85),0 0 18px var(--c);cursor:pointer;transition:transform .2s;position:relative}
        [data-sel="1"] .it-pin{transform:scale(1.35);box-shadow:0 0 0 3px #fff,0 0 24px var(--c)}
        [data-risk="1"] .it-pin::after{content:'';position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:99px;background:#ef4444;border:2px solid #0b0d10}
        .leaflet-container{background:#0b0d10;font-family:Inter,system-ui,sans-serif}
        .it-tiles{filter:invert(1) hue-rotate(180deg) brightness(.78) contrast(.92) saturate(.6)}
        .leaflet-tooltip{background:rgba(10,12,16,.9);color:#fff;border:1px solid rgba(255,255,255,.15)}
        .leaflet-control-attribution{background:rgba(10,12,16,.7)!important;color:rgba(255,255,255,.6)!important;font-size:10px}
        .leaflet-control-attribution a{color:rgba(255,255,255,.8)!important}
        .leaflet-bar a{background:#14171c;color:#fff;border-color:rgba(255,255,255,.12)}
      `}</style>
      <div ref={mapEl} className="absolute inset-0 isolate z-0" />

      <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] md:left-4 md:right-[412px] md:top-4">
        <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur">
          <p className="truncate text-[13px] font-semibold md:text-[16px]">{config ? `${config.setup.company} · imports` : 'Your imports from China'}</p>
          {config?.setup.live
            ? <span className="flex-none rounded-full bg-[#22c55e]/20 px-2 py-0.5 text-[11px] font-semibold text-[#22c55e]">Your dates</span>
            : <span className="flex-none rounded-full bg-[#f59e0b]/20 px-2 py-0.5 text-[11px] font-semibold text-[#f59e0b]">Simulated</span>}
          {feedStatus && <span className={`flex-none text-[11px] ${feedStatus.ok ? 'text-[#86efac]' : 'text-[#fca5a5]'}`}>{feedStatus.text}</span>}
        </div>
        {snap && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 md:mt-2.5 md:max-w-[480px] md:gap-2">
            {[
              { l: 'On the way', v: String(snap.k.inTransit), c: '#ffffff' },
              { l: 'Late', v: String(snap.k.atRisk), c: snap.k.atRisk > 0 ? '#f59e0b' : '#22c55e' },
              { l: 'At sea', v: fmtEur(snap.k.valueAtSeaEur), c: '#ffffff' },
            ].map((k) => (
              <div key={k.l} className="min-w-0 rounded-xl border border-white/10 bg-black/70 px-2.5 py-1.5 backdrop-blur md:px-3 md:py-2">
                <p className="truncate text-[11px] font-medium text-white/60 md:text-[12px]">{k.l}</p>
                <p className="truncate text-[17px] font-semibold tabular-nums md:text-[23px]" style={{ color: k.c }}>{k.v}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-14 z-[500] hidden gap-3 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[12px] backdrop-blur lg:flex">
        {(['sea', 'air', 'rail'] as Mode[]).map((m) => <span key={m} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: MODE_COLOR[m] }} />{MODE_LABEL[m]}</span>)}
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ef4444]" />Late vs promise</span>
      </div>



      {snap && (
        <aside
          className="absolute inset-x-0 bottom-0 z-[600] flex flex-col rounded-t-2xl border-t border-white/10 bg-[#0d1014] shadow-[0_-12px_32px_rgba(0,0,0,.5)] transition-[height] duration-200 md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:w-[392px] md:rounded-2xl md:border md:bg-black/85 md:backdrop-blur"
          style={narrow ? { height: panelOpen || row ? (row ? '82%' : '66%') : '38%', paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
        >
          <button type="button" onClick={() => setPanelOpen((o) => !o)} className="flex flex-none flex-col items-center gap-1 pt-2 md:hidden" aria-label={panelOpen ? 'Show more map' : 'Show more of the list'}>
            <span className="h-1.5 w-10 rounded-full bg-white/30" />
            <span className="text-[11px] text-white/50">{panelOpen || row ? 'Tap to see the map' : 'Tap to see more'}</span>
          </button>
          {row && detail && live ? (
            <>
              <div className="flex-none border-b border-white/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => { setSel(null); setFollow(false); setPanelOpen(false) }} className="text-[13px] text-white/70 hover:text-white">← All orders</button>
                  <Chip color={STAGE_COLOR[row.stage]}>{STAGE_LABEL[row.stage]}</Chip>
                </div>
                <p className="mt-1.5 truncate text-[17px] font-semibold">{row.s.id} <span className="text-[13px] font-normal text-white/55">· {row.s.supplier}</span></p>
                <p className="break-words text-[13px] text-white/75">{row.s.units.toLocaleString('en')} × {row.s.goods} · {MODE_LABEL[row.s.mode]}{row.s.viaCape ? ' via Cape' : ''} · {row.s.incoterm}{row.s.container ? ` · ${row.s.container}` : ''}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11.5px]">
                  <div className="min-w-0 rounded-lg bg-white/[0.06] px-2 py-1.5"><p className="text-white/50">ETA</p><p className="font-semibold">{row.stage === 'delivered' ? 'Delivered' : `in ${fmtD(row.eta)}`}</p></div>
                  <div className="rounded-lg bg-white/[0.06] px-2 py-1.5"><p className="text-white/50">vs promise</p><p className={`font-semibold ${row.late ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`}>{row.late ? `+${fmtD(totalH(row.s) - row.s.promisedH)}` : 'on time'}</p></div>
                  <div className="rounded-lg bg-white/[0.06] px-2 py-1.5"><p className="text-white/50">Landed / unit</p><p className="font-semibold">{eur2(detail.lc.perUnitEur)}</p></div>
                </div>
                <p className="mt-2 rounded-lg bg-[#5e6ad2]/20 px-2.5 py-2 text-[13px] leading-snug text-white">{detail.sum}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setFollow((f) => !f)} className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${follow ? 'bg-[#5e6ad2]' : 'bg-white/10'}`}>{follow ? 'Following' : 'Follow on map'}</button>
                  {onOpenWarehouse && <button type="button" onClick={onOpenWarehouse} className="rounded-lg bg-white/10 px-2.5 py-1 text-[12px]">Its arrival in the warehouse →</button>}
                </div>
              </div>
              <div className="flex flex-none gap-1 p-1.5">{(['timeline', 'qc', 'costs', 'docs'] as const).map((id) => tabBtn(detailTab, setDetailTab, id, id === 'qc' ? 'QC' : id[0].toUpperCase() + id.slice(1)))}</div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 text-[12.5px]">
                {detailTab === 'timeline' && (
                  <ol className="relative ml-1.5 border-l border-white/15">
                    {detail.ms.map((m) => (
                      <li key={m.label} className="mb-2.5 ml-3">
                        <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border-2 border-[#0b0d10]" style={{ background: m.done ? (m.late ? '#f59e0b' : '#22c55e') : '#475569' }} />
                        <p className={`break-words ${m.done ? 'text-white' : 'text-white/55'}`}>{m.label}</p>
                        <p className="text-[11.5px] text-white/50">Planned {m.planned} · {m.done ? 'done' : 'expected'} {m.actual}{m.late && <span className="text-[#f59e0b]"> · late</span>}</p>
                        {m.note && <p className="text-[11.5px] text-[#f59e0b]">{m.note}</p>}
                      </li>
                    ))}
                  </ol>
                )}
                {detailTab === 'qc' && (
                  <div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[['Standard', `ISO 2859-1 · AQL ${live.qc.aql}`], ['Lot / sample', `${live.qc.lot.toLocaleString('en')} / ${live.qc.sample}`], ['Major allowed', `≤ ${live.qc.acceptMajor}`], ['Inspector', live.qc.inspector]].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-white/[0.06] px-2 py-1.5"><p className="text-white/50">{k}</p><p className="font-medium">{v}</p></div>
                      ))}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <div className="rounded-lg border border-white/10 px-2.5 py-2">
                        <div className="flex justify-between"><span>First inspection</span><Chip color={live.qc.firstPass ? '#22c55e' : '#ef4444'}>{live.qc.firstPass ? 'Pass' : 'Fail'}</Chip></div>
                        <p className="mt-1 text-white/65">{live.qc.firstMajor} major · {live.qc.firstMinor} minor defects</p>
                      </div>
                      {!live.qc.firstPass && (
                        <div className="rounded-lg border border-white/10 px-2.5 py-2">
                          <div className="flex justify-between"><span>Re-inspection after rework</span><Chip color="#22c55e">Pass</Chip></div>
                          <p className="mt-1 text-white/65">{live.qc.finalMajor} major · {live.qc.finalMinor} minor · 2 days added, supplier pays re-inspection</p>
                        </div>
                      )}
                      <p className="text-[11.5px] text-white/50">The 70% balance is released only after a pass. Photos and the report travel with the PO.</p>
                    </div>
                  </div>
                )}
                {detailTab === 'costs' && (
                  <div>
                    <ul className="divide-y divide-white/10">
                      {detail.lc.lines.map((l) => (
                        <li key={l.label} className="flex justify-between gap-3 py-1.5">
                          <span className="min-w-0 break-words">{l.label}{l.note && <span className="block text-[11px] text-white/45">{l.note}</span>}</span>
                          <span className="tabular-nums text-white/90">{fmtEur(l.eur)}</span>
                        </li>
                      ))}
                      <li className="flex justify-between py-1.5 font-semibold"><span>Landed cost</span><span className="tabular-nums">{fmtEur(detail.lc.totalEur)}</span></li>
                      <li className="flex justify-between py-1.5"><span>Per unit · margin at €{live.priceEur}</span><span className="tabular-nums">{eur2(detail.lc.perUnitEur)} · {detail.lc.marginPct}%</span></li>
                      <li className="flex justify-between py-1.5 text-white/55"><span>Import VAT 21% (recoverable)</span><span className="tabular-nums">{fmtEur(detail.lc.vatEur)}</span></li>
                    </ul>
                    <p className="mt-2 font-semibold text-white/85">Payments</p>
                    <ul className="mt-1 space-y-1">
                      {detail.pay.map((p) => <li key={p.label} className="flex justify-between gap-2"><span className={`min-w-0 break-words ${p.paid ? 'text-white/85' : 'text-white/45'}`}>{p.paid ? '✓' : '○'} {p.label}</span><span className="tabular-nums">{fmtEur(p.eur)}</span></li>)}
                    </ul>
                    {detail.exp && (
                      <div className="mt-3 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-2.5">
                        <p className="font-semibold">What if it flies?</p>
                        <p className="mt-0.5 text-white/75">Air instead of {live.mode}: <b>+{fmtEur(detail.exp.extraEur)}</b> (+{eur2(detail.exp.perUnitDeltaEur)}/unit), about <b>{detail.exp.daysSaved} days sooner</b>. Margin {detail.lc.marginPct}% → {Math.round((1 - (detail.lc.perUnitEur + detail.exp.perUnitDeltaEur) / live.priceEur) * 100)}%.</p>
                        <button type="button" disabled={expedited.has(live.id)} onClick={() => expedite(live, detail.exp!)} className="mt-2 rounded-lg bg-[#f59e0b] px-3 py-1.5 text-[12.5px] font-semibold text-black disabled:opacity-60">{expedited.has(live.id) ? 'Re-quote requested' : 'Ask the agent to re-quote by air'}</button>
                      </div>
                    )}
                  </div>
                )}
                {detailTab === 'docs' && (
                  <ul className="space-y-1">
                    {row.s.docs.map((d) => (
                      <li key={d.name} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5">
                        <span className={d.done ? 'text-white/90' : 'text-white/40'}>{d.done ? '✓' : '○'} {d.name}</span>
                        <span className="text-[11px] text-white/40">{d.done ? 'received' : 'pending'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-none gap-1 overflow-x-auto p-1.5 [scrollbar-width:none]">
                {tabBtn(tab, setTab, 'needs', `Needs you${snap.needs.length ? ` · ${snap.needs.length}` : ''}`)}{tabBtn(tab, setTab, 'orders', 'Orders')}{tabBtn(tab, setTab, 'boxes', 'Containers')}{tabBtn(tab, setTab, 'suppliers', 'Suppliers')}{tabBtn(tab, setTab, 'feeds', 'Feeds')}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                {tab === 'orders' && (
                  <ul className="space-y-1.5">
                    {snap.rows.map(({ s, stage, eta, late }) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => setSel(s.id)} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left hover:bg-white/[0.08]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-[13.5px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: MODE_COLOR[s.mode] }} />{s.id}</span>
                            <span className="text-[11.5px] font-semibold" style={{ color: late && stage !== 'delivered' ? '#f59e0b' : STAGE_COLOR[stage] }}>{STAGE_LABEL[stage]}</span>
                          </div>
                          <div className="mt-1 flex justify-between gap-2 text-[12px] text-white/60">
                            <span className="truncate">{s.goods} · {s.supplier.split(' ')[0]}</span>
                            <span className="flex-none tabular-nums">{stage === 'delivered' ? 'done' : `ETA ${fmtD(eta)}`}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                    <li className="pt-1 text-[11.5px] text-white/45">Tap an order for its timeline, QC, landed cost and documents.</li>
                  </ul>
                )}
                {tab === 'boxes' && (
                  <ul className="space-y-1.5 text-[12.5px]">
                    {snap.boxes.map((c) => (
                      <li key={c.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <div className="flex items-center justify-between"><span className="text-[13.5px] font-semibold">{c.id}</span><Chip color={STAGE_COLOR[c.stage]}>{STAGE_LABEL[c.stage]}</Chip></div>
                        <p className="mt-0.5 break-words text-white/60">{c.type} · {c.vessel}{c.viaCape ? ' · via Cape' : ''}</p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#38bdf8]" style={{ width: `${Math.min(100, (c.cbm / c.capacity) * 100)}%` }} /></div>
                        <p className="mt-1 break-words text-white/60">{c.cbm.toFixed(1)} of {c.capacity} m³ · {c.pos.length > 1 ? `shared by ${c.pos.join(', ')}` : c.pos[0]}</p>
                      </li>
                    ))}
                    <li className="text-[11.5px] text-white/45">The agent fills containers with several suppliers’ orders: one booking, one customs entry.</li>
                  </ul>
                )}
                {tab === 'suppliers' && (
                  <ul className="space-y-1.5 text-[12.5px]">
                    {snap.scores.map((sc) => (
                      <li key={sc.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[13.5px] font-semibold">{sc.name}</span><Chip color={sc.grade === 'A' ? '#22c55e' : sc.grade === 'B' ? '#f59e0b' : '#ef4444'}>Grade {sc.grade}</Chip></div>
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11.5px]">
                          <div><p className="text-white/50">QC 1st pass</p><p className="font-semibold">{sc.qcFirstPassPct}%</p></div>
                          <div><p className="text-white/50">On time</p><p className="font-semibold">{sc.onTimePct}%</p></div>
                          <div><p className="text-white/50">Production</p><p className="font-semibold">{sc.avgProductionD} d</p></div>
                        </div>
                        <p className="mt-1 text-white/55">{sc.orders} POs · {fmtEur(sc.openValueEur)} open</p>
                      </li>
                    ))}
                  </ul>
                )}
                {tab === 'needs' && (
                  <div>
                    <p className="mb-2 text-[13px] leading-snug text-white/70">Start here: tap an order to see why and what it costs.</p>
                    <ul className="space-y-2">
                      {snap.needs.map((n) => (
                        <li key={n.po}>
                          <button type="button" onClick={() => setSel(n.po)} className="flex w-full items-stretch gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] text-left hover:bg-white/[0.09]">
                            <span className="w-1 flex-none" style={{ background: n.level === 'alert' ? '#ef4444' : '#f59e0b' }} />
                            <span className="min-w-0 flex-1 py-2.5">
                              <span className="block text-[14px] font-semibold">{n.title}</span>
                              <span className="block break-words text-[12.5px] leading-snug text-white/65">{n.detail}</span>
                              <span className="mt-0.5 block text-[11.5px] text-white/45">{n.po}</span>
                            </span>
                            <span className="flex flex-none items-center pr-3">
                              <span className="rounded-lg px-2 py-1 text-[13px] font-bold tabular-nums" style={{ background: (n.level === 'alert' ? '#ef4444' : '#f59e0b') + '26', color: n.level === 'alert' ? '#fca5a5' : '#fcd34d' }}>{n.impact}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {snap.needs.length === 0 && <li className="rounded-xl bg-white/[0.05] px-3 py-3 text-[13px] text-white/70">Nothing needs you right now. Every order is on time.</li>}
                    </ul>
                    <p className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/45">Latest updates</p>
                    <ul className="space-y-1.5 text-[12.5px]">
                      {snap.events.slice(0, 8).map((e, i) => (
                        <li key={`${e.h}-${i}`} className="flex min-w-0 gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: LEVEL_DOT[e.level] }} />
                          <button type="button" onClick={() => e.po && setSel(e.po)} className="min-w-0 break-words text-left text-white/80 hover:text-white">{e.text}</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tab === 'feeds' && feed && (
                  <div className="text-[12px]">
                    <p className="leading-snug text-white/65">Your sourcing agent (BuckyDrop or a local agent) and your forwarder already track your orders. This puts their updates on one map and pushes the receipt, with its landed cost, to your ERP.</p>
                    <p className="mt-3 font-semibold text-white/85">In · agent / forwarder update ({feed.id})</p>
                    <pre className="mt-1 max-h-44 overflow-auto rounded-lg bg-black/60 p-2.5 text-[11px] leading-snug text-[#c7d2fe]"><code>{JSON.stringify(feed.agent, null, 2)}</code></pre>
                    <p className="mt-3 font-semibold text-white/85">Out · receipt in Odoo on delivery</p>
                    <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-black/60 p-2.5 text-[11px] leading-snug text-[#c7d2fe]"><code>{JSON.stringify(feed.erp, null, 2)}</code></pre>
                    <p className="mt-2 text-[11px] text-white/45">Illustrative shapes, nothing is sent. A real project maps your agent’s actual feed (API, email or spreadsheet): that is the pilot.</p>
                    {onWant && <button type="button" onClick={onWant} className="mt-3 w-full rounded-lg bg-[#5e6ad2] py-2 text-[13px] font-semibold">Track our orders like this</button>}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  )
}
