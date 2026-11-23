// Builds the theme app extension. Shopify allows ONE theme app extension per app
// (ADR D-322v), capped at 100 KB of Liquid in total and 15 KB per locale file, so:
// - readable Liquid sources live in blocks/ and snippets/ (plus the copy-paste
//   sections, turned into app blocks); the extension gets a compact copy: no
//   {% comment %}, minified schema JSON, no indentation or blank lines;
// - storefront texts that only the scripts need go to assets/ifcvo-i18n-<lang>.json
//   (loaded by assets/ifcvo-i18n.js); locale files keep only what Liquid uses;
// - a schema locale (theme editor) that would pass 15 KB is left out: the editor
//   falls back to English for that language.
// Run: node integrations/shopify/build-extension.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Full translations (every key, every language). The extension gets cut copies. */
export const LOCALES_DIR = path.join(here, 'locales')
/** Readable sources of the app blocks and snippets (comments, indentation). */
export const SRC_BLOCKS_DIR = path.join(here, 'blocks')
export const SRC_SNIPPETS_DIR = path.join(here, 'snippets')
export const EXTENSIONS_DIR = path.join(here, 'app', 'extensions')
/** The app's only theme app extension (Shopify allows one per app). */
export const EXTENSION = 'ifc-viewer'
export const MAIN_EXTENSION = EXTENSION
/** Enforced by Shopify on deploy (decimal KB to keep a margin under KiB). */
export const LIQUID_LIMIT = 100 * 1000
export const LOCALE_LIMIT = 15 * 1000
export const BLOCK_LIMIT = 30
export const SECTIONS = ['ifc-viewer.liquid', 'tracking-globe.liquid']

/**
 * Texts the block scripts read from data-labels (or data-<attr>), per group:
 * `{ key: 'ifcvo.locale.key' }`, or a locale prefix ending in "." for its whole
 * subtree. The Liquid marks the element with data-i18n="<group>".
 */
export const I18N_GROUPS = JSON.parse(fs.readFileSync(path.join(here, 'i18n-groups.json'), 'utf8'))

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
  source = source.replace(/\r\n/g, '\n')
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
const LANGS_RE = /(\/\/ LANGS:start[^\n]*\n)[\s\S]*?(\/\/ LANGS:end)/

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

export function extensionDir() {
  return path.join(EXTENSIONS_DIR, EXTENSION)
}

export function assetPath(name) {
  return path.join(extensionDir(), 'assets', name)
}

/** The generated (compact) block in the extension. */
export function blockPath(name) {
  return path.join(extensionDir(), 'blocks', name)
}

/** The readable source of a block (sections: the copy-paste file it is made from). */
export function blockSourcePath(name) {
  return SECTIONS.includes(name) ? path.join(here, name) : path.join(SRC_BLOCKS_DIR, name)
}

const listLiquid = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.liquid')).sort() : [])
const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

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

/**
 * The Liquid Shopify gets: no {% comment %} blocks, minified schema JSON, each
 * line trimmed, no blank lines. Line breaks stay (a {% liquid %} tag needs them).
 */
