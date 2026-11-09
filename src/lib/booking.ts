// ─── Calls with Joel ──────────────────────────────────────────────────────────
// Our own booking page (/call) instead of a paid scheduler. The Worker
// (cf-worker/worker.js, /booking) keeps the hours, the slots and the bookings in
// KV; the call itself is a Jitsi room, so nobody needs an account. Mail is sent
// only when the Worker has a verified sender; the page always offers an .ics
// and calendar links, so a booking never depends on mail arriving.

const ENDPOINT = '/api/booking'

export interface Booking {
  slot: string
  duration: number
  meet_url: string
  email: string
  note: string
  request_id: string
}

export interface BookingConfig {
  tz: string
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  times: string[]
  duration: number
  /** Local dates (YYYY-MM-DD) with no calls. */
  blocked: string[]
}

export interface AdminCall extends Booking { user_id: string; lang: string; user_tz: string; created_at: string }

export type BookingError = 'unauthorized' | 'slot_gone' | 'already_booked' | 'email' | 'rate_limited' | 'unavailable' | 'network'

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

async function errorOf(res: Response): Promise<BookingError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  const known: BookingError[] = ['unauthorized', 'slot_gone', 'already_booked', 'email', 'rate_limited']
  return known.find((k) => k === body.error) ?? (res.status === 401 ? 'unauthorized' : 'unavailable')
}

export async function loadSlots(token: string, fetchImpl: typeof fetch = fetch):
Promise<{ ok: true; slots: string[]; duration: number; booking: Booking | null } | { ok: false; error: BookingError }> {
  try {
    const res = await fetchImpl(ENDPOINT, { headers: auth(token), cache: 'no-store' })
    if (!res.ok) return { ok: false, error: await errorOf(res) }
    const body = (await res.json()) as { slots?: string[]; duration?: number; booking?: Booking | null }
    return { ok: true, slots: Array.isArray(body.slots) ? body.slots : [], duration: body.duration ?? 20, booking: body.booking ?? null }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export async function bookSlot(
  token: string,
  input: { slot: string; email: string; note: string; request_id: string; tz: string; lang: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; booking: Booking; mailed: boolean } | { ok: false; error: BookingError }> {
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify(input),
    })
    if (!res.ok) return { ok: false, error: await errorOf(res) }
    const body = (await res.json()) as { booking: Booking; mailed?: boolean }
    return { ok: true, booking: body.booking, mailed: body.mailed === true }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export async function cancelBooking(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(ENDPOINT, { method: 'DELETE', headers: auth(token) })
    return res.ok
  } catch {
    return false
  }
}

export async function loadAdminCalls(token: string, fetchImpl: typeof fetch = fetch):
Promise<{ ok: true; calls: AdminCall[]; config: BookingConfig; mail: boolean } | { ok: false }> {
  try {
    const res = await fetchImpl(`${ENDPOINT}?all=1`, { headers: auth(token), cache: 'no-store' })
    if (!res.ok) return { ok: false }
    const body = (await res.json()) as { calls?: AdminCall[]; config: BookingConfig; mail?: boolean }
    return { ok: true, calls: body.calls ?? [], config: body.config, mail: body.mail === true }
  } catch {
    return { ok: false }
  }
}

export async function saveBookingConfig(token: string, config: Partial<BookingConfig>, fetchImpl: typeof fetch = fetch):
Promise<{ ok: true; config: BookingConfig } | { ok: false }> {
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify(config),
    })
    if (!res.ok) return { ok: false }
    return { ok: true, config: ((await res.json()) as { config: BookingConfig }).config }
  } catch {
    return { ok: false }
  }
}

/** The viewer's own zone, falling back to UTC. */
export function localZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

/** Slots grouped by the viewer's local day, in order. */
export function groupByDay(slots: string[], tz: string): { day: string; slots: string[] }[] {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const out: { day: string; slots: string[] }[] = []
  for (const s of [...slots].sort()) {
    const day = key.format(new Date(s))
    const last = out[out.length - 1]
    if (last && last.day === day) last.slots.push(s)
    else out.push({ day, slots: [s] })
  }
  return out
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** A calendar file for the call (opens in Outlook, Apple Calendar, Google…). */
export function bookingIcs(b: Booking, title: string): string {
  const start = Date.parse(b.slot)
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IFC Viewer Online//Calls//EN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${b.meet_url.split('/').pop()}@ifcvieweronline.eu`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + b.duration * 60_000)}`,
    `SUMMARY:${title}`, `LOCATION:${b.meet_url}`, `URL:${b.meet_url}`, `DESCRIPTION:${b.meet_url}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}

export function googleCalendarUrl(b: Booking, title: string): string {
  const start = Date.parse(b.slot)
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(start)}/${stamp(start + b.duration * 60_000)}`,
    details: b.meet_url,
    location: b.meet_url,
  })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

export function outlookCalendarUrl(b: Booking, title: string): string {
  const start = Date.parse(b.slot)
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: new Date(start).toISOString(),
    enddt: new Date(start + b.duration * 60_000).toISOString(),
    body: b.meet_url,
    location: b.meet_url,
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`
}
