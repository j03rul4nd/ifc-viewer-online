import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { PAGES, IMAGES } from './build-demo-landings'

const pub = (p: string) => path.resolve(__dirname, '../../public', p)

describe('demo landings', () => {
  it('every page is built, in the sitemap, with its images on disk', () => {
    const sitemap = readFileSync(pub('sitemap.xml'), 'utf-8')
    for (const p of PAGES) {
      expect(existsSync(pub(`${p.slug}/index.html`)), p.slug).toBe(true)
      expect(sitemap).toContain(`/${p.slug}/</loc>`)
      expect(p.title.length, p.slug).toBeLessThanOrEqual(60)
      expect(p.description.length, p.slug).toBeLessThanOrEqual(160)
      for (const s of p.images) {
        expect(IMAGES[s], s).toBeTruthy()
        expect(existsSync(pub(`demos/${s}.jpg`)), s).toBe(true)
        expect(existsSync(pub(`demos/${s}-800.jpg`)), s).toBe(true)
        expect(sitemap).toContain(`/demos/${s}.jpg</image:loc>`)
      }
    }
  })

  it('the built pages match the generator', () => {
    for (const p of PAGES) {
      const html = readFileSync(pub(`${p.slug}/index.html`), 'utf-8')
      expect(html).toContain(`<title>${p.title.replace(/&/g, '&amp;')}</title>`)
      for (const s of p.images) expect(html).toContain(`/demos/${s}.jpg`)
    }
  })
})
