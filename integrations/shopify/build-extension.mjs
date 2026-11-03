// Builds the theme app extension's app blocks from the copy-paste sections, so
// both ways of installing render the same markup. Run: node integrations/shopify/build-extension.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SECTIONS = ['ifc-viewer.liquid', 'tracking-globe.liquid']

/** An app block is the section with `target` instead of `presets`. */
export function toAppBlock(source) {
  return source.replace(/\{% schema %\}([\s\S]*?)\{% endschema %\}/, (_, json) => {
    const { presets, ...schema } = JSON.parse(json)
    return `{% schema %}\n${JSON.stringify({ ...schema, target: 'section' }, null, 2)}\n{% endschema %}`
  })
}

export function blockPath(name) {
  return path.join(here, 'app', 'extensions', 'ifc-viewer', 'blocks', name)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const name of SECTIONS) {
    fs.mkdirSync(path.dirname(blockPath(name)), { recursive: true })
    fs.writeFileSync(blockPath(name), toAppBlock(fs.readFileSync(path.join(here, name), 'utf8')))
  }
}
