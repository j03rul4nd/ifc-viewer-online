// ─── FeatureRequestModal ──────────────────────────────────────────────────────
// "What would help you most?" Built so answering is fast and the answer is
// worth something:
//  · One tap + Send is a complete request. The options are the paid features on
//    the roadmap (docs-planning 19/20) in the user's words, plus "something else".
//    The three that fit what this person just did come first; the rest fold.
//  · The one free-text question asks for the last real time it happened (what
//    they had to deliver, to whom) — a story beats an opinion.
//  · "Tell us more" (optional) asks what they DO, never what they would pay —
//    how often, how they cope today, who holds the budget — and what they
//    commit to: the beta, a 15-minute call (with a booking link when set).
//  · "Your requests" shows status and Joel's replies, and lets them answer.
//  · Anonymous users (most of the traffic) answer first; only Send asks them to
//    sign in. Their answer is kept across the sign-in and comes back ready.
//
// CLERK-FREE (I-1): the token comes from cloudAccountStore.getToken().

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { Modal } from '../Modal'
import { openAccountModal, useCloudAccountStore } from '../../stores/cloudAccountStore'
import {
  trackFeatureRequestChosen, trackFeatureRequestOpened, trackFeatureRequestStep, trackFeatureRequestSubmitted,
} from '../../lib/analytics'
import { markSeen, noteAnswered, readSignals, savePendingDraft, suggestedFeatures } from '../../lib/feedback-gate'
import {
  NEED_MAX, OTHER_MIN, REQUEST_FEATURES, REQUEST_FREQUENCIES, REQUEST_PAYERS, REQUEST_ROLES, REQUEST_TEAMS, REQUEST_TODAY,
  answerFeatureRequest, awaitsAnswer, canSubmit, listMyFeatureRequests, loadRequestProfile, saveRequestProfile,
  submitFeatureRequest, threadOf,
  type OwnFeatureRequest, type RequestFeature, type RequestFrequency, type RequestPayer, type RequestRole,
  type RequestTeam, type RequestToday, type SubmitError,
} from '../../lib/feature-requests'

/** A calendar booking page for the 15-minute call (free tier, no backend). Optional. */
// Our own booking page (/call) unless an external scheduler is configured.
const EXTERNAL_BOOKING = (import.meta.env.VITE_BOOKING_URL as string | undefined)?.trim() || ''
const BOOKING_URL = EXTERNAL_BOOKING || '/call'

/** Entry points that already say what the person was missing. */
function featureFromSource(source: string): RequestFeature | null {
  if (source.startsWith('large_file')) return 'big_files'
  if (source === 'upsell_rulesets') return 'auto_check'
  if (source === 'upsell_history') return 'versions'
  return null
}

/** Arrow keys move the choice inside a radiogroup made of buttons. */
function radioKeys(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
  const i = items.indexOf(document.activeElement as HTMLButtonElement)
  if (i < 0) return
  e.preventDefault()
  const next = items[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]
  next.focus()
  next.click()
}

interface ChipsProps<T extends string> {
  legend: string
  options: readonly T[]
  value: T | ''
  label: (v: T) => string
  onChange: (v: T | '') => void
}

