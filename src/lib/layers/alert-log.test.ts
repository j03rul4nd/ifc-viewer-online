import { describe, it, expect, beforeEach } from 'vitest'
import { logAlert, getAlertLog, clearAlertLog, alertLogCsv, type AlertLogEntry } from './alert-log'

const e = (over: Partial<AlertLogEntry> = {}): AlertLogEntry => ({
  at: Date.UTC(2026, 9, 8, 3, 0), kind: 'start', layerId: 'L', layer: 'Bicing', ruleId: 'r', rule: 'Empty', n: 2, sample: ['Pl. Catalunya', 'Sants'], ...over,
})

describe('alert log', () => {
  beforeEach(() => clearAlertLog())
  it('keeps entries, persists them and clears per layer', () => {
    logAlert(e()); logAlert(e({ layerId: 'M', kind: 'clear', n: 0, sample: [] }))
    expect(getAlertLog()).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem('ifc-alert-log:v1')!)).toHaveLength(2)
    clearAlertLog('L')
    expect(getAlertLog().map((x) => x.layerId)).toEqual(['M'])
  })
  it('caps at 300 entries, dropping the oldest', () => {
    for (let i = 0; i < 305; i++) logAlert(e({ at: i }))
    expect(getAlertLog()).toHaveLength(300)
    expect(getAlertLog()[0].at).toBe(5)
  })
  it('exports CSV with ISO time and quoted cells', () => {
    const csv = alertLogCsv([e({ rule: 'Empty, 10 min' })])
    expect(csv.split('\n')[0]).toBe('time,event,layer,rule,count,features')
    expect(csv.split('\n')[1]).toBe('2026-10-08T03:00:00.000Z,start,Bicing,"Empty, 10 min",2,Pl. Catalunya | Sants')
  })
})

describe('alert log across reloads', () => {
  it('finds a layer by its source even when its id changed', async () => {
    const { entryOf } = await import('./alert-log')
    const before = e({ layerId: 'vl-old', series: 'https://gbfs/x' })
    expect(entryOf(before, 'vl-new', 'https://gbfs/x')).toBe(true)
    expect(entryOf(before, 'vl-new', 'https://other')).toBe(false)
    // Entries written before series existed still match by id.
    expect(entryOf(e({ layerId: 'vl-old' }), 'vl-old', 'https://gbfs/x')).toBe(true)
  })
  it('clears one layer by its source', () => {
    logAlert(e({ layerId: 'vl-old', series: 's1' })); logAlert(e({ layerId: 'x', series: 's2' }))
    clearAlertLog('vl-new', 's1')
    expect(getAlertLog().map((x) => x.series)).toEqual(['s2'])
  })
})
