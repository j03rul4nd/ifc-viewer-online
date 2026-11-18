// ─── upload utils + import-dialog state machine ───────────────────────────────
// Runs in jsdom on purpose: the checks read real File/Blob slices, the way the
// dialog does in the browser.
//
// The reducer lives in hooks/useUploadStateMachine.ts but is a plain function
// built from these utilities, so its sequencing is tested here alongside them —
// what a submit takes, when the fast path fires, how an appended file joins a
// selection — without rendering the dialog.

import { describe, it, expect } from 'vitest'
import {
  entryStatuses,
  formatFileSize,
  parseIfcHeader,
  planAfterPrepare,
  prepareUploadFile,
  resolveBatchName,
  selectForSubmit,
  suggestedBatchName,
  summarizeSelection,
  validateIfcFile,
} from './upload.utils'
import { LARGE_FILE_BYTES, MAX_FILE_SIZE_BYTES, VERY_LARGE_FILE_BYTES } from './upload.constants'
import { uploadReducer, INITIAL_UPLOAD_STATE } from '../hooks/useUploadStateMachine'
import type { DuplicateMatch } from './loading/controller'
import type { UploadCheck, UploadEntry, UploadState } from '../types/upload.types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HEADER = (schema: string, pad = 0): string =>
  'ISO-10303-21;\nHEADER;\n' +
  `FILE_DESCRIPTION(('${'x'.repeat(pad)}'),'2;1');\n` +
  `FILE_NAME('model.ifc','2026-01-01T00:00:00',(''),(''),'','','');\n` +
  `FILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n`

const ifcFile = (name = 'model.ifc', schema = 'IFC4', opts: { type?: string; pad?: number } = {}): File =>
  new File([HEADER(schema, opts.pad)], name, { type: opts.type ?? '' })

