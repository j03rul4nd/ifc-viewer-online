import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ext = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-viewer')
const locales = path.join(ext, 'locales')
const LANGS = ['es', 'ca', 'de', 'fr', 'it', 'pt-PT', 'pt-BR', 'ja', 'zh-CN', 'th']

type Tree = { [k: string]: string | Tree }
function flat(o: Tree, p = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') out[p + k] = v
    else Object.assign(out, flat(v, p + k + '.'))
  }
  return out
}
const read = (f: string): Tree => JSON.parse(fs.readFileSync(path.join(locales, f), 'utf8'))
/** `{x}` and `{{ x }}` placeholders, sorted. */
const holes = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}|\{\w+\}/g) || []).map((h) => h.replace(/\s/g, '')).sort()

describe('storefront locales', () => {
  const en = flat(read('en.default.json'))

  it('English has every key with a value', () => {
    expect(Object.keys(en).length).toBeGreaterThan(250)
    for (const [k, v] of Object.entries(en)) expect(v.trim(), k).not.toBe('')
  })

  for (const lang of LANGS) {
    it(`${lang}: exactly the English keys, no empty values, same placeholders`, () => {
      const t = flat(read(`${lang}.json`))
      expect(Object.keys(t).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(t)) {
        expect(v.trim(), `${lang} ${k}`).not.toBe('')
        expect(holes(v), `${lang} ${k}`).toEqual(holes(en[k]))
      }
    })
  }
})

describe('schema locales (theme editor)', () => {
  const en = flat(read('en.default.schema.json'))
  const blocks = fs.readdirSync(path.join(ext, 'blocks')).filter((f) => f.endsWith('.liquid'))

  it('every block name is a t: key present in en.default.schema.json', () => {
    for (const b of blocks) {
      const src = fs.readFileSync(path.join(ext, 'blocks', b), 'utf8')
      const schema = JSON.parse(src.match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/)![1])
      expect(schema.name, b).toMatch(/^t:/)
      for (const key of src.match(/"t:[\w.]+"/g) || []) expect(en[key.slice(3, -1)], `${b} ${key}`).toBeTruthy()
    }
  })

  it('no literal text left in any block schema: labels, info, headers, placeholders and options are t: keys', () => {
    const left: string[] = []
    type St = { type?: string; label?: unknown; info?: unknown; content?: unknown; placeholder?: unknown; options?: { label?: unknown }[] }
    for (const b of blocks) {
      const src = fs.readFileSync(path.join(ext, 'blocks', b), 'utf8')
      const schema = JSON.parse(src.match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/)![1])
      for (const st of [...(schema.settings || []), ...(schema.blocks || [])] as St[]) {
        for (const k of ['label', 'info', 'content', 'placeholder'] as const) {
          const v = st[k]
          if (typeof v === 'string' && !v.startsWith('t:')) left.push(`${b} ${k}: ${v.slice(0, 40)}`)
        }
        for (const o of st.options || []) if (typeof o.label === 'string' && !o.label.startsWith('t:')) left.push(`${b} option: ${o.label}`)
      }
    }
    expect(left).toEqual([])
  })

  for (const lang of LANGS) {
    it(`${lang}.schema.json: exactly the English keys, no empty values`, () => {
      const t = flat(read(`${lang}.schema.json`))
      expect(Object.keys(t).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(t)) expect(v.trim(), `${lang} ${k}`).not.toBe('')
    })
  }
})

describe('asset texts', () => {
  // Default tables (English fallbacks) are allowed; everything else must come from the locale data.
  const TABLES = /^(export )?const (LABELS|[A-Z_]+_LABELS|NAMES|NBS_MANUAL|DEFAULT_APPS) = [{[][\s\S]*?^[}\]]/gm
  const assets = fs.readdirSync(path.join(ext, 'assets')).filter((f) => f.endsWith('.js'))

  it('no user-facing English literal outside the default label tables', () => {
    const found: string[] = []
    for (const f of assets) {
      const src = fs.readFileSync(path.join(ext, 'assets', f), 'utf8')
        .replace(TABLES, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\s\/\/ .*$/gm, '')
        // Internal error codes that are never shown to the visitor.
        .replace(/new Error\((['"`])[^'"`]*\1\)/g, '')
      const re = /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const v = m[2]
        // Class lists, selectors, markup and rel values are not texts.
        if (/^(ifcvo-|\.|<|\[|noopener|#)/.test(v) || /\bifcvo-[\w-]+\b/.test(v) && !/[A-Z]/.test(v)) continue
        if (/\b[A-Za-z][a-z]+ [a-z]{2,}\b/.test(v)) found.push(`${f}: ${v.slice(0, 80)}`)
      }
    }
    expect(found).toEqual([])
  })
})
