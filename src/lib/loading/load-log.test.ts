// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createJobLogger, formatLoadLine, isTraceEnabled, perfMark } from './load-log'

const MB = 1024 * 1024

describe('formatLoadLine', () => {
  it('prefixes job and file, then the message and fields', () => {
    expect(formatLoadLine({ jobId: 'j3', fileName: 'Hotel_Vela.ifc', msg: 'phase geometry', fields: { progress: 72, classes: '31/48' } }))
      .toBe('[IFC-LOAD] job=j3 file=Hotel_Vela.ifc phase geometry progress=72 classes=31/48')
  })

  it('prints *Bytes as MB and *Ms as ms or seconds', () => {
    const line = formatLoadLine({ jobId: 'j1', fileName: 'a.ifc', msg: 'x', fields: { sizeBytes: 12.34 * MB, elapsedMs: 18_240, waitMs: 42.4 } })
    expect(line).toBe('[IFC-LOAD] job=j1 file=a.ifc x sizeBytes=12.3MB elapsedMs=18.2s waitMs=42ms')
  })

  it('rounds plain numbers sensibly', () => {
    const line = formatLoadLine({ jobId: 'j1', fileName: 'a', msg: '', fields: { a: 1234.567, b: 12.345, c: 0.123456, d: 7, e: NaN } })
    expect(line).toBe('[IFC-LOAD] job=j1 file=a a=1235 b=12.3 c=0.123 d=7 e=NaN')
  })

  it('quotes values with spaces, drops undefined, keeps null and booleans', () => {
    const line = formatLoadLine({
      jobId: 'j1', fileName: 'My Model.ifc', msg: 'loaded',
      fields: { skip: undefined, none: null, fromCache: true, note: 'a b', obj: { k: 1 } },
    })
    expect(line).toBe('[IFC-LOAD] job=j1 file="My Model.ifc" loaded none=null fromCache=true note="a b" obj={"k":1}')
  })

  it('survives unserialisable fields', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(formatLoadLine({ jobId: 'j', fileName: 'f', msg: 'm', fields: { cyclic } })).toContain('cyclic=[unserialisable]')
  })
})

describe('createJobLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('writes formatted lines on the Load channel and follows a file-name getter', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    let name = 'remote.ifc'
    const l = createJobLogger('j9', () => name)
    l.info('queued', { sizeBytes: 2 * MB })
    name = 'Tower.ifc'
    l.info('phase download')
    const lines = info.mock.calls.map((c) => c.map(String).join(' '))
    expect(lines[0]).toContain('[Load]')
    expect(lines[0]).toContain('[IFC-LOAD] job=j9 file=remote.ifc queued sizeBytes=2.0MB')
    expect(lines[1]).toContain('file=Tower.ifc phase download')
  })

  it('trace is silent unless ifc:log-level is trace', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const l = createJobLogger('j1', 'a.ifc')
    l.trace('lane granted')
    expect(debug).not.toHaveBeenCalled()
    expect(isTraceEnabled()).toBe(false)
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'ifc:log-level' ? 'trace' : null) })
    expect(isTraceEnabled()).toBe(true)
    l.trace('lane granted', { lane: 'convert' })
    expect(debug).toHaveBeenCalledTimes(1)
    expect(debug.mock.calls[0].map(String).join(' ')).toContain('lane granted lane=convert')
  })

  it('a throwing localStorage disables trace instead of throwing', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') } })
    expect(isTraceEnabled()).toBe(false)
  })
})

describe('perfMark', () => {
  it('records a measure per phase and cleans its marks', () => {
    performance.clearMeasures()
    perfMark('jt', 'geometry', 'start')
    perfMark('jt', 'geometry', 'end')
    expect(performance.getEntriesByName('ifc-load:jt:geometry', 'measure')).toHaveLength(1)
    expect(performance.getEntriesByName('ifc-load:jt:geometry:start', 'mark')).toHaveLength(0)
  })

  it('an end without a start never throws', () => {
    expect(() => perfMark('jx', 'attach', 'end')).not.toThrow()
  })
})
