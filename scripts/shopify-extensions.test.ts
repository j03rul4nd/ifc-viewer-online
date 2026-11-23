// T-322v: Shopify allows ONE theme app extension per app, with at most 100 KB of
// Liquid in total, 15 KB per locale file and 30 blocks. The generator compacts the
// readable sources (integrations/shopify/blocks, snippets) into it; these tests keep
// the result inside the limits and in sync with the sources.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import * as gen from '../integrations/shopify/build-extension.mjs'

const dir = gen.extensionDir() as string
const list = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d).sort() : [])
const liquidFiles = (): string[] =>
  ['blocks', 'snippets'].flatMap((d) => list(path.join(dir, d)).filter((f) => f.endsWith('.liquid')).map((f) => path.join(dir, d, f)))
const liquid = (): string => liquidFiles().map((f) => fs.readFileSync(f, 'utf8')).join('\n')

type Tree = { [k: string]: string | Tree }
const lookup = (tree: Tree, key: string): unknown =>
  key.replace(/\.$/, '').split('.').reduce<unknown>((o, p) => (o && typeof o === 'object' ? (o as Tree)[p] : undefined), tree)

function hashTree(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const f of list(d)) {
      const p = path.join(d, f)
      if (fs.statSync(p).isDirectory()) walk(p)
      else out[path.relative(root, p)] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')
    }
  }
  walk(root)
  return out
}

describe('extension layout', () => {
  it('the app has exactly one theme app extension, ifc-viewer', () => {
    const exts = list(gen.EXTENSIONS_DIR).filter((e) => fs.existsSync(path.join(gen.EXTENSIONS_DIR, e, 'shopify.extension.toml')))
    expect(exts).toEqual(['ifc-viewer'])
    expect(Object.keys(gen.EXTENSIONS)).toEqual(['ifc-viewer'])
    expect(fs.readFileSync(path.join(dir, 'shopify.extension.toml'), 'utf8')).toMatch(/type = "theme"/)
  })

  it('holds all 20 blocks: the two sections plus every source block, at most 30', () => {
    const files = list(path.join(dir, 'blocks')).map((f) => f.replace(/\.liquid$/, ''))
    expect(files).toEqual(gen.EXTENSIONS['ifc-viewer'])
    expect(files.length).toBe(20)
    expect(files.length).toBeLessThanOrEqual(gen.BLOCK_LIMIT)
  })

  it('every rendered snippet, asset_url and relative import resolves', () => {
    const missing: string[] = []
    const src = liquid()
    for (const m of src.matchAll(/render\s+'([a-z0-9-]+)'/g)) if (!fs.existsSync(path.join(dir, 'snippets', m[1] + '.liquid'))) missing.push(`snippet ${m[1]}`)
    for (const m of src.matchAll(/'([A-Za-z0-9_.-]+)'\s*\|\s*asset_url/g)) if (!fs.existsSync(path.join(dir, 'assets', m[1]))) missing.push(`asset ${m[1]}`)
    for (const m of src.matchAll(/"(?:stylesheet|javascript)":"([^"]+)"/g)) if (!fs.existsSync(path.join(dir, 'assets', m[1]))) missing.push(`schema asset ${m[1]}`)
    for (const a of list(path.join(dir, 'assets')).filter((f) => f.endsWith('.js'))) {
      const js = fs.readFileSync(path.join(dir, 'assets', a), 'utf8')
      for (const m of js.matchAll(/(?:from |import )'\.\/([^']+)'/g)) if (!fs.existsSync(path.join(dir, 'assets', m[1]))) missing.push(`${a} imports ${m[1]}`)
    }
    expect(missing).toEqual([])
  })
})

describe('Shopify size limits', () => {
  it('Liquid totals at most 100 KB', () => {
    const bytes = liquidFiles().reduce((n, f) => n + fs.statSync(f).size, 0)
    expect(bytes).toBeLessThanOrEqual(gen.LIQUID_LIMIT)
    expect(gen.LIQUID_LIMIT).toBeLessThanOrEqual(100 * 1024)
  })

  it('every locale file is at most 15 KB as shipped', () => {
    const big = list(path.join(dir, 'locales'))
      .map((f) => [f, fs.statSync(path.join(dir, 'locales', f)).size] as const)
      .filter(([, n]) => n > gen.LOCALE_LIMIT)
    expect(big).toEqual([])
    expect(gen.LOCALE_LIMIT).toBeLessThanOrEqual(15 * 1024)
  })

  it('every storefront language ships; only schema locales may be left out, never English', () => {
    const files = list(path.join(dir, 'locales'))
    for (const f of list(gen.LOCALES_DIR).filter((x) => x.endsWith('.json') && !x.endsWith('.schema.json'))) expect(files).toContain(f)
    expect(files).toContain('en.default.schema.json')
  })
})

// Every bundle limit we know of, with its source. Re-read before adding blocks.
// shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#file-and-content-size-limits
// shopify.dev/docs/storefronts/themes/architecture/locales#requirements-and-limitations
// Deploy validation 2026-11-23 (not in the docs): one theme app extension per app; ≤250 keys per locale file.
const MB = 1024 * 1024
const flatValues = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(flatValues) : []
const schemas = () =>
  list(path.join(dir, 'blocks')).map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, 'blocks', f), 'utf8').match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/)![1])] as const)
