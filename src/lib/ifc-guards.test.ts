// ─── ifc-guards.test.ts ────────────────────────────────────────────────────────
// Unit tests for the shared IFC pre-flight validation utilities.
//
// These tests cover the exact error conditions that would otherwise only surface
// at runtime inside a Web Worker after expensive WASM initialisation:
//
//   §1  readAsciiHeader  — raw byte-to-string conversion
//   §2  hasIfcSignature  — ISO-10303-21 / STEP detection
//   §3  validateIfcBuffer — full validation result object
//   §4  assertModelId    — web-ifc model ID guard

import { describe, it, expect } from 'vitest'
import {
  readAsciiHeader,
  hasIfcSignature,
  validateIfcBuffer,
  assertModelId,
} from './ifc-guards'

// ── Helpers ───────────────────────────────────────────────────────────────────

function asciiBuffer(text: string): ArrayBuffer {
  const buf = new ArrayBuffer(text.length)
  const u8  = new Uint8Array(buf)
  for (let i = 0; i < text.length; i++) u8[i] = text.charCodeAt(i)
  return buf
}

function ifcBuffer(extraBytes = 200): ArrayBuffer {
  const header = 'ISO-10303-21;\nHEADER;\n/* test IFC */\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
  const total  = header.length + extraBytes
  const buf    = new ArrayBuffer(total)
  const u8     = new Uint8Array(buf)
  for (let i = 0; i < header.length; i++) u8[i] = header.charCodeAt(i)
  return buf
}

// ─────────────────────────────────────────────────────────────────────────────
// §1  readAsciiHeader
// ─────────────────────────────────────────────────────────────────────────────

describe('readAsciiHeader', () => {
  it('reads the first N ASCII bytes', () => {
    const buf = asciiBuffer('ISO-10303-21;HEADER;')
    expect(readAsciiHeader(buf, 13)).toBe('ISO-10303-21;')
  })

  it('stops at NUL byte (binary content)', () => {
    const buf = new ArrayBuffer(10)
    const u8  = new Uint8Array(buf)
    u8[0] = 65  // 'A'
    u8[1] = 66  // 'B'
    u8[2] = 0   // NUL — stop here
    u8[3] = 67  // 'C' — should NOT appear in output
    expect(readAsciiHeader(buf)).toBe('AB')
  })

  it('handles empty buffer gracefully', () => {
    expect(readAsciiHeader(new ArrayBuffer(0))).toBe('')
  })

  it('does not read past buffer length', () => {
    const buf = asciiBuffer('HELLO')
    expect(readAsciiHeader(buf, 1000)).toBe('HELLO')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §2  hasIfcSignature
// ─────────────────────────────────────────────────────────────────────────────

describe('hasIfcSignature', () => {
  it('recognises ISO-10303-21 header', () => {
    expect(hasIfcSignature(asciiBuffer('ISO-10303-21;\nHEADER;'))).toBe(true)
  })

  it('recognises STEP; header', () => {
    expect(hasIfcSignature(asciiBuffer('STEP;\nHEADER;'))).toBe(true)
  })

  it('tolerates leading whitespace', () => {
    expect(hasIfcSignature(asciiBuffer('  \nISO-10303-21;'))).toBe(true)
  })

  it('rejects PDF files', () => {
    expect(hasIfcSignature(asciiBuffer('%PDF-1.4\n'))).toBe(false)
  })

  it('rejects ZIP / PKZIP files', () => {
    const buf = new ArrayBuffer(4)
    const u8  = new Uint8Array(buf)
    u8[0] = 0x50; u8[1] = 0x4B; u8[2] = 0x03; u8[3] = 0x04  // PK magic bytes
    expect(hasIfcSignature(buf)).toBe(false)
  })

  it('rejects plain text that is not IFC', () => {
    expect(hasIfcSignature(asciiBuffer('Hello World'))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3  validateIfcBuffer
// ─────────────────────────────────────────────────────────────────────────────

describe('validateIfcBuffer', () => {
  it('returns ok:true for a well-formed IFC buffer', () => {
    const result = validateIfcBuffer(ifcBuffer(), 'test.ifc')
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('rejects null buffer', () => {
    const result = validateIfcBuffer(null)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No buffer available/)
  })

  it('rejects undefined buffer', () => {
    const result = validateIfcBuffer(undefined)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No buffer available/)
  })

  it('rejects empty buffer (0 bytes)', () => {
    const result = validateIfcBuffer(new ArrayBuffer(0), 'empty.ifc')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/empty/)
    expect(result.reason).toMatch(/empty\.ifc/)
  })

  it('rejects buffer smaller than 64 bytes', () => {
    const result = validateIfcBuffer(new ArrayBuffer(32), 'tiny.ifc')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/too small/)
    expect(result.reason).toMatch(/32 bytes/)
  })

  it('rejects buffer without IFC signature even if large enough', () => {
    const result = validateIfcBuffer(asciiBuffer('%PDF-1.4 ' + 'x'.repeat(100)), 'wrong.pdf')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/ISO-10303-21/)
  })

  it('includes the file name in error messages', () => {
    const result = validateIfcBuffer(new ArrayBuffer(0), 'mymodel.ifc')
    expect(result.reason).toContain('mymodel.ifc')
  })

  it('uses a sensible fallback when no file name is given', () => {
    const result = validateIfcBuffer(new ArrayBuffer(0))
    expect(result.reason).toBeTruthy()
    expect(typeof result.reason).toBe('string')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4  assertModelId
// ─────────────────────────────────────────────────────────────────────────────

describe('assertModelId', () => {
  it('returns null for a valid model ID (≥ 0)', () => {
    expect(assertModelId(0)).toBeNull()
    expect(assertModelId(1)).toBeNull()
    expect(assertModelId(42)).toBeNull()
  })

  it('returns an error string for model ID -1', () => {
    const err = assertModelId(-1)
    expect(err).not.toBeNull()
    expect(err).toMatch(/-1/)
  })

  it('includes the context in the error message', () => {
    const err = assertModelId(-1, 'parsing rule X')
    expect(err).toMatch(/parsing rule X/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §5  Integration: validate then assert — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('validateIfcBuffer + assertModelId integration', () => {
  it('all guards pass for a well-formed buffer and a valid model ID', () => {
    const buf    = ifcBuffer(256)
    const check  = validateIfcBuffer(buf, 'building.ifc')
    const idErr  = assertModelId(1, 'test run')

    expect(check.ok).toBe(true)
    expect(idErr).toBeNull()
  })

  it('buffer guard fails fast — model ID guard is not needed', () => {
    const buf   = new ArrayBuffer(0)
    const check = validateIfcBuffer(buf, 'bad.ifc')

    expect(check.ok).toBe(false)
    // In real worker code we return early here; assertModelId is never called.
    // Verifying the contract: modelId would be -1 at this point
    const idErr = assertModelId(-1, 'skipped')
    expect(idErr).not.toBeNull()
  })
})
