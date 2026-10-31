// @vitest-environment node
import { describe, expect, it } from 'vitest'

const files = import.meta.glob('./*/sketch.json', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>

function flatten(o: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, `${prefix}${k}.`))
    else out[prefix + k] = String(v)
  }
  return out
}

const params = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort()

describe('sketch locale parity', () => {
  const en = flatten(files['./en/sketch.json'])

  it('covers all ten languages', () => {
    expect(Object.keys(files)).toHaveLength(10)
  })

  for (const [path, json] of Object.entries(files)) {
    it(`${path} has every key, filled, with the same parameters`, () => {
      const flat = flatten(json)
      expect(Object.keys(flat).sort()).toEqual(Object.keys(en).sort())
      for (const [key, value] of Object.entries(flat)) {
        expect(value.trim(), key).not.toBe('')
        expect(params(value), key).toEqual(params(en[key]))
      }
    })
  }
})
