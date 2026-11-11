// ─── AdminCallsPanel ──────────────────────────────────────────────────────────
// Inside /admin/feedback: the calls people booked on /call, and the hours on
// offer. Founder-only, so it is in Spanish. Hours are kept in the Worker's KV,
// so changing them needs no deploy.

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { loadAdminCalls, saveBookingConfig, type AdminCall, type BookingConfig } from '../../lib/booking'

interface Props {
  getToken: (() => Promise<string | null>) | null
  card: CSSProperties
}

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function AdminCallsPanel({ getToken, card }: Props) {
  const [calls, setCalls] = useState<AdminCall[] | null>(null)
  const [cfg, setCfg] = useState<BookingConfig | null>(null)
  const [mail, setMail] = useState(false)
  const [times, setTimes] = useState('')
  const [blocked, setBlocked] = useState('')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')

  const load = useCallback(async () => {
    const token = getToken ? await getToken() : null
    if (!token) return
    const res = await loadAdminCalls(token)
    if (!res.ok) { setCalls([]); return }
    setCalls(res.calls)
    setCfg(res.config)
    setMail(res.mail)
    setTimes(res.config.times.join(', '))
    setBlocked(res.config.blocked.join(', '))
  }, [getToken])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!cfg || !getToken) return
    setSaved('saving')
    const token = await getToken()
    const res = token ? await saveBookingConfig(token, {
      ...cfg,
      times: times.split(/[\s,]+/).filter(Boolean),
      blocked: blocked.split(/[\s,]+/).filter(Boolean),
    }) : { ok: false as const }
    if (res.ok) {
      setCfg(res.config)
      setTimes(res.config.times.join(', '))
      setBlocked(res.config.blocked.join(', '))
      setSaved('ok')
    } else setSaved('error')
  }

  const madrid = (iso: string) => new Date(iso).toLocaleString('es-ES', { timeZone: cfg?.tz || 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const input = 'h-9 px-2 rounded-lg border border-[var(--border-control)] bg-transparent text-[12px]'
  const border = { borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <section className="rounded-2xl border p-4 sm:p-5 mb-6" style={card}>
      <h2 className="text-[14px] font-semibold mb-1">Llamadas</h2>
      <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        Las reservan en /call quienes marcaron la llamada. {mail
          ? 'El correo de confirmación sale por Resend.'
          : 'Sin remitente configurado (BOOKING_FROM): no sale correo; el usuario se lleva el .ics y el enlace.'}
      </p>

      {calls === null ? (
        <p className="text-[13px]" style={{ color: 'var(--text-dim)' }}>Cargando…</p>
      ) : calls.length === 0 ? (
        <p className="text-[13px] mb-4" style={{ color: 'var(--text-dim)' }}>No hay llamadas reservadas.</p>
      ) : (
        <ul className="mb-5 flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
          {calls.map((c) => (
            <li key={c.slot} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]" style={{ borderColor: 'var(--border)' }}>
              <span className="font-medium tabular-nums capitalize">{madrid(c.slot)}</span>
              <a href={`mailto:${c.email}`} className="underline underline-offset-2" style={{ color: 'var(--accent-2)' }}>{c.email}</a>
              <a href={c.meet_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: 'var(--accent-2)' }}>Entrar</a>
              <span style={{ color: 'var(--text-faint)' }}>{c.lang} · {c.user_tz}{c.request_id ? ' · con petición' : ''}</span>
              {c.note && <p className="w-full text-[12px]" style={{ color: 'var(--text-dim)' }}>{c.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {cfg && (
        <div className="flex flex-col gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] w-20" style={{ color: 'var(--text-dim)' }}>Días</span>
            {ORDER.map((d) => {
              const on = cfg.days.includes(d)
              return (
                <button key={d} type="button" aria-pressed={on}
                  onClick={() => { setSaved('idle'); setCfg({ ...cfg, days: on ? cfg.days.filter((x) => x !== d) : [...cfg.days, d] }) }}
                  className="h-8 px-2.5 rounded-lg text-[12px] border"
                  style={on ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : border}>
                  {DAYS[d]}
                </button>
              )
            })}
          </div>
          <label className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] w-20" style={{ color: 'var(--text-dim)' }}>Horas</span>
            <input value={times} onChange={(e) => { setSaved('idle'); setTimes(e.target.value) }} className={`${input} flex-1 min-w-[200px]`} style={border} placeholder="16:00, 16:30" />
          </label>
          <label className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] w-20" style={{ color: 'var(--text-dim)' }}>Duración</span>
            <select value={cfg.duration} onChange={(e) => { setSaved('idle'); setCfg({ ...cfg, duration: Number(e.target.value) }) }} className={input} style={border}>
              {[15, 20, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
            <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Zona {cfg.tz}</span>
          </label>
          <label className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] w-20" style={{ color: 'var(--text-dim)' }}>Sin llamadas</span>
            <input value={blocked} onChange={(e) => { setSaved('idle'); setBlocked(e.target.value) }} className={`${input} flex-1 min-w-[200px]`} style={border} placeholder="2026-12-24, 2026-12-31" />
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saved === 'saving'} className="h-9 px-4 rounded-lg text-[12px] font-medium border disabled:opacity-50"
              style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
              Guardar horario
            </button>
            <span className="text-[12px]" style={{ color: saved === 'error' ? 'var(--warn)' : 'var(--text-faint)' }}>
              {saved === 'ok' ? 'Guardado.' : saved === 'error' ? 'No se ha podido guardar.' : 'Se ofrecen las dos próximas semanas, con 12 h de margen.'}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
