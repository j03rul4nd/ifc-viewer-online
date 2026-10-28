// ─── merge-workspace-tx ───────────────────────────────────────────────────────
// Builds src/locales/<lng>/workspace.json from translation sheets: TSV files
// `<lng>.<part>.tsv` whose lines are `<id>\t<translation>`, where <id> is the
// 1-based position of the key in an ids.json snapshot of the English catalogue
// (stable numbering, so adding keys later never shifts existing work).
//
//   node scripts/i18n/merge-workspace-tx.cjs <sheets-dir> <ids.json>
//
// Refuses a translation that loses or invents a {{param}} or a <0>…</0> tag,
// and reports keys of the current English catalogue that have no translation.

const fs = require('fs')
const path = require('path')

const [dir, idsFile] = process.argv.slice(2)
if (!dir || !idsFile) { console.error('usage: merge-workspace-tx.cjs <sheets-dir> <ids.json>'); process.exit(2) }

const ROOT = path.resolve(__dirname, '../..')
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/locales/en/workspace.json'), 'utf8'))
const ids = JSON.parse(fs.readFileSync(idsFile, 'utf8'))
const LANGS = ['es', 'ca', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'th']
const params = (s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',')
const tags = (s) => [...s.matchAll(/<\/?(\d+)>/g)].map((m) => m[0]).sort().join(',')

let bad = 0
for (const lng of LANGS) {
  const out = {}
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${lng}.`) && f.endsWith('.tsv'))
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      const tab = line.indexOf('\t')
      const id = Number(line.slice(0, tab))
      const text = line.slice(tab + 1)
      const key = ids[id - 1]
      if (!key) { console.error(`${lng} ${f}: unknown id ${id}`); bad++; continue }
      if (!(key in EN)) continue // key dropped from the catalogue since
      const src = EN[key]
      if (params(src) !== params(text) || tags(src) !== tags(text)) {
        console.error(`${lng} #${id}: params/tags differ\n  en: ${src}\n  ${lng}: ${text}`); bad++; continue
      }
      out[key] = text
    }
  }
  const missing = Object.keys(EN).filter((k) => !(k in out))
  const ordered = Object.fromEntries(Object.keys(EN).filter((k) => k in out).map((k) => [k, out[k]]))
  fs.mkdirSync(path.join(ROOT, `src/locales/${lng}`), { recursive: true })
  fs.writeFileSync(path.join(ROOT, `src/locales/${lng}/workspace.json`), JSON.stringify(ordered, null, 2) + '\n')
  console.log(`${lng}: ${Object.keys(ordered).length}/${Object.keys(EN).length}${missing.length ? ` — missing ${missing.length}` : ''}`)
}
if (bad) { console.error(`${bad} problem(s)`); process.exit(1) }
