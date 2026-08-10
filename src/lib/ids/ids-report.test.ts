// ─── ids-report tests ─────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { toIdsJson, toIdsCsv, toIdsHtml, idsResultToBcfTopics } from './ids-report'
import { exportBcfZip } from '../bcf'
import type { IdsResult } from './ids-types'

const RESULT: IdsResult = {
  title: 'T',
  modelSchema: 'IFC4',
  totalSpecs: 3,
  passedSpecs: 1,
  failedSpecs: 1,
  naSpecs: 1,
  score: 50,
  specs: [
    {
      name: 'Walls need FireRating', status: 'fail',
      applicableCount: 2, passedCount: 1, failedCount: 1, unsupported: [],
      failures: [{ expressId: 7, ifcClass: 'IFCWALL', name: 'W "quote"', globalId: '3vB2eR$Gn0kQz1AbCdEf01', reasons: [{ code: 'missingRequired', params: { what: 'property Pset_WallCommon.FireRating' } }] }],
    },
    { name: 'Doors have a Name', status: 'pass', applicableCount: 3, passedCount: 3, failedCount: 0, unsupported: [], failures: [] },
    { name: 'IFC4-only spec', status: 'na', skippedReason: 'ifcVersion', applicableCount: 0, passedCount: 0, failedCount: 0, unsupported: [], failures: [] },
  ],
}

describe('toIdsJson', () => {
  it('serializes a complete, honest report (reasons carry code + text)', () => {
    const json = JSON.parse(toIdsJson(RESULT, { idsFile: 'a.ids', modelFile: 'm.ifc' }))
    expect(json).toMatchObject({ idsFile: 'a.ids', modelFile: 'm.ifc', modelSchema: 'IFC4', score: 50 })
    expect(json.specs).toHaveLength(3)
    expect(json.specs[0].failures[0].reasons[0]).toEqual({
      code: 'missingRequired',
      params: { what: 'property Pset_WallCommon.FireRating' },
      text: 'missing required property Pset_WallCommon.FireRating',
    })
    // skipped spec is represented, not dropped (honesty)
    expect(json.specs[2]).toMatchObject({ status: 'na', skippedReason: 'ifcVersion' })
  })
})

// A report is the artifact that gets attached to a delivery. If entities could
// not be read, all three formats must say so — a green score standing alone is a
// claim about the whole model that the check never made.
describe('unreadable entities reach every export format', () => {
  const PARTIAL: IdsResult = { ...RESULT, unreadableEntities: 12 }

  it('is a number in the JSON report, zero when the read was complete', () => {
    expect(JSON.parse(toIdsJson(PARTIAL)).unreadableEntities).toBe(12)
    expect(JSON.parse(toIdsJson(RESULT)).unreadableEntities).toBe(0)
  })

  it('is a leading note row in the CSV, absent when the read was complete', () => {
    const rows = toIdsCsv(PARTIAL).split('\r\n')
    expect(rows[1]).toContain('12 IFC entities could not be read')
    expect(toIdsCsv(RESULT)).not.toContain('could not be read')
  })

  it('is a banner in the HTML report, absent when the read was complete', () => {
    const html = toIdsHtml(PARTIAL)
    expect(html).toContain('12 IFC entities could not be read')
    // Above the per-spec sections, where the score is — not buried at the bottom.
    expect(html.indexOf('could not be read')).toBeLessThan(html.indexOf('class="spec"'))
    expect(toIdsHtml(RESULT)).not.toContain('could not be read')
  })

  it('says "entity" for exactly one', () => {
    expect(toIdsHtml({ ...RESULT, unreadableEntities: 1 })).toContain('1 IFC entity could not be read')
  })
})

describe('toIdsCsv', () => {
  const csv = toIdsCsv(RESULT)

  it('starts with a UTF-8 BOM and the header', () => {
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv.slice(1).split('\r\n')[0]).toBe('spec,specStatus,skippedReason,expressId,globalId,ifcClass,elementName,reasons')
  })

  it('emits one row per failure and a summary row for failure-free specs', () => {
    const rows = csv.split('\r\n')
    // header + fail row + pass summary + na summary
    expect(rows).toHaveLength(4)
    expect(rows[1]).toContain('IFCWALL')
    expect(rows[1]).toContain('3vB2eR$Gn0kQz1AbCdEf01') // GUID column populated
    expect(rows[1]).toContain('missing required property Pset_WallCommon.FireRating')
    expect(rows[3]).toContain('ifcVersion') // skipped spec still represented
  })

  it('escapes quotes in element names (RFC 4180)', () => {
    expect(csv).toContain('"W ""quote"""')
  })
})

describe('toIdsHtml', () => {
  const html = toIdsHtml(RESULT, { idsFile: 'a.ids', modelFile: 'm.ifc' })

  it('is a self-contained HTML document with the score and counts', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).not.toMatch(/<(script|link|img)\b/) // no external assets / no scripts
    expect(html).toContain('>50<') // score
    expect(html).toContain('1 fail')
  })

  it('escapes dynamic text (XSS-safe)', () => {
    const evil = toIdsHtml({ ...RESULT, specs: [{ ...RESULT.specs[0], name: '<script>x</script>' }] })
    expect(evil).not.toContain('<script>x</script>')
    expect(evil).toContain('&lt;script&gt;x&lt;/script&gt;')
  })

  it('represents skipped/na specs honestly', () => {
    expect(html).toContain('SKIPPED')
    expect(html).toContain('targets a different IFC schema')
  })
})

describe('idsResultToBcfTopics + exportBcfZip', () => {
  it('emits one topic per failing element, EN titles, IDS label', () => {
    const topics = idsResultToBcfTopics(RESULT, 'data:image/png;base64,iVBORw0KGgo=')
    expect(topics).toHaveLength(1) // one fail spec with one failure
    expect(topics[0]).toMatchObject({ topicType: 'Error', priority: 'High', status: 'Open', source: 'generated' })
    expect(topics[0].title).toContain('[IDS: Walls need FireRating]')
    expect(topics[0].labels).toEqual(['IDS'])
    expect(topics[0].viewpoints).toHaveLength(1)
  })

  it('produces a non-empty .bcfzip (valid zip header)', () => {
    const topics = idsResultToBcfTopics(RESULT)
    const zip = exportBcfZip(topics, '2.1')
    expect(zip.byteLength).toBeGreaterThan(0)
    expect(zip[0]).toBe(0x50) // 'P'
    expect(zip[1]).toBe(0x4B) // 'K' — PKZip magic
  })

  it('has no topics when nothing failed', () => {
    const clean: IdsResult = { ...RESULT, failedSpecs: 0, specs: [{ ...RESULT.specs[1] }] }
    expect(idsResultToBcfTopics(clean)).toHaveLength(0)
  })
})
