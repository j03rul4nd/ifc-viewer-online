// The settings for a buyer's own import tracker: who they are, where the
// goods go, how they travel and what it costs, their suppliers, their orders
// (a spreadsheet) and where the agent's updates come from.

import { useState } from 'react'
import { ORIGIN_PORTS, ORIGIN_AIRPORTS, ORIGIN_RAIL, DEST_PORTS, DEST_AIRPORTS, DEST_RAIL, type RouteChoice } from '../msp/supply/geo'
import type { Costs, SupplierDef, AgentUpdateRow } from '../msp/supply/supply'
import { ordersFromCsv, suppliersFromCsv, updatesFromCsv, ordersTemplateCsv, type ImportsTwinConfig, type UpdatesFeed } from '../msp/supply/config'
import { toCsv } from './csv'
import { download } from './share'
import { Section, Num, Text, Toggle, Select, CsvInput, Note, Code, Coords, btn } from './Fields'

type Set = (fn: (c: ImportsTwinConfig) => ImportsTwinConfig) => void

const opts = (m: Record<string, { name: string }>) => Object.entries(m).map(([value, t]) => ({ value, label: t.name }))

const COST_FIELDS: [keyof Costs, string, string][] = [
  ['depositPct', 'Deposit (%)', 'Paid with the order; the rest after QC.'],
  ['agentPct', 'Agent fee (% of goods)', ''],
  ['insurancePct', 'Insurance (% of goods + freight)', ''],
  ['vatPct', 'Import VAT (%)', 'Shown, recoverable.'],
  ['seaPerCbm', 'Sea freight (€/m³)', ''], ['seaCapePerCbm', 'Sea via the Cape (€/m³)', ''], ['seaFixed', 'Sea fixed per order (€)', 'THC, docs.'],
  ['airPerKg', 'Air freight (€/kg chargeable)', '1 m³ = 167 kg.'],
  ['railPerCbm', 'Rail freight (€/m³)', ''], ['railFixed', 'Rail fixed per order (€)', ''],
  ['broker', 'Customs broker per order (€)', ''], ['exwHandling', 'Origin handling if EXW (€)', ''],
  ['lastMileSea', 'Last mile, sea/rail (€)', ''], ['lastMileAir', 'Last mile, air (€)', ''],
]

const SAMPLE_UPDATES = `[
  { "po": "PO-0001", "status": "sailed", "at": "2026-09-25",
    "position": { "lat": 6.9, "lng": 79.8 }, "note": "On board MV Example, voy. 012W" },
  { "po": "PO-0002", "status": "qc passed", "at": "2026-10-15" }
]`

