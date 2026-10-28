// Help & support: self-serve answers first, then the user's own requests with
// their full conversation, and the service status. "Contact support" opens the
// shared ContactDialog, the same one the header and error states use.

import { useState } from 'react'
import type { SampleTicket, TicketStatus } from '../sample-data'
import type { SectionProps } from '../registry'
import { Head, Panel, Primary, Quiet, Empty, DataList, Dot, Field, inputClass, SectionLabel } from '../ui'
import { KIND_LABEL } from '../ContactDialog'
import { TOURS } from '../../../lib/workspace-tours/tours'
import { useTx, rich } from '../i18n'


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
  const tx = useTx()
  const [reply, setReply] = useState('')
  const [st, label] = [STATUS[t.status][1], STATUS[t.status][0]]
  return (
    <>
      <button onClick={onBack} className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] mb-3 min-h-[32px]">{tx("← Help & support")}</button>
      <Head title={t.subject} sub={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">{t.id} · {tx(KIND_LABEL[t.kind])}{t.ref && <> · {tx('about {{ref}}', { ref: t.ref })}</>} · <span className="inline-flex items-center gap-1.5" style={{ color: st }}><Dot color={st} />{tx(label)}</span></span>} />
      <ol className="space-y-3 max-w-[720px]">
        {t.messages.map((m, i) => (
          <li key={i} className={`rounded-[10px] border border-[var(--border)] p-4 ${m.from === 'support' ? 'bg-[var(--surface)]' : 'bg-[var(--surface-2)] sm:ml-10'}`}>
            <p className="text-[11.5px] text-[var(--text-faint)]">{m.from === 'support' ? tx("Support") : tx("You")} · {m.at}</p>
            <p className="mt-1 text-[13.5px] whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      {t.status !== 'resolved' ? (
        <div className="mt-5 max-w-[720px]">
          <Field label={tx("Reply")}><textarea className={`${inputClass} !h-[110px] py-2 resize-y`} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
          <div className="mt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Quiet>{tx("Mark as solved")}</Quiet>
            <Primary disabled={!reply.trim()}>{tx("Send reply")}</Primary>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-[12.5px] text-[var(--text-dim)]">{rich(tx('Solved. Still a problem? <0>Reopen</0> within 30 days.'), [(c) => <button className="text-[var(--accent)] hover:underline">{c}</button>])}</p>
      )}
    </>
  )
}

