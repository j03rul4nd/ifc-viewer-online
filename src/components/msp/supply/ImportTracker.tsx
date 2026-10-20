// ─── Import tracker (simulated) ──────────────────────────────────────────────
// For buyers who source from China through an agent: every purchase order on
// one map, from the supplier's door to the buyer's warehouse — production, QC
// at the agent, the sea, air or rail leg, customs and the last mile — with the
// documents as they arrive and the delays as they happen. Simulated (supply.ts)
// and labelled so; the shape of the feeds it would read and write is real.

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  createTracker, advance, stageOf, progressOf, pointAt, etaH, trackKpis, agentUpdate, erpReceipt,
  PLACES, LANES, STAGE_LABEL, SIM_HOURS_PER_S,
  type Tracker, type Shipment, type Mode, type Stage, type TrackEvent, type TrackKpis,
} from './supply'

const MODE_COLOR: Record<Mode, string> = { sea: '#38bdf8', air: '#f59e0b', rail: '#a78bfa' }
const MODE_LABEL: Record<Mode, string> = { sea: 'Sea', air: 'Air', rail: 'Rail' }
const STAGE_COLOR: Record<Stage, string> = {
  production: '#94a3b8', qc: '#a78bfa', toOrigin: '#5e6ad2', mainLeg: '#38bdf8', customs: '#f59e0b', lastMile: '#22c55e', delivered: '#22c55e',
}
const LEVEL_DOT: Record<TrackEvent['level'], string> = { info: '#94a3b8', ok: '#22c55e', warn: '#f59e0b', alert: '#ef4444' }
const MODE_GLYPH: Record<Mode, string> = {
  // ship, plane, train — tiny inline SVGs so the markers need no image files
  sea: '<path d="M3 13h14l-2 4H5zM6 13V8h8v5M9 8V5h2v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  air: '<path d="M10 2l1.5 6 6.5 3v1.6l-6.5-1.4L11 16l2 1.3V18l-3-.8-3 .8v-.7L9 16l-.5-4.8L2 12.6V11l6.5-3z" fill="currentColor"/>',
  rail: '<rect x="5" y="3" width="10" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 9h10M7 17l1.5-3M13 17l-1.5-3" stroke="currentColor" stroke-width="1.6"/>',
}

const fmtD = (h: number) => (h >= 48 ? `${Math.round(h / 24)} d` : `${Math.round(h)} h`)
const fmtEur = (v: number) => (v >= 1e6 ? `€${(v / 1e6).toFixed(1)}M` : `€${Math.round(v / 1000)}k`)

interface Snap { h: number; k: TrackKpis; rows: { s: Shipment; stage: Stage; eta: number }[]; events: TrackEvent[] }

