import { describe, it, expect } from 'vitest'
import { encodeConfig, decodeConfig } from './share'
import { parseCsv, toCsv, detectDelimiter } from './csv'
import { parseFleet, normaliseAgvConfig, skusFromCsv, mapState, DEFAULT_AGV_CONFIG, DEFAULT_FEED } from '../msp/agv/config'
import { floorFacts } from './AgvBuilder'

describe('twin builder', () => {
  it('a share link round-trips the whole config', async () => {
    const cfg = { kind: 'agv', config: { ...DEFAULT_AGV_CONFIG, name: 'Almacén Ñ', layout: { ...DEFAULT_AGV_CONFIG.layout, aisles: 5 } } }
    const code = await encodeConfig(cfg)
    expect(code).toMatch(/^[zj][A-Za-z0-9_-]+$/)
    expect(await decodeConfig(code)).toEqual(cfg)
    await expect(decodeConfig('xAAAA')).rejects.toThrow()
  })

  it('reads CSV the way Excel writes it', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(parseCsv('﻿name,note\r\n"Acme, Inc.","said ""hi"""\r\n\r\nB,')).toEqual([['name', 'note'], ['Acme, Inc.', 'said "hi"'], ['B', '']])
    expect(parseCsv(toCsv([['a', 'b,c'], [1, null]]))).toEqual([['a', 'b,c'], ['1', '']])
  })

  it('maps a fleet manager’s reply onto the floor', () => {
    const feed = { ...DEFAULT_FEED, enabled: true, transform: { scale: 0.001, originX: 2, originY: 1, rotationDeg: 90, flipY: false } }
    const r = parseFleet({ robots: [{ id: 'R1', pose: { x: 12000, y: 5000, theta: 0 }, battery: 0.8, state: 'CHARGING' }, { id: 'bad', pose: {} }] }, feed)
    expect(r).toHaveLength(1)
    // (12 − 2, 5 − 1) = (10, 4), turned 90° → (−4, 10)
    expect(r[0].x).toBeCloseTo(-4); expect(r[0].z).toBeCloseTo(10)
    expect(r[0].battery).toBe(80)
    expect(r[0].state).toBe('charging')
    expect(mapState('EXECUTING_MISSION')).toBe('toDest')
    expect(mapState('Idle')).toBe('idle')
  })

  it('a config from a file or link is made safe', () => {
    const c = normaliseAgvConfig({ layout: { aisles: 99 }, erp: { endpoint: 'javascript:alert(1)', send: 'yes' }, feed: { url: 'ftp://x', everyS: -5 }, catalogue: { skus: [{ code: '' }, { code: 'A', cases: 1e6 }] } })
    expect(c.layout.aisles).toBe(6)
    expect(c.erp.endpoint).toBe('')
    expect(c.erp.send).toBe(false)
    expect(c.feed.url).toBe('')
    expect(c.feed.everyS).toBe(0.5)
    expect(c.catalogue.skus).toHaveLength(1)
    expect(c.catalogue.skus[0].cases).toBe(400)
    expect(c.catalogue.skus[0].color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('reads SKUs with or without a header row', () => {
    expect(skusFromCsv(parseCsv('code,name,cases,kg_per_case\nA1,Bolts,50,7.5')).map((s) => [s.code, s.cases, s.kgCase])).toEqual([['A1', 50, 7.5]])
    expect(skusFromCsv(parseCsv('B2;Nuts;30;4')).map((s) => s.code)).toEqual(['B2'])
  })

  it('the floor facts match the demo centre', () => {
    expect(floorFacts(DEFAULT_AGV_CONFIG.layout)).toEqual({ w: 60, d: 36, locations: 624 })
  })
})
