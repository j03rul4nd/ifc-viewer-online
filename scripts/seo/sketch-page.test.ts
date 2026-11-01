// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderSketchShell, SKETCH_SEO } from './generate-sketch-page'

const TEMPLATE = '<html><head><title>Home</title><meta name="description" content="home" /><link rel="canonical" href="https://www.ifcvieweronline.eu/" /><link rel="alternate" hreflang="es" href="https://www.ifcvieweronline.eu/es/" /><script type="application/ld+json">{"home":1}</script></head><body><div id="root"></div></body></html>'

describe('/sketch shell', () => {
  it('stands as its own page, not the home page', () => {
    const html = renderSketchShell(TEMPLATE)
    expect(html).toContain(`<title>${SKETCH_SEO.title}</title>`)
    expect(html).toContain('rel="canonical" href="https://www.ifcvieweronline.eu/sketch/"')
    expect(html).not.toContain('hreflang="es"')
    expect(html).not.toContain('"home":1')
    expect(html).toContain('<div id="root"><main>')
  })
  it('fits a search result', () => {
    expect(SKETCH_SEO.title.length).toBeLessThanOrEqual(60)
    expect(SKETCH_SEO.description.length).toBeLessThanOrEqual(160)
  })
})
