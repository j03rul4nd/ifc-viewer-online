// The settings for a user's own AGV warehouse twin, in the order a person
// thinks about it: the building, what is stored, who it ships to, then the
// two real connections (their ERP, their fleet manager).

import { useState } from 'react'
import { BAY_W, type AgvLayout } from '../msp/agv/sim'
import { skusFromCsv, parseFleet, startFleetFeed, type AgvTwinConfig, type FleetFeedConfig } from '../msp/agv/config'
import { erpPayload, type ErpTarget } from '../msp/agv/sim'
import { toCsv } from './csv'
import { download } from './share'
import { Section, Num, Text, Lines, Toggle, Select, CsvInput, Note, Code, Field, input, btn } from './Fields'

type Set = (fn: (c: AgvTwinConfig) => AgvTwinConfig) => void

const SAMPLE_FEED = `{
  "robots": [
    { "id": "AMR-01", "pose": { "x": 18.2, "y": 6.0, "theta": 3.14 },
      "battery": 0.82, "state": "MOVING", "mission": "Pick for SO-1042" },
    { "id": "AMR-02", "pose": { "x": 40.5, "y": 3.2, "theta": -1.57 },
      "battery": 0.35, "state": "CHARGING" }
  ]
}`

export function floorFacts(l: AgvLayout) {
  const length = 12 + l.bays * BAY_W + 0.9
  const chargersEnd = 12.5 + (l.docksOut + l.docksIn - 1) * 4.5 + 3 + (l.fleet - 1) * 2.5
  const w = Math.max(length + 3, chargersEnd + 5) + 9
  const d = 15.2 + (l.aisles - 1) * 7 + 2.8 + 4
  return { w: Math.round(w), d: Math.round(d), locations: l.aisles * 2 * l.bays * 2 * l.levels }
}

