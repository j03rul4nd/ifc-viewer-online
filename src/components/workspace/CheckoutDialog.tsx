// Checkout confirmation. The unticked consent box is the EU requirement for
// digital content supplied immediately (TRLGDCU art. 103 m, docs-planning/09
// §2.4): without it the buyer keeps the 14-day withdrawal right on everything.
// Design only — nothing is charged.

import { useState } from 'react'

export interface CheckoutItem {
  kind: 'plan' | 'pack'
  id: string
  name: string
  priceEur: number
}

export default function CheckoutDialog({ item, onClose }: { item: CheckoutItem; onClose: () => void }) {
  const [startNow, setStartNow] = useState(false)
  const [terms, setTerms] = useState(false)

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text)]" onClick={(e) => e.stopPropagation()}>
        <h2 id="checkout-title" className="text-[17px] font-semibold">Confirm purchase</h2>
        <div className="mt-4 flex items-baseline justify-between rounded-[10px] bg-[var(--surface-2)] p-4">
          <span className="text-[13.5px]">{item.name}</span>
          <span className="text-[20px] font-semibold">€{item.priceEur}</span>
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">
          {item.kind === 'plan' ? 'Renews automatically until you cancel. Cancel any time from Credits & billing.' : 'One-off payment. Credits are valid for 12 months.'} VAT included where applicable.
        </p>

        <label className="mt-5 flex items-start gap-2.5 text-[12.5px]">
          <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} className="mt-0.5" />
          <span>I want to use my credits and cloud features straight away, and I understand that I lose the 14-day right of withdrawal for whatever I have already used. Unused credits remain refundable within 14 days.</span>
        </label>
        <label className="mt-3 flex items-start gap-2.5 text-[12.5px]">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
          <span>I accept the Terms of Use and have read the Privacy Policy.</span>
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="h-[34px] px-4 rounded-[9px] text-[13px] border border-[var(--border)]">Cancel</button>
          <button onClick={onClose} disabled={!terms} className="h-[34px] px-4 rounded-[9px] text-[13px] font-medium bg-[var(--accent)] text-white disabled:opacity-50">
            Continue to payment
          </button>
        </div>
        {!startNow && terms && (
          <p className="mt-3 text-[11.5px] text-[var(--text-dim)]">Without the first box, cloud features unlock once the 14-day withdrawal period ends.</p>
        )}
      </div>
    </div>
  )
}
