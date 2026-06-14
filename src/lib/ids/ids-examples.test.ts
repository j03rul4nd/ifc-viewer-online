// ─── ids-examples tests ───────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { IDS_EXAMPLES } from './ids-examples'
import { parseIds } from './ids-parser'
import enIds from '../../locales/en/ids.json'
import esIds from '../../locales/es/ids.json'

describe('bundled IDS examples', () => {
  it('every example is valid IDS 1.0 XML that parses into specifications', () => {
    expect(IDS_EXAMPLES.length).toBeGreaterThan(0)
    for (const ex of IDS_EXAMPLES) {
      const doc = parseIds(ex.xml)
      expect(doc.specifications.length, ex.id).toBeGreaterThan(0)
      // every spec has an entity applicability so gathering can target classes
      for (const s of doc.specifications) {
        expect(s.applicability.some((f) => f.kind === 'entity'), `${ex.id} applicability`).toBe(true)
      }
    }
  })

  it('has unique ids, filenames and label keys', () => {
    const ids = IDS_EXAMPLES.map((e) => e.id)
    const files = IDS_EXAMPLES.map((e) => e.fileName)
    const keys = IDS_EXAMPLES.map((e) => e.labelKey)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(files).size).toBe(files.length)
    expect(new Set(keys).size).toBe(keys.length)
    for (const f of files) expect(f.endsWith('.ids')).toBe(true)
  })

  it('every example has localized name + desc in EN and ES', () => {
    const ex = (enIds as { examples: Record<string, string> }).examples
    const es = (esIds as { examples: Record<string, string> }).examples
    for (const e of IDS_EXAMPLES) {
      expect(ex[`${e.labelKey}Name`], `EN ${e.labelKey}Name`).toBeTruthy()
      expect(ex[`${e.labelKey}Desc`], `EN ${e.labelKey}Desc`).toBeTruthy()
      expect(es[`${e.labelKey}Name`], `ES ${e.labelKey}Name`).toBeTruthy()
      expect(es[`${e.labelKey}Desc`], `ES ${e.labelKey}Desc`).toBeTruthy()
    }
  })
})
