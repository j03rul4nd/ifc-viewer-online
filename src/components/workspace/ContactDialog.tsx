// One way to reach us from anywhere in the workspace: a question, something
// broken, billing, or a data request. A bug report attaches the technical
// context we would otherwise ask for (screen, browser, job id) — shown to the
// user before sending, and removable. Never the model file itself.
// Design only: Send shows the confirmation without sending.

import { useMemo, useState } from 'react'
import type { TicketKind } from './sample-data'
import { Dialog, Field, Primary, Quiet, inputClass } from './ui'
import { useTx } from './i18n'

export const KIND_LABEL: Record<TicketKind, string> = {
  question: 'A question', bug: 'Something is not working', billing: 'Billing or invoices', data_request: 'My data (privacy)',
}

const PLACEHOLDER: Record<TicketKind, string> = {
  question: 'What are you trying to do?',
  bug: 'What did you do, what did you expect, and what happened instead?',
  billing: 'Which invoice or charge is it about?',
  data_request: 'What would you like us to do with your data?',
}

const REPLY_TIME: Record<TicketKind, string> = {
  question: 'within 1 working day', bug: 'within 1 working day — sooner if a delivery is blocked',
  billing: 'within 1 working day', data_request: 'within 30 days at the latest (GDPR); usually 2 days',
}

export function diagnostics(section: string, ref?: string): Record<string, string> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  return {
    Screen: `/workspace/${section}`,
    ...(ref ? { Related: ref } : {}),
    Browser: nav?.userAgent.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/)?.[0] ?? 'unknown',
    Viewport: typeof innerWidth !== 'undefined' ? `${innerWidth}×${innerHeight}` : 'unknown',
    'App version': (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev',
    Time: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  }
}

export default function ContactDialog({ kind: initialKind = 'question', section, refId, onClose }: {
  kind?: TicketKind
  section: string
  refId?: string
  onClose: () => void
}) {
  const tx = useTx()
  const [kind, setKind] = useState<TicketKind>(initialKind)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [attach, setAttach] = useState(true)
  const [sent, setSent] = useState(false)
  const diag = useMemo(() => diagnostics(section, refId), [section, refId])
  const ok = subject.trim().length > 2 && body.trim().length > 9

  if (sent) {
    return (
      <Dialog title={tx("Request sent")} onClose={onClose} footer={<Primary onClick={onClose}>{tx("Done")}</Primary>}>
        <p className="text-[13.5px]">{tx("We'll answer {{when}}, by email and in Help & support.", { when: tx(REPLY_TIME[kind]) })}</p>
        <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">{tx("Reference T-2032. Reply to the email to add anything.")}</p>
      </Dialog>
    )
  }

  return (
    <Dialog title={tx("Contact support")} onClose={onClose} size="lg"
      footer={<><Quiet onClick={onClose}>{tx("Cancel")}</Quiet><Primary disabled={!ok} onClick={() => setSent(true)}>{tx("Send")}</Primary></>}>
      <div role="radiogroup" aria-label={tx("Topic")} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(Object.keys(KIND_LABEL) as TicketKind[]).map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={`text-left rounded-[9px] border px-3 py-2.5 text-[12.5px] ${kind === k ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
            {tx(KIND_LABEL[k])}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        <Field label={tx("Subject")}><input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} /></Field>
        <Field label={tx("Details")} hint={kind === 'bug' ? tx("Steps to reproduce help most. Attach a screenshot if you have one.") : undefined}>
          <textarea className={`${inputClass} !h-[120px] py-2 resize-y`} value={body} placeholder={PLACEHOLDER[kind]} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Quiet>{tx("Attach files")}</Quiet>
          <span className="text-[11.5px] text-[var(--text-faint)]">{tx("Screenshots, BCF or logs · max 10 MB. Don't attach models — reference the job instead.")}</span>
        </div>
        {kind === 'bug' && (
          <>
            <label className="flex items-start gap-2.5 text-[12.5px]">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="mt-0.5 shrink-0" />
              <span>{tx("It blocks a delivery due in the next 48 h")}</span>
            </label>
            <div className="rounded-[10px] bg-[var(--surface-2)] p-3">
              <label className="flex items-center gap-2.5 text-[12.5px]">
                <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
                <span>{tx("Include technical details")}</span>
              </label>
              {attach && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--text-dim)] font-mono">
                  {Object.entries(diag).map(([k, v]) => <div key={k} className="contents"><dt className="text-[var(--text-faint)]">{k}</dt><dd className="[overflow-wrap:anywhere]">{v}</dd></div>)}
                </dl>
              )}
            </div>
          </>
        )}
      </div>
      <p className="mt-4 text-[11.5px] text-[var(--text-faint)]">{tx('We answer {{when}}.', { when: tx(REPLY_TIME[kind]) })}</p>
    </Dialog>
  )
}
