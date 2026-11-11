// What a supplier sees on their upload link, without an account: open the
// link, drop the IFC (checked in their browser, free), send. Shown here as a
// framed preview with three example cases, including an expired link.

import { useState } from 'react'
import { Primary, Quiet, scoreColor } from '../../ui'
import { namingIssueText } from './format'
import { namingOf, type RxProject, type RxSupplier } from './sample'
import type { Rx } from './strings'

type Case = 'pass' | 'name' | 'expired'
const CASES: [Case, string][] = [['pass', 'Passes'], ['name', 'Name fails'], ['expired', 'Link expired']]
export const SUPPLIER_VIEW_LABELS = CASES.map((c) => c[1])

export default function SupplierView({ project, supplier, rx }: { project: RxProject; supplier: RxSupplier; rx: Rx }) {
  const [c, setC] = useState<Case>('pass')
  const [step, setStep] = useState(1)
  const file = c === 'name' ? `${project.code}_${supplier.originator}_planta2_v5.ifc` : `${project.code}-${supplier.originator}-ZZ-02-M3-M-0001-S2-P05.ifc`
  const naming = namingOf(project, { fileName: file })
  const score = c === 'name' ? 84 : 86
  const pass = naming.ok && score >= project.minScore
  const pick = (x: Case) => { setC(x); setStep(1) }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[12.5px] text-[var(--text-dim)] mr-1">{rx('Example')}</span>
        {CASES.map(([id, label]) => (
          <button key={id} onClick={() => pick(id)} aria-pressed={c === id}
            className={`h-[32px] px-3 rounded-full border text-[12.5px] ${c === id ? 'border-[var(--accent)] text-[var(--text)] font-medium' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>{rx(label)}</button>
        ))}
      </div>

      <div className="rounded-[12px] border border-[var(--border)] overflow-hidden max-w-[560px] mx-auto">
        <div className="flex items-center gap-2 px-3 h-[32px] bg-[var(--surface-2)] border-b border-[var(--border)] text-[11.5px] text-[var(--text-faint)] font-mono truncate">
          <span aria-hidden className="flex gap-1"><i className="w-2 h-2 rounded-full bg-[var(--border)]" /><i className="w-2 h-2 rounded-full bg-[var(--border)]" /><i className="w-2 h-2 rounded-full bg-[var(--border)]" /></span>
          ifcvieweronline.eu/deliver/{project.code.toLowerCase()}-{supplier.originator.toLowerCase()}-…
        </div>
        <div className="p-5 bg-[var(--surface)]">
          {c === 'expired' ? (
            <div className="text-center py-6">
              <p className="text-[15px] font-semibold">{rx('This upload link has expired')}</p>
              <p className="text-[13px] text-[var(--text-dim)] mt-1.5">{rx('Ask {{who}} at {{client}} for a new link. Your files are not lost: nothing was uploaded.', { who: 'Laura Méndez', client: project.client })}</p>
            </div>
          ) : (
            <>
              <p className="text-[11.5px] text-[var(--text-faint)]">{rx('Step {{n}} of 3', { n: step })}</p>
              <h3 className="text-[16px] font-semibold mt-0.5">{project.name}</h3>
              <p className="text-[12.5px] text-[var(--text-dim)]">{rx('Delivery for {{client}} · as {{supplier}}', { client: project.client, supplier: supplier.name })}</p>

              {step === 1 && (
                <div className="mt-4 space-y-3">
                  <ul className="text-[12.5px] text-[var(--text-dim)] space-y-1">
                    <li>· {rx('Requirements: {{profile}} v{{v}}, minimum score {{min}}', { profile: project.profile, v: project.profileVersion, min: project.minScore })}</li>
                    <li>· {rx('File name: {{example}}', { example: `${project.code}-${supplier.originator}-ZZ-XX-M3-…-0001-S2-P01.ifc` })}</li>
                    <li>· {rx('No account needed. The check runs in your browser and is free.')}</li>
                  </ul>
                  <button onClick={() => setStep(2)} className="w-full rounded-[10px] border border-dashed border-[var(--border)] py-8 text-[13px] text-[var(--text-dim)] hover:bg-[var(--surface-2)]">
                    {rx('Drop your IFC here or choose a file')}
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="mt-4 space-y-3">
                  <p className="font-mono text-[12.5px] [overflow-wrap:anywhere]">{file}</p>
                  <div className="flex items-baseline gap-2"><span className="text-[22px] font-semibold tabular-nums" style={{ color: scoreColor(score) }}>{score}</span><span className="text-[12.5px] text-[var(--text-dim)]">{rx('minimum {{min}}', { min: project.minScore })}</span></div>
                  <p className={`text-[12.5px] ${naming.ok ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}>{naming.ok ? rx('The file name follows the rule.') : rx('The file name does not follow the rule:')}</p>
                  {!naming.ok && <ul className="text-[12.5px] text-[var(--danger)]">{naming.issues.map((x, i) => <li key={i}>· {namingIssueText(x, rx)}</li>)}</ul>}
                  <p className="text-[12.5px] text-[var(--text-dim)]">{pass ? rx('Ready to send. The receiver still reviews it.') : rx('Fix it and check again before sending. You can still send it, but it will most likely be returned.')}</p>
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Quiet onClick={() => setStep(1)}>{rx('Choose another file')}</Quiet>
                    <Primary onClick={() => setStep(3)}>{pass ? rx('Send delivery') : rx('Send anyway')}</Primary>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[14px] font-medium">{rx('Delivered. {{client}} has been told.', { client: project.client })}</p>
                  <p className="text-[12.5px] text-[var(--text-dim)]">{rx('You will get an e-mail when it is accepted or returned. Keep this receipt:')}</p>
                  <p className="font-mono text-[11.5px] rounded-[8px] bg-[var(--surface-2)] px-3 py-2 [overflow-wrap:anywhere]">{file}<br />SHA-256 9f2c41d0…e7a3 · 2026-11-11 09:42 CET</p>
                  <Quiet onClick={() => setStep(1)}>{rx('Deliver another file')}</Quiet>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <p className="text-[11.5px] text-[var(--text-faint)] text-center mt-2">{rx('Preview of the supplier page. Uploads are not open yet.')}</p>
    </>
  )
}
