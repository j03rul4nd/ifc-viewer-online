import { describe, expect, it } from 'vitest'
import { benchmarkCandidates, isOurExportBuffer, type BenchmarkGuardDeps } from './benchmark-guard'
import { DEMO_FILENAMES } from '../demo-models/models'
import type { ValidationResult } from '../types'

const result = (qualityScore: number | undefined, edits?: number): ValidationResult => ({
  issues: [], stats: { total: 0, errors: 0, warnings: 0, info: 0, byRule: {} }, durationMs: 0,
  ...(qualityScore === undefined ? {} : { qualityScore }),
  ...(edits === undefined ? {} : { metadata: { edits } }),
})

function deps(results: Record<string, ValidationResult>, ours: string[] = [], keys: Record<string, string> = {}): BenchmarkGuardDeps {
  return {
    getResult: (id) => results[id],
    getKey: (id) => keys[id] ?? `key-${id}`,
    isOurExport: (id) => ours.includes(id),
  }
}

const demoName = [...DEMO_FILENAMES][0]

describe('benchmarkCandidates', () => {
  it('posts each delivered file once, from its own result', () => {
    const out = benchmarkCandidates(
      [{ id: 'a', fileName: 'a.ifc' }, { id: 'b', fileName: 'b.ifc' }],
      deps({ a: result(80), b: result(64) }),
      new Set(),
    )
    expect(out).toEqual([{ key: 'key-a', score: 80 }, { key: 'key-b', score: 64 }])
  })

  it('skips demo files, edited results, our own exports and already-posted keys', () => {
    const models = [
      { id: 'demo', fileName: demoName },
      { id: 'edited', fileName: 'e.ifc' },
      { id: 'ours', fileName: 'house-fixed.ifc' },
      { id: 'posted', fileName: 'p.ifc' },
      { id: 'unscored', fileName: 'u.ifc' },
      { id: 'ok', fileName: 'ok.ifc' },
    ]
    const out = benchmarkCandidates(
      models,
      deps({
        demo: result(90), edited: result(95, 3), ours: result(99), posted: result(70), unscored: result(undefined), ok: result(55),
      }, ['ours']),
      new Set(['key-posted']),
    )
    expect(out).toEqual([{ key: 'key-ok', score: 55 }])
  })

  it('the same file twice is one sample', () => {
    const out = benchmarkCandidates(
      [{ id: 'a', fileName: 'a.ifc' }, { id: 'a2', fileName: 'a.ifc' }],
      deps({ a: result(80), a2: result(80) }, [], { a: 'same', a2: 'same' }),
      new Set(),
    )
    expect(out).toEqual([{ key: 'same', score: 80 }])
  })

  it('an edit count of 0 is the original file and is posted', () => {
    expect(benchmarkCandidates([{ id: 'a', fileName: 'a.ifc' }], deps({ a: result(80, 0) }), new Set())).toHaveLength(1)
  })
})

describe('isOurExportBuffer', () => {
  const file = (preprocessor: string): ArrayBuffer => new TextEncoder().encode([
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('a.ifc','2026-10-16T10:00:00',(''),(''),'${preprocessor}','Revit','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n')).buffer as ArrayBuffer

  it('recognises the stamp the export writes', () => {
    expect(isOurExportBuffer(file('IFC Viewer Online 1.2.3'))).toBe(true)
    expect(isOurExportBuffer(file('IfcOpenShell 0.7'))).toBe(false)
    expect(isOurExportBuffer(new ArrayBuffer(0))).toBe(false)
    expect(isOurExportBuffer(null)).toBe(false)
  })
})
