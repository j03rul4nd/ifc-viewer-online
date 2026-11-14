// Review one delivery and decide in one screen: name checked field by field,
// score against the minimum, failing requirements, then accept or return with
// reasons proposed from those checks. The e-mail to the supplier is shown as a
// preview; nothing is sent from the preview.

import { useEffect, useMemo, useRef, useState } from 'react'
import { fixGuidePath } from '../../../../lib/fix-guide-url'
import { Dialog, Primary, Quiet, Banner, scoreColor, inputClass } from '../../ui'
import { fmtDate, namingIssueText, short, VerdictChip } from './format'
import { RULE_META, namingOf, proposedReasons, sampleElements, suggestedVerdict, versionsOf, type RxDelivery, type RxProject, type RxSupplier } from './sample'
import type { RegisterEntry } from './register'
import type { Rx } from './strings'

export interface Decision { verdict: 'accepted' | 'returned'; reasons: string[]; note: string }

export interface Queue { pos: number; total: number; prev?: () => void; next?: () => void }

export default function DeliveryReview({ project, delivery: d, supplier, entries, deliveries = [], queue, rx, lang, onDecide, onClose }: {
  deliveries?: RxDelivery[]
  queue?: Queue
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
  // Server data, no score yet and no reason: the runner has not validated it. It can be
  // returned early, never accepted (the server refuses that too).
  const validating = d.score === null && d.verdict === 'pending' && d.reasons.length === 0 && Boolean(d.fileHash)
  const [verdict, setVerdict] = useState<'accepted' | 'returned'>(() => validating ? 'returned' : suggestedVerdict(project, d))
  const [reasons, setReasons] = useState<string[]>(proposed)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const pending = d.verdict === 'pending'
  const missingReason = verdict === 'returned' && reasons.length === 0 && !note.trim()
  const tokens = naming.stem.split(project.naming.sep)
  const fieldsOk = tokens.length >= project.naming.f.length

  const versions = useMemo(() => versionsOf(project, d, deliveries), [project, d, deliveries])
  const [open3d, setOpen3d] = useState<string | null>(null)
  const confirmRef = useRef<() => void>(() => {})

  // Review queue shortcuts: A accept, D return, Enter confirm, J/K next/previous.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'j' && queue?.next) { e.preventDefault(); queue.next() }
      else if (k === 'k' && queue?.prev) { e.preventDefault(); queue.prev() }
      else if (!pending) return
      else if (k === 'a' && !validating) { e.preventDefault(); setVerdict('accepted') }
      else if (k === 'd') { e.preventDefault(); setVerdict('returned') }
      else if (k === 'enter' && t?.tagName !== 'BUTTON') { e.preventDefault(); confirmRef.current() }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [queue, pending, validating])

  function confirm() {
    setTried(true)
    if (missingReason) return
    onDecide(d, { verdict, reasons: verdict === 'returned' ? reasons : [], note: note.trim() })
  }
  confirmRef.current = confirm

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

      {queue && (
        <div className="flex items-center gap-2 mb-4 text-[12px] text-[var(--text-dim)]">
          <span className="tabular-nums">{rx('{{pos}} of {{total}} to review', { pos: queue.pos, total: queue.total })}</span>
          <span className="flex-1" />
          <Quiet onClick={queue.prev} disabled={!queue.prev} aria-label={rx('Previous')}>‹ K</Quiet>
          <Quiet onClick={queue.next} disabled={!queue.next} aria-label={rx('Next')}>J ›</Quiet>
          <span className="hidden sm:inline text-[11.5px] text-[var(--text-faint)]">{rx('A accept · D return · Enter confirm')}</span>
        </div>
      )}

      {versions.length > 1 && (
        <section aria-labelledby="rx-ver" className="mb-5">
          <h3 id="rx-ver" className="text-[13px] font-medium mb-2">{rx('Before and after')}</h3>
          <ol className="flex flex-wrap items-stretch gap-1.5">
            {versions.map((v, i) => {
              const prev = versions[i - 1]
              const fixed = prev ? prev.failures.filter((f) => !v.failures.some((x) => x.rule === f.rule)).length : 0
              return (
                <li key={v.id} className={`flex-1 min-w-[96px] rounded-[8px] border px-2.5 py-2 ${v.id === d.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                  <p className="font-mono text-[11.5px] text-[var(--text-faint)] truncate">{namingOf(project, v).revision ?? `#${i + 1}`} · {new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(v.receivedAt))}</p>
                  <p className="text-[18px] font-semibold tabular-nums leading-tight" style={{ color: v.score === null ? undefined : scoreColor(v.score) }}>{v.score ?? '—'}</p>
                  <VerdictChip verdict={v.verdict} rx={rx} />
                  {fixed > 0 && <p className="text-[11px] text-[var(--ok)] mt-0.5">{rx('{{n}} fixed', { n: fixed })}</p>}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {validating && (
        <Banner tone="info" title={rx('Still being validated')}>{rx('The server has not checked this file yet. You can accept it once it has a score, or return it now with a reason.')}</Banner>
      )}
      {d.damaged && (
        <Banner tone="danger" title={rx('The file is damaged')}>{rx('It is cut short or not closed properly (an interrupted export or upload), so it was not scored. Return it and ask for the complete file.')}</Banner>
      )}
      {d.score === null && !validating && !d.damaged && (
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
              {d.failures.map((f) => {
                const meta = RULE_META[f.rule]
                const els = sampleElements(d, f.rule)
                return (
                  <li key={f.rule} className="px-3 py-2 text-[12.5px]">
                    <div className="flex justify-between gap-3">
                      <span className="min-w-0 font-medium">{rx(f.rule)}</span>
                      <span className="tabular-nums text-[var(--text-dim)] whitespace-nowrap">{rx('{{n}} elements', { n: f.count })}</span>
                    </div>
                    {els.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {els.map((e) => (
                          <li key={e.guid} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                            <span className="font-mono text-[11.5px] text-[var(--text-dim)]">{e.guid}</span>
                            <span className="text-[var(--text-faint)]">{e.ifcType} · {e.storey}</span>
                            <button onClick={() => setOpen3d(open3d === e.guid ? null : e.guid)} className="ml-auto text-[var(--accent)] hover:underline">{rx('See in 3D')}</button>
                            {open3d === e.guid && <span role="note" className="basis-full text-[11.5px] text-[var(--text-faint)]">{rx('In the live version this opens the model at this element, isolated and framed.')}</span>}
                          </li>
                        ))}
                        {f.count > els.length && <li className="text-[11.5px] text-[var(--text-faint)]">{rx('and {{n}} more', { n: f.count - els.length })}</li>}
                      </ul>
                    )}
                    {meta?.fixRule && <a href={'/' + fixGuidePath(meta.fixRule, lang)} target="_blank" rel="noopener" className="inline-block mt-1.5 text-[12px] text-[var(--accent)] hover:underline">{rx('How to fix it (free guide)')} ↗</a>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {pending ? (
        <section aria-labelledby="rx-dec">
          <h3 id="rx-dec" className="text-[13px] font-medium mb-2">{rx('Decision')}</h3>
          <div role="radiogroup" aria-label={rx('Decision')} className="grid grid-cols-2 gap-2 mb-3">
            {(['accepted', 'returned'] as const).map((v) => (
              <button key={v} role="radio" aria-checked={verdict === v} onClick={() => setVerdict(v)} disabled={validating && v === 'accepted'}
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
