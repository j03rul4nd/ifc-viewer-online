// ─── cloud/admin-middleware-client ────────────────────────────────────────────
// The super-admin surface of the data middleware. Same rules as admin-client: the
// caller passes the token, and nothing is fetched without VITE_API_URL. The API's
// own message reaches the screen, because its refusals are the business rules.

const TIMEOUT_MS = 15_000

export type Res<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined }

async function request<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<Res<T>> {
  const base = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
  if (!base) return { ok: false, error: 'La API no está configurada.' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${path}`, { method, signal: controller.signal, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
    if (res.ok) return { ok: true, value: data as T }
    return { ok: false, error: data?.error?.message ?? data?.error?.code ?? `HTTP ${res.status}` }
  } catch {
    return { ok: false, error: 'Sin conexión con la API.' }
  } finally {
    clearTimeout(timer)
  }
}

export interface LogLine { at: string; message: string }
export interface AdminDeal { id: string; workspaceId: string | null; company: string; contact: string | null; useCase: string | null; fit: string; fitReasons: string[]; status: string; tier: string | null; annualCents: number | null; setupCents: number | null; discountPct: number; lostReason: string | null }
export interface AdminCharge { id: string; workspaceId: string; description: string; amountCents: number; status: string; invoiceRef: string | null; createdAt: string }
export interface AdminTicket { id: string; workspaceId: string; subject: string; message: string; acceptOverage: boolean }
export interface AdminService { id: string; name: string; status: string; review_status: string; repo_url: string | null; purpose: string | null; declared_hosts: string[]; workspace_id: string }
export interface AdminCustomer { workspace_id: string; tier: string; paid_until: string | null; minutes: number; absorbed_minutes: number; revenue_eur: number; infra_eur: number; margin: number | null; below_floor: boolean }
export interface AdminQuote { annual_cents: number; setup_cents: number; total_first_payment_cents: number; enterprise: { quota_gb_hours: number; cost_year_eur: number } | null }
export interface AdminMwData {
  services: AdminService[]
  tickets: AdminTicket[]
  charges: { charges: AdminCharge[]; to_collect_cents: number }
  margins: { floor: number; below_floor: number; customers: AdminCustomer[] }
  deals: { deals: AdminDeal[]; list_factor_pct: number; raise_due: boolean; stats: { won: number; lost: number; win_rate: number | null; median_annual_cents: number | null; objected: number; avg_discount_pct: number; lost_by: Record<string, number>; alternatives: string[] } }
}

const P = '/admin/middleware'

export const adminMw = {
  async load(t: string, hourCost: number): Promise<Res<AdminMwData>> {
    const [all, tickets, charges, margins, deals] = await Promise.all([
      request<{ services: AdminService[] }>(t, P), request<{ tickets: AdminTicket[] }>(t, `${P}/tickets`), request<AdminMwData['charges']>(t, `${P}/charges`),
      request<AdminMwData['margins']>(t, `${P}/margins?hour_cost=${hourCost}`), request<AdminMwData['deals']>(t, `${P}/deals`),
    ])
    for (const r of [all, tickets, charges, margins, deals]) if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, value: { services: all.value!.services, tickets: tickets.value!.tickets, charges: charges.value!, margins: margins.value!, deals: deals.value! } }
  },
  logs: (t: string, id: string) => request<{ available: boolean; lines: LogLine[] }>(t, `${P}/services/${id}/logs`),
  review: (t: string, id: string, decision: 'approved' | 'rejected', note: string) => request<unknown>(t, `${P}/services/${id}/review`, 'POST', { decision, note }),
  closeTicket: (t: string, id: string) => request<unknown>(t, `${P}/tickets/${id}/close`, 'POST'),
  logTime: (t: string, ws: string, b: { minutes: number; category: string; note: string; ticket_id?: string }) => request<unknown>(t, `${P}/${ws}/time`, 'POST', b),
  createDeal: (t: string, company: string) => request<unknown>(t, `${P}/deals`, 'POST', { company }),
  loseDeal: (t: string, id: string, lost_reason: string, alt_price_note: string) => request<unknown>(t, `${P}/deals/${id}`, 'PATCH', { status: 'lost', lost_reason, ...(alt_price_note ? { alt_price_note } : {}) }),
  async quote(t: string, b: object): Promise<Res<AdminQuote>> {
    const r = await request<{ quote: AdminQuote }>(t, `${P}/quote`, 'POST', b)
    return r.ok ? { ok: true, value: r.value.quote } : r
  },
  win: (t: string, id: string, b: object) => request<unknown>(t, `${P}/deals/${id}/win`, 'POST', b),
  raise: (t: string) => request<unknown>(t, `${P}/prices/raise`, 'POST'),
  charge: (t: string, id: string, status: 'invoiced' | 'paid' | 'void', invoice_ref?: string) => request<unknown>(t, `${P}/charges/${id}`, 'PATCH', { status, ...(invoice_ref ? { invoice_ref } : {}) }),
}