export default function ImportTracker({ onWant, onOpenWarehouse }: { onWant?: () => void; onOpenWarehouse?: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null)
  const trackerRef = useRef<Tracker | null>(null)
  const selRef = useRef<string | null>(null)
  const followRef = useRef(false)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [tab, setTab] = useState<'orders' | 'events' | 'feeds'>('orders')
  const [panelOpen, setPanelOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768)

  useEffect(() => { selRef.current = sel }, [sel])
  useEffect(() => { followRef.current = follow }, [follow])

  useEffect(() => {
    const el = mapEl.current
    if (!el) return
    const narrow = el.clientWidth < 768
    const map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 1, zoomSnap: 0.25 })
    // Frame the whole journey, China to Spain, clear of the numbers on top and,
    // on wide screens, of the panel on the right.
    const frame = () => map.fitBounds(L.latLngBounds([...LANES.sea, ...LANES.rail, PLACES.yiwu.at, PLACES.zaragoza.at]), {
      paddingTopLeft: [20, narrow ? 150 : 150], paddingBottomRight: [narrow ? 20 : 380, narrow ? 70 : 30],
    })
    frame()
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 12,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map)

    // lanes
    for (const m of ['sea', 'air', 'rail'] as Mode[]) {
      L.polyline(LANES[m], { color: MODE_COLOR[m], weight: 2, opacity: 0.45, dashArray: m === 'air' ? '2 6' : m === 'rail' ? '8 5' : undefined }).addTo(map)
    }
    // places
    for (const p of Object.values(PLACES)) {
      const color = p.kind === 'warehouse' ? '#22c55e' : p.kind === 'hub' ? '#a78bfa' : p.kind === 'supplier' ? '#e2e8f0' : '#94a3b8'
      L.circleMarker(p.at, { radius: p.kind === 'warehouse' || p.kind === 'hub' ? 7 : 4.5, color, weight: 2, fillColor: color, fillOpacity: 0.35 })
        .bindTooltip(p.name, { direction: 'top', offset: [0, -6] }).addTo(map)
    }

    const t = createTracker(21)
    advance(t, 24 * 4) // a few days in, so every lane is busy
    trackerRef.current = t

    const markers = new Map<string, L.Marker>()
    const trails = new Map<string, L.Polyline>()
    for (const s of t.shipments) {
      const icon = L.divIcon({
        className: '', iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div class="it-pin" style="--c:${MODE_COLOR[s.mode]}"><svg viewBox="0 0 20 20" width="15" height="15" style="color:#0b0d10">${MODE_GLYPH[s.mode]}</svg></div>`,
      })
      const m = L.marker(pointAt(s.route, progressOf(t, s)).at, { icon }).addTo(map)
      m.on('click', () => setSel(s.id))
      markers.set(s.id, m)
      trails.set(s.id, L.polyline([], { color: '#ffffff', weight: 3, opacity: 0 }).addTo(map))
    }

    let raf = 0, last = performance.now(), lastSnap = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      advance(t, dt * SIM_HOURS_PER_S)
      for (const s of t.shipments) {
        const f = progressOf(t, s)
        const p = pointAt(s.route, f)
        const m = markers.get(s.id)!
        m.setLatLng(p.at)
        const elm = m.getElement()
        if (elm) {
          elm.style.opacity = stageOf(t, s) === 'delivered' ? '0.35' : '1'
          elm.dataset.sel = selRef.current === s.id ? '1' : '0'
          elm.dataset.risk = s.delayH > 0 ? '1' : '0'
        }
        const trail = trails.get(s.id)!
        if (selRef.current === s.id) {
          // the whole journey, done part solid
          const pts = s.route
          trail.setLatLngs(pts); trail.setStyle({ opacity: 0.85, color: '#ffffff', weight: 2.5, dashArray: '1 6' })
        } else trail.setStyle({ opacity: 0 })
        if (followRef.current && selRef.current === s.id) map.panTo(p.at, { animate: false })
      }
      if (now - lastSnap > 300) {
        lastSnap = now
        setSnap({
          h: t.h, k: trackKpis(t), events: t.events.slice(0, 30),
          rows: t.shipments.map((s) => ({ s: { ...s, docs: s.docs.map((d) => ({ ...d })) }, stage: stageOf(t, s), eta: etaH(t, s) })),
        })
      }
    }
    raf = requestAnimationFrame(loop)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); map.remove() }
  }, [])

  const selected = useMemo(() => snap?.rows.find((r) => r.s.id === sel) ?? null, [snap, sel])
  const feedSample = useMemo(() => {
    const t = trackerRef.current
    const s = t?.shipments.find((x) => x.id === sel) ?? t?.shipments[0]
    return t && s ? { agent: agentUpdate(t, s), erp: erpReceipt(s), id: s.id } : null
    // refresh with the snapshot
  }, [snap, sel])

  const tabBtn = (id: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(id)} className={`flex-1 rounded-lg px-2 py-1.5 text-[13px] font-medium ${tab === id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}>{label}</button>
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0d10] text-white">
      <style>{`
        .it-pin{width:30px;height:30px;border-radius:999px;background:var(--c);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px rgba(11,13,16,.85),0 0 18px var(--c);cursor:pointer;transition:transform .2s}
        [data-sel="1"] .it-pin{transform:scale(1.35);box-shadow:0 0 0 3px #fff,0 0 24px var(--c)}
        [data-risk="1"] .it-pin::after{content:'';position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:99px;background:#ef4444;border:2px solid #0b0d10}
        .leaflet-container{background:#0b0d10;font-family:Inter,system-ui,sans-serif}
        .leaflet-tooltip{background:rgba(10,12,16,.9);color:#fff;border:1px solid rgba(255,255,255,.15)}
        .leaflet-control-attribution{background:rgba(10,12,16,.7)!important;color:rgba(255,255,255,.6)!important;font-size:10px}
        .leaflet-control-attribution a{color:rgba(255,255,255,.8)!important}
        .leaflet-bar a{background:#14171c;color:#fff;border-color:rgba(255,255,255,.12)}
      `}</style>
      <div ref={mapEl} className="absolute inset-0" />

      {/* what this is + numbers */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] md:left-4 md:right-[372px] md:top-4">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/65 px-3 py-1.5 text-[12px] backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
          <span className="font-semibold">Simulated</span>
          <span className="text-white/60">· 8 orders · China → Spain{snap ? ` · day ${Math.floor(snap.h / 24)}` : ''}</span>
        </div>
        {snap && (
          <div className="mt-2 grid grid-cols-4 gap-1.5 md:mt-3 md:max-w-[620px] md:gap-2">
            {[
              ['In transit', String(snap.k.inTransit), ''],
              ['Delayed', String(snap.k.atRisk), ''],
              ['Value at sea', fmtEur(snap.k.valueAtSeaEur), ''],
              ['Door to door', String(snap.k.avgDoorToDoorD), 'd'],
            ].map(([l, v, u]) => (
              <div key={l} className="rounded-xl border border-white/10 bg-black/60 px-2.5 py-2 backdrop-blur md:px-4 md:py-2.5">
                <p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.06em] text-white/55 md:text-[11px]">{l}</p>
                <p className="mt-0.5 text-[17px] font-semibold tabular-nums md:text-[22px]">{v}<span className="ml-0.5 text-[12px] text-white/60">{u}</span></p>
              </div>
            ))}
          </div>
        )}
        {selected && (
          <div className="pointer-events-auto mt-2 max-w-[380px] rounded-xl border border-white/10 bg-black/75 p-3 backdrop-blur md:mt-3 md:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold md:text-[17px]">{selected.s.id}</p>
              <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: STAGE_COLOR[selected.stage] + '33', color: STAGE_COLOR[selected.stage] }}>{STAGE_LABEL[selected.stage]}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-white/70">{selected.s.units.toLocaleString('en')} × {selected.s.goods} · {selected.s.supplier}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-white/70">
              <span>Mode</span><span className="text-white/90">{MODE_LABEL[selected.s.mode]} · {selected.s.incoterm}</span>
              <span>Value</span><span className="text-white/90">{fmtEur(selected.s.valueEur)}</span>
              <span>ETA</span><span className="text-white/90">{selected.stage === 'delivered' ? 'Delivered' : `in ${fmtD(selected.eta)}`}{selected.s.delayH > 0 && <span className="text-[#f59e0b]"> (+{fmtD(selected.s.delayH)})</span>}</span>
            </div>
            <ul className="mt-2 grid grid-cols-1 gap-0.5 text-[12px]">
              {selected.s.docs.map((d) => (
                <li key={d.name} className={d.done ? 'text-white/85' : 'text-white/35'}>{d.done ? '✓' : '○'} {d.name}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setFollow((f) => !f)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${follow ? 'bg-[#5e6ad2]' : 'bg-white/10'}`}>{follow ? 'Following' : 'Follow'}</button>
              {onOpenWarehouse && <button type="button" onClick={onOpenWarehouse} className="rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px]">See it arrive in the warehouse →</button>}
              <button type="button" onClick={() => { setSel(null); setFollow(false) }} className="rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] text-white/75">Close</button>
            </div>
          </div>
        )}
      </div>

      {/* legend */}
      <div className="absolute bottom-3 left-14 z-[500] hidden gap-3 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[12px] backdrop-blur sm:flex">
        {(['sea', 'air', 'rail'] as Mode[]).map((m) => (
          <span key={m} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: MODE_COLOR[m] }} />{MODE_LABEL[m]}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ef4444]" />Delayed</span>
      </div>

      <button type="button" onClick={() => setPanelOpen((o) => !o)} className="absolute bottom-3 right-3 z-[500] rounded-full border border-white/10 bg-black/75 px-3.5 py-2 text-[13px] font-semibold backdrop-blur md:hidden">
        {panelOpen ? 'Hide panel' : 'Orders · Events · Feeds'}
      </button>
      {panelOpen && snap && (
        <aside className="absolute inset-x-2 bottom-14 z-[600] flex max-h-[46%] flex-col rounded-2xl border border-white/10 bg-black/80 backdrop-blur md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:max-h-none md:w-[352px]">
          <div className="flex gap-1 p-1.5">{tabBtn('orders', 'Orders')}{tabBtn('events', 'Events')}{tabBtn('feeds', 'Feeds')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {tab === 'orders' && (
              <ul className="space-y-1.5">
                {snap.rows.map(({ s, stage, eta }) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSel(s.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${sel === s.id ? 'border-[#8b93e8] bg-[#5e6ad2]/25' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[13.5px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: MODE_COLOR[s.mode] }} />{s.id}</span>
                        <span className="text-[11.5px] font-semibold" style={{ color: s.delayH > 0 && stage !== 'delivered' ? '#f59e0b' : STAGE_COLOR[stage] }}>{STAGE_LABEL[stage]}</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-2 text-[12px] text-white/60">
                        <span className="truncate">{s.goods} · {s.supplier.split(' ')[0]}</span>
                        <span className="flex-none tabular-nums">{stage === 'delivered' ? 'done' : `ETA ${fmtD(eta)}`}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'events' && (
              <ul className="space-y-1.5 text-[12.5px]">
                {snap.events.map((e, i) => (
                  <li key={`${e.h}-${i}`} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: LEVEL_DOT[e.level] }} />
                    <span className="tabular-nums text-white/45">d{Math.floor(e.h / 24)}</span>
                    <span className="text-white/85">{e.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'feeds' && feedSample && (
              <div className="text-[12px]">
                <p className="leading-snug text-white/65">Your sourcing agent (BuckyDrop or a local agent) and your forwarder already track your orders. This puts their updates on one map and pushes the receipt to your ERP.</p>
                <p className="mt-3 font-semibold text-white/85">In · agent / forwarder update ({feedSample.id})</p>
                <pre className="mt-1 max-h-44 overflow-auto rounded-lg bg-black/60 p-2.5 text-[11px] leading-snug text-[#c7d2fe]"><code>{JSON.stringify(feedSample.agent, null, 2)}</code></pre>
                <p className="mt-3 font-semibold text-white/85">Out · receipt in Odoo on delivery</p>
                <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-black/60 p-2.5 text-[11px] leading-snug text-[#c7d2fe]"><code>{JSON.stringify(feedSample.erp, null, 2)}</code></pre>
                <p className="mt-2 text-[11px] text-white/45">Illustrative shapes, nothing is sent. A real project maps your agent’s actual feed (API, email or spreadsheet) — that is the pilot.</p>
                {onWant && <button type="button" onClick={onWant} className="mt-3 w-full rounded-lg bg-[#5e6ad2] py-2 text-[13px] font-semibold">Track our orders like this</button>}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
