// T-322h v2: on the storefront Shopify wraps every rendered snippet in
// <!-- BEGIN app snippet --> comments. Inside an open tag those comments break
// it: attributes leak as visible text and the plan gate fails. So no
// {% render %} / {% include %} may appear inside an HTML tag, and the viewer
// SDK the runtime loads must be the repo's current SDK version.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as gen from '../integrations/shopify/build-extension.mjs'

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'integrations/shopify')
const EXT = gen.extensionDir() as string

const liquidIn = (base: string): string[] =>
  ['blocks', 'snippets'].flatMap((d) => {
    const dir = path.join(base, d)
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.liquid')).map((f) => path.join(dir, f)) : []
  })

/** Liquid render/include tags found inside an HTML open tag. */
function rendersInsideTags(src: string): string[] {
  const text = src.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
  const found: string[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '<' && /[a-zA-Z]/.test(text[i + 1] || '')) {
      const start = i
      let quote = ''
      i++
      while (i < text.length) {
        if (text.startsWith('{%', i) || text.startsWith('{{', i)) {
          const close = text.indexOf(text[i + 1] === '%' ? '%}' : '}}', i)
          const tag = text.slice(i, close + 2)
          if (/^\{%-?\s*(render|include)\b/.test(tag)) found.push(`${text.slice(start, start + 30)}… ${tag}`)
          i = close < 0 ? text.length : close + 2
          continue
        }
        const c = text[i]
        if (quote) { if (c === quote) quote = '' } else if (c === '"' || c === "'") quote = c
        else if (c === '>') break
        i++
      }
    }
    i++
  }
  return found
}

describe('no snippet rendered inside an HTML tag', () => {
  it('the scanner catches it, in and out of quotes', () => {
    expect(rendersInsideTags(`<div data-a="1" {% render 'x' %}>`)).toHaveLength(1)
    expect(rendersInsideTags(`<div style="{%- render 'x', s: s -%}">`)).toHaveLength(1)
    expect(rendersInsideTags(`<div a="{{ x | escape }}">{% render 'x' %}</div>`)).toHaveLength(0)
    expect(rendersInsideTags(`{% include 'x' %}<p class="{% if a %}b{% endif %}">`)).toHaveLength(0)
  })
  for (const [label, base] of [['sources', SRC], ['generated extension', EXT]] as const) {
    it(`${label}: no {% render %} / {% include %} inside a tag`, () => {
      const files = liquidIn(base)
      expect(files.length).toBeGreaterThan(10)
      const bad = files.flatMap((f) => rendersInsideTags(fs.readFileSync(f, 'utf8')).map((m) => `${path.basename(f)}: ${m}`))
      expect(bad).toEqual([])
    })
  }
})

describe('viewer SDK pin', () => {
  it('assets/ifcvo.js loads the current SDK_VERSION from src/sdk', () => {
    const sdk = fs.readFileSync(path.join(ROOT, 'src/sdk/ifc-viewer-sdk.ts'), 'utf8').match(/SDK_VERSION\s*=\s*'([^']+)'/)?.[1]
    expect(sdk).toMatch(/^\d+\.\d+\.\d+/)
    const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')
    const pins = [...runtime.matchAll(/\/sdk\/(\d+\.\d+\.\d+[^/]*)\//g)].map((m) => m[1])
    expect(pins.length).toBeGreaterThan(0)
    expect(new Set(pins)).toEqual(new Set([sdk]))
  })
  it('no other extension asset pins an older SDK', () => {
    const assets = path.join(EXT, 'assets')
    for (const f of fs.readdirSync(assets).filter((n) => n.endsWith('.js'))) {
      const code = fs.readFileSync(path.join(assets, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect(code, f).not.toMatch(/ifcvieweronline\.eu\/sdk\/1\.1[0-8]\./)
    }
  })
})