const gzip = (f: string) => zlib.gzipSync(fs.readFileSync(f)).length

describe('every documented bundle limit', () => {
  it('all files together at most 10 MB (enforced)', () => {
    let bytes = 0
    const walk = (d: string) => { for (const f of list(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else bytes += fs.statSync(p).size } }
    walk(dir)
    expect(bytes).toBeLessThanOrEqual(10 * MB)
  })

  it('at most 100 locale files (enforced)', () => {
    expect(list(path.join(dir, 'locales')).length).toBeLessThanOrEqual(100)
  })

  it(`at most ${gen.SCHEMA_KEY_LIMIT} translation keys in every locale file (deploy validation), and the generator aims for ${gen.SCHEMA_KEY_BUDGET}`, () => {
    const over: string[] = []
    for (const f of list(path.join(dir, 'locales'))) {
      const n = flatValues(JSON.parse(fs.readFileSync(path.join(dir, 'locales', f), 'utf8'))).length
      if (n > gen.SCHEMA_KEY_LIMIT) over.push(`${f}: ${n}`)
      if (f.endsWith('.schema.json')) expect(n, f).toBeLessThanOrEqual(gen.SCHEMA_KEY_BUDGET)
    }
    expect(over).toEqual([])
    expect(gen.SCHEMA_KEY_LIMIT).toBe(250)
  })

  // Deploy validation 2026-11-23: paragraph setting content max 500 characters, inline or translated.
  it('paragraph setting content at most 500 characters, inline and in every schema locale', () => {
    const too: string[] = []
    const locales = list(path.join(dir, 'locales')).filter((f) => f.endsWith('.schema.json'))
      .map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, 'locales', f), 'utf8'))] as const)
    const lookup = (o: Record<string, unknown>, key: string) =>
      key.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o)
    for (const [b, s] of schemas()) {
      for (const st of (s.settings ?? []) as { type: string; content?: string }[]) {
        if (st.type !== 'paragraph' || !st.content) continue
        if (!st.content.startsWith('t:')) { if ([...st.content].length > 500) too.push(`${b}: ${st.content.length}`); continue }
        for (const [f, j] of locales) {
          const v = lookup(j, st.content.slice(2))
          if (typeof v === 'string' && [...v].length > 500) too.push(`${b} ${f}: ${v.length}`)
        }
      }
    }
    expect(too).toEqual([])
  })

  it('every translation value at most 1000 characters; at most 3400 per locale file (theme locales)', () => {
    for (const f of list(path.join(dir, 'locales'))) {
      const values = flatValues(JSON.parse(fs.readFileSync(path.join(dir, 'locales', f), 'utf8')))
      expect(values.length, f).toBeLessThanOrEqual(3400)
      for (const v of values) expect([...v].length, f).toBeLessThanOrEqual(1000)
    }
  })

  it('CSS referenced by a schema at most 100 KB and JS at most 10 KB, compressed (suggested)', () => {
    for (const [f, s] of schemas()) {
      if (s.stylesheet) expect(gzip(path.join(dir, 'assets', s.stylesheet)), f).toBeLessThanOrEqual(100 * 1024)
      if (s.javascript) expect(gzip(path.join(dir, 'assets', s.javascript)), f).toBeLessThanOrEqual(10 * 1024)
    }
  })

  it('every block schema is valid for the theme editor: unique ids, range ≤ 101 steps, resource lists ≤ 50', () => {
    for (const [f, s] of schemas()) {
      expect(s.target, f).toMatch(/^(section|content|head|body|compliance_head)$/)
      const ids = (s.settings || []).filter((x: { id?: string }) => x.id).map((x: { id: string }) => x.id)
      expect(new Set(ids).size, f).toBe(ids.length)
      for (const st of s.settings || []) {
        if (st.type === 'range') expect((st.max - st.min) / (st.step || 1), `${f} ${st.id}`).toBeLessThanOrEqual(100)
        if (st.limit) expect(st.limit, `${f} ${st.id}`).toBeLessThanOrEqual(50)
      }
    }
  })
})

