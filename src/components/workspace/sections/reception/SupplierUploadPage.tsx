// ─── The supplier's upload page (/deliver#t=sup_…) ───────────────────────────
// What a supplier opens from the receiver's link, with no account: the
// projects it may deliver to and their requirements, a free check of the IFC
// in its own browser (the viewer's validator — the same engine and score the
// receiver's runner uses — plus the project's ISO 19650 naming rule), then the
// delivery straight to storage and the receiver's verdict once validated.
// The token lives in the hash so it never reaches a server log or a Referer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Primary, Quiet, scoreColor } from '../../ui'
import { fixGuidePath } from '../../../../lib/fix-guide-url'
import { stepIntegrity } from '../../../../lib/step-integrity'
import { runStandaloneValidation } from '../../../../lib/certify/deep-verify'
import { calculateQualityScore, explainQualityScore } from '../../../../lib/quality-score'
import { deliverFile, supplierHome, type ApiSupplierDelivery, type ApiSupplierHome } from '../../../../lib/cloud/paid-client'
import { namingIssueText } from './format'
import { namingOf } from './sample'
import { originatorOf, supplierProjectFromApi } from './live'
import { useRx } from './strings'

type Load = { state: 'loading' } | { state: 'no_token' } | { state: 'invalid' } | { state: 'error' } | { state: 'ok'; home: ApiSupplierHome }
type Check = { state: 'idle' } | { state: 'checking'; pct: number } | { state: 'not_ifc' } | { state: 'damaged' } | { state: 'too_big' } | { state: 'done'; score: number; worst: { rule: string; count: number }[] }
type Sent = { state: 'idle' } | { state: 'sending' } | { state: 'failed'; reason: string } | { state: 'sent'; id: string; hash: string; at: string; replayed: boolean }

