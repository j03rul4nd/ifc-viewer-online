// What a supplier sees on their upload link, without an account: open the
// link, drop the IFC (checked in their browser, free), send. This page is the
// one fifteen companies per project see, so it carries the receiver's name,
// tells exactly what to fix and how, and ends with a receipt they can keep.
// Shown here as a framed preview with three example cases.

import { useEffect, useState } from 'react'
import { Primary, Quiet, scoreColor } from '../../ui'
import { fixGuidePath } from '../../../../lib/fix-guide-url'
import { namingIssueText } from './format'
import { RULES, RULE_META, namingOf, type RxProject, type RxSupplier } from './sample'
import { sha256Hex } from './register'
import type { Rx } from './strings'

type Case = 'pass' | 'name' | 'expired'
const CASES: [Case, string][] = [['pass', 'Passes'], ['name', 'Name fails'], ['expired', 'Link expired']]
export const SUPPLIER_VIEW_LABELS = CASES.map((c) => c[1])
const STEPS = ['Requirements', 'Check', 'Send']
export const SUPPLIER_STEP_LABELS = STEPS

export default function SupplierView({ project, supplier, rx, lang }: { project: RxProject; supplier: RxSupplier; rx: Rx; lang: string }) {
  const [c, setC] = useState<Case>('pass')
  const [step, setStep] = useState(1)
  const [hash, setHash] = useState('')
  const file = c === 'name' ? `${project.code}_${supplier.originator}_planta2_v5.ifc` : `${project.code}-${supplier.originator}-ZZ-02-M3-M-0001-S2-P05.ifc`
  const naming = namingOf(project, { fileName: file })
  const score = c === 'name' ? 84 : 86
  const remaining = c === 'name' ? [{ rule: RULES.systems, count: 3 }] : []
  const pass = naming.ok && score >= project.minScore
  const pick = (x: Case) => { setC(x); setStep(1) }
  useEffect(() => { void sha256Hex(`${file}@preview`).then(setHash) }, [file])

  const checks: [string, boolean][] = [
    [rx('IFC file that opens'), true],
    [rx('Name follows {{code}}-{{org}}-…-S2-P01', { code: project.code, org: supplier.originator }), naming.ok],
    [rx('Score {{score}} of minimum {{min}}', { score, min: project.minScore }), score >= project.minScore],
    [rx('{{profile}} v{{v}} requirements', { profile: project.profile, v: project.profileVersion }), remaining.length === 0],
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[12.5px] text-[var(--text-dim)] mr-1">{rx('Example')}</span>
        {CASES.map(([id, label]) => (
          <button key={id} onClick={() => pick(id)} aria-pressed={c === id}
            className={`h-[32px] px-3 rounded-full border text-[12.5px] ${c === id ? 'border-[var(--accent)] text-[var(--text)] font-medium' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>{rx(label)}</button>
        ))}
      </div>

      <div className="rounded-[14px] border border-[var(--border)] overflow-hidden max-w-[600px] mx-auto shadow-sm">
        <div className="flex items-center gap-2 px-3 h-[32px] bg-[var(--surface-2)] border-b border-[var(--border)] text-[11.5px] text-[var(--text-faint)] font-mono truncate">
          <span aria-hidden className="flex gap-1"><i className="w-2 h-2 rounded-full bg-[var(--border)]" /><i className="w-2 h-2 rounded-full bg-[var(--border)]" /><i className="w-2 h-2 rounded-full bg-[var(--border)]" /></span>
          ifcvieweronline.eu/deliver/{project.code.toLowerCase()}-{supplier.originator.toLowerCase()}-…
        </div>
        <div className="bg-[var(--surface)]">
          <div className="flex items-center gap-3 px-5 pt-5">
            <span aria-hidden className="grid place-items-center w-10 h-10 rounded-[10px] text-[13px] font-semibold text-white" style={{ background: '#1f5f7a' }}>{project.client.split(' ').slice(0, 2).map((w) => w[0]).join('')}</span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight truncate">{project.name}</p>
              <p className="text-[12px] text-[var(--text-dim)] truncate">{rx('Delivery for {{client}} · as {{supplier}}', { client: project.client, supplier: supplier.name })}</p>
            </div>
          </div>

          {c === 'expired' ? (
            <div className="text-center px-5 py-10">
              <p className="text-[15px] font-semibold">{rx('This upload link has expired')}</p>
              <p className="text-[13px] text-[var(--text-dim)] mt-1.5">{rx('Ask {{who}} at {{client}} for a new link. Your files are not lost: nothing was uploaded.', { who: 'Laura Méndez', client: project.client })}</p>
              <p className="text-[12px] text-[var(--text-faint)] mt-4">{rx('You can still check your model for free in the viewer, without an account.')}</p>
            </div>
          ) : (
            <div className="px-5 pb-5">
              <ol className="grid grid-cols-3 gap-1.5 my-4" aria-label={rx('Step {{n}} of 3', { n: step })}>
                {STEPS.map((label, i) => (
                  <li key={label} className="text-[11.5px]">
                    <span className="block h-1 rounded-full mb-1" style={{ background: i < step ? 'var(--accent)' : 'var(--border)' }} />
                    <span className={i + 1 === step ? 'text-[var(--text)] font-medium' : 'text-[var(--text-faint)]'}>{i + 1}. {rx(label)}</span>
                  </li>
                ))}
              </ol>

              {step === 1 && (
                <div className="space-y-3">
                  <ul className="text-[12.5px] text-[var(--text-dim)] space-y-1.5">
                    <li>✓ {rx('Requirements: {{profile}} v{{v}}, minimum score {{min}}', { profile: project.profile, v: project.profileVersion, min: project.minScore })}</li>
                    <li>✓ {rx('File name: {{example}}', { example: `${project.code}-${supplier.originator}-ZZ-XX-M3-…-0001-S2-P01.ifc` })}</li>
                    <li>✓ {rx('Next delivery due Monday at 12:00')}</li>
                  </ul>
                  <button onClick={() => setStep(2)} className="w-full rounded-[12px] border-2 border-dashed border-[var(--border)] py-9 text-[13.5px] text-[var(--text-dim)] hover:border-[var(--accent)] hover:text-[var(--text)]">
                    <span className="block text-[22px] mb-1" aria-hidden>⇪</span>
                    {rx('Drop your IFC here or choose a file')}
                  </button>
                  <p className="text-[11.5px] text-[var(--text-faint)] text-center">{rx('No account needed. The check runs in your browser and is free.')}</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[30px] font-semibold tabular-nums leading-none" style={{ color: scoreColor(score) }}>{score}</span>
                    <p className="font-mono text-[12px] [overflow-wrap:anywhere] min-w-0">{file}</p>
                  </div>
                  <ul className="text-[12.5px] space-y-1">
                    {checks.map(([label, ok]) => <li key={label} className={ok ? 'text-[var(--text)]' : 'text-[var(--danger)]'}>{ok ? '✓' : '✕'} {label}</li>)}
                  </ul>
                  {!naming.ok && (
                    <div className="rounded-[8px] border border-[var(--danger)] px-3 py-2 text-[12.5px]">
                      <p className="font-medium mb-1">{rx('What to fix')}</p>
                      <ul className="text-[var(--text-dim)] space-y-0.5">{naming.issues.map((x, i) => <li key={i}>· {namingIssueText(x, rx)}</li>)}</ul>
                      <p className="mt-1.5">{rx('Rename it to')} <span className="font-mono">{project.code}-{supplier.originator}-ZZ-02-M3-M-0001-S2-P05.ifc</span></p>
                      {remaining.map((f) => (
                        <p key={f.rule} className="mt-1.5 text-[var(--text-dim)]">· {rx(f.rule)} ({rx('{{n}} elements', { n: f.count })}) {RULE_META[f.rule]?.fixRule && <a className="text-[var(--accent)] hover:underline" href={'/' + fixGuidePath(RULE_META[f.rule].fixRule!, lang)} target="_blank" rel="noopener">{rx('How to fix it (free guide)')} ↗</a>}</p>
                      ))}
                    </div>
                  )}
                  <p className="text-[12.5px] text-[var(--text-dim)]">{pass ? rx('Ready to send. The receiver still reviews it.') : rx('Fix it and check again before sending. You can still send it, but it will most likely be returned.')}</p>
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Quiet onClick={() => setStep(1)}>{rx('Choose another file')}</Quiet>
                    <Primary onClick={() => setStep(3)}>{pass ? rx('Send delivery') : rx('Send anyway')}</Primary>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-2">
                  <p className="text-[15px] font-semibold">✓ {rx('Delivered. {{client}} has been told.', { client: project.client })}</p>
                  <p className="text-[12.5px] text-[var(--text-dim)]">{rx('You will get an e-mail when it is accepted or returned. Keep this receipt:')}</p>
                  <dl className="text-[12px] rounded-[8px] bg-[var(--surface-2)] px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-[var(--text-faint)]">{rx('File')}</dt><dd className="font-mono [overflow-wrap:anywhere]">{file}</dd>
                    <dt className="text-[var(--text-faint)]">SHA-256</dt><dd className="font-mono [overflow-wrap:anywhere]">{hash}</dd>
                    <dt className="text-[var(--text-faint)]">{rx('Received')}</dt><dd>{new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date('2026-11-11T08:42:00Z'))}</dd>
                  </dl>
                  <Quiet onClick={() => setStep(1)}>{rx('Deliver another file')}</Quiet>
                </div>
              )}
            </div>
          )}
          <p className="px-5 py-2.5 border-t border-[var(--border)] text-[11px] text-[var(--text-faint)]">{rx('Checked with IFC Viewer Online · free for suppliers')}</p>
        </div>
      </div>
      <p className="text-[11.5px] text-[var(--text-faint)] text-center mt-2">{rx('Preview of the supplier page. Uploads are not open yet.')}</p>
    </>
  )
}