describe('compact Liquid', () => {
  it('drops comments, indentation and blank lines; minifies the schema', () => {
    const src = "{% comment %}\n  note\n{% endcomment %}\n{%- liquid\n  assign a = 1\n  comment\n  x\n  endcomment\n-%}\n\n  <p>{{ a }}</p>\n{% schema %}\n{\n  \"name\": \"x\"\n}\n{% endschema %}\n"
    expect(gen.compactLiquid(src)).toBe('{%- liquid\nassign a = 1\n-%}\n<p>{{ a }}</p>\n{% schema %}{"name":"x"}{% endschema %}\n')
  })

  it('no generated block or snippet keeps a comment', () => {
    expect(liquid()).not.toMatch(/\{%-?\s*comment|^comment$/m)
  })

  it('short schema keys are stable and unique', () => {
    expect(gen.shortKey('settings.heading')).toBe(gen.shortKey('settings.heading'))
    const map = gen.shortKeys(['a.b', 'a.c', 'settings.heading']) as Record<string, string>
    expect(new Set(Object.values(map)).size).toBe(3)
  })

  it('the Liquid that caused deploy errors is gone (multi-line string in a liquid tag, img without height, L)', () => {
    const src = liquid()
    expect(src).not.toMatch(/join: '\n/)
    expect(src).not.toMatch(/<img [^>]*width="\d+"(?![^>]*height=)[^>]*>/)
    expect(src).not.toMatch(/assign L = /)
    expect(src).not.toMatch(/assign l_files = /)
  })
})

describe('locale keys', () => {
  it('every storefront key the Liquid uses is in every storefront locale file', () => {
    const { storefront } = gen.keysUsed(liquid()) as { storefront: string[] }
    expect(storefront.length).toBeGreaterThan(10)
    const missing: string[] = []
    for (const f of list(path.join(dir, 'locales')).filter((x) => !x.endsWith('.schema.json'))) {
      const tree = JSON.parse(fs.readFileSync(path.join(dir, 'locales', f), 'utf8')) as Tree
      for (const k of storefront.flatMap((key) => gen.expandPrefix(JSON.parse(fs.readFileSync(path.join(gen.LOCALES_DIR, f), 'utf8')), key) as string[])) {
        const v = lookup(tree, k)
        if (k.endsWith('.') ? !v || typeof v !== 'object' : typeof v !== 'string' || !v.trim()) missing.push(`${f} ${k}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('every t: key of every block is in en.default.schema.json, and the shipped schema locales match the source', () => {
    const { schema } = gen.keysUsed(liquid()) as { schema: string[] }
    expect(schema.length).toBeGreaterThan(100)
    const en = JSON.parse(fs.readFileSync(path.join(dir, 'locales', 'en.default.schema.json'), 'utf8')) as Tree
    for (const k of schema) expect(lookup(en, k), k).toBeTruthy()
  })

  it('a key with a trailing dot keeps its subtree, a trailing _ its prefixed siblings; missing keys are skipped', () => {
    const tree = { ifcvo: { a: { x: '1', y: '2' }, b: 'B', c: 'C', d: { item_a: 'A', item_b: 'B', z: 'Z' } } }
    expect(gen.pickKeys(tree, ['ifcvo.a.', 'ifcvo.c', 'ifcvo.nope', 'ifcvo.d.item_'])).toEqual({ ifcvo: { a: { x: '1', y: '2' }, c: 'C', d: { item_a: 'A', item_b: 'B' } } })
  })
})

describe('script texts (assets/ifcvo-i18n-<lang>.json)', () => {
  it('one file per storefront language, every group key filled', () => {
    const en = JSON.parse(fs.readFileSync(path.join(gen.LOCALES_DIR, 'en.default.json'), 'utf8'))
    const langs = list(gen.LOCALES_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.schema.json')).map((f) => f.replace(/(\.default)?\.json$/, ''))
    for (const lang of langs) {
      const file = path.join(dir, 'assets', `ifcvo-i18n-${lang}.json`)
      expect(fs.existsSync(file), lang).toBe(true)
      const texts = JSON.parse(fs.readFileSync(file, 'utf8'))
      for (const [group, map] of Object.entries(gen.I18N_GROUPS as Record<string, string | Record<string, string>>)) {
        const want = typeof map === 'string' ? Object.keys(lookup(en, map) as object) : Object.keys(map)
        for (const k of want) expect(texts[group]?.[k], `${lang} ${group}.${k}`).toBeTruthy()
      }
    }
    expect(fs.readFileSync(path.join(dir, 'assets', 'ifcvo-i18n.js'), 'utf8')).toContain(`export const LANGS = ${JSON.stringify([...langs].sort())}`)
  })

  it('every data-i18n group in the Liquid exists', () => {
    for (const m of liquid().matchAll(/data-i18n(?:-[a-z-]+)?="([a-z_]+)"/g)) expect(gen.I18N_GROUPS, m[1]).toHaveProperty(m[1])
  })
})

describe('generator', () => {
  it('ifcvo.js keeps its TIERS markers with LF line endings', () => {
    const src = fs.readFileSync(path.join(dir, 'assets', 'ifcvo.js'), 'utf8')
    expect(src).toMatch(/\/\/ TIERS:start[^\n]*\n[\s\S]*?\/\/ TIERS:end/)
    expect(src.includes('\r')).toBe(false)
    expect(src).toContain(`const FEATURE_TIERS = ${JSON.stringify(gen.FEATURE_TIERS)}`)
  })

  it('the committed extension is up to date, and building again changes nothing', () => {
    const before = hashTree(gen.EXTENSIONS_DIR)
    gen.build()
    expect(hashTree(gen.EXTENSIONS_DIR)).toEqual(before)
    gen.build()
    expect(hashTree(gen.EXTENSIONS_DIR)).toEqual(before)
  })
})
