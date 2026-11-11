// Why a company can trust this with its models: where the data lives, how a
// certificate is checked and whose code reads the file. Facts only — no
// customer logos, none of them have given permission.

import { Server, BadgeCheck, Code2 } from 'lucide-react'
import { useTx } from './i18n'

export default function TrustStrip() {
  const tx = useTx()
  const items = [
    { icon: Server, title: tx('Your data stays in the EU'), body: tx('Paid storage and cloud jobs run on EU servers. Files sent for a job are deleted when it ends.') },
    { icon: BadgeCheck, title: tx('Certificates anyone can check'), body: tx('Each one carries the file hash and a public link. Your client verifies it without an account.') },
    { icon: Code2, title: tx('Open-source engine'), body: tx('Models are read by open-source IFC libraries. You can read the code that reads your file.') },
  ]
  return (
    <section aria-label={tx('Why you can trust it')} className="mt-6" data-tour="trust">
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 min-w-0 rounded-[10px] border border-[var(--border)] px-4 py-3">
            <Icon aria-hidden size={16} className="mt-0.5 shrink-0 text-[var(--text-dim)]" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{title}</p>
              <p className="mt-0.5 text-[12px] text-[var(--text-dim)] leading-[1.5]">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