export default function Support({ data, actions }: SectionProps) {
  const tx = useTx()
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const ticket = data.tickets.find((t) => t.id === open)
  if (ticket) return <TicketThread t={ticket} onBack={() => setOpen(null)} />
  const answers = ANSWERS.filter((x) => !query || (x.q + x.a).toLowerCase().includes(query.toLowerCase()))
  const waiting = data.tickets.filter((t) => t.status === 'waiting_on_you').length

  return (
    <>
      <Head title={tx("Help & support")} sub={tx("Answers first; a person when you need one. We reply within one working day.")}
        action={<><Quiet onClick={() => actions.contact('bug')}>{tx("Report a problem")}</Quiet><Primary onClick={() => actions.contact('question')}>{tx("Contact support")}</Primary></>} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] mb-6">
        <Panel tour="help-search" className="p-4 sm:p-5">
          <Field label={tx("Search help")}><input className={inputClass} type="search" value={query} placeholder={tx("certificate, credits, invoice…")} onChange={(e) => setQuery(e.target.value)} /></Field>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {answers.map((x) => (
              <li key={x.q} className="py-2.5">
                <details>
                  <summary className="cursor-pointer text-[13.5px] font-medium list-none flex justify-between gap-3"><span>{tx(x.q)}</span><span aria-hidden className="text-[var(--text-faint)]">+</span></summary>
                  <p className="mt-1.5 text-[12.5px] text-[var(--text-dim)]">{tx(x.a)}</p>
                </details>
              </li>
            ))}
            {answers.length === 0 && <li className="py-3 text-[12.5px] text-[var(--text-dim)]">{rich(tx('Nothing matches. <0>Ask us</0> instead.'), [(c) => <button className="text-[var(--accent)] hover:underline" onClick={() => actions.contact('question')}>{c}</button>])}</li>}
          </ul>
          <a href="/blog/" className="mt-2 inline-block text-[12.5px] text-[var(--accent)] hover:underline">{tx("All guides →")}</a>
        </Panel>
        <Panel tour="status" className="p-4 sm:p-5">
          <p className="text-[12px] text-[var(--text-dim)]">{tx("Service status")}</p>
          <p className="mt-2 inline-flex items-center gap-2 text-[13.5px] font-medium"><Dot color="var(--ok)" />{tx("All systems running")}</p>
          <ul className="mt-3 space-y-1 text-[12px] text-[var(--text-dim)]">
            <li className="flex justify-between"><span>{tx("Cloud jobs")}</span><span className="inline-flex items-center gap-1.5 text-[var(--text)]"><Dot color="var(--ok)" />{tx("Operational")}</span></li>
            <li className="flex justify-between"><span>{tx("Certificates")}</span><span className="inline-flex items-center gap-1.5 text-[var(--text)]"><Dot color="var(--ok)" />{tx("Operational")}</span></li>
            <li className="flex justify-between"><span>{tx("Payments")}</span><span className="inline-flex items-center gap-1.5 text-[var(--text)]"><Dot color="var(--ok)" />{tx("Operational")}</span></li>
          </ul>
          <p className="mt-3 text-[11.5px] text-[var(--text-faint)]">{tx("The free viewer runs in your browser and works even when these don't.")}</p>
        </Panel>
      </div>

      <section className="mb-6" data-tour="tours">
        <SectionLabel>{tx("Guided tours")}</SectionLabel>
        <Panel>
          <ul className="grid sm:grid-cols-2 divide-y sm:divide-y-0 divide-[var(--border)]">
            {TOURS.filter((t) => !t.section.endsWith('/detail')).map((t) => (
              <li key={t.id} className="min-w-0">
                <button onClick={() => actions.tour(t.id)} className="w-full text-left px-4 py-2.5 hover:bg-[var(--surface-2)] rounded-[8px] flex items-baseline gap-3">
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{tx(t.title)}</span><span className="block text-[12px] text-[var(--text-dim)]">{tx(t.summary)}</span></span>
                  <span className="shrink-0 text-[11.5px] text-[var(--text-faint)] tabular-nums">{tx('{{count}} steps', { count: t.steps.length })}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="mt-2 text-[12px] text-[var(--text-dim)]">{tx("Every page also offers its tour from the account menu → “Tour this page”. In the connection wizard, “Guide me” explains the step you're on.")}</p>
      </section>

      <SectionLabel>{tx("Your requests")}{waiting > 0 && <span className="ml-2 normal-case tracking-normal" style={{ color: 'var(--warn)' }}>· {tx('{{count}} waiting for you', { count: waiting })}</span>}</SectionLabel>
      {data.tickets.length === 0 ? (
        <Empty title={tx("No requests yet")} body={tx("When you contact us, the conversation shows up here too — no need to dig through email.")} />
      ) : (
        <DataList tour="requests"
          rows={data.tickets}
          rowKey={(t) => t.id}
          primaryHeader={tx("Request")}
          primary={(t) => <><button onClick={() => setOpen(t.id)} className="font-medium text-left hover:underline">{t.subject}</button><p className="text-[11.5px] text-[var(--text-faint)]">{t.id} · {tx(KIND_LABEL[t.kind])}</p></>}
          columns={[
            { key: 'status', header: tx("Status"), wide: true, cell: (t) => <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap" style={{ color: STATUS[t.status][1] }}><Dot color={STATUS[t.status][1]} />{tx(STATUS[t.status][0])}</span> },
            { key: 'updated', header: tx("Updated"), cell: (t) => <span className="text-[var(--text-dim)] tabular-nums">{t.updatedAt}</span> },
          ]}
          actions={(t) => <Quiet onClick={() => setOpen(t.id)}>{tx("Open")}</Quiet>}
        />
      )}
    </>
  )
}
