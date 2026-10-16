// @vitest-environment node
// Round-trip of edits through the real web-ifc writer: apply the diffs, save,
// reopen and read the values back. This is what pins whether names carrying a
// quote, a backslash or non-ASCII text survive the export unchanged — web-ifc
// 0.0.77 writes a backslash raw and aborts on non-BMP text unless
// export-apply encodes them first.
import { describe, it, expect, beforeAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import {
  applyDiff, applyDiffs, encodeStepText, findLossyLines, instanceTexts, lineIdsOf, nonEmptyLiterals,
} from './export-apply'
import type { EditDiff } from '../types'

const BS = '\\'

// #1 has a Name; #2 has none ($); #3 carries an escaped backslash and an
// emoji in its Description, which a rewrite of the line must keep.
const FIXTURE = [
  'ISO-10303-21;',
  'HEADER;',
  "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
  "FILE_NAME('','2022-10-07T13:48:42',(),(),'IfcOpenShell v0.7.0','IfcOpenShell v0.7.0','');",
  "FILE_SCHEMA(('IFC4'));",
  'ENDSEC;',
  'DATA;',
  "#1=IFCWALL('1hqIFTRjfV6AWq_bMtnZwI',$,'Foobar',$,$,$,$,$,$);",
  "#2=IFCWALL('2hqIFTRjfV6AWq_bMtnZwI',$,$,$,$,$,$,$,$);",
  `#3=IFCWALL('3hqIFTRjfV6AWq_bMtnZwI',$,'Old','a${BS}${BS}b ${BS}X4${BS}0001F600${BS}X0${BS}',$,$,$,$,$);`,
  'ENDSEC;',
  'END-ISO-10303-21;',
  '',
].join('\n')

let api: IfcAPI
beforeAll(async () => { api = new IfcAPI(); await api.Init() })

/** Apply the diffs to the fixture and return the saved STEP text. */
function exportWith(diffs: EditDiff[]): { text: string; skipped: number } {
  const id = api.OpenModel(new TextEncoder().encode(FIXTURE))
  try {
    const skipped = applyDiffs(api, id, diffs)
    return { text: new TextDecoder().decode(api.SaveModel(id)), skipped }
  } finally { api.CloseModel(id) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lineOf(text: string, expressId: number): any {
  const id = api.OpenModel(new TextEncoder().encode(text))
  try { return api.GetLine(id, expressId, false) } finally { api.CloseModel(id) }
}

const rawLine = (text: string, expressId: number): string =>
  text.split(/\r?\n/).find((l) => l.startsWith(`#${expressId}=`)) ?? ''

const rename = (expressId: number, newValue: string): EditDiff =>
  ({ type: 'RENAME', expressId, field: 'Name', oldValue: '', newValue })

describe('applyDiff RENAME through the real writer', () => {
  const tricky = `O'Brien ${BS} Planta 1ª 東`

  it('round-trips a quote, a backslash and non-ASCII characters unchanged', () => {
    const { text } = exportWith([rename(1, tricky)])
    expect(lineOf(text, 1).Name.value).toBe(tricky)
  })

  it('writes STEP-encoded text: doubled quote, escaped backslash, \\X2\\ for non-ASCII', () => {
    const { text } = exportWith([rename(1, tricky)])
    const line = rawLine(text, 1)
    expect(line).toContain("O''Brien")
    expect(line).toContain(`${BS}${BS}`)
    expect(line).toMatch(/\\X2\\/)
    expect(line).not.toContain('東')
  })

  it('round-trips a character outside the BMP instead of aborting the save', () => {
    const name = 'Level 1 😀'
    const { text } = exportWith([rename(1, name)])
    expect(rawLine(text, 1)).toContain(`${BS}X4${BS}0001F600${BS}X0${BS}`)
    expect(lineOf(text, 1).Name.value).toBe(name)
  })

  it('writes a Name onto an element whose Name was $', () => {
    const { text } = exportWith([rename(2, 'Wall-Level 1-001')])
    expect(lineOf(text, 2).Name.value).toBe('Wall-Level 1-001')
    expect(text).toContain("'Wall-Level 1-001'")
  })

  it('keeps the other text on a rewritten line intact (escaped backslash, emoji)', () => {
    const before = lineOf(FIXTURE, 3).Description.value
    expect(before).toBe(`a${BS}b 😀`)
    const { text, skipped } = exportWith([rename(3, 'New')])
    expect(skipped).toBe(0)
    const after = lineOf(text, 3)
    expect(after.Name.value).toBe('New')
    expect(after.Description.value).toBe(before)
  })

  it('leaves untouched entities as they were', () => {
    const { text } = exportWith([rename(2, 'X')])
    expect(lineOf(text, 1).Name.value).toBe('Foobar')
  })
})

describe('applyDiffs: several diffs on one element', () => {
  it('a GUID fix after a rename with a quote keeps the new name', () => {
    // web-ifc's GetLine reads a just-written quoted value back as '' — a
    // second diff that re-read the line would write the empty name out.
    const { text } = exportWith([
      rename(1, "Door 90'"),
      { type: 'FIX_GUID', expressId: 1, oldGuid: '1hqIFTRjfV6AWq_bMtnZwI', newGuid: '0hqIFTRjfV6AWq_bMtnZwI' },
    ])
    const line = lineOf(text, 1)
    expect(line.Name.value).toBe("Door 90'")
    expect(line.GlobalId.value).toBe('0hqIFTRjfV6AWq_bMtnZwI')
  })

  it('the last rename of a field wins', () => {
    const { text } = exportWith([rename(1, 'First'), rename(1, `Second ${BS}`)])
    expect(lineOf(text, 1).Name.value).toBe(`Second ${BS}`)
  })

  it('counts a diff web-ifc cannot apply as skipped and still writes the rest', () => {
    const { text, skipped } = exportWith([rename(999, 'Nowhere'), rename(2, 'Kept')])
    expect(skipped).toBe(1)
    expect(lineOf(text, 2).Name.value).toBe('Kept')
  })

  it('applyDiff without a store still writes a single edit', () => {
    const id = api.OpenModel(new TextEncoder().encode(FIXTURE))
    try {
      applyDiff(api, id, rename(1, 'Solo'))
      const text = new TextDecoder().decode(api.SaveModel(id))
      expect(lineOf(text, 1).Name.value).toBe('Solo')
    } finally { api.CloseModel(id) }
  })
})

describe('lines the reader cannot read back whole', () => {
  // #20 carries an unescaped backslash ('a\b'), which web-ifc reads as '';
  // #21 a genuinely empty Description next to valid escapes; #22 a ';', a
  // '#' and a doubled quote inside its text, and a comment before it.
  const LOSSY = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('','2022-10-07T13:48:42',(),(),'x','x','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    `#20=IFCWALL('0hqIFTRjfV6AWq_bMtnZw0',$,'Old','a${BS}b',$,$,$,$,$);`,
    `#21=IFCWALL('1hqIFTRjfV6AWq_bMtnZw1',$,'','',' ${BS}X2${BS}00E9${BS}X0${BS}',$,$,$,$);`,
    "/* don't stop here */",
    "#22=IFCWALL('2hqIFTRjfV6AWq_bMtnZw2',$,'Old','a;b #3 it''s',$,$,$,$,$);",
    `#23=IFCPROPERTYSINGLEVALUE('P',$,IFCLABEL('x${BS}y'),$);`,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')

  function exportLossy(diffs: EditDiff[]): { text: string; skipped: number; lossy: Set<number> } {
    const bytes = new TextEncoder().encode(LOSSY)
    const id = api.OpenModel(bytes)
    try {
      const lossy = findLossyLines(api, id, bytes, lineIdsOf(diffs))
      const skipped = applyDiffs(api, id, diffs, undefined, lossy)
      return { text: new TextDecoder().decode(api.SaveModel(id)), skipped, lossy }
    } finally { api.CloseModel(id) }
  }

  it('skips a rename on a line whose text would be blanked, and counts it', () => {
    const { text, skipped, lossy } = exportLossy([rename(20, 'New'), rename(21, 'Wall-001'), rename(22, 'Fine')])
    expect([...lossy]).toEqual([20])
    expect(skipped).toBe(1)
    // The line is left exactly as it was: its Description is not written as ''.
    expect(rawLine(text, 20)).toContain(`'a${BS}b'`)
    expect(rawLine(text, 20)).toContain("'Old'")
    // The others are written: an empty value that really is empty, and text
    // with a ';', a '#' and a quote, are no reason to skip.
    expect(lineOf(text, 21).Name.value).toBe('Wall-001')
    expect(lineOf(text, 22).Name.value).toBe('Fine')
    expect(lineOf(text, 22).Description.value).toBe("a;b #3 it's")
  })

  it('covers typed text too (a property value)', () => {
    const diff: EditDiff = { type: 'SET_PROPERTY', expressId: 20, psetName: 'Ps', propName: 'P', propExpressId: 23, oldValue: '', newValue: 'z' }
    expect([...exportLossy([diff]).lossy]).toEqual([23])
  })

  it('reads each wanted instance from the bytes, past strings and comments', () => {
    const texts = instanceTexts(new TextEncoder().encode(LOSSY), new Set([22, 23]))
    expect(texts.get(22)).toBe("#22=IFCWALL('2hqIFTRjfV6AWq_bMtnZw2',$,'Old','a;b #3 it''s',$,$,$,$,$);")
    expect(texts.get(23)).toContain('IFCLABEL(')
    expect(nonEmptyLiterals(texts.get(22)!)).toBe(3)
    expect(nonEmptyLiterals("#1=X('',''''),")).toBe(1)
  })
})

describe('encodeStepText', () => {
  it('escapes only what the writer leaves raw', () => {
    expect(encodeStepText(`a${BS}b`)).toBe(`a${BS}${BS}b`)
    expect(encodeStepText("O'Brien ª 東")).toBe("O'Brien ª 東")
    expect(encodeStepText('😀')).toBe(`${BS}X4${BS}0001F600${BS}X0${BS}`)
  })
})
