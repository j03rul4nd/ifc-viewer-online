import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapAttribution, MapCreditsList, ATTRIBUTION_OPEN_MS } from './MapAttribution'

describe('MapAttribution', () => {
  it('opens with the full credits and the licence link, as the guidelines ask', () => {
    const html = renderToStaticMarkup(<MapAttribution attributions={['© OpenMapTiles', 'Relief: Mapzen']} />)
    expect(html).toContain('https://www.openstreetmap.org/copyright')
    expect(html).toContain('© OpenMapTiles')
    expect(html).toContain('Relief: Mapzen')
  })

  it('collapses no later than the five seconds the guidelines allow', () => {
    expect(ATTRIBUTION_OPEN_MS).toBeLessThanOrEqual(5000)
  })

  it('draws nothing without a provider to credit', () => {
    expect(renderToStaticMarkup(<MapAttribution attributions={[]} />)).toBe('')
  })

  it('lists every credit in the panel with the licence link', () => {
    const html = renderToStaticMarkup(<MapCreditsList attributions={['A', 'B']} />)
    expect(html).toContain('openstreetmap.org/copyright')
    expect(html.match(/<li>/g)).toHaveLength(2)
  })
})
