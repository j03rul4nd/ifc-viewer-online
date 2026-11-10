// A retired post stops being published, so its old URL must 301 to the post
// that replaced it in every language, or the impressions it had become a soft
// 404 (the SPA answers 200 with the home page). Until 2026-11-10 the one
// retired without a vercel.json entry did exactly that.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RETIRED_POSTS, BLOG_POSTS } from '../../src/lib/blog-posts'

const root = resolve(__dirname, '../..')
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
  redirects: { source: string; destination: string; permanent?: boolean }[]
}
const LANGS = ['es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']

/** Resolves a path through vercel.json's redirects (only `:lang(a|b)` groups). */
function redirectOf(path: string): string | undefined {
  for (const r of vercel.redirects) {
    const names: string[] = []
    const re = new RegExp('^' + r.source.replace(/:(\w+)\(([^)]*)\)/g, (_m, n: string, alts: string) => {
      names.push(n)
      return `(${alts})`
    }) + '$')
    const m = path.match(re)
    if (!m || !r.permanent) continue
    return names.reduce((d, n, i) => d.replace(`:${n}`, m[i + 1]), r.destination)
  }
  return undefined
}

describe('retired blog posts', () => {
  for (const [old, to] of Object.entries(RETIRED_POSTS)) {
    it(`${old} 301s to ${to} in every language`, () => {
      expect(BLOG_POSTS.some((p) => p.slug === to)).toBe(true)
      expect(BLOG_POSTS.some((p) => p.slug === old)).toBe(false)
      for (const slash of ['', '/']) {
        expect(redirectOf(`/blog/${old}${slash}`)).toBe(`/blog/${to}/`)
        for (const l of LANGS) expect(redirectOf(`/${l}/blog/${old}${slash}`)).toBe(`/${l}/blog/${to}/`)
      }
    })
  }
})

describe('Cloudflare Pages _redirects order', () => {
  it('writes every static rule before the first dynamic one', () => {
    // Pages treats the rules after the first splat as dynamic and ignores the
    // dynamic ones past the 100th: only the first 100 lines used to work.
    const src = readFileSync(resolve(root, 'cf-pages/prepare.mjs'), 'utf8')
    const staticLoop = src.indexOf('for (const r of vercel.redirects')
    const modelLoop = src.indexOf("readdirSync(join(root, 'public/models'))")
    expect(staticLoop).toBeGreaterThan(0)
    expect(modelLoop).toBeGreaterThan(staticLoop)
  })
})
