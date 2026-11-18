// ─── Blog lead form ───────────────────────────────────────────────────────────
// Name, email, one role select and an unticked consent box. Posts to /api/lead
// (Worker /lead → KV) with the same shape as the MSP form. Analytics get the
// topic and role only — never the name or the email.

import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Interest, OfferKey } from '../../lib/blog-cta'
import { trackLeadSubmitted } from '../../lib/analytics'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const BLOG_LEAD_ROLES = ['bim_coordinator', 'engineer', 'steel_detailer', 'contractor', 'owner_operator', 'other'] as const

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; msg: string }

const BASE = import.meta.env.BASE_URL as string

export default function BlogLeadForm(props: {
  slug: string
  category: string
  interest: Interest
  offerKey: OfferKey
  lang: string
}) {
  const { slug, category, interest, offerKey, lang } = props
  const { t } = useTranslation('blog', { keyPrefix: 'cta', lng: lang })
  const feature = t(`feature.${offerKey}`)
  const startedAt = useRef(Date.now())
  const [consent, setConsent] = useState(false)
  const [send, setSend] = useState<SendState>({ kind: 'idle' })
  const [fieldError, setFieldError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (send.kind === 'sending' || !consent) return
    const fd = new FormData(e.currentTarget)
    const val = (k: string) => String(fd.get(k) ?? '').trim()
    const name = val('name'), email = val('email'), role = val('role')
    if (name.length < 2) return setFieldError(t('lead.errorName'))
    if (!EMAIL_RE.test(email)) return setFieldError(t('lead.errorEmail'))
    setFieldError(null)
    setSend({ kind: 'sending' })
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, company: '',
          message: `blog:${slug}`.slice(0, 1000),
          website: val('website'),
          elapsed_ms: Date.now() - startedAt.current,
          event: 'blog', entry: category.slice(0, 20), profile: role.slice(0, 20),
          intent: interest, feature: offerKey,
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (res.ok && data?.ok) {
        setSend({ kind: 'sent' })
        trackLeadSubmitted({ topic: interest, category, role: role || 'none', source: 'blog' })
      } else {
        setSend({ kind: 'error', msg: t('lead.errorServer') })
      }
    } catch {
      setSend({ kind: 'error', msg: t('lead.errorNetwork') })
    }
  }

  if (send.kind === 'sent') {
    return <p role="status" className="mt-4 text-[14px] text-[var(--text)]">{t('lead.success', { feature })}</p>
  }

  const input = 'ed-focus w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)]'
  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 grid gap-3" aria-label={t('lead.title', { feature })}>
      <p className="text-[15px] font-semibold text-[var(--text)]">{t('lead.title', { feature })}</p>
      <p className="text-[13px] text-[var(--text-dim)]">{t('lead.body')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px] text-[var(--text-dim)]">{t('lead.name')}
          <input name="name" autoComplete="name" required minLength={2} maxLength={120} className={input} />
        </label>
        <label className="grid gap-1 text-[13px] text-[var(--text-dim)]">{t('lead.email')}
          <input name="email" type="email" autoComplete="email" required maxLength={254} className={input} />
        </label>
      </div>
      <label className="grid gap-1 text-[13px] text-[var(--text-dim)]">{t('lead.role')}
        <select name="role" defaultValue="" className={input}>
          <option value="" disabled>{t('lead.rolePlaceholder')}</option>
          {BLOG_LEAD_ROLES.map((r) => <option key={r} value={r}>{t(`lead.roles.${r}`)}</option>)}
        </select>
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-2 text-[13px] text-[var(--text-dim)]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="ed-focus mt-0.5" />
        <span>
          {t('lead.consent', { feature })}{' '}
          <a href={`${BASE}privacy`.replace('//', '/')} className="underline underline-offset-2 hover:text-[var(--text)]">{t('lead.privacyLink')}</a>
        </span>
      </label>
      {fieldError && <p role="alert" className="text-[13px] text-[var(--danger,#e5484d)]">{fieldError}</p>}
      {send.kind === 'error' && <p role="alert" className="text-[13px] text-[var(--danger,#e5484d)]">{send.msg}</p>}
      <button
        type="submit"
        disabled={!consent || send.kind === 'sending'}
        className="ed-focus justify-self-start rounded-md bg-[var(--accent)] px-4 py-2 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {send.kind === 'sending' ? t('lead.sending') : t('lead.submit')}
      </button>
    </form>
  )
}
