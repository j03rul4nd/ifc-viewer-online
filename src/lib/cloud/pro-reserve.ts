// ─── Pro reserve + first-sign-in welcome (T-328) ─────────────────────────────
// While billing is off (VITE_BILLING_ENABLED unset — prod today) a signed-in
// free user reserves Pro with one tap: their Clerk email goes to the existing
// /subscribe list with source `checkout_disabled:<surface>`. Pure helpers —
// storage is injectable so the logic is unit-tested without a DOM.

import { subscribeEmail, type SubscribeResult } from '../subscribe'
import { trackEmailCaptured, trackProReserveClicked, type ProReserveSurface } from '../analytics'

/** Billing is on only when VITE_BILLING_ENABLED is exactly "true" or "1". */
export function isBillingEnabled(env: Record<string, unknown> = import.meta.env): boolean {
  const v = String(env.VITE_BILLING_ENABLED ?? '').trim().toLowerCase()
  return v === 'true' || v === '1'
}

/** Checkout error codes that mean "payments are not open", never a real failure. */
export const isBillingOffCode = (code: string): boolean =>
  code === 'service_disabled' || code === 'cloud_disabled'

type KV = Pick<Storage, 'getItem' | 'setItem'>

const safeStorage = (): KV | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export const RESERVED_KEY = 'ifc.proReserved'
export const WELCOME_KEY_PREFIX = 'ifc.welcomeSeen.'

export function isProReserved(storage: KV | null = safeStorage()): boolean {
  try { return storage?.getItem(RESERVED_KEY) === '1' } catch { return false }
}

export type ReserveOutcome = 'reserved' | 'failed'

/** One tap: the email is already known. Success (or already listed) is remembered. */
export async function reservePro(
  email: string | null,
  surface: ProReserveSurface,
  locale = 'en',
  deps: { subscribe?: typeof subscribeEmail; storage?: KV | null } = {},
): Promise<ReserveOutcome> {
  const subscribe = deps.subscribe ?? subscribeEmail
  const storage = deps.storage === undefined ? safeStorage() : deps.storage
  trackProReserveClicked({ surface })
  if (!email) return 'failed'
  const source = `checkout_disabled:${surface}`
  let r: SubscribeResult
  try { r = await subscribe(email, source, locale) } catch { return 'failed' }
  if (!r.ok && !r.already) return 'failed'
  try { storage?.setItem(RESERVED_KEY, '1') } catch { /* private mode: in-memory only */ }
  trackEmailCaptured({ source, already_subscribed: Boolean(r.already), locale })
  return 'reserved'
}

export const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000

/** Account created less than 10 minutes ago. */
export const isNewAccount = (createdAt: number | null | undefined, now = Date.now()): boolean =>
  createdAt != null && now - createdAt >= 0 && now - createdAt < NEW_ACCOUNT_WINDOW_MS

/**
 * Show the welcome once per account per device: when the account is new
 * (< 10 min) or seen on this device for the first time. Returns true at most
 * once — calling it marks it as seen.
 */
export function takeWelcome(
  userId: string | null,
  storage: KV | null = safeStorage(),
): boolean {
  if (!userId || !storage) return false
  const key = WELCOME_KEY_PREFIX + userId
  let seen: boolean
  try { seen = storage.getItem(key) === '1' } catch { return false }
  if (seen) return false
  try { storage.setItem(key, '1') } catch { return false }
  // Unseen on this device = first time seen here; a brand-new account
  // (isNewAccount) is always unseen, so both triggers collapse into this check.
  return true
}
