// ─── blog OG covers ───────────────────────────────────────────────────────────
// The generator test already checks that a post's HTML *references*
// /blog/covers/<slug>.png. It cannot tell whether that file is there, which is
// the half that actually breaks a social card: the meta tag is perfect, the
// scraper gets a 404, and the link shares with no image at all.
//
// So this checks the file on disk, and the properties a scraper cares about.
//
// Audited against production first — all 51 posts were correct, at their own
// language-prefixed URLs — so this is here to keep them that way as posts are
// added, not to fix something. A new post with no cover, a renamed slug that
// orphans one, or a cover exported at the wrong size all fail here now.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { ALL_BLOG_POSTS } from '../src/lib/blog-posts'

const COVERS = resolve(__dirname, '../public/blog/covers')

/** The size the generator declares in its <img width/height> and JSON-LD. */
const WIDTH = 1800
const HEIGHT = 945

/**
 * Read a PNG's signature and IHDR dimensions.
 *
 * Byte-level rather than via an image library: this has to fail on a file that
 * is named .png but is not one, which a forgiving decoder would happily accept.
 */
function readPng(file: string): { isPng: boolean; width: number; height: number; bytes: number } {
  const b = readFileSync(resolve(COVERS, file))
  return {
    isPng: b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
    bytes: b.length,
  }
}

const files = readdirSync(COVERS).filter((f) => f.endsWith('.png'))

describe('blog OG covers', () => {
  it('has a cover for every post', () => {
    // The failure this catches: a new post ships, the meta tag points at a file
    // nobody exported, and the first share is imageless.
    const missing = ALL_BLOG_POSTS
      .filter((p) => !existsSync(resolve(COVERS, `${p.slug}.png`)))
      .map((p) => p.slug)
    expect(missing, 'posts whose cover file does not exist').toEqual([])
  })

  it('has no covers left behind by a renamed or deleted post', () => {
    const slugs = new Set(ALL_BLOG_POSTS.map((p) => p.slug))
    const orphans = files.map((f) => f.replace(/\.png$/, '')).filter((s) => !slugs.has(s))
    expect(orphans, 'cover files with no post').toEqual([])
  })

  it('is reading a real set, so the checks above are not vacuous', () => {
    expect(ALL_BLOG_POSTS.length).toBeGreaterThan(40)
    expect(files.length).toBe(ALL_BLOG_POSTS.length)
  })

  it('ships real PNGs, not files that merely end in .png', () => {
    const fake = files.filter((f) => !readPng(f).isPng)
    expect(fake, 'files with no PNG signature').toEqual([])
  })

  it('exports every cover at the size the markup declares', () => {
    // The <img> and the JSON-LD both state 1800x945. A cover at another size
    // is either letterboxed by the scraper or silently cropped by it.
    const wrong = files
      .map((f) => ({ f, ...readPng(f) }))
      .filter((p) => p.width !== WIDTH || p.height !== HEIGHT)
      .map((p) => `${p.f} is ${p.width}x${p.height}`)
    expect(wrong, `covers not ${WIDTH}x${HEIGHT}`).toEqual([])
  })

  it('keeps every cover under the size scrapers will fetch', () => {
    // X drops images over 5 MB; others time out well before that. The current
    // set tops out under 1 MB, so this only bites on a mistake.
    const heavy = files
      .map((f) => ({ f, bytes: readPng(f).bytes }))
      .filter((p) => p.bytes > 5 * 1024 * 1024)
      .map((p) => `${p.f} ${(p.bytes / 1048576).toFixed(1)}MB`)
    expect(heavy, 'covers over 5MB').toEqual([])
  })

  it('gives each post its own image, not a copy of another post’s', () => {
    // Two posts sharing one cover is the quiet version of having no cover: the
    // file resolves, the card renders, and it is about the wrong article.
    const byHash = new Map<string, string[]>()
    for (const f of files) {
      const h = createHash('sha1').update(readFileSync(resolve(COVERS, f))).digest('hex')
      byHash.set(h, [...(byHash.get(h) ?? []), f])
    }
    const duplicates = [...byHash.values()].filter((g) => g.length > 1)
    expect(duplicates, 'byte-identical covers').toEqual([])
  })
})
