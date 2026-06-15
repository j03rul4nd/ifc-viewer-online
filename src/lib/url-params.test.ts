import { describe, it, expect } from 'vitest'
import {
  parseAppUrlParams,
  resolveEmbedChrome,
  buildEmbedUrl,
  buildIframeSnippet,
  isLoadableUrl,
  parseInvitePath,
} from './url-params'

const MODEL = 'https://host.example/model.ifc'

describe('parseAppUrlParams', () => {
  it('returns empty defaults for no params', () => {
    const p = parseAppUrlParams('')
    expect(p.modelUrls).toEqual([])
    expect(p.embed).toBe(false)
    expect(p.autoValidate).toBe(true)
    expect(p.preset).toBe('minimal')
  })

  it('parses a single model URL', () => {
    const p = parseAppUrlParams(`?model=${encodeURIComponent(MODEL)}`)
    expect(p.modelUrls).toEqual([MODEL])
    expect(p.embed).toBe(false) // embed is opt-in
  })

  it('splits comma-separated and repeated model params (with aliases)', () => {
    const p = parseAppUrlParams(
      `?model=${encodeURIComponent('https://h/a.ifc')},${encodeURIComponent('https://h/b.ifc')}` +
      `&src=${encodeURIComponent('https://h/c.ifc')}`,
    )
    expect(p.modelUrls).toEqual(['https://h/a.ifc', 'https://h/b.ifc', 'https://h/c.ifc'])
  })

  it('drops non-http(s) model URLs', () => {
    const p = parseAppUrlParams(`?model=${encodeURIComponent('ftp://h/a.ifc')},${encodeURIComponent(MODEL)}`)
    expect(p.modelUrls).toEqual([MODEL])
  })

  it('treats ?embed (no value) as true', () => {
    expect(parseAppUrlParams('?embed').embed).toBe(true)
    expect(parseAppUrlParams('?embed=1').embed).toBe(true)
    expect(parseAppUrlParams('?embed=0').embed).toBe(false)
    expect(parseAppUrlParams('?embed=false').embed).toBe(false)
  })

  it('a ?ui preset implies embed mode', () => {
    const p = parseAppUrlParams('?ui=kiosk')
    expect(p.embed).toBe(true)
    expect(p.preset).toBe('kiosk')
  })

  it('falls back to minimal for an unknown preset', () => {
    expect(parseAppUrlParams('?ui=bogus&embed=1').preset).toBe('minimal')
  })

  it('parses validate, select, isolate and lang', () => {
    const p = parseAppUrlParams('?validate=0&select=42&isolate=IfcWallStandardCase&lang=es')
    expect(p.autoValidate).toBe(false)
    expect(p.select).toBe(42)
    expect(p.isolate).toBe('IFCWALL') // canonicalized + uppercased
    expect(p.lang).toBe('es')
  })

  it('ignores a non-positive select', () => {
    expect(parseAppUrlParams('?select=0').select).toBeUndefined()
    expect(parseAppUrlParams('?select=abc').select).toBeUndefined()
  })

  it('captures granular overrides only when present', () => {
    const p = parseAppUrlParams('?embed=1&tree=1&sidebar=0')
    expect(p.overrides.tree).toBe(true)
    expect(p.overrides.sidebar).toBe(false)
    expect(p.overrides.toolbar).toBeUndefined()
  })

  it('parses the invite/campaign tag from ?ref and the ?invite alias', () => {
    expect(parseAppUrlParams('?ref=li_ignacy').ref).toBe('li_ignacy')
    expect(parseAppUrlParams('?invite=hn').ref).toBe('hn')
    expect(parseAppUrlParams('?ref=md_duplicate-guids').ref).toBe('md_duplicate-guids')
  })

  it('rejects malformed invite tags (non-PII safety)', () => {
    expect(parseAppUrlParams('').ref).toBeUndefined()
    expect(parseAppUrlParams(`?ref=${encodeURIComponent('<script>')}`).ref).toBeUndefined()
    expect(parseAppUrlParams(`?ref=${encodeURIComponent('a b')}`).ref).toBeUndefined()
    expect(parseAppUrlParams(`?ref=${'a'.repeat(65)}`).ref).toBeUndefined()
  })
})

