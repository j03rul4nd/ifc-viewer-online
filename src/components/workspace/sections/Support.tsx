// Help & support: self-serve answers first, then the user's own requests with
// their full conversation, and the service status. "Contact support" opens the
// shared ContactDialog, the same one the header and error states use.

import { useState } from 'react'
import type { SampleTicket, TicketStatus } from '../sample-data'
import type { SectionProps } from '../registry'
import { Head, Panel, Primary, Quiet, Empty, DataList, Dot, Field, inputClass, SectionLabel } from '../ui'
import { KIND_LABEL } from '../ContactDialog'

const STATUS: Record<TicketStatus, [string, string]> = {
  open: ['Open — we\'re on it', 'var(--text-dim)'], waiting_on_you: ['Waiting for your reply', 'var(--warn)'], resolved: ['Resolved', 'var(--ok)'],
}

const ANSWERS = [
  { q: 'Why did my score change between two uploads of the same file?', a: 'It shouldn’t. If it did, the requirements profile changed — check Projects → Settings.' },
  { q: 'A cloud job failed. Do I lose the credits?', a: 'No. Failures on our side return the credits automatically; the job list shows it.' },
  { q: 'How does my client check a certificate?', a: 'They open its link. It shows the file fingerprint and the result; they drop the file to compare.' },
  { q: 'Can I get an invoice with my company details?', a: 'Yes — tick “Buying for a company” at checkout, or ask us to reissue one.' },
]

function TicketThread({ t, onBack }: { t: SampleTicket; onBack: () => void }) {
  const [reply, setReply] = useState('')
  const [st, label] = [STATUS[t.status][1], STATUS[t.status][0]]
  return (
    <>
      <button onClick={onBack} className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] mb-3 min-h-[32px]">← Help & support</button>
      <Head title={t.subject} sub={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">{t.id} · {KIND_LABEL[t.kind]}{t.ref && <> · about {t.ref}</>} · <span className="inline-flex items-center gap-1.5" style={{ color: st }}><Dot color={st} />{label}</span></span>} />
      <ol className="space-y-3 max-w-[720px]">
        {t.messages.map((m, i) => (
          <li key={i} className={`rounded-[10px] border border-[var(--border)] p-4 ${m.from === 'support' ? 'bg-[var(--surface)]' : 'bg-[var(--surface-2)] sm:ml-10'}`}>
            <p className="text-[11.5px] text-[var(--text-faint)]">{m.from === 'support' ? 'Support' : 'You'} · {m.at}</p>
            <p className="mt-1 text-[13.5px] whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      {t.status !== 'resolved' ? (
        <div className="mt-5 max-w-[720px]">
          <Field label="Reply"><textarea className={`${inputClass} !h-[110px] py-2 resize-y`} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
          <div className="mt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Quiet>Mark as solved</Quiet>
            <Primary disabled={!reply.trim()}>Send reply</Primary>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-[12.5px] text-[var(--text-dim)]">Solved. Still a problem? <button className="text-[var(--accent)] hover:underline">Reopen</button> within 30 days.</p>
      )}
    </>
  )
}

export default function Support({ data, actions }: SectionProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const ticket = data.tickets.find((t) => t.id === open)
  if (ticket) return <TicketThread t={ticket} onBack={() => setOpen(null)} />
  const answers = ANSWERS.filter((x) => !query || (x.q + x.a).toLowerCase().includes(query.toLowerCase()))
  const waiting = data.tickets.filter((t) => t.status === 'waiting_on_you').length

  return (
    <>
      <Head title="Help & support" sub="Answers first; a person when you need one. We reply within one working day."
        action={<><Quiet onClick={() => actions.contact('bug')}>Report a problem</Quiet><Primary onClick={() => actions.contact('question')}>Contact support</Primary></>} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] mb-6">
        <Panel className="p-4 sm:p-5">
          <Field label="Search help"><input className={inputClass} type="search" value={query} placeholder="certificate, credits, invoice…" onChange={(e) => setQuery(e.target.value)} /></Field>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {answers.map((x) => (
              <li key={x.q} className="py-2.5">
                <details>
                  <summary className="cursor-pointer text-[13.5px] font-medium list-none flex justify-between gap-3"><span>{x.q}</span><span aria-hidden className="text-[var(--text-faint)]">+</span></summary>
                  <p className="mt-1.5 text-[12.5px] text-[var(--text-dim)]">{x.a}</p>
                </details>
              </li>
            ))}
            {answers.length === 0 && <li className="py-3 text-[12.5px] text-[var(--text-dim)]">Nothing matches. <button className="text-[var(--accent)] hover:underline" onClick={() => actions.contact('question')}>Ask us</button> instead.</li>}
          </ul>
          <a href="/blog/" className="mt-2 inline-block text-[12.5px] text-[var(--accent)] hover:underline">All guides →</a>
        </Panel>
        <Panel className="p-4 sm:p-5">
          <p className="text-[12px] text-[var(--text-dim)]">Service status</p>
          <p className="mt-2 inline-flex items-center gap-2 text-[13.5px] font-medium"><Dot color="var(--ok)" />All systems running</p>
          <ul className="mt-3 space-y-1 text-[12px] text-[var(--text-dim)]">
            <li className="flex justify-between"><span>Cloud jobs</span><span className="inline-flex items-center gap-1.5 text-[var(--text)]"><Dot color="var(--ok)" />Operational</span></li>
            <li className="flex justify-between"><span>Certificates</span><span className="inline-flex items-center gap-1.5 text-[var(--text)]"><Dot color="var(--ok)" />Operational</span></li>
            <li className="flex justify-between"><span>Payments</span><span className="inline-flex items-center gap-1.5 text-[var(--text)]"><Dot color="var(--ok)" />Operational</span></li>
          </ul>
          <p className="mt-3 text-[11.5px] text-[var(--text-faint)]">The free viewer runs in your browser and works even when these don't.</p>
        </Panel>
      </div>

      <SectionLabel>Your requests{waiting > 0 && <span className="ml-2 normal-case tracking-normal" style={{ color: 'var(--warn)' }}>· {waiting} waiting for you</span>}</SectionLabel>
      {data.tickets.length === 0 ? (
        <Empty title="No requests yet" body="When you contact us, the conversation shows up here too — no need to dig through email." />
      ) : (
        <DataList
          rows={data.tickets}
          rowKey={(t) => t.id}
          primaryHeader="Request"
          primary={(t) => <><button onClick={() => setOpen(t.id)} className="font-medium text-left hover:underline">{t.subject}</button><p className="text-[11.5px] text-[var(--text-faint)]">{t.id} · {KIND_LABEL[t.kind]}</p></>}
          columns={[
            { key: 'status', header: 'Status', wide: true, cell: (t) => <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap" style={{ color: STATUS[t.status][1] }}><Dot color={STATUS[t.status][1]} />{STATUS[t.status][0]}</span> },
            { key: 'updated', header: 'Updated', cell: (t) => <span className="text-[var(--text-dim)] tabular-nums">{t.updatedAt}</span> },
          ]}
          actions={(t) => <Quiet onClick={() => setOpen(t.id)}>Open</Quiet>}
        />
      )}
    </>
  )
}
