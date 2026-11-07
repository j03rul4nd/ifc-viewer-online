// Turns the Vite build in dist/ into a Cloudflare Pages upload: drops the demo
// models (served by the ifc-viewer-models Worker), and writes _headers and
// _redirects from vercel.json so both hosts keep one source of truth.
// Run after `npm run build`: `node cf-pages/prepare.mjs`.
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
const MODELS_ORIGIN = 'https://ifc-viewer-models.joelbenitezdonari.workers.dev'
const MAX_FILE = 25 * 1024 * 1024
const MAX_FILES = 20000

// Expands `:name(a|b|c)` groups of plain alternatives into every literal path.
function expand(source) {
  const m = source.match(/:(\w+)\(([\w.|-]+)\)/)
  if (!m) return [{ path: source, params: {} }]
  const out = []
  for (const alt of m[2].split('|')) {
    for (const rest of expand(source.replace(m[0], alt))) {
      out.push({ path: rest.path, params: { [m[1]]: alt, ...rest.params } })
    }
  }
  return out
}
const fill = (dest, params) => dest.replace(/:(\w+)/g, (all, k) => (k in params ? params[k] : all))

// 1. Models: only video-demo ships with the site.
const models = join(dist, 'models')
const modelDirs = existsSync(models) ? readdirSync(models).filter((d) => d !== 'video-demo') : []
for (const d of modelDirs) rmSync(join(models, d), { recursive: true, force: true })

// 2. _redirects
const redirects = []
for (const dir of readdirSync(join(root, 'public/models'))) {
  if (dir === 'video-demo') continue
  const isDir = statSync(join(root, 'public/models', dir)).isDirectory()
  redirects.push(isDir
    ? `/models/${dir}/* ${MODELS_ORIGIN}/models/${dir}/:splat 302`
    : `/models/${dir} ${MODELS_ORIGIN}/models/${dir} 302`)
}
for (const r of vercel.redirects ?? []) {
  if (r.source.startsWith('/models/')) continue // handled above
  if (/\(\?|\(\.\*\)|\[/.test(r.source)) throw new Error(`Cannot convert redirect ${r.source}`)
  for (const { path, params } of expand(r.source)) {
    redirects.push(`${path} ${fill(r.destination, params)} ${r.permanent ? 301 : 302}`)
  }
}
writeFileSync(join(dist, '_redirects'), redirects.join('\n') + '\n')

// 3. _headers
const blocks = []
for (const h of vercel.headers ?? []) {
  let sources
  if (h.source === '/(.*)') sources = ['/*']
  else if (h.source.startsWith('/sdk/:version(')) {
    sources = readdirSync(join(dist, 'sdk')).filter((v) => /^\d+\.\d+\.\d+/.test(v)).map((v) => `/sdk/${v}/*`)
  } else if (h.source.startsWith('/models-frag/')) {
    sources = ['/models-frag/*.frag'] // hashed names; the manifest stays revalidated
  } else {
    sources = expand(h.source.replace(/\/\(\.\*\)$/, '/*')).map((e) => e.path)
  }
  for (const s of sources) {
    if (/[()]/.test(s)) throw new Error(`Cannot convert header source ${h.source}`)
    blocks.push([s, ...h.headers.map((x) => `  ${x.key}: ${x.value}`)].join('\n'))
  }
}
writeFileSync(join(dist, '_headers'), blocks.join('\n') + '\n')

// 4. Pages limits
let files = 0
for (const e of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!e.isFile()) continue
  files++
  const p = join(e.parentPath, e.name)
  if (statSync(p).size > MAX_FILE) throw new Error(`${p} is above 25 MiB, Pages will refuse it`)
}
if (files > MAX_FILES) throw new Error(`${files} files, Pages allows ${MAX_FILES}`)
if (existsSync(join(dist, '404.html'))) console.warn('dist/404.html exists: Pages will not fall back to index.html for SPA routes')
console.log(`Pages upload ready: ${files} files, ${redirects.length} redirects, ${blocks.length} header rules`)
