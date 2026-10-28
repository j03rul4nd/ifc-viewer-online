// Launch a cloud job: the credit cost is shown and confirmed before anything
// runs (docs-planning/09 §5), with where and for how long the file is kept.
// Design only — "Run" closes the dialog; nothing is uploaded.

import { useState } from 'react'
import { PAID_FEATURES, type PaidFeatureId } from '../../lib/pricing/catalog'
import { estimateCredits } from './sample-data'
import { Dialog, Primary, Quiet } from './ui'
import { useTx } from './i18n'

const RUNNABLE: PaidFeatureId[] = ['auto_fix', 'certificate', 'server_validation', 'clash', 'geometry_deep', 'cobie']

export default function CloudJobDialog({ balance, onClose, onTopUp }: { balance: number; onClose: () => void; onTopUp?: () => void }) {
  const tx = useTx()
  const [feature, setFeature] = useState<PaidFeatureId>('auto_fix')
  const [sizeMb, setSizeMb] = useState(86)
  const cost = estimateCredits(feature, sizeMb)
  const enough = cost <= balance
  const meta = PAID_FEATURES.find((f) => f.id === feature)!

  return (
    <Dialog title={tx("Run a cloud job")} onClose={onClose} size="lg"
      footer={<>
        <Quiet onClick={onClose}>{tx("Cancel")}</Quiet>
        <Primary onClick={enough ? onClose : onTopUp}>{enough ? tx('Run for {{count}} credits', { count: cost }) : tx('Top up — {{count}} more needed', { count: cost - balance })}</Primary>
      </>}>
      <div role="radiogroup" aria-label={tx("Job")} className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {RUNNABLE.map((id) => {
          const f = PAID_FEATURES.find((x) => x.id === id)!
          const on = feature === id
          return (
            <button key={id} role="radio" aria-checked={on} onClick={() => setFeature(id)}
              className={`text-left rounded-[9px] border px-3 py-2.5 text-[12.5px] flex items-center justify-between gap-2 ${on ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
              <span>{tx(f.title)}</span>
              <span className="shrink-0 text-[11px] text-[var(--text-faint)] tabular-nums">{f.credits === null ? tx('plan') : f.creditsNote === 'from' ? tx('from {{n}}', { n: f.credits }) : f.creditsNote === 'per 100 MB' ? tx('{{n}}/100 MB', { n: f.credits }) : f.credits}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[12px] text-[var(--text-dim)]">{tx(meta.description)}</p>

      <label className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-dim)]">
        {tx('File (sample): {{file}}', { file: 'HCA_ARQ_v4.ifc' })}
        <select value={sizeMb} onChange={(e) => setSizeMb(Number(e.target.value))} className="h-[32px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[6px] px-1.5 text-[var(--text)]">
          {[24, 86, 180, 412].map((s) => <option key={s} value={s}>{s} MB</option>)}
        </select>
      </label>

      <div className="mt-5 rounded-[10px] bg-[var(--surface-2)] p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px]">{tx("This job costs")}</span>
          <span className="text-[22px] font-semibold tabular-nums">{tx('{{count}} credits', { count: cost })}</span>
        </div>
        <p className="text-[12px] mt-1" style={{ color: enough ? 'var(--text-dim)' : 'var(--danger)' }}>
          {enough ? tx('Balance after: {{n}}.', { n: balance - cost }) : tx('You have {{n}}.', { n: balance })} <span className="text-[var(--text-dim)]">{tx("If the job fails on our side, the credits come back automatically.")}</span>
        </p>
      </div>

      <ul className="mt-4 space-y-1 text-[11.5px] text-[var(--text-dim)]">
        <li>{tx("· The file is processed on our servers in the EU and deleted when the job ends (at the latest after 24 h).")}</li>
        <li>{tx("· Results stay in your workspace; corrected files are downloadable for 7 days.")}</li>
        <li>{tx("· Nothing runs in the cloud unless you start it here — the free tools keep working in your browser.")}</li>
      </ul>
    </Dialog>
  )
}
