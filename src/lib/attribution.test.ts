import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the analytics surface so we assert on intent without a live PostHog.
vi.mock('./analytics', () => ({
  registerEntrySource: vi.fn(),
  trackInviteLinkOpened: vi.fn(),
}))

import { captureAttribution, getStoredEntrySource } from './attribution'
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

  it('is a no-op when there is no tag', () => {
    captureAttribution({})
    expect(getStoredEntrySource()).toBeNull()
    expect(registerEntrySource).not.toHaveBeenCalled()
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
