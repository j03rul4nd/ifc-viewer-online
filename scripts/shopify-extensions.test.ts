// T-322u: the app ships three theme app extensions because Shopify caps each one at
// 100 KB of Liquid and 15 KB per locale file. These tests keep the split honest.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as gen from '../integrations/shopify/build-extension.mjs'

const EXTENSIONS = gen.EXTENSIONS as Record<string, string[]>
const SHARED_ASSETS = gen.SHARED_ASSETS as string[]
const dirOf = (ext: string): string => gen.extensionDir(ext)
const list = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d).sort() : [])
const liquidFiles = (ext: string): string[] =>
  ['blocks', 'snippets'].flatMap((d) => list(path.join(dirOf(ext), d)).filter((f) => f.endsWith('.liquid')).map((f) => path.join(dirOf(ext), d, f)))
const liquidOf = (ext: string): string => liquidFiles(ext).map((f) => fs.readFileSync(f, 'utf8')).join('\n')

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
  it('has the three extensions, each with its own uid', () => {
    expect(Object.keys(EXTENSIONS).sort()).toEqual(['ifc-data', 'ifc-plans', 'ifc-viewer'])
    const uids = Object.keys(EXTENSIONS).map((e) => {
      const toml = fs.readFileSync(path.join(dirOf(e), 'shopify.extension.toml'), 'utf8')
      expect(toml, e).toMatch(/type = "theme"/)
      return toml.match(/uid = "([^"]+)"/)![1]
    })
    expect(new Set(uids).size).toBe(3)
  })

  it('every block file is listed once, in the extension that holds it', () => {
    const seen = new Set<string>()
    for (const [ext, blocks] of Object.entries(EXTENSIONS)) {
      const files = list(path.join(dirOf(ext), 'blocks')).filter((f) => f.endsWith('.liquid')).map((f) => f.replace(/\.liquid$/, ''))
      expect(files.sort(), ext).toEqual([...blocks].sort())
      for (const b of blocks) {
        expect(seen.has(b), b).toBe(false)
        seen.add(b)
      }
    }
  })

  it('every rendered snippet, asset_url and relative import resolves inside the same extension', () => {
    const missing: string[] = []
    for (const ext of Object.keys(EXTENSIONS)) {
      const dir = dirOf(ext)
      const liquid = liquidOf(ext)
      for (const m of liquid.matchAll(/render\s+'([a-z0-9-]+)'/g)) if (!fs.existsSync(path.join(dir, 'snippets', m[1] + '.liquid'))) missing.push(`${ext}: snippet ${m[1]}`)
      for (const m of liquid.matchAll(/'([A-Za-z0-9_.-]+)'\s*\|\s*asset_url/g)) if (!fs.existsSync(path.join(dir, 'assets', m[1]))) missing.push(`${ext}: asset ${m[1]}`)
      for (const a of list(path.join(dir, 'assets')).filter((f) => f.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(dir, 'assets', a), 'utf8')
        for (const m of src.matchAll(/from '\.\/([^']+)'/g)) if (!fs.existsSync(path.join(dir, 'assets', m[1]))) missing.push(`${ext}: ${a} imports ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('Shopify size limits', () => {
  for (const ext of Object.keys(EXTENSIONS)) {
    it(`${ext}: Liquid totals at most 100 KB`, () => {
      const bytes = liquidFiles(ext).reduce((n, f) => n + fs.statSync(f).size, 0)
      expect(bytes, `${ext} Liquid bytes`).toBeLessThanOrEqual(gen.LIQUID_LIMIT)
    })

    it(`${ext}: every locale file is at most 15 KB minified`, () => {
      const big: string[] = []
      for (const f of list(path.join(dirOf(ext), 'locales'))) {
        const min = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dirOf(ext), 'locales', f), 'utf8')))
        const bytes = Buffer.byteLength(min)
        if (bytes > gen.LOCALE_LIMIT) big.push(`${f}: ${bytes}`)
      }
      expect(big).toEqual([])
    })
  }
})

