// Adds the editor / classification / health-check landings to the footer of
// every hand-authored landing in public/ (validator, cloud, Solibri, Mac…), in
// the page's own language. Internal links from topic-close pages tell Google the
// new landings matter; they were only linked from the home and /fix/ pages.
// Idempotent: the block sits between <!-- tool-links --> markers and is
// replaced on each run.   node scripts/seo/link-tool-landings.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from './tool-landings/content-a.mjs'
import * as B from './tool-landings/content-b.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC = join(ROOT, 'public')
const LANGS = ['es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
const CONCEPTS = ['editor', 'classification', 'health']
const page = (c, l) => A.PAGES[c][l] ?? B.PAGES[c][l]
const OWN = new Set(CONCEPTS.flatMap((c) => ['en', ...LANGS].map((l) => page(c, l).slug)))
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* htmlFiles(p)
    else if (name === 'index.html') yield p
  }
}

let changed = 0
for (const file of htmlFiles(PUBLIC)) {
  const rel = relative(PUBLIC, dirname(file)).split(sep).join('/')
  if (!rel || OWN.has(rel)) continue
  let html = readFileSync(file, 'utf8')
  if (!html.includes('class="footer-links"')) continue
  const first = rel.split('/')[0]
  const lang = LANGS.includes(first) ? first : 'en'
  const root = '../'.repeat(rel.split('/').length)
  const indent = (html.match(/\n([ \t]*)<a [^>]*class="footer-link"/) ?? [, '        '])[1]
  const block = ['<!-- tool-links -->', ...CONCEPTS.map((c) => `<a href="${root}${page(c, lang).slug}/" class="footer-link">${esc(page(c, lang).h1)}</a>`), '<!-- /tool-links -->']
    .map((l, i) => (i === 0 ? l : indent + l)).join('\n')
  const marked = /<!-- tool-links -->[\s\S]*?<!-- \/tool-links -->/
  if (marked.test(html)) html = html.replace(marked, block)
  else {
    // Before the GitHub link when there is one, else at the end of the footer links.
    const gh = html.match(/\n([ \t]*)<a href="https:\/\/github\.com[^\n]*class="footer-link"/)
    if (gh) html = html.replace(gh[0], `\n${gh[1]}${block}${gh[0]}`)
    else html = html.replace(/(<div class="footer-links">[\s\S]*?)(\n[ \t]*<\/div>)/, `$1\n${indent}${block}$2`)
  }
  writeFileSync(file, html)
  changed++
}
console.log(`${changed} landings linked`)
