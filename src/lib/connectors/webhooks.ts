// Outgoing webhooks signed with HMAC-SHA256, retried with backoff, and logged.
// Signature header (Stripe-style, so receivers can reject replays):
//   X-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
// The secret lives with the account (backend); this module never stores it.
import type { Fetch } from './types'

export type WebhookEvent =
  | 'delivery.received' | 'delivery.accepted' | 'delivery.rejected'
  | 'validation.completed' | 'validation.failed' | 'score.dropped'
  | 'issue.created' | 'issue.closed' | 'link.opened'

export interface WebhookPayload<T = unknown> { id: string; event: WebhookEvent; createdAt: string; data: T }

export interface DeliveryAttempt { at: string; status: number | null; error?: string; durationMs: number }

export interface DeliveryRecord {
  id: string
  endpoint: string
  event: WebhookEvent
  attempts: DeliveryAttempt[]
  state: 'delivered' | 'failed'
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)))
}

export async function signatureHeader(secret: string, body: string, unixSeconds: number): Promise<string> {
  return `t=${unixSeconds},v1=${await hmac(secret, `${unixSeconds}.${body}`)}`
}

/** For receivers (docs and tests): constant-time check plus a 5-minute window. */
export async function verifySignature(secret: string, body: string, header: string, nowSeconds: number, toleranceS = 300): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(nowSeconds - t) > toleranceS) return false
  const expected = await hmac(secret, `${t}.${body}`)
  if (expected.length !== parts.v1.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i)
  return diff === 0
}

/** Seconds to wait before attempt n (1-based): 0, 30 s, 2 min, 10 min, 1 h, 6 h → ~7 h of tries. */
export const RETRY_SCHEDULE_S = [0, 30, 120, 600, 3600, 21600]

export interface DeliverOptions {
  fetch: Fetch
  secret: string
  /** Waits between attempts; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  schedule?: number[]
}

/** 2xx = delivered. 4xx except 408/429 = the receiver refused: stop, do not retry. */
const retryable = (status: number | null) => status === null || status === 408 || status === 429 || status >= 500

export async function deliver(endpoint: string, payload: WebhookPayload, o: DeliverOptions): Promise<DeliveryRecord> {
  const now = o.now ?? Date.now
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const schedule = o.schedule ?? RETRY_SCHEDULE_S
  const body = JSON.stringify(payload)
  const rec: DeliveryRecord = { id: payload.id, endpoint, event: payload.event, attempts: [], state: 'failed' }
  for (const wait of schedule) {
    if (wait) await sleep(wait * 1000)
    const start = now()
    let status: number | null = null
    let error: string | undefined
    try {
      const res = await o.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event': payload.event,
          'X-Delivery-Id': payload.id,
          'X-Signature': await signatureHeader(o.secret, body, Math.floor(start / 1000)),
        },
        body,
      })
      status = res.status
    } catch (e) {
      error = (e as Error).message
    }
    rec.attempts.push({ at: new Date(start).toISOString(), status, error, durationMs: now() - start })
    if (status !== null && status >= 200 && status < 300) { rec.state = 'delivered'; return rec }
    if (!retryable(status)) return rec
  }
  return rec
}
