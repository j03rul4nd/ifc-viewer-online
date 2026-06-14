// ─── fetch-testcases.mjs ──────────────────────────────────────────────────────
// Downloads the curated buildingSMART IDS test cases listed in
// src/lib/ids/ids-fixtures/manifest.json (pinned to manifest.commit) into the
// fixtures directory. The files are vendored UNMODIFIED (CC BY-ND 4.0 allows
// verbatim redistribution with attribution — see FIXTURES.md), so this script
// only needs to run again to refresh against a newer upstream commit:
//
//   node scripts/ids/fetch-testcases.mjs [--force]
//
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.resolve(here, '../../src/lib/ids/ids-fixtures')
const manifest = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'manifest.json'), 'utf8'))

const force = process.argv.includes('--force')
const rawBase = `https://raw.githubusercontent.com/buildingSMART/IDS/${manifest.commit}/${manifest.sourcePath}`

let downloaded = 0, skipped = 0, failed = 0

async function fetchOne(rel) {
  const dest = path.join(fixturesDir, rel)
  if (!force && fs.existsSync(dest)) { skipped++; return }
  const url = `${rawBase}/${rel.split(path.sep).join('/')}`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`  MISSING (${res.status}): ${rel}`)
    failed++
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  downloaded++
}

for (const c of manifest.cases) {
  await fetchOne(`${c.file}.ids`)
  await fetchOne(`${c.file}.ifc`)
}

console.log(`fixtures: ${downloaded} downloaded, ${skipped} already present, ${failed} failed`)
if (failed > 0) process.exit(1)
