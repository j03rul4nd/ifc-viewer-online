import { describe, expect, it } from 'vitest'
import {
  canTransition, createSnag, filterSnags, groupByTrade, isOverdue, snagStats, snagsToCsv, transitionSnag, updateSnag,
} from './snags'
import { snagKey } from './snag-store'
import { fitWithin, jpegSize } from './photo'
import { buildSnagReportPdf, reportSections, type ReportLabels } from './snag-report'

const T0 = new Date('2026-11-10T10:00:00Z')
const today = new Date('2026-11-18T09:00:00Z')
const mk = (title: string, extra: Parameters<typeof createSnag>[0] extends infer D ? Partial<D> : never = {}, id = title) =>
  createSnag({ title, ...extra }, T0, id)

describe('snags', () => {
  it('creates with defaults and trims, rejects empty title', () => {
    const s = mk('  Grieta  ', { trade: ' Albañilería ', location: { modelId: 'm', expressId: 5, globalId: 'g' } })
    expect(s).toMatchObject({ title: 'Grieta', trade: 'Albañilería', status: 'open', priority: 'medium', photoIds: [] })
    expect(s.history).toEqual([{ at: T0.toISOString(), to: 'open' }])
    expect(s.location.expressId).toBe(5)
    expect(() => createSnag({ title: '  ' })).toThrow()
  })

  it('validates transitions and records history', () => {
    const s = mk('a')
    expect(canTransition('closed', 'resolved')).toBe(false)
    const r = transitionSnag(transitionSnag(s, 'in_progress', undefined, today), 'resolved', 'fixed', today)
    expect(r.status).toBe('resolved')
    expect(r.history.map((h) => h.to)).toEqual(['open', 'in_progress', 'resolved'])
    expect(r.history[2].note).toBe('fixed')
    const c = transitionSnag(r, 'closed', undefined, today)
    expect(() => transitionSnag(c, 'in_progress')).toThrow(/Invalid/)
    expect(transitionSnag(c, 'open').status).toBe('open')
    expect(transitionSnag(c, 'closed')).toBe(c)
  })

  it('update keeps id/status/history and bumps updatedAt', () => {
    const s = mk('a')
    const u = updateSnag(s, { title: 'b', assignee: 'Pepe' }, today)
    expect(u).toMatchObject({ id: s.id, title: 'b', assignee: 'Pepe', status: 'open', createdAt: s.createdAt, updatedAt: today.toISOString() })
    expect(() => updateSnag(s, { title: '' })).toThrow()
  })

  it('overdue only for open work past due', () => {
    expect(isOverdue(mk('a', { dueDate: '2026-11-17' }), today)).toBe(true)
    expect(isOverdue(mk('a', { dueDate: '2026-11-18' }), today)).toBe(false)
    expect(isOverdue(mk('a'), today)).toBe(false)
    expect(isOverdue(transitionSnag(mk('a', { dueDate: '2026-01-01' }), 'resolved'), today)).toBe(false)
  })

  it('filters and stats', () => {
    const list = [
      mk('a', { trade: 'Fontanería', unitId: '1A', dueDate: '2026-11-01' }),
      transitionSnag(mk('b', { trade: 'Electricidad', unitId: '1B' }), 'resolved'),
      mk('c', { trade: 'Fontanería', unitId: '1B', description: 'gotea' }),
    ]
    expect(filterSnags(list, { trade: 'Fontanería' }, today).map((s) => s.id)).toEqual(['a', 'c'])
    expect(filterSnags(list, { unitId: '1B', status: ['open'] }, today).map((s) => s.id)).toEqual(['c'])
    expect(filterSnags(list, { overdue: true }, today).map((s) => s.id)).toEqual(['a'])
    expect(filterSnags(list, { text: 'GOTEA' }, today).map((s) => s.id)).toEqual(['c'])
    const st = snagStats(list, today)
    expect(st).toMatchObject({ total: 3, overdue: 1, byTrade: { 'Fontanería': 2, Electricidad: 1 } })
    expect(st.byStatus.resolved).toBe(1)
    expect(st.doneRatio).toBeCloseTo(1 / 3)
  })

  it('exports CSV with escaping, BOM and formula guard', () => {
    const csv = snagsToCsv([mk('a', { title: 'Hueco, "puerta"', description: '=SUM(A1)' })], today)
    expect(csv.startsWith('﻿id,title')).toBe(true)
    expect(csv).toContain('"Hueco, ""puerta"""')
    expect(csv).toContain("'=SUM(A1)")
    expect(csv.trim().split('\r\n')).toHaveLength(2)
  })
})

describe('report grouping', () => {
  it('groups by trade alphabetically, no trade last, priority first', () => {
    const list = [
      mk('x', { trade: '' }),
      mk('p1', { trade: 'Pintura', priority: 'low' }),
      mk('p2', { trade: 'Pintura', priority: 'critical' }),
      transitionSnag(mk('a1', { trade: 'Albañilería' }), 'closed'),
    ]
    expect(groupByTrade(list).map((g) => g.trade)).toEqual(['Albañilería', 'Pintura', ''])
    const secs = reportSections(list)
    expect(secs[1].snags.map((s) => s.id)).toEqual(['p2', 'p1'])
    expect(secs.map((s) => [s.count, s.open])).toEqual([[1, 0], [2, 2], [1, 1]])
  })

  it('builds a valid-looking PDF with embedded photos', () => {
    const labels: ReportLabels = {
      title: 'Informe', generated: 'Generado', noTrade: 'Sin gremio', assignee: 'Resp', due: 'Fecha', overdue: 'Vencida',
      unit: 'Vivienda', location: 'Ubic', total: 'Total',
      status: { open: 'Abierta', in_progress: 'En curso', resolved: 'Resuelta', closed: 'Cerrada' },
      priority: { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' },
    }
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 2, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9])
    const many = Array.from({ length: 40 }, (_, i) => mk(`s${i}`, { trade: i % 2 ? 'Pintura' : 'Fontanería', description: 'texto largo '.repeat(30), photoIds: ['p'] }))
    const pdf = new TextDecoder('latin1').decode(buildSnagReportPdf(many, labels, new Map([['p', { jpeg, width: 3, height: 2 }]]), { today }))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf).toContain('/Width 3 /Height 2')
    expect(pdf).toContain('(Fontaner\\355a \\(20\\))')
    expect(Number(/\/Count (\d+)/.exec(pdf)![1])).toBeGreaterThan(1)
  })
})

describe('store and photo helpers', () => {
  it('scopes keys per project', () => {
    expect(snagKey('obra-1', 'x')).toBe('obra-1::x')
  })
  it('fits photos within 1600px without upscaling', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
  it('reads JPEG size from SOF', () => {
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 2, 0, 3, 0, 0, 0]))).toEqual({ width: 3, height: 2 })
    expect(jpegSize(new Uint8Array([1, 2]))).toBeNull()
  })
})
