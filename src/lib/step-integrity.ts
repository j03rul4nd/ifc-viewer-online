// ─── STEP (ISO 10303-21) integrity ────────────────────────────────────────────
// A truncated IFC — an upload cut short, a disk that filled up while exporting —
// still parses up to where it stops, so the validator happily scores the part it
// read and the file looks like a weak model. It is not: it is damaged. This check
// runs before validation (browser page, runner, MCP engine) and says why.
//
// A complete STEP file starts with `ISO-10303-21;`, has a HEADER and a DATA
// section, and ends with `END-ISO-10303-21;` (only whitespace or comments after).

export type StepIntegrity =
  | { ok: true }
  | { ok: false; code: 'not_step' | 'no_data' | 'truncated' | 'unclosed_section'; reason: string }

const TAIL = 64 * 1024
const HEAD = 64 * 1024

const latin1 = new TextDecoder('latin1')
function ascii(bytes: Uint8Array, start: number, end: number): string {
  return latin1.decode(bytes.subarray(start, end))
}

/** Strip block comments and whitespace from the end of a STEP tail. */
function trimTail(tail: string): string {
  let t = tail.replace(/\/\*[\s\S]*?\*\//g, ' ')
  t = t.replace(/\s+$/, '')
  return t
}

export function stepIntegrity(bytes: Uint8Array): StepIntegrity {
  const head = ascii(bytes, 0, Math.min(bytes.length, HEAD)).replace(/^﻿/, '').replace(/^\xEF\xBB\xBF/, '').trimStart()
  if (!head.startsWith('ISO-10303-21;')) {
    return { ok: false, code: 'not_step', reason: 'not an IFC (STEP) file: it does not start with ISO-10303-21' }
  }
  const tail = trimTail(ascii(bytes, Math.max(0, bytes.length - TAIL), bytes.length))
  if (!/END-ISO-10303-21;$/.test(tail)) {
    return { ok: false, code: 'truncated', reason: 'the file is cut short: it does not end with END-ISO-10303-21 (an interrupted export or upload)' }
  }
  // DATA must open somewhere; in a big file it can sit after the first 64 KB of header comments, so scan in chunks.
  if (!containsToken(bytes, 'DATA;')) {
    return { ok: false, code: 'no_data', reason: 'the file has no DATA section: there is nothing to check' }
  }
  // The last section before END must be closed.
  if (!/ENDSEC;\s*END-ISO-10303-21;$/.test(tail)) {
    return { ok: false, code: 'unclosed_section', reason: 'the last section is not closed (ENDSEC missing): the file is damaged' }
  }
  return { ok: true }
}

function containsToken(bytes: Uint8Array, token: string): boolean {
  const CHUNK = 1 << 20
  for (let i = 0; i < bytes.length; i += CHUNK - token.length) {
    if (ascii(bytes, i, Math.min(bytes.length, i + CHUNK)).includes(token)) return true
  }
  return false
}
