// ─── FeedbackAdminView ────────────────────────────────────────────────────────
// /admin/feedback — what registered users asked for, ranked by evidence: what
// they already pay for, who holds the budget, who wants the beta or a call.
// Each request gets a status and an optional reply, which the user sees in
// "Your requests". The Worker is the boundary: GET/PATCH /requests answer 404
// unless the Clerk session belongs to a user id in FEEDBACK_ADMIN_IDS.
//
// Founder-only, so the chrome is in Spanish; the option labels reuse the form's
// translations so both always say the same thing.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import AdminCallsPanel from './AdminCallsPanel'
import {
  REQUEST_FEATURES, REQUEST_STATUSES, SIGNAL_WEIGHTS, hasStrongSignal, listFeatureRequests, requestsToCsv,
  summarizeRequests, updateFeatureRequest,
  type RequestFeature, type RequestStatus, type StoredFeatureRequest, threadOf } from '../../lib/feature-requests'

interface FeedbackAdminViewProps {
  onBack: () => void
  onSignIn: () => void
  theme?: 'dark' | 'light'
}

type State =
  | { phase: 'loading' }
  | { phase: 'signed-out' }
  | { phase: 'denied' }
  | { phase: 'error' }
  | { phase: 'ready'; requests: StoredFeatureRequest[] }

const dtf = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ')

