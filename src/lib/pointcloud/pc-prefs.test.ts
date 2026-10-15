import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  LS_ITEMS, MAX_ITEMS, __resetCloudPrefsForTests, flushCloudPrefs, parseCloudPrefs, readCloudPrefs, writeCloudPrefs,
} from './pc-prefs'

beforeEach(() => {
  localStorage.clear()
  __resetCloudPrefsForTests()
})
afterEach(() => { vi.restoreAllMocks() })

function reload(): void { __resetCloudPrefsForTests() }

describe('pc-prefs', () => {
  it('round-trips name, colour and style per fileKey', () => {
    writeCloudPrefs('url:/a.las', { name: 'A', color: 0x112233, style: { pointSize: 4 } })
    flushCloudPrefs()
    reload()
    expect(readCloudPrefs('url:/a.las', { framed: false })).toEqual({ name: 'A', color: 0x112233, style: { pointSize: 4 } })
    expect(readCloudPrefs('url:/b.las')).toEqual({})
  })

  it('treats corrupt JSON or another version as empty', () => {
    expect(parseCloudPrefs('{nope')).toEqual({})
    expect(parseCloudPrefs(JSON.stringify({ v: 2, items: { a: { name: 'x' } } }))).toEqual({})
  })

  it('clamps or drops out-of-range values', () => {
    const items = parseCloudPrefs(JSON.stringify({
      v: 1, items: { k: { name: 'n'.repeat(200), style: { pointSize: 99, colorMode: 'rainbow' }, usedAt: 1 } },
    }))
    expect(items.k.name).toHaveLength(80)
    expect(items.k.style).toEqual({ pointSize: 20 })
  })

  it('removes an entry on a null patch', () => {
    writeCloudPrefs('k', { name: 'x' })
    writeCloudPrefs('k', null)
    flushCloudPrefs()
    expect(localStorage.getItem(LS_ITEMS)).toBeNull()
  })

  it('prunes the least recently used past the cap', () => {
    const items: Record<string, unknown> = {}
    for (let i = 0; i <= MAX_ITEMS; i++) items[`k${i}`] = { name: `n${i}`, usedAt: 1000 + i }
    localStorage.setItem(LS_ITEMS, JSON.stringify({ v: 1, items }))
    reload()
    writeCloudPrefs(`k${MAX_ITEMS}`, { name: 'fresh' })
    flushCloudPrefs()
    const stored = JSON.parse(localStorage.getItem(LS_ITEMS)!).items
    expect(Object.keys(stored)).toHaveLength(MAX_ITEMS)
    expect(stored.k0).toBeUndefined()
  })

  it('omits the style when framed but keeps name and colour', () => {
    writeCloudPrefs('k', { name: 'x', color: 5, style: { opacity: 0.5 } })
    expect(readCloudPrefs('k', { framed: true })).toEqual({ name: 'x', color: 5 })
  })

  it('never throws when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => {
      writeCloudPrefs('k', { name: 'x' })
      flushCloudPrefs()
      readCloudPrefs('k')
    }).not.toThrow()
  })
})
