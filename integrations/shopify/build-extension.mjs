// Builds the theme app extensions. Shopify caps each extension at 100 KB of Liquid
// and 15 KB per locale file, so the blocks live in three extensions of one app:
// - app blocks made from the copy-paste sections (same markup both ways);
// - shared assets and snippets copied from ifc-viewer into the others;
// - each extension's locales cut from locales/ down to the keys its Liquid uses.
// Run: node integrations/shopify/build-extension.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Full translations (every key, every language). The extensions get cut copies. */
export const LOCALES_DIR = path.join(here, 'locales')
export const EXTENSIONS_DIR = path.join(here, 'app', 'extensions')
/** The extension that owns the shared files; the others get byte-identical copies. */
export const MAIN_EXTENSION = 'ifc-viewer'
/** Which blocks each extension holds. Moving a block changes its extension for merchants. */
export const EXTENSIONS = {
  'ifc-viewer': ['product-ifc-viewer', 'ifc-element-details', 'ifc-downloads', 'ifc-variant-views', 'ifc-viewer', 'ifc-views', 'ifc-explorer', 'ifc-health-score', 'tracking-globe'],
  'ifc-data': ['ifc-specs', 'ifc-rooms', 'ifc-classification', 'ifc-takeoff', 'ifc-compat'],
  'ifc-plans': ['ifc-plan-set', 'ifc-plan-view', 'ifc-ar', 'ifc-compliance', 'ifc-sun-lot', 'ifc-dpp'],
}
/** Assets every extension carries (runtime, styles, variant helper, events, setup check). */
export const SHARED_ASSETS = ['ifcvo.js', 'ifcvo.css', 'ifcvo-variant.js', 'ifcvo-events.js', 'ifcvo-diagnostics.js']
export const LIQUID_LIMIT = 100 * 1024
export const LOCALE_LIMIT = 15 * 1024
export const SECTIONS = ['ifc-viewer.liquid', 'tracking-globe.liquid']

/** Section name → app block name key in locales/*.schema.json (the theme editor shows it in the store's admin language). */
export const BLOCK_NAME_KEYS = { '3D IFC model': 't:blocks.ifc_viewer.name', 'Tracking globe': 't:blocks.tracking_globe.name' }

let settingKeyCache = null
/** English setting text → `t:settings.<key>` from en.default.schema.json. */
function settingKeys() {
  if (!settingKeyCache) {
    const file = path.join(LOCALES_DIR, 'en.default.schema.json')
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    settingKeyCache = Object.fromEntries(Object.entries(json.settings || {}).map(([k, v]) => [v, `t:settings.${k}`]))
  }
  return settingKeyCache
}

/** An app block is the section with `target` instead of `presets`, and a translated name. */
export function toAppBlock(source) {
  // Theme-editor note: the app block has the extension's locales, the copy-paste section does not.
  source = source.replace('<p>IFC Viewer Online: paste an https link to an .ifc file (Content &gt; Files) or to a scene.</p>',
    "<p>{{ 'ifcvo.editor.viewer_link' | t | escape }}</p>")
  // Setup check (theme editor only): what the block found, for assets/ifcvo-diagnostics.js.
  const diag = source.includes('"id": "model"')
    ? "{%- render 'ifcvo-diag', feature: 'viewer', block: 'ifc-viewer', model: block.settings.model -%}"
    : "{%- render 'ifcvo-diag', feature: 'tracking', block: 'tracking-globe' -%}"
  source = source.replace('{% schema %}', `${diag}\n\n{% schema %}`)
  return source.replace(/\{% schema %\}([\s\S]*?)\{% endschema %\}/, (_, json) => {
    const { presets, ...schema } = JSON.parse(json)
    if (BLOCK_NAME_KEYS[schema.name]) schema.name = BLOCK_NAME_KEYS[schema.name]
    // Setting texts → t: keys of locales/*.schema.json (the copy-paste section keeps plain English).
    const keys = settingKeys()
    const tr = (st) => {
      for (const k of ['label', 'info', 'content', 'placeholder']) if (typeof st[k] === 'string' && keys[st[k]]) st[k] = keys[st[k]]
      for (const o of st.options || []) if (keys[o.label]) o.label = keys[o.label]
    }
    for (const st of [...(schema.settings || []), ...(schema.blocks || [])]) tr(st)
    return `{% schema %}\n${JSON.stringify({ ...schema, target: 'section' }, null, 2)}\n{% endschema %}`
  })
}

