// Colour guard: finds hardcoded colours in the app UI (src/**/*.{ts,tsx,css}).
// Used by scripts/colour-guard.test.ts (ratchet against a baseline) and by
// `npm run theme:colour-baseline` (node scripts/colour-guard.mjs --write).
// See docs/theming.md, "Colour guard".

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const BASELINE_PATH = resolve(ROOT, 'scripts/colour-guard.baseline.json')

/** Paths where colours are content or tokens, not UI chrome. */
const ALLOW = [
  /^src\/theme\//,
  /^src\/lib\/geo\//,
  /^src\/lib\/cover\//,
  /^src\/lib\/layers\//,
  /^src\/lib\/pointcloud\//,
  /^src\/lib\/solar\//,
  /^src\/lib\/capture\//, // canvases drawn into exported clips/images (content)
  /^src\/lib\/ids\/ids-report\.ts$/,
  /^src\/lib\/delivery-report\.ts$/,
  /^src\/lib\/clash\/(export|trend)\.ts$/,
  /^src\/components\/blog\//,
  /^src\/components\/reactbits\//,
  /^src\/components\/landing\//,
  /^src\/components\/(Landing|Blog|EbookView|MspGlobalView)\.tsx$/,
  /^src\/demo-models\/categories\.ts$/,
  /^src\/lib\/director\/looks\.ts$/,
  /^src\/lib\/twin\/device-sim\.ts$/,
  /^src\/lib\/sketch\/showcase\.ts$/,
  /\.test\.tsx?$/,
  /\/__tests__\//,
]

/** Inline escape: put on the same line or the line above. */
export const ESCAPE = 'theme-allow-color'

const PALETTE = 'slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTIL = 'bg|text|border|border-[trblxy]|ring|ring-offset|outline|divide|fill|stroke|from|via|to|placeholder|caret|accent|decoration|shadow'
const PATTERNS = [
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  /\b(?:rgba?|hsla?)\(/g,
  new RegExp(`\\b(?:${UTIL})-(?:${PALETTE})-\\d{2,3}\\b`, 'g'),
  new RegExp(`\\b(?:${UTIL})-(?:white|black)(?:\\/\\d+)?\\b`, 'g'),
  new RegExp(`\\b(?:${UTIL})-\\[(?:#|rgba?\\(|hsla?\\()`, 'g'),
]

export function isAllowed(rel) {
  return ALLOW.some((re) => re.test(rel))
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

/** Line numbers inside top-level `:root` / `[data-theme…]` blocks of a CSS file. */
function tokenBlockLines(lines) {
  const skip = new Set()
  let depth = 0
  let inToken = false
  lines.forEach((line, i) => {
    if (depth === 0 && /^\s*(:root|\[data-theme)/.test(line)) inToken = true
    if (inToken) skip.add(i)
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    if (depth === 0 && line.includes('}')) inToken = false
  })
  return skip
}

/** Matches in one file: [{ line, text }]. */
export function scanText(text, isCss) {
  const lines = text.split(/\r?\n/)
  const skip = isCss ? tokenBlockLines(lines) : new Set()
  const hits = []
  lines.forEach((line, i) => {
    if (skip.has(i)) return
    if (line.includes(ESCAPE) || (i > 0 && lines[i - 1].includes(ESCAPE))) return
    for (const re of PATTERNS) {
      re.lastIndex = 0
      for (const m of line.matchAll(re)) hits.push({ line: i + 1, text: m[0], src: line.trim().slice(0, 120) })
    }
  })
  return hits
}

/** { 'src/x.tsx': [{line,text,src}] } for every non-allowlisted file with colours. */
export function scanAll() {
  const result = {}
  for (const abs of walk(resolve(ROOT, 'src'), [])) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/')
    if (isAllowed(rel)) continue
    const hits = scanText(readFileSync(abs, 'utf8'), rel.endsWith('.css'))
    if (hits.length) result[rel] = hits
  }
  return result
}

export function counts(scan) {
  return Object.fromEntries(Object.keys(scan).sort().map((f) => [f, scan[f].length]))
}

export function readBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const c = counts(scanAll())
  const total = Object.values(c).reduce((a, b) => a + b, 0)
  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE_PATH, JSON.stringify(c, null, 2) + '\n')
    console.log(`Wrote ${BASELINE_PATH}: ${Object.keys(c).length} files, ${total} colours`)
  } else {
    console.log(`${Object.keys(c).length} files, ${total} colours (use --write to update the baseline)`)
  }
}
