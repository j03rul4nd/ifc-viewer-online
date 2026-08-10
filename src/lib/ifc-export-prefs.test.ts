import { describe, it, expect } from 'vitest'
import {
  parseExportPrefs, prefsToExportOptions, DEFAULT_EXPORT_PREFS,
} from './ifc-export-prefs'

describe('parseExportPrefs', () => {
  it('defaults to stamping', () => {
    expect(parseExportPrefs(null).stampHeader).toBe(true)
    expect(parseExportPrefs('{}').stampHeader).toBe(true)
  })

  it('only an explicit false turns stamping off', () => {
    // A corrupt or partial entry must not silently restore the behaviour this
    // feature exists to fix — an export claiming it was never touched.
    expect(parseExportPrefs('{"stampHeader":false}').stampHeader).toBe(false)
    expect(parseExportPrefs('{"stampHeader":"no"}').stampHeader).toBe(true)
    expect(parseExportPrefs('{"stampHeader":0}').stampHeader).toBe(true)
  })

  it('survives corrupt storage rather than throwing on the export path', () => {
    for (const raw of ['not json', '[]', 'null', '"a string"']) {
      expect(parseExportPrefs(raw)).toEqual(DEFAULT_EXPORT_PREFS)
    }
  })

  it('trims and caps what goes into a header', () => {
    const p = parseExportPrefs(JSON.stringify({ author: '  Ada  ', organization: 'x'.repeat(500) }))
    expect(p.author).toBe('Ada')
    expect(p.organization).toHaveLength(200)
  })

  it('ignores non-string fields instead of stringifying them', () => {
    const p = parseExportPrefs(JSON.stringify({ author: 42, organization: null }))
    expect(p.author).toBe('')
    expect(p.organization).toBe('')
  })
})

describe('prefsToExportOptions', () => {
  it('OMITS empty fields rather than sending empty strings', () => {
    // The distinction is load-bearing. Omitted leaves whatever the file already
    // carried; an empty string would wipe an author the authoring tool filled
    // in. Losing information because a form field was blank is indefensible.
    const opts = prefsToExportOptions({ ...DEFAULT_EXPORT_PREFS })
    expect(opts).toEqual({ stampHeader: true })
    expect('author' in opts).toBe(false)
    expect('organization' in opts).toBe(false)
  })

  it('wraps a single author into the list STEP expects', () => {
    const opts = prefsToExportOptions({
      ...DEFAULT_EXPORT_PREFS, author: 'Ada Lovelace', organization: 'ACME',
    })
    expect(opts.author).toEqual(['Ada Lovelace'])
    expect(opts.organization).toEqual(['ACME'])
  })

  it('carries the stamp switch through untouched', () => {
    expect(prefsToExportOptions({ ...DEFAULT_EXPORT_PREFS, stampHeader: false }).stampHeader)
      .toBe(false)
  })
})
