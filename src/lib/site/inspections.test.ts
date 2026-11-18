import { describe, expect, it } from 'vitest'
import en from '../../locales/en/site.json'
import {
  addItemPhoto, builtInKeys, builtInTemplates, canSignInspection, createInspection, createTemplate, duplicateTemplate, groupBySection,
  inspectionSummary, parseTemplateText, parseTemplatesJson, removeItemPhoto, sanitizeInspection, setInspectionItemNote,
  setInspectionItemResult, signInspection, templateToText, templatesToJson, updateInspection, updateTemplate, validateInspection,
} from './inspections'
import { buildInspectionPdf, type InspectionReportLabels } from './site-records-pdf'

const NOW = new Date('2026-11-19T09:00:00Z')
const SIG = 'data:image/png;base64,iVBORw0KGgo='
const lookup = (k: string): string => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], en) as string
const tr = (k: string) => lookup(k) ?? `!${k}`

describe('built-in templates', () => {
  it('cover the five site checklists and every key exists in en', () => {
    for (const k of builtInKeys()) expect(typeof lookup(k), k).toBe('string')
    const tpls = builtInTemplates(tr)
    expect(tpls.map((t) => t.id)).toEqual(['builtin-materials', 'builtin-structure', 'builtin-installations', 'builtin-waterproofing', 'builtin-final'])
    expect(tpls.every((t) => t.builtIn && t.items.length >= 6)).toBe(true)
    const inst = tpls[2]
    expect(new Set(inst.items.map((i) => i.section)).size).toBe(3)
    expect(tpls.flatMap((t) => t.items.map((i) => i.text)).some((s) => s.startsWith('!'))).toBe(false)
  })

  it('cannot be edited in place, only duplicated', () => {
    const b = builtInTemplates(tr)[0]
    expect(() => updateTemplate(b, { name: 'x' })).toThrow()
    const d = duplicateTemplate(b, 'Mine', NOW, 'tpl-1')
    expect(d.builtIn).toBeUndefined()
    expect(d.items).toEqual(b.items)
    expect(updateTemplate(d, { text: 'A\nB' }, NOW).items.map((i) => i.text)).toEqual(['A', 'B'])
  })
})

describe('template text and JSON', () => {
  it('parses sections and round-trips', () => {
    const items = parseTemplateText('# Fire\nExtinguishers\n\nDetectors\n# Water\nPressure test')
    expect(items).toEqual([
      { id: 'i1', text: 'Extinguishers', section: 'Fire' }, { id: 'i2', text: 'Detectors', section: 'Fire' }, { id: 'i3', text: 'Pressure test', section: 'Water' },
    ])
    expect(parseTemplateText(templateToText(items))).toEqual(items)
  })

  it('rejects empty templates', () => {
    expect(() => createTemplate('', 'a')).toThrow()
    expect(() => createTemplate('n', '# only a section')).toThrow()
  })

  it('exports and imports, renaming colliding and built-in ids', () => {
    const a = createTemplate('A', 'one\ntwo', 'Masonry', NOW, 'tpl-a')
    const json = templatesToJson([a, { ...a, id: 'builtin-materials', name: 'B' }])
    const got = parseTemplatesJson(json, ['tpl-a'], NOW)
    expect(got).toHaveLength(2)
    expect(got[0].id).not.toBe('tpl-a')
    expect(got[1].id.startsWith('builtin-')).toBe(false)
    expect(got[0].items.map((i) => i.text)).toEqual(['one', 'two'])
    expect(got[0].trade).toBe('Masonry')
    expect(parseTemplatesJson(JSON.stringify(a), [], NOW)[0].id).toBe('tpl-a')
    expect(() => parseTemplatesJson('{"templates":[{"id":"x"}]}')).toThrow()
    expect(() => parseTemplatesJson('not json')).toThrow()
  })
})

