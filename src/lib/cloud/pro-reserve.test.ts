import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../analytics', () => ({
  trackProReserveClicked: vi.fn(),
  trackEmailCaptured: vi.fn(),
}))

import { trackEmailCaptured, trackProReserveClicked } from '../analytics'
import {
  isBillingEnabled, isBillingOffCode, isProReserved, reservePro, takeWelcome,
  isNewAccount, RESERVED_KEY, NEW_ACCOUNT_WINDOW_MS,
} from './pro-reserve'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}

beforeEach(() => vi.clearAllMocks())

describe('isBillingEnabled', () => {
  it('is off when unset or false', () => {
    expect(isBillingEnabled({})).toBe(false)
    expect(isBillingEnabled({ VITE_BILLING_ENABLED: 'false' })).toBe(false)
    expect(isBillingEnabled({ VITE_BILLING_ENABLED: '' })).toBe(false)
  })
  it('is on for true / 1', () => {
    expect(isBillingEnabled({ VITE_BILLING_ENABLED: 'true' })).toBe(true)
    expect(isBillingEnabled({ VITE_BILLING_ENABLED: ' TRUE ' })).toBe(true)
    expect(isBillingEnabled({ VITE_BILLING_ENABLED: '1' })).toBe(true)
  })
  it('billing-off codes', () => {
    expect(isBillingOffCode('service_disabled')).toBe(true)
    expect(isBillingOffCode('cloud_disabled')).toBe(true)
    expect(isBillingOffCode('network')).toBe(false)
  })
})

describe('reservePro', () => {
  it('subscribes the known email with the surface source and remembers it', async () => {
    const storage = mem()
    const subscribe = vi.fn().mockResolvedValue({ ok: true })
    expect(isProReserved(storage)).toBe(false)
    const r = await reservePro('a@b.eu', 'account', 'es', { subscribe, storage })
    expect(r).toBe('reserved')
    expect(subscribe).toHaveBeenCalledWith('a@b.eu', 'checkout_disabled:account', 'es')
    expect(storage.getItem(RESERVED_KEY)).toBe('1')
    expect(isProReserved(storage)).toBe(true)
    expect(trackProReserveClicked).toHaveBeenCalledWith({ surface: 'account' })
    // INV-5: no email in analytics
    expect(trackEmailCaptured).toHaveBeenCalledWith({ source: 'checkout_disabled:account', already_subscribed: false, locale: 'es' })
  })
  it('already on the list counts as reserved', async () => {
    const storage = mem()
    const r = await reservePro('a@b.eu', 'dashboard', 'en', { subscribe: vi.fn().mockResolvedValue({ ok: false, already: true }), storage })
    expect(r).toBe('reserved')
    expect(isProReserved(storage)).toBe(true)
  })
  it('failure or missing email is not remembered', async () => {
    const storage = mem()
    expect(await reservePro('a@b.eu', 'welcome', 'en', { subscribe: vi.fn().mockResolvedValue({ ok: false, error: 'x' }), storage })).toBe('failed')
    expect(await reservePro('a@b.eu', 'welcome', 'en', { subscribe: vi.fn().mockRejectedValue(new Error('x')), storage })).toBe('failed')
    const sub = vi.fn()
    expect(await reservePro(null, 'welcome', 'en', { subscribe: sub, storage })).toBe('failed')
    expect(sub).not.toHaveBeenCalled()
    expect(isProReserved(storage)).toBe(false)
    expect(trackEmailCaptured).not.toHaveBeenCalled()
  })
})

describe('welcome once', () => {
  it('shows once per account per device, never again', () => {
    const storage = mem()
    expect(takeWelcome('user_1', storage)).toBe(true)
    expect(takeWelcome('user_1', storage)).toBe(false)
    expect(takeWelcome('user_1', storage)).toBe(false)
    expect(takeWelcome('user_2', storage)).toBe(true)
  })
  it('no user or no storage: no welcome', () => {
    expect(takeWelcome(null, mem())).toBe(false)
    expect(takeWelcome('u', null)).toBe(false)
  })
  it('isNewAccount: < 10 min', () => {
    const now = 1_000_000_000
    expect(isNewAccount(now - 60_000, now)).toBe(true)
    expect(isNewAccount(now - NEW_ACCOUNT_WINDOW_MS, now)).toBe(false)
    expect(isNewAccount(null, now)).toBe(false)
  })
})
