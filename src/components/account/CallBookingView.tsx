// ─── CallBookingView ──────────────────────────────────────────────────────────
// /call — pick a time for a short video call with Joel about your request. Our
// own page instead of a paid scheduler: hours, slots and bookings live in the
// Worker's KV (/api/booking), the call is a Jitsi room, and the user always
// leaves with an .ics and calendar links, whether or not mail is configured.
// Its own route, so it never shows inside an embed or client mode.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import {
  bookSlot, bookingIcs, cancelBooking, googleCalendarUrl, groupByDay, loadSlots, localZone, outlookCalendarUrl,
  type Booking, type BookingError,
} from '../../lib/booking'
import { trackFeatureRequestStep } from '../../lib/analytics'

interface CallBookingViewProps {
  onBack: () => void
  onSignIn: () => void
  theme?: 'dark' | 'light'
}

type State =
  | { phase: 'loading' }
  | { phase: 'signed-out' }
  | { phase: 'error' }
  | { phase: 'pick'; slots: string[]; duration: number }
  | { phase: 'booked'; booking: Booking; mailed: boolean | null }

const MAIL = 'hola@ifcvieweronline.eu'

export default function CallBookingView({ onBack, onSignIn, theme = 'dark' }: CallBookingViewProps) {
  const { t, i18n } = useTranslation('pro')
  const status = useCloudAccountStore((s) => s.status)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const accountEmail = useCloudAccountStore((s) => s.email)
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [day, setDay] = useState<string>('')
  const [slot, setSlot] = useState<string>('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<BookingError | null>(null)
  const tz = useMemo(localZone, [])
  const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2)
  const requestId = useMemo(() => new URLSearchParams(window.location.search).get('r') ?? '', [])
  const title = t('call.eventTitle')

  const load = useCallback(async () => {
    if (status === 'loading') return
    if (status !== 'signed-in' || !getToken) { setState({ phase: 'signed-out' }); return }
    const token = await getToken()
    if (!token) { setState({ phase: 'signed-out' }); return }
    const res = await loadSlots(token)
    if (!res.ok) { setState({ phase: res.error === 'unauthorized' ? 'signed-out' : 'error' }); return }
    if (res.booking) { setState({ phase: 'booked', booking: res.booking, mailed: null }); return }
    setState({ phase: 'pick', slots: res.slots, duration: res.duration })
  }, [status, getToken])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (accountEmail && !email) setEmail(accountEmail) }, [accountEmail, email])

  const days = useMemo(() => (state.phase === 'pick' ? groupByDay(state.slots, tz) : []), [state, tz])
  useEffect(() => {
    if (days.length && !days.some((d) => d.day === day)) { setDay(days[0].day); setSlot('') }
  }, [days, day])

  const fmtDay = (d: string, style: 'short' | 'long') => new Intl.DateTimeFormat(i18n.language, style === 'short'
    ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }
    : { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
  const fmtTime = (iso: string) => new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso))
  const fmtWhen = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeStyle: 'short', timeZone: tz }).format(new Date(iso))

  const confirm = async () => {
    if (!slot || !getToken || busy) return
    setBusy(true); setError(null)
    const token = await getToken()
    if (!token) { setBusy(false); setState({ phase: 'signed-out' }); return }
    const res = await bookSlot(token, { slot, email: email.trim(), note: note.trim(), request_id: requestId, tz, lang })
    setBusy(false)
    if (res.ok) {
      trackFeatureRequestStep({ step: 'call_booked' })
      setState({ phase: 'booked', booking: res.booking, mailed: res.mailed })
      return
    }
    setError(res.error)
    if (res.error === 'slot_gone') { setSlot(''); void load() }
  }

  const cancel = async () => {
    if (!getToken || busy) return
    setBusy(true)
    const token = await getToken()
    const ok = token ? await cancelBooking(token) : false
    setBusy(false)
    if (ok) { trackFeatureRequestStep({ step: 'call_cancelled' }); setSlot(''); setState({ phase: 'loading' }); void load() }
    else setError('unavailable')
  }

  const downloadIcs = (b: Booking) => {
    const url = URL.createObjectURL(new Blob([bookingIcs(b, title)], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'call-ifc-viewer.ics'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const chip = (on: boolean) => `min-h-[40px] px-3 rounded-[8px] border text-[13px] tabular-nums transition-colors cursor-pointer ${on
    ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--text)]'
    : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--text-faint)] hover:text-[var(--text)]'}`
  const primary = 'min-h-[40px] px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium disabled:opacity-50 cursor-pointer disabled:cursor-default'
  const ghost = 'min-h-[36px] px-3 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text)] hover:border-[var(--text-faint)] cursor-pointer inline-flex items-center'
  const duration = state.phase === 'pick' ? state.duration : state.phase === 'booked' ? state.booking.duration : 15

  return (
    <div className={`min-h-full w-full ${theme === 'light' ? 'lp-light' : ''}`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <main className="mx-auto w-full max-w-[600px] px-4 sm:px-6 py-10 sm:py-16">
        <button type="button" onClick={onBack} className="text-[12px] text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer">← {t('call.back')}</button>

        <h1 className="mt-6 text-[clamp(24px,4vw,32px)] font-semibold tracking-[-0.02em] leading-tight">
          {t('call.title', { minutes: duration })}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-dim)]">{t('call.intro')}</p>
        <ul className="mt-4 flex flex-col gap-1.5 text-[14px] text-[var(--text-dim)]">
          <li>· {t('call.point1')}</li>
          <li>· {t('call.point2')}</li>
          <li>· {t('call.point3')}</li>
        </ul>

        <section className="mt-8 border-t border-[var(--border)] pt-6" aria-live="polite">
          {state.phase === 'loading' && (
            <div className="flex flex-col gap-3" aria-label={t('requests.loading')}>
              <div className="h-10 w-2/3 rounded-[8px] bg-[var(--border)] animate-pulse" />
              <div className="h-10 w-full rounded-[8px] bg-[var(--border)] animate-pulse" />
            </div>
          )}

          {state.phase === 'signed-out' && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[14px] text-[var(--text-dim)]">{t('call.signin')}</p>
              <button type="button" onClick={onSignIn} className={primary}>{t('call.signinCta')}</button>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[14px] text-[var(--text-dim)]">{t('call.loadError')}</p>
              <button type="button" onClick={() => { setState({ phase: 'loading' }); void load() }} className={ghost}>{t('call.retry')}</button>
            </div>
          )}

          {state.phase === 'pick' && days.length === 0 && (
            <p className="text-[14px] text-[var(--text-dim)]">
              {t('call.noSlots')}{' '}
              <a href={`mailto:${MAIL}`} className="text-[var(--accent-2)] underline underline-offset-2">{MAIL}</a>
            </p>
          )}

          {state.phase === 'pick' && days.length > 0 && (
            <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void confirm() }}>
              <fieldset>
                <legend className="text-[13px] font-medium mb-2">{t('call.pickDay')}</legend>
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {days.map((d) => (
                    <button key={d.day} type="button" aria-pressed={d.day === day} onClick={() => { setDay(d.day); setSlot('') }} className={`${chip(d.day === day)} shrink-0`}>
                      {fmtDay(d.day, 'short')}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-[13px] font-medium mb-2">{t('call.pickTime')}</legend>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {(days.find((d) => d.day === day)?.slots ?? []).map((s) => (
                    <button key={s} type="button" aria-pressed={s === slot} onClick={() => setSlot(s)} className={chip(s === slot)}>{fmtTime(s)}</button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-[var(--text-faint)]">{t('call.zone', { zone: tz.replace(/_/g, ' ') })}</p>
              </fieldset>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">{t('call.email')}</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  className="min-h-[40px] px-3 rounded-[8px] border border-[var(--border)] bg-transparent text-[14px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">{t('call.note')} <span className="font-normal text-[var(--text-faint)]">{t('call.optional')}</span></span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder={t('call.notePlaceholder')}
                  className="px-3 py-2 rounded-[8px] border border-[var(--border)] bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] resize-y" />
              </label>

              {error && <p role="alert" className="text-[13px] text-[var(--warn)]">{t(`call.error.${error}`)}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={!slot || busy} className={primary}>
                  {busy ? t('call.booking') : slot ? t('call.confirmAt', { when: fmtTime(slot) }) : t('call.confirm')}
                </button>
                {slot && <span className="text-[12px] text-[var(--text-faint)] first-letter:uppercase">{fmtWhen(slot)}</span>}
              </div>
            </form>
          )}

          {state.phase === 'booked' && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[12px] text-[var(--text-faint)]">{t('call.bookedLabel')}</p>
                <p className="mt-0.5 text-[17px] font-medium first-letter:uppercase">{fmtWhen(state.booking.slot)}</p>
                <p className="mt-1 text-[13px] text-[var(--text-dim)]">
                  {t('call.bookedMeta', { minutes: state.booking.duration, zone: tz.replace(/_/g, ' ') })}
                </p>
              </div>
              <p className="text-[14px]">
                {t('call.join')}{' '}
                <a href={state.booking.meet_url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-2)] underline underline-offset-2 break-all">{state.booking.meet_url}</a>
              </p>
              <p className="text-[13px] text-[var(--text-dim)]">
                {state.mailed === true ? t('call.mailed', { email: state.booking.email })
                  : state.mailed === false ? t('call.notMailed')
                  : t('call.mailedEarlier', { email: state.booking.email })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadIcs(state.booking)} className={ghost}>{t('call.addIcs')}</button>
                <a href={googleCalendarUrl(state.booking, title)} target="_blank" rel="noopener noreferrer" className={ghost}>Google Calendar</a>
                <a href={outlookCalendarUrl(state.booking, title)} target="_blank" rel="noopener noreferrer" className={ghost}>Outlook</a>
              </div>
              <div className="border-t border-[var(--border)] pt-4 flex flex-col items-start gap-2">
                <p className="text-[13px] text-[var(--text-dim)]">{t('call.changeHint')}</p>
                <button type="button" onClick={() => void cancel()} disabled={busy} className={`${ghost} disabled:opacity-50`}>{t('call.cancel')}</button>
                {error && <p role="alert" className="text-[13px] text-[var(--warn)]">{t(`call.error.${error}`)}</p>}
              </div>
            </div>
          )}
        </section>

        <p className="mt-10 text-[12px] text-[var(--text-faint)]">
          {t('call.footer')}{' '}
          <a href={`mailto:${MAIL}`} className="text-[var(--accent-2)] underline underline-offset-2">{MAIL}</a>
        </p>
      </main>
    </div>
  )
}