/** A File that claims `size` without allocating it (validation reads only the head). */
function sizedFile(name: string, size: number, head = HEADER('IFC4')): File {
  const f = new File([head], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const OK = (fingerprint: string | null, existing: DuplicateMatch | null = null): UploadCheck =>
  ({ ok: true, version: 'IFC4', fingerprint, existing })

const BAD: UploadCheck = {
  ok: false,
  error: { code: 'INVALID_EXTENSION', message: 'x', retryable: false },
}

let seq = 0
function entry(name: string, check: UploadCheck | null, over: Partial<UploadEntry> = {}): UploadEntry {
  return { key: `k${++seq}`, file: new File(['x'], name), origin: 'drop', check, checked: null, ...over }
}

const MATCH: DuplicateMatch = { modelId: 'Tower.ifc-1700000000000', jobId: 'j1', fileName: 'Tower.ifc', status: 'loaded' }

// ── Header / validation ───────────────────────────────────────────────────────

describe('parseIfcHeader', () => {
  it('reads the signature and the schema', () => {
    expect(parseIfcHeader(HEADER('ifc2x3'))).toEqual({ magic: true, version: 'IFC2X3' })
  })

  it('reports a missing signature and an undeclared schema', () => {
    expect(parseIfcHeader('<?xml version="1.0"?>')).toEqual({ magic: false, version: null })
  })
})

describe('validateIfcFile', () => {
  it('accepts a valid IFC and reports its schema', async () => {
    expect(await validateIfcFile(ifcFile('a.ifc', 'IFC4X3_ADD2'))).toEqual({ ok: true, version: 'IFC4X3_ADD2' })
  })

  it('finds FILE_SCHEMA past the first 512 bytes (long headers)', async () => {
    const result = await validateIfcFile(ifcFile('long.ifc', 'IFC2X3', { pad: 900 }))
    expect(result).toEqual({ ok: true, version: 'IFC2X3' })
  })

  it('accepts an IFC whose header declares no schema', async () => {
    const f = new File(['ISO-10303-21;\nHEADER;\nENDSEC;\n'], 'bare.ifc')
    expect(await validateIfcFile(f)).toEqual({ ok: true, version: null })
  })

  it.each([
    ['wrong extension', new File([HEADER('IFC4')], 'model.ids'), 'INVALID_EXTENSION'],
    ['empty file', new File([], 'empty.ifc'), 'FILE_EMPTY'],
    ['over 2 GB', sizedFile('huge.ifc', MAX_FILE_SIZE_BYTES + 1), 'FILE_TOO_LARGE'],
    ['foreign MIME', ifcFile('model.ifc', 'IFC4', { type: 'image/png' }), 'INVALID_MIME'],
    ['bad signature', new File(['PK\u0003\u0004 zip bytes'], 'zipped.ifc'), 'CORRUPTED_FILE'],
    ['unsupported schema', ifcFile('old.ifc', 'IFC2X2_FINAL'), 'UNSUPPORTED_IFC_VERSION'],
  ])('rejects: %s', async (_label, file, code) => {
    const result = await validateIfcFile(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })

  it('accepts the MIME types browsers actually report for .ifc', async () => {
    for (const type of ['', 'application/octet-stream', 'application/x-step']) {
      expect((await validateIfcFile(ifcFile('m.ifc', 'IFC4', { type }))).ok).toBe(true)
    }
  })

  it('tells an unreadable file apart from a corrupted one', async () => {
    const f = ifcFile('moved.ifc')
    Object.defineProperty(f, 'slice', {
      value: () => ({ text: () => Promise.reject(new Error('NotReadableError')) }),
    })
    const result = await validateIfcFile(f)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('READ_FAILED')
      expect(result.error.retryable).toBe(true)
    }
  })
})

describe('prepareUploadFile', () => {
  it('fingerprints a valid file and looks it up', async () => {
    const seen: string[] = []
    const check = await prepareUploadFile(ifcFile(), {
      fingerprint: async () => 'f1:10:abc',
      findDuplicate: (fp) => { seen.push(fp); return MATCH },
    })
    expect(seen).toEqual(['f1:10:abc'])
    expect(check).toEqual({ ok: true, version: 'IFC4', fingerprint: 'f1:10:abc', existing: MATCH })
  })

  it('does not fingerprint an invalid file', async () => {
    let hashed = false
    const check = await prepareUploadFile(new File([], 'empty.ifc'), {
      fingerprint: async () => { hashed = true; return 'f1' },
      findDuplicate: () => null,
    })
    expect(hashed).toBe(false)
    expect(check.ok).toBe(false)
  })

  it('keeps a file loadable when the fingerprint fails', async () => {
    const check = await prepareUploadFile(ifcFile(), {
      fingerprint: () => Promise.reject(new Error('no subtle')),
      findDuplicate: () => { throw new Error('must not be called') },
    })
    expect(check).toEqual({ ok: true, version: 'IFC4', fingerprint: null, existing: null })
  })

  it('computes a real fingerprint by default', async () => {
    const check = await prepareUploadFile(ifcFile(), { findDuplicate: () => null })
    expect(check.ok && check.fingerprint).toMatch(/^f1:\d+:[0-9a-f]{32}$/)
  })
})

describe('formatFileSize', () => {
  it('formats and never runs off the unit table', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1536)).toBe('2 KB')
    expect(formatFileSize(200 * 1024 ** 2)).toBe('200.0 MB')
    expect(formatFileSize(3 * 1024 ** 5)).toBe('3072.0 TB')
  })
})

// ── Selection logic ───────────────────────────────────────────────────────────

describe('entryStatuses', () => {
  it('marks the first of identical files as the original', () => {
    const a = entry('a.ifc', OK('fp1'))
    const b = entry('b.ifc', OK('fp1'))
    const c = entry('c.ifc', OK('fp2'))
    const s = entryStatuses([a, b, c])
    expect(s.get(a.key)).toEqual({ kind: 'valid' })
    expect(s.get(b.key)).toEqual({ kind: 'selection-duplicate', ofKey: a.key })
    expect(s.get(c.key)).toEqual({ kind: 'valid' })
  })

  it('prefers "already loaded" over "duplicate in selection"', () => {
    const a = entry('a.ifc', OK('fp1', MATCH))
    const b = entry('b.ifc', OK('fp1', MATCH))
    const s = entryStatuses([a, b])
    expect(s.get(b.key)?.kind).toBe('loaded-duplicate')
  })

  it('never pairs files without a fingerprint', () => {
    const a = entry('a.ifc', OK(null))
    const b = entry('b.ifc', OK(null))
    const s = entryStatuses([a, b])
    expect(s.get(b.key)).toEqual({ kind: 'valid' })
  })

  it('reports pending and invalid rows', () => {
    const a = entry('a.ifc', null)
    const b = entry('b.txt', BAD)
    const s = entryStatuses([a, b])
    expect(s.get(a.key)).toEqual({ kind: 'pending' })
    expect(s.get(b.key)?.kind).toBe('invalid')
  })
})

