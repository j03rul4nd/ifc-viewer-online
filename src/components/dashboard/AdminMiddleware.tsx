// ─── AdminMiddleware ──────────────────────────────────────────────────────────
// The middleware business in one place: what needs us today, deals, money and
// what each customer really leaves. Internal and for one person, so Spanish only.
// The Worker answers 404 to anyone but a super admin and every money change is audited.

import { useCallback, useEffect, useState } from 'react'
import { adminMw, type AdminDeal, type AdminMwData, type AdminQuote, type LogLine } from '../../lib/cloud/admin-middleware-client'

const eur = (cents: number | null | undefined): string => (cents === null || cents === undefined ? '—' : `${new Intl.NumberFormat('es-ES').format(Math.round(cents / 100))} €`)
const pct = (v: number | null): string => (v === null ? '—' : `${Math.round(v * 100)} %`)
const day = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '—')
const short = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…` : id)

type Tab = 'today' | 'deals' | 'money' | 'margins'
const TABS: { id: Tab; label: string }[] = [{ id: 'today', label: 'Por atender' }, { id: 'deals', label: 'Ofertas' }, { id: 'money', label: 'Cobros' }, { id: 'margins', label: 'Márgenes' }]
const STATUS: Record<string, string> = { new: 'Nueva', pilot: 'Piloto', won: 'Ganada', lost: 'Perdida' }
const CHARGE: Record<string, string> = { pending: 'Por facturar', invoiced: 'Facturado', paid: 'Pagado', void: 'Anulado' }
const LOST: [string, string][] = [['price', 'Precio'], ['etl_only', 'Solo quería un ETL'], ['no_twin', 'Sin gemelo'], ['timing', 'No es el momento'], ['competitor', 'Otro proveedor'], ['other', 'Otro']]

const input = 'h-8 w-full rounded-lg border px-2 text-[12px] bg-transparent'
const button = 'h-8 px-3 rounded-lg border text-[12px] disabled:opacity-50'
const border = { borderColor: 'var(--border)' }
const muted = { color: 'var(--text-muted)' }

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4 mb-4 min-w-0" style={border}>
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-[12px]" style={muted}>{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="text-[12px]" style={muted}>{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[12px]">
        <thead><tr className="text-left" style={muted}>{head.map((h) => <th key={h} scope="col" className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t align-top" style={border}>{r.map((c, j) => <td key={j} className="py-2 pr-3">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export default function AdminMiddleware({ token }: { token: () => Promise<string | null> }) {
  const [tab, setTab] = useState<Tab>('today')
  const [data, setData] = useState<AdminMwData | null>(null)
  const [hourCost, setHourCost] = useState(75)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const t = await token()
    if (!t) { setNotice('Sin sesión.'); return }
    const r = await adminMw.load(t, hourCost)
    if (r.ok) setData(r.value); else setNotice(r.error)
  }, [token, hourCost])
  useEffect(() => { void load() }, [load])

  /** One way to change anything: run, say what failed in the API's words, reload. */
  const act = useCallback(async (fn: (t: string) => Promise<{ ok: boolean; error?: string }>, done?: string): Promise<boolean> => {
    const t = await token()
    if (!t) return false
    setBusy(true)
    const r = await fn(t)
    setBusy(false)
    setNotice(r.ok ? done ?? null : r.error ?? 'Ha fallado.')
    if (r.ok) await load()
    return r.ok
  }, [token, load])

  if (!data) return <p className="text-[12px]" style={muted}>{notice ?? 'Cargando…'}</p>
  const pending = data.services.filter((s) => s.review_status === 'pending')
  const newDeals = data.deals.deals.filter((d) => d.status === 'new' && d.fit === 'meeting')
  const counts: Partial<Record<Tab, number>> = { today: pending.length + data.tickets.length + newDeals.length, money: data.charges.charges.length, margins: data.margins.below_floor }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist" aria-label="Middleware">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={button} style={{ ...border, fontWeight: tab === x.id ? 600 : 400, opacity: tab === x.id ? 1 : 0.75 }}>
            {x.label}{counts[x.id] ? ` · ${counts[x.id]}` : ''}
          </button>
        ))}
      </div>
      {notice && <p role="status" className="mb-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>{notice}</p>}
      {tab === 'today' && <Today data={data} pending={pending} newDeals={newDeals} act={act} busy={busy} token={token} />}
      {tab === 'deals' && <Deals data={data} act={act} busy={busy} token={token} />}
      {tab === 'money' && <Money data={data} act={act} busy={busy} />}
      {tab === 'margins' && <Margins data={data} hourCost={hourCost} setHourCost={setHourCost} act={act} busy={busy} />}
    </div>
  )
}

type Act = (fn: (t: string) => Promise<{ ok: boolean; error?: string }>, done?: string) => Promise<boolean>
type Token = () => Promise<string | null>

function Today({ data, pending, newDeals, act, busy, token }: { data: AdminMwData; pending: AdminMwData['services']; newDeals: AdminDeal[]; act: Act; busy: boolean; token: Token }) {
  const [note, setNote] = useState('')
  const [logs, setLogs] = useState<{ id: string; available: boolean; lines: LogLine[] } | null>(null)
  const [minutes, setMinutes] = useState<Record<string, string>>({})
  const showLogs = async (id: string) => {
    const t = await token()
    if (!t) return
    const r = await adminMw.logs(t, id)
    if (r.ok) setLogs({ id, ...r.value })
  }
  const review = (id: string, decision: 'approved' | 'rejected') => act((t) => adminMw.review(t, id, decision, note), decision === 'approved' ? 'Aprobado. Revisión cobrada.' : 'Rechazado. Revisión cobrada.').then((ok) => { if (ok) setNote('') })
  return (
    <>
      <Section title="Contenedores por revisar" hint="Lee el repositorio antes de aprobar. La revisión se cobra sola, también si la rechazas.">
        {pending.length > 0 && <input aria-label="Nota de la revisión" className={`${input} mb-2`} style={border} placeholder="Nota obligatoria: qué has leído y qué decides" value={note} onChange={(e) => setNote(e.target.value)} />}
        <Table empty="Nada por revisar." head={['Servicio', 'Repositorio', 'Qué hace', '']} rows={pending.map((s) => [
          <span key="n" className="font-medium [overflow-wrap:anywhere]">{s.name}</span>,
          s.repo_url ? <a key="r" className="underline [overflow-wrap:anywhere]" href={s.repo_url} target="_blank" rel="noreferrer noopener">{s.repo_url}</a> : '—',
          <span key="p" className="[overflow-wrap:anywhere]">{s.purpose ?? '—'}</span>,
          <span key="a" className="flex gap-1.5 whitespace-nowrap">
            <button className={button} style={border} disabled={busy || note.trim().length < 3} onClick={() => void review(s.id, 'approved')}>Aprobar</button>
            <button className={button} style={border} disabled={busy || note.trim().length < 3} onClick={() => void review(s.id, 'rejected')}>Rechazar</button>
          </span>,
        ])} />
      </Section>

      <Section title="Peticiones de soporte" hint="Apunta los minutos aunque no se cobren: de ahí sale el margen real.">
        <Table empty="Sin peticiones abiertas." head={['Asunto', 'Mensaje', 'Tarifa aceptada', 'Minutos', '']} rows={data.tickets.map((k) => [
          <span key="s" className="font-medium [overflow-wrap:anywhere]">{k.subject}</span>,
          <span key="m" className="[overflow-wrap:anywhere]">{k.message}</span>,
          k.acceptOverage ? 'Sí' : 'No',
          <input key="i" aria-label={`Minutos de ${k.subject}`} className={`${input} w-[72px]`} style={border} inputMode="numeric" value={minutes[k.id] ?? ''} onChange={(e) => setMinutes({ ...minutes, [k.id]: e.target.value.replace(/\D/g, '') })} />,
          <span key="a" className="flex gap-1.5 whitespace-nowrap">
            <button className={button} style={border} disabled={busy || !Number(minutes[k.id])} onClick={() => void act((t) => adminMw.logTime(t, k.workspaceId, { minutes: Number(minutes[k.id]), category: 'support', note: k.subject.padEnd(3, '.'), ticket_id: k.id }), 'Minutos apuntados.').then((ok) => { if (ok) setMinutes({ ...minutes, [k.id]: '' }) })}>Apuntar</button>
            <button className={button} style={border} disabled={busy} onClick={() => void act((t) => adminMw.closeTicket(t, k.id), 'Cerrada.')}>Cerrar</button>
          </span>,
        ])} />
      </Section>

      <Section title="Solicitudes que encajan">
        <Table empty="Ninguna nueva." head={['Empresa', 'Contacto', 'Caso', 'Plan sugerido']} rows={newDeals.map((d) => [
          <span key="c" className="font-medium">{d.company}</span>, d.contact ?? '—', <span key="u" className="[overflow-wrap:anywhere]">{d.useCase ?? '—'}</span>, d.tier ?? '—',
        ])} />
      </Section>

      <Section title="Servicios en marcha" hint="Leer los registros queda anotado en la auditoría: son datos del cliente.">
        <Table empty="Ninguno." head={['Servicio', 'Empresa', 'Estado', 'Lee de', '']} rows={data.services.map((s) => [
          <span key="n" className="[overflow-wrap:anywhere]">{s.name}</span>, <span key="w" title={s.workspace_id}>{short(s.workspace_id)}</span>, s.status, <span key="h" className="[overflow-wrap:anywhere]">{s.declared_hosts.join(', ') || '—'}</span>,
          <button key="l" className={button} style={border} onClick={() => void showLogs(s.id)}>Registros</button>,
        ])} />
        {logs && (
          <div className="mt-3">
            {!logs.available ? <p className="text-[12px]" style={muted}>Registros no disponibles: no hay proveedor configurado.</p>
              : !logs.lines.length ? <p className="text-[12px]" style={muted}>Sin líneas.</p>
                : <pre className="max-h-[280px] overflow-auto rounded-lg border p-2 text-[11px] whitespace-pre-wrap [overflow-wrap:anywhere]" style={border}>{logs.lines.map((l) => `${l.at} ${l.message}`).join('\n')}</pre>}
          </div>
        )}
      </Section>
    </>
  )
}

function Deals({ data, act, busy, token }: { data: AdminMwData; act: Act; busy: boolean; token: Token }) {
  const { deals, stats, raise_due, list_factor_pct } = data.deals
  const [company, setCompany] = useState('')
  const [open, setOpen] = useState<AdminDeal | null>(null)
  const [lost, setLost] = useState<AdminDeal | null>(null)
  const [reason, setReason] = useState('price')
  const [alt, setAlt] = useState('')
  return (
    <>
      <Section title="Cómo van los precios" hint="Datos propios: sustituyen a las referencias de blogs a medida que haya reuniones.">
        <dl className="grid gap-3 grid-cols-2 sm:grid-cols-4 text-[12px]">
          {([['Ganadas', stats.won], ['Perdidas', stats.lost], ['Tasa de cierre', pct(stats.win_rate)], ['Mediana anual', eur(stats.median_annual_cents)], ['Firmaron objetando', stats.objected], ['Descuento medio', `${Math.round(stats.avg_discount_pct)} %`], ['Lista actual', `${list_factor_pct} %`]] as [string, React.ReactNode][]).map(([k, v]) => <div key={k}><dt style={muted}>{k}</dt><dd className="text-[15px] font-semibold tabular-nums">{v}</dd></div>)}
        </dl>
        {Object.keys(stats.lost_by).length > 0 && <p className="mt-3 text-[12px]" style={muted}>Pérdidas: {Object.entries(stats.lost_by).map(([k, n]) => `${LOST.find(([id]) => id === k)?.[1] ?? k} ${n}`).join(' · ')}</p>}
        {stats.alternatives.length > 0 && <p className="mt-1 text-[12px] [overflow-wrap:anywhere]" style={muted}>Alternativas que citaron: {stats.alternatives.join(' · ')}</p>}
        {raise_due && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-medium">Tres firmas seguidas sin objeción: toca subir la lista un 25 %.</p>
            <button className={button} style={border} disabled={busy} onClick={() => { if (window.confirm('¿Subir el precio de lista un 25 %? Los ya firmados conservan el suyo hasta renovar.')) void act((t) => adminMw.raise(t), 'Lista subida.') }}>Subir la lista</button>
          </div>
        )}
      </Section>

      <Section title="Ofertas">
        <form className="flex gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); void act((t) => adminMw.createDeal(t, company.trim()), 'Oferta creada.').then((ok) => { if (ok) setCompany('') }) }}>
          <input aria-label="Empresa" className={input} style={border} placeholder="Empresa de la reunión" value={company} onChange={(e) => setCompany(e.target.value)} />
          <button className={`${button} whitespace-nowrap`} style={border} disabled={busy || company.trim().length < 2}>Añadir</button>
        </form>
        <Table empty="Sin ofertas todavía." head={['Empresa', 'Estado', 'Encaje', 'Anual', 'Alta', 'Dto.', '']} rows={deals.map((d) => [
          <span key="c" className="font-medium [overflow-wrap:anywhere]" title={d.useCase ?? ''}>{d.company}</span>, STATUS[d.status] ?? d.status,
          d.fit === 'meeting' ? 'Sí' : <span key="f" title={d.fitReasons.join(', ')}>No</span>, eur(d.annualCents), eur(d.setupCents), d.discountPct ? `${d.discountPct} %` : '—',
          d.status === 'lost' || d.status === 'won' ? (d.lostReason ? LOST.find(([id]) => id === d.lostReason)?.[1] ?? d.lostReason : (d.status === 'won' ? <button key="r" className={button} style={border} onClick={() => setOpen(d)}>Renovar</button> : ''))
            : <span key="a" className="flex gap-1.5 whitespace-nowrap"><button className={button} style={border} onClick={() => setOpen(d)}>Presupuestar</button><button className={button} style={border} onClick={() => setLost(d)}>Perdida</button></span>,
        ])} />
      </Section>

      {lost && (
        <Section title={`Marcar como perdida: ${lost.company}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            <select aria-label="Motivo" className={input} style={border} value={reason} onChange={(e) => setReason(e.target.value)}>{LOST.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
            <input aria-label="Alternativa" className={input} style={border} placeholder="Qué alternativa citaron y a qué precio" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </div>
          <div className="mt-2 flex gap-2">
            <button className={button} style={border} disabled={busy} onClick={() => void act((t) => adminMw.loseDeal(t, lost.id, reason, alt.trim()), 'Guardada.').then((ok) => { if (ok) { setLost(null); setAlt('') } })}>Guardar</button>
            <button className={button} style={border} onClick={() => setLost(null)}>Cancelar</button>
          </div>
        </Section>
      )}
      {open && <QuoteForm key={open.id} deal={open} act={act} busy={busy} token={token} onClose={() => setOpen(null)} />}
    </>
  )
}

