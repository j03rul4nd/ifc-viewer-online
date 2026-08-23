import { parsePanelAllowlist } from './ui/panel-rail'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  parseAppUrlParams,
  resolveEmbedChrome,
  buildEmbedUrl,
  buildIframeSnippet,
  isLoadableUrl,
  parseInvitePath,
  emitEmbedEvent,
  rememberHostOrigin,
  __resetHostOrigin,
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

// ── Sun-study deep link (?solar= / ?moon=) ──────────────────────────────────────

describe('parseAppUrlParams · solar deep link', () => {
  it('parses the full YYYY-MM-DDTHH:MM form', () => {
    const p = parseAppUrlParams('?solar=2026-06-21T16:30')
    expect(p.solar).toEqual({ year: 2026, month: 6, day: 21, minutes: 16 * 60 + 30 })
  })

  it('parses the evergreen MM-DDTHH:MM form (no year)', () => {
    const p = parseAppUrlParams('?solar=12-21T09:00')
    expect(p.solar).toEqual({ year: undefined, month: 12, day: 21, minutes: 540 })
  })

  it('rejects malformed or out-of-range values', () => {
    for (const bad of ['?solar=junk', '?solar=13-01T10:00', '?solar=06-32T10:00', '?solar=06-21T25:00', '?solar=06-21T10:75', '?solar=6-21T10:00']) {
      expect(parseAppUrlParams(bad).solar).toBeUndefined()
    }
    expect(parseAppUrlParams('').solar).toBeUndefined()
  })

  it('reads the moon flag independently', () => {
    expect(parseAppUrlParams('?solar=06-21T22:00&moon=1').solarMoon).toBe(true)
    expect(parseAppUrlParams('?solar=06-21T22:00&moon=0').solarMoon).toBe(false)
    expect(parseAppUrlParams('?solar=06-21T22:00').solarMoon).toBeUndefined()
  })
})

// ── Scene deep links (?map= / ?scan=) ────────────────────────────────────────
// The two params that turn the Poblenou federated set into a single link: the
// building on its real plot, with its survey scan on top of it.

describe('parseAppUrlParams · map deep link', () => {
  it('reads the plain on/off form', () => {
    expect(parseAppUrlParams('?map=1').map).toEqual({ enabled: true })
    expect(parseAppUrlParams('?map').map).toEqual({ enabled: true })
    expect(parseAppUrlParams('?map=true').map).toEqual({ enabled: true })
  })

  it('treats an explicit off exactly like an absent param', () => {
    // Not `{ enabled: false }`: nothing downstream should have to decide
    // between "turn it off" and "was never asked", because they are the same.
    expect(parseAppUrlParams('?map=0').map).toBeUndefined()
    expect(parseAppUrlParams('').map).toBeUndefined()
  })

  it('reads the layer list, and a layer implies the map', () => {
    expect(parseAppUrlParams('?map=terrain').map).toEqual({ enabled: true, terrain: true })
    expect(parseAppUrlParams('?map=terrain,buildings').map)
      .toEqual({ enabled: true, terrain: true, buildings: true })
    expect(parseAppUrlParams('?map=buildings,showcase').map)
      .toEqual({ enabled: true, buildings: true, detail: 'showcase' })
  })

  it('survives a typo in one layer rather than dropping the feature', () => {
    // A host that misspells a layer should lose that layer, not the map.
    expect(parseAppUrlParams('?map=terain,buildings').map)
      .toEqual({ enabled: true, buildings: true })
    expect(parseAppUrlParams('?map=nonsense').map).toEqual({ enabled: true })
  })

  it('is case- and whitespace-insensitive', () => {
    expect(parseAppUrlParams('?map=%20Terrain%20,%20BUILDINGS%20').map)
      .toEqual({ enabled: true, terrain: true, buildings: true })
  })
})

describe('parseAppUrlParams · scan deep link', () => {
  it('accepts one scan, several, and repeats — like ?model=', () => {
    expect(parseAppUrlParams('?scan=https://h/a.las').scanUrls).toEqual(['https://h/a.las'])
    expect(parseAppUrlParams('?scan=https://h/a.las,https://h/b.laz').scanUrls)
      .toEqual(['https://h/a.las', 'https://h/b.laz'])
    expect(parseAppUrlParams('?scan=https://h/a.las&scan=https://h/b.laz').scanUrls)
      .toEqual(['https://h/a.las', 'https://h/b.laz'])
  })

  it('takes same-origin relative paths, which is how our own demo links read', () => {
    expect(parseAppUrlParams('?scan=/models/poblenou/poblenou-site-scan.las').scanUrls)
      .toEqual(['/models/poblenou/poblenou-site-scan.las'])
  })

  it('drops anything that is not http(s)', () => {
    // Same gate as ?model=. A deep link is attacker-controlled input.
    expect(parseAppUrlParams('?scan=javascript:alert(1)').scanUrls).toEqual([])
    expect(parseAppUrlParams('?scan=file:///etc/passwd').scanUrls).toEqual([])
    expect(parseAppUrlParams('?scan=data:text/plain,x').scanUrls).toEqual([])
  })

  it('is an empty list when nobody asked', () => {
    expect(parseAppUrlParams('').scanUrls).toEqual([])
  })
})

