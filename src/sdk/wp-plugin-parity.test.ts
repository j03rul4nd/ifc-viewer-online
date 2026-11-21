// SDK ↔ WordPress plugin parity guard.
//
// The plugin (integrations/wordpress/bimo-ifc-viewer) builds the viewer URL
// from its own allowlist. When the SDK learns a new URL parameter, the plugin
// must learn it too — or this list must say why it does not.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const php = readFileSync(resolve(root, 'integrations/wordpress/bimo-ifc-viewer/bimo-ifc-viewer.php'), 'utf8')
const sdk = readFileSync(resolve(root, 'src/sdk/ifc-viewer-sdk.ts'), 'utf8')
const viewer = readFileSync(resolve(root, 'src/lib/url-params.ts'), 'utf8')
const blockJson = JSON.parse(readFileSync(resolve(root, 'integrations/wordpress/bimo-ifc-viewer/block.json'), 'utf8')) as {
  attributes: Record<string, unknown>
}

/** Params only the SDK sets, each with the reason the plugin leaves it out. */
const SDK_ONLY: Record<string, string> = {
  panel: 'legacy right-panel toggle; the plugin offers the newer panels= allowlist instead',
}
/** Params only the plugin sets, each with the reason the SDK leaves it out. */
const PLUGIN_ONLY: Record<string, string> = {
  model: 'the SDK loads models with postMessage (addFromUrl), not through the URL',
  name: 'parallel to model=, same reason',
  look: 'map look preset; the SDK sets it at runtime rather than in the URL',
}
/** Plugin attributes that are not viewer URL params at all. */
const PLUGIN_ATTRS_NOT_PARAMS = [
  'attachment', 'height', 'title', 'align', 'fullscreen', 'load', 'poster', 'poster_title',
  'poster_text', 'launch_label', 'form_field',
]

function sdkParams(): Set<string> {
  const start = sdk.indexOf('private buildSrc(')
  const end = sdk.indexOf('return url.toString()', start)
  const body = sdk.slice(start, end)
  return new Set([...body.matchAll(/searchParams\.set\('([a-z]+)'/g)].map((m) => m[1]))
}

function pluginParams(): Set<string> {
  const start = php.indexOf('function ifcvo_param_rules()')
  const end = php.indexOf('\n}', start)
  const rules = [...php.slice(start, end).matchAll(/^\t\t'([a-z]+)'\s*=>/gm)].map((m) => m[1])
  const b0 = php.indexOf('function ifcvo_build_embed_url(')
  const b1 = php.indexOf('\n}', b0)
  const explicit = [...php.slice(b0, b1).matchAll(/\$query(?:\['|\s*=\s*array\( ')([a-z]+)'/g)].map((m) => m[1])
  return new Set([...rules, ...explicit])
}

describe('WordPress plugin ↔ SDK URL params', () => {
  const s = sdkParams()
  const p = pluginParams()

  it('reads both lists', () => {
    expect(s.size).toBeGreaterThan(20)
    expect(p.size).toBeGreaterThan(20)
  })

  it('every SDK URL param is in the plugin (or explained)', () => {
    const missing = [...s].filter((k) => !p.has(k) && !(k in SDK_ONLY))
    expect(missing).toEqual([])
  })

  it('every plugin URL param is in the SDK (or explained)', () => {
    const extra = [...p].filter((k) => !s.has(k) && !(k in PLUGIN_ONLY))
    expect(extra).toEqual([])
  })

  it('the exception lists hold no stale entries', () => {
    expect(Object.keys(SDK_ONLY).filter((k) => p.has(k) || !s.has(k))).toEqual([])
    expect(Object.keys(PLUGIN_ONLY).filter((k) => s.has(k) || !p.has(k))).toEqual([])
  })

  it('the viewer parses every param the plugin sends', () => {
    const unparsed = [...p].filter((k) => !viewer.includes(`'${k}'`))
    expect(unparsed).toEqual([])
  })

  it('the block exposes every URL param of the shortcode', () => {
    const blockKeys = Object.keys(blockJson.attributes)
    const notInBlock = [...p].filter((k) => k !== 'embed' && !blockKeys.includes(k))
    expect(notInBlock).toEqual([])
    const unknown = blockKeys.filter((k) => !p.has(k) && !PLUGIN_ATTRS_NOT_PARAMS.includes(k))
    expect(unknown).toEqual([])
  })

  it('the plugin panel list matches the viewer rail', () => {
    const rail = readFileSync(resolve(root, 'src/lib/ui/panel-rail.ts'), 'utf8')
    const m = /ALL_PANEL_IDS[^=]*=\s*\[([\s\S]*?)\]/.exec(rail)
    const ids = [...(m?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort()
    const pm = /'panels'\s*=>\s*'\/\^\(none\|\(([a-z|]+)\)/.exec(php)
    expect(pm?.[1].split('|').sort()).toEqual(ids)
  })
})