/**
 * Plan gate: the one table that says which plan unlocks each feature. The
 * runtime gets a copy between the TIERS markers in assets/ifcvo.js (rewritten
 * by this script). Loading, the IFC download, errors and accessibility are never
 * gated. The shop's plan: the `ifcvo.plan` app metafield if set, else a signed
 * licence token in the shop metafield `ifcvo.license` (license/sign.mjs), else free.
 * Re-tier approved 2026-11-23 (T-325 G1). quote, gateddownloads, quantities, roi
 * and bulk are enforced by their own blocks (T-325 G2/G3/G5/G6).
 */
export const PLANS = ['free', 'starter', 'business']
export const DEFAULT_PLAN = 'free'
/** Names shown to merchants in theme-editor notes; prices are in listing/LISTING.md. */
export const PLAN_NAMES = { free: 'Free', starter: 'Starter ($9/month)', business: 'Business ($29/month)' }
export const PLANS_URL = 'https://apps.shopify.com/ifc-viewer-online'
export const FEATURE_TIERS = {
  viewer: 'free',
  download: 'free',
  specs: 'free',
  rooms: 'free',
  explorer: 'free',
  views: 'free',
  files: 'starter',
  details: 'starter',
  quote: 'starter',
  gateddownloads: 'starter',
  score: 'starter',
  quantities: 'starter',
  tour: 'starter',
  planset: 'starter',
  compat: 'starter',
  planview: 'starter',
  ar: 'starter',
  classification: 'starter',
  variantviews: 'starter',
  takeoff: 'business',
  dpp: 'business',
  sunlot: 'business',
  compliance: 'business',
  roi: 'business',
  bulk: 'business',
}
/** Features that must stay free whatever the plan table says. */
export const ALWAYS_FREE = ['viewer', 'download', 'specs', 'rooms']

/** Ed25519 public key (raw, base64url) that licence tokens are checked against (license/sign.mjs writes it). */
export const LICENSE_KEY_FILE = path.join(here, 'license', 'public-key.txt')
export function licenseKey() {
  return fs.existsSync(LICENSE_KEY_FILE) ? fs.readFileSync(LICENSE_KEY_FILE, 'utf8').trim() : ''
}

const TIERS_RE = /(\/\/ TIERS:start[^\n]*\n)[\s\S]*?(\/\/ TIERS:end)/

/** The runtime with its copy of the plan table replaced by the current one. */
export function withTiers(runtime) {
  const table =
    `const PLANS = ${JSON.stringify(PLANS)}\n` +
    `const DEFAULT_PLAN = '${DEFAULT_PLAN}'\n` +
    `const FEATURE_TIERS = ${JSON.stringify(FEATURE_TIERS)}\n` +
    `const PLAN_NAMES = ${JSON.stringify(PLAN_NAMES)}\n` +
    `const PLANS_URL = '${PLANS_URL}'\n` +
    `const LICENSE_KEY = '${licenseKey()}'\n`
  if (!TIERS_RE.test(runtime)) throw new Error('ifcvo.js has no TIERS markers')
  return runtime.replace(TIERS_RE, (_, start, end) => start + table + end)
}

export function extensionDir(ext = MAIN_EXTENSION) {
  return path.join(EXTENSIONS_DIR, ext)
}

export function assetPath(name, ext = MAIN_EXTENSION) {
  return path.join(extensionDir(ext), 'assets', name)
}

export function blockPath(name, ext = MAIN_EXTENSION) {
  return path.join(extensionDir(ext), 'blocks', name)
}

const listLiquid = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.liquid')).sort() : [])