// ── Where replies go ──────────────────────────────────────────────────────────
// A previous comment on emitEmbedEvent claimed payloads "never contain model
// contents, only meta". That has not been true for a long time: `result`
// envelopes carry whatever the SDK asked for — getElement returns an element's
// attributes and property sets — and pointcloud-picked carries the survey
// coordinates of a real site. With '*' every one of those is readable by any
// script on the embedding page, not just the host's own code.

describe('emitEmbedEvent target origin', () => {
  let posted: Array<{ message: unknown; target: string }> = []
  let originalParent: unknown

  beforeEach(() => {
    posted = []
    __resetHostOrigin()
    originalParent = Object.getOwnPropertyDescriptor(window, 'parent')
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {
        postMessage: (message: unknown, target: string) => { posted.push({ message, target }) },
      },
    })
  })

  afterEach(() => {
    if (originalParent) {
      Object.defineProperty(window, 'parent', originalParent as PropertyDescriptor)
    }
  })

  it('broadcasts before any host has identified itself', () => {
    // Lifecycle events can fire before the host sends a single command. A
    // message nobody can receive would be strictly worse than a broadcast one.
    emitEmbedEvent('ready')
    expect(posted[0].target).toBe('*')
  })

  it('addresses replies to the origin that asked', () => {
    rememberHostOrigin('https://cde.example.com')
    emitEmbedEvent('result', { requestId: 'r1', ok: true, data: { secret: 1 } })
    expect(posted[0].target).toBe('https://cde.example.com')
  })

  it('ignores an opaque origin rather than sending to a target postMessage rejects', () => {
    // A sandboxed or file:// parent reports "null", and postMessage throws on it
    // as a target. Those hosts keep the broadcast behaviour deliberately.
    rememberHostOrigin('null')
    emitEmbedEvent('ready')
    expect(posted[0].target).toBe('*')
  })

  it('ignores undefined, which is what a synthetic event carries', () => {
    rememberHostOrigin(undefined)
    emitEmbedEvent('ready')
    expect(posted[0].target).toBe('*')
  })

  it('follows the most recent host, so a re-embed is not answered to the old one', () => {
    rememberHostOrigin('https://first.example')
    rememberHostOrigin('https://second.example')
    emitEmbedEvent('ready')
    expect(posted[0].target).toBe('https://second.example')
  })

  it('never throws when the parent rejects the message', () => {
    // A cross-origin parent can refuse; the viewer must carry on regardless.
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage: () => { throw new Error('refused') } },
    })
    expect(() => emitEmbedEvent('ready')).not.toThrow()
  })
})

describe('embed URL: the tool rail', () => {
  const base = {
    baseUrl: 'https://app.example.com/',
    modelUrl: 'https://host/a.ifc',
    preset: 'minimal' as const,
    autoValidate: true,
  }

  it('adds no parameter when the host has no opinion', () => {
    // The common case, and the snippet a reader copies most often.
    expect(buildEmbedUrl(base)).not.toContain('panels=')
  })

  it('carries the chosen tools', () => {
    const url = new URL(buildEmbedUrl({ ...base, panels: ['scene', 'map'] }))
    expect(url.searchParams.get('panels')).toBe('scene,map')
  })

  it('serialises an empty list rather than dropping it as falsy', () => {
    // `panels=` with nothing after it is a host saying "no rail", which is not
    // the same as saying nothing. Skipping it as falsy would silently give the
    // reader the full rail they just switched off.
    const url = new URL(buildEmbedUrl({ ...base, panels: [] }))
    expect(url.searchParams.has('panels')).toBe(true)
    expect(url.searchParams.get('panels')).toBe('')
  })

  it('round-trips through the parser that reads it back', () => {
    // The builder and the reader must agree, or an embed silently loses tools.
    const url = new URL(buildEmbedUrl({ ...base, panels: ['scene', 'solar'] }))
    expect(parsePanelAllowlist(url.searchParams.get('panels'))).toEqual(['scene', 'solar'])
  })

  it('round-trips the empty list as "no rail", not as "no opinion"', () => {
    const url = new URL(buildEmbedUrl({ ...base, panels: [] }))
    expect(parsePanelAllowlist(url.searchParams.get('panels'))).toEqual([])
  })
})