describe('planAfterPrepare', () => {
  it('fast-paths exactly one valid, new, small file', () => {
    expect(planAfterPrepare([entry('a.ifc', OK('fp'))])).toBe('fast')
  })

  it('reviews a single large file first', () => {
    const big = entry('big.ifc', OK('fp'), { file: sizedFile('big.ifc', LARGE_FILE_BYTES) })
    expect(planAfterPrepare([big])).toBe('review')
  })

  it('prompts for a single file that is already loaded', () => {
    expect(planAfterPrepare([entry('a.ifc', OK('fp', MATCH))])).toBe('duplicate')
  })

  it('errors only when nothing can load', () => {
    expect(planAfterPrepare([entry('a.txt', BAD)])).toBe('error')
    expect(planAfterPrepare([entry('a.txt', BAD), entry('b.txt', BAD)])).toBe('error')
  })

  it('reviews a selection with one valid and one invalid file (no silent drop)', () => {
    expect(planAfterPrepare([entry('a.ifc', OK('fp')), entry('b.txt', BAD)])).toBe('review')
  })
})

describe('selectForSubmit / summarizeSelection', () => {
  const a = entry('Hotel_Vela_ARC.ifc', OK('fp1'), { checked: true })
  const b = entry('Hotel_Vela_STR.ifc', OK('fp2'), { checked: false })
  const dup = entry('Hotel_Vela_ARC copy.ifc', OK('fp1'), { checked: false })
  const loaded = entry('Hotel_Vela_MEP.ifc', OK('fp3', MATCH), { checked: true })
  const bad = entry('notes.txt', BAD, { checked: false })
  const rows = [a, b, dup, loaded, bad]

  it('"all" takes every valid non-duplicate row, in order', () => {
    expect(selectForSubmit(rows, 'all').map((e) => e.key)).toEqual([a.key, b.key])
  })

  it('"selected" takes checked rows, duplicates included when checked', () => {
    expect(selectForSubmit(rows, 'selected').map((e) => e.key)).toEqual([a.key, loaded.key])
  })

  it('"duplicate" takes the single prompt file only', () => {
    expect(selectForSubmit([loaded], 'duplicate')).toEqual([loaded])
    expect(selectForSubmit(rows, 'duplicate')).toEqual([])
  })

  it('summarises counts and bytes', () => {
    const s = summarizeSelection(rows)
    expect(s.total).toBe(5)
    expect(s.allCount).toBe(2)
    expect(s.selectedCount).toBe(2)
    expect(s.selectionIsAll).toBe(false)
    expect(s.hasLarge).toBe(false)
  })

  it('flags large and very large loadable rows only', () => {
    const big = entry('big.ifc', OK('fpb'), { file: sizedFile('big.ifc', VERY_LARGE_FILE_BYTES), checked: true })
    const s = summarizeSelection([big])
    expect(s.hasLarge).toBe(true)
    expect(s.hasVeryLarge).toBe(true)
    const invalidHuge = entry('huge.ifc', BAD, { file: sizedFile('huge.ifc', VERY_LARGE_FILE_BYTES) })
    expect(summarizeSelection([invalidHuge]).hasLarge).toBe(false)
  })
})

