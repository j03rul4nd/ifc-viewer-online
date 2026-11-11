// Review one delivery and decide in one screen: name checked field by field,
// score against the minimum, failing requirements, then accept or return with
// reasons proposed from those checks. The e-mail to the supplier is shown as a
// preview; nothing is sent from the preview.

import { useMemo, useState } from 'react'
import { Dialog, Primary, Quiet, Banner, scoreColor, inputClass } from '../../ui'
import { fmtDate, namingIssueText, short, VerdictChip } from './format'
import { namingOf, proposedReasons, suggestedVerdict, type RxDelivery, type RxProject, type RxSupplier } from './sample'
import type { RegisterEntry } from './register'
import type { Rx } from './strings'

export interface Decision { verdict: 'accepted' | 'returned'; reasons: string[]; note: string }

export default function DeliveryReview({ project, delivery: d, supplier, entries, rx, lang, onDecide, onClose }: {
  project: RxProject
  delivery: RxDelivery
  supplier: RxSupplier | undefined
  entries: RegisterEntry[]
  rx: Rx
  lang: string
  onDecide: (d: RxDelivery, decision: Decision) => void
  onClose: () => void
}) {
  const naming = useMemo(() => namingOf(project, d), [project, d])
  const proposed = useMemo(() => proposedReasons(project, d), [project, d])
  const [verdict, setVerdict] = useState<'accepted' | 'returned'>(() => suggestedVerdict(project, d))
  const [reasons, setReasons] = useState<string[]>(proposed)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const pending = d.verdict === 'pending'
  const missingReason = verdict === 'returned' && reasons.length === 0 && !note.trim()
  const tokens = naming.stem.split(project.naming.sep)
  const fieldsOk = tokens.length >= project.naming.f.length

  function confirm() {
    setTried(true)
    if (missingReason) return
    onDecide(d, { verdict, reasons: verdict === 'returned' ? reasons : [], note: note.trim() })
  }

  const footer = pending ? (
    <>
      <Quiet onClick={onClose}>{rx('Cancel')}</Quiet>
      <Primary onClick={confirm}>{verdict === 'accepted' ? rx('Accept delivery') : rx('Return to supplier')}</Primary>
    </>
  ) : <Quiet onClick={onClose}>{rx('Close')}</Quiet>

  return (
    <Dialog title={d.fileName} onClose={onClose} size="lg" footer={footer}>
      <p className="text-[12.5px] text-[var(--text-dim)] -mt-2 mb-4 [overflow-wrap:anywhere]">
        {supplier?.name ?? d.supplierId} · {rx('received {{date}}', { date: fmtDate(d.receivedAt, lang) })} · {d.sizeMb} MB · {rx('{{profile}} v{{v}}', { profile: project.profile, v: d.profileVersion })}
        {d.profileVersion < project.profileVersion && <> · <span className="text-[var(--warn)]">{rx('checked against an older version')}</span></>}
      </p>

      {d.score === null && (
        <Banner tone="danger" title={rx('The file could not be read')}>{rx('It is not an IFC file or it is damaged. Nothing was checked; return it and ask for the .ifc file.')}</Banner>
      )}

      <section aria-labelledby="rx-name" className="mb-5">
        <h3 id="rx-name" className="text-[13px] font-medium mb-2 flex items-center gap-2">
          {rx('File name (ISO 19650)')}
          <span className={`text-[12px] font-normal ${naming.ok ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}>{naming.ok ? rx('Follows the rule') : rx('Does not follow the rule')}</span>
        </h3>
        {fieldsOk && (
          <ol className="flex flex-wrap gap-1.5 mb-2" aria-label={rx('Fields of the name')}>
            {project.naming.f.map((f, i) => {
              const bad = naming.issues.some((x) => 'field' in x && x.field === f.c)
              return (
                <li key={f.c} className={`rounded-[6px] border px-2 py-1 text-center min-w-[54px] ${bad ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`}>
                  <span className="block font-mono text-[12.5px]">{tokens[i]}</span>
                  <span className="block text-[10.5px] text-[var(--text-faint)]">{rx(f.c)}</span>
                </li>
              )
            })}
            {[naming.status, naming.revision].map((t, i) => (
              <li key={i} className={`rounded-[6px] border px-2 py-1 text-center min-w-[54px] ${!t || naming.issues.some((x) => (i === 0 ? x.code.startsWith('status') : x.code.startsWith('revision'))) ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`}>
                <span className="block font-mono text-[12.5px]">{t ?? '—'}</span>
                <span className="block text-[10.5px] text-[var(--text-faint)]">{i === 0 ? rx('Status') : rx('Revision')}</span>
              </li>
            ))}
          </ol>
        )}
        {naming.issues.length > 0 && (
          <ul className="text-[12.5px] text-[var(--danger)] space-y-0.5">{naming.issues.map((x, i) => <li key={i}>· {namingIssueText(x, rx)}</li>)}</ul>
        )}
      </section>

      {d.score !== null && (
        <section aria-labelledby="rx-req" className="mb-5">
          <h3 id="rx-req" className="text-[13px] font-medium mb-2">{rx('Requirements')}</h3>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-[24px] font-semibold tabular-nums" style={{ color: scoreColor(d.score) }}>{d.score}</span>
            <span className="text-[12.5px] text-[var(--text-dim)]">{rx('minimum {{min}}', { min: project.minScore })}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[var(--surface-2)] mb-3" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${d.score}%`, background: scoreColor(d.score) }} />
            <div className="absolute -top-1 -bottom-1 w-[2px] bg-[var(--text)]" style={{ left: `${project.minScore}%` }} />
          </div>
          {d.failures.length === 0 ? <p className="text-[12.5px] text-[var(--text-dim)]">{rx('Every requirement passes.')}</p> : (
            <ul className="divide-y divide-[var(--border)] rounded-[8px] border border-[var(--border)]">
              {d.failures.map((f) => (
                <li key={f.rule} className="flex justify-between gap-3 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0">{rx(f.rule)}</span>
                  <span className="tabular-nums text-[var(--text-dim)] whitespace-nowrap">{rx('{{n}} elements', { n: f.count })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pending ? (
        <section aria-labelledby="rx-dec">
          <h3 id="rx-dec" className="text-[13px] font-medium mb-2">{rx('Decision')}</h3>
          <div role="radiogroup" aria-label={rx('Decision')} className="grid grid-cols-2 gap-2 mb-3">
            {(['accepted', 'returned'] as const).map((v) => (
              <button key={v} role="radio" aria-checked={verdict === v} onClick={() => setVerdict(v)}
                className={`h-[40px] rounded-[8px] border text-[13px] ${verdict === v ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] font-medium' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>
                {v === 'accepted' ? rx('Accept') : rx('Return')}
                {suggestedVerdict(project, d) === v && <span className="ml-1.5 text-[11px] text-[var(--text-faint)] font-normal">{rx('suggested')}</span>}
              </button>
            ))}
          </div>
          {verdict === 'returned' && (
            <fieldset className="mb-3">
              <legend className="text-[12px] text-[var(--text-dim)] mb-1.5">{rx('Reasons the supplier will read')}</legend>
              {proposed.length === 0 && <p className="text-[12px] text-[var(--text-faint)] mb-1">{rx('Nothing failed. Write why you return it.')}</p>}
              {proposed.map((r) => (
                <label key={r} className="flex items-start gap-2 py-1 text-[13px]">
                  <input type="checkbox" className="mt-[3px]" checked={reasons.includes(r)} onChange={(e) => setReasons((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))} />
                  <span>{rx(r)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <label className="block text-[12px] text-[var(--text-dim)]">
            {verdict === 'returned' ? rx('Note for the supplier') : rx('Note (optional)')}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputClass} !h-auto py-2 mt-1`} />
          </label>
          {tried && missingReason && <p role="alert" className="text-[12.5px] text-[var(--danger)] mt-1.5">{rx('Mark at least one reason or write a note: the supplier needs to know what to fix.')}</p>}

          <details className="mt-4 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]">
            <summary className="cursor-pointer px-3 py-2 text-[12.5px]">{rx('E-mail to {{email}}', { email: supplier?.email ?? '' })} <span className="text-[var(--text-faint)]">· {rx('preview, not sent')}</span></summary>
            <div className="px-3 pb-3 text-[12.5px] text-[var(--text-dim)] space-y-1.5">
              <p className="font-medium text-[var(--text)]">{verdict === 'accepted' ? rx('{{file}} accepted', { file: d.fileName }) : rx('{{file}} returned: please fix and deliver again', { file: d.fileName })}</p>
              <p>{rx('Project {{project}} · decided by {{who}}', { project: project.name, who: 'Laura Méndez' })}</p>
              {verdict === 'returned' && reasons.length > 0 && <ul>{reasons.map((r) => <li key={r}>· {rx(r)}</li>)}</ul>}
              {note.trim() && <p className="italic">“{note.trim()}”</p>}
              {verdict === 'returned' && <p>{rx('Check the next version with the same link before sending it: it is free and runs in your browser.')}</p>}
            </div>
          </details>
        </section>
      ) : (
        <section aria-labelledby="rx-dec" className="rounded-[8px] border border-[var(--border)] px-3 py-2.5">
          <h3 id="rx-dec" className="text-[13px] font-medium flex items-center gap-2"><VerdictChip verdict={d.verdict} rx={rx} />
            <span className="font-normal text-[12px] text-[var(--text-dim)]">{d.decidedBy} · {d.decidedAt && fmtDate(d.decidedAt, lang)}</span></h3>
          {d.reasons.length > 0 && <ul className="text-[12.5px] text-[var(--text-dim)] mt-1">{d.reasons.map((r) => <li key={r}>· {rx(r)}</li>)}</ul>}
          {d.note && <p className="text-[12.5px] italic mt-1">“{d.note}”</p>}
        </section>
      )}

      {entries.length > 0 && (
        <section aria-labelledby="rx-log" className="mt-5">
          <h3 id="rx-log" className="text-[13px] font-medium mb-1.5">{rx('In the register')}</h3>
          <ul className="text-[12px] text-[var(--text-dim)] space-y-1">
            {entries.map((e) => (
              <li key={e.seq} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums">#{e.seq}</span><span>{fmtDate(e.at, lang)}</span><span>{rx(e.event === 'received' ? 'Received' : e.event === 'accepted' ? 'Accepted' : 'Returned')}</span>
                <span className="font-mono">{short(e.hash)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  )
}
