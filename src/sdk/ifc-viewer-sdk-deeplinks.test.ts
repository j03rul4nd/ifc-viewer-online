// ─── SDK 1.19: deep links ───────────────────────────────────────────────────
// Options that mirror the viewer's own deep links (rule, flood, analysis,
// site, explore, underground map, drawings) reach the iframe URL, and the
// URL parser reads them back the way the viewer does.

import { describe, it, expect, beforeEach } from 'vitest'
import { IfcViewer, IfcViewerElement } from './ifc-viewer-sdk'
import { parseAppUrlParams } from '../lib/url-params'

const BASE = 'https://app.test/'
const mount = (): void => { document.body.innerHTML = '<div id="mount"></div>' }
const params = (v: IfcViewer): URLSearchParams => new URL(v.iframe.src).searchParams

describe('SDK 1.19 — deep links', () => {
  beforeEach(mount)

  it('is version 1.19.0', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    expect(v.version).toBe('1.19.0')
    v.dispose()
  })

  it('serialises every deep-link option, and the viewer parses them back', () => {
    const v = new IfcViewer('#mount', {
      baseUrl: BASE,
      rule: 'RULE_MISSING_TYPE',
      flood: 'storm,1m,closed',
      analysis: 'year:passive',
      site: { lat: 41.38, lon: 2.17 },
      explore: false,
      drawings: 'plan',
      map: ['terrain', 'xray'],
    })
    const q = params(v)
    expect(q.get('rule')).toBe('RULE_MISSING_TYPE')
    expect(q.get('drawings')).toBe('plan')
    expect(q.get('site')).toBe('41.38,2.17')
    expect(q.get('explore')).toBe('0')
    const app = parseAppUrlParams(new URL(v.iframe.src).search)
    expect(app.rule).toBe('RULE_MISSING_TYPE')
    expect(app.flood).toMatchObject({ storm: 'storm', cellM: 1, boundary: 'closed' })
    expect(app.analysis).toMatchObject({ period: 'year', metric: 'passive' })
    expect(app.site).toEqual({ lat: 41.38, lon: 2.17 })
    expect(app.explore).toBe(false)
    expect(app.map).toMatchObject({ terrain: true, subsurface: 'xray' })
    v.dispose()
  })

  it('adds nothing by default; drawings: true is "1"', () => {
    const plain = new IfcViewer('#mount', { baseUrl: BASE })
    for (const k of ['rule', 'flood', 'analysis', 'site', 'explore', 'drawings']) expect(params(plain).has(k)).toBe(false)
    plain.dispose()
    mount()
    const d = new IfcViewer('#mount', { baseUrl: BASE, drawings: true })
    expect(params(d).get('drawings')).toBe('1')
    d.dispose()
  })

  it('the web component maps the deep-link attributes', () => {
    if (!customElements.get('ifc-viewer')) customElements.define('ifc-viewer', IfcViewerElement)
    document.body.innerHTML = `<ifc-viewer base-url="${BASE}" rule="RULE_MISSING_TYPE" drawings="plan" site="41.38,2.17" explore="false" analysis="hot:base21"></ifc-viewer>`
    const el = document.querySelector('ifc-viewer') as IfcViewerElement
    const q = new URL(el.viewer!.iframe.src).searchParams
    expect(q.get('rule')).toBe('RULE_MISSING_TYPE')
    expect(q.get('drawings')).toBe('plan')
    expect(q.get('site')).toBe('41.38,2.17')
    expect(q.get('explore')).toBe('0')
    expect(q.get('analysis')).toBe('hot:base21')
    el.remove()
  })
})
