// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isIdsXml, looksLikeIfc } from './runner'

describe('validation runner guards', () => {
  it('recognises STEP files and nothing else', () => {
    const enc = (s: string) => new TextEncoder().encode(s)
    expect(looksLikeIfc(enc('ISO-10303-21;\nHEADER;'))).toBe(true)
    expect(looksLikeIfc(enc('  \nISO-10303-21;'))).toBe(true)
    expect(looksLikeIfc(enc('PK\u0003\u0004 zip'))).toBe(false)
    expect(looksLikeIfc(new Uint8Array())).toBe(false)
  })
  it('only runs IDS when the requirements are IDS XML', () => {
    expect(isIdsXml('<?xml version="1.0"?><ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS">')).toBe(true)
    expect(isIdsXml('<ids xmlns="http://standards.buildingsmart.org/IDS">')).toBe(true)
    expect(isIdsXml('{"min_score":80}')).toBe(false)
  })
})