export default function AgvBuilder({ cfg, set }: { cfg: AgvTwinConfig; set: Set }) {
  const L = cfg.layout, C = cfg.catalogue
  const lay = (k: keyof AgvLayout) => (v: number) => set((c) => ({ ...c, layout: { ...c.layout, [k]: v } }))
  const cat = <K extends keyof typeof C>(k: K) => (v: (typeof C)[K]) => set((c) => ({ ...c, catalogue: { ...c.catalogue, [k]: v } }))
  const erp = <K extends keyof AgvTwinConfig['erp']>(k: K) => (v: AgvTwinConfig['erp'][K]) => set((c) => ({ ...c, erp: { ...c.erp, [k]: v } }))
  const feed = (patch: Partial<FleetFeedConfig>) => set((c) => ({ ...c, feed: { ...c.feed, ...patch } }))
  const field = (k: keyof FleetFeedConfig['fields']) => (v: string) => feed({ fields: { ...cfg.feed.fields, [k]: v } })
  const tf = (k: keyof FleetFeedConfig['transform']) => (v: number | boolean) => feed({ transform: { ...cfg.feed.transform, [k]: v } })
  const f = floorFacts(L)
  const [skuMsg, setSkuMsg] = useState('')
  const [test, setTest] = useState<{ ok: boolean; text: string; sample?: string } | null>(null)
  const [erpTest, setErpTest] = useState<string>('')

  const testFeed = () => {
    setTest({ ok: true, text: 'Connecting…' })
    let stop = () => {}
    stop = startFleetFeed({ ...cfg.feed, enabled: true, everyS: 3600 }, (r) => {
      setTest({ ok: r.length > 0, text: r.length ? `Read ${r.length} carts. First: ${r[0].id} at x ${r[0].x.toFixed(1)} m, z ${r[0].z.toFixed(1)} m${r[0].battery !== undefined ? `, ${Math.round(r[0].battery)}%` : ''}.` : 'Connected, but no carts matched the field names.', sample: JSON.stringify(r.slice(0, 2), null, 2) })
      stop()
    }, (s) => { if (!s.ok) { setTest({ ok: false, text: s.text }); stop() } })
  }

  const testErp = async () => {
    const p = erpPayload(cfg.erp.target, {
      t: 0, agv: 'AGV-TEST', task: {
        id: 'TO-TEST', type: 'PICK', ref: 'SO-TEST', party: C.customers[0] ?? 'Customer', city: C.cities[0] ?? '', from: 'A-01-1-L', to: 'D1', slot: 0, dock: 0, priority: 2,
        createdAt: 0, due: 600, status: 'done', doneAt: 300,
        pallet: { sscc: '000000000000000000', sku: C.skus[0], cases: 10, kg: 100, lot: 'TEST', bbd: '2027-01', h: 1 },
      },
    }, cfg.erp.endpoint)
    setErpTest('Sending…')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (cfg.erp.auth) headers.Authorization = cfg.erp.auth
      const r = await fetch(p.url, { method: p.method, headers, body: JSON.stringify(p.body) })
      setErpTest(`${r.ok ? '✓' : '✗'} ${p.method} ${p.url} → HTTP ${r.status}`)
    } catch (e) {
      setErpTest(`✗ ${(e as Error).message}. If the request never left, your endpoint must allow this site (CORS) — ask for "${location.origin}" to be allowed, or point it at a small relay of yours.`)
    }
  }

  return (
    <div>
      <Section n={1} open title="Your warehouse" hint={`${f.w} × ${f.d} m · ${f.locations.toLocaleString('en')} pallet locations · ${L.fleet} carts`}>
        <div className="grid grid-cols-2 gap-3">
          <Text label="Name" value={cfg.name} onChange={(v) => set((c) => ({ ...c, name: v }))} />
          <Text label="Site (shown on inbound loads)" value={C.site} onChange={cat('site')} />
          <Num label="Aisles" hint="1–6 · a rack row each side" value={L.aisles} min={1} max={6} onChange={lay('aisles')} />
          <Num label="Bays per row" hint={`4–30 · ${BAY_W} m each`} value={L.bays} min={4} max={30} onChange={lay('bays')} />
          <Num label="Pallet levels" hint="2–6" value={L.levels} min={2} max={6} onChange={lay('levels')} />
          <Num label="Carts (AGV / AMR)" hint="1–12, one charger each" value={L.fleet} min={1} max={12} onChange={lay('fleet')} />
          <Num label="Outbound docks" hint="1–8" value={L.docksOut} min={1} max={8} onChange={lay('docksOut')} />
          <Num label="Inbound docks" hint="1–3" value={L.docksIn} min={1} max={3} onChange={lay('docksIn')} />
        </div>
        <Note>The floor is a narrow-aisle layout with one-way traffic, the way most AGV sites run. Change a number and press <b>Update preview</b>.</Note>
      </Section>

      <Section n={2} title="What you store" hint={`${C.skus.length} products`}>
        <CsvInput label="Products (SKUs)" hint={<>Columns: <code>code, name, cases, kg_per_case</code> (colour and wrap optional). {skuMsg}</>}
          template={() => download('skus.csv', toCsv([['code', 'name', 'cases', 'kg_per_case', 'color', 'wrap'], ...C.skus.map((s) => [s.code, s.name, s.cases, s.kgCase, s.color, s.wrap])]), 'text/csv')}
          onRows={(rows) => { const skus = skusFromCsv(rows); if (skus.length) { cat('skus')(skus); setSkuMsg(`Loaded ${skus.length}.`) } else setSkuMsg('No rows with a code found.') }} />
        <div className="max-h-48 overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-[var(--surface)] text-left text-[var(--text-dim)]"><tr><th className="px-2 py-1.5">Code</th><th className="px-2">Name</th><th className="px-2 text-right">Cases</th><th className="px-2 text-right">kg/case</th></tr></thead>
            <tbody>{C.skus.slice(0, 100).map((s) => (
              <tr key={s.code} className="border-t border-[var(--border)]"><td className="px-2 py-1"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: s.color }} />{s.code}</td><td className="px-2">{s.name}</td><td className="px-2 text-right tabular-nums">{s.cases}</td><td className="px-2 text-right tabular-nums">{s.kgCase}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section n={3} title="Who you ship to and receive from" hint="Customers, cities, carriers, suppliers">
        <div className="grid gap-3 md:grid-cols-2">
          <Lines label="Customers" value={C.customers} onChange={cat('customers')} />
          <Lines label="Destination cities" value={C.cities} onChange={cat('cities')} />
          <Lines label="Carriers" value={C.carriers} onChange={cat('carriers')} />
          <Lines label="Suppliers (inbound)" value={C.suppliers} onChange={cat('suppliers')} />
        </div>
        <Select label="Express carrier (its loads jump the queue)" value={C.priorityCarrier ?? ''} onChange={(v) => cat('priorityCarrier')(v || undefined)}
          options={[{ value: '', label: 'None' }, ...C.carriers.filter(Boolean).map((c) => ({ value: c, label: c }))]} />
      </Section>

      <Section n={4} title="Your ERP" hint={cfg.erp.send && cfg.erp.endpoint ? `Sending to ${new URL(cfg.erp.endpoint).host}` : 'Preview only'}>
        <Select<ErpTarget> label="System" value={cfg.erp.target} onChange={erp('target')}
          options={[{ value: 'webhook', label: 'Any system (JSON webhook)' }, { value: 'odoo', label: 'Odoo (JSON-RPC)' }, { value: 'salesforce', label: 'Salesforce (REST)' }]} />
        <Text label="Endpoint" placeholder={cfg.erp.target === 'odoo' ? 'https://your-company.odoo.com' : cfg.erp.target === 'salesforce' ? 'https://your-org.my.salesforce.com' : 'https://hooks.your-company.com/wms'} value={cfg.erp.endpoint} onChange={erp('endpoint')}
          hint={cfg.erp.target === 'odoo' ? 'Your Odoo address; the twin calls /jsonrpc.' : cfg.erp.target === 'salesforce' ? 'Your instance URL; the twin PATCHes WorkOrder by External_Id__c.' : 'Any URL that accepts a POST with JSON (Zapier, Make, n8n, your WMS).'} />
        <Text label="Authorization header" type="password" placeholder="Bearer …" value={cfg.erp.auth} onChange={erp('auth')} hint="Stays in this browser. It is never put in exported files or share links." />
        <Toggle label="Send every confirmed transfer order" hint="Off: the twin only shows the call it would make." checked={cfg.erp.send} onChange={erp('send')} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} disabled={!cfg.erp.endpoint} onClick={testErp}>Send one test call</button>
          {erpTest && <span className="text-[12px] text-[var(--text-dim)]">{erpTest}</span>}
        </div>
        <Note>The call goes straight from this browser to your endpoint. Nothing passes through our servers.</Note>
      </Section>

      <Section n={5} title="Your real fleet (optional)" hint={cfg.feed.enabled && cfg.feed.url ? 'Live positions on' : 'Simulated carts'}>
        <Toggle label="Show my carts' real positions" hint="Your fleet manager (MiR, OTTO, Locus, Seegrid, VDA 5050 bridge, or your own) answers with JSON; the twin reads it every few seconds." checked={cfg.feed.enabled} onChange={(v) => feed({ enabled: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="How" value={cfg.feed.kind} onChange={(v) => feed({ kind: v })} options={[{ value: 'poll', label: 'Poll a URL (HTTP GET)' }, { value: 'ws', label: 'WebSocket' }]} />
          <Num label="Every (s)" value={cfg.feed.everyS} min={0.5} max={60} step={0.5} onChange={(v) => feed({ everyS: v })} />
        </div>
        <Text label="URL" placeholder={cfg.feed.kind === 'ws' ? 'wss://fleet.your-site.com/stream' : 'https://fleet.your-site.com/api/robots'} value={cfg.feed.url} onChange={(v) => feed({ url: v })} />
        <Text label="Where the list is" hint='Dot path to the array of carts in the reply, e.g. "robots" or "data.items". Empty if the reply is the array.' value={cfg.feed.listPath} onChange={(v) => feed({ listPath: v })} />
        <Field label="Field names in each cart" hint="Dot paths inside one cart object.">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {(['id', 'x', 'y', 'heading', 'battery', 'state', 'mission'] as const).map((k) => (
              <label key={k} className="block text-[11.5px] text-[var(--text-dim)]">{k}<input className={`${input} mt-0.5 py-1.5 font-mono text-[12px]`} value={cfg.feed.fields[k]} onChange={(e) => field(k)(e.target.value)} /></label>
            ))}
          </div>
        </Field>
        <Field label="Map your coordinates onto this floor" hint="This twin's origin is the front-left corner; x runs along the docks, y into the building, in metres. Scale 0.001 if your feed is in millimetres.">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <label className="block text-[11.5px] text-[var(--text-dim)]">scale<input type="number" step="any" className={`${input} mt-0.5 py-1.5`} value={cfg.feed.transform.scale} onChange={(e) => tf('scale')(Number(e.target.value) || 1)} /></label>
            <label className="block text-[11.5px] text-[var(--text-dim)]">origin x (m)<input type="number" step="any" className={`${input} mt-0.5 py-1.5`} value={cfg.feed.transform.originX} onChange={(e) => tf('originX')(Number(e.target.value) || 0)} /></label>
            <label className="block text-[11.5px] text-[var(--text-dim)]">origin y (m)<input type="number" step="any" className={`${input} mt-0.5 py-1.5`} value={cfg.feed.transform.originY} onChange={(e) => tf('originY')(Number(e.target.value) || 0)} /></label>
            <label className="block text-[11.5px] text-[var(--text-dim)]">rotation (°)<input type="number" step="any" className={`${input} mt-0.5 py-1.5`} value={cfg.feed.transform.rotationDeg} onChange={(e) => tf('rotationDeg')(Number(e.target.value) || 0)} /></label>
          </div>
        </Field>
        <Toggle label="My y axis points the other way" checked={cfg.feed.transform.flipY} onChange={(v) => tf('flipY')(v)} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} disabled={!cfg.feed.url} onClick={testFeed}>Test the feed</button>
          <button type="button" className={btn} onClick={() => {
            try { const r = parseFleet(JSON.parse(SAMPLE_FEED), cfg.feed); setTest({ ok: r.length > 0, text: r.length ? `The sample reads as ${r.length} carts with these settings.` : 'The sample does not match these field names.', sample: JSON.stringify(r, null, 2) }) } catch { /* sample is static */ }
          }}>Try with the sample</button>
        </div>
        {test && <Note tone={test.ok ? 'ok' : 'warn'}>{test.text}</Note>}
        {test?.sample && <Code>{test.sample}</Code>}
        <details className="text-[12.5px] text-[var(--text-dim)]"><summary className="cursor-pointer">What the feed should look like</summary><div className="mt-2"><Code>{SAMPLE_FEED}</Code></div>
          <p className="mt-2">Carts in the feed take over simulated ones; carts it never mentions keep simulating. Docks and orders stay simulated until your WMS is connected. The feed must allow this site's origin (CORS), or be on your own network with a relay.</p>
        </details>
      </Section>
    </div>
  )
}
