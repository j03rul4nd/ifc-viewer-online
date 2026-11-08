// ─── FeatureRequestModal ──────────────────────────────────────────────────────
// "What would help you most?" Built so answering is fast and the answer is
// worth something:
//  · One tap + Send is a complete request. The options are the paid features on
//    the roadmap (docs-planning 19/20) in the user's words, plus "something else".
//  · "Tell us more" (optional, ~1 minute) asks what they DO, not what they would
//    pay — how often, how they cope today, whether they already pay for a tool,
//    who holds the budget — and what they commit to: the beta, a 15-minute call.
//  · "Your requests" shows what they asked for, our status and our reply, so the
//    loop closes and asking again feels worth it.
//  · Anonymous users (most of the traffic) answer first; only Send asks them to
//    sign in. Their answer is kept across the sign-in and comes back ready to
//    send. Even if they stop there, the choice is counted (anonymous analytics).
//
// CLERK-FREE (I-1): the token comes from cloudAccountStore.getToken().

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ChevronDown, ChevronLeft, UserRound } from 'lucide-react'
import { Modal } from '../Modal'
import { openAccountModal, useCloudAccountStore } from '../../stores/cloudAccountStore'
import { trackFeatureRequestChosen, trackFeatureRequestOpened, trackFeatureRequestSubmitted } from '../../lib/analytics'
import { markSeen, noteAnswered, savePendingDraft } from '../../lib/feedback-gate'
import {
  NEED_MAX, OTHER_MIN, REQUEST_FEATURES, REQUEST_FREQUENCIES, REQUEST_PAYERS, REQUEST_ROLES, REQUEST_TEAMS, REQUEST_TODAY,
  canSubmit, listMyFeatureRequests, loadRequestProfile, saveRequestProfile, submitFeatureRequest,
  type OwnFeatureRequest, type RequestFeature, type RequestFrequency, type RequestPayer, type RequestRole,
  type RequestTeam, type RequestToday, type SubmitError,
} from '../../lib/feature-requests'

/** Entry points that already say what the person was missing. */
function featureFromSource(source: string): RequestFeature | null {
  if (source.startsWith('large_file')) return 'big_files'
  if (source === 'upsell_rulesets') return 'auto_check'
  if (source === 'upsell_history') return 'versions'
  return null
}

interface ChipsProps<T extends string> {
  legend: string
  name: string
  options: readonly T[]
  value: T | ''
  label: (v: T) => string
  onChange: (v: T | '') => void
}

/** Single choice; tapping the chosen chip again clears it (every detail is optional). */
function Chips<T extends string>({ legend, name, options, value, label, onChange }: ChipsProps<T>) {
  return (
    <fieldset className="flex flex-col gap-1.5 min-w-0">
      <legend className="mb-1.5 text-[12px] font-medium text-[var(--text)]">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              name={name}
              onClick={() => onChange(on ? '' : o)}
              className={[
                'min-h-[32px] px-3 rounded-[8px] border text-[12px] cursor-pointer transition-colors',
                on
                  ? 'border-[var(--accent)] bg-[rgba(10,132,129,0.16)] text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              {label(o)}
            </button>
          )
        })}
      </div>
    </fieldset>
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
  building: 'var(--accent-2)', shipped: '#4caf82', declined: 'var(--text-faint)',
}

type View = 'form' | 'signin' | 'sent' | 'mine'