export function tokenFromHash(hash: string): string {
  const m = /(?:^#|&)t=(sup_[A-Za-z0-9_-]+)/.exec(hash)
  return m ? m[1] : ''
}

export function projectFromHash(hash: string): string {
  const m = /(?:^#|&)p=([A-Za-z0-9_-]{1,24})/.exec(hash)
  return m ? m[1] : ''
}

export default function SupplierUploadPage() {
  const { rx, lang } = useRx()
  const token = useMemo(() => (typeof window === 'undefined' ? '' : tokenFromHash(window.location.hash)), [])
  const linkProject = useMemo(() => (typeof window === 'undefined' ? '' : projectFromHash(window.location.hash)), [])
  const [load, setLoad] = useState<Load>(token ? { state: 'loading' } : { state: 'no_token' })
  const [slug, setSlug] = useState('')
  const [file, setFile] = useState<{ name: string; bytes: ArrayBuffer } | null>(null)
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const [sent, setSent] = useState<Sent>({ state: 'idle' })
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const run = useRef(0)

  const refresh = useCallback(async () => {
    if (!token) return
    const r = await supplierHome(token, linkProject)
    if (r.ok) { setLoad({ state: 'ok', home: r.value }); setSlug((s) => s || (r.value.projects.some((p) => p.slug === linkProject) ? linkProject : r.value.projects[0]?.slug) || '') }
    else setLoad((l) => (l.state === 'ok' ? l : { state: r.error.code === 'unauthorized' ? 'invalid' : 'error' }))
  }, [token, linkProject])
  useEffect(() => { void refresh() }, [refresh])

  // After sending, follow the receiver's validation until there is a verdict (two minutes at most).
  useEffect(() => {
    if (sent.state !== 'sent') return
    let n = 0
    const t = setInterval(() => { n++; void refresh(); if (n >= 24) clearInterval(t) }, 5000)
    return () => clearInterval(t)
  }, [sent, refresh])

  const home = load.state === 'ok' ? load.home : null
  const projectApi = home?.projects.find((p) => p.slug === slug) ?? null
  const project = useMemo(() => (projectApi && home ? supplierProjectFromApi(projectApi, home.supplier.name) : null), [projectApi, home])
  const org = home ? originatorOf(home.supplier.name) : ''
  const naming = project && file ? namingOf(project, { fileName: file.name }) : null
  const mine = sent.state === 'sent' ? home?.deliveries.find((d) => d.id === sent.id) : undefined

  async function pick(f: File) {
    if (!home) return
    const id = ++run.current
    setSent({ state: 'idle' })
    if (home.max_file_mb > 0 && f.size > home.max_file_mb * 1024 * 1024) { setFile(null); setCheck({ state: 'too_big' }); return }
    const bytes = await f.arrayBuffer()
    setFile({ name: f.name, bytes })
    // A file cut short would still score: say it is damaged instead (the server refuses it too).
    if (/\.ifc$/i.test(f.name)) {
      const integrity = stepIntegrity(new Uint8Array(bytes))
      if (!integrity.ok) { setCheck({ state: integrity.code === 'not_step' ? 'not_ifc' : 'damaged' }); return }
    }
    setCheck({ state: 'checking', pct: 0 })
    try {
      const issues = await runStandaloneValidation(bytes, (pct) => { if (run.current === id) setCheck({ state: 'checking', pct }) })
      if (run.current !== id) return
      const result = { issues }
      const worst = explainQualityScore(result).filter((c) => c.penalty > 0).slice(0, 4).map((c) => ({ rule: c.ruleId, count: c.count }))
      setCheck({ state: 'done', score: calculateQualityScore(result), worst })
    } catch {
      if (run.current === id) setCheck({ state: 'not_ifc' })
    }
  }

  async function send() {
    if (!file || !slug) return
    setSent({ state: 'sending' })
    const r = await deliverFile(token, slug, file.name, file.bytes, 'page')
    if (!r.ok) { setSent({ state: 'failed', reason: r.error.code === 'file_too_large' ? rx('The file is larger than the {{mb}} MB the receiver accepts.', { mb: home?.max_file_mb ?? 0 }) : r.error.code === 'naming' ? rx('The receiver refused the file name: it does not follow the project naming rule. Rename the file as shown above and deliver again.') : r.error.message ?? r.error.code }); return }
    setSent({ state: 'sent', id: r.value.deliveryId, hash: r.value.fileHash, at: new Date().toISOString(), replayed: r.value.replayed })
    void refresh()
  }

  const fmt = (iso: string) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  const dayName = (d: number) => new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 1 + (d % 7)))) // 1 Nov 2026 is a Sunday (getUTCDay 0)
  const pass = check.state === 'done' && naming?.ok && project ? check.score >= project.minScore : false

  return (
    <main className="min-h-full bg-[var(--bg)] text-[var(--text)] px-4 py-8 sm:py-12">
      <div className="max-w-[640px] mx-auto">
        {load.state === 'loading' && <p className="text-[13px] text-[var(--text-dim)]" role="status">…</p>}
        {(load.state === 'no_token' || load.state === 'invalid') && (
          <div className="text-center py-10">
            <h1 className="text-[17px] font-semibold">{rx('This upload link has expired')}</h1>
            <p className="text-[13px] text-[var(--text-dim)] mt-2">{load.state === 'no_token' ? rx('This upload link is not complete. Open the link exactly as you received it.') : rx('Ask the company that sent it for a new link. Your files are not lost: nothing was uploaded.')}</p>
            <p className="text-[12px] text-[var(--text-faint)] mt-4"><a className="text-[var(--accent)] hover:underline" href="/">{rx('You can still check your model for free in the viewer, without an account.')}</a></p>
          </div>
        )}
        {load.state === 'error' && (
          <div className="text-center py-10" role="alert">
            <p className="text-[14px]">{rx('Could not reach the server. Check your connection and try again.')}</p>
            <Quiet className="mt-3" onClick={() => { setLoad({ state: 'loading' }); void refresh() }}>{rx('Try again')}</Quiet>
          </div>
        )}

        {home && (
          <>
            <header className="mb-5">
              <h1 className="text-[19px] font-semibold leading-tight">{project?.name ?? home.receiver}</h1>
              <p className="text-[13px] text-[var(--text-dim)] mt-1">{rx('Delivery for {{client}} · as {{supplier}}', { client: project?.client || home.receiver, supplier: home.supplier.name })}</p>
            </header>

            {home.projects.length > 1 && (
              <label className="block mb-4 text-[12.5px] text-[var(--text-dim)]">{rx('Project')}
                <select value={slug} onChange={(e) => { setSlug(e.target.value); setSent({ state: 'idle' }) }} className="ml-2 h-[34px] rounded-[8px] border border-[var(--border-control)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text)]">
                  {home.projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                </select>
              </label>
            )}

            {home.projects.length === 0 && (
              <p className="text-[13px] text-[var(--text-dim)]" role="alert">{rx('This upload link is not complete. Open the link exactly as you received it.')}</p>
            )}
            {project && (
              <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
                <ul className="text-[12.5px] text-[var(--text-dim)] space-y-1.5">
                  <li>✓ {rx('Requirements: {{profile}} v{{v}}, minimum score {{min}}', { profile: project.profile, v: project.profileVersion, min: project.minScore })}</li>
                  <li>✓ {rx('File name: {{example}}', { example: `${project.code}-${org}-ZZ-XX-M3-…-0001-S2-P01.ifc` })}</li>
                  <li>✓ {rx('Next delivery due {{day}} at {{hour}}:00', { day: dayName(project.dueDay), hour: project.dueHour })}</li>
                </ul>

                <div
                  onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void pick(f) }}
                >
                  <button type="button" onClick={() => input.current?.click()}
                    className={`w-full rounded-[12px] border-2 border-dashed py-8 text-[13.5px] ${drag ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)]'} hover:border-[var(--accent)] hover:text-[var(--text)]`}>
                    <span className="block text-[22px] mb-1" aria-hidden>⇪</span>
                    {file ? file.name : rx('Drop your IFC here or choose a file')}
                  </button>
                  <input ref={input} type="file" accept=".ifc" className="sr-only" aria-label={rx('Drop your IFC here or choose a file')} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
                </div>
                <p className="text-[11.5px] text-[var(--text-faint)] text-center">{rx('No account needed. The check runs in your browser and is free.')}</p>

                {check.state === 'checking' && <p className="text-[12.5px] text-[var(--text-dim)]" role="status">{rx('Checking your model in your browser…')} {check.pct}%</p>}
                {check.state === 'too_big' && <p className="text-[12.5px] text-[var(--danger)]" role="alert">{rx('The file is larger than the {{mb}} MB the receiver accepts.', { mb: home.max_file_mb })}</p>}
                {check.state === 'damaged' && <p className="text-[12.5px] text-[var(--danger)]" role="alert">{rx('This file is damaged: it is cut short or not closed properly (an interrupted export or download). Export it again and deliver the complete file.')}</p>}
                {check.state === 'not_ifc' && <p className="text-[12.5px] text-[var(--danger)]" role="alert">{rx('This file does not open as an IFC.')}</p>}

                {check.state === 'done' && file && naming && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[30px] font-semibold tabular-nums leading-none" style={{ color: scoreColor(check.score) }}>{check.score}</span>
                      <p className="font-mono text-[12px] [overflow-wrap:anywhere] min-w-0">{file.name}</p>
                    </div>
                    <ul className="text-[12.5px] space-y-1">
                      {([[rx('IFC file that opens'), true], [rx('Name follows {{code}}-{{org}}-…-S2-P01', { code: project.code, org }), naming.ok], [rx('Score {{score}} of minimum {{min}}', { score: check.score, min: project.minScore }), check.score >= project.minScore]] as [string, boolean][])
                        .map(([label, ok]) => <li key={label} className={ok ? '' : 'text-[var(--danger)]'}>{ok ? '✓' : '✕'} {label}</li>)}
                    </ul>
                    {(!naming.ok || check.worst.length > 0) && (
                      <div className={`rounded-[8px] border px-3 py-2 text-[12.5px] ${pass ? 'border-[var(--border)]' : 'border-[var(--danger)]'}`}>
                        <p className="font-medium mb-1">{rx('What to fix')}</p>
                        <ul className="text-[var(--text-dim)] space-y-0.5">
                          {naming.issues.map((x, i) => <li key={i}>· {namingIssueText(x, rx)}</li>)}
                          {check.worst.map((w) => (
                            <li key={w.rule}>· <span className="font-mono">{w.rule}</span> ({rx('{{n}} elements', { n: w.count })}) <a className="text-[var(--accent)] hover:underline" href={'/' + fixGuidePath(w.rule, lang)} target="_blank" rel="noopener">{rx('How to fix it (free guide)')} ↗</a></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-[12.5px] text-[var(--text-dim)]">{pass ? rx('Ready to send. The receiver still reviews it.') : rx('Fix it and check again before sending. You can still send it, but it will most likely be returned.')}</p>
                    {sent.state !== 'sent' && (
                      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <Quiet onClick={() => input.current?.click()}>{rx('Choose another file')}</Quiet>
                        <Primary disabled={sent.state === 'sending'} onClick={() => void send()}>{sent.state === 'sending' ? rx('Sending…') : pass ? rx('Send delivery') : rx('Send anyway')}</Primary>
                      </div>
                    )}
                    {sent.state === 'failed' && <p className="text-[12.5px] text-[var(--danger)]" role="alert">{rx('Could not send it: {{reason}}', { reason: sent.reason })}</p>}
                  </div>
                )}

                {sent.state === 'sent' && file && (
                  <div className="space-y-2 border-t border-[var(--border)] pt-4" role="status">
                    <p className="text-[15px] font-semibold">✓ {rx('Delivered. {{client}} has been told.', { client: project.client || home.receiver })}</p>
                    {sent.replayed && <p className="text-[12.5px] text-[var(--text-dim)]">{rx('Already delivered: same file, same receipt.')}</p>}
                    <p className="text-[12.5px] text-[var(--text-dim)]">{rx('You will get an e-mail when it is accepted or returned. Keep this receipt:')}</p>
                    <dl className="text-[12px] rounded-[8px] bg-[var(--surface-2)] px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <dt className="text-[var(--text-faint)]">{rx('File')}</dt><dd className="font-mono [overflow-wrap:anywhere]">{file.name}</dd>
                      <dt className="text-[var(--text-faint)]">SHA-256</dt><dd className="font-mono [overflow-wrap:anywhere]">{sent.hash}</dd>
                      <dt className="text-[var(--text-faint)]">{rx('Received')}</dt><dd>{fmt(mine?.received_at ?? sent.at)}</dd>
                    </dl>
                    <p className="text-[12.5px]">{mine ? verdictLine(mine, rx) : rx('Waiting for validation…')}</p>
                    <Quiet onClick={() => { setFile(null); setCheck({ state: 'idle' }); setSent({ state: 'idle' }) }}>{rx('Deliver another file')}</Quiet>
                  </div>
                )}
              </section>
            )}

            {home.deliveries.length > 0 && (
              <section className="mt-6">
                <h2 className="text-[13px] font-semibold mb-2">{rx('Your deliveries')}</h2>
                <ul className="divide-y divide-[var(--border)] text-[12.5px] rounded-[10px] border border-[var(--border)]">
                  {home.deliveries.map((d) => (
                    <li key={d.id} className="px-3 py-2 flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
                      <span className="font-mono [overflow-wrap:anywhere] min-w-0 flex-1">{d.file_name}</span>
                      <span className="text-[var(--text-faint)]">{fmt(d.received_at)}</span>
                      <span>{verdictLine(d, rx)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="mt-6 text-[11px] text-[var(--text-faint)] text-center">{rx('Checked with IFC Viewer Online · free for suppliers')}</p>
          </>
        )}
      </div>
    </main>
  )
}

function verdictLine(d: ApiSupplierDelivery, rx: ReturnType<typeof useRx>['rx']): string {
  if (!d.uploaded || (d.score === null && d.verdict === 'pending')) return rx('Waiting for validation…')
  const score = d.score === null ? '' : ` · ${d.score}`
  if (d.verdict === 'accepted') return rx('Accepted') + score
  if (d.verdict === 'rejected') return rx('Returned') + score + (d.reason ? ` — ${d.reason}` : '')
  return rx('Validated, waiting for review') + score
}
