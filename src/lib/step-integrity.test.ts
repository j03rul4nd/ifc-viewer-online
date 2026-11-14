import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stepIntegrity } from './step-integrity'

const enc = (s: string) => new TextEncoder().encode(s)
const REAL = new Uint8Array(readFileSync(resolve('public/models/port-bcn/APBCN-URB-CER-Cerramiento_Horizontal_Tubular.ifc')))

describe('stepIntegrity', () => {
  it('a complete real IFC is fine, also with a comment or blank lines after END', () => {
    expect(stepIntegrity(REAL)).toEqual({ ok: true })
    expect(stepIntegrity(new Uint8Array([...REAL, ...enc('\n/* salt */\n\n')]))).toEqual({ ok: true })
  })
  it('a file cut at 60 % is damaged (truncated), not a weak model', () => {
    const r = stepIntegrity(REAL.subarray(0, Math.floor(REAL.length * 0.6)))
    expect(r).toMatchObject({ ok: false, code: 'truncated' })
  })
  it('a PDF renamed .ifc is not STEP', () => {
    expect(stepIntegrity(enc('%PDF-1.7\n%%EOF'))).toMatchObject({ ok: false, code: 'not_step' })
  })
  it('a header-only file has no DATA; a missing ENDSEC is an unclosed section', () => {
    expect(stepIntegrity(enc('ISO-10303-21;\nHEADER;\nENDSEC;\nEND-ISO-10303-21;\n'))).toMatchObject({ ok: false, code: 'no_data' })
    expect(stepIntegrity(enc('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCWALL();\nEND-ISO-10303-21;\n'))).toMatchObject({ ok: false, code: 'unclosed_section' })
  })
  it('accepts a UTF-8 BOM', () => {
    expect(stepIntegrity(new Uint8Array([0xef, 0xbb, 0xbf, ...REAL]))).toEqual({ ok: true })
  })
})
