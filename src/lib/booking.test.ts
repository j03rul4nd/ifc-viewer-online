import { describe, expect, it, vi } from 'vitest'
import { bookSlot, bookingIcs, googleCalendarUrl, groupByDay, loadSlots, type Booking } from './booking'

const b: Booking = {
  slot: '2026-11-17T15:00:00.000Z', duration: 15, meet_url: 'https://meet.jit.si/ifcviewer-abc123', email: 'a@b.co', note: '', request_id: '',
}

describe('groupByDay', () => {
  it('groups by the viewer day, not the UTC day', () => {
    const slots = ['2026-11-17T23:30:00.000Z', '2026-11-17T15:00:00.000Z', '2026-11-18T15:00:00.000Z']
    expect(groupByDay(slots, 'UTC').map((d) => [d.day, d.slots.length])).toEqual([['2026-11-17', 2], ['2026-11-18', 1]])
    // 23:30 UTC is already the 18th in Madrid.
    expect(groupByDay(slots, 'Europe/Madrid').map((d) => [d.day, d.slots.length])).toEqual([['2026-11-17', 1], ['2026-11-18', 2]])
  })
})

describe('calendar', () => {
  it('builds an .ics with start, end and the room', () => {
    const ics = bookingIcs(b, 'Call')
    expect(ics).toContain('DTSTART:20261117T150000Z')
    expect(ics).toContain('DTEND:20261117T151500Z')
    expect(ics).toContain('LOCATION:https://meet.jit.si/ifcviewer-abc123')
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
  })
  it('links to Google Calendar with the same times', () => {
    expect(googleCalendarUrl(b, 'Call')).toContain('dates=20261117T150000Z%2F20261117T151500Z')
  })
})

describe('api', () => {
  it('reads slots and the current booking', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ slots: ['x'], duration: 15, booking: null })))
    expect(await loadSlots('t', f as unknown as typeof fetch)).toEqual({ ok: true, slots: ['x'], duration: 15, booking: null })
  })
  it('maps a taken slot to slot_gone', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'slot_gone' }), { status: 409 }))
    expect(await bookSlot('t', { slot: 's', email: 'a@b.co', note: '', request_id: '', tz: 'UTC', lang: 'es' }, f as unknown as typeof fetch))
      .toEqual({ ok: false, error: 'slot_gone' })
  })
})
