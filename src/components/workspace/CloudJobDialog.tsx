// Launch a cloud job: the credit cost is shown and confirmed before anything
// runs (docs-planning/09 §5), with where and for how long the file is kept.
// Design only — "Run" closes the dialog; nothing is uploaded.

import { useState } from 'react'
import { PAID_FEATURES, type PaidFeatureId } from '../../lib/pricing/catalog'
import { estimateCredits } from './sample-data'

const RUNNABLE: PaidFeatureId[] = ['auto_fix', 'certificate', 'server_validation', 'clash', 'geometry_deep', 'cobie']

export default function CloudJobDialog({ balance, onClose, onTopUp }: { balance: number; onClose: () => void; onTopUp?: () => void }) {
  const [feature, setFeature] = useState<PaidFeatureId>('auto_fix')
  const [sizeMb, setSizeMb] = useState(86)
  const cost = estimateCredits(feature, sizeMb)
  const enough = cost <= balance
  const meta = PAID_FEATURES.find((f) => f.id === feature)!

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="job-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text)]" onClick={(e) => e.stopPropagation()}>
        <h2 id="job-title" className="text-[17px] font-semibold">Run a cloud job</h2>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {RUNNABLE.map((id) => {
            const f = PAID_FEATURES.find((x) => x.id === id)!
            return (
              <button
                key={id}
                onClick={() => setFeature(id)}
                aria-pressed={feature === id}
                className={`text-left rounded-[9px] border px-3 py-2 text-[12.5px] ${feature === id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}
              >
                {f.title}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-[12px] text-[var(--text-dim)]">{meta.description}</p>

        <label className="mt-4 block text-[12px] text-[var(--text-dim)]">
          File (sample): HCA_ARQ_v4.ifc ·{' '}
          <select value={sizeMb} onChange={(e) => setSizeMb(Number(e.target.value))} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[6px] px-1.5 py-0.5 text-[var(--text)]">
            {[24, 86, 180, 412].map((s) => <option key={s} value={s}>{s} MB</option>)}
          </select>
        </label>

        <div className="mt-5 rounded-[10px] bg-[var(--surface-2)] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px]">This job costs</span>
            <span className="text-[22px] font-semibold">{cost} credits</span>
          </div>
          <p className="text-[12px] text-[var(--text-dim)] mt-1">
            {enough ? `Balance after: ${balance - cost}.` : `You have ${balance}.`} If the job fails on our side, the credits come back automatically.
          </p>
        </div>

        <ul className="mt-4 space-y-1 text-[11.5px] text-[var(--text-dim)]">
          <li>· The file is processed on our servers in the EU and deleted when the job ends (at the latest after 24 h).</li>
          <li>· Results stay in your workspace; corrected files are downloadable for 7 days.</li>
          <li>· Nothing runs in the cloud unless you start it here — the free tools keep working in your browser.</li>
        </ul>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="h-[34px] px-4 rounded-[9px] text-[13px] border border-[var(--border)]">Cancel</button>
          <button
            onClick={enough ? onClose : onTopUp}
            className="h-[34px] px-4 rounded-[9px] text-[13px] font-medium bg-[var(--accent)] text-white"
          >
            {enough ? `Run for ${cost} credits` : `Top up — ${cost - balance} more needed`}
          </button>
        </div>
      </div>
    </div>
  )
}
