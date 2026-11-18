import { describe, it, expect, vi } from 'vitest'
import { asBuiltCsv, asBuiltCsvCell } from './results-csv'
import { asBuiltColorKey, asBuiltIsolateTargets, asBuiltPaintPlan, createAsBuiltView, ASBUILT_COLORS } from './results-colors'
import type { ElementDeviation } from './as-built-score'

const el = (id: number, state: ElementDeviation['state'], p95: number | null = null, extra: Partial<ElementDeviation> = {}): ElementDeviation =>
  ({ id, ifcClass: 'IFCWALL', state, deviationP95: p95, matchedFraction: 0.5, ...extra })

describe('asBuiltCsv', () => {
  it('writes the header and CRLF rows', () => {
    const csv = asBuiltCsv([el(1, 'deviated', 0.0234, { samples: 40 })], new Map([[1, { globalId: 'G1', name: 'Wall' }]]))
    expect(csv).toBe('globalId,name,ifcClass,state,p95_mm,matched_fraction,samples\r\nG1,Wall,IFCWALL,deviated,23.4,0.500,40\r\n')
  })
  it('quotes per RFC 4180', () => {
    expect(asBuiltCsvCell('a,b')).toBe('"a,b"')
    expect(asBuiltCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(asBuiltCsvCell('l1\nl2')).toBe('"l1\nl2"')
  })
  it('guards formula injection', () => {
    for (const s of ['=1+1', '+1', '-1', '@SUM(A1)']) expect(asBuiltCsvCell(s)).toBe(`'${s}`)
    expect(asBuiltCsvCell('=a,b')).toBe(`"'=a,b"`)
    const csv = asBuiltCsv([el(2, 'missing')], new Map([[2, { name: '=HYPERLINK("x")' }]]))
    expect(csv.split('\r\n')[1]).toBe(`,"'=HYPERLINK(""x"")",IFCWALL,missing,,0.500,`)
  })
})

describe('as-built colours', () => {
  it('maps states to colours, severe deviation red', () => {
    expect(asBuiltColorKey(el(1, 'conforming', 0.001), 0.01)).toBe(`${ASBUILT_COLORS.conforming}:1`)
    expect(asBuiltColorKey(el(1, 'deviated', 0.015), 0.01)).toBe(`${ASBUILT_COLORS.deviated}:1`)
    expect(asBuiltColorKey(el(1, 'deviated', 0.03), 0.01)).toBe(`${ASBUILT_COLORS.severe}:1`)
    expect(asBuiltColorKey(el(1, 'missing'), 0.01)).toBe(`${ASBUILT_COLORS.missing}:1`)
    expect(asBuiltColorKey(el(1, 'unobserved'), 0.01)).toBe(`${ASBUILT_COLORS.unobserved}:1`)
    expect(asBuiltColorKey(el(1, 'occluded'), 0.01)).toBe(`${ASBUILT_COLORS.unobserved}:1`)
  })
  it('builds a plan for the model and isolate targets', () => {
    const els = [el(1, 'conforming'), el(2, 'deviated', 0.02), el(3, 'missing')]
    expect(asBuiltPaintPlan('m', els, 0.01).paint.get('m')?.size).toBe(3)
    expect(asBuiltIsolateTargets('m', els)).toEqual([{ expressId: 2, modelId: 'm' }, { expressId: 3, modelId: 'm' }])
  })
  it('clear restores paint and visibility once, through the viewer APIs', () => {
    const viewer = { setTwinPaint: vi.fn(async () => {}), isolateElements: vi.fn() }
    const v = createAsBuiltView(viewer)
    v.paint(asBuiltPaintPlan('m', [el(1, 'missing')], 0.01))
    v.isolate([{ expressId: 1, modelId: 'm' }])
    v.clear()
    expect(viewer.setTwinPaint).toHaveBeenLastCalledWith(null)
    expect(viewer.isolateElements).toHaveBeenLastCalledWith([], false)
    v.clear()
    expect(viewer.setTwinPaint).toHaveBeenCalledTimes(2)
    expect(viewer.isolateElements).toHaveBeenCalledTimes(2)
    expect(v.painted || v.isolated).toBe(false)
  })
})
