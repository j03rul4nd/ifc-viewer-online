// Quick check of one language of the solution pages' copy against English:
//   npx tsx scripts/seo/solution-landings/check-copy.ts <lang>
// Prints shape differences, long titles/descriptions and broken link keys.
import { COPY } from './copy'
import { LINK_KEYS } from './pages'
import type { Lang } from './types'

const l = (process.argv[2] ?? 'es') as Lang
const problems: string[] = []
function walk(a: unknown, b: unknown, path: string): void {
  if (typeof a === 'string') {
    if (typeof b !== 'string') { problems.push(`${path}: missing`); return }
    const keys = (s: string) => [...s.matchAll(/\]\(([a-zA-Z]+)\)/g)].map((m) => m[1]).join(',')
    if (keys(a) !== keys(b)) problems.push(`${path}: links ${keys(a)} ≠ ${keys(b)}`)
    for (const k of keys(b).split(',').filter(Boolean)) if (!(LINK_KEYS as readonly string[]).includes(k)) problems.push(`${path}: unknown key ${k}`)
    return
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) { problems.push(`${path}: length ${Array.isArray(b) ? b.length : '-'} ≠ ${a.length}`); return }
    a.forEach((x, i) => walk(x, b[i], `${path}[${i}]`))
    return
  }
  if (a && typeof a === 'object') for (const [k, x] of Object.entries(a)) walk(x, (b as Record<string, unknown>)?.[k], `${path}.${k}`)
}
walk(COPY.en, COPY[l], l)
for (const [s, p] of Object.entries(COPY[l].pages)) {
  if ([...p.title].length > 60) problems.push(`${s}.title: ${[...p.title].length} chars`)
  if ([...p.desc].length > 160) problems.push(`${s}.desc: ${[...p.desc].length} chars`)
}
console.log(problems.length ? problems.join('\n') : `${l}: ok`)
process.exitCode = problems.length ? 1 : 0
