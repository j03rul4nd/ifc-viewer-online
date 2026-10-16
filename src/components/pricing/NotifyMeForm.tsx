import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { subscribeEmail } from '../../lib/subscribe'
import { trackEmailCaptured } from '../../lib/analytics'

/** "Not available yet — tell me when it is" capture behind every fake door. */
export default function NotifyMeForm({ source, label, compact = false }: {
  /** Subscriber source tag, e.g. `pricing:pro` — lets us segment the list later. */
  source: string
  label: string
  compact?: boolean
}) {
  const { i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setStatus('loading')
    const r = await subscribeEmail(value, source, i18n.language)
    if (r.ok || r.already || (r.disabled && import.meta.env.DEV)) {
      setStatus('done')
      trackEmailCaptured({ source, already_subscribed: !!r.already, locale: i18n.language })
    } else {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return <p className="text-[12.5px] text-[var(--ok,#3fb950)]" role="status">Thanks — we'll email you once, when it launches.</p>
  }

  return (
    <form onSubmit={submit} className={`flex flex-col gap-2 ${compact ? '' : 'mt-1'}`}>
      <p className="text-[12px] text-[var(--text-dim)]">{label}</p>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email"
          className="flex-1 min-w-0 h-[32px] px-2.5 text-[12.5px] rounded-[7px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="h-[32px] px-3 text-[12.5px] font-medium rounded-[7px] bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-60"
        >
          Notify me
        </button>
      </div>
      {status === 'error' && <p className="text-[11.5px] text-[var(--error,#f85149)]" role="alert">Could not save it. Try again.</p>}
    </form>
  )
}
