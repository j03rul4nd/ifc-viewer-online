import { describe, expect, it } from 'vitest'
import {
  copyCrews, createDailyReport, crewTotals, dailyReportsCsv, localDate, makeCrew, progressOfDay, reportsInRange, sanitizeDailyReport,
  snagsOfDay, updateDailyReport, WEATHER_SKIES, type DailyCsvLabels,
} from './daily-report'
import { createSnag, transitionSnag } from './snags'
import type { ProgressRecord } from './progress'
import { buildDailyReportPdf, type DailyReportLabels } from './site-records-pdf'

const NOW = new Date(2026, 10, 19, 10, 0, 0)

describe('daily report', () => {
  it('is one record per date and refuses bad dates', () => {
    const r = createDailyReport('2026-11-19', NOW)
    expect(r.id).toBe('2026-11-19')
    expect(() => createDailyReport('19/11/2026')).toThrow()
    const u = updateDailyReport(r, { work: 'Slab P2 poured' }, NOW)
    expect(u.work).toBe('Slab P2 poured')
    expect(u.date).toBe(r.date)
  })

  it('totals crews and clamps silly numbers', () => {
    const crews = [makeCrew({ trade: 'Formwork', headcount: 4, hours: 8 }), makeCrew({ trade: 'Electrical', headcount: 2.4, hours: 30 })]
    expect(crews[1].headcount).toBe(2)
    expect(crews[1].hours).toBe(24)
    expect(crewTotals(crews)).toEqual({ crews: 2, people: 6, hours: 80 })
    const copy = copyCrews(crews)
    expect(copy[0].id).not.toBe(crews[0].id)
    expect(copy[0].trade).toBe('Formwork')
  })

  it('summarises progress records dated that day', () => {
    const rec = (status: ProgressRecord['status'], date?: string): ProgressRecord => ({ modelId: 'm', globalId: `g${Math.random()}`, expressId: 1, status, date })
    const p = progressOfDay([rec('done', '2026-11-19'), rec('in_progress', '2026-11-19'), rec('done', '2026-11-18'), rec('done')], '2026-11-19')
    expect(p).toEqual({ total: 2, byStatus: { done: 1, in_progress: 1, not_started: 0 } })
  })

  it('lists snags opened and resolved on the local day', () => {
    const a = createSnag({ title: 'Crack' }, new Date(2026, 10, 19, 8))
    const b = createSnag({ title: 'Leak' }, new Date(2026, 10, 17, 8))
    const bClosed = transitionSnag(b, 'resolved', undefined, new Date(2026, 10, 19, 17))
    const s = snagsOfDay([a, bClosed], '2026-11-19')
    expect(s.opened.map((x) => x.title)).toEqual(['Crack'])
    expect(s.resolved.map((x) => x.title)).toEqual(['Leak'])
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('filters a range in order and writes a CSV', () => {
    const reports = ['2026-11-20', '2026-11-18', '2026-11-19', '2026-10-01'].map((d) => createDailyReport(d, NOW))
    const r = reportsInRange(reports, '2026-11-20', '2026-11-18')
    expect(r.map((x) => x.date)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20'])
    const day = updateDailyReport(r[0], { weather: { sky: 'rain', tempMin: 4, tempMax: 11, stoppage: true }, crews: [makeCrew({ trade: 'Masonry', company: 'Obras SL', headcount: 3, hours: 8 })], work: '=cmd()', materials: 'Bricks, "M-10"' }, NOW)
    const labels = { yes: 'Yes', skies: Object.fromEntries(WEATHER_SKIES.map((s) => [s, s.toUpperCase()])) } as unknown as DailyCsvLabels
    const csv = dailyReportsCsv([day], labels)
    const row = csv.split('\r\n')[1]
    expect(row).toContain('2026-11-18,RAIN,4,11,Yes,Masonry (Obras SL): 3 x 8 h,3,24')
    expect(row).toContain("'=cmd()")
    expect(row).toContain('"Bricks, ""M-10"""')
  })

  it('sanitises stored records', () => {
    expect(sanitizeDailyReport({ date: 'x' })).toBeNull()
    const s = sanitizeDailyReport({ date: '2026-11-19', weather: { sky: 'tornado', tempMin: 500 }, crews: [{ trade: 'X', headcount: -3 }, null], photoIds: [1, 'p'] })!
    expect(s.weather).toEqual({ tempMin: 70 })
    expect(s.crews).toHaveLength(1)
    expect(s.crews[0].headcount).toBe(0)
    expect(s.photoIds).toEqual(['p'])
  })

  it('builds a multi-day PDF', () => {
    const reports = ['2026-11-18', '2026-11-19'].map((d) => updateDailyReport(createDailyReport(d, NOW), { work: 'Work', crews: [makeCrew({ trade: 'Steel', headcount: 2 })] }, NOW))
    const labels = new Proxy({}, { get: (_t, k) => (k === 'skies' ? {} : String(k)) }) as DailyReportLabels
    const pdf = buildDailyReportPdf(reports, labels, { snags: [createSnag({ title: 'Crack' }, new Date(2026, 10, 19, 9))] })
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text).toContain('/Count 2')
    expect(text).toContain('(- Crack)')
  })
})
