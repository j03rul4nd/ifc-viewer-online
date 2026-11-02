// ─── AdminFinance ─────────────────────────────────────────────────────────────
// Are we doing well, and how much can we spend? Cash, runway, what tax and the
// reserve already own, and what is free for features, compute and ads. Internal,
// Spanish only. Figures come from what is entered; plan income is an estimate
// until Stripe payments are recorded, and the screen says so.

import { useCallback, useEffect, useState } from 'react'
import { adminFin, type FinanceReport, type CommitResult } from '../../lib/cloud/admin-finance-client'

const nf = new Intl.NumberFormat('es-ES')
const eur = (c: number | null | undefined): string => (c === null || c === undefined ? '—' : `${nf.format(Math.round(c / 100))} €`)
const toCents = (s: string): number => Math.round((Number(s.replace(',', '.')) || 0) * 100)
const pct = (v: number | null): string => (v === null ? '—' : `${Math.round(v * 100)} %`)

const CATEGORY: Record<string, string> = { infra: 'Infraestructura', ads: 'Publicidad', tools: 'Herramientas', legal: 'Legal', services: 'Servicios', salary: 'Sueldo', tax: 'Impuestos', other: 'Otros', income: 'Ingreso', subscriptions: 'Suscripciones (estimado)', middleware: 'Middleware' }
const SIGNAL: Record<string, (r: FinanceReport) => string> = {
  no_cash: () => 'Falta el saldo del banco: sin él no hay pista ni caja libre.',
  spending_without_revenue: () => 'Hay gastos y ningún ingreso: la regla es gasto 0 hasta tener clientes de pago.',
  runway: (r) => `Pista: ${r.cash.runway_months} meses al ritmo actual.`,
  cash_positive: (r) => `Caja positiva: entran ${eur(r.cash.net_avg)} más de los que salen cada mes.`,
  cash_negative: (r) => `Caja negativa: salen ${eur(-r.cash.net_avg)} más de los que entran cada mes.`,
  gross_margin: (r) => `Margen bruto del año: ${pct(r.year.gross_margin)}.`,
}
const LEVEL = { ok: { label: 'Vamos bien', color: 'var(--ok, #30a46c)' }, warn: { label: 'Atención', color: 'var(--warn, #f5a524)' }, bad: { label: 'Mal', color: 'var(--danger, #e5484d)' } }

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

function Figures({ items }: { items: [string, React.ReactNode, string?][] }) {
  return (
    <dl className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      {items.map(([k, v, note]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px]" style={muted}>{k}</dt>
          <dd className="text-[17px] font-semibold tabular-nums">{v}</dd>
          {note && <p className="text-[11px]" style={muted}>{note}</p>}
        </div>
      ))}
    </dl>
  )
}

