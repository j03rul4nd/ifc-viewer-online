// Supplier record (compliance over time) and the invitation form.

import { useState } from 'react'
import { Dialog, Primary, Quiet, Banner, CopyField, Field, Sparkline, inputClass, scoreColor } from '../../ui'
import { fmtDate, VerdictChip } from './format'
import { DISCIPLINES, supplierStats, uploadLink, type RxDelivery, type RxProject, type RxSupplier } from './sample'
import type { Rx } from './strings'

export function SupplierCard({ project, supplier: s, deliveries, rx, lang, onOpenDelivery, onAccess, onClose }: {
  project: RxProject; supplier: RxSupplier; deliveries: RxDelivery[]; rx: Rx; lang: string
  onOpenDelivery: (id: string) => void
  /** Workspace mode only: replace the upload link, or cut the supplier off. */
  onAccess?: (action: 'rotate' | 'revoke') => void
  onClose: () => void
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const st = supplierStats(project, s, deliveries)
  const mine = deliveries.filter((d) => d.supplierId === s.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  return (
    <Dialog title={s.name} onClose={onClose} size="lg" footer={<Quiet onClick={onClose}>{rx('Close')}</Quiet>}>
      <p className="text-[12.5px] text-[var(--text-dim)] -mt-2 mb-4 [overflow-wrap:anywhere]">{rx(s.discipline)} · {rx('author code {{code}}', { code: s.originator })} · {s.contact} · {s.email}</p>
      {s.state === 'revoked' && <Banner tone="info" title={rx('Access revoked')}>{rx('This supplier can no longer deliver. Their past deliveries stay on the register.')}</Banner>}
      {s.state === 'bounced' && <Banner tone="danger" title={rx('The invitation bounced')}>{rx('{{email}} does not exist or rejected the message. Correct the address and invite again.', { email: s.email })}</Banner>}
      {s.state === 'invited' && <Banner tone="info" title={rx('Invited, no delivery yet')}>{rx('Invited on {{date}}. The link works without an account.', { date: fmtDate(s.invitedAt, lang, false) })}</Banner>}
      {st.daysLate > 0 && <Banner tone="warn" title={rx('{{n}} days late', { n: st.daysLate })}>{rx('No delivery since {{date}}. Deliveries are due every week.', { date: st.lastAt ? fmtDate(st.lastAt, lang, false) : '—' })}</Banner>}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          [rx('Deliveries'), String(st.deliveries)],
          [rx('Accepted first time'), st.firstTimeRate === null ? '—' : `${Math.round(st.firstTimeRate * 100)}%`],
          [rx('Average score'), st.avgScore === null ? '—' : String(st.avgScore)],
          [rx('Last delivery'), st.lastAt ? fmtDate(st.lastAt, lang, false) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[8px] border border-[var(--border)] px-3 py-2">
            <dt className="text-[11.5px] text-[var(--text-faint)]">{k}</dt>
            <dd className="text-[16px] font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {st.trend.length > 0 && <div className="mb-5"><p className="text-[12px] text-[var(--text-dim)] mb-1">{rx('Score per delivery')}</p><Sparkline values={st.trend} width={560} height={44} className="w-full" /></div>}

      {st.topFailures.length > 0 && (
        <section className="mb-5">
          <h3 className="text-[13px] font-medium mb-1.5">{rx('What fails most often')}</h3>
          <ul className="text-[12.5px] space-y-1">{st.topFailures.map((f) => <li key={f.rule} className="flex justify-between gap-3"><span>{rx(f.rule)}</span><span className="text-[var(--text-dim)] whitespace-nowrap">{rx('in {{n}} deliveries', { n: f.count })}</span></li>)}</ul>
        </section>
      )}

      <section className="mb-5">
        <h3 className="text-[13px] font-medium mb-1.5">{rx('Upload link for this supplier')}</h3>
        {onAccess ? (
          s.state === 'revoked' ? <p className="text-[12.5px] text-[var(--text-dim)]">{rx('No link: access revoked.')}</p> : <>
            <p className="text-[12.5px] text-[var(--text-dim)] mb-2">{rx('The link was shown once, when you invited them. If it leaked or got lost, make a new one: the old one stops working at once.')}</p>
            <div className="flex flex-wrap gap-2">
              <Quiet onClick={() => onAccess('rotate')}>{rx('New upload link')}</Quiet>
              {confirmRevoke
                ? <Quiet onClick={() => onAccess('revoke')}>{rx('Yes, revoke {{name}}', { name: s.name })}</Quiet>
                : <Quiet onClick={() => setConfirmRevoke(true)}>{rx('Revoke access')}</Quiet>}
            </div>
          </>
        ) : <>
          <CopyField value={uploadLink(project, s)} label={rx('Upload link for this supplier')} />
          <p className="text-[11.5px] text-[var(--text-faint)] mt-1">{rx('Sample link: uploads are not open yet.')}</p>
        </>}
      </section>

      {mine.length > 0 && (
        <section>
          <h3 className="text-[13px] font-medium mb-1.5">{rx('History')}</h3>
          <ul className="divide-y divide-[var(--border)] rounded-[8px] border border-[var(--border)]">
            {mine.map((d) => (
              <li key={d.id}>
                <button onClick={() => onOpenDelivery(d.id)} className="w-full text-left px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 hover:bg-[var(--surface-2)]">
                  <span className="font-mono text-[12px] flex-1 min-w-[200px] [overflow-wrap:anywhere]">{d.fileName}</span>
                  <span className="text-[12px] text-[var(--text-faint)]">{fmtDate(d.receivedAt, lang, false)}</span>
                  <span className="text-[12px] tabular-nums w-[28px] text-right" style={{ color: d.score === null ? undefined : scoreColor(d.score) }}>{d.score ?? '—'}</span>
                  <VerdictChip verdict={d.verdict} rx={rx} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  )
}

export function InviteDialog({ project, taken, rx, onInvite, onClose }: {
  project: RxProject; taken: string[]; rx: Rx
  onInvite: (s: Omit<RxSupplier, 'id' | 'projectId' | 'invitedAt' | 'state'>) => void; onClose: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [contact, setContact] = useState('')
  const [discipline, setDiscipline] = useState<string>(DISCIPLINES[0])
  const [originator, setOriginator] = useState('')
  const [tried, setTried] = useState(false)
  const code = originator.trim().toUpperCase()
  const errors = {
    name: !name.trim() ? rx('Write the company name.') : null,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? rx('Write a valid e-mail address.') : null,
    originator: !/^[A-Z0-9]{3,6}$/.test(code) ? rx('3 to 6 letters or digits, as in the file name.') : taken.includes(code) ? rx('Another supplier already uses {{code}}.', { code }) : null,
  }
  const ok = !errors.name && !errors.email && !errors.originator
  const err = (k: keyof typeof errors) => tried && errors[k] ? <span role="alert" className="block text-[var(--danger)] mt-1">{errors[k]}</span> : null

  return (
    <Dialog title={rx('Invite a supplier')} onClose={onClose}
      footer={<><Quiet onClick={onClose}>{rx('Cancel')}</Quiet><Primary onClick={() => { setTried(true); if (ok) onInvite({ name: name.trim(), email: email.trim(), contact: contact.trim() || name.trim(), discipline, originator: code }) }}>{rx('Create link and invite')}</Primary></>}>
      <div className="space-y-3">
        <Field label={rx('Company')}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />{err('name')}</Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={rx('Contact person')}><input className={inputClass} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="name" /></Field>
          <Field label={rx('E-mail')}><input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />{err('email')}</Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={rx('Discipline')}>
            <select className={inputClass} value={discipline} onChange={(e) => setDiscipline(e.target.value)}>{DISCIPLINES.map((x) => <option key={x} value={x}>{rx(x)}</option>)}</select>
          </Field>
          <Field label={rx('Author code (originator)')} hint={rx('Field 2 of the file name: {{example}}', { example: `${project.code}-${code || 'XXX'}-ZZ-XX-M3-A-0001` })}>
            <input className={`${inputClass} font-mono uppercase`} value={originator} maxLength={6} onChange={(e) => setOriginator(e.target.value)} />{err('originator')}
          </Field>
        </div>
        <p className="text-[12px] text-[var(--text-dim)]">{rx('They get their own upload link and the requirements ({{profile}} v{{v}}, minimum {{min}}). No account needed. In this preview nothing is sent.', { profile: project.profile, v: project.profileVersion, min: project.minScore })}</p>
      </div>
    </Dialog>
  )
}