function QuoteForm({ deal, act, busy, token, onClose }: { deal: AdminDeal; act: Act; busy: boolean; token: Token; onClose: () => void }) {
  const [tier, setTier] = useState<'starter' | 'growth' | 'enterprise'>(deal.tier === 'growth' || deal.tier === 'enterprise' ? deal.tier : 'starter')
  const [discount, setDiscount] = useState('0')
  const [why, setWhy] = useState<'' | 'multi_year' | 'public_case'>('')
  const [years, setYears] = useState('1')
  const [ws, setWs] = useState(deal.workspaceId ?? '')
  const [reaction, setReaction] = useState<'accepted' | 'objected'>('accepted')
  const [need, setNeed] = useState({ gb_hours_month: '20000', requests_month: '50000000', support_hours_month: '6', onboarding_hours: '28', sales_hours: '12' })
  const [quote, setQuote] = useState<AdminQuote | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const body = () => ({ tier, discount_pct: Number(discount) || 0, discount_reason: why || null, years: Number(years) || 1, ...(tier === 'enterprise' ? { need: Object.fromEntries(Object.entries(need).map(([k, v]) => [k, Number(v) || 0])) } : {}) })
  useEffect(() => {
    let dead = false
    const t = setTimeout(() => { void token().then(async (tk) => {
      if (!tk) return
      const r = await adminMw.quote(tk, body())
      if (dead) return
      setQuote(r.ok ? r.value : null); setProblem(r.ok ? null : r.error)
    }) }, 250)
    return () => { dead = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, discount, why, years, need])
  const sign = (pilot: boolean) => { if (window.confirm(pilot ? `¿Abrir piloto para ${deal.company}?` : `¿Firmar con ${deal.company}? Se crean los cargos y el acceso.`)) void act((t) => adminMw.win(t, deal.id, { ...body(), workspace_id: ws.trim(), reaction, pilot }), pilot ? 'Piloto abierto.' : 'Firmada. Factura los cargos en Cobros.').then((ok) => { if (ok) onClose() }) }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ws.trim())
  return (
    <Section title={`Presupuesto: ${deal.company}`} hint="El sistema rechaza descuentos de más del 15 %, sin motivo, o que bajen Enterprise del 55 % de margen.">
      <div className="grid gap-2 sm:grid-cols-4">
        <select aria-label="Plan" className={input} style={border} value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}><option value="starter">Connect</option><option value="growth">Operations</option><option value="enterprise">Enterprise Twin</option></select>
        <input aria-label="Descuento %" className={input} style={border} inputMode="numeric" placeholder="Descuento %" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ''))} />
        <select aria-label="Motivo del descuento" className={input} style={border} value={why} onChange={(e) => setWhy(e.target.value as typeof why)}><option value="">Sin motivo</option><option value="multi_year">Varios años pagados</option><option value="public_case">Caso publicable</option></select>
        <input aria-label="Años" className={input} style={border} inputMode="numeric" placeholder="Años" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, ''))} />
      </div>
      {tier === 'enterprise' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-5">
          {([['gb_hours_month', 'GB·h al mes'], ['requests_month', 'Peticiones al mes'], ['support_hours_month', 'Soporte h/mes'], ['onboarding_hours', 'Horas de alta'], ['sales_hours', 'Horas de venta']] as const).map(([k, l]) => (
            <label key={k} className="text-[11px]" style={muted}>{l}<input className={input} style={border} inputMode="numeric" value={need[k]} onChange={(e) => setNeed({ ...need, [k]: e.target.value.replace(/\D/g, '') })} /></label>
          ))}
        </div>
      )}
      {problem && <p role="alert" className="mt-3 text-[12px] font-medium">{problem}</p>}
      {quote && (
        <p className="mt-3 text-[13px]">
          <strong>{eur(quote.annual_cents)}</strong> al año + <strong>{eur(quote.setup_cents)}</strong> de alta · primer pago {eur(quote.total_first_payment_cents)}
          {quote.enterprise && <span style={muted}> · límite {new Intl.NumberFormat('es-ES').format(quote.enterprise.quota_gb_hours)} GB·h · coste estimado {new Intl.NumberFormat('es-ES').format(quote.enterprise.cost_year_eur)} €/año</span>}
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input aria-label="Workspace" className={`${input} font-mono`} style={border} placeholder="ID del workspace del cliente" value={ws} onChange={(e) => setWs(e.target.value)} />
        <select aria-label="Reacción al precio" className={input} style={border} value={reaction} onChange={(e) => setReaction(e.target.value as typeof reaction)}><option value="accepted">Aceptó sin objetar</option><option value="objected">Objetó el precio</option></select>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={button} style={border} disabled={busy || !quote || !uuid} onClick={() => sign(false)}>Firmar</button>
        <button className={button} style={border} disabled={busy || !quote || !uuid} onClick={() => sign(true)}>Abrir piloto de 60 días</button>
        <button className={button} style={border} onClick={onClose}>Cerrar</button>
      </div>
    </Section>
  )
}

