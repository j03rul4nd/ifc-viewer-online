import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the analytics surface so we assert on intent without a live PostHog.
vi.mock('./analytics', () => ({
  registerEntrySource: vi.fn(),
  trackInviteLinkOpened: vi.fn(),
}))

import { captureAttribution, deriveEntrySource, getStoredEntrySource } from './attribution'
import { registerEntrySource, trackInviteLinkOpened } from './analytics'

beforeEach(() => {
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.clearAllMocks()
})

describe('captureAttribution', () => {
  it('captures a ref tag, enriches from the registry, stores it, and strips the URL', () => {
    window.history.replaceState(null, '', '/viewer?ref=li_ignacy&foo=bar')

    captureAttribution({ ref: 'li_ignacy' })

    // li_ignacy resolves to coordinator / linkedin in the static registry.
    expect(getStoredEntrySource()).toEqual({
      source: 'li_ignacy', segment: 'coordinator', kind: 'linkedin',
    })
    // ref removed, other params + path preserved
    expect(window.location.pathname).toBe('/viewer')
    expect(window.location.search).toBe('?foo=bar')
    expect(registerEntrySource).toHaveBeenCalledWith({
      entry_source: 'li_ignacy', entry_segment: 'coordinator', entry_source_kind: 'linkedin',
    })
    expect(trackInviteLinkOpened).toHaveBeenCalledWith({
      code: 'li_ignacy', segment: 'coordinator', source: 'linkedin',
    })
  })

  it('still captures an unknown code (no registry enrichment)', () => {
    window.history.replaceState(null, '', '/?ref=mystery_code')
    captureAttribution({ ref: 'mystery_code' })
    expect(getStoredEntrySource()?.source).toBe('mystery_code')
    expect(getStoredEntrySource()?.segment).toBeUndefined()
    expect(registerEntrySource).toHaveBeenCalledWith({
      entry_source: 'mystery_code', entry_segment: undefined, entry_source_kind: undefined,
    })
  })

  it('is first-touch: a second tag never overwrites the session source', () => {
    captureAttribution({ ref: 'li_first' })
    vi.clearAllMocks()

    window.history.replaceState(null, '', '/?ref=li_second')
    captureAttribution({ ref: 'li_second' })

    expect(getStoredEntrySource()?.source).toBe('li_first')
    expect(registerEntrySource).not.toHaveBeenCalled()
    expect(trackInviteLinkOpened).not.toHaveBeenCalled()
    // still stripped even though it wasn't stored
    expect(window.location.search).toBe('')
  })

  it('strips the ?invite alias too', () => {
    window.history.replaceState(null, '', '/?invite=hn')
    captureAttribution({ ref: 'hn' })
    expect(window.location.search).toBe('')
    expect(getStoredEntrySource()?.source).toBe('hn')
  })

  it('preserves the URL hash when stripping', () => {
    window.history.replaceState(null, '', '/?ref=warm_x#section')
    captureAttribution({ ref: 'warm_x' })
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#section')
  })

  // T-00-05: without a tag the visitor is now attributed to a derived organic
  // category (previously a full no-op — that behaviour was the gap this closes).
  it('registers a derived organic entry_source when there is no tag', () => {
    captureAttribution({})
    // Nothing persisted: a later in-session invite must stay first-touch capturable.
    expect(getStoredEntrySource()).toBeNull()
    expect(registerEntrySource).toHaveBeenCalledTimes(1)
    expect(registerEntrySource).toHaveBeenCalledWith({ entry_source: 'direct' })
    expect(trackInviteLinkOpened).not.toHaveBeenCalled()
  })

  it('does not write a tracking cookie (cookieless attribution)', () => {
    window.history.replaceState(null, '', '/?ref=li_dion')
    captureAttribution({ ref: 'li_dion' })
    expect(document.cookie).toBe('')
  })
})

describe('getStoredEntrySource', () => {
  it('returns null when nothing has been captured', () => {
    expect(getStoredEntrySource()).toBeNull()
  })
})

// ── T-00-05: organic entry-source derivation ──────────────────────────────────

describe('deriveEntrySource', () => {
  const ORIGIN = 'https://www.ifcvieweronline.eu'
  const base = { pathname: '/', hash: '', referrer: '', origin: ORIGIN }

  it('empty context → direct', () => {
    expect(deriveEntrySource(base)).toBe('direct')
  })

  it('SEO landing paths → seo_landing (root slug and locale cluster)', () => {
    expect(deriveEntrySource({ ...base, pathname: '/ifc-validator/' })).toBe('seo_landing')
    expect(deriveEntrySource({ ...base, pathname: '/es/ifc-validador/' })).toBe('seo_landing')
  })

  it('blog path → blog', () => {
    expect(deriveEntrySource({ ...base, pathname: '/blog/ifc-health-score/' })).toBe('blog')
  })

  it('fix page path → fix_page', () => {
    expect(deriveEntrySource({ ...base, pathname: '/fix/duplicate-guid/' })).toBe('fix_page')
  })

  it('verify route → verify_link', () => {
    expect(deriveEntrySource({ ...base, pathname: '/verify/941bd944' })).toBe('verify_link')
  })

  it('shared-report hash → report_link', () => {
    expect(deriveEntrySource({ ...base, hash: '#report=abc123' })).toBe('report_link')
  })

  it('same-site referrer is categorised by its path, never kept raw', () => {
    expect(deriveEntrySource({ ...base, referrer: `${ORIGIN}/blog/some-post/` })).toBe('blog')
    expect(deriveEntrySource({ ...base, referrer: `${ORIGIN}/tools/` })).toBe('seo_landing')
  })

  it('external or unparseable referrer → unknown (INV-5: no raw referrer)', () => {
    expect(deriveEntrySource({ ...base, referrer: 'https://www.google.com/search?q=x' })).toBe('unknown')
    expect(deriveEntrySource({ ...base, referrer: 'not a url' })).toBe('unknown')
  })
})

describe('captureAttribution — organic path (no invite)', () => {
  it('derives the category from the landing path', () => {
    window.history.replaceState(null, '', '/blog/some-post/')
    captureAttribution({})
    expect(registerEntrySource).toHaveBeenCalledTimes(1)
    expect(registerEntrySource).toHaveBeenCalledWith({ entry_source: 'blog' })
  })

  it('never overwrites an invite captured earlier this session', () => {
    window.sessionStorage.setItem('ifc.entry_source', 'li_earlier')
    captureAttribution({})
    expect(registerEntrySource).not.toHaveBeenCalled()
  })

  it('with an invite tag present, registers exactly once — with the code', () => {
    captureAttribution({ ref: 'li_ignacy' })
    expect(registerEntrySource).toHaveBeenCalledTimes(1)
    expect(registerEntrySource).toHaveBeenCalledWith(
      expect.objectContaining({ entry_source: 'li_ignacy' }),
    )
  })
})
