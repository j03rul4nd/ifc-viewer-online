// Every picture a post points at is a file we publish.
//
// A missing image does not fail the build: the SPA hides a broken hero, and
// the host answered the URL with the app's HTML (200, text/html). The 4D
// construction post's hero went out like that in all ten languages — og:image,
// the structured data and the image sitemap all named an HTML page — because
// its files were named after the slug and the post after the translation key.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EVERY_BLOG_POST } from '../../src/lib/blog-i18n'
import { heroSources } from '../../src/lib/blog-hero'
import type { BlogPost } from '../../src/lib/blog-posts'
import { imageFormat } from './image-metadata'

const ROOT = path.resolve(__dirname, '../..')
const PUBLIC = path.join(ROOT, 'public')

/** Images named by a post, as paths under public/ (remote URLs and named aliases skipped). */
function referencedImages(post: BlogPost): string[] {
  const out: string[] = [`blog/covers/${post.slug}.png`]
  const local = (src: string | undefined): void => {
    if (!src || /^https?:\/\//i.test(src) || !src.includes('/')) return
    out.push(src.replace(/^\//, ''))
  }
  if (post.heroImage?.includes('/')) for (const s of heroSources(post.heroImage)) local(s.src)
  for (const v of post.heroImageVariants ?? []) local(v.src)
  for (const block of post.content) {
    if (block.type === 'image') {
      local(block.src)
      for (const s of block.srcSet ?? []) local(s.src)
    } else if (block.type === 'tool-demo' || block.type === 'spatial-demo' || block.type === 'video') {
      local(block.poster)
    }
  }
  for (const video of post.videos ?? []) local(video.thumbnailUrl)
  return out
}

describe('blog images', { timeout: 30_000 }, () => {
  it('every image a post references exists in public/', () => {
    const missing = new Set<string>()
    for (const post of EVERY_BLOG_POST) {
      for (const src of referencedImages(post)) {
        if (!existsSync(path.join(PUBLIC, src))) missing.add(`${src}  ← ${post.lang ?? 'en'}/${post.slug}`)
      }
    }
    expect([...missing]).toEqual([])
  })

  it("every image's extension says what its bytes are", () => {
    // A JPEG named .png is served as image/png with nosniff; three posters were.
    const wrong = new Set<string>()
    for (const post of EVERY_BLOG_POST) {
      for (const src of referencedImages(post)) {
        const file = path.join(PUBLIC, src)
        if (!existsSync(file)) continue
        const format = imageFormat(readFileSync(file))
        if ((/\.jpe?g$/i.test(src) && format !== 'jpeg') || (/\.png$/i.test(src) && format !== 'png')) wrong.add(`${src} is ${format}`)
      }
    }
    expect([...wrong]).toEqual([])
  })

  it('a missing image is a 404, not the app\'s HTML (vercel.json)', () => {
    const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>
    }
    const spa = vercel.rewrites.find((r) => r.destination === '/index.html')!
    expect(spa.source).toContain('blog/images/')
    expect(spa.source).toContain('blog/covers/')
  })
})