describe('inspections', () => {
  const tpl = createTemplate('Waterproofing', '# Roof\nClean substrate\nFlood test', 'Waterproofing', NOW, 'tpl-w')

  it('stores only stable keys for the target', () => {
    const i = createInspection(tpl, { unitId: 'model-3:2O2Fr$t4X7Zf8NOew3FLOH', unitName: '1A', globalId: '#12' }, NOW, 'insp-1')
    expect(i.target).toEqual({ unitId: '2O2Fr$t4X7Zf8NOew3FLOH', unitName: '1A' })
    expect(JSON.stringify(i)).not.toContain('model-3')
    expect(i.items).toHaveLength(2)
    expect(i.date).toBe('2026-11-19')
  })

  it('a first fail opens one snag for the unit and element, carrying photos', () => {
    let i = createInspection(tpl, { unitId: 'U1', unitName: '1A', globalId: '3vB2YO$MX4xv5uCqZZG05x' }, NOW, 'insp-1')
    i = addItemPhoto(i, 'i2', 'photo-1', NOW)
    i = setInspectionItemNote(i, 'i2', ' water under the slab ', NOW)
    const r = setInspectionItemResult(i, 'i2', 'fail', undefined, NOW)
    expect(r.snag).toBeDefined()
    expect(r.snag!.unitId).toBe('U1')
    expect(r.snag!.location).toEqual({ globalId: '3vB2YO$MX4xv5uCqZZG05x' })
    expect(r.snag!.photoIds).toEqual(['photo-1'])
    expect(r.snag!.description).toBe('water under the slab')
    expect(r.snag!.trade).toBe('Waterproofing')
    expect(r.inspection.items[1].snagId).toBe(r.snag!.id)
    const again = setInspectionItemResult(setInspectionItemResult(r.inspection, 'i2', 'ok', undefined, NOW).inspection, 'i2', 'fail', undefined, NOW)
    expect(again.snag).toBeUndefined()
    expect(again.inspection.items[1].snagId).toBe(r.snag!.id)
  })

  it('validates, signs and becomes read-only', () => {
    let i = createInspection(tpl, {}, NOW, 'insp-1')
    expect(validateInspection(i)).toEqual(['inspector', 'unanswered', 'signature'])
    i = updateInspection(i, { inspector: 'Ana', signature: SIG }, NOW)
    i = setInspectionItemResult(i, 'i1', 'ok', undefined, NOW).inspection
    expect(canSignInspection(i)).toBe(false)
    i = setInspectionItemResult(i, 'i2', 'na', undefined, NOW).inspection
    expect(canSignInspection(i)).toBe(true)
    const s = signInspection(i, NOW)
    expect(s.status).toBe('signed')
    expect(() => updateInspection(s, { inspector: 'x' })).toThrow()
    expect(() => setInspectionItemResult(s, 'i1', 'fail')).toThrow()
    expect(() => addItemPhoto(s, 'i1', 'p')).toThrow()
    expect(() => removeItemPhoto(s, 'i1', 'p')).toThrow()
    expect(inspectionSummary(s)).toEqual({ total: 2, ok: 1, fail: 0, na: 1, pending: 0 })
  })

  it('groups by section and sanitises stored records', () => {
    const i = createInspection(tpl, {}, NOW, 'insp-1')
    expect(groupBySection(i.items).map((g) => g.section)).toEqual(['Roof'])
    expect(sanitizeInspection(null)).toBeNull()
    const s = sanitizeInspection({ ...i, status: 'weird', signature: 'javascript:1', items: [...i.items, { id: 3 }], target: { unitId: 'm:U', globalId: '#5' } })!
    expect(s.status).toBe('draft')
    expect(s.signature).toBeUndefined()
    expect(s.items).toHaveLength(2)
    expect(s.target).toEqual({ unitId: 'U' })
  })

  it('builds a PDF with CJK lines going through the rasterizer', () => {
    let i = createInspection({ ...tpl, name: '防水检查' }, { label: 'Roof' }, NOW, 'insp-1')
    i = setInspectionItemResult(i, 'i1', 'fail', undefined, NOW).inspection
    const labels = Object.fromEntries(['title', 'project', 'template', 'date', 'inspector', 'unit', 'element', 'place', 'pending', 'note', 'snag', 'summary', 'signature', 'signedAt', 'draft', 'footer']
      .map((k) => [k, k])) as unknown as InspectionReportLabels
    labels.results = { ok: 'OK', fail: 'Fail', na: 'N/A' }
    let rasterized = 0
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 10, 0, 20, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const pdf = buildInspectionPdf(i, labels, { project: 'P', rasterize: () => { rasterized++; return { jpeg, width: 20, height: 10 } } })
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('(Fail)')
    expect(rasterized).toBeGreaterThan(0)
  })
})