function Money({ data, act, busy }: { data: AdminMwData; act: Act; busy: boolean }) {
  const [refs, setRefs] = useState<Record<string, string>>({})
  const { charges, to_collect_cents } = data.charges
  const set = (id: string, status: 'invoiced' | 'paid' | 'void', msg: string) => act((t) => adminMw.charge(t, id, status, refs[id]?.trim() || undefined), msg)
  return (
    <Section title={`Por cobrar: ${eur(to_collect_cents)}`} hint="Factura fuera de aquí y anota su número. Solo marcar como pagado amplía el acceso del cliente; sin pago, se para solo.">
      <Table empty="Nada pendiente." head={['Fecha', 'Empresa', 'Concepto', 'Importe', 'Estado', 'N.º factura', '']} rows={charges.map((c) => [
        day(c.createdAt), <span key="w" title={c.workspaceId}>{short(c.workspaceId)}</span>, <span key="d" className="[overflow-wrap:anywhere]">{c.description}</span>,
        <span key="a" className="tabular-nums whitespace-nowrap">{eur(c.amountCents)}</span>, CHARGE[c.status] ?? c.status,
        <input key="r" aria-label={`Factura de ${c.description}`} className={`${input} w-[110px]`} style={border} value={refs[c.id] ?? c.invoiceRef ?? ''} onChange={(e) => setRefs({ ...refs, [c.id]: e.target.value })} />,
        <span key="b" className="flex gap-1.5 whitespace-nowrap">
          {c.status === 'pending' && <button className={button} style={border} disabled={busy} onClick={() => void set(c.id, 'invoiced', 'Marcado como facturado.')}>Facturado</button>}
          <button className={button} style={border} disabled={busy} onClick={() => void set(c.id, 'paid', 'Cobrado.')}>Pagado</button>
          <button className={button} style={border} disabled={busy} onClick={() => { if (window.confirm('¿Anular este cargo?')) void set(c.id, 'void', 'Anulado.') }}>Anular</button>
        </span>,
      ])} />
    </Section>
  )
}

