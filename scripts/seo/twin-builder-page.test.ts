import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { renderTwinBuilderShell, TWIN_BUILDER_SEO } from './generate-twin-builder-page'

import { COPY, BUILDER_PATHS } from './build-twin-builder-landings'

describe('/twin-builder in ten languages', () => {
  it('every page exists, fits the SERP budget and carries the full cluster', () => {
    expect(BUILDER_PATHS).toHaveLength(10)
    const sitemap = readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf-8')
    for (const { lang, path: p } of BUILDER_PATHS) expect(sitemap).toContain(`${p}</loc>`)
    for (const [lang, c] of Object.entries(COPY)) {
      expect(c.title.length, lang).toBeLessThanOrEqual(60)
      expect(c.description.length, lang).toBeLessThanOrEqual(160)
      const html = readFileSync(path.resolve(__dirname, `../../public/${lang}/${c.slug}/index.html`), 'utf-8')
      expect(html).toContain(`<html lang="${lang}">`)
      expect(html.match(/<link rel="alternate" hreflang=/g)).toHaveLength(11)
      expect(html).toContain('href="https://www.ifcvieweronline.eu/twin-builder/"')
    }
  })
})

describe('/twin-builder shell', () => {
  const html = renderTwinBuilderShell(readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8'))
  it('has its own head, within the SERP budget', () => {
    expect(TWIN_BUILDER_SEO.title.length).toBeLessThanOrEqual(60)
    expect(TWIN_BUILDER_SEO.description.length).toBeLessThanOrEqual(160)
    expect(html).toContain(`<title>${TWIN_BUILDER_SEO.title}</title>`)
    expect(html).toContain('<link rel="canonical" href="https://www.ifcvieweronline.eu/twin-builder/" />')
    expect(html).not.toContain('<noscript>')
    expect(html.match(/<link rel="alternate" hreflang=/g)).toHaveLength(11)
    expect(html.match(/<h1>/g)).toHaveLength(1)
  })
  it('carries app, how-to and FAQ structured data that parses', () => {
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    expect(lds.map((o) => o['@type'])).toEqual(['WebApplication', 'HowTo', 'HowTo', 'FAQPage'])
    expect(lds[1].step).toHaveLength(5)
  })
  it('the soft-404 guard knows the route', () => {
    expect(readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8')).toMatch(/twin-builder\|/)
  })
})
