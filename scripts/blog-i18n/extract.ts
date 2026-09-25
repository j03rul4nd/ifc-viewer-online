// ─── Export the English posts as translation segments ────────────────────────
//
//   node --experimental-strip-types --import ./scripts/ebook/ts-hook.mjs \
//     scripts/blog-i18n/extract.ts <workDir> [slug…]
//
// Writes <workDir>/src/<slug>.<n>.json — each post's strings (see segments.ts),
// split into parts of at most CHUNK characters so one part is one sitting for
// a translator — and <workDir>/src/manifest.json with the part list and sizes.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { BLOG_POSTS } from '../../src/lib/blog-posts'
import { extractSegments, type Segments } from './segments'

const CHUNK = 7000

const [workDir, ...only] = process.argv.slice(2)
if (!workDir) throw new Error('usage: extract.ts <workDir> [slug…]')
const outDir = path.join(workDir, 'src')
mkdirSync(outDir, { recursive: true })

const manifest: Array<{ slug: string; parts: number; chars: number }> = []
for (const post of BLOG_POSTS) {
  if (only.length && !only.includes(post.slug)) continue
  const segs = extractSegments(post, { listing: true })
  const parts: Segments[] = [{}]
  let size = 0
  for (const [key, text] of Object.entries(segs)) {
    // A definition stays in the same part as the sentence that uses it.
    if (size + text.length > CHUNK && size > 0 && !key.includes('@def')) { parts.push({}); size = 0 }
    parts[parts.length - 1][key] = text
    size += text.length
  }
  parts.forEach((part, n) => writeFileSync(path.join(outDir, `${post.slug}.${n}.json`), JSON.stringify(part, null, 2) + '\n'))
  manifest.push({ slug: post.slug, parts: parts.length, chars: Object.values(segs).reduce((s, t) => s + t.length, 0) })
}
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`[blog-i18n] ${manifest.length} posts → ${manifest.reduce((s, m) => s + m.parts, 0)} parts, ${manifest.reduce((s, m) => s + m.chars, 0)} chars`)