describe('parseInvitePath', () => {
  it('extracts the code from /i/<code> and /invite/<code>', () => {
    expect(parseInvitePath('/i/li_ignacy')).toBe('li_ignacy')
    expect(parseInvitePath('/invite/li_ignacy')).toBe('li_ignacy')
    expect(parseInvitePath('/i/hn/')).toBe('hn')        // trailing slash tolerated
    expect(parseInvitePath('/i/md_duplicate-guids')).toBe('md_duplicate-guids')
  })

  it('returns undefined for non-invite paths and malformed codes', () => {
    expect(parseInvitePath('/')).toBeUndefined()
    expect(parseInvitePath('/viewer')).toBeUndefined()
    expect(parseInvitePath('/i/')).toBeUndefined()
    expect(parseInvitePath('/i/bad code')).toBeUndefined()
    expect(parseInvitePath(`/i/${'a'.repeat(65)}`)).toBeUndefined()
    expect(parseInvitePath('/i/li_ignacy/extra')).toBeUndefined()
  })
})

describe('resolveEmbedChrome', () => {
  it('returns the full app chrome when not embedded', () => {
    const c = resolveEmbedChrome(parseAppUrlParams(`?model=${encodeURIComponent(MODEL)}`))
    expect(c).toMatchObject({ embed: false, showHome: true, showTree: true, openPanel: true })
  })

  it('applies the minimal preset', () => {
    const c = resolveEmbedChrome(parseAppUrlParams('?embed=1'))
    expect(c).toMatchObject({
      embed: true, showToolbar: true, showSidebar: true, showCameraControls: true,
      showTree: false, openPanel: false, showHome: false,
    })
  })

  it('applies the kiosk preset', () => {
    const c = resolveEmbedChrome(parseAppUrlParams('?ui=kiosk'))
    expect(c).toMatchObject({
      showToolbar: false, showTree: false, showSidebar: false,
      openPanel: false, showCameraControls: false, showHome: false,
    })
  })

  it('lets granular params override the preset', () => {
    const c = resolveEmbedChrome(parseAppUrlParams('?embed=1&tree=1&sidebar=0&home=1'))
    expect(c.showTree).toBe(true)
    expect(c.showSidebar).toBe(false)
    expect(c.showHome).toBe(true)
  })
})

describe('isLoadableUrl', () => {
  it('accepts http(s) and rejects other schemes', () => {
    expect(isLoadableUrl('https://h/a.ifc')).toBe(true)
    expect(isLoadableUrl('http://h/a.ifc')).toBe(true)
    expect(isLoadableUrl('ftp://h/a.ifc')).toBe(false)
    expect(isLoadableUrl('javascript:alert(1)')).toBe(false)
    expect(isLoadableUrl('')).toBe(false)
  })
})

describe('buildEmbedUrl / buildIframeSnippet', () => {
  const base = 'https://app.example/base/'

  it('builds a minimal embed URL', () => {
    const url = new URL(buildEmbedUrl({ baseUrl: base, modelUrl: MODEL, preset: 'minimal', autoValidate: true }))
    expect(url.origin + url.pathname).toBe('https://app.example/base/')
    expect(url.searchParams.get('model')).toBe(MODEL)
    expect(url.searchParams.get('embed')).toBe('1')
    expect(url.searchParams.get('ui')).toBeNull()       // minimal omitted
    expect(url.searchParams.get('validate')).toBeNull() // default omitted
  })

  it('serializes non-default options', () => {
    const url = new URL(buildEmbedUrl({
      baseUrl: base, modelUrl: MODEL, fileName: 'a.ifc',
      preset: 'kiosk', autoValidate: false, openPanel: true, lang: 'de',
    }))
    expect(url.searchParams.get('ui')).toBe('kiosk')
    expect(url.searchParams.get('validate')).toBe('0')
    expect(url.searchParams.get('panel')).toBe('1')
    expect(url.searchParams.get('name')).toBe('a.ifc')
    expect(url.searchParams.get('lang')).toBe('de')
  })

  it('round-trips through the parser', () => {
    const url = buildEmbedUrl({ baseUrl: base, modelUrl: MODEL, preset: 'full', autoValidate: false })
    const p = parseAppUrlParams(new URL(url).search)
    expect(p.modelUrls).toEqual([MODEL])
    expect(p.embed).toBe(true)
    expect(p.preset).toBe('full')
    expect(p.autoValidate).toBe(false)
  })

  it('wraps a URL in an iframe snippet', () => {
    const snippet = buildIframeSnippet('https://x/y', { height: 480 })
    expect(snippet).toContain('src="https://x/y"')
    expect(snippet).toContain('height="480"')
    expect(snippet).toContain('loading="lazy"')
    expect(snippet.trim().startsWith('<iframe')).toBe(true)
  })
})
