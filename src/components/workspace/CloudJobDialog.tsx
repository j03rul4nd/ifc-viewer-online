// Launch a cloud job: the credit cost is shown and confirmed before anything
// runs (docs-planning/09 §5), with where and for how long the file is kept.
// Design only — "Run" closes the dialog; nothing is uploaded.

import { useState } from 'react'
import { PAID_FEATURES, type PaidFeatureId } from '../../lib/pricing/catalog'
import { estimateCredits } from './sample-data'
import { Dialog, Primary, Quiet } from './ui'

const RUNNABLE: PaidFeatureId[] = ['auto_fix', 'certificate', 'server_validation', 'clash', 'geometry_deep', 'cobie']

export default function CloudJobDialog({ balance, onClose, onTopUp }: { balance: number; onClose: () => void; onTopUp?: () => void }) {
  const [feature, setFeature] = useState<PaidFeatureId>('auto_fix')
  const [sizeMb, setSizeMb] = useState(86)
  const cost = estimateCredits(feature, sizeMb)
  const enough = cost <= balance
  const meta = PAID_FEATURES.find((f) => f.id === feature)!

  return (
    <Dialog title="Run a cloud job" onClose={onClose} size="lg"
      footer={<>
        <Quiet onClick={onClose}>Cancel</Quiet>
        <Primary onClick={enough ? onClose : onTopUp}>{enough ? `Run for ${cost} credits` : `Top up — ${cost - balance} more needed`}</Primary>
      </>}>
      <div role="radiogroup" aria-label="Job" className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {RUNNABLE.map((id) => {
          const f = PAID_FEATURES.find((x) => x.id === id)!
          const on = feature === id
          return (
            <button key={id} role="radio" aria-checked={on} onClick={() => setFeature(id)}
              className={`text-left rounded-[9px] border px-3 py-2.5 text-[12.5px] flex items-center justify-between gap-2 ${on ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
              <span>{f.title}</span>
              <span className="shrink-0 text-[11px] text-[var(--text-faint)] tabular-nums">{f.credits === null ? 'plan' : `${f.creditsNote === 'from' ? 'from ' : ''}${f.credits}${f.creditsNote === 'per 100 MB' ? '/100 MB' : ''}`}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[12px] text-[var(--text-dim)]">{meta.description}</p>

      <label className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-dim)]">
        File (sample): HCA_ARQ_v4.ifc
        <select value={sizeMb} onChange={(e) => setSizeMb(Number(e.target.value))} className="h-[32px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[6px] px-1.5 text-[var(--text)]">
          {[24, 86, 180, 412].map((s) => <option key={s} value={s}>{s} MB</option>)}
        </select>
      </label>

      <div className="mt-5 rounded-[10px] bg-[var(--surface-2)] p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px]">This job costs</span>
          <span className="text-[22px] font-semibold tabular-nums">{cost} credits</span>
        </div>
        <p className="text-[12px] mt-1" style={{ color: enough ? 'var(--text-dim)' : 'var(--danger)' }}>
          {enough ? `Balance after: ${balance - cost}.` : `You have ${balance}.`} <span className="text-[var(--text-dim)]">If the job fails on our side, the credits come back automatically.</span>
        </p>
      </div>

      <ul className="mt-4 space-y-1 text-[11.5px] text-[var(--text-dim)]">
        <li>· The file is processed on our servers in the EU and deleted when the job ends (at the latest after 24 h).</li>
        <li>· Results stay in your workspace; corrected files are downloadable for 7 days.</li>
        <li>· Nothing runs in the cloud unless you start it here — the free tools keep working in your browser.</li>
      </ul>
    </Dialog>
  )
}
