// ─── Checkout model (provider-agnostic) ───────────────────────────────────────
// Everything the checkout screen needs to show the buyer the exact total before
// they leave for the payment page: VAT by country, the B2B reverse charge and
// the plan period. Pure and isomorphic — no provider SDK in here.
//
// Catalogue prices are VAT-inclusive for consumers (docs-planning/09 §2). The
// payment provider (a merchant of record, docs-planning/08) is the authority
// at charge time; this mirrors its arithmetic so the number on our screen is
// the number on theirs. A provider is plugged in through `CheckoutProvider`,
// so swapping the preview stub for the real one touches no UI.

import { PLANS, CREDIT_PACKS, type PlanId, type BillingPeriod } from './catalog'

/** Seller's country: intra-country B2B sales are never reverse-charged. */
export const SELLER_COUNTRY = 'ES'

/** Standard VAT rates, EU-27 (2026). Non-EU buyers pay no EU VAT. */
export const EU_VAT_RATES: Record<string, number> = {
  AT: 20, BE: 21, BG: 20, CY: 19, CZ: 21, DE: 19, DK: 25, EE: 24, ES: 21, FI: 25.5,
  FR: 20, GR: 24, HR: 25, HU: 27, IE: 23, IT: 22, LT: 21, LU: 17, LV: 21, MT: 18,
  NL: 21, PL: 23, PT: 23, RO: 21, SE: 25, SI: 22, SK: 23,
}

export const CHECKOUT_COUNTRIES: { code: string; name: string }[] = [
  ...Object.keys(EU_VAT_RATES).map((code) => ({ code, name: regionName(code) })),
  { code: 'GB', name: regionName('GB') }, { code: 'CH', name: regionName('CH') },
  { code: 'NO', name: regionName('NO') }, { code: 'US', name: regionName('US') },
].sort((a, b) => a.name.localeCompare(b.name))

function regionName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code } catch { return code }
}

export type CheckoutItem =
  | { kind: 'plan'; plan: Exclude<PlanId, 'free' | 'business'>; period: BillingPeriod }
  | { kind: 'pack'; pack: string }

export interface Buyer {
  country: string
  /** Buying as a business: invoice to a company, with its VAT ID when it has one. */
  business: boolean
  vatId?: string
  companyName?: string
}

export interface CheckoutQuote {
  label: string
  detail: string
  /** What the catalogue shows, VAT included at the seller's rate. */
  listEur: number
  netEur: number
  vatRate: number
  vatEur: number
  totalEur: number
  reverseCharge: boolean
  recurring: BillingPeriod | null
  /** Yearly plans: what twelve monthly payments would have cost. */
  savingEur: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Shape check only (prefix + 2–12 alphanumerics); VIES confirms it server-side. */
export function looksLikeVatId(vatId: string | undefined, country: string): boolean {
  if (!vatId) return false
  const v = vatId.replace(/[\s.-]/g, '').toUpperCase()
  const prefix = country === 'GR' ? 'EL' : country
  return v.startsWith(prefix) && /^[A-Z0-9]{2,12}$/.test(v.slice(prefix.length))
}

export function itemPrice(item: CheckoutItem): { label: string; detail: string; listEur: number; recurring: BillingPeriod | null; savingEur: number } {
  if (item.kind === 'pack') {
    const p = CREDIT_PACKS.find((x) => x.id === item.pack)
    if (!p) throw new Error(`Unknown pack ${item.pack}`)
    return { label: `${p.name} pack`, detail: `${p.credits} credits · valid 12 months`, listEur: p.priceEur, recurring: null, savingEur: 0 }
  }
  const plan = PLANS.find((x) => x.id === item.plan)
  if (!plan || plan.monthlyEur === null || plan.yearlyEur === null) throw new Error(`Plan ${item.plan} is not sold online`)
  const yearly = item.period === 'yearly'
  return {
    label: `${plan.name} — ${yearly ? 'yearly' : 'monthly'}`,
    detail: plan.features[0] ?? plan.audience,
    listEur: yearly ? plan.yearlyEur : plan.monthlyEur,
    recurring: item.period,
    savingEur: yearly ? round2(plan.monthlyEur * 12 - plan.yearlyEur) : 0,
  }
}

/**
 * The exact amount the buyer pays. List prices include Spanish VAT; the net is
 * the same everywhere and the buyer's own rate goes on top (OSS), except a
 * business in another EU country with a VAT ID — reverse charge, net only —
 * and buyers outside the EU, who pay net.
 */
export function quote(item: CheckoutItem, buyer: Buyer): CheckoutQuote {
  const base = itemPrice(item)
  const net = round2(base.listEur / (1 + EU_VAT_RATES[SELLER_COUNTRY] / 100))
  const inEu = buyer.country in EU_VAT_RATES
  const reverseCharge = inEu && buyer.business && buyer.country !== SELLER_COUNTRY && looksLikeVatId(buyer.vatId, buyer.country)
  const vatRate = inEu && !reverseCharge ? EU_VAT_RATES[buyer.country] : 0
  // The buyer's own country keeps the list price to the cent.
  const total = buyer.country === SELLER_COUNTRY && !reverseCharge ? base.listEur : round2(net * (1 + vatRate / 100))
  return {
    label: base.label, detail: base.detail, listEur: base.listEur,
    netEur: net, vatRate, vatEur: round2(total - net), totalEur: total,
    reverseCharge, recurring: base.recurring, savingEur: base.savingEur,
  }
}

export const fmtEur = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n)

// ── Provider seam ─────────────────────────────────────────────────────────────

export type CheckoutOutcome =
  | { status: 'paid'; reference: string }
  | { status: 'canceled' }
  | { status: 'failed'; reason: string }

export interface CheckoutProvider {
  /** Hands the buyer to the payment page and resolves when they come back. */
  start(item: CheckoutItem, buyer: Buyer, quote: CheckoutQuote): Promise<CheckoutOutcome>
}

/** Design preview: nothing is charged; the outcome is chosen by the reviewer. */
export function previewProvider(outcome: CheckoutOutcome['status'], delayMs = 900): CheckoutProvider {
  return {
    start: () => new Promise((resolve) => setTimeout(() => resolve(
      outcome === 'paid' ? { status: 'paid', reference: 'PREVIEW-0001' }
        : outcome === 'canceled' ? { status: 'canceled' }
          : { status: 'failed', reason: 'Your bank declined the payment (card_declined).' },
    ), delayMs)),
  }
}
