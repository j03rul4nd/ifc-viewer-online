import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAppUrlParams } from '../src/lib/url-params'
// @ts-expect-error plain .mjs build script without types
import { SECTIONS, blockPath, toAppBlock } from '../integrations/shopify/build-extension.mjs'

const dir = path.resolve(__dirname, '../integrations/shopify')

interface Setting { type: string; id: string; default?: unknown; options?: { value: string }[] }
function schemaOf(source: string): { settings: Setting[]; presets?: unknown; target?: string } {
  return JSON.parse(source.match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/)![1])
}

describe('Shopify sections', () => {
  for (const name of SECTIONS as string[]) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')

    it(`${name}: valid schema with unique ids and defaults among the options`, () => {
      const schema = schemaOf(source)
      const ids = schema.settings.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const s of schema.settings) {
        if (s.options) expect(s.options.map((o) => o.value)).toContain(s.default)
      }
      expect(schema.presets).toBeTruthy()
    })

    it(`${name}: the app block is built from the section`, () => {
      const block = fs.readFileSync(blockPath(name), 'utf8')
      // Git may check the files out with CRLF line endings.
      const lf = (t: string) => t.replace(/\r\n/g, '\n')
      expect(lf(block)).toBe(lf(toAppBlock(source)))
      expect(schemaOf(block).target).toBe('section')
      expect(schemaOf(block).presets).toBeUndefined()
    })

    it(`${name}: reads block settings inside an app block`, () => {
      expect(source).toContain('assign s = block.settings')
      expect(source).not.toMatch(/section\.settings\.\w/)
    })
  }

  it('every viewer layout the section offers is a preset the viewer knows', () => {
    const schema = schemaOf(fs.readFileSync(path.join(dir, 'ifc-viewer.liquid'), 'utf8'))
    const ui = schema.settings.find((s) => s.id === 'ui')!
    for (const { value } of ui.options!) {
      expect(parseAppUrlParams(`?ui=${value}`).preset).toBe(value)
    }
  })

  it('the viewer reads the URL the section renders', () => {
    // Rendered from ifc-viewer.liquid with two links (one http, dropped), map,
    // drawings, Health Score off, Spanish and an accent colour.
    const search =
      '?embed=1&model=https%3A%2F%2Fa.com%2Fx+1.ifc%2Chttps%3A%2F%2Fb.com%2Fz.ifc&ui=article&view=iso&validate=0&map=terrain,buildings&drawings=plan&lang=es&accent=2f6f5e'
    const p = parseAppUrlParams(search)
    expect(p.modelUrls).toEqual(['https://a.com/x 1.ifc', 'https://b.com/z.ifc'])
    expect(p.lang).toBe('es')
  })
})

const ext = path.join(dir, 'app/extensions/ifc-viewer')
const runtime = fs.readFileSync(path.join(ext, 'assets/ifcvo.js'), 'utf8')

describe('Shopify product block (app only)', () => {
  const source = fs.readFileSync(path.join(ext, 'blocks/product-ifc-viewer.liquid'), 'utf8')
  const schema = schemaOf(source) as ReturnType<typeof schemaOf> & { enabled_on?: { templates: string[] } }

  it('is a product-template app block with valid settings', () => {
    expect(schema.target).toBe('section')
    expect(schema.enabled_on?.templates).toEqual(['product'])
    const ids = schema.settings.filter((s) => s.id).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of schema.settings) {
      if (s.options) expect(s.options.map((o) => o.value)).toContain(s.default)
    }
  })

  it('offers only viewer layouts the viewer knows', () => {
    for (const { value } of schema.settings.find((s) => s.id === 'ui')!.options!) {
      expect(parseAppUrlParams(`?ui=${value}`).preset).toBe(value)
    }
  })

  it('switches the model when the variant changes', () => {
    expect(source).toContain('variant.metafields[ns][key]')
    expect(runtime).toContain('form[action*="/cart/add"] [name="id"]')
    expect(runtime).toContain('viewer.addFromUrl(url)')
  })

  it('loads the shared runtime and marks itself as the page viewer', () => {
    expect(source).toContain("'ifcvo.js' | asset_url")
    expect(source).toContain('data-ifcvo-viewer')
  })

  it('keeps braces out of Liquid output tags (Shopify rejects them)', () => {
    expect(source).not.toMatch(/\{\{[^}]*'[{}]'/)
  })

  it('creates no iframe until the visitor asks for the viewer', () => {
    expect(source).not.toContain('<iframe')
    expect(schema.settings.find((s) => s.id === 'load')!.default).toBe('click')
  })

  it('publishes customer events for opens and downloads', () => {
    expect(runtime).toContain("track('ifc_viewer_opened'")
    expect(runtime).toContain("track('ifc_model_downloaded'")
  })
})

describe('Shopify companion blocks (app only)', () => {
  const companions = ['ifc-explorer.liquid', 'ifc-element-details.liquid', 'ifc-views.liquid', 'ifc-health-score.liquid']
  const panels = runtime.match(/const PANELS = \{ ([^}]+) \}/)![1].split(', ')

  for (const name of companions) {
    const source = fs.readFileSync(path.join(ext, 'blocks', name), 'utf8')
    const schema = schemaOf(source)

    it(`${name}: valid settings, brand controls and a panel the runtime knows`, () => {
      expect(schema.target).toBe('section')
      const ids = schema.settings.filter((s) => s.id).map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const s of schema.settings) {
        if (s.options) expect(s.options.map((o) => o.value)).toContain(s.default)
      }
      expect(ids).toEqual(expect.arrayContaining(['accent', 'radius', 'frame']))
      const panel = source.match(/data-ifcvo-panel="([a-z]+)"/)![1]
      expect(panels).toContain(panel)
      expect(source).toContain("'ifcvo.js' | asset_url")
      expect(source).not.toMatch(/\{\{[^}]*'[{}]'/)
    })
  }

  it('views offer only camera views the SDK accepts', () => {
    const schema = schemaOf(fs.readFileSync(path.join(ext, 'blocks/ifc-views.liquid'), 'utf8'))
    const sdk = fs.readFileSync(path.resolve(__dirname, '../src/sdk/ifc-viewer-sdk.ts'), 'utf8')
    const views = sdk.match(/export type CameraView = ([^\n]+)/)![1].match(/'([a-z]+)'/g)!.map((v) => v.slice(1, -1))
    for (const s of schema.settings.filter((x) => x.id?.startsWith('view_'))) {
      for (const { value } of s.options!) if (value !== 'none') expect(views).toContain(value)
    }
  })

  it('the explorer lists elements, not property sets or types', () => {
    const pattern = new RegExp(runtime.match(/const NOT_ELEMENTS = \/(.+)\/i/)![1], 'i')
    for (const c of ['IFCPROPERTYSINGLEVALUE', 'IFCPROPERTYSET', 'IFCWALLTYPE', 'IFCMATERIALLAYERSETUSAGE', 'IFCELEMENTQUANTITY', 'IFCRELAGGREGATES']) expect(pattern.test(c)).toBe(true)
    for (const c of ['IFCWALL', 'IFCCURTAINWALL', 'IFCSPACE', 'IFCDOOR', 'IFCBUILDINGSTOREY']) expect(pattern.test(c)).toBe(false)
  })
})