export default function ImportsBuilder({ cfg, set, onUpdates, updatesCount }: { cfg: ImportsTwinConfig; set: Set; onUpdates: (u: AgentUpdateRow[]) => void; updatesCount: number }) {
  const S = cfg.setup
  const setup = <K extends keyof typeof S>(k: K) => (v: (typeof S)[K]) => set((c) => ({ ...c, setup: { ...c.setup, [k]: v } }))
  const route = (k: keyof RouteChoice) => (v: string) => set((c) => ({ ...c, setup: { ...c.setup, route: { ...c.setup.route, [k]: v } } }))
  const cost = (k: keyof Costs) => (v: number) => set((c) => ({ ...c, setup: { ...c.setup, costs: { ...c.setup.costs, [k]: Math.max(0, v) } } }))
  const feed = (p: Partial<UpdatesFeed>) => set((c) => ({ ...c, feed: { ...c.feed, ...p } }))
  const [orderMsg, setOrderMsg] = useState('')
  const [supMsg, setSupMsg] = useState('')
  const [updMsg, setUpdMsg] = useState('')

  const unknownSuppliers = [...new Set(S.orders.map((o) => o.supplier))].filter((name) => {
    const k = name.trim().toLowerCase()
    return k && !S.suppliers.some((s) => s.id.toLowerCase() === k || s.name.toLowerCase() === k || s.name.toLowerCase().includes(k))
  })

  return (
    <div>
      <Section n={1} open title="You and your agent" hint={`${S.company} · ${S.warehouse.name}`}>
        <div className="grid gap-3 md:grid-cols-2">
          <Text label="Company" value={S.company} onChange={setup('company')} />
          <Text label="Sourcing agent" value={S.agent} onChange={setup('agent')} hint="BuckyDrop, your own agent, or the supplier itself." />
          <Text label="Your warehouse (name)" value={S.warehouse.name} onChange={(v) => setup('warehouse')({ ...S.warehouse, name: v })} />
          <Coords label="Your warehouse (location)" value={S.warehouse.at} onChange={(at) => setup('warehouse')({ ...S.warehouse, at })} />
          <Text label="Agent hub (QC, consolidation)" value={S.hub.name} onChange={(v) => setup('hub')({ ...S.hub, name: v })} />
          <Coords label="Agent hub (location)" value={S.hub.at} onChange={(at) => setup('hub')({ ...S.hub, at })} />
        </div>
      </Section>

      <Section n={2} title="How the goods travel" hint={`${ORIGIN_PORTS[S.route.originPort]?.name ?? ''} → ${DEST_PORTS[S.route.destPort]?.name ?? ''}`}>
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="Sea: port of loading" value={S.route.originPort} options={opts(ORIGIN_PORTS)} onChange={route('originPort')} />
          <Select label="Sea: port of arrival" value={S.route.destPort} options={opts(DEST_PORTS)} onChange={route('destPort')} />
          <Select label="Air: departure" value={S.route.originAirport} options={opts(ORIGIN_AIRPORTS)} onChange={route('originAirport')} />
          <Select label="Air: arrival" value={S.route.destAirport} options={opts(DEST_AIRPORTS)} onChange={route('destAirport')} />
          <Select label="Rail: departure" value={S.route.originRail} options={opts(ORIGIN_RAIL)} onChange={route('originRail')} />
          <Select label="Rail: arrival" value={S.route.destRail} options={opts(DEST_RAIL)} onChange={route('destRail')} />
        </div>
      </Section>

      <Section n={3} title="Your suppliers" hint={`${S.suppliers.length} suppliers`}>
        <CsvInput label="Suppliers" hint={<>Columns: <code>name, city, lat, lng</code>. {supMsg}</>}
          template={() => download('suppliers.csv', toCsv([['name', 'city', 'lat', 'lng'], ...S.suppliers.map((s) => [s.name, s.city, s.at[0], s.at[1]])]), 'text/csv')}
          onRows={(rows) => { const s = suppliersFromCsv(rows); if (s.length) { setup('suppliers')(s); setSupMsg(`Loaded ${s.length}.`) } else setSupMsg('No rows with a name and coordinates.') }} />
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] text-[13px]">
          {S.suppliers.map((s: SupplierDef) => <li key={s.id} className="flex justify-between gap-2 px-3 py-1.5"><span className="text-[var(--text)]">{s.name}</span><span className="tabular-nums text-[var(--text-faint)]">{s.city} · {s.at[0].toFixed(2)}, {s.at[1].toFixed(2)}</span></li>)}
        </ul>
      </Section>

      <Section n={4} open={false} title="Your orders" hint={S.orders.length ? `${S.orders.length} orders · ${S.live ? 'your real dates' : 'simulated dates'}` : 'Demo orders until you load yours'}>
        <CsvInput label="Purchase orders" template={() => download('purchase-orders.csv', ordersTemplateCsv(), 'text/csv')}
          hint={<>One row per PO. Needed: <code>po, supplier, goods, units, unitPrice</code>. Useful: <code>hs, dutyPct, salePrice, kgPerUnit, cbmPerUnit, mode, incoterm, container</code>. Dates (YYYY-MM-DD): <code>orderDate, promisedDate, qcDate, shippedDate, arrivedDate, clearedDate, deliveredDate</code>. Spanish headers work too. {orderMsg}</>}
          onRows={(rows) => {
            const r = ordersFromCsv(rows)
            if (r.orders.length) { setup('orders')(r.orders); setOrderMsg(`Loaded ${r.orders.length} orders${r.skipped ? `, skipped ${r.skipped} without a PO or units` : ''}. Columns understood: ${r.columns.join(', ')}.`) }
            else setOrderMsg('No orders found: the first row must be the headers, and each order needs a PO and units.')
          }} />
        {S.orders.length > 0 && (
          <>
            <div className="max-h-56 overflow-auto rounded-lg border border-[var(--border)]">
              <table className="w-full whitespace-nowrap text-[12px]">
                <thead className="sticky top-0 bg-[var(--surface)] text-left text-[var(--text-dim)]"><tr>{['PO', 'Supplier', 'Goods', 'Units', 'FOB', 'Mode', 'Ordered', 'Promised', 'Shipped', 'Delivered'].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
                <tbody>{S.orders.map((o) => (
                  <tr key={o.po} className="border-t border-[var(--border)]">
                    <td className="px-2 py-1 font-medium">{o.po}</td><td className="px-2">{o.supplier}</td><td className="px-2">{o.goods}</td><td className="px-2 tabular-nums">{o.units}</td><td className="px-2 tabular-nums">€{o.unitPrice}</td><td className="px-2">{o.mode}</td>
                    <td className="px-2">{o.orderDate ?? '—'}</td><td className="px-2">{o.promisedDate ?? '—'}</td><td className="px-2">{o.shippedDate ?? '—'}</td><td className="px-2">{o.deliveredDate ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {unknownSuppliers.length > 0 && <Note tone="warn">Not in your supplier list: {unknownSuppliers.join(', ')}. Those orders start from the first supplier's city; add the supplier above to draw them from the right place.</Note>}
            <Toggle label="Use my real dates" checked={S.live} onChange={setup('live')}
              hint="On: today is today, each order sits where its dates put it, and an overdue stage pushes the ETA. Off: your orders play out with simulated dates, like the demo." />
            <button type="button" className={btn} onClick={() => { setup('orders')([]); setup('live')(false); setOrderMsg('') }}>Back to the demo orders</button>
          </>
        )}
      </Section>

      <Section n={5} title="Costs" hint="For landed cost per unit and margin">
        <div className="grid grid-cols-2 gap-3">
          {COST_FIELDS.map(([k, label, hint]) => <Num key={k} label={label} hint={hint || undefined} value={S.costs[k]} min={0} step={0.1} onChange={cost(k)} />)}
        </div>
      </Section>

      <Section n={6} title="Your agent's updates" hint={updatesCount ? `${updatesCount} updates applied` : cfg.feed.enabled ? 'Feed on' : 'None yet'}>
        <CsvInput label="Load updates from a spreadsheet" hint={<>Columns: <code>po, status, date</code> and optionally <code>lat, lng, note</code>. Status words like "QC passed", "sailed", "arrived", "cleared", "delivered". {updMsg}</>}
          template={() => download('agent-updates.csv', toCsv([['po', 'status', 'date', 'lat', 'lng', 'note'], [S.orders[0]?.po ?? 'PO-2026-1180', 'sailed', new Date().toISOString().slice(0, 10), 6.9, 79.8, 'On board MV Example']]), 'text/csv')}
          onRows={(rows) => { const u = updatesFromCsv(rows); onUpdates(u); setUpdMsg(u.length ? `Applied ${u.length}.` : 'No rows with a PO and a known status.') }} />
        <Toggle label="Read updates from the agent's portal" hint="A URL that returns a JSON list. Polled from this browser." checked={cfg.feed.enabled} onChange={(v) => feed({ enabled: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Text label="URL" placeholder="https://portal.your-agent.com/api/updates" value={cfg.feed.url} onChange={(v) => feed({ url: v })} />
          <Num label="Every (s)" value={cfg.feed.everyS} min={10} max={3600} onChange={(v) => feed({ everyS: v })} />
        </div>
        <Text label="Where the list is" hint='Dot path to the array in the reply ("data", "items"); empty if the reply is the array.' value={cfg.feed.listPath} onChange={(v) => feed({ listPath: v })} />
        <details className="text-[12.5px] text-[var(--text-dim)]"><summary className="cursor-pointer">What the updates should look like</summary><div className="mt-2"><Code>{SAMPLE_UPDATES}</Code></div>
          <p className="mt-2">Fields can also be named <code>order</code>, <code>stage</code>, <code>event</code>, <code>date</code>, <code>lat</code>/<code>lng</code>, <code>message</code>. With real dates on, each update sets that stage's date. The portal must allow this site's origin (CORS).</p>
        </details>
      </Section>
    </div>
  )
}
