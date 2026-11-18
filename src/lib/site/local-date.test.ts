import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localDate, localDayOf } from './local-date'
import { progressOfDay, snagsOfDay } from './daily-report'
import { createSnag } from './snags'
import { createInspection, createTemplate } from './inspections'
import { createHandover } from './handover'
import { loadImage } from './pdf-text-raster'

const prevTz = process.env.TZ
beforeAll(() => { process.env.TZ = 'Europe/Madrid' })
afterAll(() => { process.env.TZ = prevTz })

// 00:30 in Madrid on 20 Nov = 23:30 UTC on 19 Nov.
const JUST_AFTER_MIDNIGHT = new Date('2026-11-19T23:30:00Z')

describe('local site day (Europe/Madrid)', () => {
  it('uses the local date, not the UTC one, just after midnight', () => {
    expect(JUST_AFTER_MIDNIGHT.toISOString().slice(0, 10)).toBe('2026-11-19')
    expect(localDate(JUST_AFTER_MIDNIGHT)).toBe('2026-11-20')
    expect(localDayOf(JUST_AFTER_MIDNIGHT.toISOString())).toBe('2026-11-20')
    expect(localDayOf('nope')).toBe('')
  })

  it('progress, snags, inspections and handovers agree on that day', () => {
    const day = localDate(JUST_AFTER_MIDNIGHT)
    const p = progressOfDay([{ modelId: 'm', globalId: 'g', expressId: 1, status: 'done', date: day }], '2026-11-20')
    expect(p.total).toBe(1)
    const s = snagsOfDay([createSnag({ title: 'Crack' }, JUST_AFTER_MIDNIGHT)], '2026-11-20')
    expect(s.opened).toHaveLength(1)
    const tpl = createTemplate('T', 'a', '', JUST_AFTER_MIDNIGHT, 't')
    expect(createInspection(tpl, {}, JUST_AFTER_MIDNIGHT).date).toBe('2026-11-20')
    expect(createHandover({ id: 'U', name: '1A' }, JUST_AFTER_MIDNIGHT).date).toBe('2026-11-20')
  })
})

describe('loadImage', () => {
  it('gives up after the timeout when decode never settles', async () => {
    const im = { complete: false, naturalWidth: 0, decode: () => new Promise<void>(() => {}) } as unknown as HTMLImageElement
    expect(await loadImage(im, 'data:x', 20)).toBe(false)
  })
  it('resolves on onload even if decode hangs', async () => {
    const im = { complete: false, naturalWidth: 0, decode: () => new Promise<void>(() => {}) } as unknown as HTMLImageElement & { onload: () => void }
    const p = loadImage(im, 'data:x', 5000)
    im.onload()
    expect(await p).toBe(true)
  })
})