/** A preset value, only if it is one of the allowed answers. */
function pick<T extends string>(v: unknown, allowed: readonly T[]): T | '' {
  return allowed.includes(v as T) ? (v as T) : ''
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
  const [contactOk, setContactOk] = useState(d.contact_ok === true)
  const [more, setMore] = useState(Boolean(frequency || today || payer || beta || call))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SubmitError | 'missing' | null>(null)
  const [mine, setMine] = useState<OwnFeatureRequest[] | null>(null)
  const [mineFailed, setMineFailed] = useState(false)

  useEffect(() => { trackFeatureRequestOpened({ source, signed_in: signedIn }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  // The count for "Your requests"; cheap, and it is their own data.
  useEffect(() => { if (signedIn) void loadMine(view === 'mine') }, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  // App mounts this only while open, so every opening starts from a fresh form.
  const close = () => setOpen(false)
  const ready = canSubmit(feature, need)

  const answers = () => ({
    feature: feature as RequestFeature, need, frequency, today, today_tool: today === 'paid_tool' ? todayTool : '', payer, role, team,
    beta, call, contact_ok: contactOk || beta || call, source,
  })

  /** Anonymous: keep everything they answered across the sign-in, then sign in. */
  const continueToSignIn = () => {
    savePendingDraft(answers())
    setOpen(false)
    openAccountModal()
  }

  const submit = async () => {
    if (!canSubmit(feature, need)) { setError('missing'); return }
    if (!signedIn) {
      // Their choice counts even if they stop here (no text, no identity).
      trackFeatureRequestChosen({ feature, source, signed_in: false })
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
    saveRequestProfile(role, team)
    noteAnswered()
    trackFeatureRequestSubmitted({
      feature, source, detailed: more, frequency, today, payer, beta, call,
    })
    setView('sent')
    void loadMine(false)
  }

  const ghostBtn = 'min-h-[36px] px-3 rounded-[8px] text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer'
  const primaryBtn = 'min-h-[36px] px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium cursor-pointer'

  const footer = view === 'signin' ? (
    <>
      <button onClick={close} className={ghostBtn}>{t('requests.signinLater')}</button>
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

  const mineLink = mine && mine.length > 0 && (
    <button type="button" onClick={() => { setView('mine'); void loadMine(true) }} className={`${view === 'sent' ? 'self-center' : 'self-start'} text-[12px] text-[var(--accent-2)] underline underline-offset-2 cursor-pointer`}>
      {t('requests.mineLink', { count: mine.length })}
    </button>
  )

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
        <div className="px-4 py-6 sm:px-5 flex flex-col items-center gap-3 text-center">
          <UserRound aria-hidden size={28} className="text-[var(--accent-2)]" />
          <p className="text-[14px] font-medium text-[var(--text)]">{t('requests.signinTitle')}</p>
          <p className="max-w-[46ch] text-[13px] leading-relaxed text-[var(--text-dim)]">{t('requests.signinBody')}</p>
          <p className="max-w-[46ch] text-[12px] text-[var(--text-faint)]">{t('requests.signinFree')}</p>
        </div>
      )}

      {view === 'sent' && (
        <div className="px-4 py-6 sm:px-5 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 aria-hidden size={28} className="text-[var(--accent-2)]" />
          <p className="text-[14px] font-medium text-[var(--text)]">{t('requests.thanksTitle')}</p>
          <p className="max-w-[44ch] text-[13px] leading-relaxed text-[var(--text-dim)]">
            {contactOk || beta || call ? t('requests.thanksContact') : t('requests.thanksNoContact')}
          </p>
          <p className="max-w-[44ch] text-[12px] text-[var(--text-faint)]">{t('requests.thanksStatus')}</p>
          {mineLink}
          <p className="text-[12px] text-[var(--text-faint)]">
            {t('requests.directMail')}{' '}
            <a href="mailto:hola@ifcvieweronline.eu" className="text-[var(--accent-2)] underline underline-offset-2">hola@ifcvieweronline.eu</a>
          </p>
        </div>
      )}

      {view === 'mine' && (
        <div className="px-4 py-4 sm:px-5 flex flex-col gap-3">
          <button type="button" onClick={() => setView('form')} className="self-start inline-flex items-center gap-1 text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">
            <ChevronLeft aria-hidden size={14} /> {t('requests.newRequest')}
          </button>
          {mineFailed && <p className="text-[13px] text-[var(--text-dim)]">{t('requests.error.unavailable')}</p>}
          {(mine ?? []).map((r) => (
            <article key={r.id} className="rounded-[10px] border border-[var(--border)] px-3 py-2.5 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[var(--text)]">{t(`requests.feature.${r.feature}.title`)}</span>
                <span className="text-[11px] font-semibold" style={{ color: STATUS_TONE[r.status] ?? 'var(--text-faint)' }}>
                  {t(`requests.status.${r.status}`)}
                </span>
              </div>
              {r.need && <p className="text-[12px] leading-relaxed text-[var(--text-dim)] whitespace-pre-wrap break-words">{r.need}</p>}
              {r.reply && (
                <p className="rounded-[8px] bg-[var(--surface-2)] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--text)] whitespace-pre-wrap break-words">
                  <span className="text-[var(--text-faint)]">{t('requests.replyFrom')} </span>{r.reply}
                </p>
              )}
              <span className="text-[11px] tabular-nums text-[var(--text-faint)]">{new Date(r.created_at).toLocaleDateString(i18n.language)}</span>
            </article>
          ))}
        </div>
      )}

      {view === 'form' && (
        <form className="px-4 py-4 sm:px-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          {preset.resumed && signedIn && (
            <p role="status" className="rounded-[8px] border border-[rgba(10,132,129,0.4)] bg-[rgba(10,132,129,0.1)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text)]">
              {t('requests.resumed')}
            </p>
          )}
          {mineLink}

          {/* ── The one required answer ─────────────────────────────────── */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">{t('requests.title')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {REQUEST_FEATURES.map((f) => {
                const on = feature === f
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => { setFeature(f); setError(null) }}
                    className={[
                      'text-left rounded-[10px] border px-3 py-2.5 flex flex-col gap-0.5 cursor-pointer transition-colors',
                      on
                        ? 'border-[var(--accent)] bg-[rgba(10,132,129,0.14)]'
                        : 'border-[var(--border)] hover:border-[var(--border-strong)]',
                    ].join(' ')}
                  >
                    <span className="text-[13px] font-medium leading-snug text-[var(--text)]">{t(`requests.feature.${f}.title`)}</span>
                    <span className="text-[11px] leading-snug text-[var(--text-faint)]">{t(`requests.feature.${f}.hint`)}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[var(--text)]">
              {feature === 'other' ? t('requests.needLabelOther') : t('requests.needLabel')}
            </span>
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value.slice(0, NEED_MAX))}
              rows={feature === 'other' ? 3 : 2}
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
            className="self-start inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-2)] cursor-pointer"
          >
            <ChevronDown aria-hidden size={14} className={`transition-transform ${more ? 'rotate-180' : ''}`} />
            {t('requests.moreToggle')}
          </button>

          {more && (
            <div className="flex flex-col gap-4 rounded-[12px] border border-[var(--border)] p-3 sm:p-4">
              <Chips legend={t('requests.frequencyLabel')} name="fr-frequency" options={REQUEST_FREQUENCIES} value={frequency}
                label={(v) => t(`requests.frequency.${v}`)} onChange={setFrequency} />
              <Chips legend={t('requests.todayLabel')} name="fr-today" options={REQUEST_TODAY} value={today}
                label={(v) => t(`requests.today.${v}`)} onChange={setToday} />
              {today === 'paid_tool' && (
                <input
                  value={todayTool}
                  onChange={(e) => setTodayTool(e.target.value.slice(0, 120))}
                  placeholder={t('requests.todayToolPlaceholder')}
                  aria-label={t('requests.todayToolPlaceholder')}
                  className={`${inputCls} -mt-2`}
                />
              )}
              <Chips legend={t('requests.payerLabel')} name="fr-payer" options={REQUEST_PAYERS} value={payer}
                label={(v) => t(`requests.payer.${v}`)} onChange={setPayer} />
              <Chips legend={t('requests.roleLabel')} name="fr-role" options={REQUEST_ROLES} value={role}
                label={(v) => t(`requests.role.${v}`)} onChange={setRole} />
              <Chips legend={t('requests.teamLabel')} name="fr-team" options={REQUEST_TEAMS} value={team}
                label={(v) => t(`requests.team.${v}`)} onChange={setTeam} />
              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-medium text-[var(--text)]">{t('requests.commitLabel')}</span>
                <Check checked={beta} onChange={setBeta}>{t('requests.beta')}</Check>
                <Check checked={call} onChange={setCall}>{t('requests.call')}</Check>
              </div>
            </div>
          )}

          <Check checked={contactOk || beta || call} onChange={setContactOk}>{t('requests.contactOk')}</Check>

          {error && (
            <p role="alert" className="rounded-[8px] border border-[rgba(233,162,59,0.35)] bg-[rgba(233,162,59,0.08)] px-3 py-2 text-[12px] text-[#f5c76a]">
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
