// Scoped parity for common.layout.* (the drawer grip). common.json as a whole
// has no parity test, so this keeps the new keys honest without failing on
// older drift elsewhere in the namespace.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const LOCALES = ['ca', 'de', 'en', 'es', 'fr', 'it', 'ja', 'pt', 'th', 'zh']
const load = (l: string): { layout?: Record<string, unknown> } =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'src', 'locales', l, 'common.json'), 'utf8'))

const en = load('en').layout as Record<string, string>

describe('common.layout parity', () => {
  it('EN defines the grip keys', () => {
    expect(Object.keys(en).sort()).toEqual(['resizePanel', 'resizePanelHint'])
  })

  for (const l of LOCALES) {
    it(`${l} has exactly the EN keys, translated`, () => {
      const layout = load(l).layout as Record<string, unknown>
      expect(Object.keys(layout).sort()).toEqual(Object.keys(en).sort())
      for (const k of Object.keys(en)) {
        expect(typeof layout[k]).toBe('string')
        expect((layout[k] as string).trim()).not.toBe('')
        if (l !== 'en') expect(layout[k], `${l}.${k}`).not.toBe(en[k])
      }
    })
  }
})
