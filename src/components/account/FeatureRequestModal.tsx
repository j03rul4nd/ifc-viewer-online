// ─── FeatureRequestModal ──────────────────────────────────────────────────────
// "Request a feature" for signed-in users: what they need, how often, and what
// they would pay for it. Answers land in the Worker (/requests), keyed by the
// Clerk user id from the session token, and are read back at /admin/feedback.
//
// CLERK-FREE (I-1): the token comes from cloudAccountStore.getToken(), so this
// file can be lazy-loaded from anywhere without pulling in @clerk/*.

import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import { Modal } from '../Modal'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import {
  NEED_MAX, NEED_MIN, REQUEST_AREAS, REQUEST_FREQUENCIES, REQUEST_PAY, WORKAROUND_MAX,
  submitFeatureRequest, type RequestArea, type RequestFrequency, type RequestPay, type SubmitError,
} from '../../lib/feature-requests'

interface ChoiceProps<T extends string> {
  legend: string
  name: string
  options: readonly T[]
  value: T | null
  label: (v: T) => string
  onChange: (v: T) => void
}

function Choice<T extends string>({ legend, name, options, value, label, onChange }: ChoiceProps<T>) {
  return (
    <fieldset className="flex flex-col gap-1.5 min-w-0">
      <legend className="mb-1.5 text-[12px] font-medium text-[var(--text)]">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o
          return (
            <label
              key={o}
              className={[
                'min-h-[32px] px-3 inline-flex items-center rounded-[8px] border text-[12px] cursor-pointer transition-colors',
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]',
                on
                  ? 'border-[var(--accent)] bg-[rgba(10,132,129,0.16)] text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              <input type="radio" name={name} value={o} checked={on} onChange={() => onChange(o)} className="sr-only" />
              {label(o)}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[var(--text)]">{label}</span>
      {hint && <span className="-mt-1 text-[11px] text-[var(--text-faint)]">{hint}</span>}
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] resize-y'

export default function FeatureRequestModal() {
  const { t, i18n } = useTranslation('pro')
  const open = useCloudAccountStore((s) => s.featureRequestOpen)
  const setOpen = useCloudAccountStore((s) => s.setFeatureRequestOpen)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const plan = useCloudAccountStore((s) => s.planCache?.plan ?? 'free')

  const [need, setNeed] = useState('')
  const [area, setArea] = useState<RequestArea | null>(null)
  const [frequency, setFrequency] = useState<RequestFrequency | null>(null)
  const [pay, setPay] = useState<RequestPay | null>(null)
  const [workaround, setWorkaround] = useState('')
  const [contactOk, setContactOk] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SubmitError | 'missing' | null>(null)
  const [sent, setSent] = useState(false)

  // App mounts this only while open, so every opening starts from a fresh form.
  const close = () => setOpen(false)

  const ready = need.trim().length >= NEED_MIN && area && frequency && pay

  const submit = async () => {
    if (!area || !frequency || !pay || need.trim().length < NEED_MIN) { setError('missing'); return }
    setBusy(true)
    setError(null)
    const token = getToken ? await getToken() : null
    if (!token) { setBusy(false); setError('unauthorized'); return }
    const res = await submitFeatureRequest(token, {
      need, area, frequency, pay, workaround, contact_ok: contactOk, lang: i18n.language.slice(0, 8), plan,
    })
    setBusy(false)
    if (res.ok) setSent(true)
    else setError(res.error)
  }

  const footer = sent ? (
    <button onClick={close} className="min-h-[36px] px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:brightness-110 cursor-pointer">
      {t('requests.done')}
    </button>
  ) : (
    <>
      <button onClick={close} className="min-h-[36px] px-3 rounded-[8px] text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">
        {t('requests.cancel')}
      </button>
      <button
        onClick={() => void submit()}
        disabled={busy}
        aria-disabled={!ready}
        className={`min-h-[36px] px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium cursor-pointer disabled:opacity-60 ${ready ? 'hover:brightness-110' : 'opacity-60'}`}
      >
        {busy ? t('requests.sending') : t('requests.send')}
      </button>
    </>
  )

  return (
    <Modal open={open} onClose={close} title={t('requests.title')} description={sent ? undefined : t('requests.intro')} size="md" footer={footer}>
      {sent ? (
        <div className="px-4 py-6 sm:px-5 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 aria-hidden size={28} className="text-[var(--accent-2)]" />
          <p className="text-[14px] font-medium text-[var(--text)]">{t('requests.thanksTitle')}</p>
          <p className="max-w-[44ch] text-[13px] leading-relaxed text-[var(--text-dim)]">
            {contactOk ? t('requests.thanksContact') : t('requests.thanksNoContact')}
          </p>
          <p className="text-[12px] text-[var(--text-faint)]">
            {t('requests.directMail')}{' '}
            <a href="mailto:hola@ifcvieweronline.eu" className="text-[var(--accent-2)] underline underline-offset-2">hola@ifcvieweronline.eu</a>
          </p>
        </div>
      ) : (
        <form
          className="px-4 py-4 sm:px-5 flex flex-col gap-5"
          onSubmit={(e) => { e.preventDefault(); void submit() }}
        >
          <Field label={t('requests.needLabel')} hint={t('requests.needHint')}>
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value.slice(0, NEED_MAX))}
              rows={4}
              required
              minLength={NEED_MIN}
              placeholder={t('requests.needPlaceholder')}
              className={inputCls}
              autoFocus
            />
          </Field>

          <Choice legend={t('requests.areaLabel')} name="fr-area" options={REQUEST_AREAS} value={area}
            label={(v) => t(`requests.area.${v}`)} onChange={setArea} />
          <Choice legend={t('requests.frequencyLabel')} name="fr-frequency" options={REQUEST_FREQUENCIES} value={frequency}
            label={(v) => t(`requests.frequency.${v}`)} onChange={setFrequency} />
          <Choice legend={t('requests.payLabel')} name="fr-pay" options={REQUEST_PAY} value={pay}
            label={(v) => t(`requests.pay.${v}`)} onChange={setPay} />

          <Field label={t('requests.workaroundLabel')}>
            <textarea
              value={workaround}
              onChange={(e) => setWorkaround(e.target.value.slice(0, WORKAROUND_MAX))}
              rows={2}
              placeholder={t('requests.workaroundPlaceholder')}
              className={inputCls}
            />
          </Field>

          <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-[var(--text-dim)] cursor-pointer">
            <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)}
              className="mt-[3px] accent-[var(--accent)]" />
            <span>{t('requests.contactOk')}</span>
          </label>

          {error && (
            <p role="alert" className="rounded-[8px] border border-[rgba(233,162,59,0.35)] bg-[rgba(233,162,59,0.08)] px-3 py-2 text-[12px] text-[#f5c76a]">
              {t(`requests.error.${error}`)}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('requests.privacy')}</p>
          {/* Enter in the textareas adds lines; the footer button submits. */}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  )
}
