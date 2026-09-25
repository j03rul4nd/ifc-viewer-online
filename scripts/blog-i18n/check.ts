// ─── Check translated parts ───────────────────────────────────────────────────
//
//   node --experimental-strip-types --import ./scripts/ebook/ts-hook.mjs \
//     scripts/blog-i18n/check.ts <workDir> <lang> [slug…]
//
// Prints, per post, what checkSegments() and the search-listing budgets find:
// missing or empty keys, changed inline tags, untranslated strings, titles and
// descriptions that a search result would cut. Exit code 1 if anything is found.

import { postProblems, readManifest } from './work'

const [workDir, lang, ...only] = process.argv.slice(2)
if (!workDir || !lang) throw new Error('usage: check.ts <workDir> <lang> [slug…]')

let bad = 0
let pending = 0
for (const entry of readManifest(workDir)) {
  if (only.length && !only.includes(entry.slug)) continue
  const problems = postProblems(workDir, lang, entry)
  if (problems === null) { pending++; if (only.length) console.log(`… ${entry.slug}: not translated yet`); continue }
  if (problems.length === 0) { console.log(`✓ ${entry.slug}`); continue }
  bad++
  console.log(`✗ ${entry.slug}`)
  for (const p of problems) console.log(`    ${p.key}: ${p.problem}`)
}
console.log(`[blog-i18n] ${lang}: ${bad} post(s) with problems, ${pending} not translated yet`)
process.exit(bad ? 1 : 0)
