import { describe, expect, it } from 'vitest'
import {
  HANDOVER_CATEGORIES, ROOM_CATEGORIES, canSign, createHandover, defaultChecklist, groupByRoom, handoverSummary, linkedSnagIds,
  markItem, parseAttendees, sanitizeHandover, setItemNote, signHandover, updateHandover, validateHandover, type Handover,
} from './handover'
import { buildUnits } from './units'

const NOW = new Date('2026-11-18T10:00:00Z')
const SIG = 'data:image/png;base64,iVBORw0KGgo='

function ready(h: Handover): Handover {
  let x = updateHandover(h, { buyerName: 'Ana Pérez', keysDelivered: { count: 3, types: 'portal, vivienda' }, signatures: { buyer: SIG, developer: SIG } }, NOW)
  for (const i of x.checklist) x = markItem(x, i.id, 'ok', undefined, NOW).handover
  return x
}

describe('handover checklist', () => {
  it('uses the 12 generic categories when the unit has no rooms', () => {
    const c = defaultChecklist()
    expect(c.map((i) => i.category)).toEqual([...HANDOVER_CATEGORIES])
    expect(c.every((i) => i.room === '')).toBe(true)
  })

  it('repeats room categories per IfcSpace and keeps the rest dwelling-wide', () => {
    const c = defaultChecklist(['Salón', 'Baño 1', 'Salón', ' '])
    expect(c.filter((i) => i.room === 'Salón')).toHaveLength(ROOM_CATEGORIES.length)
    expect(c.filter((i) => i.room === 'Baño 1')).toHaveLength(ROOM_CATEGORIES.length)
    expect(c.filter((i) => i.room === '')).toHaveLength(HANDOVER_CATEGORIES.length - ROOM_CATEGORIES.length)
    expect(new Set(c.map((i) => i.id)).size).toBe(c.length)
    expect(groupByRoom(c).map((g) => g.room)).toEqual(['Salón', 'Baño 1', ''])
  })

  it('takes rooms from the zone spaces read from the model', () => {
    const [u] = buildUnits('m', [
      { expressId: 1, globalId: 'a', name: 'Salón', longName: null, storey: 'P1', quantitySets: [] },
      { expressId: 2, globalId: 'b', name: 'Cocina', longName: null, storey: 'P1', quantitySets: [] },
    ], [{ expressId: 9, globalId: 'z', name: '1A', longName: null, memberIds: [1, 2] }])
    expect(u.rooms).toEqual(['Salón', 'Cocina'])
    const h = createHandover({ ...u, buyer: 'Ana' }, NOW, 'h1')
    expect(h.buyerName).toBe('Ana')
    expect(h.checklist.some((i) => i.room === 'Cocina')).toBe(true)
  })
})

describe('defects become snags', () => {
  it('creates one linked snag for the unit with a trade guess', () => {
    const h = createHandover({ id: 'm:z', name: '1A' }, NOW, 'h1')
    const item = h.checklist.find((i) => i.category === 'taps')!
    const r = markItem(h, item.id, 'defect', undefined, NOW)
    expect(r.snag?.unitId).toBe('m:z')
    expect(r.snag?.trade).toBe('plumbing')
    expect(r.handover.checklist.find((i) => i.id === item.id)?.snagId).toBe(r.snag?.id)
    // Marking it again does not create a second one; changing the result keeps the link.
    const again = markItem(r.handover, item.id, 'defect', undefined, NOW)
    expect(again.snag).toBeUndefined()
    const ok = markItem(again.handover, item.id, 'ok', undefined, NOW)
    expect(ok.handover.checklist.find((i) => i.id === item.id)?.snagId).toBe(r.snag?.id)
    expect(linkedSnagIds(ok.handover)).toEqual([r.snag!.id])
  })

  it('uses the translated title and trade when given', () => {
    const h = createHandover({ id: 'u', name: '1A' }, NOW, 'h1')
    const r = markItem(h, h.checklist[0].id, 'defect', { title: '1A · Puertas', trade: 'Carpintería' }, NOW)
    expect(r.snag).toMatchObject({ title: '1A · Puertas', trade: 'Carpintería', status: 'open' })
  })
})

describe('validation and signing', () => {
  it('lists what is missing', () => {
    const h = createHandover({ id: 'u', name: '1A' }, NOW, 'h1')
    expect(validateHandover(h)).toEqual(['buyerName', 'unanswered', 'keys', 'signatureBuyer', 'signatureDeveloper'])
    expect(validateHandover(updateHandover(h, { date: '18/11/2026' }, NOW))).toContain('date')
    expect(validateHandover(updateHandover(h, { signatures: { buyer: 'data:image/jpeg;base64,xx' } }, NOW))).toContain('signatureBuyer')
    expect(canSign(h)).toBe(false)
  })

  it('signs a complete handover and then refuses changes', () => {
    const h = ready(createHandover({ id: 'u', name: '1A' }, NOW, 'h1'))
    expect(validateHandover(h)).toEqual([])
    const s = signHandover(h, NOW)
    expect(s.status).toBe('signed')
    expect(s.signedAt).toBe(NOW.toISOString())
    expect(canSign(s)).toBe(false)
    expect(() => updateHandover(s, { buyerName: 'X' })).toThrow(/read-only/)
    expect(() => markItem(s, s.checklist[0].id, 'defect')).toThrow(/read-only/)
    expect(() => setItemNote(s, s.checklist[0].id, 'x')).toThrow(/read-only/)
    expect(() => signHandover(s)).toThrow(/read-only/)
  })

  it('refuses to sign an incomplete handover', () => {
    expect(() => signHandover(createHandover({ id: 'u', name: '1A' }, NOW))).toThrow(/not ready/)
  })

  it('summarises results', () => {
    let h = createHandover({ id: 'u', name: '1A' }, NOW, 'h1')
    h = markItem(h, h.checklist[0].id, 'ok', undefined, NOW).handover
    h = markItem(h, h.checklist[1].id, 'na', undefined, NOW).handover
    h = markItem(h, h.checklist[2].id, 'defect', undefined, NOW).handover
    expect(handoverSummary(h)).toEqual({ total: 12, ok: 1, defect: 1, na: 1, pending: 9 })
  })
})

describe('storage helpers', () => {
  it('round-trips and drops malformed fields', () => {
    const h = signHandover(ready(createHandover({ id: 'u', name: '1A' }, NOW, 'h1')), NOW)
    expect(sanitizeHandover(JSON.parse(JSON.stringify(h)))).toEqual(h)
    expect(sanitizeHandover(null)).toBeNull()
    expect(sanitizeHandover({ id: 'x' })).toBeNull()
    const bad = sanitizeHandover({ ...h, checklist: [{ id: 'a', category: 'rocket' }, { id: 'b', category: 'doors', result: 'meh' }], signatures: { buyer: 'javascript:1' } })!
    expect(bad.checklist).toEqual([{ id: 'b', room: '', category: 'doors' }])
    expect(bad.signatures).toEqual({})
  })

  it('parses attendees', () => {
    expect(parseAttendees('Ana, Luis\n  Jefe de obra \n,')).toEqual(['Ana', 'Luis', 'Jefe de obra'])
  })
})