export function compactLiquid(source) {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
    .replace(/\{% schema %\}([\s\S]*?)\{% endschema %\}/, (_, json) => `{% schema %}${JSON.stringify(JSON.parse(json))}{% endschema %}`)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    // comment … endcomment lines inside a {%- liquid %} tag, and `# …` comment lines there.
    .replace(/^comment\n[\s\S]*?\nendcomment$\n?/gm, '')
    .replace(/^# .*\n/gm, '') + '\n'
}

/**
 * Short theme-editor key for a long one (`settings.button_before_the_3d_view_opens`
 * → `k.<4+ base-36 chars>`): a stable hash, so adding a key does not rename the
 * others. The t: keys were a third of the schema bytes, and they count twice
 * (block Liquid and every schema locale file).
 */
export function shortKey(key, len = 4) {
  let h = 2166136261
  for (const c of Buffer.from(key, 'utf8')) { h ^= c; h = Math.imul(h, 16777619) >>> 0 }
  return 'k.' + h.toString(36).padStart(7, '0').slice(0, len)
}

/** Long schema key → short key for every key given; a clash takes a longer hash. */
export function shortKeys(keys) {
  const map = {}
  const taken = new Set()
  for (const k of [...new Set(keys)].sort()) {
    let len = 4
    while (taken.has(shortKey(k, len))) if (++len > 7) throw new Error('schema key collision: ' + k)
    map[k] = shortKey(k, len)
    taken.add(map[k])
  }
  return map
}

/** A schema locale under the short keys (`{ k: { <short>: text } }`); keys it lacks are left out. */
export function shortTree(tree, short) {
  const k = {}
  for (const [long, s] of Object.entries(short).sort((a, b) => (a[1] < b[1] ? -1 : 1))) {
    const v = lookupKey(tree, long)
    if (typeof v === 'string') k[s.slice(2)] = v
  }
  return { k }
}

/** Every block and snippet of the extension: name → compact Liquid (schema keys shortened). */
export function compiledLiquid() {
  const blocks = {}
  for (const name of SECTIONS) blocks[name] = compactLiquid(toAppBlock(readText(path.join(here, name))))
  for (const name of listLiquid(SRC_BLOCKS_DIR)) blocks[name] = compactLiquid(readText(path.join(SRC_BLOCKS_DIR, name)))
  const snippets = {}
  for (const name of listLiquid(SRC_SNIPPETS_DIR)) snippets[name] = compactLiquid(readText(path.join(SRC_SNIPPETS_DIR, name)))
  const short = shortKeys(keysUsed(Object.values(blocks).join('\n')).schema)
  for (const n of Object.keys(blocks)) blocks[n] = blocks[n].replace(/"t:([A-Za-z0-9_.]+)"/g, (_, k) => `"t:${short[k]}"`)
  return { blocks, snippets, short }
}

/** Storefront keys (`'ifcvo.x.y' | t`, or a prefix ending in "." for appended keys) and `t:` schema keys. */
export function keysUsed(liquid) {
  const storefront = new Set()
  const schema = new Set()
  for (const m of liquid.matchAll(/['"](ifcvo\.[A-Za-z0-9_.]+)['"]/g)) if (!/\.(js|css)$/.test(m[1])) storefront.add(m[1])
  for (const m of liquid.matchAll(/"t:([A-Za-z0-9_.]+)"/g)) schema.add(m[1])
  return { storefront: [...storefront].sort(), schema: [...schema].sort() }
}

const lookupKey = (tree, key) => key.replace(/\.$/, '').split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), tree)

/** A key ending in "_" (`'ifcvo.dpp.item_' | append: x`) stands for every sibling key with that prefix. */
export function expandPrefix(tree, key) {
  if (!key.endsWith('_')) return [key]
  const i = key.lastIndexOf('.')
  const parent = lookupKey(tree, key.slice(0, i))
  const leaf = key.slice(i + 1)
  return parent && typeof parent === 'object' ? Object.keys(parent).filter((k) => k.startsWith(leaf)).map((k) => key.slice(0, i + 1) + k) : []
}

/** The part of `tree` under the given dotted keys (a key ending in "." keeps its whole subtree). */
export function pickKeys(tree, keys) {
  const out = {}
  for (const key of keys.flatMap((k) => expandPrefix(tree, k))) {
    const parts = key.replace(/\.$/, '').split('.')
    const src = lookupKey(tree, key)
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

/** The script texts of one language (`{ group: { key: text } }`), English where it has none. */
export function i18nTexts(tree, en) {
  const out = {}
  for (const [group, map] of Object.entries(I18N_GROUPS)) {
    if (typeof map === 'string') {
      out[group] = { ...(lookupKey(en, map) || {}), ...(lookupKey(tree, map) || {}) }
    } else {
      out[group] = {}
      for (const [k, key] of Object.entries(map)) {
        const v = lookupKey(tree, key) ?? lookupKey(en, key)
        if (typeof v === 'string') out[group][k] = v
      }
    }
  }
  return out
}

/** All Liquid of the extension (blocks + snippets) as written on disk. */
export function extensionLiquid() {
  const dir = extensionDir()
  return ['blocks', 'snippets'].flatMap((d) => listLiquid(path.join(dir, d)).map((f) => fs.readFileSync(path.join(dir, d, f), 'utf8')))
}

function writeIfChanged(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return
  fs.writeFileSync(file, text)
}

/** Removes generated files of `dir` matching `test` that this build did not write. */
function prune(dir, keep, test) {
  if (!fs.existsSync(dir)) return
  for (const f of fs.readdirSync(dir)) if (test(f) && !keep.has(f)) fs.unlinkSync(path.join(dir, f))
}

const byteLen = (s) => Buffer.byteLength(s, 'utf8')

/** Writes the extension. Returns sizes and the schema locales left out. Throws past a hard limit. */
export function build() {
  const dir = extensionDir()
  const runtime = assetPath('ifcvo.js')
  writeIfChanged(runtime, withTiers(readText(runtime)))

  const { blocks, snippets, short } = compiledLiquid()
  if (Object.keys(blocks).length > BLOCK_LIMIT) throw new Error(`${Object.keys(blocks).length} blocks; Shopify allows ${BLOCK_LIMIT}`)
  for (const [n, text] of Object.entries(blocks)) writeIfChanged(path.join(dir, 'blocks', n), text)
  for (const [n, text] of Object.entries(snippets)) writeIfChanged(path.join(dir, 'snippets', n), text)
  prune(path.join(dir, 'blocks'), new Set(Object.keys(blocks)), (f) => f.endsWith('.liquid'))
  prune(path.join(dir, 'snippets'), new Set(Object.keys(snippets)), (f) => f.endsWith('.liquid'))
  const all = [...Object.values(blocks), ...Object.values(snippets)]
  const liquidBytes = all.reduce((n, s) => n + byteLen(s), 0)
  if (liquidBytes > LIQUID_LIMIT) throw new Error(`Liquid is ${liquidBytes} bytes; Shopify allows ${LIQUID_LIMIT}`)

  const { storefront } = keysUsed(all.join('\n'))
  const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json')).sort()
  const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.default.json'), 'utf8'))
  const locales = {}
  const dropped = []
  const langs = []
  const assets = new Set()
  for (const file of files) {
    const tree = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'))
    const isSchema = file.endsWith('.schema.json')
    const text = JSON.stringify(isSchema ? shortTree(tree, short) : pickKeys(tree, storefront)) + '\n'
    if (byteLen(text) > LOCALE_LIMIT) {
      if (!isSchema && !file.startsWith('en.default')) throw new Error(`${file} is ${byteLen(text)} bytes; Shopify allows ${LOCALE_LIMIT}`)
      if (file.startsWith('en.default')) throw new Error(`${file} is ${byteLen(text)} bytes; Shopify allows ${LOCALE_LIMIT}`)
      dropped.push(file)
      continue
    }
    locales[file] = text
    writeIfChanged(path.join(dir, 'locales', file), text)
    if (!isSchema) {
      const lang = file.replace(/(\.default)?\.json$/, '')
      langs.push(lang)
      const asset = `ifcvo-i18n-${lang}.json`
      assets.add(asset)
      writeIfChanged(assetPath(asset), JSON.stringify(i18nTexts(tree, en)) + '\n')
    }
  }
  prune(path.join(dir, 'locales'), new Set(Object.keys(locales)), (f) => f.endsWith('.json'))
  prune(path.join(dir, 'assets'), assets, (f) => /^ifcvo-i18n-.*\.json$/.test(f))
  const loader = assetPath('ifcvo-i18n.js')
  writeIfChanged(loader, readText(loader).replace(LANGS_RE, (_, start, end) => `${start}export const LANGS = ${JSON.stringify(langs.sort())}\n${end}`))
  return { liquidBytes, locales: Object.fromEntries(Object.entries(locales).map(([f, t]) => [f, byteLen(t)])), dropped }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = build()
  const big = Object.entries(r.locales).sort((a, b) => b[1] - a[1])[0]
  console.log(`Liquid ${r.liquidBytes} bytes of ${LIQUID_LIMIT}; largest locale ${big[0]} ${big[1]} bytes; schema locales left out: ${r.dropped.join(', ') || 'none'}`)
}
