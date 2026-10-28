import { creditsLeftRatio, type WorkspaceData } from './sample-data'
import { fmtInt } from './ui'
import { useTx } from './i18n'

/** Balance, where it comes from and when it renews — plan credits first. */
export default function CreditBar({ data, onTopUp }: { data: WorkspaceData; onTopUp: () => void }) {
  const tx = useTx()
  const c = data.account.credits
  const planLeft = c.planMonthly - c.planUsed
  const total = c.planMonthly + c.packs || 1
  const low = creditsLeftRatio(c) <= 0.2
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[28px] font-semibold tabular-nums tracking-[-0.02em]">{fmtInt(c.balance)}</span>
        <span className="text-[13px] text-[var(--text-dim)]">{tx("credits left")}</span>
        {low && <button onClick={onTopUp} className="ml-auto text-[12.5px] font-medium text-[var(--accent)] hover:underline min-h-[32px]">{tx("Top up →")}</button>}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden flex" role="meter" aria-label={tx("Credits left")} aria-valuenow={c.balance} aria-valuemin={0} aria-valuemax={total}>
        <div style={{ width: `${(planLeft / total) * 100}%`, background: low ? 'var(--warn)' : 'var(--text-dim)' }} />
        <div style={{ width: `${(c.packs / total) * 100}%`, background: 'var(--text-faint)' }} />
      </div>
      <p className="mt-2 text-[12px] text-[var(--text-dim)]">
        {tx("{{n}} from your plan, renewing {{date}} (unused plan credits don't roll over).", { n: planLeft, date: data.account.renewsOn })}
        {c.packs > 0 && <> {tx('{{n}} from packs, valid until {{date}}.', { n: c.packs, date: c.packsExpireOn })}</>} {tx('Plan credits are spent first.')}
      </p>
    </div>
  )
}