describe('batch naming', () => {
  const arc = entry('Hotel_Vela_ARC.ifc', OK('1'), { checked: true })
  const str = entry('Hotel_Vela_STR.ifc', OK('2'), { checked: true })

  it('uses what the user typed', () => {
    expect(resolveBatchName({ name: '  Tender set  ', createGroup: true }, [arc, str])).toBe('Tender set')
  })

  it('infers from the submitted files when untouched or cleared', () => {
    expect(resolveBatchName({ name: null, createGroup: true }, [arc, str])).toBe('Hotel Vela')
    expect(resolveBatchName({ name: '   ', createGroup: true }, [arc, str])).toBe('Hotel Vela')
  })

  it('is not a batch with one file', () => {
    expect(resolveBatchName({ name: 'X', createGroup: true }, [arc])).toBeNull()
  })

  it('suggests from the checked rows', () => {
    const other = entry('Site_Survey.ifc', OK('3'), { checked: false })
    expect(suggestedBatchName([arc, str, other])).toBe('Hotel Vela')
  })
})

// ── Reducer ───────────────────────────────────────────────────────────────────

describe('upload state machine', () => {
  const run = (events: Parameters<typeof uploadReducer>[1][], from: UploadState = INITIAL_UPLOAD_STATE): UploadState =>
    events.reduce(uploadReducer, from)

  it('drag enter / leave toggles the idle drop zone', () => {
    expect(run([{ type: 'DRAG_ENTER' }]).id).toBe('dragging')
    expect(run([{ type: 'DRAG_ENTER' }, { type: 'DRAG_LEAVE' }]).id).toBe('idle')
  })

  it('fast-paths a single small valid file straight to submitting', () => {
    const e = entry('Tower.ifc', null)
    const s = run([
      { type: 'FILES_ADDED', entries: [e] },
      { type: 'ENTRY_PREPARED', key: e.key, check: OK('fp') },
    ])
    expect(s.id).toBe('submitting')
    if (s.id === 'submitting') {
      expect(s.entries.map((x) => x.key)).toEqual([e.key])
      expect(s.batchName).toBeNull()
      expect(s.createGroup).toBe(false)
      expect(s.origin).toBe('drop')
    }
  })

  it('waits for every file before leaving preparing, then applies defaults', () => {
    const a = entry('A_ARC.ifc', null)
    const b = entry('A_STR.ifc', null)
    const c = entry('A_ARC (1).ifc', null)
    let s = run([{ type: 'FILES_ADDED', entries: [a, b, c] }])
    // Out of order, and the duplicate lands BEFORE its original.
    s = run([{ type: 'ENTRY_PREPARED', key: c.key, check: OK('fpA') }], s)
    s = run([{ type: 'ENTRY_PREPARED', key: b.key, check: OK('fpB') }], s)
    expect(s.id).toBe('preparing')
    s = run([{ type: 'ENTRY_PREPARED', key: a.key, check: OK('fpA') }], s)
    expect(s.id).toBe('review')
    if (s.id === 'review') {
      expect(s.entries.map((x) => x.checked)).toEqual([true, true, false])
      expect(s.batch).toEqual({ name: null, createGroup: true })
    }
  })

  it('appends to a reviewed selection and keeps the user\'s choices', () => {
    const a = entry('a.ifc', null)
    const b = entry('b.ifc', null)
    let s = run([
      { type: 'FILES_ADDED', entries: [a, b] },
      { type: 'ENTRY_PREPARED', key: a.key, check: OK('1') },
      { type: 'ENTRY_PREPARED', key: b.key, check: OK('2') },
      { type: 'TOGGLE', key: b.key },
    ])
    expect(s.id).toBe('review')
    const c = entry('c.ifc', null)
    // The same File object again is ignored; a new one is appended.
    s = run([{ type: 'FILES_ADDED', entries: [{ ...a, key: 'again' }, c] }], s)
    expect(s.id).toBe('preparing')
    if (s.id === 'preparing') expect(s.entries.map((x) => x.key)).toEqual([a.key, b.key, c.key])
    s = run([{ type: 'ENTRY_PREPARED', key: c.key, check: OK('3') }], s)
    expect(s.id).toBe('review')
    if (s.id === 'review') expect(s.entries.map((x) => x.checked)).toEqual([true, false, true])
  })

  it('ignores results for rows that no longer exist', () => {
    const a = entry('a.ifc', null)
    const s = run([
      { type: 'FILES_ADDED', entries: [a] },
      { type: 'RESET' },
      { type: 'ENTRY_PREPARED', key: a.key, check: OK('1') },
    ])
    expect(s).toBe(INITIAL_UPLOAD_STATE)
  })

  it('submits all / selected with the batch settings', () => {
    const a = entry('Hotel_Vela_ARC.ifc', null)
    const b = entry('Hotel_Vela_STR.ifc', null, { origin: 'upload' })
    const bad = entry('readme.txt', null)
    const review = run([
      { type: 'FILES_ADDED', entries: [a, b, bad] },
      { type: 'ENTRY_PREPARED', key: a.key, check: OK('1') },
      { type: 'ENTRY_PREPARED', key: b.key, check: OK('2') },
      { type: 'ENTRY_PREPARED', key: bad.key, check: BAD },
    ])
    expect(review.id).toBe('review')

    const all = run([{ type: 'SUBMIT', scope: 'all' }], review)
    expect(all).toMatchObject({ id: 'submitting', batchName: 'Hotel Vela', createGroup: true, origin: 'drop' })

    const renamed = run([
      { type: 'SET_BATCH_NAME', name: 'Tender' },
      { type: 'SET_CREATE_GROUP', value: false },
      { type: 'TOGGLE', key: a.key },
      { type: 'SUBMIT', scope: 'selected' },
    ], review)
    expect(renamed.id).toBe('submitting')
    if (renamed.id === 'submitting') {
      expect(renamed.entries.map((x) => x.key)).toEqual([b.key])
      // One file is not a batch: no name, no group.
      expect(renamed.batchName).toBeNull()
      expect(renamed.createGroup).toBe(false)
      expect(renamed.origin).toBe('upload')
    }
  })

  it('does not toggle invalid rows or submit an empty selection', () => {
    const a = entry('a.ifc', null)
    const bad = entry('b.txt', null)
    let s = run([
      { type: 'FILES_ADDED', entries: [a, bad] },
      { type: 'ENTRY_PREPARED', key: a.key, check: OK('1') },
      { type: 'ENTRY_PREPARED', key: bad.key, check: BAD },
    ])
    const before = s
    s = run([{ type: 'TOGGLE', key: bad.key }], s)
    expect(s).toBe(before)
    s = run([{ type: 'TOGGLE', key: a.key }, { type: 'SUBMIT', scope: 'selected' }], s)
    expect(s.id).toBe('review')
  })

  it('duplicate prompt → load anyway', () => {
    const a = entry('Tower.ifc', null)
    const s = run([
      { type: 'FILES_ADDED', entries: [a] },
      { type: 'ENTRY_PREPARED', key: a.key, check: OK('fp', MATCH) },
    ])
    expect(s.id).toBe('duplicate')
    expect(run([{ type: 'SUBMIT', scope: 'all' }], s).id).toBe('duplicate')
    expect(run([{ type: 'SUBMIT', scope: 'duplicate' }], s).id).toBe('submitting')
  })

  it('an all-invalid selection errors, and a new drop starts over', () => {
    const bad = entry('a.txt', null)
    const s = run([
      { type: 'FILES_ADDED', entries: [bad] },
      { type: 'ENTRY_PREPARED', key: bad.key, check: BAD },
    ])
    expect(s.id).toBe('error')
    const fresh = entry('b.ifc', null)
    const next = run([{ type: 'FILES_ADDED', entries: [fresh] }], s)
    expect(next.id).toBe('preparing')
    if (next.id === 'preparing') expect(next.entries.map((x) => x.key)).toEqual([fresh.key])
  })

  it('highlights a drag over a live selection without leaving it', () => {
    const a = entry('a.ifc', null)
    const b = entry('b.ifc', null)
    const review = run([
      { type: 'FILES_ADDED', entries: [a, b] },
      { type: 'ENTRY_PREPARED', key: a.key, check: OK('1') },
      { type: 'ENTRY_PREPARED', key: b.key, check: OK('2') },
    ])
    const over = run([{ type: 'DRAG_ENTER' }], review)
    expect(over).toMatchObject({ id: 'review', dragOver: true })
    expect(run([{ type: 'DRAG_LEAVE' }], over)).toMatchObject({ id: 'review', dragOver: false })
  })
})
