// Builds the theme app extension's app blocks from the copy-paste sections, so
// both ways of installing render the same markup. Run: node integrations/shopify/build-extension.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SECTIONS = ['ifc-viewer.liquid', 'tracking-globe.liquid']

/** Section name → app block name key in locales/*.schema.json (the theme editor shows it in the store's admin language). */
export const BLOCK_NAME_KEYS = { '3D IFC model': 't:blocks.ifc_viewer.name', 'Tracking globe': 't:blocks.tracking_globe.name' }

let settingKeyCache = null
/** English setting text → `t:settings.<key>` from en.default.schema.json. */
function settingKeys() {
  if (!settingKeyCache) {
    const file = path.join(here, 'app/extensions/ifc-viewer/locales/en.default.schema.json')
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
 * by this script). Loading, downloads, errors and accessibility are never gated.
 * Until billing exists the shop's plan defaults to "business", so all is on.
 */
export const PLANS = ['free', 'starter', 'business']
export const DEFAULT_PLAN = 'business'
export const FEATURE_TIERS = {
  viewer: 'free',
  download: 'free',
  files: 'free',
  specs: 'free',
  details: 'free',
  explorer: 'free',
  views: 'free',
  score: 'free',
  rooms: 'free',
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
}
/** Features that must stay free whatever the plan table says. */
export const ALWAYS_FREE = ['viewer', 'download', 'files']

const TIERS_RE = /(\/\/ TIERS:start[^\n]*\n)[\s\S]*?(\/\/ TIERS:end)/

/** The runtime with its copy of the plan table replaced by the current one. */
export function withTiers(runtime) {
  const table =
    `const PLANS = ${JSON.stringify(PLANS)}\n` +
    `const DEFAULT_PLAN = '${DEFAULT_PLAN}'\n` +
    `const FEATURE_TIERS = ${JSON.stringify(FEATURE_TIERS)}\n`
  if (!TIERS_RE.test(runtime)) throw new Error('ifcvo.js has no TIERS markers')
  return runtime.replace(TIERS_RE, (_, start, end) => start + table + end)
}

export function assetPath(name) {
  return path.join(here, 'app', 'extensions', 'ifc-viewer', 'assets', name)
}

export function blockPath(name) {
  return path.join(here, 'app', 'extensions', 'ifc-viewer', 'blocks', name)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const name of SECTIONS) {
    fs.mkdirSync(path.dirname(blockPath(name)), { recursive: true })
    fs.writeFileSync(blockPath(name), toAppBlock(fs.readFileSync(path.join(here, name), 'utf8')))
  }
  const runtime = assetPath('ifcvo.js')
  fs.writeFileSync(runtime, withTiers(fs.readFileSync(runtime, 'utf8')))
}
