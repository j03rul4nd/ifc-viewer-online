// Quick check of one translation against the English copy, without the test
// runner:  npx tsx scripts/seo/core-landings/check-copy.ts es
//
// It reports what core-landings.test.ts would fail on: a different structure,
// a title or description too long for the search listing, an unknown link key,
// vendor figures that changed, or text left in English.
import { copy as en } from './copy-en'
import { FAMILIES, KEPT_TITLES } from './pages'
import type { Lang, LangCopy, Section } from './types'

const lang = process.argv[2] as Lang
const LINKS = new Set([...FAMILIES, 'viewer', 'sample', 'pricing', 'github', 'fix', 'blogSolibri'])

function shape(v: unknown): unknown {
  if (typeof v === 'string') return ''
  if (Array.isArray(v)) return v.map(shape)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'kind' || k === 'sources' ? x : shape(x)]))
  return v
}
function strings(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]]
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`))
  return []
}
const figures = (sections: Section[]) => strings(sections.filter((s) => 'sources' in s && s.sources?.length))
  .flatMap(([, s]) => s.match(/\d[\d.,]*\d|\d/g) ?? []).map((n) => n.replace(/[.,\s]/g, '')).sort().join(' ')

async function main(): Promise<void> {
  const { copy } = (await import(`./copy-${lang}.ts`)) as { copy: LangCopy }
  const out: string[] = []
  if (JSON.stringify(Object.keys(copy.ui).sort()) !== JSON.stringify(Object.keys(en.ui).sort())) out.push('ui: keys differ from English')
  for (const f of FAMILIES) {
    const p = copy.pages[f], e = en.pages[f]
    if (!p) { out.push(`${f}: missing`); continue }
    if (JSON.stringify(shape(p)) !== JSON.stringify(shape(e))) {
      const a = strings(shape(p)).map((x) => x[0]), b = strings(shape(e)).map((x) => x[0])
      const diff = [...b.filter((x) => !a.includes(x)).map((x) => `missing ${x}`), ...a.filter((x) => !b.includes(x)).map((x) => `extra ${x}`)]
      out.push(`${f}: structure differs from English (${diff.slice(0, 6).join('; ') || 'kind/sources values or key order'})`)
    }
    const title = KEPT_TITLES[f][lang] ?? p.title
    if ([...title].length > 60) out.push(`${f}: title has ${[...title].length} characters (max 60)`)
    if ([...p.desc].length > 160) out.push(`${f}: desc has ${[...p.desc].length} characters (max 160)`)
    for (const [where, s] of strings(p)) {
      if (!s.trim() && !where.endsWith('.cta2') && !where.endsWith('.head[0]')) out.push(`${f}${where}: empty`)
      for (const m of s.matchAll(/\[[^\]]+\]\(([^)]*)\)/g)) if (!LINKS.has(m[1])) out.push(`${f}${where}: unknown link key "${m[1]}"`)
    }
    if (figures(p.sections) !== figures(e.sections)) {
      const a = figures(p.sections).split(' '), b = figures(e.sections).split(' ')
      const extra = a.filter((x) => { const i = b.indexOf(x); if (i >= 0) { b.splice(i, 1); return false } return true })
      out.push(`${f}: numbers in sourced sections differ from English (only here: ${extra.join(' ') || '—'}; only in English: ${b.join(' ') || '—'})`)
    }
    for (const [q, a] of p.faq) {
      if (/€|\d{2,}/.test(a) && /solibri|flinker/i.test(a) && !/(solibri\.com|flinker\.app)\S*[^)]*\b2026-11-10\b/.test(a)) out.push(`${f}: answer to "${q}" names a competitor without "(site/page, … 2026-11-10)"`)
    }
    if (lang !== 'en') {
      const same = strings(p).filter(([where, s]) => s.length > 40 && !s.includes('"') && s === strings(e).find((x) => x[0] === where)?.[1])
      if (same.length) out.push(`${f}: ${same.length} strings still in English, e.g. ${same[0][0]}`)
    }
  }
  console.log(out.length ? out.join('\n') : `copy-${lang}: OK`)
  process.exitCode = out.length ? 1 : 0
}
void main()