/** Single choice; tapping the chosen chip again clears it (every detail is optional). */
function Chips<T extends string>({ legend, options, value, label, onChange }: ChipsProps<T>) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[132px_1fr] sm:items-baseline">
      <span className="text-[12px] text-[var(--text-dim)]">{legend}</span>
      <div role="radiogroup" aria-label={legend} onKeyDown={radioKeys} className="flex flex-wrap gap-1">
        {options.map((o, i) => {
          const on = value === o
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (!value && i === 0) ? 0 : -1}
              onClick={() => onChange(on ? '' : o)}
              className={[
                'min-h-[28px] px-2.5 rounded-[6px] border text-[12px] cursor-pointer transition-colors duration-100',
                on
                  ? 'border-[var(--accent)] text-[var(--text)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]'
                  : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              {label(o)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-[var(--text-dim)] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[3px] accent-[var(--accent)]" />
      <span>{children}</span>
    </label>
  )
}

const inputCls =
  'w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]'

const STATUS_TONE: Record<string, string> = {
  new: 'var(--text-faint)', reviewing: 'var(--text-dim)', planned: 'var(--accent-2)',
  building: 'var(--accent-2)', shipped: 'var(--ok)', declined: 'var(--text-faint)',
}

type View = 'form' | 'signin' | 'sent' | 'mine'

/** A preset value, only if it is one of the allowed answers. */
function pick<T extends string>(v: unknown, allowed: readonly T[]): T | '' {
  return allowed.includes(v as T) ? (v as T) : ''
}

/** One request in "Your requests": status, the thread with Joel, and an answer box. */
function RequestThread({ r, onAnswered }: { r: OwnFeatureRequest; onAnswered: (r: OwnFeatureRequest) => void }) {
  const { t, i18n } = useTranslation('pro')
  const getToken = useCloudAccountStore((s) => s.getToken)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SubmitError | null>(null)
  const thread = threadOf(r)
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })

  const send = async () => {
    if (text.trim().length < 2) return
    setBusy(true)
    setError(null)
    const token = getToken ? await getToken() : null
    if (!token) { setBusy(false); setError('unauthorized'); return }
    const res = await answerFeatureRequest(token, r.id, text.trim())
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    trackFeatureRequestStep({ step: 'answered', feature: r.feature })
    setText('')
    onAnswered({ ...r, thread: res.thread })
  }

  return (
    <li className="py-3 flex flex-col gap-2 border-b border-[var(--border)] last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--text)]">{t(`requests.feature.${r.feature}.title`)}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-faint)]">
          <span style={{ color: STATUS_TONE[r.status] ?? 'var(--text-faint)' }}>{t(`requests.status.${r.status}`)}</span>
          {' · '}{date(r.created_at)}
        </span>
      </div>
      {r.need && <p className="text-[12px] leading-relaxed text-[var(--text-dim)] whitespace-pre-wrap break-words">{r.need}</p>}
      {thread.length > 0 && (
        <ol className="flex flex-col gap-1.5 border-l-2 border-[var(--border-strong)] pl-3">
          {thread.map((m, i) => (
            <li key={i} className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
              <span className="text-[var(--text-faint)]">{m.from === 'joel' ? 'Joel' : t('requests.you')} · {date(m.at)}</span>
              <span className="block text-[var(--text)]">{m.text}</span>
            </li>
          ))}
        </ol>
      )}
      {awaitsAnswer(r) && (
        <div className="flex flex-col gap-1.5 pl-3.5">
          <label className="sr-only" htmlFor={`ans-${r.id}`}>{t('requests.answerLabel')}</label>
          <textarea
            id={`ans-${r.id}`}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder={t('requests.answerPlaceholder')}
            className={`${inputCls} resize-y`}
          />
          <div className="flex items-center justify-between gap-2">
            <span role={error ? 'alert' : undefined} className="text-[11px] text-[var(--warn)]">{error ? t(`requests.error.${error}`) : ''}</span>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || text.trim().length < 2}
              className="min-h-[30px] px-3 rounded-[6px] border border-[var(--border-strong)] text-[12px] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 cursor-pointer"
            >
              {busy ? t('requests.sending') : t('requests.answerSend')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function FeatureRequestModal() {
  const { t, i18n } = useTranslation('pro')
  const open = useCloudAccountStore((s) => s.featureRequestOpen)
  const source = useCloudAccountStore((s) => s.featureRequestSource)
  const setOpen = useCloudAccountStore((s) => s.setFeatureRequestOpen)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const plan = useCloudAccountStore((s) => s.planCache?.plan ?? 'free')
  const status = useCloudAccountStore((s) => s.status)
  const signedIn = status === 'signed-in'
  // Read once: the form is mounted per opening.
  const [preset] = useState(() => useCloudAccountStore.getState().featureRequestPreset)
  const d = (preset.detail ?? {}) as Record<string, unknown>
  const profile = loadRequestProfile()

  const [view, setView] = useState<View>(preset.view ?? 'form')
  const [feature, setFeature] = useState<RequestFeature | null>(() => pick(preset.feature, REQUEST_FEATURES) || featureFromSource(source))
  const [need, setNeed] = useState(preset.need ?? '')
  const [frequency, setFrequency] = useState<RequestFrequency | ''>(pick(d.frequency, REQUEST_FREQUENCIES))
  const [today, setToday] = useState<RequestToday | ''>(pick(d.today, REQUEST_TODAY))
  const [todayTool, setTodayTool] = useState(typeof d.today_tool === 'string' ? d.today_tool : '')
  const [payer, setPayer] = useState<RequestPayer | ''>(pick(d.payer, REQUEST_PAYERS))
  const [role, setRole] = useState<RequestRole | ''>(pick(d.role, REQUEST_ROLES) || profile.role)
  const [team, setTeam] = useState<RequestTeam | ''>(pick(d.team, REQUEST_TEAMS) || profile.team)
  const [beta, setBeta] = useState(d.beta === true)
  const [call, setCall] = useState(d.call === true)
  const [sentId, setSentId] = useState('')
  const [contactOk, setContactOk] = useState(d.contact_ok === true)
  const [more, setMore] = useState(Boolean(frequency || today || payer || beta || call))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SubmitError | 'missing' | null>(null)
  const [mine, setMine] = useState<OwnFeatureRequest[] | null>(null)
  const [mineFailed, setMineFailed] = useState(false)

  // What this person just did decides the first three; the rest fold away
  // (unless the preset answer is among them). "Something else" always shows.
  const [order] = useState(() => {
    const top = suggestedFeatures(readSignals(), 3)
    const rest = REQUEST_FEATURES.filter((f) => f !== 'other' && !top.includes(f))
    return { top, rest }
  })
  const [showAll, setShowAll] = useState(() => !!feature && order.rest.includes(feature))
  const visible: RequestFeature[] = [...order.top, ...(showAll ? order.rest : []), 'other']
  const caseRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    trackFeatureRequestOpened({ source, signed_in: signedIn })
    if (preset.resumed) trackFeatureRequestStep({ step: 'resumed', feature: preset.feature, source })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** `seenAll`: they are looking at the list, so every status counts as seen;
   *  otherwise only newly sent requests are remembered (for change notices). */
  const loadMine = async (seenAll: boolean) => {
    const token = getToken ? await getToken() : null
    if (!token) return
    const res = await listMyFeatureRequests(token)
    if (!res.ok) { setMineFailed(true); return }
    setMine(res.requests)
    setMineFailed(false)
    markSeen(res.requests, { onlyNew: !seenAll })
  }
  useEffect(() => { if (signedIn) void loadMine(view === 'mine') }, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setOpen(false)
  const ready = canSubmit(feature, need)
  const contact = contactOk || beta || call

  const answers = () => ({
    feature: feature as RequestFeature, need, frequency, today, today_tool: today === 'paid_tool' ? todayTool : '', payer, role, team,
    beta, call, contact_ok: contact, source,
  })

  const choose = (f: RequestFeature) => {
    setFeature(f)
    setError(null)
    // "Something else" has nothing to go on without words: go straight to them.
    if (f === 'other') window.setTimeout(() => caseRef.current?.focus(), 0)
  }

  const continueToSignIn = () => {
    trackFeatureRequestStep({ step: 'signin_continue', feature: feature ?? undefined, source })
    setOpen(false)
    openAccountModal()
  }

  const submit = async () => {
    if (!canSubmit(feature, need)) { setError('missing'); return }
    if (!signedIn) {
      // Their choice counts even if they stop here (no text, no identity).
      trackFeatureRequestChosen({ feature: feature as string, source, signed_in: false })
      trackFeatureRequestStep({ step: 'signin_shown', feature: feature ?? undefined, source })
      // Kept now, not on "Sign in": the screen says it is kept, and "Not now"
      // must not lose it (signing in later this session still brings it back).
      savePendingDraft(answers())
      setView('signin')
      return
    }
    setBusy(true)
    setError(null)
    const token = getToken ? await getToken() : null
    if (!token) { setBusy(false); setError('unauthorized'); return }
    const draft = { ...answers(), lang: i18n.language.slice(0, 8), plan }
    const res = await submitFeatureRequest(token, draft)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setSentId(res.id)
    saveRequestProfile(role, team)
    noteAnswered()
    trackFeatureRequestSubmitted({
      feature: feature as string, source, detailed: more, frequency, today, payer, beta, call, has_case: need.trim().length >= 20,
    })
    setView('sent')
    void loadMine(false)
  }

  const ghostBtn = 'min-h-[36px] px-3 rounded-[8px] text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer'
  const primaryBtn = 'min-h-[36px] px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium cursor-pointer'

  const footer = view === 'signin' ? (
    <>
      <button onClick={() => { trackFeatureRequestStep({ step: 'signin_later', feature: feature ?? undefined, source }); close() }} className={ghostBtn}>
        {t('requests.signinLater')}
      </button>
      <button onClick={continueToSignIn} className={`${primaryBtn} hover:brightness-110`}>{t('requests.signinCta')}</button>
    </>
  ) : view === 'form' ? (
    <>
      <button onClick={close} className={ghostBtn}>{t('requests.cancel')}</button>
      <button
        onClick={() => void submit()}
        disabled={busy}
        aria-disabled={!ready}
        className={`${primaryBtn} disabled:opacity-60 ${ready ? 'hover:brightness-110' : 'opacity-60'}`}
      >
        {busy ? t('requests.sending') : t('requests.send')}
      </button>
    </>
  ) : (
    <button onClick={close} className={`${primaryBtn} hover:brightness-110`}>{t('requests.done')}</button>
  )

  const openMine = () => { setView('mine'); void loadMine(true) }
  const pending = (mine ?? []).filter(awaitsAnswer).length
  const mineLink = mine && mine.length > 0 && (
    <button type="button" onClick={openMine} className="self-start text-[12px] text-[var(--accent-2)] underline underline-offset-2 cursor-pointer">
      {pending > 0 ? t('requests.mineLinkReply', { count: mine.length }) : t('requests.mineLink', { count: mine.length })}
    </button>
  )

  // What they told us, said back plainly: proof it was understood.
  const receipt = [
    feature ? t(`requests.feature.${feature}.title`) : '',
    frequency ? t(`requests.frequency.${frequency}`).toLowerCase() : '',
    today === 'paid_tool' && todayTool ? t('requests.receiptTool', { tool: todayTool }) : '',
  ].filter(Boolean).join(' · ')

  return (
    <Modal
      open={open}
      onClose={close}
      title={view === 'mine' ? t('requests.mineTitle') : t('requests.title')}
      description={view === 'form' ? t('requests.intro') : undefined}
      size="md"
      footer={footer}
    >
      {view === 'signin' && (
        <div className="px-4 py-5 sm:px-5 flex flex-col gap-2">
          <p className="text-[14px] font-medium text-[var(--text)]">{t('requests.signinTitle')}</p>
          <p className="text-[13px] leading-relaxed text-[var(--text-dim)]">{t('requests.signinBody')}</p>
          <p className="text-[12px] text-[var(--text-faint)]">{t('requests.signinFree')}</p>
        </div>
      )}

      {view === 'sent' && (
        <div className="px-4 py-5 sm:px-5 flex flex-col gap-3">
          <div>
            <p className="text-[12px] text-[var(--text-faint)]">{t('requests.thanksTitle')}</p>
            <p className="mt-0.5 text-[14px] font-medium text-[var(--text)]">{receipt}</p>
          </div>
          {!(call && !BOOKING_URL) && (
            <p className="text-[13px] leading-relaxed text-[var(--text-dim)]">
              {contact ? t('requests.thanksContact') : t('requests.thanksNoContact')}
            </p>
          )}
          {call && BOOKING_URL && (
            <a
              href={EXTERNAL_BOOKING || (sentId ? `/call?r=${encodeURIComponent(sentId)}` : BOOKING_URL)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackFeatureRequestStep({ step: 'booking_opened', feature: feature ?? undefined, source })}
              className="self-start min-h-[34px] inline-flex items-center px-3 rounded-[8px] border border-[var(--accent)] text-[13px] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
            >
              {t('requests.bookCta')}
            </a>
          )}
          {call && !BOOKING_URL && <p className="text-[12px] text-[var(--text-dim)]">{t('requests.bookByMail')}</p>}
          {mine && mine.length > 0 ? (
            <button type="button" onClick={openMine} className="self-start text-[12px] text-[var(--accent-2)] underline underline-offset-2 cursor-pointer">
              {t('requests.thanksStatus')}
            </button>
          ) : (
            <p className="text-[12px] text-[var(--text-faint)]">{t('requests.thanksStatus')}</p>
          )}
          <p className="text-[12px] text-[var(--text-faint)]">
            {t('requests.directMail')}{' '}
            <a href="mailto:hola@ifcvieweronline.eu" className="text-[var(--accent-2)] underline underline-offset-2">hola@ifcvieweronline.eu</a>
          </p>
        </div>
      )}

      {view === 'mine' && (
        <div className="px-4 py-3 sm:px-5 flex flex-col gap-1">
          <button type="button" onClick={() => setView('form')} className="self-start inline-flex items-center gap-1 text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">
            <ChevronLeft aria-hidden size={14} /> {t('requests.newRequest')}
          </button>
          {mineFailed && <p role="alert" className="py-3 text-[13px] text-[var(--text-dim)]">{t('requests.error.unavailable')}</p>}
          {!mine && !mineFailed && (
            <ul aria-busy="true" aria-label={t('requests.loading')} className="flex flex-col">
              {[0, 1].map((i) => (
                <li key={i} className="py-3 flex flex-col gap-2 border-b border-[var(--border)]">
                  <span className="h-[13px] w-1/2 rounded bg-[var(--surface-2)]" />
                  <span className="h-[12px] w-4/5 rounded bg-[var(--surface-2)]" />
                </li>
              ))}
            </ul>
          )}
          {mine && mine.length === 0 && <p className="py-3 text-[13px] text-[var(--text-dim)]">{t('requests.mineEmpty')}</p>}
          {mine && mine.length > 0 && (
            <ul className="flex flex-col">
              {mine.map((r) => (
                <RequestThread key={r.id} r={r} onAnswered={(n) => setMine((m) => (m ?? []).map((x) => (x.id === n.id ? n : x)))} />
              ))}
            </ul>
          )}
        </div>
      )}

      {view === 'form' && (
        <form className="px-4 py-4 sm:px-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          {preset.resumed && signedIn && (
            <p role="status" className="border-l-2 border-[var(--accent)] pl-3 text-[12px] leading-relaxed text-[var(--text)]">
              {t('requests.resumed')}
            </p>
          )}
          {mineLink}

          {/* ── The one required answer ─────────────────────────────────── */}
          <div className="flex flex-col">
            <div role="radiogroup" aria-label={t('requests.title')} onKeyDown={radioKeys} className="flex flex-col rounded-[10px] border border-[var(--border)] overflow-hidden">
              {visible.map((f, i) => {
                const on = feature === f
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on || (!feature && i === 0) ? 0 : -1}
                    onClick={() => choose(f)}
                    className={[
                      'text-left px-3 py-2 flex items-baseline gap-2.5 cursor-pointer transition-colors duration-100',
                      i > 0 ? 'border-t border-[var(--border)]' : '',
                      on ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]' : 'hover:bg-[var(--surface-2)]',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className={`relative top-[2px] shrink-0 w-3 h-3 rounded-full border ${on ? 'border-[var(--accent-2)] bg-[var(--accent-2)] shadow-[inset_0_0_0_2px_var(--surface)]' : 'border-[var(--border-strong)]'}`}
                    />
                    <span className="min-w-0 flex flex-col">
                      <span className="text-[13px] leading-snug text-[var(--text)]">{t(`requests.feature.${f}.title`)}</span>
                      <span className="text-[11px] leading-snug text-[var(--text-faint)]">{t(`requests.feature.${f}.hint`)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {!showAll && (
              <button type="button" onClick={() => setShowAll(true)} className="self-start mt-1.5 text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] underline underline-offset-2 cursor-pointer">
                {t('requests.showAll', { count: order.rest.length })}
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[var(--text)]">
              {feature === 'other' ? t('requests.needLabelOther') : t('requests.needLabel')}
            </span>
            <textarea
              ref={caseRef}
              value={need}
              onChange={(e) => setNeed(e.target.value.slice(0, NEED_MAX))}
              rows={3}
              minLength={feature === 'other' ? OTHER_MIN : undefined}
              placeholder={feature === 'other' ? t('requests.needPlaceholderOther') : t('requests.needPlaceholder')}
              className={`${inputCls} resize-y`}
            />
          </label>

          {/* ── Optional: what they do and commit to ──────────────────────── */}
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            className="self-start inline-flex items-center gap-1.5 text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer"
          >
            <ChevronDown aria-hidden size={14} className={`transition-transform duration-150 motion-reduce:transition-none ${more ? 'rotate-180' : ''}`} />
            {t('requests.moreToggle')}
          </button>

          {more && (
            <div className="flex flex-col gap-2.5 border-l-2 border-[var(--border)] pl-3">
              <Chips legend={t('requests.frequencyLabel')} options={REQUEST_FREQUENCIES} value={frequency}
                label={(v) => t(`requests.frequency.${v}`)} onChange={setFrequency} />
              <Chips legend={t('requests.todayLabel')} options={REQUEST_TODAY} value={today}
                label={(v) => t(`requests.today.${v}`)} onChange={setToday} />
              {today === 'paid_tool' && (
                <input
                  value={todayTool}
                  onChange={(e) => setTodayTool(e.target.value.slice(0, 120))}
                  placeholder={t('requests.todayToolPlaceholder')}
                  aria-label={t('requests.todayToolPlaceholder')}
                  className={`${inputCls} sm:ml-[138px] sm:w-auto`}
                />
              )}
              <Chips legend={t('requests.payerLabel')} options={REQUEST_PAYERS} value={payer}
                label={(v) => t(`requests.payer.${v}`)} onChange={setPayer} />
              <Chips legend={t('requests.roleLabel')} options={REQUEST_ROLES} value={role}
                label={(v) => t(`requests.role.${v}`)} onChange={setRole} />
              <Chips legend={t('requests.teamLabel')} options={REQUEST_TEAMS} value={team}
                label={(v) => t(`requests.team.${v}`)} onChange={setTeam} />
              <div className="flex flex-col gap-1.5 pt-1">
                <Check checked={beta} onChange={setBeta}>{t('requests.beta')}</Check>
                <Check checked={call} onChange={setCall}>{BOOKING_URL ? t('requests.callBook') : t('requests.call')}</Check>
              </div>
            </div>
          )}

          <Check checked={contact} onChange={setContactOk}>{t('requests.contactOk')}</Check>

          {error && (
            <p role="alert" className="border-l-2 border-[var(--warn)] pl-3 text-[12px] text-[var(--text)]">
              {t(`requests.error.${error}`)}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('requests.privacy')}</p>
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  )
}