/** Snippets the given Liquid renders, followed through nested renders. */
export function snippetsFor(sources, lookup) {
  const found = new Set()
  const queue = [...sources]
  while (queue.length) {
    for (const m of queue.pop().matchAll(/\{%-?\s*render\s+'([a-z0-9-]+)'/g)) {
      if (found.has(m[1])) continue
      found.add(m[1])
      queue.push(lookup(m[1]))
    }
  }
  return [...found].sort()
}

/** Storefront keys (`'ifcvo.x.y' | t`, or a prefix ending in "." for appended keys) and `t:` schema keys. */
export function keysUsed(liquid) {
  const storefront = new Set()
  const schema = new Set()
  for (const m of liquid.matchAll(/['"](ifcvo\.[A-Za-z0-9_.]+)['"]/g)) if (!/\.(js|css)$/.test(m[1])) storefront.add(m[1])
  for (const m of liquid.matchAll(/"t:([A-Za-z0-9_.]+)"/g)) schema.add(m[1])
  return { storefront: [...storefront].sort(), schema: [...schema].sort() }
}

/** The part of `tree` under the given dotted keys (a key ending in "." keeps its whole subtree). */
export function pickKeys(tree, keys) {
  const out = {}
  for (const key of keys) {
    const parts = key.replace(/\.$/, '').split('.')
    let src = tree
    for (const p of parts) src = src && typeof src === 'object' ? src[p] : undefined
    if (src === undefined) continue
    let dst = out
    for (const p of parts.slice(0, -1)) dst = dst[p] = dst[p] || {}
    dst[parts[parts.length - 1]] = JSON.parse(JSON.stringify(src))
  }
  return orderLike(out, tree)
}

/** Same key order as the full file, so the cut files diff cleanly. */
function orderLike(obj, like) {
  if (!obj || typeof obj !== 'object') return obj
  const out = {}
  for (const k of Object.keys(like)) if (k in obj) out[k] = orderLike(obj[k], like[k])
  return out
}

/** All Liquid of an extension (blocks + snippets) as written on disk. */
export function extensionLiquid(ext) {
  const dir = extensionDir(ext)
  return ['blocks', 'snippets'].flatMap((d) => listLiquid(path.join(dir, d)).map((f) => fs.readFileSync(path.join(dir, d, f), 'utf8')))
}

function writeIfChanged(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return
  fs.writeFileSync(file, text)
}

export function build() {
  for (const name of SECTIONS) {
    writeIfChanged(blockPath(name), toAppBlock(fs.readFileSync(path.join(here, name), 'utf8')))
  }
  const runtime = assetPath('ifcvo.js')
  writeIfChanged(runtime, withTiers(fs.readFileSync(runtime, 'utf8').replace(/\r\n/g, '\n')))

  const mainSnippets = path.join(extensionDir(), 'snippets')
  const mainOwned = new Set(listLiquid(mainSnippets).map((f) => f.replace(/\.liquid$/, '')))
  for (const [ext, blocks] of Object.entries(EXTENSIONS)) {
    const dir = extensionDir(ext)
    if (ext !== MAIN_EXTENSION) {
      for (const a of SHARED_ASSETS) writeIfChanged(assetPath(a, ext), fs.readFileSync(assetPath(a), 'utf8'))
      // Snippets this extension renders but the main one owns: copied, never edited here.
      const own = (n) => path.join(dir, 'snippets', n + '.liquid')
      const lookup = (n) => fs.readFileSync(mainOwned.has(n) ? path.join(mainSnippets, n + '.liquid') : own(n), 'utf8')
      const sources = blocks.map((b) => fs.readFileSync(blockPath(b + '.liquid', ext), 'utf8'))
      for (const n of snippetsFor(sources, lookup)) if (mainOwned.has(n)) writeIfChanged(own(n), lookup(n))
    }
    const { storefront, schema } = keysUsed(extensionLiquid(ext).join('\n'))
    for (const file of fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json')).sort()) {
      const tree = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'))
      const cut = pickKeys(tree, file.endsWith('.schema.json') ? schema : storefront)
      writeIfChanged(path.join(dir, 'locales', file), JSON.stringify(cut, null, 2) + '\n')
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build()
