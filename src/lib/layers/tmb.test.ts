import { describe, it, expect, beforeEach } from 'vitest'
import {
  setTmbKeys, getTmbKeys, withTmbKeys, withoutTmbKeys, isTmbUrl, tmbErrorKey, tmbLines, parseArrivals, tmbStopCode, TMB_URLS,
} from './tmb'
import { FEED_PRESETS } from './feed-presets'

describe('TMB keys', () => {
  beforeEach(() => setTmbKeys(null))
  it('are stored per browser, trimmed, and removable', () => {
    expect(getTmbKeys()).toBeNull()
    setTmbKeys({ appId: ' abc ', appKey: ' xyz ' })
    expect(getTmbKeys()).toEqual({ appId: 'abc', appKey: 'xyz' })
    expect(JSON.parse(localStorage.getItem('ifc-tmb-keys:v1')!)).toEqual({ appId: 'abc', appKey: 'xyz' })
    setTmbKeys(null)
    expect(localStorage.getItem('ifc-tmb-keys:v1')).toBeNull()
  })
  it('go on TMB requests only, and come off saved URLs', () => {
    setTmbKeys({ appId: 'abc', appKey: 'xyz' })
    expect(withTmbKeys(TMB_URLS.busStops)).toBe('https://api.tmb.cat/v1/transit/parades?app_id=abc&app_key=xyz')
    expect(withTmbKeys('https://example.com/a.geojson')).toBe('https://example.com/a.geojson')
    expect(withoutTmbKeys('https://api.tmb.cat/v1/transit/parades?app_id=abc&app_key=xyz')).toBe(TMB_URLS.busStops)
    expect(isTmbUrl('https://api.tmb.cat.evil.com/x')).toBe(false)
  })
  it('tell the user what an error means', () => {
    expect(tmbErrorKey(401)).toBe('error.tmbKey')
    expect(tmbErrorKey(429)).toBe('error.quota')
    expect(tmbErrorKey(500)).toBeNull()
  })
  it('presets never carry keys in their URLs', () => {
    for (const p of FEED_PRESETS.filter((x) => x.needsKey === 'tmb')) expect(p.url).not.toMatch(/app_(id|key)/)
  })
})

describe('TMB data', () => {
  it('lists lines once, in TMB order, with official colours', () => {
    const f = (n: string, c: string, o: number) => ({ properties: { NOM_LINIA: n, COLOR_LINIA: c, ORDRE_LINIA: o } })
    expect(tmbLines([f('L3', '37A03A', 3), f('L1', 'DC241F', 1), f('L1', 'DC241F', 1), f('X', 'bad', 9)])).toEqual([
      { name: 'L1', color: '#DC241F' }, { name: 'L3', color: '#37A03A' }, { name: 'X', color: '#888888' },
    ])
  })
  it('reads iBus arrivals as minutes, soonest line first', () => {
    const now = 1_000_000_000_000
    const json = {
      timestamp: now,
      parades: [{ codi_parada: '108', linies_trajectes: [
        { nom_linia: 'V15', desti_trajecte: 'Barceloneta', propers_busos: [{ temps_arribada: now + 9 * 60_000 }, { temps_arribada: now + 21 * 60_000 }] },
        { nom_linia: 'H8', desti_trajecte: 'Camp Nou', propers_busos: [{ temps_arribada: now + 20_000 }] },
        { nom_linia: 'D20', desti_trajecte: 'Ernest Lluch', propers_busos: [] },
      ] }],
    }
    expect(parseArrivals(json)).toEqual([
      { line: 'H8', destination: 'Camp Nou', minutes: [0] },
      { line: 'V15', destination: 'Barceloneta', minutes: [9, 21] },
      { line: 'D20', destination: 'Ernest Lluch', minutes: [] },
    ])
    expect(parseArrivals({})).toEqual([])
  })
  it('finds a stop code', () => {
    expect(tmbStopCode({ CODI_PARADA: 1718 })).toBe('1718')
    expect(tmbStopCode({ NOM: 'x' })).toBeNull()
  })
})
