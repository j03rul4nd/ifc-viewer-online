import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { renderTwinBuilderShell, TWIN_BUILDER_SEO } from './generate-twin-builder-page'

describe('/twin-builder shell', () => {
  const html = renderTwinBuilderShell(readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8'))
  it('has its own head, within the SERP budget', () => {
    expect(TWIN_BUILDER_SEO.title.length).toBeLessThanOrEqual(60)
    expect(TWIN_BUILDER_SEO.description.length).toBeLessThanOrEqual(160)
    expect(html).toContain(`<title>${TWIN_BUILDER_SEO.title}</title>`)
    expect(html).toContain('<link rel="canonical" href="https://www.ifcvieweronline.eu/twin-builder/" />')
    expect(html).not.toContain('<noscript>')
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
