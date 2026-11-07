// ─── FeedbackAdminView ────────────────────────────────────────────────────────
// /admin/feedback — what registered users asked for, and what they would pay.
// The Worker is the boundary: GET /requests answers 404 unless the Clerk
// session belongs to a user id in FEEDBACK_ADMIN_IDS. Independent of /admin,
// whose console needs the (still dark) cloud API.
//
// Founder-only, so the chrome is in Spanish; area and pay labels reuse the
// form's translations so both always say the same thing.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import {
  listFeatureRequests, requestsToCsv, summarizeRequests, REQUEST_AREAS, REQUEST_PAY,
  type RequestArea, type StoredFeatureRequest,
} from '../../lib/feature-requests'

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
  const [area, setArea] = useState<RequestArea | 'all'>('all')
  const [payingOnly, setPayingOnly] = useState(false)

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

  const requests = state.phase === 'ready' ? state.requests : []
  const summary = useMemo(() => summarizeRequests(requests), [requests])
  const shown = useMemo(
    () => requests.filter((r) => (area === 'all' || r.area === area) && (!payingOnly || r.pay !== 'no')),
    [requests, area, payingOnly],
  )

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([requestsToCsv(shown)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `feature-requests-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const card: CSSProperties = light
    ? { background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(15,17,35,0.08)' }
    : { background: 'rgba(18,19,26,0.6)', borderColor: 'rgba(255,255,255,0.08)' }
  const ghost: CSSProperties = { borderColor: 'var(--border)', color: 'var(--text)' }
  const chrome = `min-h-full w-full ${light ? 'lp-light' : ''}`
  const btn = 'h-9 px-4 rounded-lg text-[12px] font-medium border'

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
              <button onClick={onSignIn} className={btn} style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>Iniciar sesión</button>
            )}
            {state.phase === 'error' && <button onClick={() => void load()} className={btn} style={ghost}>Reintentar</button>}
            {state.phase !== 'loading' && <button onClick={onBack} className={btn} style={ghost}>Volver</button>}
          </div>
        </div>
      </div>
    )
  }

  const payers = requests.filter((r) => r.pay !== 'no').length

  return (
    <div className={chrome} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-5 py-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[clamp(22px,3vw,30px)] font-semibold tracking-[-0.02em] leading-tight">Peticiones de funciones</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
              {requests.length} peticiones · {payers} pagarían · {new Set(requests.map((r) => r.user_id)).size} usuarios
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} className={btn} style={ghost}>Actualizar</button>
            <button onClick={downloadCsv} disabled={!shown.length} className={`${btn} disabled:opacity-50`} style={ghost}>CSV</button>
            <button onClick={onBack} className={btn} style={ghost}>Volver</button>
          </div>
        </header>

        {/* ── Where the money is: areas ranked by what users would pay ───── */}
        <section className="rounded-2xl border p-4 sm:p-5 mb-6" style={card}>
          <h2 className="text-[14px] font-semibold mb-1">Necesidades por área</h2>
          <p className="text-[12px] mb-4" style={{ color: 'var(--text-faint)' }}>
            Ordenadas por dinero detrás: cada respuesta suma lo que dijo que pagaría al mes (más de 50 € cuenta como 100).
          </p>
          {summary.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Todavía no hay peticiones.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[620px] text-[12px] tabular-nums">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-faint)' }}>
                    <th className="font-medium px-1 py-1.5">Área</th>
                    <th className="font-medium px-1 py-1.5 text-right">Total</th>
                    <th className="font-medium px-1 py-1.5 text-right">Pagarían</th>
                    <th className="font-medium px-1 py-1.5 text-right">A diario</th>
                    {REQUEST_PAY.map((p) => <th key={p} className="font-medium px-1 py-1.5 text-right">{t(`requests.pay.${p}`)}</th>)}
                    <th className="font-medium px-1 py-1.5 text-right">€/mes</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.area} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-1 py-2">
                        <button onClick={() => setArea(row.area)} className="underline-offset-2 hover:underline text-left">{t(`requests.area.${row.area}`)}</button>
                      </td>
                      <td className="px-1 py-2 text-right">{row.total}</td>
                      <td className="px-1 py-2 text-right">{row.wouldPay}</td>
                      <td className="px-1 py-2 text-right">{row.daily}</td>
                      {REQUEST_PAY.map((p) => <td key={p} className="px-1 py-2 text-right" style={{ color: row.pay[p] ? 'var(--text)' : 'var(--text-faint)' }}>{row.pay[p]}</td>)}
                      <td className="px-1 py-2 text-right font-semibold">{row.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {(['all', ...REQUEST_AREAS] as const).map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className="h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors"
              style={area === a ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : ghost}
            >{a === 'all' ? 'Todas' : t(`requests.area.${a}`)}</button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={payingOnly} onChange={(e) => setPayingOnly(e.target.checked)} className="accent-[var(--accent)]" />
            Solo quien pagaría
          </label>
        </div>

        {/* ── Requests ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {shown.length === 0 && <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Nada con estos filtros.</p>}
          {shown.map((r) => (
            <article key={r.id} className="rounded-2xl border p-4" style={card}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mb-2" style={{ color: 'var(--text-faint)' }}>
                <span className="tabular-nums">{dtf(r.created_at)}</span>
                <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--border)' }}>{t(`requests.area.${r.area}`)}</span>
                <span>{t(`requests.frequency.${r.frequency}`)}</span>
                <span className="font-semibold" style={{ color: r.pay === 'no' ? 'var(--text-faint)' : 'var(--accent-2)' }}>{t(`requests.pay.${r.pay}`)}</span>
                <span>{r.plan || 'free'} · {r.lang}</span>
              </div>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{r.need}</p>
              {r.workaround && (
                <p className="mt-2 text-[12px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-dim)' }}>
                  <span style={{ color: 'var(--text-faint)' }}>Hoy lo resuelve con: </span>{r.workaround}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
                {r.email && r.contact_ok ? (
                  <a href={`mailto:${r.email}?subject=${encodeURIComponent('Tu petición en IFC Viewer Online')}`} className="underline underline-offset-2" style={{ color: 'var(--accent-2)' }}>{r.email}</a>
                ) : (
                  <span style={{ color: 'var(--text-faint)' }}>{r.email ? `${r.email} · no quiere que le escribas` : 'sin email'}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
