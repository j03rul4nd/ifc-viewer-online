import { describe, expect, it } from 'vitest'
import { parseCron, validateSchedule, describeSchedule, nextRuns } from './schedule'
import { guessMapping, findRecordArrays, extractRecords } from './mapping'
import { resolveSceneSources, setOverride } from './scenes'
import { PROTOCOLS, MODES, missingFields, protocolById, maskSecret } from './protocols'

describe('schedules', () => {
  it('describes common cron lines in words', () => {
    expect(describeSchedule({ kind: 'cron', expr: '*/5 * * * *' })).toBe('Every 5 minutes')
    expect(describeSchedule({ kind: 'cron', expr: '30 6 * * 1-5' })).toBe('Weekdays at 06:30')
    expect(describeSchedule({ kind: 'cron', expr: '0 2 * * 0' })).toBe('Every Sunday at 02:00')
    expect(describeSchedule({ kind: 'interval', seconds: 300 })).toBe('Every 5 minutes')
  })

  it('rejects broken cron lines with a readable reason', () => {
    expect(validateSchedule({ kind: 'cron', expr: '61 * * * *' })).toMatch(/minute/)
    expect(validateSchedule({ kind: 'cron', expr: '* * *' })).toMatch(/5 parts/)
    expect(validateSchedule({ kind: 'interval', seconds: 10 }, 30)).toMatch(/30 s/)
    expect(validateSchedule({ kind: 'daily', time: '25:00' })).toMatch(/24-hour/)
    expect(() => parseCron('0 6 * * 1-5')).not.toThrow()
  })

  it('lists the next runs', () => {
    const from = new Date(2026, 9, 26, 10, 7) // Monday
    const runs = nextRuns({ kind: 'cron', expr: '30 6 * * 1-5' }, from, 2)
    expect(runs[0].getDate()).toBe(27)
    expect(runs[0].getHours()).toBe(6)
    expect(nextRuns({ kind: 'daily', time: '23:00' }, from, 1)[0].getDate()).toBe(26)
  })
})

describe('payload mapping', () => {
  it('finds the records and guesses id, position, time and values', () => {
    const payload = { meta: { count: 2 }, data: { stations: [
      { station_id: 'a', lat: 41.38, lon: 2.17, last_updated: '2026-10-26T10:00Z', bikes: 4, docks: 10 },
      { station_id: 'b', lat: 41.39, lon: 2.18, last_updated: '2026-10-26T10:00Z', bikes: 0, docks: 12 },
    ] } }
    expect(findRecordArrays(payload)[0].path).toBe('data.stations')
    const m = guessMapping(payload)
    expect(m.recordsPath).toBe('data.stations')
    expect(m.id).toBe('station_id')
    expect(m.place).toEqual({ kind: 'latlon', lat: 'lat', lon: 'lon', height: undefined })
    expect(m.time).toBe('last_updated')
    expect(m.values).toEqual(['bikes', 'docks'])
  })

  it('binds to IFC elements when records carry a GlobalId', () => {
    const m = guessMapping([{ sensor: 's1', element: '2O2Fr$t4X7Zf8NOew3FLOH', temp: 21.5 }])
    expect(m.place).toEqual({ kind: 'ifc', field: 'element', matchBy: 'GlobalId' })
    expect(m.values).toEqual(['temp'])
  })

  it('flattens a GeoJSON FeatureCollection', () => {
    const fc = { type: 'FeatureCollection', features: [{ id: 1, properties: { level: 3 }, geometry: { type: 'Point', coordinates: [2, 41] } }] }
    expect(extractRecords(fc, '')[0]).toMatchObject({ id: 1, level: 3 })
    expect(guessMapping(fc).place).toEqual({ kind: 'geojson' })
  })
})

describe('scene defaults', () => {
  const saved = [
    { id: 'c1', name: 'BMS temperatures', defaultInNewScenes: true },
    { id: 'c2', name: 'Bike share', defaultInNewScenes: false },
  ]
  it('new scenes inherit the saved defaults', () => {
    const r = resolveSceneSources(saved, [])
    expect(r.map((x) => [x.enabled, x.origin])).toEqual([[true, 'default'], [false, 'default']])
  })
  it('a scene can switch sources and resetting drops the override', () => {
    let o = setOverride([], { connectionId: 'c1', enabled: false }, saved[0])
    expect(resolveSceneSources(saved, o)[0]).toMatchObject({ enabled: false, origin: 'scene' })
    o = setOverride(o, { connectionId: 'c1', enabled: true }, saved[0])
    expect(o).toEqual([])
  })
})

describe('protocol catalogue', () => {
  it('every protocol belongs to a mode and every field explains itself', () => {
    for (const p of PROTOCOLS) {
      expect(MODES.some((m) => m.id === p.mode), p.id).toBe(true)
      for (const f of p.fields) expect(f.help.length, `${p.id}.${f.key}`).toBeGreaterThan(5)
    }
  })
  it('reports missing required fields, respecting conditional ones', () => {
    expect(missingFields(protocolById('mqtt'), { broker: 'mqtts://x' }).map((f) => f.key)).toEqual(['topic'])
    expect(missingFields(protocolById('rest'), { url: 'https://x', method: 'GET' })).toEqual([])
    expect(maskSecret('sk_live_abcd1234')).toBe('••••1234')
  })
})