describe('locale keys per extension', () => {
  for (const ext of Object.keys(EXTENSIONS)) {
    it(`${ext}: every key its Liquid uses is in every one of its locale files`, () => {
      const { storefront, schema } = gen.keysUsed(liquidOf(ext)) as { storefront: string[]; schema: string[] }
      expect(storefront.length + schema.length).toBeGreaterThan(10)
      const dir = path.join(dirOf(ext), 'locales')
      const files = list(dir).filter((f) => f.endsWith('.json'))
      expect(files.length).toBe(22)
      const missing: string[] = []
      for (const f of files) {
        const tree = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Tree
        for (const k of f.endsWith('.schema.json') ? schema : storefront) {
          const v = lookup(tree, k)
          if (k.endsWith('.') ? !v || typeof v !== 'object' : typeof v !== 'string' || !v.trim()) missing.push(`${f} ${k}`)
        }
      }
      expect(missing).toEqual([])
    })

    it(`${ext}: locale files are the cut of integrations/shopify/locales (no stray or stale keys)`, () => {
      const { storefront, schema } = gen.keysUsed(liquidOf(ext)) as { storefront: string[]; schema: string[] }
      for (const f of list(gen.LOCALES_DIR).filter((x: string) => x.endsWith('.json'))) {
        const full = JSON.parse(fs.readFileSync(path.join(gen.LOCALES_DIR, f), 'utf8'))
        const cut = JSON.parse(fs.readFileSync(path.join(dirOf(ext), 'locales', f), 'utf8'))
        expect(cut, `${ext} ${f}`).toEqual(gen.pickKeys(full, f.endsWith('.schema.json') ? schema : storefront))
      }
    })
  }

  it('a key with a trailing dot keeps its subtree, and missing keys are skipped', () => {
    const tree = { ifcvo: { a: { x: '1', y: '2' }, b: 'B', c: 'C' } }
    expect(gen.pickKeys(tree, ['ifcvo.a.', 'ifcvo.c', 'ifcvo.nope'])).toEqual({ ifcvo: { a: { x: '1', y: '2' }, c: 'C' } })
    expect(gen.keysUsed(`{{ 'ifcvo.takeoff.kgPerM' | t }} "t:settings.x" {%- assign k = 'ifcvo.compat.rules.' | append: r -%}`)).toEqual({
      storefront: ['ifcvo.compat.rules.', 'ifcvo.takeoff.kgPerM'],
      schema: ['settings.x'],
    })
  })
})

describe('shared files', () => {
  const main = gen.MAIN_EXTENSION as string
  const others = Object.keys(EXTENSIONS).filter((e) => e !== main)

  it('the shared assets are byte-identical in every extension', () => {
    for (const a of SHARED_ASSETS) {
      const ref = fs.readFileSync(path.join(dirOf(main), 'assets', a))
      for (const e of others) expect(fs.readFileSync(path.join(dirOf(e), 'assets', a)).equals(ref), `${e}/assets/${a}`).toBe(true)
    }
  })

  it('snippets copied from the main extension are byte-identical', () => {
    for (const e of others) {
      for (const f of list(path.join(dirOf(e), 'snippets'))) {
        const ref = path.join(dirOf(main), 'snippets', f)
        if (fs.existsSync(ref)) expect(fs.readFileSync(path.join(dirOf(e), 'snippets', f)).equals(fs.readFileSync(ref)), `${e}/snippets/${f}`).toBe(true)
      }
    }
  })

  it('every copy of ifcvo.js keeps its TIERS markers with LF line endings', () => {
    for (const e of Object.keys(EXTENSIONS)) {
      const src = fs.readFileSync(path.join(dirOf(e), 'assets', 'ifcvo.js'), 'utf8')
      expect(src, e).toMatch(/\/\/ TIERS:start[^\n]*\n[\s\S]*?\/\/ TIERS:end/)
      expect(src.includes('\r'), e).toBe(false)
      expect(src).toContain(`const FEATURE_TIERS = ${JSON.stringify(gen.FEATURE_TIERS)}`)
    }
  })
})

describe('generator', () => {
  it('the committed extensions are up to date, and building again changes nothing', () => {
    const before = hashTree(gen.EXTENSIONS_DIR)
    gen.build()
    expect(hashTree(gen.EXTENSIONS_DIR)).toEqual(before)
    gen.build()
    expect(hashTree(gen.EXTENSIONS_DIR)).toEqual(before)
  })
})