export default function AdminFinance({ token }: { token: () => Promise<string | null> }) {
  const [r, setR] = useState<FinanceReport | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const t = await token()
    if (!t) { setNotice('Sin sesión.'); return }
    const x = await adminFin.load(t, 12)
    if (x.ok) setR(x.value); else setNotice(x.error)
  }, [token])
  useEffect(() => { void load() }, [load])

  const act = useCallback(async (fn: (t: string) => Promise<{ ok: boolean; error?: string }>, done: string): Promise<boolean> => {
    const t = await token()
    if (!t) return false
    setBusy(true)
    const x = await fn(t)
    setBusy(false)
    setNotice(x.ok ? done : x.error ?? 'Ha fallado.')
    if (x.ok) await load()
    return x.ok
  }, [token, load])

  if (!r) return <p className="text-[12px]" style={muted}>{notice ?? 'Cargando…'}</p>
  const level = LEVEL[r.status]
  const max = Math.max(1, ...r.months.flatMap((m) => [m.income, m.expense]))

  return (
    <div>
      {notice && <p role="status" className="mb-3 text-[12px]" style={muted}>{notice}</p>}

      <Section title="¿Vamos bien?">
        <p className="text-[15px] font-semibold" style={{ color: level.color }}>{level.label}</p>
        <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
          {r.signals.map((s) => <li key={s.text} className="flex gap-2"><span aria-hidden style={{ color: LEVEL[s.level].color }}>●</span>{SIGNAL[s.text]?.(r) ?? s.text}</li>)}
        </ul>
      </Section>

      <Section title="Caja" hint={r.cash.at ? `Desde el saldo del ${r.cash.at.slice(0, 10)}, más lo apuntado después.` : 'Apunta el saldo del banco para empezar.'}>
        <Figures items={[
          ['Saldo', eur(r.cash.balance)],
          ['Gasto al mes', eur(r.cash.burn), 'media de 3 meses'],
          ['Flujo neto al mes', <span key="n" style={{ color: r.cash.net_avg >= 0 ? LEVEL.ok.color : LEVEL.bad.color }}>{eur(r.cash.net_avg)}</span>, r.cash.net_avg >= 0 ? 'caja positiva' : 'caja negativa'],
          ['Pista', r.cash.runway_months === null ? (r.cash.balance === null ? '—' : 'Sin límite') : `${r.cash.runway_months} meses`],
        ]} />
        <CashForm busy={busy} onSave={(b, at) => act((t) => adminFin.cash(t, b, at), 'Saldo guardado.')} />
      </Section>

      <Section title="Últimos 12 meses" hint={`Las suscripciones son una estimación a precio de lista de los planes activos (${r.subscriptions.paying} de pago, ${eur(r.subscriptions.mrr_estimate)} al mes), hasta registrar los pagos de Stripe.`}>
        <Figures items={[['Ingresos', eur(r.year.revenue)], ['Gastos', eur(r.year.cost)], ['Beneficio', eur(r.year.profit)], ['Margen bruto', pct(r.year.gross_margin), 'ingresos menos infraestructura']]} />
        <div className="mt-4 flex flex-col gap-1.5" role="list" aria-label="Meses">
          {r.months.map((m) => (
            <div key={m.month} role="listitem" className="grid grid-cols-[56px_1fr_84px] items-center gap-2 text-[11.5px]">
              <span className="tabular-nums" style={muted}>{m.month}</span>
              <span className="flex flex-col gap-0.5" aria-label={`Ingresos ${eur(m.income)}, gastos ${eur(m.expense)}`}>
                <span className="h-1.5 rounded-full" style={{ width: `${(m.income / max) * 100}%`, minWidth: m.income ? 2 : 0, background: LEVEL.ok.color }} />
                <span className="h-1.5 rounded-full" style={{ width: `${(m.expense / max) * 100}%`, minWidth: m.expense ? 2 : 0, background: LEVEL.bad.color }} />
              </span>
              <span className="text-right tabular-nums" style={{ color: m.net >= 0 ? undefined : LEVEL.bad.color }}>{eur(m.net)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px]" style={muted}>Verde: ingresos. Rojo: gastos. A la derecha, el neto.</p>
      </Section>

      <Section title="Lo que ya no es tuyo" hint="Antes de reinvertir: impuestos del beneficio del año, meses de reserva y deuda.">
        <Figures items={[['Impuestos', eur(r.reserves.tax), `${r.policy.taxPct} % del beneficio`], ['Reserva', eur(r.reserves.safety), `${r.policy.reserveMonths} meses de gasto`], ['Deuda', eur(r.reserves.debt)], ['Caja libre', <strong key="f">{eur(r.free_cash)}</strong>]]} />
      </Section>

      <Section title="Para reinvertir" hint="La caja libre, repartida según tu política. Si no hay ingresos, no hay nada que repartir.">
        <Figures items={[['Funciones de pago', eur(r.reinvest.features), `${r.policy.featuresPct} %`], ['Publicidad', eur(r.reinvest.ads), `${r.policy.adsPct} %`], ['Cómputo y servicios', eur(r.reinvest.compute), `${r.policy.computePct} %`], ['Se queda en caja', eur(r.reinvest.kept)]]} />
        <PolicyForm r={r} busy={busy} onSave={(p) => act((t) => adminFin.policy(t, p), 'Política guardada.')} />
      </Section>

      <Section title="Publicidad (Meta y otras)" hint={`Gasta en captar solo lo que el cliente devuelve. Abandono mensual usado: ${pct(r.ads.churn_monthly)}${r.subscriptions.churned_90d ? '' : ', mínimo supuesto mientras no haya datos'}.`}>
        <Figures items={[['Ingreso medio por cliente', eur(r.ads.arpa), 'al mes'], ['Valor de un cliente', eur(r.ads.ltv), 'en su vida'], ['Coste máximo por cliente', eur(r.ads.max_cac), 'un tercio de su valor'], ['Clientes que puedes captar', nf.format(r.ads.customers_affordable), 'con el presupuesto de publicidad']]} />
      </Section>

      <Section title="Financiación" hint="Pide prestado solo contra ingresos recurrentes: como mucho tres meses de ellos.">
        <Figures items={[['Línea de crédito', eur(r.financing.credit_line)], ['Deuda', eur(r.financing.debt)], ['Margen prudente', eur(r.financing.prudent_headroom)], ['Apalancamiento', r.financing.leverage === null ? '—' : `${nf.format(r.financing.leverage)}×`, 'deuda / ingresos de un año']]} />
      </Section>

      <Commitment freeCash={r.free_cash} token={token} />

      <Section title="Movimientos" hint="Lo que no sale solo del sistema: gastos, ingresos fuera de Stripe, costes recurrentes. Cada cambio queda en la auditoría.">
        <EntryForm busy={busy} onSave={(b) => act((t) => adminFin.addEntry(t, b), 'Apuntado.')} />
        {r.entries.length === 0 ? <p className="mt-3 text-[12px]" style={muted}>Sin movimientos.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead><tr className="text-left" style={muted}>{['Mes', 'Tipo', 'Concepto', 'Importe', ''].map((h) => <th key={h} scope="col" className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{r.entries.map((e) => (
                <tr key={e.id} className="border-t" style={border}>
                  <td className="py-2 pr-3 tabular-nums">{e.month}{e.recurring ? ` → ${e.until_month ?? 'cada mes'}` : ''}</td>
                  <td className="py-2 pr-3">{CATEGORY[e.category] ?? e.category}</td>
                  <td className="py-2 pr-3 [overflow-wrap:anywhere]">{e.description}</td>
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap" style={{ color: e.kind === 'income' ? LEVEL.ok.color : undefined }}>{e.kind === 'income' ? '+' : '−'}{eur(e.amount_cents)}</td>
                  <td className="py-2"><button className={button} style={border} disabled={busy} onClick={() => { if (window.confirm('¿Borrar este movimiento?')) void act((t) => adminFin.deleteEntry(t, e.id), 'Borrado.') }}>Borrar</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function CashForm({ busy, onSave }: { busy: boolean; onSave: (balanceCents: number, at: string) => Promise<boolean> }) {
  const [amount, setAmount] = useState('')
  const [at, setAt] = useState(new Date().toISOString().slice(0, 10))
  return (
    <form className="mt-3 flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void onSave(toCents(amount), at).then((ok) => { if (ok) setAmount('') }) }}>
      <label className="text-[11px] flex-1 min-w-[140px]" style={muted}>Saldo del banco (€)<input className={input} style={border} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="text-[11px]" style={muted}>Fecha<input type="date" className={input} style={border} value={at} onChange={(e) => setAt(e.target.value)} /></label>
      <button className={button} style={border} disabled={busy || !amount.trim()}>Guardar saldo</button>
    </form>
  )
}

function PolicyForm({ r, busy, onSave }: { r: FinanceReport; busy: boolean; onSave: (p: Record<string, number>) => Promise<boolean> }) {
  const p = r.policy
  const [v, setV] = useState({ reserve_months: String(p.reserveMonths), tax_pct: String(p.taxPct), features_pct: String(p.featuresPct), ads_pct: String(p.adsPct), compute_pct: String(p.computePct), credit: String(p.creditLineCents / 100), debt: String(p.debtCents / 100) })
  const split = Number(v.features_pct) + Number(v.ads_pct) + Number(v.compute_pct)
  const fields: [keyof typeof v, string][] = [['reserve_months', 'Meses de reserva'], ['tax_pct', 'Impuestos %'], ['features_pct', 'Funciones %'], ['ads_pct', 'Publicidad %'], ['compute_pct', 'Cómputo %'], ['credit', 'Línea de crédito (€)'], ['debt', 'Deuda (€)']]
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[12px]">Cambiar la política</summary>
      <div className="mt-2 grid gap-2 grid-cols-2 sm:grid-cols-4">
        {fields.map(([k, l]) => <label key={k} className="text-[11px]" style={muted}>{l}<input className={input} style={border} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.,]/g, '') })} /></label>)}
      </div>
      {split > 100 && <p role="alert" className="mt-2 text-[12px]">El reparto pasa del 100 %.</p>}
      <button className={`${button} mt-2`} style={border} disabled={busy || split > 100} onClick={() => void onSave({ reserve_months: Number(v.reserve_months) || 0, tax_pct: Number(v.tax_pct) || 0, features_pct: Number(v.features_pct) || 0, ads_pct: Number(v.ads_pct) || 0, compute_pct: Number(v.compute_pct) || 0, credit_line_cents: toCents(v.credit), debt_cents: toCents(v.debt) })}>Guardar política</button>
    </details>
  )
}

const KINDS: [string, string, 'income' | 'expense'][] = [['infra', 'Infraestructura', 'expense'], ['ads', 'Publicidad', 'expense'], ['tools', 'Herramientas', 'expense'], ['services', 'Servicios', 'expense'], ['legal', 'Legal', 'expense'], ['salary', 'Sueldo', 'expense'], ['tax', 'Impuestos', 'expense'], ['other', 'Otros gastos', 'expense'], ['income', 'Ingreso', 'income']]

function EntryForm({ busy, onSave }: { busy: boolean; onSave: (b: object) => Promise<boolean> }) {
  const [cat, setCat] = useState('infra')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [recurring, setRecurring] = useState(false)
  const kind = KINDS.find(([id]) => id === cat)![2]
  return (
    <form className="grid gap-2 grid-cols-2 sm:grid-cols-6 items-end" onSubmit={(e) => { e.preventDefault(); void onSave({ kind, category: cat, description: desc.trim(), amount_cents: toCents(amount), month, recurring }).then((ok) => { if (ok) { setDesc(''); setAmount('') } }) }}>
      <label className="text-[11px]" style={muted}>Tipo<select className={input} style={border} value={cat} onChange={(e) => setCat(e.target.value)}>{KINDS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
      <label className="text-[11px] col-span-2" style={muted}>Concepto<input className={input} style={border} placeholder="Neon, Meta Ads, abogado…" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      <label className="text-[11px]" style={muted}>Importe (€)<input className={input} style={border} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="text-[11px]" style={muted}>Mes<input type="month" className={input} style={border} value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      <label className="flex items-center gap-1.5 text-[12px] h-8"><input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />Cada mes</label>
      <button className={`${button} col-span-2 sm:col-span-1`} style={border} disabled={busy || desc.trim().length < 2 || !(toCents(amount) > 0)}>Apuntar</button>
    </form>
  )
}

/** A bulk purchase of compute or services: a saving only above its break-even use, and only if the cash covers it. */
function Commitment({ freeCash, token }: { freeCash: number | null; token: () => Promise<string | null> }) {
  const [v, setV] = useState({ onDemand: '', committed: '', term: '12', use: '80', upfront: '0' })
  const [res, setRes] = useState<CommitResult | null>(null)
  const ready = toCents(v.onDemand) > 0 && toCents(v.committed) > 0
  useEffect(() => {
    if (!ready) { setRes(null); return }
    const timer = setTimeout(() => { void token().then(async (t) => {
      if (!t) return
      const x = await adminFin.commitment(t, { on_demand_monthly_cents: toCents(v.onDemand), committed_monthly_cents: toCents(v.committed), term_months: Number(v.term) || 1, expected_use_pct: Number(v.use) || 0, upfront_cents: toCents(v.upfront), free_cash_cents: freeCash })
      if (x.ok) setRes(x.value)
    }) }, 250)
    return () => clearTimeout(timer)
  }, [v, ready, freeCash, token])
  const VERDICT = { buy: 'Compensa y la caja lo cubre.', wait_for_cash: 'Compensa, pero la caja libre no cubre el compromiso: espera.', skip: 'No compensa con ese uso.' }
  const fields: [keyof typeof v, string][] = [['onDemand', 'Coste al mes sin compromiso (€)'], ['committed', 'Precio al mes comprometido (€)'], ['term', 'Meses de compromiso'], ['use', 'Uso esperado %'], ['upfront', 'Pago inicial (€)']]
  return (
    <Section title="Compras al por mayor" hint="Reservas de cómputo, planes anuales, créditos prepago: ¿compensa comprometerse?">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
        {fields.map(([k, l]) => <label key={k} className="text-[11px]" style={muted}>{l}<input className={input} style={border} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.,]/g, '') })} /></label>)}
      </div>
      {res && (
        <div className="mt-3 text-[12.5px]">
          <p className="font-semibold">{VERDICT[res.verdict]}</p>
          <p style={muted}>Ahorro en el plazo: {eur(res.saving_over_term)} · compromiso total: {eur(res.total_commitment)} · compensa con un uso de al menos {res.break_even_use_pct ?? '—'} %.</p>
        </div>
      )}
    </Section>
  )
}
