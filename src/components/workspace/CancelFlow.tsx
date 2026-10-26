// Cancelling a plan: why → one alternative that fits that reason → confirm →
// done. Never more than one offer, and "Cancel anyway" is always one click
// away (EU rules on dark patterns: cancelling must be as easy as subscribing).
// The reason is the most useful product signal we will get from a paying user.

import { useState } from 'react'
import { Dialog, Primary, Quiet, Danger, Field, inputClass } from './ui'
import type { TicketKind } from './sample-data'

type Reason = 'project_ended' | 'too_expensive' | 'missing_feature' | 'not_working' | 'switching' | 'other'

const REASONS: { id: Reason; label: string }[] = [
  { id: 'project_ended', label: 'My project ended — I don’t need it right now' },
  { id: 'too_expensive', label: 'It costs more than it saves me' },
  { id: 'missing_feature', label: 'Something I need is missing' },
  { id: 'not_working', label: 'Something doesn’t work properly' },
  { id: 'switching', label: 'I’m moving to another tool' },
  { id: 'other', label: 'Other' },
]

type Offer = { title: string; body: string; action: string; kind: 'pause' | 'yearly' | 'contact' }
const OFFER: Partial<Record<Reason, Offer>> = {
  project_ended: { kind: 'pause', title: 'Pause instead, for up to 3 months', body: 'No charges while paused. Projects and certificates stay as they are, and your plan resumes on the date you choose.', action: 'Pause my plan' },
  too_expensive: { kind: 'yearly', title: 'Pay yearly and save 20 %', body: 'Same plan and credits. Or keep the free tools and buy a credit pack only when a delivery needs it.', action: 'Switch to yearly' },
  not_working: { kind: 'contact', title: 'Let us fix it first', body: 'Tell us what fails. If we can’t solve it within 2 working days, we refund this month.', action: 'Report the problem' },
  missing_feature: { kind: 'contact', title: 'Tell us what’s missing', body: 'We read every request; some are already being built. We’ll tell you when it ships.', action: 'Send a request' },
}

export default function CancelFlow({ renewsOn, credits, onClose, onYearly, onContact }: {
  renewsOn: string
  credits: number
  onClose: () => void
  onYearly: () => void
  onContact: (kind: TicketKind) => void
}) {
  const [step, setStep] = useState<'reason' | 'offer' | 'confirm' | 'done' | 'paused'>('reason')
  const [reason, setReason] = useState<Reason | null>(null)
  const [note, setNote] = useState('')
  const [pauseMonths, setPauseMonths] = useState(1)
  const offer = reason ? OFFER[reason] : undefined

  if (step === 'paused') {
    return (
      <Dialog title="Plan paused" onClose={onClose} footer={<Primary onClick={onClose}>Done</Primary>}>
        <p className="text-[13.5px]">No charges until it resumes in {pauseMonths} month{pauseMonths > 1 ? 's' : ''}. You can resume earlier from Credits & billing.</p>
      </Dialog>
    )
  }
  if (step === 'done') {
    return (
      <Dialog title="Your plan is cancelled" onClose={onClose} footer={<Primary onClick={onClose}>Done</Primary>}>
        <p className="text-[13.5px]">It stays active until <b>{renewsOn}</b>; nothing more will be charged.</p>
        <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">Changed your mind? “Resume plan” in Credits & billing works until then, without paying again. Thanks for telling us why.</p>
      </Dialog>
    )
  }
  if (step === 'confirm') {
    return (
      <Dialog title="Cancel at the end of this period?" onClose={onClose}
        footer={<><Quiet onClick={onClose}>Keep my plan</Quiet><Danger onClick={() => setStep('done')}>Cancel plan</Danger></>}>
        <p className="text-[13.5px]">Your plan stays active until <b>{renewsOn}</b>. After that:</p>
        <ul className="mt-3 space-y-1.5 text-[12.5px] text-[var(--text-dim)]">
          <li>· The {credits} plan credits you have left expire; pack credits stay until their own date.</li>
          <li>· Projects become read-only for 90 days, then are deleted. Download what you need.</li>
          <li>· Certificates you issued stay verifiable.</li>
          <li>· The viewer, Health Score and IDS checks stay free, as always.</li>
        </ul>
      </Dialog>
    )
  }
  if (step === 'offer' && offer) {
    return (
      <Dialog title={offer.title} onClose={onClose}
        footer={<><Quiet onClick={() => setStep('confirm')}>Cancel anyway</Quiet><Primary onClick={() => {
          if (offer.kind === 'pause') setStep('paused')
          else if (offer.kind === 'yearly') { onClose(); onYearly() }
          else { onClose(); onContact(reason === 'not_working' ? 'bug' : 'question') }
        }}>{offer.action}</Primary></>}>
        <p className="text-[13px]">{offer.body}</p>
        {offer.kind === 'pause' && (
          <Field label="Pause for" className="mt-4">
            <select className={inputClass} value={pauseMonths} onChange={(e) => setPauseMonths(Number(e.target.value))}>
              {[1, 2, 3].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
            </select>
          </Field>
        )}
      </Dialog>
    )
  }
  return (
    <Dialog title="Before you go — why are you cancelling?" onClose={onClose}
      footer={<><Quiet onClick={onClose}>Keep my plan</Quiet><Primary disabled={!reason} onClick={() => setStep(offer ? 'offer' : 'confirm')}>Continue</Primary></>}>
      <fieldset>
        <legend className="sr-only">Reason</legend>
        <div className="space-y-1.5">
          {REASONS.map((r) => (
            <label key={r.id} className={`flex items-center gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] cursor-pointer ${reason === r.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
              <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Anything else? (optional)" className="mt-4">
        <textarea className={`${inputClass} !h-[80px] py-2 resize-y`} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Dialog>
  )
}