function Margins({ data, hourCost, setHourCost, act, busy }: { data: AdminMwData; hourCost: number; setHourCost: (n: number) => void; act: Act; busy: boolean }) {
  const [draft, setDraft] = useState(String(hourCost))
  const [log, setLog] = useState<{ ws: string; minutes: string; category: string; note: string }>({ ws: '', minutes: '', category: 'sales', note: '' })
  const { customers, floor, below_floor } = data.margins
  return (
    <>
      <Section title="Lo que deja cada cliente" hint={`Cobrado en 12 meses, menos infraestructura estimada y tus horas apuntadas. Suelo: ${Math.round(floor * 100)} %. Una hora sin apuntar no cuenta.`}>
        <label className="flex items-center gap-2 text-[12px] mb-3">Tu hora (€)
          <input className={`${input} w-[72px]`} style={border} inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} onBlur={() => { if (Number(draft) > 0) setHourCost(Number(draft)) }} />
        </label>
        {below_floor > 0 && <p className="mb-2 text-[12px] font-medium">{below_floor} por debajo del suelo.</p>}
        <Table empty="Sin clientes." head={['Empresa', 'Plan', 'Pagado hasta', 'Cobrado', 'Infra.', 'Horas', 'Regaladas', 'Margen']} rows={customers.map((c) => [
          <span key="w" title={c.workspace_id}>{short(c.workspace_id)}</span>, c.tier, day(c.paid_until), `${Math.round(c.revenue_eur)} €`, `${Math.round(c.infra_eur)} €`,
          (c.minutes / 60).toFixed(1), c.absorbed_minutes ? <strong key="g">{(c.absorbed_minutes / 60).toFixed(1)}</strong> : '0',
          <span key="m" style={{ fontWeight: c.below_floor ? 600 : 400, color: c.below_floor ? 'var(--danger, #e5484d)' : undefined }}>{pct(c.margin)}</span>,
        ])} />
      </Section>
      <Section title="Apuntar horas sin petición" hint="Reuniones de venta, alta o revisión.">
        <div className="grid gap-2 sm:grid-cols-4">
          <select aria-label="Cliente" className={input} style={border} value={log.ws} onChange={(e) => setLog({ ...log, ws: e.target.value })}><option value="">Cliente</option>{customers.map((c) => <option key={c.workspace_id} value={c.workspace_id}>{short(c.workspace_id)} · {c.tier}</option>)}</select>
          <select aria-label="Tipo" className={input} style={border} value={log.category} onChange={(e) => setLog({ ...log, category: e.target.value })}><option value="sales">Venta</option><option value="onboarding">Alta</option><option value="review">Revisión</option><option value="support">Soporte</option></select>
          <input aria-label="Minutos" className={input} style={border} inputMode="numeric" placeholder="Minutos" value={log.minutes} onChange={(e) => setLog({ ...log, minutes: e.target.value.replace(/\D/g, '') })} />
          <input aria-label="Nota" className={input} style={border} placeholder="Nota" value={log.note} onChange={(e) => setLog({ ...log, note: e.target.value })} />
        </div>
        <button className={`${button} mt-2`} style={border} disabled={busy || !log.ws || !Number(log.minutes) || log.note.trim().length < 3} onClick={() => void act((t) => adminMw.logTime(t, log.ws, { minutes: Number(log.minutes), category: log.category, note: log.note.trim() }), 'Apuntado.').then((ok) => { if (ok) setLog({ ...log, minutes: '', note: '' }) })}>Apuntar</button>
      </Section>
    </>
  )
}
