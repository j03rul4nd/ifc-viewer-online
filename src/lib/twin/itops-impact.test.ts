import { describe, it, expect } from 'vitest'
import { simulateItOps } from './device-sim'
import { openIncidents, addOnsets, incidentKey, yearlySavingEur, EMPTY_TALLY, WITHOUT } from './itops-impact'

describe('itops-impact', () => {
  it('reads the incidents of a simulated snapshot, most costly first', () => {
    const snap = { devices: [
      { id: 'ap-3', kind: 'wifi-ap', online: false },
      { id: 'server-room', kind: 'server-room', temp_c: 29.64 },
      { id: 'backup', kind: 'backup', status: 'ok' },
      { id: 'badge-main', kind: 'access', state: 'suspicious', failed_last_5min: 4 },
    ] }
    const open = openIncidents(snap)
    expect(open.map((i) => i.kind)).toEqual(['overheat', 'apDown', 'badge'])
    expect(open[0].value).toBe('29.6 °C')
    expect(open[1].value).toBe('3')
  })

  it('counts an incident once, when it opens', () => {
    const open = openIncidents({ devices: [{ id: 'server-room', kind: 'server-room', temp_c: 30 }] })
    const a = addOnsets(EMPTY_TALLY, open, new Set())
    const b = addOnsets(a, open, new Set(open.map(incidentKey)))
    expect(a).toEqual({ caught: 1, minutesAvoided: WITHOUT.overheat.noticeMin, eurAvoided: WITHOUT.overheat.costEur })
    expect(b).toEqual(a)
  })

  it('finds faults in the live simulation within a few minutes', () => {
    const t0 = Date.UTC(2026, 9, 20, 10, 0, 0)
    let seen = 0
    for (let s = 0; s < 36; s++) seen += openIncidents(simulateItOps(t0 + s * 10_000)).length
    expect(seen).toBeGreaterThan(0)
  })

  it('scales the yearly estimate with the number of sites', () => {
    expect(yearlySavingEur(1)).toBeGreaterThan(5000)
    expect(yearlySavingEur(10)).toBe(yearlySavingEur(1) * 10)
    expect(yearlySavingEur(0)).toBe(yearlySavingEur(1))
  })
})
