import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { PAGES, IMAGES, LANGS, PAGE_PATHS } from './build-demo-landings'

const pub = (p: string) => path.resolve(__dirname, '../../public', p.replace(/^\//, ''))

describe('demo landings', () => {
  it('every image exists at both sizes', () => {
    for (const s of Object.keys(IMAGES)) {
      expect(existsSync(pub(`demos/${s}.jpg`)), s).toBe(true)
      expect(existsSync(pub(`demos/${s}-800.jpg`)), s).toBe(true)
    }
  })

  it('every language has every page, within the SERP budget, in the sitemap', () => {
    expect(LANGS).toHaveLength(10)
    expect(PAGE_PATHS).toHaveLength(10 * PAGES.length)
    expect(new Set(PAGE_PATHS.map((p) => p.path)).size).toBe(PAGE_PATHS.length)
    const sitemap = readFileSync(pub('sitemap.xml'), 'utf-8')
    for (const { path: p, page, lang } of PAGE_PATHS) {
      expect(page.title.length, `${lang} ${p}`).toBeLessThanOrEqual(60)
      expect(page.description.length, `${lang} ${p}`).toBeLessThanOrEqual(160)
      expect(sitemap).toContain(`${p}</loc>`)
    }
  })

  it('the built pages match the generator, with a full hreflang cluster', () => {
    for (const { path: p, page, base } of PAGE_PATHS) {
      const html = readFileSync(pub(`${p}index.html`), 'utf-8')
      expect(html).toContain(`<link rel="canonical" href="https://www.ifcvieweronline.eu${p}" />`)
      for (const s of page.images) expect(html).toContain(`/demos/${s}.jpg`)
      expect(html.match(/<link rel="alternate" hreflang=/g)).toHaveLength(11)
      // Reciprocal: every sibling points back at this page.
      for (const other of PAGE_PATHS.filter((o) => o.base === base)) expect(html).toContain(`href="https://www.ifcvieweronline.eu${other.path}"`)
    }
  })
})
