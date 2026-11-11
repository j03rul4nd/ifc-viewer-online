// ─── cloud/admin-finance-client ───────────────────────────────────────────────
// Our own books (super admin). Same transport as admin-middleware-client.

import { adminRequest, type Res } from './admin-middleware-client'

export interface FinanceReport {
  status: 'ok' | 'warn' | 'bad'
  signals: { level: 'ok' | 'warn' | 'bad'; text: string }[]
  months: { month: string; income: number; expense: number; net: number }[]
  cash: { balance: number | null; at: string | null; burn: number; net_avg: number; runway_months: number | null }
  year: { revenue: number; cost: number; profit: number; gross_margin: number | null }
  subscriptions: { mrr_estimate: number; paying: number; churned_90d: number }
  reserves: { tax: number; safety: number; debt: number }
  free_cash: number | null
  reinvest: { ads: number; features: number; compute: number; kept: number }
  ads: { arpa: number; churn_monthly: number; ltv: number; max_cac: number; customers_affordable: number }
  financing: { credit_line: number; debt: number; prudent_headroom: number; leverage: number | null }
  policy: { reserveMonths: number; taxPct: number; adsPct: number; featuresPct: number; computePct: number; creditLineCents: number; debtCents: number }
  entries: { id: string; kind: 'income' | 'expense'; category: string; description: string; amount_cents: number; month: string; recurring: boolean; until_month: string | null }[]
}
export interface CommitResult { monthly_saving: number; total_commitment: number; saving_over_term: number; break_even_use_pct: number | null; fits_free_cash: boolean; verdict: 'buy' | 'wait_for_cash' | 'skip' }

export const adminFin = {
  load: (t: string, months: number): Promise<Res<FinanceReport>> => adminRequest(t, `/admin/finance?months=${months}`),
  cash: (t: string, balance_cents: number, at: string) => adminRequest<unknown>(t, '/admin/finance/cash', 'POST', { balance_cents, at }),
  policy: (t: string, p: Record<string, number>) => adminRequest<unknown>(t, '/admin/finance/policy', 'PUT', p),
  addEntry: (t: string, b: object) => adminRequest<unknown>(t, '/admin/finance/entries', 'POST', b),
  deleteEntry: (t: string, id: string) => adminRequest<unknown>(t, `/admin/finance/entries/${id}`, 'DELETE'),
  commitment: (t: string, b: object): Promise<Res<CommitResult>> => adminRequest(t, '/admin/finance/commitment', 'POST', b),
}