export default function FeedbackAdminView({ onBack, onSignIn, theme = 'dark' }: FeedbackAdminViewProps) {
  const { t } = useTranslation('pro')
  const light = theme === 'light'
  const status = useCloudAccountStore((s) => s.status)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [feature, setFeature] = useState<RequestFeature | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'open' | 'all'>('open')
  const [strongOnly, setStrongOnly] = useState(false)

  const load = useCallback(async () => {
    if (status === 'loading') return
    if (status !== 'signed-in' || !getToken) { setState({ phase: 'signed-out' }); return }
    setState({ phase: 'loading' })
    const token = await getToken()
    if (!token) { setState({ phase: 'signed-out' }); return }
    const res = await listFeatureRequests(token)
    setState(res.ok ? { phase: 'ready', requests: res.requests } : { phase: res.error === 'denied' ? 'denied' : 'error' })
  }, [status, getToken])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (id: string, patch: { status?: RequestStatus; reply?: string }): Promise<boolean> => {
    const token = getToken ? await getToken() : null
    if (!token) return false
    const res = await updateFeatureRequest(token, id, patch)
    if (!res.ok) return false
    setState((s) => s.phase === 'ready'
      ? { ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, ...res.request } : r)) }
      : s)
    return true
  }, [getToken])

  const requests = useMemo(() => (state.phase === 'ready' ? state.requests : []), [state])
  const summary = useMemo(() => summarizeRequests(requests), [requests])
  const shown = useMemo(() => requests.filter((r) =>
    (feature === 'all' || r.feature === feature)
    && (statusFilter === 'all' || (statusFilter === 'open' ? !['shipped', 'declined'].includes(r.status) : r.status === statusFilter))
    && (!strongOnly || hasStrongSignal(r)),
  ), [requests, feature, statusFilter, strongOnly])

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([requestsToCsv(shown)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `peticiones-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const card: CSSProperties = light
    ? { background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(15,17,35,0.08)' }
    : { background: 'rgba(18,19,26,0.6)', borderColor: 'rgba(255,255,255,0.08)' }
  const ghost: CSSProperties = { borderColor: 'var(--border)', color: 'var(--text)' }
  const chrome = `min-h-full w-full ${light ? 'lp-light' : ''}`
  const btn = 'h-9 px-4 rounded-lg text-[12px] font-medium border'
  const pill = (on: boolean): CSSProperties => (on ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : ghost)

  if (state.phase !== 'ready') {
    const msg = state.phase === 'loading' ? 'Cargando…'
      : state.phase === 'signed-out' ? 'Inicia sesión con tu cuenta de administrador.'
      : state.phase === 'denied' ? 'Esta página no existe para tu cuenta.'
      : 'No se han podido cargar las peticiones. Vuelve a intentarlo en un momento.'
    return (
      <div className={`${chrome} grid place-items-center px-4`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="rounded-2xl border p-8 text-center max-w-[380px] flex flex-col items-center gap-4" style={card}>
          <p className="text-[14px]" style={{ color: 'var(--text-dim)' }}>{msg}</p>
          <div className="flex gap-2">
            {state.phase === 'signed-out' && (
              <button onClick={onSignIn} className={btn} style={pill(true)}>Iniciar sesión</button>
            )}
            {state.phase === 'error' && <button onClick={() => void load()} className={btn} style={ghost}>Reintentar</button>}
            {state.phase !== 'loading' && <button onClick={onBack} className={btn} style={ghost}>Volver</button>}
          </div>
        </div>
      </div>
    )
  }

  const users = new Set(requests.map((r) => r.user_id)).size
  // Which entry point brings requests (and which brings buying signals).
  const sources = [...requests.reduce((m, r) => {
    const key = (r.source || 'unknown').split(':')[0]
    const row = m.get(key) ?? { total: 0, strong: 0 }
    row.total++
    if (hasStrongSignal(r)) row.strong++
    return m.set(key, row)
  }, new Map<string, { total: number; strong: number }>())].sort((a, b) => b[1].total - a[1].total)
  const strong = requests.filter(hasStrongSignal).length
  const w = SIGNAL_WEIGHTS

  return (
    <div className={chrome} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-5 py-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[clamp(22px,3vw,30px)] font-semibold tracking-[-0.02em] leading-tight">Peticiones de funciones</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
              {requests.length} peticiones · {users} usuarios · {strong} con señal de compra
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} className={btn} style={ghost}>Actualizar</button>
            <button onClick={downloadCsv} disabled={!shown.length} className={`${btn} disabled:opacity-50`} style={ghost}>CSV</button>
            <button onClick={onBack} className={btn} style={ghost}>Volver</button>
          </div>
        </header>

        <AdminCallsPanel getToken={getToken} card={card} />

        {/* ── Demand by feature, ranked by evidence ─────────────────────── */}
        <section className="rounded-2xl border p-4 sm:p-5 mb-6" style={card}>
          <h2 className="text-[14px] font-semibold mb-1">Demanda por función</h2>
          <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            No preguntamos precio: todo el mundo dice «menos». Se ordena por lo que hacen y a lo que se comprometen.
            Puntos: petición {w.request} · a diario +{w.daily} · ya paga otra herramienta +{w.paid_tool} · paga la empresa +{w.company} · beta +{w.beta} · llamada +{w.call}.
          </p>
          {summary.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Todavía no hay peticiones.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[680px] text-[12px] tabular-nums">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-faint)' }}>
                    <th className="font-medium px-1 py-1.5">Función</th>
                    <th className="font-medium px-1 py-1.5 text-right">Peticiones</th>
                    <th className="font-medium px-1 py-1.5 text-right">Usuarios</th>
                    <th className="font-medium px-1 py-1.5 text-right">A diario</th>
                    <th className="font-medium px-1 py-1.5 text-right">Ya paga otra</th>
                    <th className="font-medium px-1 py-1.5 text-right">Paga empresa</th>
                    <th className="font-medium px-1 py-1.5 text-right">Beta</th>
                    <th className="font-medium px-1 py-1.5 text-right">Llamada</th>
                    <th className="font-medium px-1 py-1.5 text-right">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.feature} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-1 py-2">
                        <button onClick={() => setFeature(row.feature)} className="underline-offset-2 hover:underline text-left">{t(`requests.feature.${row.feature}.title`)}</button>
                      </td>
                      {[row.total, row.users, row.daily, row.paidTool, row.company, row.beta, row.call].map((n, i) => (
                        <td key={i} className="px-1 py-2 text-right" style={{ color: n ? 'var(--text)' : 'var(--text-faint)' }}>{n}</td>
                      ))}
                      <td className="px-1 py-2 text-right font-semibold">{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {sources.length > 0 && (
          <p className="text-[12px] mb-5 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            <span style={{ color: 'var(--text-dim)' }}>Por origen: </span>
            {sources.map(([k, v]) => `${k} ${v.total}${v.strong ? ` (${v.strong} con señal)` : ''}`).join(' · ')}
          </p>
        )}

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {(['all', ...REQUEST_FEATURES] as const).map((f) => (
            <button key={f} onClick={() => setFeature(f)} className="h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors" style={pill(feature === f)}>
              {f === 'all' ? 'Todas' : t(`requests.feature.${f}.title`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {(['open', 'all', ...REQUEST_STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className="h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors" style={pill(statusFilter === s)}>
              {s === 'open' ? 'Abiertas' : s === 'all' ? 'Todos los estados' : t(`requests.status.${s}`)}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={strongOnly} onChange={(e) => setStrongOnly(e.target.checked)} className="accent-[var(--accent)]" />
            Solo con señal de compra
          </label>
        </div>

        {/* ── Requests ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {shown.length === 0 && <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Nada con estos filtros.</p>}
          {shown.map((r) => <RequestCard key={r.id} r={r} card={card} ghost={ghost} onSave={save} />)}
        </div>
      </div>
    </div>
  )
}

function RequestCard({ r, card, ghost, onSave }: {
  r: StoredFeatureRequest
  card: CSSProperties
  ghost: CSSProperties
  onSave: (id: string, patch: { status?: RequestStatus; reply?: string }) => Promise<boolean>
}) {
  const { t } = useTranslation('pro')
  // Each reply is a new message in the thread the user sees (and can answer).
  const [reply, setReply] = useState('')
  const thread = threadOf(r)
  const theyAnswered = thread.slice(-1)[0]?.from === 'user'
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const run = async (patch: { status?: RequestStatus; reply?: string }) => {
    setSaving(true)
    setNote(null)
    const ok = await onSave(r.id, patch)
    setSaving(false)
    if (ok && patch.reply) setReply('')
    setNote(ok ? 'Guardado' : 'No se pudo guardar')
  }

  const signals = [
    r.frequency && t(`requests.frequency.${r.frequency}`),
    r.today && (r.today === 'paid_tool' && r.today_tool ? `${t('requests.today.paid_tool')}: ${r.today_tool}` : t(`requests.today.${r.today}`)),
    r.payer && t(`requests.payer.${r.payer}`),
    r.beta && 'Quiere la beta',
    r.call && 'Acepta llamada',
  ].filter(Boolean) as string[]
  const profile = [r.role && t(`requests.role.${r.role}`), r.team && t(`requests.team.${r.team}`)].filter(Boolean).join(' · ')
  const subject = encodeURIComponent(`Tu petición: ${t(`requests.feature.${r.feature}.title`)}`)

  return (
    <article className="rounded-2xl border p-4 flex flex-col gap-2" style={card}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        <span className="tabular-nums">{dtf(r.created_at)}</span>
        <span className="px-2 py-0.5 rounded-full border text-[12px] font-medium" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>{t(`requests.feature.${r.feature}.title`)}</span>
        {theyAnswered && <span className="font-semibold" style={{ color: 'var(--warn)' }}>Te ha contestado</span>}
        {hasStrongSignal(r) && <span className="font-semibold" style={{ color: 'var(--accent-2)' }}>Señal de compra</span>}
        <span>{r.source || 'unknown'} · {r.plan || 'free'} · {r.lang}</span>
      </div>
      {r.need && <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{r.need}</p>}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s) => <span key={s} className="px-2 py-0.5 rounded-md text-[11px] border" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>{s}</span>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>
        {profile && <span>{profile}</span>}
        {r.email && r.contact_ok ? (
          <a href={`mailto:${r.email}?subject=${subject}`} className="underline underline-offset-2" style={{ color: 'var(--accent-2)' }}>{r.email}</a>
        ) : (
          <span>{r.email ? `${r.email} · no ha pedido que le escribas` : 'sin email'}</span>
        )}
      </div>

      {thread.length > 0 && (
        <ol className="flex flex-col gap-1.5 border-l-2 pl-3 text-[12px] leading-relaxed" style={{ borderColor: 'var(--border-strong)' }}>
          {thread.map((m, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              <span style={{ color: 'var(--text-faint)' }}>{m.from === 'joel' ? 'Tú' : 'Usuario'} · {dtf(m.at)}</span>
              <span className="block">{m.text}</span>
            </li>
          ))}
        </ol>
      )}

      {/* Status + a new message the user sees under "Your requests" */}
      <div className="mt-1 flex flex-col sm:flex-row gap-2 sm:items-start">
        <select
          value={r.status}
          disabled={saving}
          onChange={(e) => void run({ status: e.target.value as RequestStatus })}
          aria-label="Estado"
          className="h-9 rounded-lg border px-2 text-[12px] bg-[var(--surface-2)]"
          style={ghost}
        >
          {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{t(`requests.status.${s}`)}</option>)}
        </select>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value.slice(0, 1000))}
          rows={1}
          placeholder={thread.length ? 'Responder (lo verá en «Tus peticiones» y podrá contestarte)' : 'Respuesta que verá el usuario (opcional)'}
          className="flex-1 min-h-[36px] rounded-lg border px-3 py-2 text-[12px] bg-[var(--surface-2)] resize-y"
          style={ghost}
        />
        <button
          onClick={() => void run({ reply })}
          disabled={saving || !reply.trim()}
          className="h-9 px-3 rounded-lg text-[12px] font-medium border disabled:opacity-50"
          style={ghost}
        >
          {saving ? 'Guardando…' : 'Enviar respuesta'}
        </button>
      </div>
      {note && <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{note}</span>}
    </article>
  )
}
