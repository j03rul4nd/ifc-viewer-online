// Publishes public/models to the ifc-viewer-models Worker. Run after adding or
// changing a model: `npm run deploy:models`. Vercel no longer ships these files.
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')
const MAX_ASSET = 25 * 1024 * 1024
const GZIPPED = {
  'shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc': 'shanghai-tower.bin',
  'cras/model.ifc': 'cras.bin',
}

rmSync(dist, { recursive: true, force: true })
cpSync(join(root, '../public/models'), join(dist, 'models'), { recursive: true })
mkdirSync(join(dist, 'gz'))
for (const [from, to] of Object.entries(GZIPPED)) {
  const source = join(dist, 'models', from)
  writeFileSync(join(dist, 'gz', to), gzipSync(readFileSync(source), { level: 9 }))
  rmSync(source)
}
for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue
  const path = join(entry.parentPath, entry.name)
  if (statSync(path).size > MAX_ASSET) {
    throw new Error(`${path} is above 25 MiB: add it to GZIPPED here and in worker/index.js and wrangler.jsonc`)
  }
}
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Models</title>')
writeFileSync(join(dist, '_headers'), `/models/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=86400
  X-Content-Type-Options: nosniff
`)
execSync('npx --yes wrangler@4 deploy', { cwd: root, stdio: 'inherit' })
